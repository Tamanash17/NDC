// ============================================================================
// NDC DOMAIN TYPES - FIXED
// Core type definitions for NDC 21.3 operations aligned with schemas/builders
// ============================================================================

// ----------------------------------------------------------------------------
// COMMON TYPES
// ----------------------------------------------------------------------------

export type PTCType = "ADT" | "CHD" | "INF";
export type GenderCode = "M" | "F" | "U";
export type PaymentType = "CC" | "CA" | "AGT" | "OT";
export type CardBrand = "VI" | "MC" | "AX" | "DC" | "JC" | "UP";
export type CabinType = "M" | "W" | "C" | "F";
export type TripType = "ONE_WAY" | "ROUND_TRIP" | "OPEN_JAW" | "MULTI_CITY";

export interface Amount {
  value: number;
  currency: string;
}

export interface DateRange {
  start: string;
  end?: string;
}

// ----------------------------------------------------------------------------
// CREDENTIALS (Multi-Tenant)
// ----------------------------------------------------------------------------

export interface NDCCredentials {
  domain: string;
  apiId: string;
  password: string;
  subscriptionKey: string;
}

// ----------------------------------------------------------------------------
// TOKEN LIFECYCLE
// ----------------------------------------------------------------------------

export type TokenStatus = "VALID" | "EXPIRING_SOON" | "EXPIRED" | "NONE";

export interface TokenInfo {
  status: TokenStatus;
  expiresIn: number;
  expiresAt: string;
  credentialHash: string;
}

export interface AuthToken {
  token: string;
  expiresAt: Date;
  credentialHash: string;
}

// ----------------------------------------------------------------------------
// DISTRIBUTION CHAIN - FIXED: Matches validation schema
// ----------------------------------------------------------------------------

export interface DistributionChainLink {
  ordinal: number;
  orgRole: string;
  orgId: string;
  orgName?: string;
  countryCode?: string;
  cityCode?: string;
}

export interface DistributionChain {
  ownerCode: string;
  links: DistributionChainLink[];
}

// ----------------------------------------------------------------------------
// POINT OF SALE
// ----------------------------------------------------------------------------

export interface PointOfSale {
  location: {
    countryCode: string;
    cityCode?: string;
  };
  requestTime?: string;
  touchPoint?: {
    device?: {
      code?: string;
    };
  };
}

// ----------------------------------------------------------------------------
// PASSENGER - FIXED: Aligned with validation schema
// ----------------------------------------------------------------------------

export interface PassengerIdentityDoc {
  type: "PP" | "NI" | "DL";
  number: string;
  issuingCountry: string;
  expiryDate: string;
  nationality?: string;
}

export interface PassengerLoyalty {
  programOwner: string;
  accountNumber: string;
  tierLevel?: string;
}

export interface Passenger {
  paxId?: string;
  ptc: PTCType;
  title?: string;
  givenName: string;
  middleName?: string;
  surname: string;
  birthdate: string;
  gender: GenderCode;
  email?: string;
  phone?: string;
  identityDoc?: PassengerIdentityDoc;
  loyalty?: PassengerLoyalty;
  infantAssocPaxId?: string;
}

export interface PassengerCount {
  ptc: PTCType;
  count: number;
}

// ----------------------------------------------------------------------------
// FLIGHT & JOURNEY
// ----------------------------------------------------------------------------

export interface FlightSegment {
  paxSegmentId?: string;
  origin: string;
  destination: string;
  departureDate: string;
  departureTime?: string;
  arrivalDate?: string;
  arrivalTime?: string;
  marketingCarrier?: {
    airlineCode: string;
    flightNumber: string;
  };
  operatingCarrier?: {
    airlineCode: string;
    flightNumber?: string;
  };
  equipment?: {
    aircraftCode: string;
    aircraftName?: string;
  };
  duration?: string;
  cabinCode?: string;
  classOfService?: string;
  fareBasisCode?: string;
}

export interface PaxJourney {
  paxJourneyId: string;
  segmentRefIds: string[];
  duration?: string;
}

// ----------------------------------------------------------------------------
// OFFERS - FIXED: Aligned with schemas
// ----------------------------------------------------------------------------

// Individual tax/fee item for itemized breakdown
export interface TaxFeeItem {
  code: string;      // Tax/Fee code (e.g., WG, QR, AU)
  name: string;      // Descriptive name
  amount: number;    // Amount value
  currency: string;  // Currency code
}

export interface OfferItem {
  offerItemId: string;
  paxRefIds: string[];
  baseAmount?: Amount;
  taxAmount?: Amount;
  totalAmount: Amount;
  fareBasisCode?: string;
  cabinType?: string;  // Cabin code (5=Economy, 4=Business, etc.)
  rbd?: string;  // Reservation Booking Designator (class of service)
  segmentRefIds?: string[];
  taxItems?: TaxFeeItem[];  // Individual tax/fee breakdown items
}

// Bundle inclusion (service included in a bundle)
export interface BundleInclusion {
  serviceCode: string;
  name: string;
  description?: string;
}

// Bundle offer item (from AddlOfferItem in AirShopping response)
export interface BundleOfferItem {
  offerItemId: string;
  serviceDefinitionRefId: string;
  serviceCode: string;
  bundleName: string;
  description?: string;
  price: Amount;
  paxRefIds: string[];
  // Per-passenger-type offerItemIds - bundles have different IDs for ADT, CHD, INF
  // Key is paxRefId (e.g., "ADT0", "CHD0"), value is the offerItemId for that passenger
  paxOfferItemIds?: Record<string, string>;
  // Journey ref from ALaCarteOffer Eligibility - MUST use this for OfferPrice requests
  // Format: e.g., "fl913653037" - this is different from PaxJourneyID in PaxJourneyList
  journeyRefId?: string;  // First journey ref (for backward compatibility)
  journeyRefIds?: string[];  // ALL journey refs this bundle applies to (for round trips with same bundle)
  // Inclusions parsed from ServiceBundle/ServiceDefinitionRefID
  inclusions?: {
    baggage: BundleInclusion[];
    seats: BundleInclusion[];
    meals: BundleInclusion[];
    other: BundleInclusion[];
  };
}

export interface Offer {
  offerId: string;
  ownerCode: string;
  responseId?: string;
  totalPrice: Amount;
  expirationDateTime?: string;
  offerItems: OfferItem[];
  bundleOffers?: BundleOfferItem[]; // Bundle add-ons from AddlOfferItem
}

// Per-item selection with its associated passenger(s)
export interface SelectedOfferItem {
  offerItemId: string;
  paxRefIds: string[];
  // A la carte (ancillary/SSR) properties
  isALaCarte?: boolean;
  quantity?: number;
  // Flight association - one of segment, journey, or leg based on service type
  associationType?: 'segment' | 'journey' | 'leg';
  segmentRefIds?: string[];
  journeyRefIds?: string[];
  legRefIds?: string[];
  // Service type for identifying seats
  serviceType?: string;
  // Seat-specific fields for OfferPrice <SelectedSeat> element
  seatRow?: string;
  seatColumn?: string;
}

export interface SelectedOffer {
  offerId: string;
  ownerCode: string;
  // New structure: each item has its own paxRefIds
  offerItems: SelectedOfferItem[];
  // Legacy field - kept for backward compatibility
  offerItemIds?: string[];
  responseId?: string;
  // Legacy field - replaced by per-item paxRefIds
  paxRefIds?: string[];
}

// ----------------------------------------------------------------------------
// ANCILLARIES & SERVICES
// ----------------------------------------------------------------------------

export type ServiceType = "BAGGAGE" | "SEAT" | "MEAL" | "LOUNGE" | "INSURANCE" | "BUNDLE" | "SSR" | "OTHER";

export interface ServiceDefinition {
  serviceId: string;
  serviceCode: string;
  serviceName: string;
  serviceType: ServiceType;
  description?: string;
  // RFIC and RFISC for SSR identification
  rfic?: string;
  rfisc?: string;
}

export interface AncillaryOffer {
  offerId: string;
  offerItemId?: string;
  ownerCode: string;
  serviceRefId: string;
  serviceName?: string;
  serviceCode?: string;
  serviceType?: ServiceType;
  paxRefIds: string[];
  segmentRefIds?: string[];
  journeyRefIds?: string[];
  legRefIds?: string[];
  associationType?: 'segment' | 'journey' | 'leg' | 'unknown';
  price: Amount;
  // Per-passenger offerItemIds - bundles have different IDs for ADT, CHD, INF
  paxOfferItemIds?: Record<string, string>;
}

export interface SelectedService {
  serviceId: string;
  paxRefId: string;
  segmentRefId?: string;
  quantity?: number;
}

// ----------------------------------------------------------------------------
// SEATS - FIXED: Aligned with schemas
// ----------------------------------------------------------------------------

export type SeatCharacteristic =
  | "WINDOW" | "AISLE" | "MIDDLE"
  | "EXIT_ROW" | "EXTRA_LEGROOM" | "BULKHEAD"
  | "QUIET_ZONE" | "BASSINET" | "RECLINE_RESTRICTED";

export type SeatOccupationStatus = "F" | "O" | "Z";

export interface Seat {
  seatId?: string;
  columnId: string;
  rowNumber: string;
  occupationStatus: SeatOccupationStatus;
  characteristics: SeatCharacteristic[];
  // Passenger-type-specific OfferItemIDs (e.g., { ADT: "...-5", CHD: "...-6" })
  // Jetstar returns different OfferItemIDs for same seat based on passenger type eligibility
  offerItemIdsByPaxType?: Record<string, string>;
  price?: Amount;
}

export interface SeatRow {
  rowNumber: string;
  seats: Seat[];
}

export interface CabinCompartment {
  cabinTypeCode: CabinType;
  firstRow: number;
  lastRow: number;
  columnLayout: string;
  seatRows: SeatRow[];
}

export interface SeatMap {
  paxSegmentRefId: string;
  cabinCompartments: CabinCompartment[];
}

export interface SeatSelection {
  paxRefId: string;
  paxSegmentRefId: string;
  column: string;
  row: string;
  seatId?: string;
  offerItemId?: string;
}

// ----------------------------------------------------------------------------
// PAYMENT - FIXED: Aligned with validation schema
// ----------------------------------------------------------------------------

export interface CardPayment {
  brand: CardBrand;
  number: string;
  expiryDate: string;
  cvv?: string;
  holderName: string;
  billingAddress?: {
    street?: string;
    city?: string;
    postalCode?: string;
    countryCode: string;
  };
}

export interface AgencyPayment {
  iataNumber?: string;
  accountNumber?: string;
}

export interface Payment {
  type: PaymentType;
  amount: Amount;
  card?: CardPayment;
  agency?: AgencyPayment;
  remarks?: string;
}

// ----------------------------------------------------------------------------
// CONTACT
// ----------------------------------------------------------------------------

export interface Contact {
  email: string;
  phone?: {
    countryCode?: string;
    number: string;
  };
  address?: {
    street?: string;
    city?: string;
    postalCode?: string;
    countryCode: string;
  };
}

// ----------------------------------------------------------------------------
// ORDER
// ----------------------------------------------------------------------------

export type OrderStatus =
  | "PENDING" | "CONFIRMED" | "TICKETED" | "OPENED"
  | "CANCELLED" | "REFUNDED" | "PARTIALLY_CANCELLED";

export interface BookingReference {
  id: string;
  carrier?: string;
  type?: "PNR" | "CONF" | "TKT";
}

export interface OrderItem {
  orderItemId: string;
  statusCode: string;
  totalAmount: Amount;
  paxRefIds: string[];
  serviceRefIds?: string[];
}

export interface Order {
  orderId: string;
  ownerCode: string;
  status: OrderStatus;
  creationDateTime?: string;
  paymentTimeLimit?: string;
  totalPrice: Amount;
  bookingReferences: BookingReference[];
  orderItems: OrderItem[];
  passengers: Passenger[];
  journeys?: PaxJourney[];
  segments?: FlightSegment[];
}

// ----------------------------------------------------------------------------
// NDC ERRORS
// ----------------------------------------------------------------------------

export interface NDCError {
  code: string;
  message: string;
  shortText?: string;
  ownerCode?: string;
}

// ----------------------------------------------------------------------------
// NDC OPERATIONS
// ----------------------------------------------------------------------------

export type NDCOperation =
  | "Auth"
  | "AirShopping"
  | "OfferPrice"
  | "ServiceList"
  | "SeatAvailability"
  | "OrderCreate"
  | "OrderRetrieve"
  | "OrderReshop"
  | "OrderQuote"
  | "OrderChange";