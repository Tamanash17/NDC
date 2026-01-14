// ============================================================================
// SEAT AVAILABILITY XML BUILDER - NDC v21.3
// ============================================================================

import fs from 'fs';
import path from 'path';
import {
  escapeXml,
} from "./base.builder.js";
import type { SeatAvailabilityRequest } from "../types/api.types.js";
import type { DistributionChain } from "../types/ndc.types.js";

export interface SeatAvailabilityBuildOptions {
  distributionChain?: DistributionChain;
}

// NDC v21.3 namespaces for SeatAvailability
const NDC_V21_3_MESSAGE_NS = "http://www.iata.org/IATA/2015/EASD/00/IATA_OffersAndOrdersMessage";
const NDC_V21_3_COMMON_NS = "http://www.iata.org/IATA/2015/EASD/00/IATA_OffersAndOrdersCommonTypes";

// Build DistributionChain XML same as OfferPrice builder - iterate through ALL links
function buildDistributionChain(chain?: DistributionChain): string {
  // Distribution chain must be provided from user input
  if (!chain?.links || chain.links.length === 0) {
    throw new Error('Distribution chain is required - please configure seller/distributor in the wizard');
  }

  return `
  <!-- Partner distribution chain configuration - Defines seller and optional distributor -->
  <DistributionChain>
    ${chain.links.map(link => `
    <!-- Distribution chain participant ${link.ordinal} - ${link.orgRole} -->
    <DistributionChainLink xmlns="${NDC_V21_3_COMMON_NS}">
      <Ordinal>${link.ordinal}</Ordinal>
      <OrgRole>${escapeXml(link.orgRole)}</OrgRole>
      <ParticipatingOrg>
        <Name>${escapeXml(link.orgName)}</Name>
        <OrgID>${escapeXml(link.orgId)}</OrgID>
      </ParticipatingOrg>
    </DistributionChainLink>`).join("")}
  </DistributionChain>`;
}

export function buildSeatAvailabilityXml(
  input: SeatAvailabilityRequest,
  options?: SeatAvailabilityBuildOptions
): string {
  const chain = options?.distributionChain || input.distributionChain;

  // Build DistributionChain XML using helper (same pattern as OfferPrice)
  const distributionChainXml = buildDistributionChain(chain);

  // Build Offer structure - supports BOTH legacy single-offer and new multi-offer format
  // NEW FORMAT (preferred for round-trip): Use input.offers array to build MULTIPLE <Offer> elements
  // LEGACY FORMAT (one-way): Use input.offerId + input.offerItemIds to build SINGLE <Offer> element
  let offerXml = '';

  if (input.offers && input.offers.length > 0) {
    // NEW MULTI-OFFER FORMAT - Build multiple <Offer> elements (one per direction)
    // This is the CORRECT format for round-trip flights as per Postman example
    // IMPORTANT: Segment refs go on the OFFER level, NOT on individual OfferItems
    offerXml = input.offers.map(offer => {
      const offerItems = offer.offerItemIds.map(itemId => `
                  <OfferItem>
                    <OfferItemID>${escapeXml(itemId)}</OfferItemID>
                  </OfferItem>`).join("");

      return `
                  <Offer>
                    <OfferID>${escapeXml(offer.offerId)}</OfferID>
                    <OwnerCode>${escapeXml(offer.ownerCode)}</OwnerCode>${offerItems}</Offer>`;
    }).join("");
  } else if (input.offerId && input.offerItemIds) {
    // LEGACY SINGLE-OFFER FORMAT - Build single <Offer> element
    // Each offerItem gets ALL segment refs (if provided)
    const offerItems = input.offerItemIds.map(itemId => {
      // Only include PaxSegmentRefID if segments are provided and not empty
      let segmentRefs = '';
      if (input.segmentRefIds && input.segmentRefIds.length > 0) {
        segmentRefs = input.segmentRefIds.map(segId => `
                    <PaxSegmentRefID>${escapeXml(segId)}</PaxSegmentRefID>`).join("");
      }

      return `
                  <OfferItem>
                    <OfferItemID>${escapeXml(itemId)}</OfferItemID>${segmentRefs}</OfferItem>`;
    }).join("");

    offerXml = `
                  <Offer>
                    <OfferID>${escapeXml(input.offerId)}</OfferID>
                    <OwnerCode>${escapeXml(input.ownerCode)}</OwnerCode>${offerItems}</Offer>`;
  }

  // NOTE: Postman reference implementation does NOT include ShoppingResponseID
  // Jetstar maintains session context through other means (likely auth token/session)
  // Including ShoppingResponseID causes Jetstar to IGNORE it and create new contexts anyway

  // Get current timestamp for request tracking
  const timestamp = new Date().toISOString();

  // Collect offer details for comprehensive header comments
  const offerCount = input.offers?.length || (input.offerId ? 1 : 0);
  const segmentCount = input.segmentRefIds?.length || 0;

  // Build detailed offer information for each offer/direction
  let offerDetailsComments = '';
  if (input.offers && input.offers.length > 0) {
    // Multi-offer format (typically round-trip)
    input.offers.forEach((offer, idx) => {
      const direction = idx === 0 ? 'Outbound' : idx === 1 ? 'Return' : `Segment ${idx + 1}`;
      offerDetailsComments += `<!--   ${direction} Flight: -->\n`;
      offerDetailsComments += `<!--     - Offer ID: ${offer.offerId} -->\n`;
      offerDetailsComments += `<!--     - Owner: ${offer.ownerCode} -->\n`;
      offerDetailsComments += `<!--     - Offer Items: ${offer.offerItemIds.length} item(s) -->\n`;
      offerDetailsComments += `<!--     - Item IDs: ${offer.offerItemIds.join(', ')} -->\n`;
    });
  } else if (input.offerId) {
    // Single offer format (typically one-way)
    offerDetailsComments += `<!--   Flight: -->\n`;
    offerDetailsComments += `<!--     - Offer ID: ${input.offerId} -->\n`;
    offerDetailsComments += `<!--     - Owner: ${input.ownerCode} -->\n`;
    offerDetailsComments += `<!--     - Offer Items: ${input.offerItemIds?.length || 0} item(s) -->\n`;
    if (input.offerItemIds) {
      offerDetailsComments += `<!--     - Item IDs: ${input.offerItemIds.join(', ')} -->\n`;
    }
    if (input.segmentRefIds && input.segmentRefIds.length > 0) {
      offerDetailsComments += `<!--     - Segment Refs: ${input.segmentRefIds.join(', ')} -->\n`;
    }
  }

  // Build comprehensive header comments
  const headerComments = `<!-- ================================================================ -->
<!-- NDC SeatAvailability Request - Seat Map and Availability Query -->
<!-- Generated: ${timestamp} -->
<!-- Workflow: Step 5 - Seat Selection -->
<!-- ================================================================ -->
<!--  -->
<!-- REQUEST PURPOSE: -->
<!--   Query available seats for selected flight(s) to display seat map -->
<!--   User will select specific seats which will be added to OfferPrice -->
<!--  -->
<!-- FLIGHT INFORMATION: -->
<!--   Total Offers: ${offerCount} (${offerCount === 1 ? 'One-way' : offerCount === 2 ? 'Round-trip' : 'Multi-segment'}) -->
${offerDetailsComments}<!--  -->
<!-- CONTEXT FROM PREVIOUS STEPS: -->
<!--   - Step 1: AirShopping returned available flights -->
<!--   - Step 2: OfferPrice calculated price for selected flight + bundle -->
<!--   - Step 3-4: User may have selected ancillaries (baggage/meals) -->
<!--   - Step 5: NOW requesting seat maps for seat selection -->
<!--   - Next Step: Selected seats will be included in final OfferPrice -->
<!--  -->
<!-- IMPORTANT NOTES: -->
<!--   - Seat selection is optional but recommended for preferred seating -->
<!--   - Seat charges vary by location (extra legroom, window, aisle, etc.) -->
<!--   - Selected seats are added to booking via OfferPrice then OrderCreate -->
<!--   - ShoppingResponseID is NOT included (Jetstar maintains session via auth) -->
<!--  -->
<!-- Distribution Chain: ${chain?.links?.length || 0} participant(s) -->
<!-- ================================================================ -->
`;

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
${headerComments}<IATA_SeatAvailabilityRQ xmlns="${NDC_V21_3_MESSAGE_NS}">${distributionChainXml}
  <!-- NDC protocol version specification - IATA NDC 21.3 standard -->
  <PayloadAttributes>
    <VersionNumber xmlns="${NDC_V21_3_COMMON_NS}">21.3</VersionNumber>
  </PayloadAttributes>
  <!-- Seat availability request for selected offers -->
  <Request>
    <!-- Core seat availability query parameters -->
    <SeatAvailCoreRequest xmlns="${NDC_V21_3_COMMON_NS}">
      <!-- Offer selection for seat map retrieval -->
      <OfferRequest>${offerXml}</OfferRequest>
    </SeatAvailCoreRequest>
  </Request>
</IATA_SeatAvailabilityRQ>`;

  const trimmedXml = xml.trim();

  // Save XML to file for debugging (sync to avoid async issues)
  try {
    const logsDir = path.join(process.cwd(), 'logs', 'xml');
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = path.join(logsDir, `seatavailability-request-${timestamp}.xml`);
    fs.writeFileSync(filename, trimmedXml, 'utf8');
    console.log(`[SeatAvailabilityBuilder] ✅ XML request saved to: ${filename}`);
  } catch (err) {
    console.error('[SeatAvailabilityBuilder] Failed to save XML:', err);
  }

  return trimmedXml;
}

export const seatAvailabilityBuilder = {
  build: buildSeatAvailabilityXml,
};