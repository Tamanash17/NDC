// ============================================================================
// AIR SHOPPING XML BUILDER
// Builds XML matching the Jetstar NDC 21.3 format from Postman collection
// ============================================================================

import { config } from "../config/index.js";

const NS_MESSAGE = "http://www.iata.org/IATA/2015/EASD/00/IATA_OffersAndOrdersMessage";
const NS_COMMON = "http://www.iata.org/IATA/2015/EASD/00/IATA_OffersAndOrdersCommonTypes";

export interface ServiceCriteriaConfig {
  includeInd: boolean;
  RFIC: string;
  RFISC: string;
}

export interface NdcConfig {
  offerCriteria?: {
    serviceCriteria?: ServiceCriteriaConfig[];
  };
}

export interface AirShoppingInput {
  origin: string;
  destination: string;
  departureDate: string;
  returnDate?: string;
  // Open jaw support: specify different return origin/destination
  returnOrigin?: string;      // Where return flight departs from (defaults to destination)
  returnDestination?: string; // Where return flight arrives (defaults to origin)
  passengers: Array<{ ptc: 'ADT' | 'CHD' | 'INF'; count: number }>;
  cabinPreference?: string;
  promoCode?: string;
  currency?: string;
  ndcConfig?: NdcConfig;
  distributionChain?: {
    ownerCode?: string;
    links?: Array<{
      ordinal: number;
      orgRole: string;
      orgId: string;
      orgName?: string;
    }>;
  };
}

function escapeXml(value: string | undefined | null): string {
  if (!value) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Build OfferCriteria XML from NDC config and promo code
 * Returns empty string if no criteria configured
 */
function buildOfferCriteria(ndcConfig?: NdcConfig, promoCode?: string): string {
  const hasServiceCriteria = ndcConfig?.offerCriteria?.serviceCriteria?.length;
  const hasPromoCode = promoCode && promoCode.trim().length > 0;

  // Return empty if nothing to include
  if (!hasServiceCriteria && !hasPromoCode) {
    return '';
  }

  let innerXml = '';

  // Add PromotionCriteria if promo code provided
  if (hasPromoCode) {
    innerXml += `      <PromotionCriteria>
        <PromotionID>${escapeXml(promoCode.trim())}</PromotionID>
      </PromotionCriteria>\n`;
  }

  // Add ServiceCriteria if configured
  if (hasServiceCriteria) {
    const serviceCriteriaXml = ndcConfig!.offerCriteria!.serviceCriteria!
      .map(sc => `      <ServiceCriteria>
        <IncludeInd>${sc.includeInd}</IncludeInd>
        <RFIC>${escapeXml(sc.RFIC)}</RFIC>
        <RFISC>${escapeXml(sc.RFISC)}</RFISC>
      </ServiceCriteria>`)
      .join('\n');
    innerXml += serviceCriteriaXml;
  }

  return `    <OfferCriteria xmlns="${NS_COMMON}">
${innerXml}
    </OfferCriteria>`;
}

/**
 * Build AirShopping XML matching Jetstar NDC format exactly
 */
export function buildAirShoppingXml(input: AirShoppingInput): string {
  const orgCode = input.distributionChain?.links?.[0]?.orgId || config.distributionChain.orgCode;
  const orgName = input.distributionChain?.links?.[0]?.orgName || config.distributionChain.orgName;

  // Build distribution chain - single seller for Direct booking
  const distributionChainXml = `
<DistributionChain>
  <DistributionChainLink xmlns="${NS_COMMON}">
    <Ordinal>1</Ordinal>
    <OrgRole>Seller</OrgRole>
    <ParticipatingOrg>
      <Name>${escapeXml(orgName)}</Name>
      <OrgID>${escapeXml(orgCode)}</OrgID>
    </ParticipatingOrg>
  </DistributionChainLink>
</DistributionChain>`;

  // Cabin type code mapping (from Jetstar NDC Postman collection):
  // 5 = Economy (M)
  // 2 = Business (C)
  // 3 = First (F)
  // Default to Economy if not specified
  const cabinTypeCode = input.cabinPreference === 'C' ? '2' :
                        input.cabinPreference === 'F' ? '3' : '5';

  // Build origin-dest criteria - matching Postman format exactly
  let originDestCriteria = `
  <OriginDestCriteria>
    <CabinType>
      <PrefLevel>Required</PrefLevel>
      <CabinTypeCode>${cabinTypeCode}</CabinTypeCode>
    </CabinType>
    <DestArrivalCriteria>
      <IATA_LocationCode>${escapeXml(input.destination)}</IATA_LocationCode>
    </DestArrivalCriteria>
    <OriginDepCriteria>
      <Date>${escapeXml(input.departureDate)}</Date>
      <IATA_LocationCode>${escapeXml(input.origin)}</IATA_LocationCode>
    </OriginDepCriteria>
  </OriginDestCriteria>`;

  // Add return journey if specified
  // Supports open jaw: returnOrigin (where return departs) and returnDestination (where return arrives)
  if (input.returnDate) {
    const returnFrom = input.returnOrigin || input.destination;  // Default: return from outbound destination
    const returnTo = input.returnDestination || input.origin;    // Default: return to outbound origin

    originDestCriteria += `
  <OriginDestCriteria>
    <CabinType>
      <PrefLevel>Required</PrefLevel>
      <CabinTypeCode>${cabinTypeCode}</CabinTypeCode>
    </CabinType>
    <DestArrivalCriteria>
      <IATA_LocationCode>${escapeXml(returnTo)}</IATA_LocationCode>
    </DestArrivalCriteria>
    <OriginDepCriteria>
      <Date>${escapeXml(input.returnDate)}</Date>
      <IATA_LocationCode>${escapeXml(returnFrom)}</IATA_LocationCode>
    </OriginDepCriteria>
  </OriginDestCriteria>`;
  }

  // Build passenger list - index per PTC type (ADT0, ADT1, CHD0, INF0, etc.)
  const paxList: string[] = [];
  const ptcIndexes: Map<string, number> = new Map();  // Track index per PTC type
  for (const paxGroup of input.passengers) {
    for (let i = 0; i < paxGroup.count; i++) {
      // Get current index for this PTC (default to 0)
      const paxIndex = ptcIndexes.get(paxGroup.ptc) ?? 0;
      paxList.push(`
      <Pax>
        <PaxID>${paxGroup.ptc}${paxIndex}</PaxID>
        <PTC>${paxGroup.ptc}</PTC>
      </Pax>`);
      ptcIndexes.set(paxGroup.ptc, paxIndex + 1);
    }
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<IATA_AirShoppingRQ xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
   xmlns:xsd="http://www.w3.org/2001/XMLSchema"
   xmlns="${NS_MESSAGE}">
  ${distributionChainXml}
  <PayloadAttributes>
    <VersionNumber xmlns="${NS_COMMON}">21.3</VersionNumber>
  </PayloadAttributes>
  <Request>
    <FlightRequest xmlns="${NS_COMMON}">
      <FlightRequestOriginDestinationsCriteria>
        ${originDestCriteria}
      </FlightRequestOriginDestinationsCriteria>
    </FlightRequest>
${buildOfferCriteria(input.ndcConfig, input.promoCode)}
    <PaxList xmlns="${NS_COMMON}">${paxList.join('')}
    </PaxList>
    <ResponseParameters xmlns="${NS_COMMON}">
      <CurParameter>
        <CurCode>${escapeXml(input.currency || 'AUD')}</CurCode>
      </CurParameter>
    </ResponseParameters>
  </Request>
</IATA_AirShoppingRQ>`;

  return xml.trim();
}

// Export as object for compatibility
export const airShoppingBuilder = {
  build: buildAirShoppingXml,
};
