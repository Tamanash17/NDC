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

function buildDistributionChain(input: AirlineProfileInput): string {
  if (input.distributionChain?.links && input.distributionChain.links.length > 0) {
    // Use provided distribution chain links (supports both Direct and BOB)
    return `
  <!-- Partner distribution chain configuration - Defines seller and optional distributor -->
  <DistributionChain>
    ${input.distributionChain.links.map(link => `
    <!-- Distribution chain participant ${link.ordinal} - ${link.orgRole} -->
    <DistributionChainLink xmlns="${NS_COMMON}">
      <Ordinal>${link.ordinal}</Ordinal>
      <ParticipatingOrg>
        <OrgID>${escapeXml(link.orgId)}</OrgID>
        <OrgRole>${escapeXml(link.orgRole)}</OrgRole>
      </ParticipatingOrg>
    </DistributionChainLink>`).join("")}
  </DistributionChain>`;
  } else {
    // Fallback to config defaults (single seller)
    const orgId = config.distributionChain.orgCode;
    return `
  <!-- Partner distribution chain configuration - Defines seller and optional distributor -->
  <DistributionChain>
    <!-- Distribution chain participant 1 - Seller -->
    <DistributionChainLink xmlns="${NS_COMMON}">
      <Ordinal>1</Ordinal>
      <ParticipatingOrg>
        <OrgID>${escapeXml(orgId)}</OrgID>
        <OrgRole>Seller</OrgRole>
      </ParticipatingOrg>
    </DistributionChainLink>
  </DistributionChain>`;
  }
}

/**
 * Build AirlineProfile XML to fetch route network from airline
 */
export function buildAirlineProfileXml(input: AirlineProfileInput): string {
  // Get current timestamp for request tracking
  const timestamp = new Date().toISOString();

  // Build header comments with request details
  const headerComments = `<!-- ================================================================ -->
<!-- NDC AirlineProfile Request - Fetch Route Network -->
<!-- Generated: ${timestamp} -->
<!-- Airline Code: ${input.ownerCode} -->
<!-- Distribution Chain: ${input.distributionChain?.links?.length || 1} participant(s) -->
<!-- ================================================================ -->
`;

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
${headerComments}<IATA_AirlineProfileRQ xmlns="${NS_MESSAGE}">${buildDistributionChain(input)}
  <!-- NDC protocol version specification - IATA NDC 21.3 standard -->
  <PayloadAttributes>
    <VersionNumber xmlns="${NS_COMMON}">21.3</VersionNumber>
  </PayloadAttributes>
  <!-- Airline profile query request for route network -->
  <Request>
    <AirlineProfileFilterCriteria xmlns="${NS_COMMON}">
      <AirlineProfileCriteria>
        <OwnerCode>${escapeXml(input.ownerCode)}</OwnerCode> <!-- Airline code for route network query -->
      </AirlineProfileCriteria>
    </AirlineProfileFilterCriteria>
  </Request>
</IATA_AirlineProfileRQ>`;

  return xml.trim();
}

export const airlineProfileBuilder = {
  build: buildAirlineProfileXml,
};
