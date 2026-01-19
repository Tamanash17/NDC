// ============================================================================
// LONG SELL XML BUILDER
// Used for CC surcharge fee calculation via OfferPrice with PaymentFunctions
//
// This builder creates a STANDALONE OfferPrice request with flight details
// and PaymentFunctions to calculate the CC surcharge for a specific card brand.
// It uses dummy IDs internally - completely independent of AirShopping IDs.
//
// The request includes ALL booking items to get accurate surcharge:
// - Flight fares (per journey, per passenger type)
// - Bundles (e.g., STARTER PLUS P200)
// - SSRs (e.g., UPFX - Upfront Seating)
// - Seats (with row/column)
// ============================================================================

import { escapeXml } from "./base.builder.js";
import type { DistributionChain } from "../types/ndc.types.js";

const JETSTAR_NAMESPACE = "http://www.iata.org/IATA/2015/EASD/00/IATA_OffersAndOrdersMessage";
const COMMON_TYPES_NAMESPACE = "http://www.iata.org/IATA/2015/EASD/00/IATA_OffersAndOrdersCommonTypes";

export interface LongSellSegment {
  segmentId: string;
  origin: string;
  destination: string;
  departureDateTime: string;
  carrierCode: string;
  flightNumber: string;
  cabinCode?: string;
}

export interface LongSellJourney {
  journeyId: string;
  origin: string;
  destination: string;
  segmentIds: string[];
}

export interface LongSellPassenger {
  paxId: string;
  ptc: 'ADT' | 'CHD' | 'INF';
}

// Bundle selection per journey
export interface LongSellBundle {
  bundleCode: string; // e.g., 'P200' for STARTER PLUS
  journeyIndex: number; // 0 = outbound, 1 = inbound
  paxIds: string[]; // e.g., ['ADT0', 'ADT1', 'CHD0', 'CHD1'] - excludes INF
}

// SSR (Special Service Request) like UPFX (Upfront Seating)
export interface LongSellSSR {
  ssrCode: string; // e.g., 'UPFX'
  segmentIndex: number; // which segment this SSR is for
  paxId: string; // which passenger
}

// Seat selection
export interface LongSellSeat {
  segmentIndex: number; // which segment this seat is for
  paxId: string; // which passenger
  row: string; // e.g., '2'
  column: string; // e.g., 'D'
}

export interface LongSellRequest {
  segments: LongSellSegment[];
  journeys: LongSellJourney[];
  passengers: LongSellPassenger[];
  cardBrand: string; // VI, MC, AX, JCB, etc.
  currency: string;
  distributionChain?: DistributionChain;
  // Optional: Additional items for accurate total pricing
  bundles?: LongSellBundle[];
  ssrs?: LongSellSSR[];
  seats?: LongSellSeat[];
}

function buildDistributionChain(chain?: DistributionChain): string {
  if (!chain?.links || chain.links.length === 0) {
    // Default minimal distribution chain for Long Sell
    return `
  <!-- Partner distribution chain configuration -->
  <DistributionChain>
    <DistributionChainLink xmlns="${COMMON_TYPES_NAMESPACE}">
      <Ordinal>1</Ordinal>
      <OrgRole>Seller</OrgRole>
      <ParticipatingOrg>
        <OrgID>55778878</OrgID>
      </ParticipatingOrg>
    </DistributionChainLink>
  </DistributionChain>`;
  }

  return `
  <!-- Partner distribution chain configuration -->
  <DistributionChain>${chain.links.map(link => `
    <DistributionChainLink xmlns="${COMMON_TYPES_NAMESPACE}">
      <Ordinal>${link.ordinal}</Ordinal>
      <OrgRole>${escapeXml(link.orgRole)}</OrgRole>
      <ParticipatingOrg>${link.orgName ? `
        <Name>${escapeXml(link.orgName)}</Name>` : ''}
        <OrgID>${escapeXml(link.orgId)}</OrgID>
      </ParticipatingOrg>
    </DistributionChainLink>`).join("")}
  </DistributionChain>`;
}

export function buildLongSellXml(input: LongSellRequest): string {
  const {
    segments,
    journeys,
    passengers,
    cardBrand,
    currency,
    distributionChain,
    bundles = [],
    ssrs = [],
    seats = [],
  } = input;

  // ========================================================================
  // KEY FIX: Use ACTUAL segment/journey/passenger IDs from the order
  // The working Postman test used real IDs like Mkt-seg963657718, not dummy IDs
  // ========================================================================

  // Helper to extract clean segment ID (without Mkt- prefix for PaxSegmentRefID)
  const getCleanSegmentId = (segmentId: string): string => {
    // If it already starts with 'seg', use as-is
    if (segmentId.startsWith('seg')) return segmentId;
    // If it starts with 'Mkt-seg', strip the Mkt- prefix
    if (segmentId.startsWith('Mkt-seg')) return segmentId.replace('Mkt-', '');
    // Otherwise, use as-is
    return segmentId;
  };

  // Helper to get marketing segment ID format (with Mkt- prefix)
  const getMarketingSegmentId = (segmentId: string): string => {
    // If already has Mkt- prefix, use as-is
    if (segmentId.startsWith('Mkt-')) return segmentId;
    // If starts with 'seg', add Mkt- prefix
    if (segmentId.startsWith('seg')) return `Mkt-${segmentId}`;
    // Otherwise, use as-is
    return segmentId;
  };

  // Helper to get operating segment ID format (with Opr- prefix)
  const getOperatingSegmentId = (segmentId: string): string => {
    const cleanId = getCleanSegmentId(segmentId);
    return `Opr-${cleanId}`;
  };

  // Create segment index mapping using actual segment IDs
  const segmentIdMap = new Map<number, string>();
  segments.forEach((seg, idx) => {
    segmentIdMap.set(idx, getCleanSegmentId(seg.segmentId));
  });

  // Create journey ID mapping using actual journey IDs
  const journeyIdMap = new Map<number, string>();
  journeys.forEach((journey, idx) => {
    journeyIdMap.set(idx, journey.journeyId);
  });

  // Build DatedMarketingSegmentList using ACTUAL segment IDs from order
  const segmentList = segments.map((seg) => {
    const marketingId = getMarketingSegmentId(seg.segmentId);
    const operatingId = getOperatingSegmentId(seg.segmentId);
    return `
        <DatedMarketingSegment>
          <Arrival>
            <IATA_LocationCode>${escapeXml(seg.destination)}</IATA_LocationCode>
          </Arrival>
          <DatedMarketingSegmentId>${marketingId}</DatedMarketingSegmentId>
          <DatedOperatingSegmentRefId>${operatingId}</DatedOperatingSegmentRefId>
          <Dep>
            <AircraftScheduledDateTime>${escapeXml(seg.departureDateTime)}</AircraftScheduledDateTime>
            <IATA_LocationCode>${escapeXml(seg.origin)}</IATA_LocationCode>
          </Dep>
          <CarrierDesigCode>${escapeXml(seg.carrierCode)}</CarrierDesigCode>
          <MarketingCarrierFlightNumberText>${escapeXml(seg.flightNumber)}</MarketingCarrierFlightNumberText>
        </DatedMarketingSegment>`;
  }).join("");

  // Build OriginDestList using actual journey IDs
  const originDestList = journeys.map((journey, idx) => `
        <OriginDest>
          <OriginDestID>OriginDestID${idx + 1}</OriginDestID>
          <PaxJourneyRefID>${escapeXml(journey.journeyId)}</PaxJourneyRefID>
          <OriginCode>${escapeXml(journey.origin)}</OriginCode>
          <DestCode>${escapeXml(journey.destination)}</DestCode>
        </OriginDest>`).join("");

  // Build PaxJourneyList using actual IDs
  const paxJourneyList = journeys.map((journey) => {
    const segmentRefs = journey.segmentIds.map(segId => {
      const cleanId = getCleanSegmentId(segId);
      return `<PaxSegmentRefID>${cleanId}</PaxSegmentRefID>`;
    }).join("\n          ");

    return `
        <PaxJourney>
          <PaxJourneyID>${escapeXml(journey.journeyId)}</PaxJourneyID>
          ${segmentRefs}</PaxJourney>`;
  }).join("");

  // Build PaxList using ACTUAL passenger IDs from order (not dummy PaxID1, PaxID2)
  // The paxId comes from the order (e.g., A438253293, C438253295, I438253293)
  const paxIdMapping = new Map<string, string>();
  passengers.forEach((pax) => {
    // Map the paxId to itself - we use actual IDs now
    paxIdMapping.set(pax.paxId, pax.paxId);
  });

  const paxList = passengers.map((pax) => `
        <Pax>
          <PaxID>${escapeXml(pax.paxId)}</PaxID>
          <PTC>${escapeXml(pax.ptc)}</PTC>
        </Pax>`).join("");

  // Build ShoppingRequestPaxSegmentList using actual segment IDs
  const paxSegmentList = segments.map((seg) => {
    const marketingId = getMarketingSegmentId(seg.segmentId);
    const cleanId = getCleanSegmentId(seg.segmentId);
    return `
        <PaxSegment>
          <CabinTypeAssociationChoice>
            <SegmentCabinType>
              <CabinTypeCode>${seg.cabinCode || '5'}</CabinTypeCode>
            </SegmentCabinType>
          </CabinTypeAssociationChoice>
          <DatedMarketingSegmentRefId>${marketingId}</DatedMarketingSegmentRefId>
          <PaxSegmentID>${cleanId}</PaxSegmentID>
        </PaxSegment>`;
  }).join("");

  // ========================================================================
  // BUILD ACCEPT ORDER ITEM LIST - Include ALL booking items
  // Match the exact structure from OfferPrice example (no OfferItemID element)
  // ========================================================================
  let orderItemXml = '';

  // Helper to map frontend paxId (ADT0, CHD0) to Long Sell paxId (PaxID1, PaxID2)
  const mapPaxId = (frontendPaxId: string): string => {
    return paxIdMapping.get(frontendPaxId) || frontendPaxId;
  };

  // 1. Flight items - one per journey (no OfferItemID, matches example structure)
  journeys.forEach((_, journeyIdx) => {
    orderItemXml += `
                <CreateOrderItem>
                     <OfferItemType>
                        <FlightItem>
                            <OriginDestRefID>OriginDestID${journeyIdx + 1}</OriginDestRefID>
                        </FlightItem>
                     </OfferItemType>
                     <OwnerCode>JQ</OwnerCode>
                </CreateOrderItem>`;
  });

  // 2. Bundle items - use OtherItem (not SvcItem - that's invalid)
  // Note: Bundles apply to ADT and CHD, not INF
  bundles.forEach((bundle) => {
    const journeyId = journeyIdMap.get(bundle.journeyIndex) || `fl${String(bundle.journeyIndex + 1).padStart(9, '0')}`;
    // Map each paxId to the Long Sell format
    const mappedPaxIds = bundle.paxIds.map(id => mapPaxId(id));
    const paxRefs = mappedPaxIds.map(id => `<PaxRefID>${escapeXml(id)}</PaxRefID>`).join('');
    orderItemXml += `
                <CreateOrderItem>
                     <OfferItemType>
                        <OtherItem>
                            <OtherSvcCode>${escapeXml(bundle.bundleCode)}</OtherSvcCode>
                        </OtherItem>
                     </OfferItemType>
                     ${paxRefs}
                     <OwnerCode>JQ</OwnerCode>
                </CreateOrderItem>`;
  });

  // 3. SSR items - use OtherItem (not SvcItem - that's invalid)
  ssrs.forEach((ssr) => {
    const segmentId = segmentIdMap.get(ssr.segmentIndex) || `seg${String(ssr.segmentIndex + 1).padStart(9, '0')}`;
    const mappedPaxId = mapPaxId(ssr.paxId);
    orderItemXml += `
                <CreateOrderItem>
                     <OfferItemType>
                        <OtherItem>
                            <OtherSvcCode>${escapeXml(ssr.ssrCode)}</OtherSvcCode>
                        </OtherItem>
                     </OfferItemType>
                     <PaxRefID>${escapeXml(mappedPaxId)}</PaxRefID>
                     <OwnerCode>JQ</OwnerCode>
                </CreateOrderItem>`;
  });

  // 4. Seat items - use DatedOperatingLegRefID (not PaxSegmentRefID)
  // Use actual segment IDs to build the operating leg reference
  seats.forEach((seat) => {
    // Get the actual segment ID from the mapping
    const segmentId = segmentIdMap.get(seat.segmentIndex);
    // Build operating leg ref from the actual segment ID
    // Format: seg{id}-leg0 (e.g., seg963657718-leg0)
    const cleanSegId = segmentId ? getCleanSegmentId(segmentId) : `seg${String(seat.segmentIndex + 1).padStart(9, '0')}`;
    const legRefId = `${cleanSegId}-leg0`; // Operating leg reference
    const mappedPaxId = mapPaxId(seat.paxId);
    orderItemXml += `
                <CreateOrderItem>
                     <OfferItemType>
                        <SeatItem>
                            <DatedOperatingLegRefID>${legRefId}</DatedOperatingLegRefID>
                            <SeatRowNumber>${escapeXml(seat.row)}</SeatRowNumber>
                            <ColumnID>${escapeXml(seat.column)}</ColumnID>
                        </SeatItem>
                     </OfferItemType>
                     <PaxRefID>${escapeXml(mappedPaxId)}</PaxRefID>
                     <OwnerCode>JQ</OwnerCode>
                </CreateOrderItem>`;
  });

  // Get current timestamp for request tracking
  const timestamp = new Date().toISOString();

  // Count passenger types
  const adtCount = passengers.filter(p => p.ptc === 'ADT').length;
  const chdCount = passengers.filter(p => p.ptc === 'CHD').length;
  const infCount = passengers.filter(p => p.ptc === 'INF').length;
  const paxBreakdown = [
    adtCount > 0 ? `${adtCount} Adult${adtCount > 1 ? 's' : ''}` : '',
    chdCount > 0 ? `${chdCount} Child${chdCount > 1 ? 'ren' : ''}` : '',
    infCount > 0 ? `${infCount} Infant${infCount > 1 ? 's' : ''}` : ''
  ].filter(Boolean).join(', ');

  // Count total items for header comment
  const totalItems = journeys.length + bundles.length + ssrs.length + seats.length;

  // Build header comments with request details
  const headerComments = `<!-- ================================================================ -->
<!-- NDC OfferPrice Request - Credit Card Surcharge Calculation -->
<!-- Generated: ${timestamp} -->
<!-- Payment Mode: Credit Card (${escapeXml(cardBrand)}) -->
<!-- Passengers: ${paxBreakdown} -->
<!-- Currency: ${escapeXml(currency)} -->
<!-- Journeys: ${journeys.length} journey(s), Segments: ${segments.length} -->
<!-- Bundles: ${bundles.length}, SSRs: ${ssrs.length}, Seats: ${seats.length} -->
<!-- Total Items: ${totalItems} -->
<!-- ================================================================ -->
`;

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
${headerComments}<IATA_OfferPriceRQ Version="8.000" xmlns="${JETSTAR_NAMESPACE}">${buildDistributionChain(distributionChain)}
  <!-- NDC protocol version specification - IATA NDC 21.3 standard -->
  <PayloadAttributes>
    <VersionNumber xmlns="${COMMON_TYPES_NAMESPACE}">21.3</VersionNumber>
  </PayloadAttributes>
  <!-- Offer pricing request with payment method criteria -->
  <Request>
    <!-- Flight and passenger data lists -->
    <DataLists xmlns="${COMMON_TYPES_NAMESPACE}">
      <!-- Flight segment information list -->
      <DatedMarketingSegmentList>${segmentList}</DatedMarketingSegmentList>
      <!-- Origin and destination list -->
      <OriginDestList>${originDestList}</OriginDestList>
      <!-- Passenger journey list -->
      <PaxJourneyList>${paxJourneyList}</PaxJourneyList>
      <!-- Passenger information list -->
      <PaxList>${paxList}</PaxList>
      <!-- Shopping request passenger segment list -->
      <ShoppingRequestPaxSegmentList>${paxSegmentList}</ShoppingRequestPaxSegmentList>
    </DataLists>
    <!-- Priced offer selection with all booking items -->
        <PricedOffer xmlns="${COMMON_TYPES_NAMESPACE}">
            <AcceptOrderItemList>${orderItemXml}
            </AcceptOrderItemList>
        </PricedOffer>
    <!-- Payment functions for surcharge calculation -->
    <PaymentFunctions xmlns="${COMMON_TYPES_NAMESPACE}">
      <PaymentMethodCriteria>
        <PaymentTypeCode>CC</PaymentTypeCode> <!-- Credit Card payment type -->
        <PaymentBrandCode>${escapeXml(cardBrand)}</PaymentBrandCode> <!-- Card brand code (VI, MC, AX, JCB, etc.) -->
      </PaymentMethodCriteria>
    </PaymentFunctions>
    <!-- Response currency parameter -->
    <ResponseParameters xmlns="${COMMON_TYPES_NAMESPACE}">
      <CurParameter>
        <CurCode>${escapeXml(currency)}</CurCode> <!-- Requested currency code -->
      </CurParameter>
    </ResponseParameters>
  </Request>
</IATA_OfferPriceRQ>`;

  return xml.trim();
}

export const longSellBuilder = {
  build: buildLongSellXml,
};
