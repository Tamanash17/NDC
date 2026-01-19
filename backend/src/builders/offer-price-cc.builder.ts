// ============================================================================
// OFFER PRICE WITH CC SURCHARGE BUILDER
// Uses SelectedOfferList structure (like working OfferPrice) + PaymentFunctions
//
// This builder creates an OfferPrice request with PaymentFunctions to calculate
// CC surcharge for a specific card brand. It uses the SAME structure as the
// working OfferPrice request, just adding PaymentFunctions and ResponseParameters.
//
// Key differences from Long Sell:
// - Uses SelectedOfferList with real OfferIDs (not AcceptOrderItemList)
// - References actual offer/item IDs from AirShopping response
// - Matches the exact structure that Jetstar's API expects
// ============================================================================

import { escapeXml } from "./base.builder.js";
import type { DistributionChain } from "../types/ndc.types.js";

const JETSTAR_NAMESPACE = "http://www.iata.org/IATA/2015/EASD/00/IATA_OffersAndOrdersMessage";
const COMMON_TYPES_NAMESPACE = "http://www.iata.org/IATA/2015/EASD/00/IATA_OffersAndOrdersCommonTypes";

// Reuse the same interfaces from the working offer-price builder
export interface OfferItem {
  offerItemId: string;
  paxRefIds: string[];
  isALaCarte?: boolean;
  serviceType?: string;
  segmentRefIds?: string[];
  journeyRefIds?: string[];
  legRefIds?: string[];
  associationType?: 'segment' | 'journey' | 'leg';
  seatRow?: string;
  seatColumn?: string;
}

export interface SelectedOffer {
  offerId: string;
  ownerCode: string;
  offerItems: OfferItem[];
  paxRefIds?: string[];
  offerItemIds?: string[];
}

export interface OfferPriceCCRequest {
  selectedOffers: SelectedOffer[];
  cardBrand: string; // VI, MC, AX
  currency: string;
  distributionChain?: DistributionChain;
  passengers?: {
    adults: number;
    children: number;
    infants: number;
  };
}

export interface CCFeeResult {
  cardBrand: string;
  ccSurcharge: number;
  surchargeType: 'fixed' | 'percentage' | 'unknown';
  rawResponse?: string;
  requestXml?: string;
  error?: string;
}

function buildDistributionChain(chain?: DistributionChain): string {
  if (!chain?.links || chain.links.length === 0) {
    // Default minimal distribution chain
    return `
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

// Generate fallback PaxRefIDs based on passenger counts
function generatePaxRefIds(passengers?: { adults: number; children: number; infants: number }): string[] {
  const pax = passengers || { adults: 1, children: 0, infants: 0 };
  const refs: string[] = [];

  for (let i = 0; i < pax.adults; i++) {
    refs.push(`ADT${i}`);
  }
  for (let i = 0; i < pax.children; i++) {
    refs.push(`CHD${i}`);
  }
  for (let i = 0; i < pax.infants; i++) {
    refs.push(`INF${i}`);
  }

  return refs;
}

/**
 * Build SelectedALaCarteOfferItem XML with flight associations
 */
function buildALaCarteOfferItemWithRefs(
  refType: 'segment' | 'journey' | 'leg',
  refIds: string[]
): string {
  if (refIds.length === 0) {
    return `
            <SelectedALaCarteOfferItem>
                <Qty>1</Qty>
            </SelectedALaCarteOfferItem>`;
  }

  let flightAssociations = '';

  if (refType === 'journey') {
    const journeyRefElements = refIds.map(refId =>
      `<PaxJourneyRefID>${escapeXml(refId)}</PaxJourneyRefID>`
    ).join('');

    flightAssociations = `
                <OfferFlightAssociations>
                    <PaxJourneyRef>${journeyRefElements}</PaxJourneyRef>
                </OfferFlightAssociations>`;
  } else if (refType === 'leg') {
    const legRefElements = refIds.map(refId =>
      `<DatedOperatingLegRefID>${escapeXml(refId)}</DatedOperatingLegRefID>`
    ).join('');

    flightAssociations = `
                <OfferFlightAssociations>
                    <DatedOperatingLegRef>${legRefElements}</DatedOperatingLegRef>
                </OfferFlightAssociations>`;
  } else {
    // segment - strip "Mkt-" prefix
    const segmentRefElements = refIds.map(refId => {
      const cleanRefId = refId.replace(/^Mkt-/, '');
      return `<PaxSegmentRefID>${escapeXml(cleanRefId)}</PaxSegmentRefID>`;
    }).join('');

    flightAssociations = `
                <OfferFlightAssociations>
                    <PaxSegmentReferences>${segmentRefElements}</PaxSegmentReferences>
                </OfferFlightAssociations>`;
  }

  return `
            <SelectedALaCarteOfferItem>${flightAssociations}
                <Qty>1</Qty>
            </SelectedALaCarteOfferItem>`;
}

/**
 * Build SelectedOfferItem entries for a la carte items
 */
function expandALaCarteItems(items: OfferItem[]): string {
  const expandedItems: string[] = [];

  for (const item of items) {
    const paxRefIdsXml = item.paxRefIds.map((paxId: string) =>
      `<PaxRefID>${escapeXml(paxId)}</PaxRefID>`
    ).join("");

    let refs: string[] = [];
    let refType: 'segment' | 'journey' | 'leg' = 'segment';

    if (item.associationType === 'journey' && item.journeyRefIds?.length) {
      refs = item.journeyRefIds;
      refType = 'journey';
    } else if (item.associationType === 'leg' && item.legRefIds?.length) {
      refs = item.legRefIds;
      refType = 'leg';
    } else if (item.segmentRefIds?.length) {
      refs = item.segmentRefIds;
      refType = 'segment';
    }

    if (refType === 'segment' && refs.length > 0) {
      // Segment-based: expand into separate items
      for (const segmentRef of refs) {
        let itemXml = `
          <SelectedOfferItem>
            <OfferItemRefID>${escapeXml(item.offerItemId)}</OfferItemRefID>${paxRefIdsXml}${buildALaCarteOfferItemWithRefs(refType, [segmentRef])}`;

        // Add SelectedSeat for seat items
        if (item.serviceType === 'seat' && item.seatRow && item.seatColumn) {
          itemXml += `
            <SelectedSeat>
              <SeatRowNumber>${escapeXml(item.seatRow)}</SeatRowNumber>
              <ColumnID>${escapeXml(item.seatColumn)}</ColumnID>
            </SelectedSeat>`;
        }

        itemXml += `</SelectedOfferItem>`;
        expandedItems.push(itemXml);
      }
    } else {
      // Journey/Leg-based: single item with all refs
      expandedItems.push(`
          <SelectedOfferItem>
            <OfferItemRefID>${escapeXml(item.offerItemId)}</OfferItemRefID>${paxRefIdsXml}${buildALaCarteOfferItemWithRefs(refType, refs)}</SelectedOfferItem>`);
    }
  }

  return expandedItems.join("");
}

/**
 * Build OfferPrice XML with PaymentFunctions for CC surcharge calculation
 *
 * This uses the SAME structure as the working OfferPrice request,
 * just adding PaymentFunctions to get the CC fee for a specific card brand.
 */
export function buildOfferPriceCCXml(input: OfferPriceCCRequest): string {
  const {
    selectedOffers,
    cardBrand,
    currency,
    distributionChain,
    passengers,
  } = input;

  const fallbackPaxRefIds = generatePaxRefIds(passengers);
  const timestamp = new Date().toISOString();

  // Count items for header
  const totalOfferItems = selectedOffers.reduce((sum, offer) => {
    return sum + (offer.offerItems?.length || offer.offerItemIds?.length || 0);
  }, 0);

  const headerComments = `<!-- ================================================================ -->
<!-- NDC OfferPrice Request - CC Surcharge Calculation -->
<!-- Generated: ${timestamp} -->
<!-- Card Brand: ${cardBrand} -->
<!-- Currency: ${currency} -->
<!-- Offers: ${selectedOffers.length}, Items: ${totalOfferItems} -->
<!-- ================================================================ -->
`;

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
${headerComments}<IATA_OfferPriceRQ xmlns="${JETSTAR_NAMESPACE}">${buildDistributionChain(distributionChain)}
  <Request>
    <PricedOffer xmlns="${COMMON_TYPES_NAMESPACE}">
      <SelectedOfferList>
        ${selectedOffers.map(offer => {
          if (offer.offerItems && offer.offerItems.length > 0) {
            const fareItems = offer.offerItems.filter(item => !item.isALaCarte);
            const aLaCarteItems = offer.offerItems.filter(item => item.isALaCarte);

            return `
        <SelectedOffer>
          <OfferRefID>${escapeXml(offer.offerId)}</OfferRefID>
          <OwnerCode>${escapeXml(offer.ownerCode)}</OwnerCode>${fareItems.map(item => `
          <SelectedOfferItem>
            <OfferItemRefID>${escapeXml(item.offerItemId)}</OfferItemRefID>${item.paxRefIds.map(paxId => `<PaxRefID>${escapeXml(paxId)}</PaxRefID>`).join("")}</SelectedOfferItem>`).join("")}${expandALaCarteItems(aLaCarteItems)}</SelectedOffer>`;
          }

          // Legacy fallback
          const paxRefIds = offer.paxRefIds?.length ? offer.paxRefIds : fallbackPaxRefIds;
          const itemIds = offer.offerItemIds || [];
          return `
        <SelectedOffer>
          <OfferRefID>${escapeXml(offer.offerId)}</OfferRefID>
          <OwnerCode>${escapeXml(offer.ownerCode)}</OwnerCode>${itemIds.map(itemId => `
          <SelectedOfferItem>
            <OfferItemRefID>${escapeXml(itemId)}</OfferItemRefID>${paxRefIds.map(paxId => `<PaxRefID>${escapeXml(paxId)}</PaxRefID>`).join("")}
          </SelectedOfferItem>`).join("")}
        </SelectedOffer>`;
        }).join("")}
      </SelectedOfferList>
    </PricedOffer>
    <PaymentFunctions xmlns="${COMMON_TYPES_NAMESPACE}">
      <PaymentMethodCriteria>
        <PaymentTypeCode>CC</PaymentTypeCode>
        <PaymentBrandCode>${escapeXml(cardBrand)}</PaymentBrandCode>
      </PaymentMethodCriteria>
    </PaymentFunctions>
    <ResponseParameters xmlns="${COMMON_TYPES_NAMESPACE}">
      <CurParameter>
        <CurCode>${escapeXml(currency)}</CurCode>
      </CurParameter>
    </ResponseParameters>
  </Request>
</IATA_OfferPriceRQ>`;

  return xml.trim();
}

export const offerPriceCCBuilder = {
  build: buildOfferPriceCCXml,
};
