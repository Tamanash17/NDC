// ============================================================================
// ORDER QUOTE XML BUILDER
// ============================================================================

import {
  NDC_NAMESPACES,
  escapeXml,
  buildPointOfSale,
  buildParty,
} from "./base.builder.js";
import type { OrderQuoteRequest } from "../types/api.types.js";
import type { DistributionChain } from "../types/ndc.types.js";
import { config } from "../config/index.js";

export interface OrderQuoteBuildOptions {
  distributionChain?: DistributionChain;
}

export function buildOrderQuoteXml(
  input: OrderQuoteRequest,
  options?: OrderQuoteBuildOptions
): string {
  const chain = options?.distributionChain || input.distributionChain;
  const ownerCode = input.ownerCode || config.distributionChain.ownerCode;

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<IATA_OrderQuoteRQ xmlns="${NDC_NAMESPACES.orderQuote}">
  ${buildPointOfSale()}
  ${buildParty(chain)}
  <Request>
    <OrderID Owner="${escapeXml(ownerCode)}">${escapeXml(input.orderId)}</OrderID>
    ${input.selectedOffers?.map(offer => {
      // Use new offerItems structure if available
      if (offer.offerItems && offer.offerItems.length > 0) {
        return `
    <SelectedOffer>
      <OfferRefID>${escapeXml(offer.offerId)}</OfferRefID>
      <OwnerCode>${escapeXml(offer.ownerCode)}</OwnerCode>
      ${offer.offerItems.map(item => `<SelectedOfferItem><OfferItemRefID>${escapeXml(item.offerItemId)}</OfferItemRefID>${item.paxRefIds.map(paxId => `<PaxRefID>${escapeXml(paxId)}</PaxRefID>`).join("")}</SelectedOfferItem>`).join("")}
    </SelectedOffer>`;
      }
      // Legacy fallback
      const itemIds = offer.offerItemIds || [];
      return `
    <SelectedOffer>
      <OfferRefID>${escapeXml(offer.offerId)}</OfferRefID>
      <OwnerCode>${escapeXml(offer.ownerCode)}</OwnerCode>
      ${itemIds.map(id => `<SelectedOfferItem><OfferItemRefID>${escapeXml(id)}</OfferItemRefID></SelectedOfferItem>`).join("")}
    </SelectedOffer>`;
    }).join("") || ""}
    ${input.addServices?.map(svc => `
    <AddService>
      <ServiceID>${escapeXml(svc.serviceId)}</ServiceID>
      <PaxRefID>${escapeXml(svc.paxRefId)}</PaxRefID>
      ${svc.segmentRefId ? `<SegmentRefID>${escapeXml(svc.segmentRefId)}</SegmentRefID>` : ""}
    </AddService>`).join("") || ""}
    ${input.seatSelections?.map(seat => `
    <SeatSelection>
      <PaxRefID>${escapeXml(seat.paxRefId)}</PaxRefID>
      <SegmentRefID>${escapeXml(seat.paxSegmentRefId)}</SegmentRefID>
      <Row>${escapeXml(seat.row)}</Row>
      <Column>${escapeXml(seat.column)}</Column>
    </SeatSelection>`).join("") || ""}
  </Request>
</IATA_OrderQuoteRQ>`;

  return xml.trim();
}

export const orderQuoteBuilder = {
  build: buildOrderQuoteXml,
};