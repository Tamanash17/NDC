# Navitaire NDC Gateway Developer Reference

## Overview

This document serves as a knowledge base for the Navitaire NDC Gateway (IATA NDC 21.3 standard). It contains important codes, structures, and implementation details extracted from the official Navitaire NDC Gateway Developer Guide v3.18.

---

## Table of Contents

1. [NDC Protocol Version](#ndc-protocol-version)
2. [Payment Status Codes](#payment-status-codes)
3. [Order Status Codes](#order-status-codes)
4. [Error Codes Catalog](#error-codes-catalog)
5. [Warning Codes Catalog](#warning-codes-catalog)
6. [Passive Segments](#passive-segments)
7. [DataLists Structure](#datalists-structure)
8. [Distribution Chain](#distribution-chain)
9. [Payment Types](#payment-types)
10. [Passenger Types (PTC)](#passenger-types-ptc)
11. [Document Type Codes](#document-type-codes)
12. [XML Namespaces](#xml-namespaces)
13. [OfferPrice Request (Long Sell)](#offerprice-request-long-sell)
14. [FareComponent Structure](#farecomponent-structure)
15. [Baggage Associations](#baggage-associations)
16. [A La Carte Offers](#a-la-carte-offers)
17. [Non-Flight Service Fees](#non-flight-service-fees)
18. [OfferPrice Response Structure](#offerprice-response-structure)
19. [RBD Codes (Booking Classes)](#rbd-codes-booking-classes)
20. [Cabin Type Codes](#cabin-type-codes)
21. [OrderCreate Request Structure](#ordercreate-request-structure)
22. [OrderViewRS Response Structure](#orderviewrs-response-structure)
23. [Delivery Status Codes](#delivery-status-codes)
24. [3D Secure Payment (3DS v2)](#3d-secure-payment-3ds-v2)
25. [OrderChange Request](#orderchange-request)
26. [OrderReshop Request](#orderreshop-request)
27. [Adding Seats to Existing Orders](#adding-seats-to-existing-orders)
28. [Adding Ancillaries to Existing Orders](#adding-ancillaries-to-existing-orders)
29. [Full Order Cancellation](#full-order-cancellation)
30. [Partial Order Cancellation](#partial-order-cancellation)
31. [Reshop for Flight Changes](#reshop-for-flight-changes)
32. [ServiceList Request/Response](#servicelist-requestresponse)
33. [SeatAvailability Request/Response](#seatavailability-requestresponse)
34. [OrderReshop Response Details](#orderreshop-response-details)
35. [PriceDifferential Structure](#pricedifferential-structure)
36. [Penalty and Spoilage Fees](#penalty-and-spoilage-fees)

---

## NDC Protocol Version

**Current Version**: 21.3 (IATA New Distribution Capability)

All requests must include the version number in the `PayloadAttributes`:

```xml
<PayloadAttributes>
  <VersionNumber xmlns="http://www.iata.org/IATA/2015/EASD/00/IATA_OffersAndOrdersCommonTypes">21.3</VersionNumber>
</PayloadAttributes>
```

---

## Payment Status Codes

Payment status is returned in `<PaymentProcessingSummary>/<PaymentStatusCode>`.

| Code | Description | Action Required |
|------|-------------|-----------------|
| `SUCCESSFUL` | Payment has been successfully accepted | Booking confirmed |
| `PENDING` | Payment committed, pending approval | Poll OrderRetrieve until status changes to SUCCESSFUL or FAILED |
| `FAILED` | Payment has been declined | Show error to user, retry with different card |

**Important**: When `PaymentStatusCode` is `PENDING`, the seller must retrieve the Order periodically until the status changes.

### Implementation Example

```typescript
// Check PaymentStatusCode in OrderCreate response
const paymentStatusMatch = xmlResponse.match(
  /<PaymentStatusCode[^>]*>([^<]+)<\/PaymentStatusCode>/i
);

if (paymentStatusMatch && paymentStatusMatch[1].toUpperCase() === 'FAILED') {
  // Payment failed - extract warning messages for context
  throw new Error('Payment declined');
}
```

### Related XML Response

```xml
<PaymentInfo>
  <PaymentProcessingDetails>
    <Amount CurCode="AUD">150.00</Amount>
    <PaymentStatusCode>FAILED</PaymentStatusCode>
  </PaymentProcessingDetails>
</PaymentInfo>
```

---

## Order Status Codes

Order status is returned in `<Order>/<StatusCode>` element.

| Code | Description | Meaning |
|------|-------------|---------|
| `OPENED` | Hold, Confirmed | Order is active and confirmed, awaiting payment |
| `CLOSED` | Closed, HoldCancelled | Order has been closed (cancelled or expired) |

**Important**: `OPENED` does NOT mean "incomplete" - it means the booking is confirmed but on hold awaiting payment. The payment status determines whether action is needed.

### Order Item Status Codes

Individual OrderItems have their own status in `<OrderItem>/<StatusCode>`:

| Code | Description |
|------|-------------|
| `ACTIVE` | OrderItem(s) expected to be delivered (active or passive flights) |
| `CANCELLED` | OrderItem(s) that have been cancelled |

### Service Item Status Codes

| Code | Description |
|------|-------------|
| `CONFIRMED` | Confirmed, Closed, Closed Pending |
| `WAITLISTED` | Waitlist status |
| `REQUESTED` | Pending, Holding Need, BlockAllActivities |
| `CANCELLED` | Cancelled, Unable-special service not provided, No action taken, Unable to confirm/waitlist, Suspended, Mishap |

### Common Status Flows

1. **Hold Booking (Unpaid)**: Order `OPENED` + Payment none/`PENDING` = Payment required
2. **Confirmed Booking (Paid)**: Order `OPENED` + Payment `SUCCESSFUL` = Booking complete
3. **Cancelled Booking**: Order `CLOSED` = Cancelled or expired

---

## Error Codes Catalog

Error codes are returned in the `<Errors>` element when a request fails.

### Authentication & Authorization Errors

| Code | Description |
|------|-------------|
| `AU0001` | Invalid authentication token |
| `AU0002` | Token expired |
| `AU0003` | Unauthorized access |
| `AU0004` | Missing subscription key |

### Offer-Related Errors

| Code | Description |
|------|-------------|
| `OF0001` | Offer not found |
| `OF0002` | Offer expired |
| `OF0003` | Offer price changed |
| `OF0004` | Seat not available |
| `OF0005` | Invalid offer selection |

### Order-Related Errors

| Code | Description |
|------|-------------|
| `OR0001` | Order not found |
| `OR0002` | Order already cancelled |
| `OR0003` | Order modification not allowed |
| `OR0004` | Invalid order state |
| `OR0005` | Order retrieval failed |

### Payment Errors

| Code | Description |
|------|-------------|
| `PY0001` | Payment declined |
| `PY0002` | Invalid card number |
| `PY0003` | Card expired |
| `PY0004` | Insufficient funds |
| `PY0005` | Card not supported |
| `PY0006` | CVV verification failed |

### Passenger Errors

| Code | Description |
|------|-------------|
| `PX0001` | Invalid passenger data |
| `PX0002` | Missing required field |
| `PX0003` | Invalid document type |
| `PX0004` | Document expired |
| `PX0005` | Age restriction violation |

### XML/Format Errors

| Code | Description |
|------|-------------|
| `XM0001` | Invalid XML format |
| `XM0002` | Schema validation failed |
| `XM0003` | Missing required element |
| `XM0004` | Invalid element value |

### Error Response Structure

```xml
<Errors>
  <Error>
    <Code>OF0002</Code>
    <DescText>The offer has expired. Please search again.</DescText>
    <Owner>JQ</Owner>
    <TypeCode>Business</TypeCode>
  </Error>
</Errors>
```

---

## Warning Codes Catalog

Warnings are returned in the `<Warning>` element. Unlike errors, warnings indicate the request was processed but with issues.

### Payment Warnings (Critical)

| Code | Description | Action |
|------|-------------|--------|
| `OF2002` | Payment declined | Show payment failure to user |
| `OF2003` | Order is underpaid | Payment amount insufficient |
| `OF2004` | Payment method not accepted | Try different payment method |

### Order Warnings

| Code | Description |
|------|-------------|
| `OF1001` | Price has changed |
| `OF1002` | Seat assignment changed |
| `OF1003` | Schedule change detected |
| `OF1004` | Service no longer available |

### Implementation Example

```typescript
// Extract warning messages from response
const warningRegex = /<Warning[^>]*>[\s\S]*?<DescText[^>]*>([^<]+)<\/DescText>[\s\S]*?<\/Warning>/gi;
let match;
const warnings: string[] = [];

while ((match = warningRegex.exec(xmlResponse)) !== null) {
  warnings.push(match[1]);
}

// Check for payment-related warnings
const paymentDeclined = warnings.some(w =>
  w.toLowerCase().includes('payment declined') ||
  w.toLowerCase().includes('underpaid')
);
```

### Warning Response Structure

```xml
<Warning>
  <Code>OF2002</Code>
  <DescText>Payment declined. Please check card details.</DescText>
  <Owner>JQ</Owner>
  <TypeCode>Business</TypeCode>
</Warning>
```

---

## Passive Segments

Passive segments are used for manual/agency bookings where flights need to be added without API validation (e.g., external bookings, codeshare).

### Key Identifier: SegmentTypeCode

| Code | Description |
|------|-------------|
| `1` | Active segment (API-validated flight) |
| `2` | Passive segment (manual entry, no validation) |

### Required XML Structure

Passive segments require **4 separate lists** in DataLists:

1. **DatedMarketingSegmentList** - Marketing segment info with carrier and flight details
2. **DatedOperatingSegmentList** - Operating segment with `SegmentTypeCode=2` (passive indicator)
3. **PaxJourneyList** - Journey-to-segment associations
4. **PaxSegmentList** - Passenger segment associations with RBD code

### XML Example

```xml
<DataLists xmlns="http://www.iata.org/IATA/2015/EASD/00/IATA_OffersAndOrdersCommonTypes">

  <!-- 1. Marketing Segment List -->
  <DatedMarketingSegmentList>
    <DatedMarketingSegment>
      <Arrival>
        <AircraftScheduledDateTime>2026-01-20T10:30:00</AircraftScheduledDateTime>
        <IATA_LocationCode>MEL</IATA_LocationCode>
      </Arrival>
      <CarrierDesigCode>QF</CarrierDesigCode>
      <DatedMarketingSegmentId>Mkt-passive-outbound-1</DatedMarketingSegmentId>
      <DatedOperatingSegmentRefId>Opr-passive-outbound-1</DatedOperatingSegmentRefId>
      <Dep>
        <AircraftScheduledDateTime>2026-01-20T07:30:00</AircraftScheduledDateTime>
        <IATA_LocationCode>SYD</IATA_LocationCode>
      </Dep>
      <MarketingCarrierFlightNumberText>401</MarketingCarrierFlightNumberText>
    </DatedMarketingSegment>
  </DatedMarketingSegmentList>

  <!-- 2. Operating Segment List (SegmentTypeCode=2 marks as passive) -->
  <DatedOperatingSegmentList>
    <DatedOperatingSegment>
      <CarrierDesigCode>QF</CarrierDesigCode>
      <DatedOperatingSegmentId>Opr-passive-outbound-1</DatedOperatingSegmentId>
      <OperatingCarrierFlightNumberText>401</OperatingCarrierFlightNumberText>
      <SegmentTypeCode>2</SegmentTypeCode>  <!-- PASSIVE INDICATOR -->
    </DatedOperatingSegment>
  </DatedOperatingSegmentList>

  <!-- 3. Passenger Journey List -->
  <PaxJourneyList>
    <PaxJourney>
      <PaxJourneyID>passive-journey-1</PaxJourneyID>
      <PaxSegmentRefID>passive-outbound-1</PaxSegmentRefID>
    </PaxJourney>
  </PaxJourneyList>

  <!-- 4. Passenger Segment List -->
  <PaxSegmentList>
    <PaxSegment>
      <DatedMarketingSegmentRefId>Mkt-passive-outbound-1</DatedMarketingSegmentRefId>
      <MarketingCarrierRBD_Code>Y</MarketingCarrierRBD_Code>  <!-- Booking class -->
      <PaxSegmentID>passive-outbound-1</PaxSegmentID>
    </PaxSegment>
  </PaxSegmentList>

</DataLists>
```

### PassiveSegment TypeScript Interface

```typescript
interface PassiveSegment {
  segmentId: string;           // Unique segment identifier
  origin: string;              // Origin airport code (e.g., "SYD")
  destination: string;         // Destination airport code (e.g., "MEL")
  departureDateTime: string;   // ISO datetime (e.g., "2026-01-20T07:30:00")
  arrivalDateTime: string;     // ISO datetime
  flightNumber: string;        // Flight number (e.g., "401")
  operatingCarrier: string;    // Operating carrier code (e.g., "QF")
  marketingCarrier: string;    // Marketing carrier code (e.g., "QF")
  journeyId: string;           // Journey group identifier
  rbd?: string;                // Booking class code (e.g., "Y", "O", "W")
}
```

---

## DataLists Structure

The `<DataLists>` element contains all reference data for the request.

### Common Lists

| List Element | Purpose |
|--------------|---------|
| `ContactInfoList` | Contact details for booking |
| `PaxList` | Passenger information |
| `DatedMarketingSegmentList` | Flight marketing details |
| `DatedOperatingSegmentList` | Flight operating details |
| `PaxJourneyList` | Journey groupings |
| `PaxSegmentList` | Passenger-segment associations |
| `OriginDestList` | Origin-destination pairs |
| `BaggageAllowanceList` | Baggage allowance details |
| `FareList` | Fare component details |

### DataLists Position in Request

```xml
<Request>
  <CreateOrder xmlns="...">
    <!-- Order creation details -->
  </CreateOrder>
  <DataLists xmlns="...">
    <ContactInfoList>...</ContactInfoList>
    <PaxList>...</PaxList>
    <!-- Additional lists as needed -->
  </DataLists>
  <PaymentFunctions>...</PaymentFunctions>
</Request>
```

---

## Distribution Chain

Distribution chain identifies the selling/distributing organization.

### Structure

```xml
<DistributionChain>
  <DistributionChainLink xmlns="http://www.iata.org/IATA/2015/EASD/00/IATA_OffersAndOrdersCommonTypes">
    <Ordinal>1</Ordinal>
    <OrgRole>Seller</OrgRole>
    <ParticipatingOrg>
      <Name>Travel Agency Name</Name>
      <OrgID>55778878</OrgID>
    </ParticipatingOrg>
  </DistributionChainLink>
</DistributionChain>
```

### Organization Roles

| Role | Description |
|------|-------------|
| `Seller` | The entity selling the product (usually the agency) |
| `Distributor` | The entity distributing (for BOB - Buy-On-Board) |
| `Carrier` | The airline carrier |

### Multiple Links (BOB Example)

For Buy-On-Board (BOB) ancillaries, multiple links may be needed:

```xml
<DistributionChain>
  <DistributionChainLink>
    <Ordinal>1</Ordinal>
    <OrgRole>Seller</OrgRole>
    <ParticipatingOrg>
      <OrgID>55778878</OrgID>
    </ParticipatingOrg>
  </DistributionChainLink>
  <DistributionChainLink>
    <Ordinal>2</Ordinal>
    <OrgRole>Distributor</OrgRole>
    <ParticipatingOrg>
      <OrgID>BOB_DIST_ID</OrgID>
    </ParticipatingOrg>
  </DistributionChainLink>
</DistributionChain>
```

---

## Payment Types

### Payment Type Codes

| Code | Description | Required Fields |
|------|-------------|-----------------|
| `CC` | Credit Card | Card number, expiry, CVV, holder name |
| `AGT` | Agency Credit | None (agency account) |
| `VC` | Voucher | Voucher code |
| `CA` | Cash | Amount only |

### Card Brand Codes

| Code | Brand |
|------|-------|
| `VI` | Visa |
| `MC` | Mastercard |
| `AX` | American Express |
| `JCB` | JCB |
| `DC` | Diners Club |
| `UP` | UnionPay |

### Credit Card Payment XML

```xml
<PaymentFunctions>
  <PaymentProcessingDetails>
    <Amount CurCode="AUD">299.00</Amount>
    <PaymentMethod>
      <PaymentCard>
        <CardBrandCode>VI</CardBrandCode>
        <CardNumber>4111111111111111</CardNumber>
        <SeriesCode>123</SeriesCode>
        <CardHolderName>JOHN SMITH</CardHolderName>
        <EffectiveExpireDate>
          <Expiration>2028-12</Expiration>
        </EffectiveExpireDate>
      </PaymentCard>
    </PaymentMethod>
  </PaymentProcessingDetails>
</PaymentFunctions>
```

### Agency Payment XML (Hold Booking)

```xml
<PaymentFunctions>
  <PaymentProcessingDetails>
    <Amount CurCode="AUD">299.00</Amount>
  </PaymentProcessingDetails>
</PaymentFunctions>
```

---

## Passenger Types (PTC)

| Code | Description | Age Range |
|------|-------------|-----------|
| `ADT` | Adult | 12+ years |
| `CHD` | Child | 2-11 years |
| `INF` | Infant | 0-2 years (on lap) |
| `INS` | Infant with seat | 0-2 years (own seat) |
| `UNN` | Unaccompanied minor | Airline specific |

### Passenger XML Structure

```xml
<Pax>
  <ContactInfoRefID>CI1</ContactInfoRefID>
  <IdentityDoc>
    <Birthdate>1990-05-15</Birthdate>
    <ExpiryDate>2030-05-15</ExpiryDate>
    <GenderCode>M</GenderCode>
    <GivenName>JOHN</GivenName>
    <IdentityDocID>AB123456</IdentityDocID>
    <IdentityDocTypeCode>PT</IdentityDocTypeCode>
    <IssuingCountryCode>AU</IssuingCountryCode>
    <Surname>SMITH</Surname>
  </IdentityDoc>
  <Individual>
    <Birthdate>1990-05-15</Birthdate>
    <GenderCode>M</GenderCode>
    <GivenName>JOHN</GivenName>
    <Surname>SMITH</Surname>
  </Individual>
  <PaxID>PAX1</PaxID>
  <PTC>ADT</PTC>
</Pax>
```

---

## Document Type Codes

| Code | Description |
|------|-------------|
| `PT` | Passport |
| `NI` | National ID Card |
| `DL` | Driver's License |
| `VI` | Visa |
| `BC` | Birth Certificate |

**Note**: The API uses `PT` for passport, but some systems may send `PP`. Always map `PP` → `PT` when building requests.

```typescript
// Map document type codes
const docTypeCode = doc.type === 'PP' ? 'PT' : doc.type;
```

---

## XML Namespaces

Always use these namespaces for NDC 21.3:

```typescript
const NDC_NAMESPACES = {
  main: "http://www.iata.org/IATA/2015/EASD/00/IATA_OffersAndOrdersMessage",
  commonTypes: "http://www.iata.org/IATA/2015/EASD/00/IATA_OffersAndOrdersCommonTypes",
};
```

### Root Element Examples

```xml
<!-- Air Shopping -->
<IATA_AirShoppingRQ xmlns="http://www.iata.org/IATA/2015/EASD/00/IATA_OffersAndOrdersMessage">

<!-- Offer Price -->
<IATA_OfferPriceRQ xmlns="http://www.iata.org/IATA/2015/EASD/00/IATA_OffersAndOrdersMessage">

<!-- Order Create -->
<IATA_OrderCreateRQ xmlns="http://www.iata.org/IATA/2015/EASD/00/IATA_OffersAndOrdersMessage">

<!-- Order Retrieve -->
<IATA_OrderRetrieveRQ xmlns="http://www.iata.org/IATA/2015/EASD/00/IATA_OffersAndOrdersMessage">

<!-- Order Cancel -->
<IATA_OrderCancelRQ xmlns="http://www.iata.org/IATA/2015/EASD/00/IATA_OffersAndOrdersMessage">
```

---

## Common Implementation Patterns

### 1. Error Handling Pattern

```typescript
function parseNDCResponse(xmlResponse: string) {
  // Check for errors first
  const errorMatch = xmlResponse.match(/<Error>[\s\S]*?<Code>([^<]+)<\/Code>[\s\S]*?<DescText>([^<]+)<\/DescText>/i);
  if (errorMatch) {
    throw new NDCError(errorMatch[1], errorMatch[2]);
  }

  // Check for warnings (may still have valid data)
  const warnings = extractWarnings(xmlResponse);

  // Check payment status
  const paymentStatus = extractPaymentStatus(xmlResponse);
  if (paymentStatus === 'FAILED') {
    throw new PaymentError(warnings.join('; '));
  }

  // Process successful response
  return parseSuccessResponse(xmlResponse);
}
```

### 2. Date/Time Formatting

```typescript
// NDC uses ISO format without timezone for local times
function formatNDCDateTime(date: Date): string {
  return date.toISOString().slice(0, 19); // "2026-01-20T07:30:00"
}

// Date only format
function formatNDCDate(date: Date): string {
  return date.toISOString().slice(0, 10); // "2026-01-20"
}
```

### 3. Amount Formatting

```typescript
// NDC amounts use 2 decimal places
function formatNDCAmount(value: number, currency: string): string {
  return `<Amount CurCode="${currency}">${value.toFixed(2)}</Amount>`;
}
```

---

## OfferPrice Request (Long Sell)

OfferPrice can be used in two modes:
1. **By Reference** - Pricing a shopping offer using OfferRefID from AirShopping
2. **By Value (Long Sell)** - Creating a priced offer for specific flights without prior shopping

### Long Sell Mode

Long Sell creates offers for specific flights without using shopping offer IDs. This is useful for:
- Manual bookings with known flight details
- CC surcharge calculation
- Agency-specific pricing scenarios

### Required Elements for Long Sell

```xml
<IATA_OfferPriceRQ xmlns="http://www.iata.org/IATA/2015/EASD/00/IATA_OffersAndOrdersMessage">
  <DistributionChain>...</DistributionChain>
  <PayloadAttributes>
    <VersionNumber xmlns="...">21.3</VersionNumber>
  </PayloadAttributes>
  <Request>
    <DataLists xmlns="...">
      <DatedMarketingSegmentList>...</DatedMarketingSegmentList>
      <OriginDestList>...</OriginDestList>
      <PaxJourneyList>...</PaxJourneyList>
      <PaxList>...</PaxList>
      <ShoppingRequestPaxSegmentList>...</ShoppingRequestPaxSegmentList>
    </DataLists>
    <PricedOffer xmlns="...">
      <AcceptOrderItemList>
        <CreateOrderItem>
          <OfferItemType>
            <FlightItem>
              <OriginDestRefID>OriginDestID1</OriginDestRefID>
            </FlightItem>
          </OfferItemType>
          <OwnerCode>JQ</OwnerCode>
        </CreateOrderItem>
      </AcceptOrderItemList>
    </PricedOffer>
    <PaymentFunctions xmlns="...">
      <PaymentMethodCriteria>
        <PaymentTypeCode>CC</PaymentTypeCode>
        <PaymentBrandCode>VI</PaymentBrandCode>
      </PaymentMethodCriteria>
    </PaymentFunctions>
    <ResponseParameters xmlns="...">
      <CurParameter>
        <CurCode>AUD</CurCode>
      </CurParameter>
    </ResponseParameters>
  </Request>
</IATA_OfferPriceRQ>
```

### ShoppingRequestPaxSegmentList

Required for Long Sell - links passengers to segments:

```xml
<ShoppingRequestPaxSegmentList>
  <PaxSegment>
    <CabinTypeAssociationChoice>
      <SegmentCabinType>
        <CabinTypeCode>5</CabinTypeCode>  <!-- Economy -->
      </SegmentCabinType>
    </CabinTypeAssociationChoice>
    <DatedMarketingSegmentRefId>Mkt-seg000000001</DatedMarketingSegmentRefId>
    <PaxSegmentID>seg000000001</PaxSegmentID>
  </PaxSegment>
</ShoppingRequestPaxSegmentList>
```

### Payment Method Criteria (CC Surcharge)

To calculate credit card surcharges, include PaymentFunctions:

```xml
<PaymentFunctions xmlns="...">
  <PaymentMethodCriteria>
    <PaymentTypeCode>CC</PaymentTypeCode>
    <PaymentBrandCode>VI</PaymentBrandCode>  <!-- Card brand code -->
  </PaymentMethodCriteria>
</PaymentFunctions>
```

### IIN/BIN Code Support

For more accurate surcharge calculation, the BIN code can be provided:

```xml
<PaymentFunctions>
  <PaymentMethodCriteria>
    <PaymentTypeCode>CC</PaymentTypeCode>
    <PaymentCriteriaAddlInfo>
      <PaymentCardCriteriaAddlInfo>
        <IIN_IINNumber>411111</IIN_IINNumber>  <!-- First 6 digits of card -->
      </PaymentCardCriteriaAddlInfo>
    </PaymentCriteriaAddlInfo>
  </PaymentMethodCriteria>
</PaymentFunctions>
```

---

## FareComponent Structure

FareComponent contains detailed fare information for each segment.

### Key Fields

| Field | Description |
|-------|-------------|
| `CabinType/CabinTypeCode` | Cabin type code (e.g., 5 = Economy) |
| `CabinType/CabinTypeName` | Cabin type name (e.g., "Economy") |
| `FareBasisCode` | Fare basis code for pricing |
| `PaxSegmentRefID` | Reference to the segment this fare applies to |
| `PriceClassRefID` | Reference to the price class |
| `RBD/RBD_Code` | Reservation Booking Designator (booking class) |

### FareComponent XML Example

```xml
<FareComponent>
  <CabinType>
    <CabinTypeCode>5</CabinTypeCode>
    <CabinTypeName>Economy</CabinTypeName>
  </CabinType>
  <FareBasisCode>YOWAU</FareBasisCode>
  <FareRule>
    <Remark>
      <RemarkText>Non-refundable fare</RemarkText>
    </Remark>
  </FareRule>
  <PaxSegmentRefID>seg000000001</PaxSegmentRefID>
  <PriceClassRefID>PC1</PriceClassRefID>
  <RBD>
    <RBD_Code>Y</RBD_Code>
  </RBD>
</FareComponent>
```

### Price Breakdown

The Price element contains:

| Element | Description |
|---------|-------------|
| `BaseAmount` | Base fare minus discounts |
| `Discount/DiscountAmount` | Promotional discount amount |
| `Discount/PreDiscountedAmount` | Amount before discount |
| `Surcharge/Breakdown/Amount` | Surcharge amounts (e.g., fuel) |
| `TaxSummary/Tax/Amount` | Individual tax amounts |
| `TaxSummary/TotalTaxAmount` | Total of all taxes |
| `TotalAmount` | Final total including all components |

---

## Baggage Associations

Baggage allowances are associated per journey per passenger type.

### Structure

```xml
<BaggageAssociations>
  <BaggageAllowanceRefID>BA1</BaggageAllowanceRefID>
  <OfferFlightAssociations>
    <PaxJourneyRef>
      <PaxJourneyRefID>fl000000001</PaxJourneyRefID>
    </PaxJourneyRef>
  </OfferFlightAssociations>
  <PaxRefID>PaxID1</PaxRefID>
  <PaxRefID>PaxID2</PaxRefID>
</BaggageAssociations>
```

### Key Points

- Baggage allowances are **journey eligible** (apply to all segments in a journey)
- Segment-level baggage is currently out of scope
- Only non-infant passengers (ADT, CHD) get baggage allowances
- Infants automatically have no baggage allowance

### BaggageAllowanceList Example

```xml
<BaggageAllowanceList>
  <BaggageAllowance>
    <BaggageAllowanceID>BA1</BaggageAllowanceID>
    <PieceAllowance>
      <TotalQty>1</TotalQty>
    </PieceAllowance>
    <WeightAllowance>
      <MaximumWeightMeasure>23</MaximumWeightMeasure>
      <WeightUOM>KG</WeightUOM>
    </WeightAllowance>
    <TypeCode>Checked</TypeCode>
  </BaggageAllowance>
</BaggageAllowanceList>
```

---

## A La Carte Offers

A La Carte offers are used for ancillary services (seats, bags, meals) separate from flight offers.

### Adding A La Carte to OfferPrice

```xml
<SelectedOffer>
  <OfferRefID>ALC-OFFER-123</OfferRefID>
  <OwnerCode>JQ</OwnerCode>
  <SelectedOfferItem>
    <OfferItemRefID>ALC-ITEM-001</OfferItemRefID>
    <PaxRefID>PaxID1</PaxRefID>
    <SelectedALaCarteOfferItem>
      <Qty>1</Qty>  <!-- Always processed as 1 -->
      <OfferFlightAssociations>
        <PaxSegmentRef>
          <PaxSegmentRefID>seg000000001</PaxSegmentRefID>
        </PaxSegmentRef>
      </OfferFlightAssociations>
    </SelectedALaCarteOfferItem>
  </SelectedOfferItem>
</SelectedOffer>
```

### Seat Selection

For seat selection, include seat details:

```xml
<SelectedOfferItem>
  <OfferItemRefID>SEAT-ITEM-001</OfferItemRefID>
  <PaxRefID>PaxID1</PaxRefID>
  <SelectedSeat>
    <SeatRowNumber>12</SeatRowNumber>
    <ColumnID>A</ColumnID>
  </SelectedSeat>
</SelectedOfferItem>
```

### Flight Association Types

| Association Type | Use Case |
|-----------------|----------|
| `PaxSegmentRefID` | Segment-level ancillaries |
| `PaxJourneyRefID` | Journey-level ancillaries |
| `DatedOperatingLegRefID` | Leg-level ancillaries |

### Important Notes

- A La Carte cannot be added with passenger count change in same request
- Qty is always processed as 1 regardless of value provided
- Seats and ancillaries return separate OfferItems in response

---

## Non-Flight Service Fees

Agent service fees can be added through the AugmentationPoint.

### Request Structure

```xml
<AugmentationPoint>
  <AcceptOrderItemList xmlns="http://ndcgateway.navitaire.com/Orders/AugmentationPoint">
    <CreateOrderItem>
      <OfferItemType>
        <OtherItem>
          <DescText>ServiceFee</DescText>
          <Price>
            <Fee>
              <Amount CurCode="AUD">25.00</Amount>
              <DesigText>SVCFEE</DesigText>  <!-- Fee code in New Skies -->
            </Fee>
          </Price>
        </OtherItem>
      </OfferItemType>
      <OwnerCode>JQ</OwnerCode>
    </CreateOrderItem>
  </AcceptOrderItemList>
</AugmentationPoint>
```

### Namespace

The AcceptOrderItemList uses a special namespace:
```
http://ndcgateway.navitaire.com/Orders/AugmentationPoint
```

### Fee Code Configuration

The `DesigText` must match a configured fee code in New Skies. The amount is informational - actual fee is calculated based on configuration.

---

## OfferPrice Response Structure

### PricedOffer Element

| Field | Description |
|-------|-------------|
| `OfferID` | Unique priced offer ID |
| `OwnerCode` | Carrier code |
| `OfferExpirationTimeLimitDateTime` | Offer expiry (UTC) |
| `TotalPrice/TotalAmount` | Total price for all services |
| `BaggageAssociations` | Fare baggage allowances per journey/PTC |
| `JourneyOverview` | Price class references per journey |

### OfferItem Types

The response contains separate OfferItems for:

1. **Flight OfferItems** - Per passenger type, per journey
2. **Seat OfferItems** - Per passenger, per segment
3. **Ancillary OfferItems** - Per passenger, per SSR, per fee application

### Flight OfferItem Fields

| Field | Description |
|-------|-------------|
| `OfferItemID` | Unique item ID |
| `MandatoryInd` | Always `true` - all items mandatory |
| `CancelRestrictions` | Cancellation rules |
| `ChangeRestrictions` | Change/modification rules |
| `PaymentTimelimit` | Hold duration (e.g., "PT2H3M") |
| `Price/BaseAmount` | Base fare amount |
| `Price/TaxSummary` | Tax breakdown |
| `Price/TotalAmount` | Total including taxes/fees |
| `FareDetail` | Detailed fare components |
| `Service` | Flight service with journey reference |

### Payment Time Limit Format

```xml
<PaymentTimelimit>
  <PaymentTimeLimitDuration>
    <PaymentTimelimitDuration>PT2H3M0S</PaymentTimelimitDuration>
  </PaymentTimeLimitDuration>
</PaymentTimelimit>
```

Format: `PT{hours}H{minutes}M{seconds}S` (ISO 8601 duration)

---

## RBD Codes (Booking Classes)

RBD (Reservation Booking Designator) identifies the booking class for inventory and fare purposes.

### Common RBD Codes

| Code | Typical Meaning |
|------|-----------------|
| `J` | Business Class Premium |
| `C` | Business Class |
| `D` | Business Discounted |
| `Y` | Economy Full Fare |
| `B` | Economy Flexible |
| `M` | Economy Standard |
| `H` | Economy Discount |
| `K` | Economy Deep Discount |
| `L` | Economy Promo |
| `O` | Economy Lowest |
| `Q` | Economy Sale |

**Note**: RBD codes vary by airline. Always check airline-specific fare rules.

### RBD in XML

```xml
<RBD>
  <RBD_Code>Y</RBD_Code>
</RBD>
```

Or in passive segments:
```xml
<MarketingCarrierRBD_Code>Y</MarketingCarrierRBD_Code>
```

---

## Cabin Type Codes (PADIS Codeset 9873)

Cabin types indicate the class of service.

| Code | Description |
|------|-------------|
| `1` | First |
| `2` | Business |
| `3` | Third Class (All economy) |
| `4` | Premium Economy |
| `5` | Economy |
| `6` | Discounted Economy |
| `7` | All |

### XML Example

```xml
<CabinType>
  <CabinTypeCode>5</CabinTypeCode>
  <CabinTypeName>Economy</CabinTypeName>
</CabinType>
```

### Usage in Long Sell

Only the `CabinTypeCode` of the **first PaxSegment** is considered by NDC Gateway logic:

```xml
<ShoppingRequestPaxSegmentList>
  <PaxSegment>
    <CabinTypeAssociationChoice>
      <SegmentCabinType>
        <CabinTypeCode>5</CabinTypeCode>  <!-- This is used -->
      </SegmentCabinType>
    </CabinTypeAssociationChoice>
    ...
  </PaxSegment>
</ShoppingRequestPaxSegmentList>
```

---

## OrderCreate Request Structure

OrderCreate converts a priced offer into a booking with payment.

### Distribution Chain Rules (OrderCreate Specific)

**Important**: For OrderCreate, the distribution chain has special requirements:

| OrgRole | Ordinal | Notes |
|---------|---------|-------|
| `Seller` | **Must be 1** | Error if Seller is not Ordinal 1 |
| `Distributor` | 2+ | For intermediaries (BOB, etc.) |
| `Carrier` | Next after Distributor | OrgID = carrier code |

### SelectedPricedOffer Structure

```xml
<CreateOrder>
  <AcceptSelectedQuotedOfferList>
    <SelectedPricedOffer>
      <OfferRefID>OFFER-123</OfferRefID>  <!-- From OfferPriceRS -->
      <OwnerCode>JQ</OwnerCode>
      <SelectedOfferItem>
        <OfferItemRefID>ITEM-001</OfferItemRefID>
        <PaxRefID>PAX1</PaxRefID>
      </SelectedOfferItem>
      <SelectedOfferItem>
        <OfferItemRefID>ITEM-002</OfferItemRefID>
        <PaxRefID>PAX2</PaxRefID>
      </SelectedOfferItem>
    </SelectedPricedOffer>
  </AcceptSelectedQuotedOfferList>
</CreateOrder>
```

**Key Rule**: All OfferItems from OfferPriceRS must be included - NDC Gateway uses opt-in approach.

### PaxList Fields (OrderCreate)

OrderCreate requires more passenger information than other requests:

| Field | Required | Max Length | Notes |
|-------|----------|------------|-------|
| `Individual/GivenName` | **Yes** | 32 chars | Up to 5 given names, space-delimited |
| `Individual/Surname` | **Yes** | 32 chars | Last name |
| `Individual/Birthdate` | Optional | - | Format: YYYY-MM-DD |
| `Individual/GenderCode` | Optional | - | M/F, defaults to M |
| `Individual/MiddleName` | Optional | 32 chars | Up to 3 middle names |
| `Individual/TitleName` | Optional | 6 chars | Mr., Mrs., Dr., etc. |
| `Individual/SuffixName` | Optional | 6 chars | Jr., Sr., III, etc. |
| `PaxID` | **Yes** | - | Must match AirShopping ID |
| `PTC` | **Yes** | - | ADT, CHD, INF |
| `PaxRefID` | Conditional | - | Required for INF (references associated ADT) |
| `ContactInfoRefID` | Optional | - | At least one passenger needs contact |

### IdentityDoc Fields

| Field | Required | Notes |
|-------|----------|-------|
| `IdentityDocID` | **Yes** | Document number (passport, etc.) |
| `IdentityDocTypeCode` | **Yes** | PT (Passport), NI (National ID), DL (Driver License) |
| `ExpiryDate` | Optional | Format: YYYY-MM-DD |
| `IssuingCountryCode` | Optional | ISO country code |
| `CitizenshipCountryCode` | Optional | ISO country code |

### LoyaltyProgramAccount

```xml
<LoyaltyProgramAccount>
  <AccountNumber>ABC123456</AccountNumber>
  <LoyaltyProgram>
    <Carrier>
      <AirlineDesigCode>QF</AirlineDesigCode>
    </Carrier>
  </LoyaltyProgram>
</LoyaltyProgramAccount>
```

**Note**: Loyalty for INF passengers is not supported and will be ignored.

### Payment Types in OrderCreate

#### Credit Card (CC)

```xml
<PaymentFunctions>
  <PaymentProcessingDetails>
    <Amount CurCode="AUD">299.00</Amount>
    <PaymentMethod>
      <PaymentCard>
        <CardBrandCode>VI</CardBrandCode>
        <CardNumber>4111111111111111</CardNumber>
        <CardSecurityCode>123</CardSecurityCode>  <!-- CVV -->
        <ExpirationDate>1228</ExpirationDate>  <!-- MMYY format -->
        <CardholderAddress>
          <CityName>Sydney</CityName>
          <CountryCode>AU</CountryCode>
          <PostalCode>2000</PostalCode>
          <StreetText>123 Main St</StreetText>
        </CardholderAddress>
      </PaymentCard>
    </PaymentMethod>
    <Payer>
      <PayerName>
        <IndividualName>
          <GivenName>JOHN</GivenName>
          <Surname>SMITH</Surname>
        </IndividualName>
      </PayerName>
    </Payer>
  </PaymentProcessingDetails>
</PaymentFunctions>
```

#### Agency Payment (AGT) - Hold Booking

```xml
<PaymentFunctions>
  <PaymentProcessingDetails>
    <Amount CurCode="AUD">299.00</Amount>
    <PaymentMethod>
      <SettlementPlan>
        <PaymentTypeCode>AGT</PaymentTypeCode>
        <IATA_Number>1</IATA_Number>  <!-- Ordinal of agency in chain -->
      </SettlementPlan>
    </PaymentMethod>
  </PaymentProcessingDetails>
</PaymentFunctions>
```

#### Credit File Payment (OT)

```xml
<PaymentFunctions>
  <PaymentProcessingDetails>
    <Amount CurCode="AUD">299.00</Amount>
    <PaymentMethod>
      <OfflinePayment>
        <PaymentTypeCode>OT</PaymentTypeCode>
        <Remark>
          <RemarkText>CREDITFILE123</RemarkText>  <!-- Credit file code -->
        </Remark>
      </OfflinePayment>
    </PaymentMethod>
  </PaymentProcessingDetails>
</PaymentFunctions>
```

---

## OrderViewRS Response Structure

OrderViewRS is returned for OrderCreate, OrderRetrieve, and OrderChange requests.

### Order Element

| Field | Description |
|-------|-------------|
| `OrderID` | PNR/Record Locator |
| `OwnerCode` | Carrier code |
| `StatusCode` | Order status (see Order Status Codes) |
| `TotalPrice/TotalAmount` | Total order amount (excludes payment fee) |

### OrderItem Types

There are three types of OrderItems, distinguished by ID suffix:

| Type | OrderItemID Suffix | Description |
|------|-------------------|-------------|
| Flight | `FLIGHT` | Flight services per passenger per journey |
| Seat | `SEAT` | Seat assignments per passenger per segment |
| Ancillary | ServiceCode | SSR services (bags, meals, etc.) |

### Flight OrderItem Fields

| Field | Description |
|-------|-------------|
| `CancelRestrictions/AllowedModificationInd` | Boolean - can cancel? |
| `CancelRestrictions/DescText` | e.g., "Cancellation is allowed with no fee" |
| `ChangeRestrictions/AllowedModificationInd` | Boolean - can change? |
| `ChangeRestrictions/DescText` | e.g., "Booking changes not allowed" |
| `PaymentTimeLimitDateTime` | UTC datetime for payment deadline |
| `Price/BaseAmount` | Base fare (per passenger × count) |
| `Price/TaxSummary/TotalTaxAmount` | Total taxes |
| `Price/TotalAmount` | Total including all components |
| `FareDetail` | Detailed fare breakdown |
| `Service/DeliveryStatusCode` | CONFIRMED or READY TO PROCEED |
| `Service/StatusCode` | IATA ATSB status code |

### FareDetail Fields (OrderViewRS)

| Field | Description |
|-------|-------------|
| `FareComponent/CabinType/CabinTypeCode` | Cabin code (e.g., 5 = Economy) |
| `FareComponent/FareBasisCode` | Fare basis for pricing |
| `FareComponent/RBD/RBD_Code` | Booking class |
| `FareComponent/PaxSegmentRefID` | Associated segment |
| `FareComponent/PriceClassRefID` | Associated price class |
| `Price/BaseAmount` | Unit price per passenger |
| `Price/Fee` | Fee breakdown |
| `Price/Surcharge` | Surcharge breakdown |
| `Price/TaxSummary/Tax` | Tax breakdown |

### Seat OrderItem Fields

| Field | Description |
|-------|-------------|
| `Service/OrderServiceAssociation/SeatOnLeg/Seat/RowNumber` | Seat row |
| `Service/OrderServiceAssociation/SeatOnLeg/Seat/ColumnID` | Seat column (A, B, C...) |
| `Service/OrderServiceAssociation/SeatOnLeg/SeatAssignmentAssociations` | Segment/leg reference |

### Ancillary OrderItem Fields

| Field | Description |
|-------|-------------|
| `OrderItemID` | Suffixed with SSR service code |
| `Price/BaseAmount` | SSR Fee minus APO discounts |
| `Service/OrderServiceAssociation/ServiceDefinitionRef` | Service reference |
| `Service/OrderServiceAssociation/OrderFlightAssociations` | Segment/journey/leg reference |

### BookingRef in Response

All services include booking references:

```xml
<BookingRef>
  <BookingEntity>
    <Carrier>
      <AirlineDesigCode>JQ</AirlineDesigCode>
    </Carrier>
  </BookingEntity>
  <BookingID>ABC123</BookingID>
  <BookingRefTypeCode>6</BookingRefTypeCode>  <!-- Passenger confirmation number -->
</BookingRef>
```

---

## Delivery Status Codes (Service Item Delivery)

Returned in `Service/DeliveryStatusCode` - indicates payment status at service level:

| Code | Description |
|------|-------------|
| `CONFIRMED` | Unpaid/Underpaid OrderItems - payment still required |
| `READY TO PROCEED` | Fully paid/Overpaid OrderItems - ready for travel |

**Note**: This is the most reliable indicator of payment status at the service level.

---

## 3D Secure Payment (3DS v2)

For 3D Secure authenticated payments, include SecurePaymentVersion2:

```xml
<PaymentCard>
  <CardBrandCode>VI</CardBrandCode>
  <CardNumber>4111111111111111</CardNumber>
  <!-- ... other card fields ... -->
  <SecurePaymentVersion2>
    <AuthenticationTokenValue>AABBCCDDee123456</AuthenticationTokenValue>
    <DirectoryServerTrxID>f38e1234-5678-90ab-cdef</DirectoryServerTrxID>
    <ElectronicCommerceInd>05</ElectronicCommerceInd>
    <TrxStatusText>Y</TrxStatusText>
    <PayerAuthenticationExemptionCode>LowValueExemption</PayerAuthenticationExemptionCode>
  </SecurePaymentVersion2>
  <SecureProgram>
    <EnrollmentStatusText>CardEnrolled</EnrollmentStatusText>
  </SecureProgram>
</PaymentCard>
```

### 3DS Fields

| Field | Description |
|-------|-------------|
| `AuthenticationTokenValue` | Authentication value from 3DS |
| `DirectoryServerTrxID` | DS transaction ID |
| `ElectronicCommerceInd` | ECI value |
| `TrxStatusText` | Authentication outcome (Y, A, N, U, etc.) |
| `PayerAuthenticationExemptionCode` | Exemption if applicable |
| `EnrollmentStatusText` | CardEnrolled, CardNotEnrolled, Unknown, etc. |

### ECI Values

| Value | Description |
|-------|-------------|
| `05` | Visa - Fully authenticated |
| `06` | Visa - Attempted authentication |
| `02` | MC/Amex - Fully authenticated |
| `01` | MC/Amex - Attempted authentication |

---

## OrderChange Request

OrderChange is used to modify existing orders, including adding seats, ancillaries, or making payments on hold bookings.

### Request Structure

```xml
<IATA_OrderChangeRQ xmlns="http://www.iata.org/IATA/2015/EASD/00/IATA_OffersAndOrdersMessage">
  <DistributionChain>...</DistributionChain>
  <PayloadAttributes>
    <VersionNumber xmlns="...">21.3</VersionNumber>
  </PayloadAttributes>
  <Request>
    <ChangeOrder xmlns="...">
      <AcceptSelectedQuotedOffer>
        <SelectedOffer>
          <OfferRefID>OFFER-123</OfferRefID>
          <OwnerCode>JQ</OwnerCode>
          <SelectedOfferItem>
            <OfferItemRefID>ITEM-001</OfferItemRefID>
            <PaxRefID>PAX1</PaxRefID>
          </SelectedOfferItem>
        </SelectedOffer>
      </AcceptSelectedQuotedOffer>
      <Order>
        <OrderID>ABC123</OrderID>  <!-- PNR -->
        <OwnerCode>JQ</OwnerCode>
      </Order>
    </ChangeOrder>
    <DataLists xmlns="...">
      <PaxList>...</PaxList>
    </DataLists>
    <PaymentFunctions>...</PaymentFunctions>
  </Request>
</IATA_OrderChangeRQ>
```

### Key Elements

| Element | Description |
|---------|-------------|
| `Order/OrderID` | PNR/Record Locator of existing booking |
| `Order/OwnerCode` | Carrier code |
| `AcceptSelectedQuotedOffer` | Selected items from ServiceListRS or SeatAvailabilityRS |
| `PaymentFunctions` | Payment for the change (if applicable) |

### Payment for OrderChange

When adding paid services, include payment:

```xml
<PaymentFunctions>
  <PaymentProcessingDetails>
    <Amount CurCode="AUD">25.00</Amount>
    <PaymentMethod>
      <PaymentCard>
        <CardBrandCode>VI</CardBrandCode>
        <CardNumber>4111111111111111</CardNumber>
        <!-- ... other card fields ... -->
      </PaymentCard>
    </PaymentMethod>
  </PaymentProcessingDetails>
</PaymentFunctions>
```

### Response

OrderChange returns an OrderViewRS with updated order details.

---

## OrderReshop Request

OrderReshop is used for:
1. **Cancellation pricing** - Get refund/penalty amounts before cancelling
2. **Flight change pricing** - Get fare difference for date/route changes

### Cancellation Reshop Request

```xml
<IATA_OrderReshopRQ xmlns="http://www.iata.org/IATA/2015/EASD/00/IATA_OffersAndOrdersMessage">
  <DistributionChain>...</DistributionChain>
  <PayloadAttributes>
    <VersionNumber xmlns="...">21.3</VersionNumber>
  </PayloadAttributes>
  <Request>
    <OrderReshop xmlns="...">
      <Actions>
        <ActionType>
          <OrderActionCode>Cancel</OrderActionCode>  <!-- Full cancellation -->
        </ActionType>
      </Actions>
      <Order>
        <OrderID>ABC123</OrderID>
        <OwnerCode>JQ</OwnerCode>
      </Order>
    </OrderReshop>
  </Request>
</IATA_OrderReshopRQ>
```

### OrderActionCode Values

| Code | Description |
|------|-------------|
| `Cancel` | Full order cancellation |
| `Refund` | Refund calculation |
| `Change` | Flight change/reshop |

### Reshop Response (OrderReshopRS)

```xml
<IATA_OrderReshopRS>
  <Response>
    <ReshopOffers>
      <ReshopOffer>
        <OfferID>RESHOP-001</OfferID>
        <OwnerCode>JQ</OwnerCode>
        <ReshopOfferItem>
          <ReshopOfferItemID>RESHOP-ITEM-001</ReshopOfferItemID>
          <ReshopDueAmounts>
            <Due>
              <Amount CurCode="AUD">-150.00</Amount>  <!-- Negative = refund -->
            </Due>
          </ReshopDueAmounts>
          <ReshopRefundAmounts>
            <Refund>
              <RefundAmount CurCode="AUD">150.00</RefundAmount>
            </Refund>
          </ReshopRefundAmounts>
          <Penalty>
            <Amount CurCode="AUD">50.00</Amount>  <!-- Cancellation fee -->
          </Penalty>
        </ReshopOfferItem>
      </ReshopOffer>
    </ReshopOffers>
  </Response>
</IATA_OrderReshopRS>
```

### Key Response Fields

| Field | Description |
|-------|-------------|
| `ReshopDueAmounts/Due/Amount` | Amount due (negative = refund) |
| `ReshopRefundAmounts/Refund/RefundAmount` | Refund amount |
| `Penalty/Amount` | Cancellation/change fee |
| `ReshopOfferItemID` | Use in OrderChange to execute the reshop |

---

## Adding Seats to Existing Orders

### Flow

1. **SeatAvailabilityRQ** - Get available seats with Order reference
2. **OrderChangeRQ** - Add selected seat with payment

### Step 1: SeatAvailability with Order

```xml
<IATA_SeatAvailabilityRQ xmlns="...">
  <Request>
    <Order>
      <OrderID>ABC123</OrderID>
      <OwnerCode>JQ</OwnerCode>
    </Order>
    <SeatAvailCoreQuery>
      <PaxSegmentRefID>seg000000001</PaxSegmentRefID>
    </SeatAvailCoreQuery>
  </Request>
</IATA_SeatAvailabilityRQ>
```

### Step 2: OrderChange with Seat Selection

```xml
<IATA_OrderChangeRQ xmlns="...">
  <Request>
    <ChangeOrder xmlns="...">
      <AcceptSelectedQuotedOffer>
        <SelectedOffer>
          <OfferRefID>SEAT-OFFER-123</OfferRefID>
          <OwnerCode>JQ</OwnerCode>
          <SelectedOfferItem>
            <OfferItemRefID>SEAT-ITEM-001</OfferItemRefID>
            <PaxRefID>PAX1</PaxRefID>
            <SelectedSeat>
              <RowNumber>12</RowNumber>
              <ColumnID>A</ColumnID>
            </SelectedSeat>
          </SelectedOfferItem>
        </SelectedOffer>
      </AcceptSelectedQuotedOffer>
      <Order>
        <OrderID>ABC123</OrderID>
        <OwnerCode>JQ</OwnerCode>
      </Order>
    </ChangeOrder>
    <PaymentFunctions>
      <PaymentProcessingDetails>
        <Amount CurCode="AUD">15.00</Amount>
        <!-- Payment method... -->
      </PaymentProcessingDetails>
    </PaymentFunctions>
  </Request>
</IATA_OrderChangeRQ>
```

### Important Notes

- Seat offers from SeatAvailabilityRS are segment-level
- Each passenger gets a separate OfferItem
- Free seats may still require OrderChange (with zero payment)
- Seat changes may incur fees depending on fare rules

---

## Adding Ancillaries to Existing Orders

### Flow

1. **ServiceListRQ** - Get available services with Order reference
2. **OrderChangeRQ** - Add selected ancillary with payment

### Step 1: ServiceList with Order

```xml
<IATA_ServiceListRQ xmlns="...">
  <Request>
    <Order>
      <OrderID>ABC123</OrderID>
      <OwnerCode>JQ</OwnerCode>
    </Order>
    <ServiceListCoreQuery>
      <ServiceFilterType>
        <ServiceTypeCode>Baggage</ServiceTypeCode>  <!-- Filter by type -->
      </ServiceFilterType>
    </ServiceListCoreQuery>
  </Request>
</IATA_ServiceListRQ>
```

### Common ServiceTypeCode Values

| Code | Description |
|------|-------------|
| `Baggage` | Checked baggage |
| `Meal` | Onboard meals |
| `Lounge` | Lounge access |
| `Priority` | Priority boarding |
| `Insurance` | Travel insurance |

### Step 2: OrderChange with Ancillary

```xml
<IATA_OrderChangeRQ xmlns="...">
  <Request>
    <ChangeOrder xmlns="...">
      <AcceptSelectedQuotedOffer>
        <SelectedOffer>
          <OfferRefID>ANC-OFFER-123</OfferRefID>
          <OwnerCode>JQ</OwnerCode>
          <SelectedOfferItem>
            <OfferItemRefID>BAG-ITEM-001</OfferItemRefID>
            <PaxRefID>PAX1</PaxRefID>
            <SelectedALaCarteOfferItem>
              <Qty>1</Qty>
              <OfferFlightAssociations>
                <PaxJourneyRef>
                  <PaxJourneyRefID>fl000000001</PaxJourneyRefID>
                </PaxJourneyRef>
              </OfferFlightAssociations>
            </SelectedALaCarteOfferItem>
          </SelectedOfferItem>
        </SelectedOffer>
      </AcceptSelectedQuotedOffer>
      <Order>
        <OrderID>ABC123</OrderID>
        <OwnerCode>JQ</OwnerCode>
      </Order>
    </ChangeOrder>
    <PaymentFunctions>
      <PaymentProcessingDetails>
        <Amount CurCode="AUD">35.00</Amount>
        <!-- Payment method... -->
      </PaymentProcessingDetails>
    </PaymentFunctions>
  </Request>
</IATA_OrderChangeRQ>
```

### Ancillary Association Levels

| Level | Element | Example |
|-------|---------|---------|
| Journey | `PaxJourneyRefID` | Baggage for entire outbound journey |
| Segment | `PaxSegmentRefID` | Meal for specific segment |
| Leg | `DatedOperatingLegRefID` | Seat for specific leg |

---

## Full Order Cancellation

### Flow

1. **OrderReshopRQ** - Get cancellation pricing (optional but recommended)
2. **OrderCancelRQ** - Execute cancellation

### OrderCancel Request

```xml
<IATA_OrderCancelRQ xmlns="http://www.iata.org/IATA/2015/EASD/00/IATA_OffersAndOrdersMessage">
  <DistributionChain>...</DistributionChain>
  <PayloadAttributes>
    <VersionNumber xmlns="...">21.3</VersionNumber>
  </PayloadAttributes>
  <Request>
    <CancelOrder xmlns="...">
      <Order>
        <OrderID>ABC123</OrderID>
        <OwnerCode>JQ</OwnerCode>
      </Order>
    </CancelOrder>
  </Request>
</IATA_OrderCancelRQ>
```

### OrderCancel Response

Returns OrderViewRS with:
- `StatusCode`: CLOSED
- Updated payment/refund information

### Cancellation Rules

| Scenario | Result |
|----------|--------|
| Hold booking (unpaid) | No penalty, immediate cancellation |
| Paid booking within 24hrs | May qualify for free cancellation (fare rules) |
| Paid booking outside 24hrs | Penalty per fare rules |
| Non-refundable fare | May get taxes only, or nothing |

### Refund Processing

Refunds are processed automatically to original payment method. For credit card payments:

```xml
<PaymentInfo>
  <PaymentProcessingDetails>
    <Amount CurCode="AUD">-150.00</Amount>  <!-- Negative = refund -->
    <PaymentStatusCode>SUCCESSFUL</PaymentStatusCode>
  </PaymentProcessingDetails>
</PaymentInfo>
```

---

## Partial Order Cancellation

Partial cancellation removes specific items while keeping the rest of the booking active.

### Supported Partial Cancellations

| Item Type | Cancellable | Notes |
|-----------|-------------|-------|
| Seat | Yes | Releases seat assignment |
| Ancillary | Yes | Per-item basis |
| Flight Segment | Depends | Only if multi-segment booking |
| Passenger | No | Use full cancel + rebook |

### OrderChange for Partial Cancellation

```xml
<IATA_OrderChangeRQ xmlns="...">
  <Request>
    <ChangeOrder xmlns="...">
      <Order>
        <OrderID>ABC123</OrderID>
        <OwnerCode>JQ</OwnerCode>
      </Order>
      <DeleteOrderItem>
        <OrderItemRefID>SEAT-ITEM-001</OrderItemRefID>  <!-- Item to remove -->
      </DeleteOrderItem>
    </ChangeOrder>
  </Request>
</IATA_OrderChangeRQ>
```

### Important Notes

- Partial cancellation may trigger fare recalculation
- Some ancillaries may be non-refundable
- Check `AllowedModificationInd` in OrderViewRS before attempting

### Checking Cancellation Eligibility

In OrderViewRS, each OrderItem has:

```xml
<CancelRestrictions>
  <AllowedModificationInd>true</AllowedModificationInd>
  <DescText>Cancellation is allowed with no fee</DescText>
</CancelRestrictions>
```

---

## Reshop for Flight Changes

Reshop enables changing flight dates or routes while maintaining the booking.

### Flight Change Flow

1. **OrderReshopRQ** - Get available alternatives and pricing
2. **OrderChangeRQ** - Execute the change with selected offer

### OrderReshop for Flight Change

```xml
<IATA_OrderReshopRQ xmlns="...">
  <Request>
    <OrderReshop xmlns="...">
      <Actions>
        <ActionType>
          <OrderActionCode>Change</OrderActionCode>
        </ActionType>
      </Actions>
      <Order>
        <OrderID>ABC123</OrderID>
        <OwnerCode>JQ</OwnerCode>
      </Order>
      <Reshop>
        <ReshopCriteria>
          <OriginDest>
            <OriginCode>SYD</OriginCode>
            <DestCode>MEL</DestCode>
            <PaxJourneyRefID>fl000000001</PaxJourneyRefID>  <!-- Journey to change -->
          </OriginDest>
          <DepartureDate>2026-02-15</DepartureDate>  <!-- New date -->
        </ReshopCriteria>
      </Reshop>
    </OrderReshop>
  </Request>
</IATA_OrderReshopRQ>
```

### Reshop Response Offers

The response contains:
- Available flight alternatives
- Fare difference (positive = additional payment, negative = refund)
- Change fees if applicable

```xml
<ReshopOffer>
  <OfferID>RESHOP-CHANGE-001</OfferID>
  <ReshopOfferItem>
    <ReshopDueAmounts>
      <Due>
        <Amount CurCode="AUD">75.00</Amount>  <!-- Pay extra -->
      </Due>
    </ReshopDueAmounts>
    <Service>
      <FlightRef>
        <PaxJourneyRefID>fl000000001</PaxJourneyRefID>
      </FlightRef>
    </Service>
  </ReshopOfferItem>
</ReshopOffer>
```

### Execute Flight Change

```xml
<IATA_OrderChangeRQ xmlns="...">
  <Request>
    <ChangeOrder xmlns="...">
      <AcceptReshopOffer>
        <SelectedReshopOffer>
          <OfferRefID>RESHOP-CHANGE-001</OfferRefID>
          <OwnerCode>JQ</OwnerCode>
          <SelectedReshopOfferItem>
            <ReshopOfferItemRefID>RESHOP-ITEM-001</ReshopOfferItemRefID>
          </SelectedReshopOfferItem>
        </SelectedReshopOffer>
      </AcceptReshopOffer>
      <Order>
        <OrderID>ABC123</OrderID>
        <OwnerCode>JQ</OwnerCode>
      </Order>
    </ChangeOrder>
    <PaymentFunctions>
      <!-- Payment for fare difference -->
    </PaymentFunctions>
  </Request>
</IATA_OrderChangeRQ>
```

### Change Restrictions

In OrderViewRS, check change eligibility:

```xml
<ChangeRestrictions>
  <AllowedModificationInd>true</AllowedModificationInd>
  <DescText>Changes allowed with fee</DescText>
</ChangeRestrictions>
```

### Common Reshop Scenarios

| Scenario | ReshopCriteria | Expected Outcome |
|----------|----------------|------------------|
| Date change same route | New DepartureDate | Fare difference + change fee |
| Route change same date | New OriginCode/DestCode | Full reprice |
| Date + route change | Both new values | Full reprice |
| Earlier flight same day | Earlier DepartureDate | May be free or fee |

---

## ServiceList Request/Response

ServiceList retrieves available ancillary services for a shopping offer or existing order.

### ServiceListRQ for Shopping Offer

```xml
<IATA_ServiceListRQ xmlns="http://www.iata.org/IATA/2015/EASD/00/IATA_OffersAndOrdersMessage">
  <DistributionChain>...</DistributionChain>
  <PayloadAttributes>
    <VersionNumber xmlns="...">21.3</VersionNumber>
  </PayloadAttributes>
  <Request>
    <ServiceListCoreRequest xmlns="...">
      <OfferRequest>
        <Offer>
          <OfferID>OFFER-123</OfferID>
          <OwnerCode>JQ</OwnerCode>
        </Offer>
      </OfferRequest>
    </ServiceListCoreRequest>
  </Request>
</IATA_ServiceListRQ>
```

### ServiceListRQ for Existing Order

Uses a different endpoint (Servicing endpoint):

```xml
<IATA_ServiceListRQ xmlns="...">
  <Request>
    <ServiceListCoreRequest xmlns="...">
      <OrderRequest>
        <Order>
          <OrderID>ABC123</OrderID>
          <OwnerCode>JQ</OwnerCode>
        </Order>
      </OrderRequest>
    </ServiceListCoreRequest>
  </Request>
</IATA_ServiceListRQ>
```

### ServiceListRS Structure

| Element | Description |
|---------|-------------|
| `ALaCarteOffer/OfferID` | Unique offer ID for ancillaries |
| `ALaCarteOffer/OwnerCode` | Carrier code |
| `ALaCarteOffer/OfferExpirationTimeLimitDateTime` | When offer expires |
| `ALaCarteOffer/OfferItem` | Individual ancillary services |

### OfferItem Fields

| Field | Description |
|-------|-------------|
| `OfferItemID` | Unique ID for the a la carte item |
| `Eligibility/PaxRefID` | Passengers eligible for this service |
| `Eligibility/OfferFlightAssociations` | Flight associations (segment/journey/leg) |
| `Service/ServiceDefinitionRefID` | Reference to service details |
| `Service/ServiceID` | Unique service identifier |
| `UnitPrice/BaseAmount` | Base price (per passenger) |
| `UnitPrice/TaxSummary` | Tax breakdown |
| `UnitPrice/TotalAmount` | Total including taxes |

### DataLists in ServiceListRS

| List | Description |
|------|-------------|
| `BaggageAllowanceList` | Baggage service details |
| `DatedMarketingSegmentList` | Marketing segment info |
| `DatedOperatingLegList` | Leg information |
| `DatedOperatingSegmentList` | Operating segment info |
| `DisclosureList` | Wet-lease flight disclosures |
| `PaxJourneyList` | Journey-segment associations |
| `PaxList` | Passenger references |
| `PaxSegmentList` | Segment details |
| `ServiceDefinitionList` | Service descriptions |

### Flight Association Types in ServiceList

| Level | Element | Use Case |
|-------|---------|----------|
| Segment | `PaxSegmentRefID` | Segment-level ancillaries |
| Journey | `PaxJourneyRefID` | Journey-level ancillaries |
| Leg | `DatedOperatingLegRefID` | Leg-level ancillaries |

**Note**: Leg-level ancillaries with Standard SSR-type are not returned.

---

## SeatAvailability Request/Response

SeatAvailability retrieves seat maps and pricing for shopping offers or existing orders.

### SeatAvailabilityRQ for Shopping Offer

```xml
<IATA_SeatAvailabilityRQ xmlns="http://www.iata.org/IATA/2015/EASD/00/IATA_OffersAndOrdersMessage">
  <DistributionChain>...</DistributionChain>
  <PayloadAttributes>
    <VersionNumber xmlns="...">21.3</VersionNumber>
  </PayloadAttributes>
  <Request>
    <SeatAvailCoreRequest xmlns="...">
      <OfferRequest>
        <Offer>
          <OfferID>OFFER-123</OfferID>
          <OwnerCode>JQ</OwnerCode>
          <OfferItem>
            <OfferItemID>ITEM-001</OfferItemID>
            <OwnerCode>JQ</OwnerCode>
            <PaxSegmentRefID>seg000000001</PaxSegmentRefID>
          </OfferItem>
        </Offer>
      </OfferRequest>
    </SeatAvailCoreRequest>
  </Request>
</IATA_SeatAvailabilityRQ>
```

### SeatAvailabilityRQ for Existing Order

Uses Servicing endpoint:

```xml
<IATA_SeatAvailabilityRQ xmlns="...">
  <Request>
    <SeatAvailCoreRequest xmlns="...">
      <OrderRequest>
        <Order>
          <OrderID>ABC123</OrderID>
          <OwnerCode>JQ</OwnerCode>
          <OrderItem>
            <OrderItemID>FLIGHT-ITEM-001</OrderItemID>
            <OwnerCode>JQ</OwnerCode>
            <PaxSegmentRefID>seg000000001</PaxSegmentRefID>
          </OrderItem>
        </Order>
      </OrderRequest>
    </SeatAvailCoreRequest>
  </Request>
</IATA_SeatAvailabilityRQ>
```

### Segment Limit

**Important**: Maximum 6 segments per request. If more segments exist, specify `PaxSegmentRefID` to filter.

### SeatAvailabilityRS Structure

| Element | Description |
|---------|-------------|
| `ALaCarteOffer/OfferID` | Offer ID for seats |
| `ALaCarteOffer/OwnerCode` | Carrier code |
| `ALaCarteOffer/OfferItem` | Individual seat offers |
| `SeatMap` | Cabin layout and seat details |

### Seat OfferItem Fields

| Field | Description |
|-------|-------------|
| `OfferItemID` | Unique seat offer ID |
| `Eligibility/PaxRefID` | Eligible passengers |
| `Eligibility/OfferFlightAssociations` | Segment/leg association |
| `UnitPrice/BaseAmount` | Seat fee |
| `UnitPrice/TaxSummary` | Tax breakdown |
| `UnitPrice/TotalAmount` | Total price |
| `Service/ServiceDefinitionRefID` | Seat service reference |

### SeatMap Structure

```xml
<SeatMap>
  <Cabin>
    <CabinTypeCode>5</CabinTypeCode>  <!-- Economy -->
    <Row>
      <RowNumber>12</RowNumber>
      <Seat>
        <ColumnID>A</ColumnID>
        <SeatCharacteristicCode>W</SeatCharacteristicCode>  <!-- Window -->
        <OfferItemRefID>SEAT-ITEM-001</OfferItemRefID>
        <SeatStatus>F</SeatStatus>  <!-- Available -->
      </Seat>
      <Seat>
        <ColumnID>B</ColumnID>
        <SeatCharacteristicCode>M</SeatCharacteristicCode>  <!-- Middle -->
        <SeatStatus>X</SeatStatus>  <!-- Unavailable -->
      </Seat>
    </Row>
  </Cabin>
</SeatMap>
```

### Seat Status Codes

| Code | Description |
|------|-------------|
| `F` | Available (Free) |
| `X` | Unavailable/Blocked |
| `O` | Occupied |

### Seat Characteristic Codes

| Code | Description |
|------|-------------|
| `W` | Window |
| `A` | Aisle |
| `M` | Middle |
| `E` | Exit row |
| `L` | Leg room |
| `B` | Bulkhead |

---

## OrderReshop Response Details

OrderReshopRS provides detailed pricing for modifications and cancellations.

### Response Structure Overview

```xml
<IATA_OrderReshopRS>
  <Response>
    <Order>
      <OrderID>ABC123</OrderID>
      <OwnerCode>JQ</OwnerCode>
    </Order>
    <ReshopResults>
      <ReshopOffers>
        <RequotedOffer>...</RequotedOffer>  <!-- For adding services -->
        <Offer>...</Offer>  <!-- For cancellation/change -->
      </ReshopOffers>
    </ReshopResults>
    <DataLists>...</DataLists>
  </Response>
</IATA_OrderReshopRS>
```

### RequotedOffer (Adding Services)

Used when pricing additional seats/ancillaries:

| Field | Description |
|-------|-------------|
| `OfferID` | Unique offer ID |
| `OwnerCode` | Carrier code |
| `OfferExpirationTimeLimitDateTime` | Offer expiry |
| `TotalPrice/TotalAmount` | Sum of all AddedOfferItem amounts |
| `AddedOfferItem` | Items to be added |
| `JourneyOverview` | Price class per journey |

### AddedOfferItem Types

| Type | Suffix | Description |
|------|--------|-------------|
| Seat | Per segment | Seat for passenger in segment |
| Ancillary | Per service | SSR for passenger |

### Seat AddedOfferItem Fields

| Field | Description |
|-------|-------------|
| `OfferItemID` | Unique item ID |
| `ReshopPrice/PriceAndFareDetails/Price/BaseAmount` | Seat fee |
| `ReshopPrice/PriceAndFareDetails/Price/TaxSummary` | Tax breakdown |
| `ReshopPrice/PriceAndFareDetails/Price/TotalAmount` | Total price |
| `Service/OfferServiceAssociation/SeatAssignment/Seat/RowNumber` | Row |
| `Service/OfferServiceAssociation/SeatAssignment/Seat/ColumnID` | Column |
| `Service/PaxRefID` | Passenger reference |

### Ancillary AddedOfferItem Fields

| Field | Description |
|-------|-------------|
| `OfferItemID` | Unique item ID |
| `ReshopPrice/PriceAndFareDetails/Price/BaseAmount` | Ancillary fee |
| `Service/OfferServiceAssociation/ServiceDefinitionRef` | Service details |
| `Service/OfferServiceAssociation/OfferFlightAssociations` | Flight association |
| `Service/PaxRefID` | Passenger reference |

---

## PriceDifferential Structure

PriceDifferential shows the price change between old and new states.

### Structure

```xml
<PriceDifferential>
  <DifferentialTypeCode>Refund</DifferentialTypeCode>
  <DiffPrice>
    <Price>
      <DueByAirlineAmount CurCode="AUD">150.00</DueByAirlineAmount>
      <DueToAirlineAmount CurCode="AUD">0.00</DueToAirlineAmount>
      <TotalAmount CurCode="AUD">-150.00</TotalAmount>
    </Price>
  </DiffPrice>
  <NewPrice>...</NewPrice>
  <OldPrice>...</OldPrice>
</PriceDifferential>
```

### DifferentialTypeCode Values

| Code | Condition | Action |
|------|-----------|--------|
| `Refund` | TotalAmount is negative | Airline owes customer |
| `AddCol` | TotalAmount is positive | Customer owes airline |
| `EvenExchange` | TotalAmount is zero | No payment required |

### DiffPrice Calculation

```
TotalAmount = (NewPrice/TotalAmount + Penalties) - OldPrice/TotalAmount
```

### DueByAirlineAmount vs DueToAirlineAmount

| Field | When Populated |
|-------|----------------|
| `DueByAirlineAmount` | Absolute value if TotalAmount < 0 (refund) |
| `DueToAirlineAmount` | Absolute value if TotalAmount > 0 (collect) |

### NewPrice Structure (Cancellation)

For cancellation, NewPrice contains zero amounts:

```xml
<NewPrice>
  <Price>
    <BaseAmount CurCode="AUD">0.00</BaseAmount>
    <TotalAmount CurCode="AUD">50.00</TotalAmount>  <!-- Penalty only -->
  </Price>
</NewPrice>
```

### OldPrice Structure

Contains original pricing before change:

| Field | Description |
|-------|-------------|
| `Price/BaseAmount` | Original base fare |
| `Price/Fee` | Refundable fees (e.g., Travel Fee) |
| `Price/Surcharge` | Surcharge breakdown |
| `Price/TaxSummary` | Tax breakdown |
| `Price/TotalAmount` | Original total |

**Note**: Convenience Fees and Non-Flight Service Fees are NOT included in OldPrice computation.

---

## Penalty and Spoilage Fees

Penalties are referenced via `PenaltyRefID` and defined in `DataLists/PenaltyList`.

### Penalty Association Rules

#### Full Cancellation

| Penalty Type | Associated To |
|--------------|---------------|
| Per Journey | First eligible (non-infant, non-passive) flight order item |
| Per Booking Spoilage | First eligible flight order item |
| Per Passenger Per Journey | First eligible flight order item of respective PTC |

#### Partial Cancellation

| Penalty Type | Associated To |
|--------------|---------------|
| Per Journey | First eligible **active** (non-infant, non-passive) flight order item |
| Per Booking Spoilage | First eligible **active** flight order item |
| Per Passenger Per Journey | First eligible **active** flight order item of respective PTC |

### PenaltyList Structure

```xml
<PenaltyList>
  <Penalty>
    <PenaltyID>PENALTY-001</PenaltyID>
    <Amount CurCode="AUD">50.00</Amount>
    <DescText>Cancellation Fee</DescText>
    <TypeCode>Cancellation</TypeCode>
  </Penalty>
</PenaltyList>
```

### DeleteOrderItem Types

For cancellation reshop, three types of DeleteOrderItems exist:

| Type | OrderItemID Suffix | Description |
|------|-------------------|-------------|
| Flight | `FLIGHT` | Flight services |
| Ancillary | ServiceCode | SSR services |
| Seat | `SEAT` | Seat assignments |

### Flight DeleteOrderItem

Contains `FareDetail` with full fare breakdown:

| Field | Description |
|-------|-------------|
| `PaxRefID` | Passengers this applies to |
| `Price/BaseAmount` | Base fare (0 for NewPrice) |
| `Price/Discount` | Promotional discounts (OldPrice only) |
| `Price/Fee` | Fee breakdown |
| `Price/Surcharge` | Surcharge breakdown |
| `Price/TaxSummary` | Tax breakdown |
| `Price/TotalAmount` | Total amount |

### Seat/Ancillary DeleteOrderItem

Simpler structure without FareDetail:

| Field | Description |
|-------|-------------|
| `ExistingOrderItem/OrderItemRefID` | Reference to order item |
| `PriceDifferential/OldPrice/Price/BaseAmount` | Original fee |
| `PriceDifferential/OldPrice/Price/TaxSummary` | Original taxes |
| `PriceDifferential/NewPrice/Price/TotalAmount` | Always 0 for cancellation |

### Tax Fields in Response

| Field | Description |
|-------|-------------|
| `Tax/Amount` | Tax amount with CurCode |
| `Tax/DescText` | Tax name from New Skies |
| `Tax/FiledTaxCode` | Internal New Skies tax code |
| `Tax/TaxCode` | NDC TaxCode mapping (or Ticket Code if unmapped) |
| `Tax/TaxName` | Tax name from configuration |
| `TotalTaxAmount` | Sum of all tax amounts |

---

## Quick Reference: Request Types

| Request | Root Element | Purpose |
|---------|--------------|---------|
| AirShopping | `IATA_AirShoppingRQ` | Search for flights |
| OfferPrice | `IATA_OfferPriceRQ` | Get updated price for offer |
| OrderCreate | `IATA_OrderCreateRQ` | Create booking with payment |
| OrderRetrieve | `IATA_OrderRetrieveRQ` | Get booking details (PNR) |
| OrderChange | `IATA_OrderChangeRQ` | Modify existing booking |
| OrderCancel | `IATA_OrderCancelRQ` | Cancel booking |
| ServiceList | `IATA_ServiceListRQ` | Get available ancillaries |
| SeatAvailability | `IATA_SeatAvailabilityRQ` | Get available seats |
| AirlineProfile | `IATA_AirlineProfileRQ` | Get airline route network |
| OrderReshop | `IATA_OrderReshopRQ` | Get cancellation/change pricing |

---

## File References

Related builder files in this project:

- [order-create.builder.ts](../backend/src/builders/order-create.builder.ts) - OrderCreate XML builder with passive segments
- [long-sell.builder.ts](../backend/src/builders/long-sell.builder.ts) - OfferPrice for CC surcharge calculation
- [base.builder.ts](../backend/src/builders/base.builder.ts) - Common builder utilities

---

## Version History

| Date | Version | Changes |
|------|---------|---------|
| 2026-01-16 | 1.5 | Updated status codes from official Jetstar NDC documentation - corrected Order Status (OPENED=Hold,Confirmed), Payment Status (PENDING requires polling), Delivery Status (CONFIRMED=Unpaid, READY TO PROCEED=Paid), Cabin Types (PADIS 9873), added Order Item and Service Item status codes |
| 2026-01-15 | 1.4 | Added ServiceList, SeatAvailability, OrderReshop details, PriceDifferential, Penalty sections |
| 2026-01-15 | 1.3 | Added OrderChange, OrderReshop, cancellation, seat/ancillary modification sections |
| 2026-01-15 | 1.2 | Added OrderCreate, OrderViewRS, 3DS, Delivery Status sections |
| 2026-01-15 | 1.1 | Added OfferPrice, FareComponent, Baggage, A La Carte, RBD codes sections |
| 2026-01-15 | 1.0 | Initial knowledge base created |

---

## Resources

- Navitaire NDC Gateway Developer Guide v3.18
- IATA NDC Standard Documentation
- Postman Collection (for reference XML structures)
