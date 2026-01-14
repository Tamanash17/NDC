// ============================================================================
// SERVICE LIST XML BUILDER - Jetstar NDC 21.3 Format
// Based on Jetstar NDC API Postman collection
// ============================================================================

import {
  escapeXml,
} from "./base.builder.js";
import type { ServiceListRequest } from "../types/api.types.js";
import type { DistributionChain } from "../types/ndc.types.js";

// Jetstar uses IATA 2015 namespace for NDC 21.3
const IATA_NAMESPACE = "http://www.iata.org/IATA/2015/EASD/00/IATA_OffersAndOrdersMessage";
const IATA_COMMON_NAMESPACE = "http://www.iata.org/IATA/2015/EASD/00/IATA_OffersAndOrdersCommonTypes";

export interface ServiceListBuildOptions {
  distributionChain?: DistributionChain;
}

/**
 * Build a DistributionChainLink element
 */
function buildDistributionChainLink(
  ordinal: number,
  orgRole: string,
  orgName: string,
  orgCode: string
): string {
  if (!orgRole || !orgName || !orgCode) return "";

  return `
    <!-- Distribution chain participant ${ordinal} - ${orgRole} -->
    <DistributionChainLink xmlns="${IATA_COMMON_NAMESPACE}">
      <Ordinal>${ordinal}</Ordinal>
      <OrgRole>${escapeXml(orgRole)}</OrgRole>
      <ParticipatingOrg>
        <Name>${escapeXml(orgName)}</Name>
        <OrgID>${escapeXml(orgCode)}</OrgID>
      </ParticipatingOrg>
    </DistributionChainLink>`;
}

/**
 * Build the DistributionChain element
 */
function buildDistributionChain(chain?: DistributionChain): string {
  if (!chain?.links || chain.links.length === 0) {
    return "";
  }

  const chainLinks = chain.links
    .filter(link => link.orgRole && link.orgName && link.orgId)
    .map(link => buildDistributionChainLink(
      link.ordinal,
      link.orgRole,
      link.orgName || "",
      link.orgId
    ))
    .join("");

  return `
  <!-- Partner distribution chain configuration - Defines seller and optional distributor -->
  <DistributionChain>${chainLinks}
  </DistributionChain>`;
}

/**
 * Build OfferItem elements for a single offer
 */
function buildOfferItems(
  offerItems: Array<{ offerItemId: string; serviceId?: string; paxRefIds?: string[] }>
): string {
  return offerItems
    .map(item => `
        <OfferItem>
          <OfferItemID>${escapeXml(item.offerItemId)}</OfferItemID>
          <Service>
            <ServiceID>${escapeXml(item.serviceId || item.offerItemId)}</ServiceID>
          </Service>
        </OfferItem>`)
    .join("");
}

/**
 * Build a single Offer element
 */
function buildOffer(
  offerId: string,
  ownerCode: string,
  offerItems: Array<{ offerItemId: string; serviceId?: string; paxRefIds?: string[] }>
): string {
  return `
      <Offer>
        <OfferID>${escapeXml(offerId)}</OfferID>
        ${buildOfferItems(offerItems)}
        <OwnerCode>${escapeXml(ownerCode)}</OwnerCode>
      </Offer>`;
}

/**
 * Build ServiceList XML request following Jetstar NDC 21.3 format
 */
export function buildServiceListXml(
  input: ServiceListRequest,
  options?: ServiceListBuildOptions
): string {
  const chain = options?.distributionChain || input.distributionChain;
  const ownerCode = input.ownerCode || "JQ";

  // Build offer elements
  let offersXml = "";

  if (input.selectedOffers && input.selectedOffers.length > 0) {
    // Use selectedOffers array (preferred format)
    offersXml = input.selectedOffers
      .map(offer => buildOffer(
        offer.offerId,
        offer.ownerCode || ownerCode,
        offer.offerItems || []
      ))
      .join("");
  } else if (input.offerId) {
    // Legacy single offer format
    const offerItems = input.offerItemIds?.map(id => ({ offerItemId: id })) || [];
    offersXml = buildOffer(input.offerId, ownerCode, offerItems);
  }

  // Get current timestamp for request tracking
  const timestamp = new Date().toISOString();

  // Extract order ID from first offer for header comments
  const firstOfferId = input.selectedOffers?.[0]?.offerId || input.offerId || 'N/A';

  // Build header comments with request details
  const headerComments = `<!-- ================================================================ -->
<!-- NDC ServiceList Request - Available Ancillary Services Query -->
<!-- Generated: ${timestamp} -->
<!-- Offer ID: ${firstOfferId} -->
<!-- Owner Code: ${ownerCode} (Jetstar) -->
<!-- Distribution Chain: ${chain?.links?.length || 0} participant(s) -->
<!-- ================================================================ -->
`;

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
${headerComments}<IATA_ServiceListRQ xmlns="${IATA_NAMESPACE}">${buildDistributionChain(chain)}
  <!-- NDC protocol version specification - IATA NDC 21.3 standard -->
  <PayloadAttributes>
    <VersionNumber xmlns="${IATA_COMMON_NAMESPACE}">21.3</VersionNumber>
  </PayloadAttributes>
  <!-- Service list query request for available ancillary services -->
  <Request>
    <ServiceListCoreRequest xmlns="${IATA_COMMON_NAMESPACE}">
      <OfferRequest>${offersXml}
      </OfferRequest>
    </ServiceListCoreRequest>
  </Request>
</IATA_ServiceListRQ>`;

  return xml.trim();
}

export const serviceListBuilder = {
  build: buildServiceListXml,
};
