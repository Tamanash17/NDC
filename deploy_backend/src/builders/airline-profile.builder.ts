// ============================================================================
// AIRLINE PROFILE XML BUILDER
// Builds XML for fetching airline route network (origin-destination pairs)
// ============================================================================

import { config } from "../config/index.js";

const NS_MESSAGE = "http://www.iata.org/IATA/2015/EASD/00/IATA_OffersAndOrdersMessage";
const NS_COMMON = "http://www.iata.org/IATA/2015/EASD/00/IATA_OffersAndOrdersCommonTypes";

export interface AirlineProfileInput {
  ownerCode: string; // Airline code (e.g., "NV" for Jetstar)
  distributionChain?: {
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
 * Build AirlineProfile XML to fetch route network from airline
 */
export function buildAirlineProfileXml(input: AirlineProfileInput): string {
  const orgId = input.distributionChain?.links?.[0]?.orgId || config.distributionChain.orgCode;
  const orgRole = input.distributionChain?.links?.[0]?.orgRole || "Seller";
  const ordinal = input.distributionChain?.links?.[0]?.ordinal || 1;

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<IATA_AirlineProfileRQ xmlns="${NS_MESSAGE}">
  <DistributionChain>
    <DistributionChainLink xmlns="${NS_COMMON}">
      <Ordinal>${ordinal}</Ordinal>
      <ParticipatingOrg>
        <OrgID>${escapeXml(orgId)}</OrgID>
        <OrgRole>${orgRole}</OrgRole>
      </ParticipatingOrg>
    </DistributionChainLink>
  </DistributionChain>
  <PayloadAttributes>
    <VersionNumber xmlns="${NS_COMMON}">21.3</VersionNumber>
  </PayloadAttributes>
  <Request>
    <AirlineProfileFilterCriteria xmlns="${NS_COMMON}">
      <AirlineProfileCriteria>
        <OwnerCode>${escapeXml(input.ownerCode)}</OwnerCode>
      </AirlineProfileCriteria>
    </AirlineProfileFilterCriteria>
  </Request>
</IATA_AirlineProfileRQ>`;

  return xml.trim();
}

export const airlineProfileBuilder = {
  build: buildAirlineProfileXml,
};
