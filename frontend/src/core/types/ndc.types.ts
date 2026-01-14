// ============================================================================
// NDC OPERATION TYPES
// ============================================================================

export type NDCOperation =
  | 'AirShopping'
  | 'ServiceList'
  | 'SeatAvailability'
  | 'OfferPrice'
  | 'OrderCreate'
  | 'OrderRetrieve'
  | 'OrderQuote'
  | 'OrderChange'
  | 'OrderReshop'
  | 'OrderCancel';

export type BookingType = 'DIRECT' | 'BOB';
export type OperationType = 'PRIME' | 'SERVICING';
export type OrderState = 'HOLD' | 'CONFIRMED' | 'CANCELLED';
export type PassengerType = 'ADT' | 'CHD' | 'INF';
export type JourneyDirection = 'outbound' | 'return';

// ============================================================================
// DISTRIBUTION CHAIN
// ============================================================================

export interface Organization {
  orgCode: string;
  orgName: string;
}

export interface DistributionChainParty extends Organization {
  role: 'Seller' | 'Distributor' | 'Carrier';
  ordinal: number;
}

export interface DistributionChain {
  parties: DistributionChainParty[];
}

// ============================================================================
// AUTHENTICATION
// ============================================================================

export type Environment = 'UAT' | 'PROD';

export interface AuthCredentials {
  domain: string;
  apiId: string;
  password: string;
  subscriptionKey: string;
  environment: Environment;
}

export interface AuthSession {
  token: string;
  tokenExpiry: number;
  environment: Environment;
}

// ============================================================================
// JOURNEY & SEGMENT
// ============================================================================

export interface Segment {
  segmentId: string;
  marketingCarrier: string;
  operatingCarrier: string;
  flightNumber: string;
  origin: string;
  destination: string;
  departureDate: string;
  departureTime: string;
  arrivalDate: string;
  arrivalTime: string;
  duration: string;
  cabinClass: string;
  rbd: string;
  equipment?: string;
}

export interface Journey {
  journeyId: string;
  direction: JourneyDirection;
  origin: string;
  destination: string;
  segments: Segment[];
  duration: string;
}

// ============================================================================
// PASSENGER
// ============================================================================

export interface Passenger {
  passengerId: string;
  type: PassengerType;
  title?: string;
  givenName: string;
  middleName?: string;
  surname: string;
  birthDate: string;
  gender: 'M' | 'F';
  passport?: PassportInfo;
  contact?: ContactInfo;
  frequentFlyer?: FrequentFlyerInfo;
  ssrs?: SSR[];
}

export interface PassportInfo {
  number: string;
  issuingCountry: string;
  issueDate: string;
  expiryDate: string;
  citizenship: string;
  residenceCountry?: string;
}

export interface ContactInfo {
  email: string;
  phone: string;
  address?: {
    street: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
}

export interface FrequentFlyerInfo {
  programCode: string;
  number: string;
}

export interface SSR {
  code: string;
  text?: string;
  segmentRef?: string;
}

// ============================================================================
// OFFERS & SERVICES
// ============================================================================

export interface FlightOffer {
  offerId: string;
  offerItemIds: string[];
  journeyRefs: string[];
  totalPrice: number;
  currency: string;
  bundles: BundleOffer[];
  fareDetails: FareDetail[];
}

export interface BundleOffer {
  bundleId: string;
  bundleCode: string;
  bundleName: string;
  bundleTier: number;
  price: number;
  inclusions: BundleInclusion[];
  journeyRef: string;
}

export interface BundleInclusion {
  type: 'baggage' | 'changes' | 'cancellation' | 'seat' | 'meal' | 'priority' | 'other';
  code: string;
  name: string;
  description: string;
  included: boolean;
  feeApplies: boolean;
  value?: string;
}

export interface FareDetail {
  fareBasisCode: string;
  fareClass: string;
  cabinClass: string;
  segmentRef: string;
}

export interface AncillaryService {
  serviceId: string;
  serviceCode: string;
  serviceName: string;
  category: 'baggage' | 'meal' | 'seat' | 'lounge' | 'insurance' | 'other';
  price: number;
  currency: string;
  segmentRefs?: string[];
  journeyRefs?: string[];
}

export interface SeatSelection {
  seatId: string;
  seatNumber: string;
  seatType: 'standard' | 'upfront' | 'extraLegroom' | 'exit' | 'premium';
  price: number;
  currency: string;
  segmentRef: string;
  passengerRef: string;
}

// ============================================================================
// SEAT AVAILABILITY
// ============================================================================

export type SeatCharacteristic =
  | "WINDOW" | "AISLE" | "MIDDLE"
  | "EXIT_ROW" | "EXTRA_LEGROOM" | "BULKHEAD"
  | "QUIET_ZONE" | "BASSINET" | "RECLINE_RESTRICTED"
  | string; // Allow any string for unknown characteristics

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
  price?: {
    value: number;
    currency: string;
  };
}

export interface SeatRow {
  rowNumber: string;
  seats: Seat[];
}

export type CabinType = "M" | "W" | "C" | "F";

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

// ============================================================================
// PAYMENT
// ============================================================================

export type CardType = 'VI' | 'MC' | 'AX' | 'DI';

export interface PaymentInfo {
  cardType: CardType;
  cardNumber: string;
  expiryMonth: string;
  expiryYear: string;
  cvv: string;
  cardholderName: string;
  payerEmail: string;
}

export interface PaymentFeeInfo {
  feeType: 'FIXED' | 'PERCENTAGE';
  fixedAmount?: number;
  percentage?: number;
  calculatedAmount: number;
  currency: string;
}

// ============================================================================
// PRICING
// ============================================================================

export interface PriceBreakdown {
  baseAmount: number;
  taxAmount: number;
  totalAmount: number;
  currency: string;
  fees?: Array<{
    type: string;
    amount: number;
  }>;
}

// ============================================================================
// ORDER
// ============================================================================

export interface Order {
  orderId: string;
  pnr: string;
  status: OrderState;
  createdAt: string;
  journeys: Journey[];
  passengers: Passenger[];
  services: AncillaryService[];
  seats: SeatSelection[];
  pricing: PriceBreakdown;
  distributionChain: DistributionChain;
}
