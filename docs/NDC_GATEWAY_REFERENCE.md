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

Payment status is returned in OrderCreate response under `<PaymentStatusCode>`.

| Code | Description | Action Required |
|------|-------------|-----------------|
| `SUCCESSFUL` | Payment was processed successfully | Booking confirmed |
| `PENDING` | Payment is being processed | Wait for confirmation |
| `FAILED` | Payment was declined/failed | Show error to user |

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

Order status is returned in `<OrderStatusCode>` element.

| Code | Description | Meaning |
|------|-------------|---------|
| `OPENED` | Order is active | Hold booking, not yet ticketed |
| `CLOSED` | Order is closed | Cancelled or completed |
| `TICKETED` | Tickets issued | Final booking state |

### Common Status Flows

1. **Hold Booking**: `OPENED` (ticketing pending)
2. **Confirmed Booking**: `TICKETED` (payment successful, tickets issued)
3. **Cancelled Booking**: `CLOSED` (cancelled by user or system)

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

## Cabin Type Codes

Cabin types indicate the class of service.

| Code | Description |
|------|-------------|
| `1` | First Class |
| `2` | First Class Premium |
| `3` | First Class Discounted |
| `4` | Business Class |
| `5` | Economy/Coach |
| `6` | Premium Economy |
| `7` | Economy Discounted |

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
| 2026-01-15 | 1.1 | Added OfferPrice, FareComponent, Baggage, A La Carte, RBD codes sections |
| 2026-01-15 | 1.0 | Initial knowledge base created |

---

## Resources

- Navitaire NDC Gateway Developer Guide v3.18
- IATA NDC Standard Documentation
- Postman Collection (for reference XML structures)
