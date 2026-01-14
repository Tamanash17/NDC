// ============================================================================
// COMMON VALIDATION SCHEMAS
// Reusable schema components
// ============================================================================

import { z } from "zod";

// ----------------------------------------------------------------------------
// PRIMITIVE SCHEMAS
// ----------------------------------------------------------------------------

export const airportCodeSchema = z.string().length(3).toUpperCase();
export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const currencySchema = z.string().length(3).default("AUD");

// ----------------------------------------------------------------------------
// PASSENGER TYPE
// ----------------------------------------------------------------------------

export const ptcSchema = z.enum(["ADT", "CHD", "INF"]);
export const genderSchema = z.enum(["M", "F", "U"]);

// ----------------------------------------------------------------------------
// PASSENGER COUNT
// ----------------------------------------------------------------------------

export const passengerCountSchema = z.object({
  ptc: ptcSchema,
  count: z.number().int().min(1).max(9),
});

// ----------------------------------------------------------------------------
// AMOUNT
// ----------------------------------------------------------------------------

export const amountSchema = z.object({
  value: z.number().min(0),
  currency: currencySchema,
});

// ----------------------------------------------------------------------------
// DISTRIBUTION CHAIN
// ----------------------------------------------------------------------------

export const distributionChainLinkSchema = z.object({
  ordinal: z.number().int().min(1),
  orgRole: z.string().min(1),
  orgId: z.string().min(1),
  orgName: z.string().optional(),
  countryCode: z.string().length(2).optional(),
  cityCode: z.string().length(3).optional(),
});

export const distributionChainSchema = z.object({
  ownerCode: z.string().length(2).default("JQ"),
  links: z.array(distributionChainLinkSchema).min(1),
}).optional();

// ----------------------------------------------------------------------------
// SELECTED OFFER
// ----------------------------------------------------------------------------

export const selectedOfferSchema = z.object({
  offerId: z.string().min(1),
  ownerCode: z.string().length(2),
  offerItemIds: z.array(z.string().min(1)).min(1),
  responseId: z.string().optional(),
});

// ----------------------------------------------------------------------------
// PASSENGER IDENTITY DOC
// ----------------------------------------------------------------------------

export const identityDocSchema = z.object({
  type: z.enum(["PP", "NI", "DL"]),
  number: z.string().min(1),
  issuingCountry: z.string().length(2),
  expiryDate: dateSchema,
  nationality: z.string().length(2).optional(),
});

// ----------------------------------------------------------------------------
// PASSENGER LOYALTY
// ----------------------------------------------------------------------------

export const loyaltySchema = z.object({
  programOwner: z.string().min(1),
  accountNumber: z.string().min(1),
  tierLevel: z.string().optional(),
});

// ----------------------------------------------------------------------------
// FULL PASSENGER
// ----------------------------------------------------------------------------

export const passengerSchema = z.object({
  paxId: z.string().optional(),
  ptc: ptcSchema,
  title: z.string().optional(),
  givenName: z.string().min(1),
  middleName: z.string().optional(),
  surname: z.string().min(1),
  birthdate: dateSchema,
  gender: genderSchema,
  email: z.string().email().optional(),
  phone: z.string().optional(),
  identityDoc: identityDocSchema.optional(),
  loyalty: loyaltySchema.optional(),
  infantAssocPaxId: z.string().optional(),
});

// ----------------------------------------------------------------------------
// CONTACT
// ----------------------------------------------------------------------------

export const contactSchema = z.object({
  email: z.string().email(),
  phone: z.object({
    countryCode: z.string().optional(),
    number: z.string().min(1),
  }).optional(),
  address: z.object({
    street: z.string().optional(),
    city: z.string().optional(),
    postalCode: z.string().optional(),
    countryCode: z.string().length(2),
  }).optional(),
});

// ----------------------------------------------------------------------------
// PAYMENT
// ----------------------------------------------------------------------------

export const cardPaymentSchema = z.object({
  brand: z.enum(["VI", "MC", "AX", "DC", "JC", "UP"]),
  number: z.string().min(13).max(19),
  expiryDate: z.string().regex(/^\d{2}\/\d{2}$/),
  cvv: z.string().length(3).or(z.string().length(4)).optional(),
  holderName: z.string().min(1),
  billingAddress: z.object({
    street: z.string().optional(),
    city: z.string().optional(),
    postalCode: z.string().optional(),
    countryCode: z.string().length(2),
  }).optional(),
});

export const agencyPaymentSchema = z.object({
  iataNumber: z.string().optional(),
  accountNumber: z.string().optional(),
});

export const paymentSchema = z.object({
  type: z.enum(["CC", "CA", "AGT", "OT"]),
  amount: amountSchema,
  card: cardPaymentSchema.optional(),
  agency: agencyPaymentSchema.optional(),
  remarks: z.string().optional(),
});

// ----------------------------------------------------------------------------
// SEAT SELECTION
// ----------------------------------------------------------------------------

export const seatSelectionSchema = z.object({
  paxRefId: z.string().min(1),
  paxSegmentRefId: z.string().min(1),
  column: z.string().length(1),
  row: z.string().min(1).max(3),
  seatId: z.string().optional(),
  offerItemId: z.string().optional(),
});

// ----------------------------------------------------------------------------
// SELECTED SERVICE
// ----------------------------------------------------------------------------

export const selectedServiceSchema = z.object({
  serviceId: z.string().min(1),
  paxRefId: z.string().min(1),
  segmentRefId: z.string().optional(),
  quantity: z.number().int().min(1).optional(),
});