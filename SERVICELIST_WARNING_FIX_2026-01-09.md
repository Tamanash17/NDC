# ServiceList Warning vs Error Fix - January 9, 2026

## Overview
Fixed the ServiceList parser to correctly distinguish between fatal errors and non-blocking warnings in Jetstar's NDC API responses.

---

## Bug: ServiceList Warnings Treated as Fatal Errors

### Symptoms
- UI showed error message: "Error encountered calling SSRs for service bundle M202"
- ServiceList appeared to fail even though 71 services and 121 ancillary offers were successfully returned
- User couldn't proceed with booking flow due to perceived error

### Root Cause
The ServiceList parser (`service-list.parser.ts`) was treating ANY `<Error>` element in Jetstar's XML response as a fatal error, returning `success: false` immediately.

**However**, Jetstar's ServiceList API includes **warning** messages in `<Error>` elements for specific bundles/services that have validation issues (e.g., bundle M202), while still successfully returning all other available services.

Example scenario:
- ServiceList request includes bundle M202
- Jetstar's backend validation fails for M202 (e.g., "Error encountered calling SSRs for service bundle M202")
- Jetstar returns an `<Error>` element with this warning
- **BUT** Jetstar still returns 71 other services successfully in the same response
- Old parser: saw error → returned `success: false` → frontend showed failure
- **Correct behavior**: show warning but treat as success since we got services

### Fix Location
**File:** `backend/src/parsers/service-list.parser.ts`
**Lines:** 28-86
**Change:** Parse services FIRST, then check for errors, and only fail if we got NO data

**Before:**
```typescript
parse(xml: string): ServiceListParseResult {
  const doc = this.parseXml(xml);

  // Check for errors in response
  if (this.hasErrors(doc)) {
    return {
      success: false,
      errors: this.extractErrors(doc),
      services: [],
      ancillaryOffers: [],
    };
  }

  // Check for IATA_ServiceListRS Error element
  const errorElement = this.getElement(doc, "Error");
  if (errorElement) {
    const typeCode = this.getText(errorElement, "TypeCode") || "UNKNOWN";
    const descText = this.getText(errorElement, "DescText") || "Unknown error";
    return {
      success: false,
      errors: [{ code: typeCode, message: descText }],
      services: [],
      ancillaryOffers: [],
    };
  }

  // Parse services...
  // Return success: true
}
```

**After:**
```typescript
parse(xml: string): ServiceListParseResult {
  const doc = this.parseXml(xml);

  // Parse service definitions from DataLists (do this FIRST to check if we got data)
  const services = this.parseServiceDefinitions(doc);

  // Parse ALaCarteOffer items with pricing and associations
  const ancillaryOffers = this.parseALaCarteOffers(doc, services);

  // Parse segments and journeys...

  // Collect any errors/warnings from the response
  const errors = this.extractErrors(doc);
  const errorElement = this.getElement(doc, "Error");
  if (errorElement) {
    const typeCode = this.getText(errorElement, "TypeCode") || "UNKNOWN";
    const descText = this.getText(errorElement, "DescText") || "Unknown error";
    errors.push({ code: typeCode, message: descText });
  }

  // Determine success: if we got services OR ancillary offers, it's a success (even with warnings)
  // Only fail if we got NO data at all AND there are errors
  const hasData = services.length > 0 || ancillaryOffers.length > 0;
  const success = hasData || errors.length === 0;

  if (!success) {
    console.warn('[ServiceListParser] ServiceList failed - no data and errors present:', errors);
  } else if (errors.length > 0) {
    console.warn('[ServiceListParser] ServiceList succeeded with warnings:', errors);
  }

  return {
    success,
    services,
    ancillaryOffers,
    segments,
    journeys,
    errors: errors.length > 0 ? errors : undefined,
  };
}
```

### Impact
- ServiceList calls with warnings now correctly return `success: true`
- Warnings are included in the response but don't block the workflow
- Frontend can display warnings to user without treating them as fatal errors
- User can proceed with booking flow even if specific bundles have issues

### DO NOT REVERT
Reverting this change will cause ServiceList to fail whenever Jetstar returns warnings about specific bundles, blocking users from proceeding even when valid services are available.

---

## Testing

### Test Case 1: ServiceList with Bundle Warning
1. Select flights with bundle M202
2. Proceed to ServiceList step
3. ✅ Should load 71 services successfully
4. ✅ Should show warning about M202 (if frontend implements warning display)
5. ✅ Should allow user to proceed with other services

### Test Case 2: ServiceList with No Errors
1. Select flights with standard bundles (S050, P200, etc.)
2. Proceed to ServiceList step
3. ✅ Should load services successfully
4. ✅ Should NOT show any warnings
5. ✅ Should allow user to proceed

### Test Case 3: ServiceList True Failure
1. Make a ServiceList request with invalid offer IDs
2. ✅ Should return `success: false` with no services
3. ✅ Should show error to user

---

## Summary of Changes

| File | Lines | Change | Purpose |
|------|-------|--------|---------|
| `service-list.parser.ts` | 28-86 | Parse services first, determine success based on data availability | Distinguish warnings from fatal errors |

---

## Critical Notes

1. **Warnings vs Errors**: Jetstar's NDC API uses `<Error>` elements for both fatal errors AND non-blocking warnings. We must check if data was returned to distinguish between them.

2. **Success Criteria**: ServiceList is successful if:
   - We received services OR ancillary offers (even with warnings), OR
   - We received no errors at all

3. **Failure Criteria**: ServiceList only fails if:
   - We received NO services AND NO ancillary offers AND there are errors

4. **Warning Display**: Frontend can optionally display warnings from `response.data.errors` to inform users about issues with specific bundles/services while still allowing them to proceed.

---

## Revision History

| Date | Developer | Change |
|------|-----------|--------|
| 2026-01-09 | Claude Sonnet 4.5 | Fixed ServiceList parser to handle warnings correctly |
