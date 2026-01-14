// ============================================================================
// ORDER CHANGE XML BUILDER
// ============================================================================

import {
  NDC_NAMESPACES,
  escapeXml,
  buildPointOfSale,
  buildParty,
  optional,
} from "./base.builder.js";
import type { OrderChangeRequest } from "../types/api.types.js";
import type { DistributionChain, Payment } from "../types/ndc.types.js";
import { config } from "../config/index.js";

export interface OrderChangeBuildOptions {
  distributionChain?: DistributionChain;
}

export function buildOrderChangeXml(
  input: OrderChangeRequest,
  options?: OrderChangeBuildOptions
): string {
  const chain = options?.distributionChain || input.distributionChain;
  const ownerCode = input.ownerCode || config.distributionChain.ownerCode;

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<IATA_OrderChangeRQ xmlns="${NDC_NAMESPACES.orderChange}">
  ${buildPointOfSale()}
  ${buildParty(chain)}
  <Request>
    <OrderID Owner="${escapeXml(ownerCode)}">${escapeXml(input.orderId)}</OrderID>
    ${input.cancelUnpaidOrder ? `<CancelUnpaidOrder>true</CancelUnpaidOrder>` : ""}
    ${input.acceptQuotedOffers?.map(offer => {
      // Use new offerItems structure if available
      if (offer.offerItems && offer.offerItems.length > 0) {
        return `
    <AcceptOffer>
      <OfferRefID>${escapeXml(offer.offerId)}</OfferRefID>
      <OwnerCode>${escapeXml(offer.ownerCode)}</OwnerCode>
      ${offer.offerItems.map(item => `<OfferItemRefID>${escapeXml(item.offerItemId)}</OfferItemRefID>`).join("")}
    </AcceptOffer>`;
      }
      // Legacy fallback
      const itemIds = offer.offerItemIds || [];
      return `
    <AcceptOffer>
      <OfferRefID>${escapeXml(offer.offerId)}</OfferRefID>
      <OwnerCode>${escapeXml(offer.ownerCode)}</OwnerCode>
      ${itemIds.map(id => `<OfferItemRefID>${escapeXml(id)}</OfferItemRefID>`).join("")}
    </AcceptOffer>`;
    }).join("") || ""}
    ${input.payment ? buildPaymentInfo(input.payment) : ""}
  </Request>
</IATA_OrderChangeRQ>`;

  return xml.trim();
}

function buildPaymentInfo(payment: Payment): string {
  let paymentMethod = "";

  if (payment.type === "CC" && payment.card) {
    // Credit Card Payment
    paymentMethod = `
      <PaymentCard>
        <CardCode>${escapeXml(payment.card.brand)}</CardCode>
        <CardNumber>${escapeXml(payment.card.number)}</CardNumber>
        ${optional(payment.card.cvv, `<SeriesCode>${escapeXml(payment.card.cvv)}</SeriesCode>`)}
        <CardHolderName>${escapeXml(payment.card.holderName)}</CardHolderName>
        <EffectiveExpireDate>
          <Expiration>${escapeXml(payment.card.expiryDate)}</Expiration>
        </EffectiveExpireDate>
      </PaymentCard>`;
  } else if (payment.type === "AGT" && payment.agency) {
    // Agency Payment (BSP Settlement / IFG)
    paymentMethod = `
      <SettlementPlan>
        ${optional(payment.agency.iataNumber, `<IATA_Number>${escapeXml(payment.agency.iataNumber)}</IATA_Number>`)}
        <PaymentTypeCode>AGT</PaymentTypeCode>
        ${optional(payment.agency.accountNumber, `<AccountNumber>${escapeXml(payment.agency.accountNumber)}</AccountNumber>`)}
      </SettlementPlan>`;
  } else if (payment.type === "CA") {
    // Cash Agency Payment
    paymentMethod = `
      <SettlementPlan>
        <PaymentTypeCode>CA</PaymentTypeCode>
      </SettlementPlan>`;
  }

  return `
    <PaymentInfo>
      <PaymentMethod>
        ${paymentMethod}
      </PaymentMethod>
      <Amount CurCode="${escapeXml(payment.amount.currency)}">${payment.amount.value}</Amount>
      ${optional(payment.remarks, `<Remarks>${escapeXml(payment.remarks)}</Remarks>`)}
    </PaymentInfo>`;
}

export const orderChangeBuilder = {
  build: buildOrderChangeXml,
};