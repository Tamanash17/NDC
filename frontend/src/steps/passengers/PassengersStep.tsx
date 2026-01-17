import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWorkflow } from '@/core/engines';
import { useFlightSelectionStore, type FlightSelectionItem } from '@/hooks/useFlightSelection';
import { useXmlViewer } from '@/core/context/XmlViewerContext';
import { useDistributionContext } from '@/core/context/SessionStore';
import { orderCreate } from '@/lib/ndc-api';
import { Card, Input, Select, Alert } from '@/components/ui';
import { User, Mail, Phone, ArrowLeft, ChevronRight, Wand2, CreditCard, Plane, Loader2, CheckCircle, Wallet, Clock, Calendar, AlertTriangle, Search, FileText, Plus, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import { formatCurrency } from '@/lib/format';
import type { FlightSegment } from '@/components/flights';

// Test passenger data for auto-populate feature
// This provides sample data for testing the booking flow quickly
const TEST_PASSENGERS = {
  adults: [
    {
      title: 'MR', firstName: 'John', middleName: 'William', lastName: 'Smith', dateOfBirth: '1985-03-15', gender: 'M' as const,
      residenceCountry: 'AU',
      passport: { number: 'PA1234567', issuingCountry: 'AU', issueDate: '2020-03-15', expiryDate: '2030-03-15', citizenship: 'AU' },
      frequentFlyer: { number: 'FF123456789' },
    },
    {
      title: 'MRS', firstName: 'Jane', middleName: 'Marie', lastName: 'Smith', dateOfBirth: '1987-07-22', gender: 'F' as const,
      residenceCountry: 'AU',
      passport: { number: 'PA2345678', issuingCountry: 'AU', issueDate: '2019-07-22', expiryDate: '2029-07-22', citizenship: 'AU' },
      frequentFlyer: { number: 'FF987654321' },
    },
    {
      title: 'MR', firstName: 'Robert', middleName: 'James', lastName: 'Johnson', dateOfBirth: '1990-11-08', gender: 'M' as const,
      residenceCountry: 'AU',
      passport: { number: 'PA3456789', issuingCountry: 'AU', issueDate: '2018-11-08', expiryDate: '2028-11-08', citizenship: 'AU' },
      frequentFlyer: { number: 'FF1000000002' },
    },
    {
      title: 'MS', firstName: 'Emily', middleName: 'Rose', lastName: 'Davis', dateOfBirth: '1992-05-30', gender: 'F' as const,
      residenceCountry: 'AU',
      passport: { number: 'PA4567890', issuingCountry: 'AU', issueDate: '2021-05-30', expiryDate: '2031-05-30', citizenship: 'AU' },
      frequentFlyer: { number: 'FF1000000003' },
    },
  ],
  children: [
    {
      title: 'MISS', firstName: 'Sophie', middleName: 'Grace', lastName: 'Smith', dateOfBirth: '2015-09-12', gender: 'F' as const,
      residenceCountry: 'AU',
      passport: { number: 'PC1234567', issuingCountry: 'AU', issueDate: '2021-09-12', expiryDate: '2027-09-12', citizenship: 'AU' },
    },
    {
      title: 'MR', firstName: 'Oliver', middleName: 'Thomas', lastName: 'Smith', dateOfBirth: '2017-02-28', gender: 'M' as const,
      residenceCountry: 'AU',
      passport: { number: 'PC2345678', issuingCountry: 'AU', issueDate: '2022-02-28', expiryDate: '2028-02-28', citizenship: 'AU' },
    },
    {
      title: 'MISS', firstName: 'Emma', middleName: 'Claire', lastName: 'Johnson', dateOfBirth: '2016-06-14', gender: 'F' as const,
      residenceCountry: 'AU',
      passport: { number: 'PC3456789', issuingCountry: 'AU', issueDate: '2021-06-14', expiryDate: '2027-06-14', citizenship: 'AU' },
    },
  ],
  infants: [
    {
      title: 'MR', firstName: 'Baby', middleName: 'Lee', lastName: 'Smith', dateOfBirth: '2024-01-20', gender: 'M' as const,
      residenceCountry: 'AU',
      passport: { number: 'PI1234567', issuingCountry: 'AU', issueDate: '2024-01-20', expiryDate: '2029-01-20', citizenship: 'AU' },
    },
    {
      title: 'MISS', firstName: 'Lily', middleName: 'Ann', lastName: 'Johnson', dateOfBirth: '2023-11-05', gender: 'F' as const,
      residenceCountry: 'AU',
      passport: { number: 'PI2345678', issuingCountry: 'AU', issueDate: '2023-11-05', expiryDate: '2028-11-05', citizenship: 'AU' },
    },
  ],
  contact: {
    email: 'tamanash_bciit@yahoo.com',
    phone: '412345678',
    countryCode: '+61',
    postalAddress: {
      street: '123 Main Street',
      city: 'Sydney',
      state: 'NSW',
      postalCode: '2000',
      country: 'AU',
    },
  },
};

interface PassportForm {
  number: string;
  issuingCountry: string;
  issueDate: string;
  expiryDate: string;
  citizenship: string;
}

interface FrequentFlyerForm {
  number: string;  // Each adult has their own FF number
}

interface PassengerForm {
  paxId: string;
  ptc: 'ADT' | 'CHD' | 'INF';
  title: string;
  firstName: string;
  middleName?: string;
  lastName: string;
  dateOfBirth: string;
  gender: 'M' | 'F' | '';
  residenceCountry?: string;
  passport?: PassportForm;
  frequentFlyer?: FrequentFlyerForm;
}

interface PostalAddress {
  street: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

interface ContactForm {
  email: string;
  phone: string;
  countryCode: string;
  postalAddress?: PostalAddress;
}

// Manual passive segment entry
interface ManualPassiveSegment {
  id: string;
  origin: string;
  destination: string;
  departureDate: string;
  departureTime: string;
  arrivalTime: string;
  flightNumber: string;
  marketingCarrier: string;
  operatingCarrier: string;
  rbd: string;
}

const TITLES = [
  { value: 'MR', label: 'Mr' },
  { value: 'MRS', label: 'Mrs' },
  { value: 'MS', label: 'Ms' },
  { value: 'MISS', label: 'Miss' },
  { value: 'DR', label: 'Dr' },
];

const COUNTRY_CODES = [
  { value: '+61', label: 'Australia (+61)' },
  { value: '+64', label: 'New Zealand (+64)' },
  { value: '+65', label: 'Singapore (+65)' },
  { value: '+81', label: 'Japan (+81)' },
  { value: '+1', label: 'USA/Canada (+1)' },
  { value: '+44', label: 'UK (+44)' },
];

const COUNTRIES = [
  { value: 'AU', label: 'Australia' },
  { value: 'NZ', label: 'New Zealand' },
  { value: 'SG', label: 'Singapore' },
  { value: 'JP', label: 'Japan' },
  { value: 'US', label: 'United States' },
  { value: 'GB', label: 'United Kingdom' },
  { value: 'IN', label: 'India' },
  { value: 'CN', label: 'China' },
  { value: 'ID', label: 'Indonesia' },
  { value: 'MY', label: 'Malaysia' },
  { value: 'TH', label: 'Thailand' },
  { value: 'PH', label: 'Philippines' },
  { value: 'VN', label: 'Vietnam' },
];

export function PassengersStep() {
  const navigate = useNavigate();
  const { context, updateContext, nextStep, prevStep } = useWorkflow();
  const flightStore = useFlightSelectionStore();
  const distributionContext = useDistributionContext();

  // Initialize passengers from flight selection store (preferred) or context
  // Ensure paxCount has a fallback to prevent undefined errors
  const searchCriteria = flightStore.searchCriteria;
  const searchParams = context?.searchParams as { passengers?: { adults?: number; children?: number; infants?: number } } | undefined;

  const rawPaxCount = searchCriteria?.passengers || searchParams?.passengers;
  const paxCount = {
    adults: rawPaxCount?.adults ?? 1,
    children: rawPaxCount?.children ?? 0,
    infants: rawPaxCount?.infants ?? 0,
  };
  const totalPax = paxCount.adults + paxCount.children + paxCount.infants;

  const initialPassengers: PassengerForm[] = [];
  let paxIndex = 1;

  for (let i = 0; i < paxCount.adults; i++) {
    initialPassengers.push({
      paxId: `PAX${paxIndex++}`,
      ptc: 'ADT',
      title: '',
      firstName: '',
      lastName: '',
      dateOfBirth: '',
      gender: '',
    });
  }
  for (let i = 0; i < paxCount.children; i++) {
    initialPassengers.push({
      paxId: `PAX${paxIndex++}`,
      ptc: 'CHD',
      title: '',
      firstName: '',
      lastName: '',
      dateOfBirth: '',
      gender: '',
    });
  }
  for (let i = 0; i < paxCount.infants; i++) {
    initialPassengers.push({
      paxId: `PAX${paxIndex++}`,
      ptc: 'INF',
      title: '',
      firstName: '',
      lastName: '',
      dateOfBirth: '',
      gender: '',
    });
  }

  const [passengers, setPassengers] = useState<PassengerForm[]>(
    (context as any)?.passengers || initialPassengers
  );
  const [contact, setContact] = useState<ContactForm>(
    (context as any)?.contact || { email: '', phone: '', countryCode: '+61' }
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [autoPopulate, setAutoPopulate] = useState(false);
  const [includePassiveSegments, setIncludePassiveSegments] = useState(false);
  const [passiveSegmentsExpanded, setPassiveSegmentsExpanded] = useState(true);
  const [manualPassiveSegments, setManualPassiveSegments] = useState<ManualPassiveSegment[]>([
    {
      id: crypto.randomUUID(),
      origin: '',
      destination: '',
      departureDate: '',
      departureTime: '',
      arrivalTime: '',
      flightNumber: '',
      marketingCarrier: 'QF',
      operatingCarrier: 'QF',
      rbd: 'Y',
    },
  ]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [bookingResult, setBookingResult] = useState<any>(null);
  const [bookingError, setBookingError] = useState<string | null>(null);

  const { addCapture } = useXmlViewer();

  // Passive segment helper functions
  const addPassiveSegment = () => {
    setManualPassiveSegments(prev => [
      ...prev,
      {
        id: crypto.randomUUID(),
        origin: '',
        destination: '',
        departureDate: '',
        departureTime: '',
        arrivalTime: '',
        flightNumber: '',
        marketingCarrier: 'QF',
        operatingCarrier: 'QF',
        rbd: 'Y',
      },
    ]);
  };

  const removePassiveSegment = (id: string) => {
    setManualPassiveSegments(prev => prev.filter(seg => seg.id !== id));
  };

  const updatePassiveSegment = (id: string, field: keyof ManualPassiveSegment, value: string) => {
    setManualPassiveSegments(prev =>
      prev.map(seg =>
        seg.id === id ? { ...seg, [field]: value } : seg
      )
    );
  };

  /**
   * Build passive segments from manual user entry
   * Converts manual segment entries to API format
   */
  const buildPassiveSegments = () => {
    // Filter out incomplete segments and convert to API format
    return manualPassiveSegments
      .filter(seg => seg.origin && seg.destination && seg.departureDate && seg.departureTime && seg.flightNumber)
      .map((seg, index) => ({
        segmentId: `passive-${index + 1}`,
        origin: seg.origin.toUpperCase(),
        destination: seg.destination.toUpperCase(),
        departureDateTime: `${seg.departureDate}T${seg.departureTime}:00`,
        arrivalDateTime: `${seg.departureDate}T${seg.arrivalTime || seg.departureTime}:00`,
        flightNumber: seg.flightNumber,
        operatingCarrier: seg.operatingCarrier || 'QF',
        marketingCarrier: seg.marketingCarrier || 'QF',
        journeyId: `passive-journey-${index + 1}`,
        rbd: seg.rbd || 'Y',
      }));
  };

  // Auto-populate passenger details from test data
  const handleAutoPopulate = (checked: boolean) => {
    setAutoPopulate(checked);

    if (checked) {
      // Fill passengers with test data based on their type
      let adultIdx = 0;
      let childIdx = 0;
      let infantIdx = 0;

      const filledPassengers = passengers.map((pax) => {
        let testData;
        if (pax.ptc === 'ADT') {
          testData = TEST_PASSENGERS.adults[adultIdx % TEST_PASSENGERS.adults.length];
          adultIdx++;
        } else if (pax.ptc === 'CHD') {
          testData = TEST_PASSENGERS.children[childIdx % TEST_PASSENGERS.children.length];
          childIdx++;
        } else {
          testData = TEST_PASSENGERS.infants[infantIdx % TEST_PASSENGERS.infants.length];
          infantIdx++;
        }

        return {
          ...pax,
          title: testData.title,
          firstName: testData.firstName,
          middleName: 'middleName' in testData ? testData.middleName : undefined,
          lastName: testData.lastName,
          dateOfBirth: testData.dateOfBirth,
          gender: testData.gender,
          residenceCountry: 'residenceCountry' in testData ? testData.residenceCountry : undefined,
          passport: testData.passport,
          frequentFlyer: 'frequentFlyer' in testData ? testData.frequentFlyer : undefined,
        };
      });

      setPassengers(filledPassengers);
      setContact(TEST_PASSENGERS.contact);
      setErrors({}); // Clear any validation errors
    } else {
      // Clear all fields when unchecked
      setPassengers(initialPassengers);
      setContact({ email: '', phone: '', countryCode: '+61' });
    }
  };

  const updatePassenger = (index: number, field: keyof PassengerForm, value: string) => {
    setPassengers(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
    // Clear error for this field
    setErrors(prev => {
      const { [`pax${index}_${field}`]: _, ...rest } = prev;
      return rest;
    });
  };

  const updatePassengerPassport = (index: number, field: keyof PassportForm, value: string) => {
    setPassengers(prev => {
      const updated = [...prev];
      updated[index] = {
        ...updated[index],
        passport: { ...updated[index].passport, [field]: value } as PassportForm,
      };
      return updated;
    });
  };

  const updatePassengerFF = (index: number, field: keyof FrequentFlyerForm, value: string) => {
    setPassengers(prev => {
      const updated = [...prev];
      updated[index] = {
        ...updated[index],
        frequentFlyer: { ...updated[index].frequentFlyer, [field]: value } as FrequentFlyerForm,
      };
      return updated;
    });
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};
    
    passengers.forEach((pax, idx) => {
      if (!pax.title) newErrors[`pax${idx}_title`] = 'Required';
      if (!pax.firstName) newErrors[`pax${idx}_firstName`] = 'Required';
      if (!pax.lastName) newErrors[`pax${idx}_lastName`] = 'Required';
      if (!pax.dateOfBirth) newErrors[`pax${idx}_dateOfBirth`] = 'Required';
      if (!pax.gender) newErrors[`pax${idx}_gender`] = 'Required';
    });

    if (!contact.email) newErrors['contact_email'] = 'Required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email)) {
      newErrors['contact_email'] = 'Invalid email';
    }
    if (!contact.phone) newErrors['contact_phone'] = 'Required';

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleContinue = async () => {
    if (!validateForm()) return;

    setIsProcessing(true);
    setBookingError(null);
    const startTime = Date.now();

    try {
      // Build passengers for API
      // PaxID must match the paxRefIds used in OfferPrice response (ADT0, ADT1, CHD0, CHD1, INF0, etc.)
      let adtIdx = 0, chdIdx = 0, infIdx = 0;
      const apiPassengers = passengers.map(p => {
        let paxId: string;
        if (p.ptc === 'ADT') {
          paxId = `ADT${adtIdx++}`;
        } else if (p.ptc === 'CHD') {
          paxId = `CHD${chdIdx++}`;
        } else {
          paxId = `INF${infIdx++}`;
        }

        return {
          paxId,
          ptc: p.ptc,
          title: p.title,
          givenName: p.firstName,
          middleName: p.middleName || undefined,
          surname: p.lastName,
          birthdate: p.dateOfBirth,
          gender: p.gender as 'M' | 'F',
          identityDoc: p.passport?.number ? {
            type: 'PP' as const,
            number: p.passport.number,
            issuingCountry: p.passport.issuingCountry,
            expiryDate: p.passport.expiryDate,
            nationality: p.passport.citizenship,
          } : undefined,
          loyalty: p.frequentFlyer?.number ? {
            programOwner: 'QF',
            accountNumber: p.frequentFlyer.number,
          } : undefined,
        };
      });

      // Build contact for API
      const apiContact = {
        email: contact.email,
        phone: {
          countryCode: contact.countryCode,
          number: contact.phone,
        },
        address: contact.postalAddress?.street ? {
          street: contact.postalAddress.street,
          city: contact.postalAddress.city,
          postalCode: contact.postalAddress.postalCode,
          countryCode: contact.postalAddress.country,
        } : undefined,
      };

      // Get offer data from store - use OfferPrice data (pricedOffers) for accurate offerItems
      const offerPriceData = flightStore.offerPriceData;
      const selectedOutbound = flightStore.selectedOutbound;
      const selectedInbound = flightStore.selectedInbound;

      // Build selectedOffers array - use OfferPrice data from store (has accurate offerItemIds)
      const selectedOffers: any[] = [];

      if (offerPriceData?.offerItems && offerPriceData.offerItems.length > 0) {
        // Use OfferPrice data from store (preferred - has accurate offerItemIds and paxRefIds)
        selectedOffers.push({
          offerId: offerPriceData.offerId,
          ownerCode: offerPriceData.ownerCode || 'JQ',
          offerItems: offerPriceData.offerItems.map((item: any) => ({
            offerItemId: item.offerItemId,
            paxRefIds: item.paxRefIds,
          })),
        });
      } else {
        // Fallback to flight selection data
        if (selectedOutbound) {
          selectedOffers.push({
            offerId: selectedOutbound.offerId,
            ownerCode: selectedOutbound.ownerCode || 'JQ',
            offerItemIds: selectedOutbound.bundleOfferItemId
              ? [selectedOutbound.bundleOfferItemId]
              : selectedOutbound.offerItemIds || [],
          });
        }
        if (selectedInbound) {
          selectedOffers.push({
            offerId: selectedInbound.offerId,
            ownerCode: selectedInbound.ownerCode || 'JQ',
            offerItemIds: selectedInbound.bundleOfferItemId
              ? [selectedInbound.bundleOfferItemId]
              : selectedInbound.offerItemIds || [],
          });
        }
      }

      // Build distribution chain from distribution context (set in wizard)
      const distributionChain = distributionContext.isValid ? {
        links: distributionContext.getPartyConfig()?.participants.map(p => ({
          ordinal: p.ordinal,
          orgRole: p.role,
          orgId: p.orgCode,
          orgName: p.orgName,
        })) || []
      } : undefined;

      // Build passive segments if enabled (auto-synced with flight selection)
      // Strip 'direction' field as it's only for UI display, not needed by API
      const passiveSegments = includePassiveSegments
        ? buildPassiveSegments().map(({ direction, ...seg }) => seg)
        : undefined;

      // Build OrderCreate request - no payment (HOLD booking)
      const orderCreateRequest = {
        selectedOffers,
        passengers: apiPassengers,
        contact: apiContact,
        distributionChain,
        ...(passiveSegments && passiveSegments.length > 0 && { passiveSegments }),
      };

      console.log('[OrderCreate] Request payload:', JSON.stringify(orderCreateRequest, null, 2));
      console.log('[OrderCreate] offerPriceData:', flightStore.offerPriceData);
      console.log('[OrderCreate] selectedOutbound:', selectedOutbound);
      console.log('[OrderCreate] selectedOffers count:', selectedOffers.length);

      // Call OrderCreate API
      const response = await orderCreate(orderCreateRequest);
      const duration = response.duration || Date.now() - startTime;

      // Extract booking result
      const result = response.data || response.parsed || response;

      // Check if response indicates an error
      if (!response.success || result.success === false || result.errors?.length > 0) {
        const errorMsg = result.errors?.[0]?.message
          || result.errors?.[0]?.code
          || 'Booking failed - please check the response';

        // Build route label from flight store segments
        const outSegs = flightStore.selection.outbound?.journey?.segments;
        const inSegs = flightStore.selection.inbound?.journey?.segments;
        const outOrigin = outSegs?.[0]?.origin || searchCriteria?.origin || 'XXX';
        const outDest = outSegs?.[outSegs?.length - 1]?.destination || searchCriteria?.destination || 'XXX';
        const routeLabel = inSegs
          ? `${outOrigin}-${outDest} + ${inSegs[0]?.origin || outDest}-${inSegs[inSegs.length - 1]?.destination || outOrigin}`
          : `${outOrigin}-${outDest}`;

        // Log error XML capture
        addCapture({
          operation: `OrderCreate (${routeLabel})`,
          request: response.requestXml || '',
          response: response.responseXml || '',
          duration,
          status: 'error',
          userAction: 'OrderCreate failed',
        });

        setBookingError(errorMsg);
        return;
      }

      // Build route label from flight store segments
      const outSegs = flightStore.selection.outbound?.journey?.segments;
      const inSegs = flightStore.selection.inbound?.journey?.segments;
      const outOrigin = outSegs?.[0]?.origin || searchCriteria?.origin || 'XXX';
      const outDest = outSegs?.[outSegs?.length - 1]?.destination || searchCriteria?.destination || 'XXX';
      const routeLabel = inSegs
        ? `${outOrigin}-${outDest} + ${inSegs[0]?.origin || outDest}-${inSegs[inSegs.length - 1]?.destination || outOrigin}`
        : `${outOrigin}-${outDest}`;

      // Log success XML capture
      addCapture({
        operation: `OrderCreate (${routeLabel})`,
        request: response.requestXml || '',
        response: response.responseXml || '',
        duration,
        status: 'success',
        userAction: 'Created booking (Agency Payment)',
      });

      setBookingResult(result);

      // Update workflow context
      updateContext({
        passengers: passengers.map(p => ({
          ...p,
          gender: p.gender as 'M' | 'F',
        })),
        contact: {
          email: contact.email,
          phone: `${contact.countryCode}${contact.phone}`,
        },
        orderId: result.order?.orderId || result.orderId || result.OrderID,
        pnr: result.order?.bookingReferences?.[0]?.id || result.pnr || result.PNR || result.bookingReference,
        bookingStatus: 'CONFIRMED',
      });

    } catch (err: any) {
      console.error('[OrderCreate] Error caught:', err);
      console.error('[OrderCreate] Error response:', err.response?.data);

      const errorMessage = err.response?.data?.error
        || err.response?.data?.message
        || err.message
        || 'Booking failed';
      const errorDuration = Date.now() - startTime;

      // Get XML from response data (backend returns requestXml and responseXml)
      const requestXml = err.response?.data?.requestXml || '';
      const responseXml = err.response?.data?.responseXml || err.response?.data?.xml || `<error>${errorMessage}</error>`;

      setBookingError(errorMessage);

      // Build route label from flight store segments
      const outSegs2 = flightStore.selection.outbound?.journey?.segments;
      const inSegs2 = flightStore.selection.inbound?.journey?.segments;
      const outOrigin2 = outSegs2?.[0]?.origin || searchCriteria?.origin || 'XXX';
      const outDest2 = outSegs2?.[outSegs2?.length - 1]?.destination || searchCriteria?.destination || 'XXX';
      const routeLabel2 = inSegs2
        ? `${outOrigin2}-${outDest2} + ${inSegs2[0]?.origin || outDest2}-${inSegs2[inSegs2.length - 1]?.destination || outOrigin2}`
        : `${outOrigin2}-${outDest2}`;

      // Log error XML capture
      addCapture({
        operation: `OrderCreate (${routeLabel2})`,
        request: requestXml,
        response: responseXml,
        duration: errorDuration,
        status: 'error',
        userAction: 'OrderCreate failed',
      });

    } finally {
      setIsProcessing(false);
    }
  };

  const getPtcLabel = (ptc: string): string => {
    switch (ptc) {
      case 'ADT': return 'Adult';
      case 'CHD': return 'Child';
      case 'INF': return 'Infant';
      default: return ptc;
    }
  };

  // Booking Confirmed View - Show PNR after successful OrderCreate
  if (bookingResult) {
    const pnr = bookingResult.order?.bookingReferences?.[0]?.id
      || bookingResult.pnr
      || bookingResult.PNR
      || bookingResult.bookingReference
      || 'N/A';
    const orderId = bookingResult.order?.orderId
      || bookingResult.orderId
      || bookingResult.OrderID
      || 'N/A';

    // Get amount from OrderCreate response first, then fall back to store
    const totalAmount = bookingResult.order?.totalPrice?.value
      || flightStore.offerPriceData?.totalAmount
      || flightStore.totalPrice
      || 0;
    const currency = bookingResult.order?.totalPrice?.currency
      || flightStore.offerPriceData?.currency
      || 'AUD';
    const paymentTimeLimit = bookingResult.order?.paymentTimeLimit;

    // Format payment deadline
    const formatPaymentDeadline = (isoString?: string): { date: string; time: string; isExpiringSoon: boolean } | null => {
      if (!isoString) return null;
      try {
        const deadline = new Date(isoString);
        const now = new Date();
        const hoursRemaining = (deadline.getTime() - now.getTime()) / (1000 * 60 * 60);
        return {
          date: deadline.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }),
          time: deadline.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', hour12: true }),
          isExpiringSoon: hoursRemaining < 6,
        };
      } catch {
        return null;
      }
    };

    const deadlineInfo = formatPaymentDeadline(paymentTimeLimit);

    // Handle proceed to payment
    const handleProceedToPayment = () => {
      // Store booking info in flightStore for PaymentPage
      flightStore.setOrderId(orderId);
      flightStore.setPnr(pnr);
      flightStore.setTotalAmount(totalAmount);
      flightStore.setCurrency(currency);

      // Navigate to payment page with query params as backup
      navigate(`/payment?orderId=${encodeURIComponent(orderId)}&pnr=${encodeURIComponent(pnr)}&amount=${totalAmount}&currency=${currency}`);
    };

    return (
      <div className="space-y-6">
        {/* Success Header */}
        <Card className="p-6 bg-gradient-to-br from-emerald-50 to-teal-50 border-emerald-200">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-200 flex-shrink-0">
              <CheckCircle className="w-8 h-8 text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-emerald-800">Booking Created!</h2>
              <p className="text-emerald-600">Your booking has been successfully held.</p>
            </div>
          </div>
        </Card>

        {/* PNR Display */}
        <Card className="p-6">
          <div className="text-center">
            <p className="text-sm text-slate-500 font-medium mb-2">Booking Reference (PNR)</p>
            <div className="bg-gradient-to-r from-orange-500 to-amber-500 text-white rounded-xl py-4 px-6 inline-block">
              <p className="text-4xl font-bold tracking-[0.3em]">{pnr}</p>
            </div>
          </div>
        </Card>

        {/* Booking Details Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center">
                <CreditCard className="w-5 h-5 text-slate-600" />
              </div>
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wide">Order ID</p>
                <p className="font-mono font-medium text-slate-900 text-sm truncate max-w-[150px]" title={orderId}>{orderId}</p>
              </div>
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center">
                <Wallet className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wide">Total Amount</p>
                <p className="font-bold text-xl text-emerald-600">{formatCurrency(totalAmount, currency)}</p>
              </div>
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                <Plane className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wide">Status</p>
                <p className="font-semibold text-blue-600">On Hold</p>
              </div>
            </div>
          </Card>
        </div>

        {/* Payment Deadline Alert */}
        <Card className={`p-5 border-2 ${deadlineInfo?.isExpiringSoon ? 'bg-red-50 border-red-300' : 'bg-amber-50 border-amber-300'}`}>
          <div className="flex items-start gap-4">
            <div className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 ${deadlineInfo?.isExpiringSoon ? 'bg-red-100' : 'bg-amber-100'}`}>
              {deadlineInfo?.isExpiringSoon ? (
                <AlertTriangle className="w-6 h-6 text-red-600" />
              ) : (
                <Clock className="w-6 h-6 text-amber-600" />
              )}
            </div>
            <div className="flex-1">
              <h3 className={`font-bold text-lg ${deadlineInfo?.isExpiringSoon ? 'text-red-800' : 'text-amber-800'}`}>
                {deadlineInfo?.isExpiringSoon ? 'Payment Required Urgently!' : 'Payment Required'}
              </h3>
              <p className={`text-sm ${deadlineInfo?.isExpiringSoon ? 'text-red-700' : 'text-amber-700'} mb-3`}>
                This is a HOLD booking. Complete payment before the deadline to avoid automatic cancellation.
              </p>
              {deadlineInfo ? (
                <div className={`inline-flex items-center gap-3 rounded-lg px-4 py-2 ${deadlineInfo.isExpiringSoon ? 'bg-red-100' : 'bg-amber-100'}`}>
                  <Calendar className={`w-5 h-5 ${deadlineInfo.isExpiringSoon ? 'text-red-600' : 'text-amber-600'}`} />
                  <div>
                    <span className={`font-bold ${deadlineInfo.isExpiringSoon ? 'text-red-800' : 'text-amber-800'}`}>
                      {deadlineInfo.date}
                    </span>
                    <span className={`mx-2 ${deadlineInfo.isExpiringSoon ? 'text-red-600' : 'text-amber-600'}`}>at</span>
                    <span className={`font-bold ${deadlineInfo.isExpiringSoon ? 'text-red-800' : 'text-amber-800'}`}>
                      {deadlineInfo.time}
                    </span>
                  </div>
                </div>
              ) : (
                <p className="text-amber-800 font-semibold">Please complete payment within 24 hours.</p>
              )}
            </div>
          </div>
        </Card>

        {/* Action Buttons */}
        <div className="flex justify-center gap-4 pt-2">
          <button
            onClick={() => navigate('/booking')}
            className="px-6 py-3 border-2 border-slate-300 text-slate-700 font-semibold rounded-xl hover:bg-slate-50 hover:border-slate-400 transition-all flex items-center gap-2"
          >
            <Search className="w-5 h-5" />
            New Search
          </button>
          <button
            onClick={() => navigate(`/manage?pnr=${encodeURIComponent(pnr)}`)}
            className="px-6 py-3 border-2 border-blue-300 text-blue-700 font-semibold rounded-xl hover:bg-blue-50 hover:border-blue-400 transition-all flex items-center gap-2"
          >
            <Search className="w-5 h-5" />
            Retrieve PNR
          </button>
          <button
            onClick={handleProceedToPayment}
            className="px-8 py-3 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white font-bold rounded-xl shadow-lg shadow-orange-200 hover:shadow-xl hover:shadow-orange-300 transition-all flex items-center gap-2"
          >
            <Wallet className="w-5 h-5" />
            Proceed to Payment
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-24">
      {/* Testing Options */}
      <Card className="p-4 bg-amber-50 border-amber-200 space-y-3">
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={autoPopulate}
            onChange={(e) => handleAutoPopulate(e.target.checked)}
            className="w-5 h-5 rounded border-amber-400 text-amber-600 focus:ring-amber-500"
          />
          <div className="flex items-center gap-2">
            <Wand2 className="w-5 h-5 text-amber-600" />
            <span className="font-medium text-amber-800">Auto-fill with test data</span>
          </div>
          <span className="text-sm text-amber-600 ml-auto">(For testing only)</span>
        </label>

        {/* Passive Segments Collapsible Section */}
        <div className="border-t border-amber-200 pt-3">
          <button
            type="button"
            onClick={() => setIncludePassiveSegments(!includePassiveSegments)}
            className="w-full flex items-center justify-between gap-3 cursor-pointer hover:bg-amber-100/50 rounded-lg px-2 py-1 transition-colors"
          >
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={includePassiveSegments}
                onChange={(e) => {
                  e.stopPropagation();
                  setIncludePassiveSegments(e.target.checked);
                }}
                className="w-5 h-5 rounded border-amber-400 text-amber-600 focus:ring-amber-500"
              />
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-amber-600" />
                <span className="font-medium text-amber-800">Include Passive Segments</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-amber-600">{manualPassiveSegments.length} segment(s)</span>
              {includePassiveSegments ? (
                <ChevronUp className="w-5 h-5 text-amber-600" />
              ) : (
                <ChevronDown className="w-5 h-5 text-amber-600" />
              )}
            </div>
          </button>

          {/* Passive Segment Entry Form */}
          {includePassiveSegments && (
            <div className="mt-3 p-4 bg-gradient-to-r from-purple-50 to-indigo-50 rounded-xl border border-purple-200 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-purple-100 flex items-center justify-center">
                    <Plane className="w-3.5 h-3.5 text-purple-600" />
                  </div>
                  <span className="font-semibold text-purple-800">Passive Segments</span>
                </div>
                <button
                  type="button"
                  onClick={addPassiveSegment}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Add Segment
                </button>
              </div>

              {/* Segment Rows */}
              <div className="space-y-4">
                {manualPassiveSegments.map((seg, index) => (
                  <div key={seg.id} className="p-4 bg-white rounded-lg border border-purple-200 shadow-sm">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm font-semibold text-purple-700">Segment {index + 1}</span>
                      {manualPassiveSegments.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removePassiveSegment(seg.id)}
                          className="flex items-center gap-1 px-2 py-1 text-red-600 hover:bg-red-50 rounded-md text-sm transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                          Remove
                        </button>
                      )}
                    </div>

                    {/* Row 1: Route & Flight Number */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 mb-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">Origin *</label>
                        <input
                          type="text"
                          value={seg.origin}
                          onChange={(e) => updatePassiveSegment(seg.id, 'origin', e.target.value.toUpperCase())}
                          placeholder="SYD"
                          maxLength={3}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500 uppercase"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">Destination *</label>
                        <input
                          type="text"
                          value={seg.destination}
                          onChange={(e) => updatePassiveSegment(seg.id, 'destination', e.target.value.toUpperCase())}
                          placeholder="MEL"
                          maxLength={3}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500 uppercase"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">Marketing *</label>
                        <input
                          type="text"
                          value={seg.marketingCarrier}
                          onChange={(e) => updatePassiveSegment(seg.id, 'marketingCarrier', e.target.value.toUpperCase())}
                          placeholder="QF"
                          maxLength={2}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500 uppercase"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">Flight # *</label>
                        <input
                          type="text"
                          value={seg.flightNumber}
                          onChange={(e) => updatePassiveSegment(seg.id, 'flightNumber', e.target.value)}
                          placeholder="423"
                          maxLength={4}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">Operating</label>
                        <input
                          type="text"
                          value={seg.operatingCarrier}
                          onChange={(e) => updatePassiveSegment(seg.id, 'operatingCarrier', e.target.value.toUpperCase())}
                          placeholder="QF"
                          maxLength={2}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500 uppercase"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">RBD</label>
                        <input
                          type="text"
                          value={seg.rbd}
                          onChange={(e) => updatePassiveSegment(seg.id, 'rbd', e.target.value.toUpperCase())}
                          placeholder="Y"
                          maxLength={1}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500 uppercase"
                        />
                      </div>
                    </div>

                    {/* Row 2: Date & Times */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">Date *</label>
                        <input
                          type="date"
                          value={seg.departureDate}
                          onChange={(e) => updatePassiveSegment(seg.id, 'departureDate', e.target.value)}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">Departure *</label>
                        <input
                          type="time"
                          value={seg.departureTime}
                          onChange={(e) => updatePassiveSegment(seg.id, 'departureTime', e.target.value)}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">Arrival</label>
                        <input
                          type="time"
                          value={seg.arrivalTime}
                          onChange={(e) => updatePassiveSegment(seg.id, 'arrivalTime', e.target.value)}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Preview of valid segments */}
              {buildPassiveSegments().length > 0 && (
                <div className="mt-4 pt-4 border-t border-purple-200">
                  <div className="text-xs font-medium text-purple-600 mb-2">Valid segments to be included:</div>
                  <div className="flex flex-wrap gap-2">
                    {buildPassiveSegments().map((seg) => (
                      <div
                        key={seg.segmentId}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-purple-100 text-purple-800 rounded-full text-xs font-medium"
                      >
                        <span>{seg.marketingCarrier}{seg.flightNumber}</span>
                        <span className="text-purple-500">{seg.origin}→{seg.destination}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </Card>

      {/* Passenger Forms */}
      {passengers.map((pax, index) => (
        <Card key={pax.paxId} className="p-6">
          <h3 className="text-lg font-bold text-neutral-900 mb-4 flex items-center gap-2">
            <User className="w-5 h-5 text-primary-500" />
            Passenger {index + 1} - {getPtcLabel(pax.ptc)}
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Title */}
            <Select
              label="Title"
              value={pax.title}
              onChange={(e) => updatePassenger(index, 'title', e.target.value)}
              options={TITLES}
              placeholder="Select"
              error={errors[`pax${index}_title`]}
              required
            />

            {/* First Name */}
            <Input
              label="First Name"
              value={pax.firstName}
              onChange={(e) => updatePassenger(index, 'firstName', e.target.value)}
              placeholder="As per ID"
              error={errors[`pax${index}_firstName`]}
              required
            />

            {/* Middle Name */}
            <Input
              label="Middle Name"
              value={pax.middleName || ''}
              onChange={(e) => updatePassenger(index, 'middleName', e.target.value)}
              placeholder="Optional"
            />

            {/* Last Name */}
            <Input
              label="Last Name"
              value={pax.lastName}
              onChange={(e) => updatePassenger(index, 'lastName', e.target.value)}
              placeholder="As per ID"
              error={errors[`pax${index}_lastName`]}
              required
            />

            {/* Date of Birth */}
            <Input
              type="date"
              label="Date of Birth"
              value={pax.dateOfBirth}
              onChange={(e) => updatePassenger(index, 'dateOfBirth', e.target.value)}
              error={errors[`pax${index}_dateOfBirth`]}
              required
            />

            {/* Gender */}
            <Select
              label="Gender"
              value={pax.gender}
              onChange={(e) => updatePassenger(index, 'gender', e.target.value)}
              options={[
                { value: 'M', label: 'Male' },
                { value: 'F', label: 'Female' },
              ]}
              placeholder="Select"
              error={errors[`pax${index}_gender`]}
              required
            />

            {/* Residence Country */}
            <Select
              label="Residence Country"
              value={pax.residenceCountry || ''}
              onChange={(e) => updatePassenger(index, 'residenceCountry', e.target.value)}
              options={COUNTRIES}
              placeholder="Select"
            />
          </div>

          {/* Passport Details */}
          <div className="mt-6 pt-4 border-t border-slate-200">
            <h4 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-slate-500" />
              Passport Details <span className="text-slate-400 font-normal">(Optional)</span>
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Input
                label="Passport Number"
                value={pax.passport?.number || ''}
                onChange={(e) => updatePassengerPassport(index, 'number', e.target.value)}
                placeholder="PA1234567"
              />
              <Select
                label="Issuing Country"
                value={pax.passport?.issuingCountry || ''}
                onChange={(e) => updatePassengerPassport(index, 'issuingCountry', e.target.value)}
                options={COUNTRIES}
                placeholder="Select"
              />
              <Input
                type="date"
                label="Issue Date"
                value={pax.passport?.issueDate || ''}
                onChange={(e) => updatePassengerPassport(index, 'issueDate', e.target.value)}
              />
              <Input
                type="date"
                label="Expiry Date"
                value={pax.passport?.expiryDate || ''}
                onChange={(e) => updatePassengerPassport(index, 'expiryDate', e.target.value)}
              />
              <Select
                label="Citizenship"
                value={pax.passport?.citizenship || ''}
                onChange={(e) => updatePassengerPassport(index, 'citizenship', e.target.value)}
                options={COUNTRIES}
                placeholder="Select"
              />
            </div>
          </div>

          {/* Frequent Flyer - Only for adults */}
          {pax.ptc === 'ADT' && (
            <div className="mt-6 pt-4 border-t border-slate-200">
              <h4 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                <Plane className="w-4 h-4 text-slate-500" />
                Qantas Frequent Flyer <span className="text-slate-400 font-normal">(Optional)</span>
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  label="Membership Number"
                  value={pax.frequentFlyer?.number || ''}
                  onChange={(e) => updatePassengerFF(index, 'number', e.target.value)}
                  placeholder="FF123456789"
                />
              </div>
            </div>
          )}
        </Card>
      ))}

      {/* Contact Details */}
      <Card className="p-6">
        <h3 className="text-lg font-bold text-neutral-900 mb-4 flex items-center gap-2">
          <Mail className="w-5 h-5 text-primary-500" />
          Contact Details
        </h3>
        <p className="text-sm text-neutral-500 mb-4">
          We'll send your booking confirmation and updates to this email and phone.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Email */}
          <Input
            type="email"
            label="Email Address"
            value={contact.email}
            onChange={(e) => setContact(prev => ({ ...prev, email: e.target.value }))}
            placeholder="you@example.com"
            leftIcon={<Mail className="w-4 h-4" />}
            error={errors['contact_email']}
            required
          />

          {/* Phone */}
          <div className="flex gap-2">
            <div className="w-32">
              <Select
                label="Country"
                value={contact.countryCode}
                onChange={(e) => setContact(prev => ({ ...prev, countryCode: e.target.value }))}
                options={COUNTRY_CODES}
              />
            </div>
            <div className="flex-1">
              <Input
                type="tel"
                label="Phone Number"
                value={contact.phone}
                onChange={(e) => setContact(prev => ({ ...prev, phone: e.target.value.replace(/\D/g, '') }))}
                placeholder="400 000 000"
                leftIcon={<Phone className="w-4 h-4" />}
                error={errors['contact_phone']}
                required
              />
            </div>
          </div>
        </div>

        {/* Postal Address */}
        <div className="mt-6 pt-4 border-t border-slate-200">
          <h4 className="text-sm font-semibold text-slate-700 mb-3">
            Postal Address <span className="text-slate-400 font-normal">(Optional)</span>
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Street Address"
              value={contact.postalAddress?.street || ''}
              onChange={(e) => setContact(prev => ({
                ...prev,
                postalAddress: { ...prev.postalAddress, street: e.target.value } as PostalAddress,
              }))}
              placeholder="123 Main Street"
            />
            <Input
              label="City"
              value={contact.postalAddress?.city || ''}
              onChange={(e) => setContact(prev => ({
                ...prev,
                postalAddress: { ...prev.postalAddress, city: e.target.value } as PostalAddress,
              }))}
              placeholder="Sydney"
            />
            <Input
              label="State/Province"
              value={contact.postalAddress?.state || ''}
              onChange={(e) => setContact(prev => ({
                ...prev,
                postalAddress: { ...prev.postalAddress, state: e.target.value } as PostalAddress,
              }))}
              placeholder="NSW"
            />
            <Input
              label="Postal Code"
              value={contact.postalAddress?.postalCode || ''}
              onChange={(e) => setContact(prev => ({
                ...prev,
                postalAddress: { ...prev.postalAddress, postalCode: e.target.value } as PostalAddress,
              }))}
              placeholder="2000"
            />
            <Select
              label="Country"
              value={contact.postalAddress?.country || ''}
              onChange={(e) => setContact(prev => ({
                ...prev,
                postalAddress: { ...prev.postalAddress, country: e.target.value } as PostalAddress,
              }))}
              options={COUNTRIES}
              placeholder="Select"
            />
          </div>
        </div>
      </Card>

      {/* Validation Errors Summary */}
      {Object.keys(errors).length > 0 && (
        <Alert variant="error" title="Please fix the errors above">
          Some required fields are missing or invalid.
        </Alert>
      )}

      {/* Booking Error */}
      {bookingError && (
        <Alert variant="error" title="Booking Failed">
          {bookingError}
        </Alert>
      )}

      {/* Navigation - Fixed footer style to match AppLayout */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 shadow-lg z-40">
        <div className="max-w-5xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <button
              onClick={prevStep}
              disabled={isProcessing}
              className="flex items-center gap-2 px-4 py-2 text-slate-600 hover:text-slate-900 disabled:opacity-50"
            >
              <ArrowLeft className="w-4 h-4" />
              Previous
            </button>
            <button
              onClick={handleContinue}
              disabled={isProcessing}
              className="flex items-center gap-2 px-6 py-2.5 bg-orange-500 hover:bg-orange-600 disabled:bg-slate-200 disabled:text-slate-400 text-white font-semibold rounded-xl"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Creating Booking...
                </>
              ) : (
                <>
                  Create Booking
                  <ChevronRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
