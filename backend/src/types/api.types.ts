// ============================================================================
// API TYPES - FIXED
// Request/Response contracts for REST endpoints aligned with validation schemas
// ============================================================================

import type {
  Amount, PTCType, Passenger, Contact, Payment,
  SelectedOffer, SeatSelection, Offer, Order,
  FlightSegment, PaxJourney, SeatMap, AncillaryOffer,
  ServiceDefinition, NDCError, DistributionChain,
  SelectedService, TokenInfo, PassengerCount
} from "./ndc.types.js";

// ----------------------------------------------------------------------------
// COMMON API RESPONSE WRAPPER
// ----------------------------------------------------------------------------

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: ApiError;
  meta: ResponseMeta;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  ndcErrors?: NDCError[];
  retryable: boolean;
}

export interface ResponseMeta {
  transactionId: string;
  correlationId: string;
  timestamp: string;
  duration: number;
  operation: string;
  tokenInfo?: TokenInfo;
}

// ----------------------------------------------------------------------------
// AIR SHOPPING - FIXED: Flat structure matching validation schema
// ----------------------------------------------------------------------------

export interface AirShoppingRequest {
  origin: string;
  destination: string;
  departureDate: string;
  returnDate?: string;
  passengers: PassengerCount[];
  cabinPreference?: string;
  directFlightsOnly?: boolean;
  promoCode?: string;
  distributionChain?: DistributionChain;
}

export interface AirShoppingResponseData {
  offers: Offer[];
  dataLists: {
    paxJourneyList: PaxJourney[];
    paxSegmentList: FlightSegment[];
  };
  shoppingResponseId?: string;
}

// ----------------------------------------------------------------------------
// OFFER PRICE
// ----------------------------------------------------------------------------

export interface OfferPriceRequest {
  selectedOffers: SelectedOffer[];
  shoppingResponseId?: string;
  distributionChain?: DistributionChain;
  passengers?: {
    adults: number;
    children: number;
    infants: number;
  };
  paymentCardType?: string;
}

export interface OfferPriceResponseData {
  pricedOffers: Offer[];
  expirationDateTime?: string;
  warnings?: string[];
}

// ----------------------------------------------------------------------------
// SERVICE LIST
// ----------------------------------------------------------------------------

export interface ServiceListRequest {
  // Legacy single offer format
  offerId?: string;
  offerItemIds?: string[];
  orderId?: string;
  ownerCode?: string;
  responseId?: string;
  distributionChain?: DistributionChain;
  // New multi-offer format (preferred)
  selectedOffers?: Array<{
    offerId: string;
    ownerCode?: string;
    offerItems?: Array<{
      offerItemId: string;
      serviceId?: string;
      paxRefIds?: string[];
    }>;
  }>;
}

// Segment info from ServiceList DataLists (for direction detection)
export interface ServiceListSegment {
  segmentId: string;
  origin: string;
  destination: string;
  departureDate?: string;
  flightNumber?: string;
  carrier?: string;
}

// Journey info from ServiceList DataLists
export interface ServiceListJourney {
  journeyId: string;
  segmentRefIds: string[];
}

export interface ServiceListResponseData {
  services: ServiceDefinition[];
  ancillaryOffers: AncillaryOffer[];
  // DataLists for direction detection
  segments?: ServiceListSegment[];
  journeys?: ServiceListJourney[];
}

// ----------------------------------------------------------------------------
// SEAT AVAILABILITY
// ----------------------------------------------------------------------------

export interface SeatAvailabilityRequest {
  // Legacy single offer format (for one-way flights)
  offerId?: string;
  offerItemIds?: string[];
  orderId?: string;
  ownerCode: string;
  responseId?: string;
  segmentRefIds?: string[];
  distributionChain?: DistributionChain;
  // New multi-offer format (preferred for round-trip flights)
  // Each offer represents one direction with all OfferItems and segment refs
  offers?: Array<{
    offerId: string;
    ownerCode: string;
    offerItemIds: string[];
    segmentRefIds: string[];
  }>;
}

export interface SeatAvailabilityResponseData {
  seatMaps: SeatMap[];
  seatOffers: AncillaryOffer[];
  aLaCarteOfferId?: string;  // The ALaCarteOffer ID from the response - used for OfferPrice
}

// ----------------------------------------------------------------------------
// ORDER CREATE
// ----------------------------------------------------------------------------

export interface OrderCreateRequest {
  selectedOffers: SelectedOffer[];
  passengers: Passenger[];
  contact: Contact;
  payment?: Payment;
  seatSelections?: SeatSelection[];
  selectedServices?: SelectedService[];
  remarks?: string[];
  distributionChain?: DistributionChain;
  passiveSegments?: PassiveSegment[];
}

export interface PassiveSegment {
  segmentId: string;
  origin: string;
  destination: string;
  departureDateTime: string;
  arrivalDateTime: string;
  flightNumber: string;
  operatingCarrier: string;
  marketingCarrier: string;
  journeyId: string;
  rbd?: string; // Booking class code (e.g., "O", "Y", "W")
}

export interface OrderCreateResponseData {
  order: Order;
}

// ----------------------------------------------------------------------------
// ORDER RETRIEVE
// ----------------------------------------------------------------------------

export interface OrderRetrieveRequest {
  orderId: string;
  ownerCode?: string;
  distributionChain?: DistributionChain;
}

export interface OrderRetrieveResponseData {
  order: Order;
}

// ----------------------------------------------------------------------------
// ORDER RESHOP
// ----------------------------------------------------------------------------

export interface OrderReshopRequest {
  orderId: string;
  ownerCode?: string;
  cancelOrder?: boolean;
  cancelOrderItems?: string[];
  flightCriteria?: {
    origin: string;
    destination: string;
    departureDate: string;
  };
  distributionChain?: DistributionChain;
}

export interface OrderReshopResponseData {
  reshopOffers: Offer[];
  penalties?: Amount[];
}

// ----------------------------------------------------------------------------
// ORDER QUOTE
// ----------------------------------------------------------------------------

export interface OrderQuoteRequest {
  orderId: string;
  ownerCode?: string;
  selectedOffers?: SelectedOffer[];
  addServices?: SelectedService[];
  seatSelections?: SeatSelection[];
  distributionChain?: DistributionChain;
}

export interface OrderQuoteResponseData {
  quotedOrder: Order;
  totalCharge?: Amount;
  totalRefund?: Amount;
  requoteOfferId?: string;
}

// ----------------------------------------------------------------------------
// ORDER CHANGE
// ----------------------------------------------------------------------------

export interface OrderChangeRequest {
  orderId: string;
  ownerCode?: string;
  acceptQuotedOffers?: SelectedOffer[];
  cancelUnpaidOrder?: boolean;
  payment?: Payment;
  distributionChain?: DistributionChain;
}

export interface OrderChangeResponseData {
  order: Order;
  refundSummary?: {
    totalRefund: Amount;
    refundMethod: string;
  };
}

// ----------------------------------------------------------------------------
// AIRLINE PROFILE
// ----------------------------------------------------------------------------

export interface AirlineProfileRequest {
  ownerCode: string;
  distributionChain?: DistributionChain;
}

export interface OriginDestinationPair {
  origin: string;
  destination: string;
  directionalInd: string;
}

export interface AirlineProfileResponseData {
  originDestinationPairs: OriginDestinationPair[];
  ownerCode?: string;
}

// ----------------------------------------------------------------------------
// AUTH - NEW
// ----------------------------------------------------------------------------

export interface AuthRequest {
  // Credentials come from headers, this is for any additional params
  forceRefresh?: boolean;
}

export interface AuthResponseData {
  tokenInfo: TokenInfo;
  authenticated: boolean;
}

// ----------------------------------------------------------------------------
// TRANSACTION LOGS
// ----------------------------------------------------------------------------

export interface TransactionSummary {
  transactionId: string;
  correlationId: string;
  operation: string;
  timestamp: string;
  duration: number;
  success: boolean;
  errorCode?: string;
}

export interface TransactionDetail extends TransactionSummary {
  requestXml?: string;
  responseXml?: string;
  errorMessage?: string;
  ndcErrors?: NDCError[];
}