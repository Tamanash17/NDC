// ============================================================================
// PAYMENT XML BUILDER
// Used for OrderChange with PaymentFunctions for processing hold bookings
// ============================================================================

import { escapeXml } from "./base.builder.js";
import type { DistributionChain } from "../types/ndc.types.js";

const JETSTAR_NAMESPACE = "http://www.iata.org/IATA/2015/EASD/00/IATA_OffersAndOrdersMessage";
const COMMON_TYPES_NAMESPACE = "http://www.iata.org/IATA/2015/EASD/00/IATA_OffersAndOrdersCommonTypes";

export interface PaymentRequest {
  orderId: string;
  ownerCode: string;
  amount: number;
  currency: string;
  paymentType: 'CC' | 'AGT' | 'CA'; // CC = Credit Card, AGT = Agency/BSP, CA = Cash Agency
  distributionChain?: DistributionChain;

  // For Credit Card payments
  card?: {
    brand: string;
    number: string;
    expiryDate: string;
    cvv?: string;
    holderName: string;
  };

  // For Agency/BSP payments
  agency?: {
    iataNumber?: string;
    accountNumber?: string;
  };

  // Payer information (optional)
  payer?: {
    firstName?: string;
    lastName?: string;
    email?: string;
  };
}

function buildDistributionChain(chain?: DistributionChain): string {
  // Distribution chain must be provided from user input - same as other builders
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

function buildPaymentMethod(request: PaymentRequest): string {
  if (request.paymentType === 'CC' && request.card) {
    // Credit Card Payment - Jetstar NDC Gateway format (from working Postman)
    // IMPORTANT: Jetstar does NOT use CardHolderName in PaymentCard
    // Cardholder info goes in Payer element instead
    // ExpiryDate comes as "MM/YY", need to convert to EffectiveDate (MMYY) and ExpirationDate (MMYY)
    const [expiryMonth, expiryYear] = (request.card.expiryDate || '').split('/');
    const effectiveDate = `${expiryMonth}21`; // Default effective date (start of card validity)
    const expirationDate = `${expiryMonth}${expiryYear}`;

    // Build CVV element only if provided
    const cvvElement = request.card.cvv ? `<CardSecurityCode>${escapeXml(request.card.cvv)}</CardSecurityCode>` : '';

    // Match Postman format EXACTLY: CardBrandCode, CardNumber, CardSecurityCode, EffectiveDate, ExpirationDate
    // NO CardHolderName element
    return `<PaymentMethod><PaymentCard><CardBrandCode>${escapeXml(request.card.brand)}</CardBrandCode><CardNumber>${escapeXml(request.card.number)}</CardNumber>${cvvElement}<EffectiveDate>${effectiveDate}</EffectiveDate><ExpirationDate>${expirationDate}</ExpirationDate></PaymentCard></PaymentMethod>`;
  } else if (request.paymentType === 'AGT' && request.agency) {
    // Agency/BSP Settlement Payment
    const iataElement = request.agency.iataNumber ? `<IATA_Number>${escapeXml(request.agency.iataNumber)}</IATA_Number>` : '';
    const accountElement = request.agency.accountNumber ? `<AccountNumber>${escapeXml(request.agency.accountNumber)}</AccountNumber>` : '';
    return `<PaymentMethod><SettlementPlan>${iataElement}<PaymentTypeCode>AGT</PaymentTypeCode>${accountElement}</SettlementPlan></PaymentMethod>`;
  } else if (request.paymentType === 'CA') {
    // Cash Agency Payment (for BSP settlement without IATA number)
    return `<PaymentMethod><SettlementPlan><PaymentTypeCode>CA</PaymentTypeCode></SettlementPlan></PaymentMethod>`;
  }

  return '';
}

function buildPayer(request: PaymentRequest): string {
  // Payer is REQUIRED for ALL payment types per Jetstar Postman examples
  let firstName = request.payer?.firstName || '';
  let lastName = request.payer?.lastName || '';
  const email = request.payer?.email || '';

  // If no payer name but we have card holder name (for CC), parse it
  if (!firstName && !lastName && request.card?.holderName) {
    const nameParts = (request.card.holderName || '').trim().split(/\s+/);
    firstName = nameParts[0] || '';
    lastName = nameParts.slice(1).join(' ') || nameParts[0] || '';
  }

  // ALWAYS provide default payer name for ALL payment types - Jetstar requires it
  if (!firstName && !lastName) {
    firstName = 'AGENCY';
    lastName = 'PAYMENT';
  }

  // Build Payer XML inline to avoid whitespace issues - match Postman format
  let payerXml = '<Payer>';
  payerXml += `<PayerName><IndividualName>`;
  payerXml += `<GivenName>${escapeXml(firstName)}</GivenName>`;
  payerXml += `<Surname>${escapeXml(lastName)}</Surname>`;
  payerXml += `</IndividualName></PayerName>`;
  if (email) {
    payerXml += `<PayerEmailAddress><EmailAddressText>${escapeXml(email)}</EmailAddressText></PayerEmailAddress>`;
  }
  payerXml += '</Payer>';

  return payerXml;
}

export function buildPaymentXml(request: PaymentRequest): string {
  // Build payer section - required for CC, uses card holder name if no explicit payer
  const payerXml = buildPayer(request);
  const paymentMethodXml = buildPaymentMethod(request);

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<IATA_OrderChangeRQ xmlns="${JETSTAR_NAMESPACE}">${buildDistributionChain(request.distributionChain)}
  <PayloadAttributes>
    <VersionNumber xmlns="${COMMON_TYPES_NAMESPACE}">21.3</VersionNumber>
  </PayloadAttributes>
  <Request>
    <Order xmlns="${COMMON_TYPES_NAMESPACE}">
      <OrderID>${escapeXml(request.orderId)}</OrderID>
      <OwnerCode>${escapeXml(request.ownerCode)}</OwnerCode>
    </Order>
    <PaymentFunctions xmlns="${COMMON_TYPES_NAMESPACE}">
      <PaymentMethodCriteria>
        <PaymentTypeCode>${escapeXml(request.paymentType)}</PaymentTypeCode>
      </PaymentMethodCriteria>
      <PaymentProcessingDetails>
        <Amount CurCode="${escapeXml(request.currency)}">${request.amount}</Amount>${payerXml}${paymentMethodXml}
      </PaymentProcessingDetails>
    </PaymentFunctions>
  </Request>
</IATA_OrderChangeRQ>`;

  return xml.trim();
}

export const paymentBuilder = {
  build: buildPaymentXml,
};
