# Critical Pricing Fixes - January 9, 2026

## Overview
This document details critical pricing bugs that were identified and fixed on January 9, 2026. These fixes are essential for accurate multi-passenger pricing and must not be reverted.

---

## Bug #1: Multi-Passenger Pricing Underestimation

### Symptoms
- Single passenger bookings priced correctly
- Multi-passenger bookings (e.g., 6 ADT + 3 CHD + 6 INF) showed massive price discrepancy
- Example: AirShopping estimate $7,075.06 vs OfferPrice verified $25,132.80 (255% difference)
- Price was calculated as if only 1 passenger of each type was traveling

### Root Cause
Jetstar's AirShopping XML returns **PER-PASSENGER amounts** in `<UnitPrice>/<TotalAmount>`, not totals for all passengers.

**Example XML:**
```xml
<OfferItem>
  <PaxRefID>ADT0</PaxRefID>
  <PaxRefID>ADT1</PaxRefID>
  <PaxRefID>ADT2</PaxRefID>
  <PaxRefID>ADT3</PaxRefID>
  <PaxRefID>ADT4</PaxRefID>
  <PaxRefID>ADT5</PaxRefID>
  <UnitPrice>
    <TotalAmount>242.93</TotalAmount>  <!-- This is PER ADULT, not for all 6 -->
  </UnitPrice>
</OfferItem>
```

The frontend parser was treating `$242.93` as the total for all 6 adults, when it's actually **$242.93 per adult**.

### Fix Location
**File:** `frontend/src/lib/parsers/airShoppingParser.ts`
**Line:** 671
**Change:** `existing.total += itemTotal * count;` (was: `existing.total += itemTotal`)

**Before:**
```typescript
existing.total += itemTotal;  // Treated as total for all passengers
```

**After:**
```typescript
existing.total += itemTotal * count;  // Multiply by passenger count
```

### Impact
- Single passenger: No change (1 × amount = amount)
- Multi-passenger: Now correctly multiplies per-person amount by passenger count
- Matches OfferPrice parser logic which also multiplies by passenger count

### DO NOT REVERT
Removing the `* count` multiplication will cause massive underpricing for all multi-passenger bookings.

---

## Bug #2: False Price Mismatch Warnings

### Symptoms
- Total prices matched perfectly ($24,932.80 = $24,932.80)
- UI showed "Price Differences" warning with -12.8% and -4.4% differences
- Differences were exactly equal to bundle costs
- Confused users who saw matching totals but warnings about mismatches

### Root Cause
The price comparison logic was comparing:
- **AirShopping:** `airPrice.total` (includes base fare + taxes + bundles)
- **OfferPrice:** `breakdown.flightTotal` (includes base fare + taxes, NO bundles)

Jetstar's OfferPrice API **always** returns bundles in a separate "Selected Bundles" section, never included in flight totals. The code was incorrectly checking a `bundlesIncludedInOfferPrice` flag and comparing against `airPrice.total` when true.

### Fix Location
**File:** `frontend/src/components/pricing/FlightPriceBreakdown.tsx`
**Line:** 152
**Change:** Always use `airPrice.baseFare` for comparison

**Before:**
```typescript
const airShoppingFlightTotal = airPrice.bundlesIncludedInOfferPrice
  ? airPrice.total     // Compare with fare + bundle (WRONG)
  : airPrice.baseFare; // Compare with fare only
```

**After:**
```typescript
const airShoppingFlightTotal = airPrice.baseFare;  // Always fare only (no bundle)
```

### Impact
- Only shows mismatch warnings when there's an actual pricing discrepancy in base fares
- No more false warnings about bundle costs being "differences"
- Apples-to-apples comparison: both sides exclude bundles from flight totals

### DO NOT REVERT
Using `airPrice.total` will show false mismatch warnings for every booking with bundles.

---

## Bug #3: Stale Verified Total from Previous Search

### Symptoms
- User performs Search 1, sees verified total $25,132.80
- User clicks "New Search", performs Search 2 (different route, different passengers)
- OfferPrice step still shows verified total $25,132.80 from Search 1
- Cached price data was not cleared when new search was performed

### Root Cause
The `priceData` state in OfferPriceStep was not being cleared when the user started a new search. When a new AirShopping search is performed, the `shoppingResponseId` changes, but there was no effect watching for this change to clear the cached price.

### Fix Location
**File:** `frontend/src/steps/offer-price/OfferPriceStep.tsx`
**Line:** 766-770
**Change:** Added useEffect to clear priceData when shoppingResponseId changes

**Added:**
```typescript
useEffect(() => {
  console.log('[OfferPriceStep] ShoppingResponseId changed, clearing cached price data');
  setPriceData(null);
  setError(null);
}, [flightStore.shoppingResponseId]);
```

### Impact
- Each new search gets a fresh OfferPrice API call
- No more stale pricing from previous searches
- Verified total always matches the current search results

### DO NOT REMOVE
Removing this effect will cause cached prices from previous searches to persist incorrectly.

---

## Testing Checklist

To verify these fixes are working:

### Test 1: Multi-Passenger Pricing
1. Search with 6 ADT + 3 CHD + 6 INF
2. Select flights and bundles
3. Check OfferPrice step
4. ✅ AirShopping estimate should match verified total (within $0.10)

### Test 2: No False Mismatch Warnings
1. Complete any flight search with bundles
2. Check OfferPrice step
3. ✅ Should show "Price Match" badge (green checkmark)
4. ✅ Should NOT show "Price Differences" warning if totals match

### Test 3: Fresh Price on New Search
1. Complete a search, note the verified total
2. Click "New Search"
3. Perform a different search (different route/passengers)
4. ✅ Verified total should be different and match new search
5. ✅ Should NOT show cached total from previous search

---

## Summary of Changes

| File | Lines | Change | Purpose |
|------|-------|--------|---------|
| `airShoppingParser.ts` | 671 | `* count` multiplication | Fix multi-passenger pricing |
| `FlightPriceBreakdown.tsx` | 152 | Always use `baseFare` | Remove false mismatch warnings |
| `OfferPriceStep.tsx` | 766-770 | Clear cache on new search | Prevent stale pricing |

---

## Critical Notes

1. **Per-Passenger vs Total:** Jetstar NDC XML returns per-passenger amounts in `UnitPrice/TotalAmount`, not totals. Always multiply by passenger count.

2. **Bundle Separation:** Jetstar OfferPrice response ALWAYS shows bundles separately in "Selected Bundles" section, never included in flight totals. Always compare flight totals without bundles.

3. **State Management:** When `shoppingResponseId` changes, ALL cached pricing data must be cleared to prevent stale data.

---

## Revision History

| Date | Developer | Change |
|------|-----------|--------|
| 2026-01-09 | Claude Sonnet 4.5 | Initial fixes for all three bugs |

