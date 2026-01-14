// ============================================================================
// OFFER PRICE XML BUILDER
// Jetstar-specific OfferPrice request builder
// ============================================================================

import { escapeXml } from "./base.builder.js";
import type { OfferPriceRequest } from "../types/api.types.js";
import type { DistributionChain } from "../types/ndc.types.js";

// Jetstar uses the EASD namespace for OfferPrice
const JETSTAR_NAMESPACE = "http://www.iata.org/IATA/2015/EASD/00/IATA_OffersAndOrdersMessage";
const COMMON_TYPES_NAMESPACE = "http://www.iata.org/IATA/2015/EASD/00/IATA_OffersAndOrdersCommonTypes";

export interface OfferPriceBuildOptions {
  distributionChain?: DistributionChain;
}

function buildDistributionChain(chain?: DistributionChain): string {
  // Distribution chain must be provided from user input
  if (!chain?.links || chain.links.length === 0) {
    throw new Error('Distribution chain is required - please configure seller/distributor in the wizard');
  }

  return `
  <DistributionChain>
    ${chain.links.map(link => `
    <DistributionChainLink xmlns="${COMMON_TYPES_NAMESPACE}">
      <Ordinal>${link.ordinal}</Ordinal>
      <OrgRole>${escapeXml(link.orgRole)}</OrgRole>
      <ParticipatingOrg>
        <Name>${escapeXml(link.orgName)}</Name>
        <OrgID>${escapeXml(link.orgId)}</OrgID>
      </ParticipatingOrg>
    </DistributionChainLink>`).join("")}
  </DistributionChain>`;
}

// Generate PaxRefIDs based on passenger counts
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
 * Build SelectedALaCarteOfferItem XML with ALL segment/journey/leg references.
 * CRITICAL: Jetstar bundles can have MULTIPLE journey/segment refs (e.g., round trip bundles).
 * We must include ALL refs in a SINGLE OfferFlightAssociations block, not create separate items.
 */
function buildALaCarteOfferItemWithRefs(
  refType: 'segment' | 'journey' | 'leg',
  refIds: string[]
): string {
  if (refIds.length === 0) {
    // No flight associations - bundle applies to all flights
    return `
            <SelectedALaCarteOfferItem>
                <Qty>1</Qty>
            </SelectedALaCarteOfferItem>`;
  }

  let flightAssociations = '';

  if (refType === 'journey') {
    const journeyRefElements = refIds.map(refId =>
      `<PaxJourneyRefID>${escapeXml(refId)}</PaxJourneyRefID>`
    ).join('\n                        ');

    flightAssociations = `
                <OfferFlightAssociations>
                    <PaxJourneyRef>
                        ${journeyRefElements}
                    </PaxJourneyRef>
                </OfferFlightAssociations>`;
  } else if (refType === 'leg') {
    const legRefElements = refIds.map(refId =>
      `<DatedOperatingLegRefID>${escapeXml(refId)}</DatedOperatingLegRefID>`
    ).join('\n                        ');

    flightAssociations = `
                <OfferFlightAssociations>
                    <DatedOperatingLegRef>
                        ${legRefElements}
                    </DatedOperatingLegRef>
                </OfferFlightAssociations>`;
  } else {
    // segment
    // CRITICAL FIX: Strip "Mkt-" prefix from segment IDs
    // Jetstar expects just "seg123" format, not "Mkt-seg123"
    const segmentRefElements = refIds.map(refId => {
      const cleanRefId = refId.replace(/^Mkt-/, '');
      return `<PaxSegmentRefID>${escapeXml(cleanRefId)}</PaxSegmentRefID>`;
    }).join('\n                        ');

    flightAssociations = `
                <OfferFlightAssociations>
                    <PaxSegmentReferences>
                        ${segmentRefElements}
                    </PaxSegmentReferences>
                </OfferFlightAssociations>`;
  }

  return `
            <SelectedALaCarteOfferItem>${flightAssociations}
                <Qty>1</Qty>
            </SelectedALaCarteOfferItem>`;
}

/**
 * Build SelectedOfferItem entries for a la carte items.
 * CRITICAL LOGIC:
 * - For JOURNEY-based items (bundles): Create ONE SelectedOfferItem with ALL journey refs
 * - For SEGMENT-based items (baggage, meals): Create SEPARATE SelectedOfferItem per segment ref
 *
 * This is because:
 * - Bundles apply at journey level (one bundle for entire outbound journey)
 * - Baggage applies at segment level (one bag per segment = separate charges)
 */
function expandALaCarteItems(items: any[]): string {
  const expandedItems: string[] = [];

  for (const item of items) {
    const paxRefIdsXml = item.paxRefIds.map((paxId: string) =>
      `
            <PaxRefID>${escapeXml(paxId)}</PaxRefID>`
    ).join("");

    // Determine which refs to use based on association type
    let refs: string[] = [];
    let refType: 'segment' | 'journey' | 'leg' = 'segment';

    if (item.associationType === 'journey' && item.journeyRefIds?.length > 0) {
      refs = item.journeyRefIds;
      refType = 'journey';
    } else if (item.associationType === 'leg' && item.legRefIds?.length > 0) {
      refs = item.legRefIds;
      refType = 'leg';
    } else if (item.segmentRefIds?.length > 0) {
      refs = item.segmentRefIds;
      refType = 'segment';
    }

    // CRITICAL EXPANSION LOGIC:
    // - SEGMENT-based items: Create separate SelectedOfferItem per segment
    // - JOURNEY/LEG-based items: Create ONE SelectedOfferItem with all refs
    if (refType === 'segment' && refs.length > 0) {
      // SEGMENT-based: Expand into separate items (one per segment)
      console.log(`[OfferPriceBuilder] Expanding segment-based item ${item.offerItemId} into ${refs.length} separate items`);
      for (const segmentRef of refs) {
        // Build base SelectedOfferItem with SelectedALaCarteOfferItem
        let itemXml = `
          <SelectedOfferItem>
            <OfferItemRefID>${escapeXml(item.offerItemId)}</OfferItemRefID>${paxRefIdsXml}${buildALaCarteOfferItemWithRefs(refType, [segmentRef])}`;

        // CRITICAL: Add <SelectedSeat> element for seat service types
        // Jetstar requires <SeatRowNumber> and <ColumnID> for seat selections in OfferPrice
        if (item.serviceType === 'seat' && item.seatRow && item.seatColumn) {
          console.log(`[OfferPriceBuilder] Adding SelectedSeat element: Row ${item.seatRow}, Column ${item.seatColumn}`);
          itemXml += `
            <SelectedSeat>
              <SeatRowNumber>${escapeXml(item.seatRow)}</SeatRowNumber>
              <ColumnID>${escapeXml(item.seatColumn)}</ColumnID>
            </SelectedSeat>`;
        }

        itemXml += `
          </SelectedOfferItem>`;

        expandedItems.push(itemXml);
      }
    } else {
      // JOURNEY/LEG-based: Create ONE item with all refs
      console.log(`[OfferPriceBuilder] Creating single ${refType}-based item ${item.offerItemId} with ${refs.length} refs`);
      expandedItems.push(`
          <SelectedOfferItem>
            <OfferItemRefID>${escapeXml(item.offerItemId)}</OfferItemRefID>${paxRefIdsXml}${buildALaCarteOfferItemWithRefs(refType, refs)}
          </SelectedOfferItem>`);
    }
  }

  return expandedItems.join("");
}

export function buildOfferPriceXml(
  input: OfferPriceRequest,
  options?: OfferPriceBuildOptions
): string {
  const chain = options?.distributionChain || input.distributionChain;
  // Fallback paxRefIds in case none provided from AirShopping
  const fallbackPaxRefIds = generatePaxRefIds(input.passengers);

  console.log("[OfferPriceBuilder] ========== BUILDING OFFERPRICE REQUEST ==========");
  console.log(`[OfferPriceBuilder] Total offers to price: ${input.selectedOffers.length}`);

  // Log all offers and their items in detail
  input.selectedOffers.forEach((offer, idx) => {
    console.log(`\n[OfferPriceBuilder] ===== OFFER #${idx + 1}: ${offer.offerId} =====`);
    if (offer.offerItems && offer.offerItems.length > 0) {
      console.table(offer.offerItems.map(item => ({
        offerItemId: item.offerItemId,
        isALaCarte: item.isALaCarte ? 'YES' : 'NO',
        paxRefIds: (item.paxRefIds || []).join(','),
        journeyRefIds: (item.journeyRefIds || []).join(','),
        segmentRefIds: (item.segmentRefIds || []).join(','),
        legRefIds: (item.legRefIds || []).join(','),
        associationType: item.associationType || 'N/A',
      })));
    }
  });

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<IATA_OfferPriceRQ xmlns="${JETSTAR_NAMESPACE}">
  ${buildDistributionChain(chain)}
  <Request>
    <PricedOffer xmlns="${COMMON_TYPES_NAMESPACE}">
      <SelectedOfferList>
        ${input.selectedOffers.map(offer => {
          // New structure: use per-item paxRefIds if available
          if (offer.offerItems && offer.offerItems.length > 0) {
            console.log(`[OfferPriceBuilder] Offer ${offer.offerId} using per-item paxRefIds`);

            // Separate flight fare items from a la carte items (ancillaries/SSRs)
            const fareItems = offer.offerItems.filter(item => !item.isALaCarte);
            const aLaCarteItems = offer.offerItems.filter(item => item.isALaCarte);

            console.log(`[OfferPriceBuilder] Offer ${offer.offerId}: ${fareItems.length} fare items, ${aLaCarteItems.length} a la carte items`);

            if (aLaCarteItems.length > 0) {
              console.log(`[OfferPriceBuilder] A la carte items for offer ${offer.offerId}:`);
              aLaCarteItems.forEach((item, idx) => {
                console.log(`[OfferPriceBuilder]   Item #${idx + 1}:`, {
                  offerItemId: item.offerItemId,
                  paxRefIds: item.paxRefIds || [],
                  segmentRefIds: item.segmentRefIds || [],
                  journeyRefIds: item.journeyRefIds || [],
                  legRefIds: item.legRefIds || [],
                  associationType: item.associationType,
                });
              });
            }

            return `
        <SelectedOffer>
          <OfferRefID>${escapeXml(offer.offerId)}</OfferRefID>
          <OwnerCode>${escapeXml(offer.ownerCode)}</OwnerCode>
          ${fareItems.map(item => `
          <SelectedOfferItem>
            <OfferItemRefID>${escapeXml(item.offerItemId)}</OfferItemRefID>
            ${item.paxRefIds.map(paxId => `<PaxRefID>${escapeXml(paxId)}</PaxRefID>`).join("")}
          </SelectedOfferItem>`).join("")}${expandALaCarteItems(aLaCarteItems)}
        </SelectedOffer>`;
          }

          // Legacy fallback: use offerItemIds with shared paxRefIds
          const paxRefIds = (offer.paxRefIds && offer.paxRefIds.length > 0)
            ? offer.paxRefIds
            : fallbackPaxRefIds;
          console.log(`[OfferPriceBuilder] Offer ${offer.offerId} using legacy paxRefIds:`, paxRefIds);
          const itemIds = offer.offerItemIds || [];
          return `
        <SelectedOffer>
          <OfferRefID>${escapeXml(offer.offerId)}</OfferRefID>
          <OwnerCode>${escapeXml(offer.ownerCode)}</OwnerCode>
          ${itemIds.map(itemId => `
          <SelectedOfferItem>
            <OfferItemRefID>${escapeXml(itemId)}</OfferItemRefID>
            ${paxRefIds.map(paxId => `<PaxRefID>${escapeXml(paxId)}</PaxRefID>`).join("")}
          </SelectedOfferItem>`).join("")}
        </SelectedOffer>`;
        }).join("")}
      </SelectedOfferList>
    </PricedOffer>
  </Request>
</IATA_OfferPriceRQ>`;

  const trimmedXml = xml.trim();

  // Save XML to file for debugging (sync to avoid async issues)
  try {
    const fs = require('fs');
    const path = require('path');
    const logsDir = path.join(process.cwd(), 'logs', 'xml');
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = path.join(logsDir, `offerprice-request-${timestamp}.xml`);
    fs.writeFileSync(filename, trimmedXml, 'utf8');
    console.log(`[OfferPriceBuilder] ✅ XML request saved to: ${filename}`);
  } catch (err) {
    console.error('[OfferPriceBuilder] Failed to save XML:', err);
  }

  return trimmedXml;
}

export const offerPriceBuilder = {
  build: buildOfferPriceXml,
};
