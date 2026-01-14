// ============================================================================
// REQUEST VALIDATION SCHEMAS
// Schemas for all NDC operation requests
// ============================================================================

import { z } from "zod";
import {
  airportCodeSchema,
  dateSchema,
  passengerCountSchema,
  distributionChainSchema,
  selectedOfferSchema,
  passengerSchema,
  contactSchema,
  paymentSchema,
  seatSelectionSchema,
  selectedServiceSchema,
} from "./common.schema.js";

// ----------------------------------------------------------------------------
// AIR SHOPPING REQUEST
// ----------------------------------------------------------------------------

export const airShoppingRequestSchema = z.object({
  origin: airportCodeSchema,
  destination: airportCodeSchema,
  departureDate: dateSchema,
  returnDate: dateSchema.optional(),
  passengers: z.array(passengerCountSchema).min(1),
  cabinPreference: z.enum(["M", "W", "C", "F"]).optional(),
  directFlightsOnly: z.boolean().optional(),
  promoCode: z.string().optional(),
  distributionChain: distributionChainSchema,
});

export type AirShoppingRequestInput = z.infer<typeof airShoppingRequestSchema>;

// ----------------------------------------------------------------------------
// AIRLINE PROFILE REQUEST
// ----------------------------------------------------------------------------

export const airlineProfileRequestSchema = z.object({
  ownerCode: z.string().length(2, "Owner code must be 2 characters (e.g., NV)"),
  distributionChain: distributionChainSchema,
});

export type AirlineProfileRequestInput = z.infer<typeof airlineProfileRequestSchema>;

// ----------------------------------------------------------------------------
// OFFER PRICE REQUEST
// ----------------------------------------------------------------------------

export const offerPriceRequestSchema = z.object({
  selectedOffers: z.array(selectedOfferSchema).min(1),
  shoppingResponseId: z.string().optional(),
  distributionChain: distributionChainSchema,
});

export type OfferPriceRequestInput = z.infer<typeof offerPriceRequestSchema>;

// ----------------------------------------------------------------------------
// SERVICE LIST REQUEST
// ----------------------------------------------------------------------------

export const serviceListRequestSchema = z.object({
  offerId: z.string().optional(),
  orderId: z.string().optional(),
  ownerCode: z.string().length(2),
  responseId: z.string().optional(),
  distributionChain: distributionChainSchema,
}).refine(data => data.offerId || data.orderId, {
  message: "Either offerId or orderId must be provided",
});

export type ServiceListRequestInput = z.infer<typeof serviceListRequestSchema>;

// ----------------------------------------------------------------------------
// SEAT AVAILABILITY REQUEST
// ----------------------------------------------------------------------------

export const seatAvailabilityRequestSchema = z.object({
  offerId: z.string().optional(),
  offerItemIds: z.array(z.string()).optional(),
  orderId: z.string().optional(),
  ownerCode: z.string().length(2),
  responseId: z.string().optional(),
  segmentRefIds: z.array(z.string()).optional(),
  distributionChain: distributionChainSchema,
}).refine(data => data.offerId || data.orderId, {
  message: "Either offerId or orderId must be provided",
});

export type SeatAvailabilityRequestInput = z.infer<typeof seatAvailabilityRequestSchema>;

// ----------------------------------------------------------------------------
// ORDER CREATE REQUEST
// ----------------------------------------------------------------------------

export const orderCreateRequestSchema = z.object({
  selectedOffers: z.array(selectedOfferSchema).min(1),
  passengers: z.array(passengerSchema).min(1),
  contact: contactSchema,
  payment: paymentSchema.optional(),
  seatSelections: z.array(seatSelectionSchema).optional(),
  selectedServices: z.array(selectedServiceSchema).optional(),
  remarks: z.array(z.string()).optional(),
  distributionChain: distributionChainSchema,
});

export type OrderCreateRequestInput = z.infer<typeof orderCreateRequestSchema>;

// ----------------------------------------------------------------------------
// ORDER RETRIEVE REQUEST
// ----------------------------------------------------------------------------

export const orderRetrieveRequestSchema = z.object({
  orderId: z.string().min(1),
  ownerCode: z.string().length(2).optional(),
  distributionChain: distributionChainSchema,
});

export type OrderRetrieveRequestInput = z.infer<typeof orderRetrieveRequestSchema>;

// ----------------------------------------------------------------------------
// ORDER RESHOP REQUEST
// ----------------------------------------------------------------------------

export const orderReshopRequestSchema = z.object({
  orderId: z.string().min(1),
  ownerCode: z.string().length(2).optional(),
  cancelOrder: z.boolean().optional(),
  cancelOrderItems: z.array(z.string()).optional(),
  flightCriteria: z.object({
    origin: airportCodeSchema,
    destination: airportCodeSchema,
    departureDate: dateSchema,
  }).optional(),
  distributionChain: distributionChainSchema,
});

export type OrderReshopRequestInput = z.infer<typeof orderReshopRequestSchema>;

// ----------------------------------------------------------------------------
// ORDER QUOTE REQUEST
// ----------------------------------------------------------------------------

export const orderQuoteRequestSchema = z.object({
  orderId: z.string().min(1),
  ownerCode: z.string().length(2).optional(),
  selectedOffers: z.array(selectedOfferSchema).optional(),
  addServices: z.array(selectedServiceSchema).optional(),
  seatSelections: z.array(seatSelectionSchema).optional(),
  distributionChain: distributionChainSchema,
});

export type OrderQuoteRequestInput = z.infer<typeof orderQuoteRequestSchema>;

// ----------------------------------------------------------------------------
// ORDER CHANGE REQUEST
// ----------------------------------------------------------------------------

export const orderChangeRequestSchema = z.object({
  orderId: z.string().min(1),
  ownerCode: z.string().length(2).optional(),
  acceptQuotedOffers: z.array(selectedOfferSchema).optional(),
  cancelUnpaidOrder: z.boolean().optional(),
  payment: paymentSchema.optional(),
  distributionChain: distributionChainSchema,
});

export type OrderChangeRequestInput = z.infer<typeof orderChangeRequestSchema>;

// ----------------------------------------------------------------------------
// AUTH REQUEST
// ----------------------------------------------------------------------------

export const authRequestSchema = z.object({
  forceRefresh: z.boolean().optional(),
});

export type AuthRequestInput = z.infer<typeof authRequestSchema>;