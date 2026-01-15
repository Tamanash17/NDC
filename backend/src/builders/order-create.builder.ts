// ============================================================================
// ORDER CREATE XML BUILDER - Jetstar NDC 21.3 Format
// ============================================================================

import {
  escapeXml,
  formatDate,
  optional,
} from "./base.builder.js";
import type { OrderCreateRequest } from "../types/api.types.js";
import type { DistributionChain, Passenger, Contact, Payment } from "../types/ndc.types.js";
import { config } from "../config/index.js";

// Jetstar-specific namespaces
const JETSTAR_NS = {
  main: "http://www.iata.org/IATA/2015/EASD/00/IATA_OffersAndOrdersMessage",
  commonTypes: "http://www.iata.org/IATA/2015/EASD/00/IATA_OffersAndOrdersCommonTypes",
};

export interface OrderCreateBuildOptions {
  distributionChain?: DistributionChain;
}

export function buildOrderCreateXml(
  input: OrderCreateRequest,
  options?: OrderCreateBuildOptions
): string {
  const chain = options?.distributionChain || input.distributionChain;

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<IATA_OrderCreateRQ xmlns="${JETSTAR_NS.main}">
${buildDistributionChain(chain)}
<PayloadAttributes>
<VersionNumber xmlns="${JETSTAR_NS.commonTypes}">21.3</VersionNumber>
</PayloadAttributes>
<Request>
<CreateOrder xmlns="${JETSTAR_NS.commonTypes}">
<AcceptSelectedQuotedOfferList>
${buildSelectedOffers(input)}
</AcceptSelectedQuotedOfferList>
</CreateOrder>
<DataLists xmlns="${JETSTAR_NS.commonTypes}">
${buildContactList(input.contact)}
${buildPassengerList(input.passengers)}
</DataLists>
${input.payment ? buildPaymentFunctions(input.payment) : ""}
</Request>
</IATA_OrderCreateRQ>`;

  return xml.trim();
}

function buildDistributionChain(chain?: DistributionChain): string {
  // Iterate through ALL links (supports BOB with Seller + Distributor)
  if (chain?.links && chain.links.length > 0) {
    return `<DistributionChain>
${chain.links.map(link => `<DistributionChainLink xmlns="${JETSTAR_NS.commonTypes}">
<Ordinal>${link.ordinal}</Ordinal>
<OrgRole>${escapeXml(link.orgRole)}</OrgRole>
<ParticipatingOrg>
<Name>${escapeXml(link.orgName)}</Name>
<OrgID>${escapeXml(link.orgId)}</OrgID>
</ParticipatingOrg>
</DistributionChainLink>`).join("\n")}
</DistributionChain>`;
  }

  // Fallback to config defaults (single seller)
  const agencyId = config.distributionChain.orgCode;
  const agencyName = config.distributionChain.orgName || agencyId;

  return `<DistributionChain>
<DistributionChainLink xmlns="${JETSTAR_NS.commonTypes}">
<Ordinal>1</Ordinal>
<OrgRole>Seller</OrgRole>
<ParticipatingOrg>
<Name>${escapeXml(agencyName)}</Name>
<OrgID>${escapeXml(agencyId)}</OrgID>
</ParticipatingOrg>
</DistributionChainLink>
</DistributionChain>`;
}

function buildSelectedOffers(input: OrderCreateRequest): string {
  return input.selectedOffers.map(offer => {
    // Use offerItems structure if available, otherwise fall back to offerItemIds
    if (offer.offerItems && offer.offerItems.length > 0) {
      return `<SelectedPricedOffer>
<OfferRefID>${escapeXml(offer.offerId)}</OfferRefID>
<OwnerCode>${escapeXml(offer.ownerCode)}</OwnerCode>
${offer.offerItems.map(item => `<SelectedOfferItem>
<OfferItemRefID>${escapeXml(item.offerItemId)}</OfferItemRefID>
${item.paxRefIds.map(paxId => `<PaxRefID>${escapeXml(paxId)}</PaxRefID>`).join("")}
</SelectedOfferItem>`).join("")}
</SelectedPricedOffer>`;
    }
    // Legacy fallback
    const itemIds = offer.offerItemIds || [];
    return `<SelectedPricedOffer>
<OfferRefID>${escapeXml(offer.offerId)}</OfferRefID>
<OwnerCode>${escapeXml(offer.ownerCode)}</OwnerCode>
${itemIds.map(itemId => `<SelectedOfferItem>
<OfferItemRefID>${escapeXml(itemId)}</OfferItemRefID>
</SelectedOfferItem>`).join("")}
</SelectedPricedOffer>`;
  }).join("");
}

function buildPassengerList(passengers: Passenger[]): string {
  return `<PaxList>
${passengers.map((pax) => `<Pax>
<ContactInfoRefID>CI1</ContactInfoRefID>
<IdentityDoc>
<Birthdate>${formatDate(pax.birthdate)}</Birthdate>
${optional(pax.identityDoc?.nationality, `<CitizenshipCountryCode>${escapeXml(pax.identityDoc?.nationality)}</CitizenshipCountryCode>`)}
${pax.identityDoc ? `<ExpiryDate>${formatDate(pax.identityDoc.expiryDate)}</ExpiryDate>
<GenderCode>${escapeXml(pax.gender)}</GenderCode>
<GivenName>${escapeXml(pax.givenName)}</GivenName>
<IdentityDocID>${escapeXml(pax.identityDoc.number)}</IdentityDocID>
<IdentityDocTypeCode>${pax.identityDoc.type === 'PP' ? 'PT' : pax.identityDoc.type}</IdentityDocTypeCode>
<IssuingCountryCode>${escapeXml(pax.identityDoc.issuingCountry)}</IssuingCountryCode>
<Surname>${escapeXml(pax.surname)}</Surname>` : `<GenderCode>${escapeXml(pax.gender)}</GenderCode>
<GivenName>${escapeXml(pax.givenName)}</GivenName>
<Surname>${escapeXml(pax.surname)}</Surname>`}
</IdentityDoc>
<Individual>
<Birthdate>${formatDate(pax.birthdate)}</Birthdate>
<GenderCode>${escapeXml(pax.gender)}</GenderCode>
<GivenName>${escapeXml(pax.givenName)}</GivenName>
<Surname>${escapeXml(pax.surname)}</Surname>
</Individual>
${pax.loyalty ? buildLoyalty(pax.loyalty) : ""}
<PaxID>${escapeXml(pax.paxId)}</PaxID>
<PTC>${escapeXml(pax.ptc)}</PTC>
</Pax>`).join("")}
</PaxList>`;
}

function buildIdentityDoc(doc: NonNullable<Passenger["identityDoc"]>, pax: Passenger): string {
  // Map document type codes: PP -> PT (Passport), NI -> NI (National ID), DL -> DL (Driver License)
  const docTypeCode = doc.type === 'PP' ? 'PT' : doc.type;

  return `<IdentityDoc>
<IdentityDocTypeCode>${escapeXml(docTypeCode)}</IdentityDocTypeCode>
<IdentityDocID>${escapeXml(doc.number)}</IdentityDocID>
${optional(doc.nationality, `<CitizenshipCountryCode>${escapeXml(doc.nationality)}</CitizenshipCountryCode>`)}
<ExpiryDate>${formatDate(doc.expiryDate)}</ExpiryDate>
<IssuingCountryCode>${escapeXml(doc.issuingCountry)}</IssuingCountryCode>
<Surname>${escapeXml(pax.surname)}</Surname>
</IdentityDoc>`;
}

function buildLoyalty(loyalty: NonNullable<Passenger["loyalty"]>): string {
  return `<LoyaltyProgramAccount>
<AccountNumber>${escapeXml(loyalty.accountNumber)}</AccountNumber>
<LoyaltyProgram>
<Carrier>
<AirlineDesigCode>${escapeXml(loyalty.programOwner)}</AirlineDesigCode>
</Carrier>
</LoyaltyProgram>
</LoyaltyProgramAccount>`;
}

function buildContactList(contact: Contact): string {
  return `<ContactInfoList>
<ContactInfo>
<ContactInfoID>CI1</ContactInfoID>
<EmailAddress>
<EmailAddressText>${escapeXml(contact.email)}</EmailAddressText>
</EmailAddress>
${contact.phone ? `<Phone>
${optional(contact.phone.countryCode, `<CountryCode>${escapeXml(contact.phone.countryCode)}</CountryCode>`)}
<PhoneNumber>${escapeXml(contact.phone.number)}</PhoneNumber>
</Phone>` : ""}
${contact.address ? `<PostalAddress>
${optional(contact.address.street, `<Street>${escapeXml(contact.address.street)}</Street>`)}
${optional(contact.address.city, `<CityName>${escapeXml(contact.address.city)}</CityName>`)}
${optional(contact.address.postalCode, `<PostalCode>${escapeXml(contact.address.postalCode)}</PostalCode>`)}
<CountryCode>${escapeXml(contact.address.countryCode)}</CountryCode>
</PostalAddress>` : ""}
</ContactInfo>
</ContactInfoList>`;
}

function buildPaymentFunctions(payment: Payment): string {
  // Agency payment - no payment method needed for HOLD bookings
  if (payment.type === "AGT") {
    return `<PaymentFunctions>
<PaymentProcessingDetails>
<Amount CurCode="${escapeXml(payment.amount.currency)}">${payment.amount.value.toFixed(2)}</Amount>
</PaymentProcessingDetails>
</PaymentFunctions>`;
  }

  // Credit card payment
  if (payment.type === "CC" && payment.card) {
    return `<PaymentFunctions>
<PaymentProcessingDetails>
<Amount CurCode="${escapeXml(payment.amount.currency)}">${payment.amount.value.toFixed(2)}</Amount>
<PaymentMethod>
<PaymentCard>
<CardBrandCode>${escapeXml(payment.card.brand)}</CardBrandCode>
<CardNumber>${escapeXml(payment.card.number)}</CardNumber>
${optional(payment.card.cvv, `<SeriesCode>${escapeXml(payment.card.cvv)}</SeriesCode>`)}
<CardHolderName>${escapeXml(payment.card.holderName)}</CardHolderName>
<EffectiveExpireDate>
<Expiration>${escapeXml(payment.card.expiryDate)}</Expiration>
</EffectiveExpireDate>
</PaymentCard>
</PaymentMethod>
</PaymentProcessingDetails>
</PaymentFunctions>`;
  }

  return "";
}

export const orderCreateBuilder = {
  build: buildOrderCreateXml,
};
