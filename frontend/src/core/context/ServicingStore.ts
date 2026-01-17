import { create } from 'zustand';

// ============================================
// SERVICING STORE - For OrderView/Servicing Operations
// This store is SEPARATE from prime booking flow
// ============================================

// Leg information (smallest unit of a flight)
export interface LegInfo {
  legId: string;
  departure: {
    airportCode: string;
    airportName?: string;
    terminal?: string;
    date: string;
    time: string;
  };
  arrival: {
    airportCode: string;
    airportName?: string;
    terminal?: string;
    date: string;
    time: string;
  };
  duration?: string;
  aircraftCode?: string;
  aircraftName?: string;
}

// Segment information (marketing flight)
export interface SegmentInfo {
  segmentId: string; // PaxSegmentID
  marketingSegmentId?: string; // MktSegmentID
  departure: {
    airportCode: string;
    airportName?: string;
    terminal?: string;
    date: string;
    time: string;
  };
  arrival: {
    airportCode: string;
    airportName?: string;
    terminal?: string;
    date: string;
    time: string;
  };
  marketingCarrier: {
    code: string;
    name?: string;
    flightNumber: string;
  };
  operatingCarrier?: {
    code: string;
    name?: string;
    flightNumber?: string;
  };
  duration?: string;
  cabinType?: string;
  cabinCode?: string;
  aircraftCode?: string;
  aircraftName?: string;
  legs: LegInfo[];
  status?: string;
}

// Journey information (collection of segments)
export interface JourneyInfo {
  journeyId: string; // PaxJourneyID
  direction: 'OUTBOUND' | 'INBOUND' | 'UNKNOWN';
  origin: string;
  destination: string;
  departureDate: string;
  arrivalDate?: string;
  duration?: string;
  segments: SegmentInfo[];
}

// Travel document
export interface TravelDocument {
  documentType: string; // PT (Passport), ID, etc.
  documentNumber: string;
  issuingCountry?: string;
  expiryDate?: string;
  birthCountry?: string;
}

// Loyalty/Frequent Flyer info
export interface LoyaltyInfo {
  programCode: string;
  programName?: string;
  accountNumber: string;
  tierLevel?: string;
}

// Contact information
export interface ContactInfo {
  emailAddress?: string;
  phoneNumber?: string;
  phoneCountryCode?: string;
  address?: {
    street?: string;
    city?: string;
    postalCode?: string;
    countryCode?: string;
  };
}

// Passenger information
export interface PassengerInfo {
  paxId: string; // PAX1, PAX2, etc.
  paxRefId?: string;
  firstName: string;
  lastName: string;
  middleName?: string;
  title?: string;
  gender?: string;
  dateOfBirth?: string;
  passengerType: string; // ADT, CHD, INF
  travelDocuments: TravelDocument[];
  loyaltyPrograms: LoyaltyInfo[];
  contactInfo?: ContactInfo;
  infantAssociatedAdult?: string;
}

// Service/OrderItem information
export interface ServiceInfo {
  orderItemId: string;
  serviceId?: string;
  serviceCode: string;
  serviceName: string;
  serviceDescription?: string;
  serviceType: 'FLIGHT' | 'BAGGAGE' | 'SEAT' | 'MEAL' | 'BUNDLE' | 'SSR' | 'ANCILLARY' | 'OTHER';
  status: string;
  price: {
    amount: number;
    currency: string;
    taxAmount?: number;
    totalAmount?: number;
  };
  quantity?: number;
  paxIds: string[]; // Which passengers this service applies to
  segmentIds: string[]; // Which segments this service applies to
  seatDetails?: {
    seatNumber: string;
    column?: string;
    row?: string;
    characteristics?: string[];
  };
  baggageDetails?: {
    weight?: number;
    weightUnit?: string;
    pieceCount?: number;
    baggageType?: string;
  };
  mealDetails?: {
    mealCode?: string;
    mealDescription?: string;
  };
  ssrDetails?: {
    ssrCode?: string;
    ssrText?: string;
  };
  rawData?: Record<string, unknown>; // Original data for debugging
}

// Payment information
export interface PaymentInfo {
  paymentId: string;
  paymentMethod: string; // CC, CA, TP, etc.
  paymentMethodName?: string;
  amount: number;
  currency: string;
  status: string;
  cardDetails?: {
    cardType?: string;
    maskedNumber?: string;
    expiryDate?: string;
    holderName?: string;
  };
  paymentDate?: string;
  approvalCode?: string;
}

// Ticket/Coupon information
export interface TicketInfo {
  ticketNumber: string;
  ticketDocType?: string;
  issuingAirline?: string;
  issueDate?: string;
  coupons: {
    couponNumber: string;
    segmentId?: string;
    status?: string;
  }[];
}

// Remarks/Notes
export interface RemarkInfo {
  remarkType: string;
  remarkText: string;
  remarkCategory?: string;
}

// Complete booking data structure for servicing
export interface ServicingBookingData {
  // Order identifiers
  orderId: string;
  orderVersion?: string;
  pnrLocator?: string;
  airlineRecordLocator?: string;
  ownerCode?: string;
  ownerName?: string;

  // Status
  orderStatus: string;
  creationDate?: string;
  lastModifiedDate?: string;

  // Journey/Flight data
  journeys: JourneyInfo[];

  // All segments flat (for quick lookup)
  allSegments: SegmentInfo[];

  // Passenger data
  passengers: PassengerInfo[];

  // Contact (primary contact for booking)
  primaryContact?: ContactInfo;

  // Services/Order items
  services: ServiceInfo[];

  // Payment data
  payments: PaymentInfo[];

  // Tickets
  tickets: TicketInfo[];

  // Remarks
  remarks: RemarkInfo[];

  // Pricing summary
  pricingSummary: {
    baseFare: number;
    taxes: number;
    fees: number;
    totalAmount: number;
    currency: string;
    paidAmount?: number;
    dueAmount?: number;
  };

  // Raw XML response (for debugging/developer view)
  rawResponse?: string;

  // Timestamp when data was loaded
  loadedAt: string;
}

// Store state interface
interface ServicingState {
  // Current booking data
  bookingData: ServicingBookingData | null;

  // Loading state
  isLoading: boolean;
  error: string | null;

  // Actions
  setBookingData: (data: ServicingBookingData) => void;
  clearBookingData: () => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;

  // Computed getters
  getPassenger: (paxId: string) => PassengerInfo | undefined;
  getSegment: (segmentId: string) => SegmentInfo | undefined;
  getServicesForPassenger: (paxId: string) => ServiceInfo[];
  getServicesForSegment: (segmentId: string) => ServiceInfo[];
  getServicesForPassengerOnSegment: (paxId: string, segmentId: string) => ServiceInfo[];
  getJourneyForSegment: (segmentId: string) => JourneyInfo | undefined;
}

export const useServicingStore = create<ServicingState>()((set, get) => ({
  // Initial state
  bookingData: null,
  isLoading: false,
  error: null,

  // Actions
  setBookingData: (data) => {
    console.log('[ServicingStore] Setting booking data:', {
      orderId: data.orderId,
      pnr: data.pnrLocator,
      journeys: data.journeys.length,
      passengers: data.passengers.length,
      services: data.services.length,
    });
    set({ bookingData: data, error: null });
  },

  clearBookingData: () => {
    console.log('[ServicingStore] Clearing booking data');
    set({ bookingData: null, error: null });
  },

  setLoading: (loading) => set({ isLoading: loading }),

  setError: (error) => set({ error }),

  // Getters
  getPassenger: (paxId) => {
    const { bookingData } = get();
    return bookingData?.passengers.find(p => p.paxId === paxId);
  },

  getSegment: (segmentId) => {
    const { bookingData } = get();
    return bookingData?.allSegments.find(s => s.segmentId === segmentId);
  },

  getServicesForPassenger: (paxId) => {
    const { bookingData } = get();
    return bookingData?.services.filter(s => s.paxIds.includes(paxId)) || [];
  },

  getServicesForSegment: (segmentId) => {
    const { bookingData } = get();
    return bookingData?.services.filter(s => s.segmentIds.includes(segmentId)) || [];
  },

  getServicesForPassengerOnSegment: (paxId, segmentId) => {
    const { bookingData } = get();
    return bookingData?.services.filter(
      s => s.paxIds.includes(paxId) && s.segmentIds.includes(segmentId)
    ) || [];
  },

  getJourneyForSegment: (segmentId) => {
    const { bookingData } = get();
    return bookingData?.journeys.find(j =>
      j.segments.some(s => s.segmentId === segmentId)
    );
  },
}));

// Hook for easy access to booking data
export function useServicingBooking() {
  const store = useServicingStore();
  return {
    bookingData: store.bookingData,
    isLoading: store.isLoading,
    error: store.error,
    setBookingData: store.setBookingData,
    clearBookingData: store.clearBookingData,
    setLoading: store.setLoading,
    setError: store.setError,
  };
}

// Hook for passenger operations
export function useServicingPassengers() {
  const store = useServicingStore();
  return {
    passengers: store.bookingData?.passengers || [],
    getPassenger: store.getPassenger,
    getServicesForPassenger: store.getServicesForPassenger,
  };
}

// Hook for journey/segment operations
export function useServicingJourneys() {
  const store = useServicingStore();
  return {
    journeys: store.bookingData?.journeys || [],
    allSegments: store.bookingData?.allSegments || [],
    getSegment: store.getSegment,
    getServicesForSegment: store.getServicesForSegment,
    getJourneyForSegment: store.getJourneyForSegment,
  };
}

// Hook for service operations
export function useServicingServices() {
  const store = useServicingStore();
  return {
    services: store.bookingData?.services || [],
    getServicesForPassenger: store.getServicesForPassenger,
    getServicesForSegment: store.getServicesForSegment,
    getServicesForPassengerOnSegment: store.getServicesForPassengerOnSegment,
  };
}
