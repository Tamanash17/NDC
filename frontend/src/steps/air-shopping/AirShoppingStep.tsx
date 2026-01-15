import { useState, useEffect, useRef, useMemo } from 'react';
import { useWorkflow } from '@/core/engines';
import { useFlightSearch, useFlightSelection, useFlightSelectionStore } from '@/hooks';
import { useXmlViewer } from '@/core/context/XmlViewerContext';
import { useSessionStore } from '@/core/context/SessionStore';
import { Card, Button, Alert } from '@/components/ui';
import { FlightTableView, type FlightOffer } from '@/components/flights';
import {
  Calendar,
  Search,
  Tag,
  ArrowRight,
  ArrowLeft,
  RefreshCw,
  ArrowLeftRight,
  Users,
  ChevronDown,
  MapPin
} from 'lucide-react';
import { formatCurrency } from '@/lib/format';
import { cn } from '@/lib/cn';
import { getAirportInfo, sortAirportsByCountry, logUnknownAirports } from '@/data/airport-countries';

// Airports - Alphabetically sorted by city name
const AIRPORTS = [
  { value: 'ADL', label: 'Adelaide', code: 'ADL', country: 'Australia' },
  { value: 'AKL', label: 'Auckland', code: 'AKL', country: 'New Zealand' },
  { value: 'DPS', label: 'Bali Denpasar', code: 'DPS', country: 'Indonesia' },
  { value: 'BKK', label: 'Bangkok', code: 'BKK', country: 'Thailand' },
  { value: 'BNE', label: 'Brisbane', code: 'BNE', country: 'Australia' },
  { value: 'CNS', label: 'Cairns', code: 'CNS', country: 'Australia' },
  { value: 'DRW', label: 'Darwin', code: 'DRW', country: 'Australia' },
  { value: 'OOL', label: 'Gold Coast', code: 'OOL', country: 'Australia' },
  { value: 'HBA', label: 'Hobart', code: 'HBA', country: 'Australia' },
  { value: 'HNL', label: 'Honolulu', code: 'HNL', country: 'USA' },
  { value: 'MEL', label: 'Melbourne', code: 'MEL', country: 'Australia' },
  { value: 'MNL', label: 'Manila', code: 'MNL', country: 'Philippines' },
  { value: 'NRT', label: 'Narita Tokyo', code: 'NRT', country: 'Japan' },
  { value: 'PER', label: 'Perth', code: 'PER', country: 'Australia' },
  { value: 'PQC', label: 'Phu Quoc', code: 'PQC', country: 'Vietnam' },
  { value: 'HKT', label: 'Phuket', code: 'HKT', country: 'Thailand' },
  { value: 'SGN', label: 'Saigon Ho Chi Minh', code: 'SGN', country: 'Vietnam' },
  { value: 'SIN', label: 'Singapore', code: 'SIN', country: 'Singapore' },
  { value: 'SYD', label: 'Sydney', code: 'SYD', country: 'Australia' },
  { value: 'HND', label: 'Tokyo Haneda', code: 'HND', country: 'Japan' },
];

// Supported currencies - Alphabetically sorted
const CURRENCIES = [
  { value: 'AUD', label: 'AUD', symbol: 'A$', name: 'Australian Dollar' },
  { value: 'BRL', label: 'BRL', symbol: 'R$', name: 'Brazilian Real' },
  { value: 'CAD', label: 'CAD', symbol: 'C$', name: 'Canadian Dollar' },
  { value: 'CHF', label: 'CHF', symbol: 'CHF', name: 'Swiss Franc' },
  { value: 'CNY', label: 'CNY', symbol: '¥', name: 'Chinese Renminbi Yuan' },
  { value: 'DKK', label: 'DKK', symbol: 'kr', name: 'Danish Krone' },
  { value: 'EUR', label: 'EUR', symbol: '€', name: 'Euro' },
  { value: 'FJD', label: 'FJD', symbol: 'FJ$', name: 'Fiji Dollar' },
  { value: 'GBP', label: 'GBP', symbol: '£', name: 'British Pound Sterling' },
  { value: 'HKD', label: 'HKD', symbol: 'HK$', name: 'Hong Kong Dollar' },
  { value: 'IDR', label: 'IDR', symbol: 'Rp', name: 'Indonesian Rupiah' },
  { value: 'ILS', label: 'ILS', symbol: '₪', name: 'Israeli Shekel' },
  { value: 'INR', label: 'INR', symbol: '₹', name: 'Indian Rupee' },
  { value: 'JPY', label: 'JPY', symbol: '¥', name: 'Japanese Yen' },
  { value: 'KRW', label: 'KRW', symbol: '₩', name: 'South Korean Won' },
  { value: 'KWD', label: 'KWD', symbol: 'KD', name: 'Kuwaiti Dinar' },
  { value: 'LKR', label: 'LKR', symbol: 'Rs', name: 'Sri Lankan Rupee' },
  { value: 'MMK', label: 'MMK', symbol: 'K', name: 'Myanmar Kyat' },
  { value: 'MNT', label: 'MNT', symbol: '₮', name: 'Mongolian Tugrik' },
  { value: 'MOP', label: 'MOP', symbol: 'MOP$', name: 'Macau Pataca' },
  { value: 'MYR', label: 'MYR', symbol: 'RM', name: 'Malaysian Ringgit' },
  { value: 'NOK', label: 'NOK', symbol: 'kr', name: 'Norwegian Krone' },
  { value: 'NZD', label: 'NZD', symbol: 'NZ$', name: 'New Zealand Dollar' },
  { value: 'OMR', label: 'OMR', symbol: 'ر.ع.', name: 'Omani Rial' },
  { value: 'PGK', label: 'PGK', symbol: 'K', name: 'Papua New Guinea Kina' },
  { value: 'PHP', label: 'PHP', symbol: '₱', name: 'Philippine Peso' },
  { value: 'PKR', label: 'PKR', symbol: 'Rs', name: 'Pakistani Rupee' },
  { value: 'SAR', label: 'SAR', symbol: 'ر.س', name: 'Saudi Riyal' },
  { value: 'SBD', label: 'SBD', symbol: 'SI$', name: 'Solomon Islands Dollar' },
  { value: 'SEK', label: 'SEK', symbol: 'kr', name: 'Swedish Krona' },
  { value: 'SGD', label: 'SGD', symbol: 'S$', name: 'Singapore Dollar' },
  { value: 'THB', label: 'THB', symbol: '฿', name: 'Thai Baht' },
  { value: 'TWD', label: 'TWD', symbol: 'NT$', name: 'New Taiwan Dollar' },
  { value: 'USD', label: 'USD', symbol: '$', name: 'US Dollar' },
  { value: 'VND', label: 'VND', symbol: '₫', name: 'Vietnamese Dong' },
  { value: 'XPF', label: 'XPF', symbol: '₣', name: 'CFP Franc' },
];

type FlightSelectionStep = 'search' | 'outbound' | 'return';
type SearchDirection = 'outbound' | 'return';

// Workflow options passed from BookingPage (behavior flags, not search params)
interface AirShoppingStepProps {
  workflowOptions?: {
    offerPriceAfterShopping?: boolean;
    offerPriceAfterAncillaries?: boolean;
    addBaggage?: boolean;
    addMeals?: boolean;
    addInsurance?: boolean;
    addPriorityBoarding?: boolean;
    addSeats?: boolean;
    holdBooking?: boolean;
  };
  onComplete?: () => void;
}

export function AirShoppingStep({ workflowOptions, onComplete }: AirShoppingStepProps) {
  const { context, updateContext, nextStep: workflowNextStep } = useWorkflow();
  const { offers, shoppingResponseId, isLoading, error, search, searchCombined, reset } = useFlightSearch();
  const { clearCaptures } = useXmlViewer();
  const { airlineRoutes, airlineRoutesLoading, isAuthenticated, credentials, setAirlineRoutes, setAirlineRoutesLoading } = useSessionStore();
  const {
    selection,
    selectOutbound,
    selectInbound,
    clearSelection,
    totalPrice,
    currency,
    setRoundTrip,
    setShoppingResponseId: storeShoppingResponseId,
    setSearchCriteria: storeSearchCriteria,
  } = useFlightSelection();

  // Search states for airport dropdowns (must be declared before useMemo hooks)
  const [originSearch, setOriginSearch] = useState('');
  const [destinationSearch, setDestinationSearch] = useState('');
  const [returnOriginSearch, setReturnOriginSearch] = useState('');
  const [returnDestinationSearch, setReturnDestinationSearch] = useState('');

  // Load airline profile if authenticated but routes not loaded
  useEffect(() => {
    if (isAuthenticated && !airlineRoutes && !airlineRoutesLoading && credentials?.apiId) {
      console.log('[AirShopping] Auto-loading airline profile - routes missing from session');
      setAirlineRoutesLoading(true);
      import('@/lib/ndc-api').then(({ airlineProfile }) => {
        return airlineProfile({
          ownerCode: 'JQ',
          distributionChain: {
            links: [{
              ordinal: 1,
              orgRole: 'Seller',
              orgId: credentials.apiId,
            }]
          }
        });
      }).then((response) => {
        if (response.success && response.data?.originDestinationPairs) {
          setAirlineRoutes(response.data.originDestinationPairs);
          console.log('[AirShopping] Auto-loaded', response.data.originDestinationPairs.length, 'airline routes');
        } else {
          console.warn('[AirShopping] Profile response missing originDestinationPairs:', response);
        }
      }).catch((err) => {
        console.warn('[AirShopping] Failed to auto-load airline routes:', err.message);
      }).finally(() => {
        setAirlineRoutesLoading(false);
      });
    }
  }, [isAuthenticated, airlineRoutes, airlineRoutesLoading, credentials, setAirlineRoutes, setAirlineRoutesLoading]);

  // Dynamic airports from Airline Profile API (with fallback to hardcoded list)
  const availableAirports = useMemo(() => {
    console.log('[AirShopping] Airline routes status:', {
      hasRoutes: !!airlineRoutes,
      routeCount: airlineRoutes?.length || 0,
      loading: airlineRoutesLoading
    });

    if (!airlineRoutes || airlineRoutes.length === 0) {
      // Fallback to hardcoded airports
      console.log('[AirShopping] Using hardcoded airports (fallback)');
      return AIRPORTS;
    }

    console.log('[AirShopping] Using Airline Profile airports:', airlineRoutes.length, 'routes');

    // Extract unique airport codes from airline routes
    const airportCodes = new Set<string>();
    airlineRoutes.forEach(route => {
      airportCodes.add(route.origin);
      airportCodes.add(route.destination);
    });

    // Log unknown airports to console for identification
    const codeArray = Array.from(airportCodes);
    logUnknownAirports(codeArray);

    // Build airport list from codes with country information
    const airportList = codeArray.map(code => {
      // Get country info from our database
      const airportInfo = getAirportInfo(code);

      // Try to find in hardcoded list first for better labels
      const hardcoded = AIRPORTS.find(a => a.code === code);

      return {
        value: code,
        label: hardcoded ? hardcoded.label : airportInfo.city,
        code: code,
        country: airportInfo.countryName
      };
    });

    // Sort by country (Australia first), then by city name
    return sortAirportsByCountry(airportList);
  }, [airlineRoutes]);

  // Filtered airport lists based on search
  const filteredOriginAirports = useMemo(() => {
    if (!originSearch) return availableAirports;
    const search = originSearch.toLowerCase();
    return availableAirports.filter(airport =>
      airport.code.toLowerCase().includes(search) ||
      airport.label.toLowerCase().includes(search) ||
      airport.country.toLowerCase().includes(search)
    );
  }, [availableAirports, originSearch]);

  const filteredDestinationAirports = useMemo(() => {
    if (!destinationSearch) return availableAirports;
    const search = destinationSearch.toLowerCase();
    return availableAirports.filter(airport =>
      airport.code.toLowerCase().includes(search) ||
      airport.label.toLowerCase().includes(search) ||
      airport.country.toLowerCase().includes(search)
    );
  }, [availableAirports, destinationSearch]);

  const filteredReturnOriginAirports = useMemo(() => {
    if (!returnOriginSearch) return availableAirports;
    const search = returnOriginSearch.toLowerCase();
    return availableAirports.filter(airport =>
      airport.code.toLowerCase().includes(search) ||
      airport.label.toLowerCase().includes(search) ||
      airport.country.toLowerCase().includes(search)
    );
  }, [availableAirports, returnOriginSearch]);

  const filteredReturnDestinationAirports = useMemo(() => {
    if (!returnDestinationSearch) return availableAirports;
    const search = returnDestinationSearch.toLowerCase();
    return availableAirports.filter(airport =>
      airport.code.toLowerCase().includes(search) ||
      airport.label.toLowerCase().includes(search) ||
      airport.country.toLowerCase().includes(search)
    );
  }, [availableAirports, returnDestinationSearch]);

  // Trip configuration - all editable by user in this step
  const [tripType, setTripType] = useState<'oneway' | 'return' | 'openjaw'>('return');
  const [cabinClass, setCabinClass] = useState<'economy' | 'business' | 'mixed'>('economy');
  const [adults, setAdults] = useState(1);
  const [children, setChildren] = useState(0);
  const [infants, setInfants] = useState(0);

  // Route and dates
  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const [departureDate, setDepartureDate] = useState('');
  const [returnDate, setReturnDate] = useState('');
  // Open jaw specific: different return airports
  const [returnOrigin, setReturnOrigin] = useState('');      // Where return departs from
  const [returnDestination, setReturnDestination] = useState(''); // Where return arrives
  const [promoCode, setPromoCode] = useState('');
  const [selectedCurrency, setSelectedCurrency] = useState('AUD');

  // Dropdown states
  const [showPassengerDropdown, setShowPassengerDropdown] = useState(false);
  const [showOriginDropdown, setShowOriginDropdown] = useState(false);
  const [showDestinationDropdown, setShowDestinationDropdown] = useState(false);
  const [showReturnOriginDropdown, setShowReturnOriginDropdown] = useState(false);
  const [showReturnDestinationDropdown, setShowReturnDestinationDropdown] = useState(false);

  const passengerDropdownRef = useRef<HTMLDivElement>(null);
  const originDropdownRef = useRef<HTMLDivElement>(null);
  const destinationDropdownRef = useRef<HTMLDivElement>(null);
  const returnOriginDropdownRef = useRef<HTMLDivElement>(null);
  const returnDestinationDropdownRef = useRef<HTMLDivElement>(null);
  const originSearchRef = useRef<HTMLInputElement>(null);
  const destinationSearchRef = useRef<HTMLInputElement>(null);
  const returnOriginSearchRef = useRef<HTMLInputElement>(null);
  const returnDestinationSearchRef = useRef<HTMLInputElement>(null);

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (passengerDropdownRef.current && !passengerDropdownRef.current.contains(event.target as Node)) {
        setShowPassengerDropdown(false);
      }
      if (originDropdownRef.current && !originDropdownRef.current.contains(event.target as Node)) {
        setShowOriginDropdown(false);
      }
      if (destinationDropdownRef.current && !destinationDropdownRef.current.contains(event.target as Node)) {
        setShowDestinationDropdown(false);
      }
      if (returnOriginDropdownRef.current && !returnOriginDropdownRef.current.contains(event.target as Node)) {
        setShowReturnOriginDropdown(false);
      }
      if (returnDestinationDropdownRef.current && !returnDestinationDropdownRef.current.contains(event.target as Node)) {
        setShowReturnDestinationDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Swap origin and destination
  const swapLocations = () => {
    const temp = origin;
    setOrigin(destination);
    setDestination(temp);
  };

  // Total passengers for display
  const totalPassengers = adults + children + infants;
  const passengerText = totalPassengers === 1 ? '1 Passenger' : `${totalPassengers} Passengers`;

  // Step tracking for return trips
  const [selectionStep, setSelectionStep] = useState<FlightSelectionStep>('search');

  // Track which direction we're searching for (to correctly assign offers)
  const [currentSearchDirection, setCurrentSearchDirection] = useState<SearchDirection>('outbound');

  // Separate offers for outbound and return
  const [outboundOffers, setOutboundOffers] = useState<FlightOffer[]>([]);
  const [returnOffers, setReturnOffers] = useState<FlightOffer[]>([]);

  // Clear previous session's selection on initial mount
  useEffect(() => {
    // Reset the entire flight selection store (clears selection, shoppingResponseId, searchCriteria)
    useFlightSelectionStore.getState().reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only on mount

  // Sync round trip state (both return and openjaw are round trips)
  useEffect(() => {
    setRoundTrip(tripType === 'return' || tripType === 'openjaw');
  }, [tripType, setRoundTrip]);

  // Sync shopping response ID to global store for sidebar display
  useEffect(() => {
    storeShoppingResponseId(shoppingResponseId);
  }, [shoppingResponseId, storeShoppingResponseId]);

  // Sync search criteria to global store for sidebar display
  useEffect(() => {
    if (origin && destination && departureDate) {
      storeSearchCriteria({
        origin,
        destination,
        departureDate,
        returnDate: (tripType === 'return' || tripType === 'openjaw') ? returnDate : undefined,
        passengers: { adults, children, infants },
        cabinClass,
      });
    }
  }, [origin, destination, departureDate, returnDate, adults, children, infants, cabinClass, tripType, storeSearchCriteria]);

  // Track if a search has been performed (to show "no flights" message)
  const [searchPerformed, setSearchPerformed] = useState(false);

  // Assign offers to correct direction based on currentSearchDirection
  // This is used for one-way searches and mixed mode
  // Combined return/openjaw searches (non-mixed) set offers directly in handleSearch
  useEffect(() => {
    // Only process when search is complete (not loading) and a search was performed
    if (!isLoading && searchPerformed) {
      // Skip if this is a combined return/openjaw search (non-mixed) - offers were set directly
      if ((tripType === 'return' || tripType === 'openjaw') && cabinClass !== 'mixed' && returnOffers.length > 0) {
        // Combined search already populated both outbound and return offers
        setSelectionStep('outbound');
        return;
      }

      // Debug: Log what we're setting
      console.log('[AirShopping] useEffect: Setting offers to state');
      console.log('[AirShopping] useEffect: offers count:', offers.length);
      console.log('[AirShopping] useEffect: offers with shoppingResponseId:', offers.map(o => ({
        offerId: o.offerId,
        shoppingResponseId: o.shoppingResponseId,
      })));

      if (currentSearchDirection === 'outbound') {
        setOutboundOffers(offers);
        setSelectionStep('outbound');
      } else {
        setReturnOffers(offers);
        setSelectionStep('return');
      }
    }
  }, [offers, currentSearchDirection, isLoading, searchPerformed, tripType, cabinClass, returnOffers.length]);

  const handleSearch = async () => {
    // Clear previous XML captures for fresh transaction log
    clearCaptures();

    // For open jaw, use specified return airports; for normal return, use swapped origin/destination
    const effectiveReturnOrigin = tripType === 'openjaw' ? returnOrigin : undefined;
    const effectiveReturnDestination = tripType === 'openjaw' ? returnDestination : undefined;

    const searchParamsData = {
      origin,
      destination,
      departureDate,
      returnDate: (tripType === 'return' || tripType === 'openjaw') ? returnDate : undefined,
      returnOrigin: effectiveReturnOrigin,
      returnDestination: effectiveReturnDestination,
      passengers: { adults, children, infants },
      promoCode: promoCode.trim() || undefined, // Only include if non-empty
      currency: selectedCurrency,
      cabinClass,
    };

    updateContext({ searchParams: searchParamsData });
    clearSelection();
    setSelectionStep('search');
    setOutboundOffers([]);
    setReturnOffers([]);
    setSearchPerformed(false);

    // Set direction BEFORE search so useEffect assigns offers correctly
    setCurrentSearchDirection('outbound');

    // Base NDC config to request bundles (RFIC=G, RFISC=0L8 identifies bundle products)
    const baseNdcConfig = {
      offerCriteria: {
        serviceCriteria: [
          { includeInd: true, RFIC: 'G', RFISC: '0L8' }
        ]
      },
    };

    if (cabinClass === 'mixed') {
      // MIXED MODE: Make 2 sequential API calls - one for Economy, one for Business
      // Sequential to ensure proper merging of offers
      console.log('[AirShopping] Mixed mode: Making 2 calls for Economy + Business');

      // First: Economy search (replaces any existing offers)
      await search({
        ...searchParamsData,
        returnDate: undefined,
        ndcConfig: { ...baseNdcConfig, cabinPreference: 'M' },
        additive: false, // First search replaces
      });

      // Second: Business search (merge with economy results)
      await search({
        ...searchParamsData,
        returnDate: undefined,
        ndcConfig: { ...baseNdcConfig, cabinPreference: 'C' },
        additive: true, // Second search merges
      });
    } else if (tripType === 'return' || tripType === 'openjaw') {
      // RETURN/OPENJAW TRIP (non-mixed): Single API call for both outbound + return
      const ndcConfig = {
        ...baseNdcConfig,
        cabinPreference: cabinClass === 'business' ? 'C' : 'M',
      };

      const result = await searchCombined({
        ...searchParamsData,
        returnDate: returnDate,  // Include return date for combined search
        returnOrigin: effectiveReturnOrigin,
        returnDestination: effectiveReturnDestination,
        ndcConfig,
      });

      if (result) {
        // Store both outbound and return offers
        setOutboundOffers(result.outboundOffers);
        setReturnOffers(result.returnOffers);
        console.log(`[AirShopping] Combined search: ${result.outboundOffers.length} outbound, ${result.returnOffers.length} return`);
      }
    } else {
      // ONE-WAY: Single API call
      const ndcConfig = {
        ...baseNdcConfig,
        cabinPreference: cabinClass === 'business' ? 'C' : 'M',
      };

      await search({
        ...searchParamsData,
        returnDate: undefined,
        ndcConfig,
      });
    }

    // Mark that search has been performed (useEffect will transition to outbound step)
    setSearchPerformed(true);
  };

  const handleOutboundSelect = (offerId: string, bundleId: string) => {
    console.log('[AirShopping] handleOutboundSelect:', { offerId, bundleId });
    console.log('[AirShopping] outboundOffers count:', outboundOffers.length);
    const offer = outboundOffers.find(o => o.offerId === offerId);
    console.log('[AirShopping] Found offer:', offer ? {
      offerId: offer.offerId,
      shoppingResponseId: offer.shoppingResponseId,
    } : 'NOT FOUND');
    if (offer) selectOutbound(offer, bundleId);
  };

  const handleReturnSelect = (offerId: string, bundleId: string) => {
    const offer = returnOffers.find(o => o.offerId === offerId);
    if (offer) selectInbound(offer, bundleId);
  };

  const handleSelectOutboundAndContinue = async () => {
    console.log('[AirShopping] handleSelectOutboundAndContinue called');
    console.log('[AirShopping] selection.outbound:', selection.outbound);
    console.log('[AirShopping] tripType:', tripType);
    console.log('[AirShopping] shoppingResponseId:', shoppingResponseId);

    if (!selection.outbound) {
      console.error('[AirShopping] Cannot continue: No outbound flight selected');
      return;
    }

    if (tripType === 'return' || tripType === 'openjaw') {
      // For return/openjaw trips, we already have return offers from combined search (unless Mixed mode)
      if (cabinClass !== 'mixed' && returnOffers.length > 0) {
        // Already have return offers from combined search - just navigate
        setSelectionStep('return');
      } else {
        // Mixed mode or no return offers yet - need to search
        setCurrentSearchDirection('return');
        setSelectionStep('return');

        // Base NDC config to request bundles
        const baseNdcConfig = {
          offerCriteria: {
            serviceCriteria: [
              { includeInd: true, RFIC: 'G', RFISC: '0L8' }
            ]
          },
        };

        // For open jaw: use specified return airports; for normal return: swap origin/destination
        const returnFromAirport = tripType === 'openjaw' ? returnOrigin : destination;
        const returnToAirport = tripType === 'openjaw' ? returnDestination : origin;

        const returnSearchParams = {
          origin: returnFromAirport,
          destination: returnToAirport,
          departureDate: returnDate,
          passengers: { adults, children, infants },
          promoCode: promoCode || undefined,
        };

        if (cabinClass === 'mixed') {
          // Mixed mode: search both Economy and Business for return
          console.log('[AirShopping] Mixed mode return: Making 2 calls for Economy + Business');

          await search({
            ...returnSearchParams,
            ndcConfig: { ...baseNdcConfig, cabinPreference: 'M' },
            additive: false,
          });

          await search({
            ...returnSearchParams,
            ndcConfig: { ...baseNdcConfig, cabinPreference: 'C' },
            additive: true,
          });
        } else {
          // Single cabin search for return
          await search({
            ...returnSearchParams,
            ndcConfig: {
              ...baseNdcConfig,
              cabinPreference: cabinClass === 'business' ? 'C' : 'M'
            },
          });
        }
      }
    } else {
      // One-way: proceed to next step
      handleContinue();
    }
  };

  const handleBackToOutbound = () => {
    setSelectionStep('outbound');
    // Clear inbound selection but keep outbound
    selectInbound(null as any, '');
  };

  const handleContinue = () => {
    if (!selection.outbound) {
      console.error('[AirShopping] Cannot continue: No outbound selection');
      return;
    }

    // Get shoppingResponseId from the selected offer (important for mixed mode)
    // Each offer has its own shoppingResponseId from the API call that returned it
    const outboundOffer = outboundOffers.find(o => o.offerId === selection.outbound?.offerId);

    // Debug: Log all offers and their shoppingResponseIds
    console.log('[AirShopping] All outboundOffers:', outboundOffers.map(o => ({
      offerId: o.offerId,
      shoppingResponseId: o.shoppingResponseId,
      hasProperty: 'shoppingResponseId' in o
    })));
    console.log('[AirShopping] Looking for offerId:', selection.outbound?.offerId);
    console.log('[AirShopping] Found outboundOffer:', outboundOffer);
    console.log('[AirShopping] outboundOffer?.shoppingResponseId:', outboundOffer?.shoppingResponseId);

    // Try multiple sources for shoppingResponseId:
    // 1. From the offer object (set by parser)
    // 2. From the zustand store (set when user selected the flight)
    // 3. From the hook (set by last search - may be wrong in Mixed mode)
    const storeShoppingResponseId = useFlightSelectionStore.getState().shoppingResponseId;
    console.log('[AirShopping] storeShoppingResponseId (from zustand):', storeShoppingResponseId);

    const effectiveShoppingResponseId = outboundOffer?.shoppingResponseId || storeShoppingResponseId || shoppingResponseId;
    console.log('[AirShopping] effectiveShoppingResponseId:', effectiveShoppingResponseId);

    if (!effectiveShoppingResponseId) {
      console.error('[AirShopping] Cannot continue: No shoppingResponseId from any source');
      console.error('[AirShopping] outboundOffer?.shoppingResponseId:', outboundOffer?.shoppingResponseId);
      console.error('[AirShopping] storeShoppingResponseId:', storeShoppingResponseId);
      console.error('[AirShopping] hook shoppingResponseId:', shoppingResponseId);
      return;
    }

    const selectedOffers = [{
      offerId: selection.outbound.offerId,
      bundleId: selection.outbound.bundleId,
      offerItemIds: [selection.outbound.bundleId],
      direction: 'outbound',
      shoppingResponseId: effectiveShoppingResponseId,
    }];

    if ((tripType === 'return' || tripType === 'openjaw') && selection.inbound) {
      // Get shoppingResponseId for inbound offer
      const inboundOffer = returnOffers.find(o => o.offerId === selection.inbound?.offerId);
      const inboundShoppingResponseId = inboundOffer?.shoppingResponseId || effectiveShoppingResponseId;

      selectedOffers.push({
        offerId: selection.inbound.offerId,
        bundleId: selection.inbound.bundleId,
        offerItemIds: [selection.inbound.bundleId],
        direction: 'return',
        shoppingResponseId: inboundShoppingResponseId,
      });
    }

    // Use the outbound offer's shoppingResponseId as the primary one
    console.log('[AirShopping] Updating context with:', {
      shoppingResponseId: effectiveShoppingResponseId,
      selectedOffers,
      totalPrice,
      currency,
    });

    updateContext({
      shoppingResponseId: effectiveShoppingResponseId,
      selectedOffers: selectedOffers as any,
      priceSnapshots: [{
        label: 'AirShopping',
        amount: totalPrice,
        currency,
        timestamp: new Date(),
      }],
    } as any);

    // Store the original AirShopping total (flights + bundles) for comparison after bundle swaps
    // This is used in OfferPriceStep to show savings/cost difference from bundle changes
    useFlightSelectionStore.getState().setOriginalAirShoppingTotal(totalPrice);
    console.log('[AirShopping] Stored original AirShopping total:', totalPrice);

    // Use onComplete prop if provided (from BookingPage), otherwise fallback to workflow nextStep
    console.log('[AirShopping] Calling navigation...');
    if (onComplete) {
      console.log('[AirShopping] Using onComplete prop');
      onComplete();
    } else {
      console.log('[AirShopping] Using workflow nextStep');
      workflowNextStep();
    }
    console.log('[AirShopping] Navigation called');
  };

  const handleNewSearch = () => {
    // Clear XML captures for fresh transaction log
    clearCaptures();
    reset();
    clearSelection();
    setSelectionStep('search');
    setCurrentSearchDirection('outbound');
    setOutboundOffers([]);
    setReturnOffers([]);
    setSearchPerformed(false);
  };

  // Handle final confirmation of selection (both one-way, return, and openjaw)
  const handleConfirmSelection = () => {
    console.log('[AirShopping] handleConfirmSelection called');
    console.log('[AirShopping] tripType:', tripType);
    console.log('[AirShopping] selection.outbound:', selection.outbound);
    console.log('[AirShopping] selection.inbound:', selection.inbound);

    // Validate selection based on trip type
    if (!selection.outbound) {
      console.error('[AirShopping] Cannot confirm: No outbound flight selected');
      return;
    }

    if ((tripType === 'return' || tripType === 'openjaw') && !selection.inbound) {
      console.error('[AirShopping] Cannot confirm: No return flight selected for return/openjaw trip');
      return;
    }

    // Proceed to next step
    handleContinue();
  };

  // Get tomorrow's date for min date
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const minDate = tomorrow.toISOString().split('T')[0];

  // Determine if we can continue based on current state
  const canContinue = () => {
    if (selectionStep === 'search') return false;
    if (selectionStep === 'outbound') {
      if (tripType === 'oneway') return !!selection.outbound;
      return !!selection.outbound; // For return/openjaw, outbound selection enables continue to return
    }
    if (selectionStep === 'return') {
      return !!selection.outbound && !!selection.inbound;
    }
    return false;
  };

  // Handle the main continue action based on current step
  const handleMainContinue = () => {
    if (selectionStep === 'outbound') {
      if (tripType === 'oneway') {
        handleConfirmSelection();
      } else {
        handleSelectOutboundAndContinue();
      }
    } else if (selectionStep === 'return') {
      handleConfirmSelection();
    }
  };

  // Get continue button text
  const getContinueButtonText = () => {
    if (selectionStep === 'outbound') {
      if (tripType === 'oneway') return 'Continue to Price Verification';
      return 'Continue to Return Flight';
    }
    if (selectionStep === 'return') {
      return 'Continue to Price Verification';
    }
    return 'Continue';
  };

  return (
    <div className="space-y-6 pb-20">
      {/* Search Form - Only show when in search step */}
      {selectionStep === 'search' && (
        <Card className="overflow-visible shadow-sm">
          {/* Options Bar */}
          <div className="flex flex-wrap items-center gap-6 px-6 py-4 bg-slate-50 border-b border-slate-200">
            {/* Trip Type */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Trip</span>
              <div className="flex items-center bg-white rounded-lg border border-slate-200 p-0.5">
                {(['return', 'oneway', 'openjaw'] as const).map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setTripType(type)}
                    className={cn(
                      'px-3 py-1.5 rounded-md text-xs font-medium transition-all',
                      tripType === type
                        ? 'bg-slate-900 text-white'
                        : 'text-slate-600 hover:text-slate-900'
                    )}
                  >
                    {type === 'oneway' ? 'One Way' : type === 'openjaw' ? 'Open Jaw' : 'Return'}
                  </button>
                ))}
              </div>
            </div>

            {/* Cabin Class */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Cabin</span>
              <div className="flex items-center bg-white rounded-lg border border-slate-200 p-0.5">
                {(['economy', 'business', 'mixed'] as const).map((cabin) => (
                  <button
                    key={cabin}
                    type="button"
                    onClick={() => setCabinClass(cabin)}
                    className={cn(
                      'px-3 py-1.5 rounded-md text-xs font-medium transition-all capitalize',
                      cabinClass === cabin
                        ? 'bg-slate-900 text-white'
                        : 'text-slate-600 hover:text-slate-900'
                    )}
                  >
                    {cabin}
                  </button>
                ))}
              </div>
            </div>

            {/* Currency */}
            <div className="flex items-center gap-2 ml-auto">
              <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Currency</span>
              <select
                value={selectedCurrency}
                onChange={(e) => setSelectedCurrency(e.target.value)}
                className="bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-medium text-slate-700 focus:ring-2 focus:ring-orange-500 focus:border-orange-500 cursor-pointer"
              >
                {CURRENCIES.map(c => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Form Body */}
          <div className="p-6 space-y-6">
            {/* Route Row */}
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto_1fr] gap-4 items-end">
              {/* Origin */}
              <div className="relative" ref={originDropdownRef}>
                <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">From</label>
                <button
                  type="button"
                  onClick={() => { setShowOriginDropdown(!showOriginDropdown); setShowDestinationDropdown(false); setShowPassengerDropdown(false); }}
                  className={cn(
                    'w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border-2 transition-all text-left bg-white',
                    showOriginDropdown ? 'border-orange-500 shadow-lg shadow-orange-500/10' : 'border-slate-200 hover:border-slate-300'
                  )}
                >
                  <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
                    <MapPin className="w-5 h-5 text-slate-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    {origin ? (
                      <>
                        <span className="text-xl font-bold text-slate-900">{availableAirports.find(a => a.value === origin)?.code}</span>
                        <p className="text-sm text-slate-500 truncate">{availableAirports.find(a => a.value === origin)?.label}</p>
                      </>
                    ) : (
                      <>
                        <span className="text-slate-400 font-medium">Select airport</span>
                        <p className="text-xs text-slate-400">Departure city</p>
                      </>
                    )}
                  </div>
                  <ChevronDown className={cn('w-5 h-5 text-slate-400 transition-transform', showOriginDropdown && 'rotate-180')} />
                </button>

                {showOriginDropdown && (
                  <div className="absolute z-[100] top-full left-0 right-0 mt-2 bg-white rounded-xl shadow-xl border border-slate-200 overflow-hidden">
                    {/* Search Input */}
                    <div className="sticky top-0 bg-white border-b border-slate-200 p-3">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                          ref={originSearchRef}
                          type="text"
                          value={originSearch}
                          onChange={(e) => setOriginSearch(e.target.value)}
                          placeholder="Search airport code or city..."
                          className="w-full pl-10 pr-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 text-sm"
                          autoFocus
                        />
                      </div>
                    </div>
                    {/* Airport List */}
                    <div className="max-h-64 overflow-y-auto">
                      {filteredOriginAirports.length > 0 ? (
                        filteredOriginAirports.map((airport) => (
                          <button
                            key={airport.value}
                            type="button"
                            onClick={() => { setOrigin(airport.value); setShowOriginDropdown(false); setOriginSearch(''); }}
                            className={cn(
                              'w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 text-left border-b border-slate-100 last:border-0',
                              origin === airport.value && 'bg-orange-50'
                            )}
                          >
                            <span className="w-12 font-bold text-slate-900">{airport.code}</span>
                            <span className="text-slate-600 flex-1">{airport.label}</span>
                            <span className="text-xs text-slate-400">{airport.country}</span>
                          </button>
                        ))
                      ) : (
                        <div className="px-4 py-8 text-center text-slate-400 text-sm">
                          No airports found
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Swap */}
              <button
                type="button"
                onClick={swapLocations}
                disabled={!origin && !destination}
                className="w-12 h-12 rounded-xl bg-slate-100 hover:bg-orange-100 border-2 border-slate-200 hover:border-orange-300 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition-all text-slate-500 hover:text-orange-600 mx-auto mb-1"
              >
                <ArrowLeftRight className="w-5 h-5" />
              </button>

              {/* Destination */}
              <div className="relative" ref={destinationDropdownRef}>
                <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">To</label>
                <button
                  type="button"
                  onClick={() => { setShowDestinationDropdown(!showDestinationDropdown); setShowOriginDropdown(false); setShowPassengerDropdown(false); }}
                  className={cn(
                    'w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border-2 transition-all text-left bg-white',
                    showDestinationDropdown ? 'border-orange-500 shadow-lg shadow-orange-500/10' : 'border-slate-200 hover:border-slate-300'
                  )}
                >
                  <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
                    <MapPin className="w-5 h-5 text-slate-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    {destination ? (
                      <>
                        <span className="text-xl font-bold text-slate-900">{availableAirports.find(a => a.value === destination)?.code}</span>
                        <p className="text-sm text-slate-500 truncate">{availableAirports.find(a => a.value === destination)?.label}</p>
                      </>
                    ) : (
                      <>
                        <span className="text-slate-400 font-medium">Select airport</span>
                        <p className="text-xs text-slate-400">Arrival city</p>
                      </>
                    )}
                  </div>
                  <ChevronDown className={cn('w-5 h-5 text-slate-400 transition-transform', showDestinationDropdown && 'rotate-180')} />
                </button>

                {showDestinationDropdown && (
                  <div className="absolute z-[100] top-full left-0 right-0 mt-2 bg-white rounded-xl shadow-xl border border-slate-200 overflow-hidden">
                    {/* Search Input */}
                    <div className="sticky top-0 bg-white border-b border-slate-200 p-3">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                          ref={destinationSearchRef}
                          type="text"
                          value={destinationSearch}
                          onChange={(e) => setDestinationSearch(e.target.value)}
                          placeholder="Search airport code or city..."
                          className="w-full pl-10 pr-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 text-sm"
                          autoFocus
                        />
                      </div>
                    </div>
                    {/* Airport List */}
                    <div className="max-h-64 overflow-y-auto">
                      {filteredDestinationAirports.filter(a => a.value !== origin).length > 0 ? (
                        filteredDestinationAirports.filter(a => a.value !== origin).map((airport) => (
                          <button
                            key={airport.value}
                            type="button"
                            onClick={() => { setDestination(airport.value); setShowDestinationDropdown(false); setDestinationSearch(''); }}
                            className={cn(
                              'w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 text-left border-b border-slate-100 last:border-0',
                              destination === airport.value && 'bg-orange-50'
                            )}
                          >
                            <span className="w-12 font-bold text-slate-900">{airport.code}</span>
                            <span className="text-slate-600 flex-1">{airport.label}</span>
                            <span className="text-xs text-slate-400">{airport.country}</span>
                          </button>
                        ))
                      ) : (
                        <div className="px-4 py-8 text-center text-slate-400 text-sm">
                          No airports found
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Open Jaw Return Route Row - Only show for open jaw trips */}
            {tripType === 'openjaw' && (
              <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto_1fr] gap-3 items-center bg-orange-50/50 p-4 rounded-lg border border-orange-100">
                <div className="lg:col-span-3 mb-2">
                  <p className="text-sm font-medium text-orange-700">Return Journey (Different Route)</p>
                </div>

                {/* Return Origin */}
                <div className="relative" ref={returnOriginDropdownRef}>
                  <label className="block text-xs font-medium text-slate-500 mb-1.5">Return From</label>
                  <button
                    type="button"
                    onClick={() => { setShowReturnOriginDropdown(!showReturnOriginDropdown); setShowReturnDestinationDropdown(false); setShowOriginDropdown(false); setShowDestinationDropdown(false); setShowPassengerDropdown(false); }}
                    className={cn(
                      'w-full flex items-center gap-3 px-4 py-3 rounded-lg border transition-all text-left bg-white',
                      showReturnOriginDropdown ? 'border-orange-500 ring-2 ring-orange-500/20' : 'border-slate-200 hover:border-slate-300'
                    )}
                  >
                    <MapPin className="w-5 h-5 text-orange-400 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      {returnOrigin ? (
                        <div className="flex items-baseline gap-2">
                          <span className="text-lg font-bold text-slate-900">{availableAirports.find(a => a.value === returnOrigin)?.code}</span>
                          <span className="text-sm text-slate-500 truncate">{availableAirports.find(a => a.value === returnOrigin)?.label}</span>
                        </div>
                      ) : (
                        <span className="text-slate-400">Select departure</span>
                      )}
                    </div>
                    <ChevronDown className={cn('w-4 h-4 text-slate-400 transition-transform', showReturnOriginDropdown && 'rotate-180')} />
                  </button>

                  {showReturnOriginDropdown && (
                    <div className="absolute z-[100] top-full left-0 right-0 mt-1 bg-white rounded-lg shadow-xl border border-slate-200 overflow-hidden">
                      {/* Search Input */}
                      <div className="sticky top-0 bg-white border-b border-slate-200 p-3">
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                          <input
                            ref={returnOriginSearchRef}
                            type="text"
                            value={returnOriginSearch}
                            onChange={(e) => setReturnOriginSearch(e.target.value)}
                            placeholder="Search airport code or city..."
                            className="w-full pl-10 pr-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 text-sm"
                            autoFocus
                          />
                        </div>
                      </div>
                      {/* Airport List */}
                      <div className="max-h-64 overflow-y-auto">
                        {filteredReturnOriginAirports.length > 0 ? (
                          filteredReturnOriginAirports.map((airport) => (
                            <button
                              key={airport.value}
                              type="button"
                              onClick={() => { setReturnOrigin(airport.value); setShowReturnOriginDropdown(false); setReturnOriginSearch(''); }}
                              className={cn(
                                'w-full flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 text-left',
                                returnOrigin === airport.value && 'bg-orange-50'
                              )}
                            >
                              <span className="w-12 font-bold text-slate-900">{airport.code}</span>
                              <span className="text-slate-600">{airport.label}</span>
                              <span className="text-xs text-slate-400 ml-auto">{airport.country}</span>
                            </button>
                          ))
                        ) : (
                          <div className="px-4 py-8 text-center text-slate-400 text-sm">
                            No airports found
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Arrow indicator */}
                <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center mx-auto">
                  <ArrowRight className="w-4 h-4 text-orange-500" />
                </div>

                {/* Return Destination */}
                <div className="relative" ref={returnDestinationDropdownRef}>
                  <label className="block text-xs font-medium text-slate-500 mb-1.5">Return To</label>
                  <button
                    type="button"
                    onClick={() => { setShowReturnDestinationDropdown(!showReturnDestinationDropdown); setShowReturnOriginDropdown(false); setShowOriginDropdown(false); setShowDestinationDropdown(false); setShowPassengerDropdown(false); }}
                    className={cn(
                      'w-full flex items-center gap-3 px-4 py-3 rounded-lg border transition-all text-left bg-white',
                      showReturnDestinationDropdown ? 'border-orange-500 ring-2 ring-orange-500/20' : 'border-slate-200 hover:border-slate-300'
                    )}
                  >
                    <MapPin className="w-5 h-5 text-orange-400 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      {returnDestination ? (
                        <div className="flex items-baseline gap-2">
                          <span className="text-lg font-bold text-slate-900">{availableAirports.find(a => a.value === returnDestination)?.code}</span>
                          <span className="text-sm text-slate-500 truncate">{availableAirports.find(a => a.value === returnDestination)?.label}</span>
                        </div>
                      ) : (
                        <span className="text-slate-400">Select arrival</span>
                      )}
                    </div>
                    <ChevronDown className={cn('w-4 h-4 text-slate-400 transition-transform', showReturnDestinationDropdown && 'rotate-180')} />
                  </button>

                  {showReturnDestinationDropdown && (
                    <div className="absolute z-[100] top-full left-0 right-0 mt-1 bg-white rounded-lg shadow-xl border border-slate-200 overflow-hidden">
                      {/* Search Input */}
                      <div className="sticky top-0 bg-white border-b border-slate-200 p-3">
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                          <input
                            ref={returnDestinationSearchRef}
                            type="text"
                            value={returnDestinationSearch}
                            onChange={(e) => setReturnDestinationSearch(e.target.value)}
                            placeholder="Search airport code or city..."
                            className="w-full pl-10 pr-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 text-sm"
                            autoFocus
                          />
                        </div>
                      </div>
                      {/* Airport List */}
                      <div className="max-h-64 overflow-y-auto">
                        {filteredReturnDestinationAirports.filter(a => a.value !== returnOrigin).length > 0 ? (
                          filteredReturnDestinationAirports.filter(a => a.value !== returnOrigin).map((airport) => (
                            <button
                              key={airport.value}
                              type="button"
                              onClick={() => { setReturnDestination(airport.value); setShowReturnDestinationDropdown(false); setReturnDestinationSearch(''); }}
                              className={cn(
                                'w-full flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 text-left',
                                returnDestination === airport.value && 'bg-orange-50'
                              )}
                            >
                              <span className="w-12 font-bold text-slate-900">{airport.code}</span>
                              <span className="text-slate-600">{airport.label}</span>
                              <span className="text-xs text-slate-400 ml-auto">{airport.country}</span>
                            </button>
                          ))
                        ) : (
                          <div className="px-4 py-8 text-center text-slate-400 text-sm">
                            No airports found
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Dates, Passengers, Promo Row */}
            <div className="grid grid-cols-4 gap-4">
              {/* Departure */}
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">Depart</label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                  <input
                    type="date"
                    value={departureDate}
                    onChange={(e) => setDepartureDate(e.target.value)}
                    min={minDate}
                    className="w-full h-11 pl-10 pr-3 rounded-lg border border-slate-200 hover:border-slate-300 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 outline-none text-sm text-slate-900"
                  />
                </div>
              </div>

              {/* Return / Inbound */}
              <div className={cn(tripType === 'oneway' && 'opacity-40 pointer-events-none')}>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">
                  {tripType === 'openjaw' ? 'Inbound' : 'Return'}
                </label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                  <input
                    type="date"
                    value={returnDate}
                    onChange={(e) => setReturnDate(e.target.value)}
                    min={departureDate || minDate}
                    disabled={tripType === 'oneway'}
                    className="w-full h-11 pl-10 pr-3 rounded-lg border border-slate-200 hover:border-slate-300 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 outline-none text-sm text-slate-900 disabled:bg-slate-50"
                  />
                </div>
              </div>

              {/* Passengers */}
              <div className="relative" ref={passengerDropdownRef}>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">Passengers</label>
                <button
                  type="button"
                  onClick={() => { setShowPassengerDropdown(!showPassengerDropdown); setShowOriginDropdown(false); setShowDestinationDropdown(false); }}
                  className={cn(
                    'w-full h-11 flex items-center gap-2 px-3 rounded-lg border transition-all text-left bg-white',
                    showPassengerDropdown ? 'border-orange-500 ring-1 ring-orange-500' : 'border-slate-200 hover:border-slate-300'
                  )}
                >
                  <Users className="w-4 h-4 text-slate-400 flex-shrink-0" />
                  <span className="text-sm text-slate-900 flex-1">{passengerText}</span>
                  <ChevronDown className={cn('w-4 h-4 text-slate-400 transition-transform', showPassengerDropdown && 'rotate-180')} />
                </button>

                {showPassengerDropdown && (
                  <div className="absolute z-[100] top-full left-0 mt-1 bg-white rounded-lg shadow-xl border border-slate-200 p-3 space-y-3 w-64">
                    {/* Adults */}
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-slate-900">Adults</p>
                        <p className="text-xs text-slate-500">12+ years</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button type="button" onClick={() => setAdults(Math.max(1, adults - 1))} disabled={adults <= 1} className="w-8 h-8 rounded-md border border-slate-200 hover:border-slate-300 disabled:opacity-30 flex items-center justify-center text-slate-600">−</button>
                        <span className="w-5 text-center font-semibold">{adults}</span>
                        <button type="button" onClick={() => setAdults(Math.min(9, adults + 1))} disabled={totalPassengers >= 9} className="w-8 h-8 rounded-md bg-orange-500 hover:bg-orange-600 disabled:opacity-30 flex items-center justify-center text-white">+</button>
                      </div>
                    </div>
                    {/* Children */}
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-slate-900">Children</p>
                        <p className="text-xs text-slate-500">2-11 years</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button type="button" onClick={() => setChildren(Math.max(0, children - 1))} disabled={children <= 0} className="w-8 h-8 rounded-md border border-slate-200 hover:border-slate-300 disabled:opacity-30 flex items-center justify-center text-slate-600">−</button>
                        <span className="w-5 text-center font-semibold">{children}</span>
                        <button type="button" onClick={() => setChildren(children + 1)} disabled={totalPassengers >= 9} className="w-8 h-8 rounded-md bg-orange-500 hover:bg-orange-600 disabled:opacity-30 flex items-center justify-center text-white">+</button>
                      </div>
                    </div>
                    {/* Infants */}
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-slate-900">Infants</p>
                        <p className="text-xs text-slate-500">Under 2 (lap)</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button type="button" onClick={() => setInfants(Math.max(0, infants - 1))} disabled={infants <= 0} className="w-8 h-8 rounded-md border border-slate-200 hover:border-slate-300 disabled:opacity-30 flex items-center justify-center text-slate-600">−</button>
                        <span className="w-5 text-center font-semibold">{infants}</span>
                        <button type="button" onClick={() => setInfants(Math.min(adults, infants + 1))} disabled={infants >= adults || totalPassengers >= 9} className="w-8 h-8 rounded-md bg-orange-500 hover:bg-orange-600 disabled:opacity-30 flex items-center justify-center text-white">+</button>
                      </div>
                    </div>
                    <p className="text-xs text-slate-400 pt-2 border-t border-slate-100">Max 9 passengers. 1 infant per adult.</p>
                  </div>
                )}
              </div>

              {/* Promo Code */}
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">Promo Code</label>
                <div className="relative">
                  <Tag className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                  <input
                    type="text"
                    value={promoCode}
                    onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                    placeholder="Optional"
                    className="w-full h-11 pl-10 pr-3 rounded-lg border border-slate-200 hover:border-slate-300 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 outline-none text-sm text-slate-900 placeholder:text-slate-400"
                  />
                </div>
              </div>
            </div>

            {/* Search Button */}
            <div className="flex justify-center pt-2">
              <button
                type="button"
                onClick={handleSearch}
                disabled={
                  isLoading ||
                  !origin ||
                  !destination ||
                  !departureDate ||
                  (tripType === 'return' && !returnDate) ||
                  (tripType === 'openjaw' && (!returnDate || !returnOrigin || !returnDestination))
                }
                className="flex items-center justify-center gap-2 px-8 py-2.5 bg-orange-500 hover:bg-orange-600 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors"
              >
                {isLoading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Searching...
                  </>
                ) : (
                  <>
                    <Search className="w-4 h-4" />
                    Search Flights
                  </>
                )}
              </button>
            </div>
          </div>
        </Card>
      )}

      {/* Error - Enterprise Portal Style */}
      {error && (
        <Card className="border-red-200 bg-gradient-to-br from-red-50 to-white">
          <div className="p-6 space-y-4">
            {/* Header */}
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-red-100 rounded-xl flex items-center justify-center flex-shrink-0">
                <svg className="w-6 h-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>

              <div className="flex-1 space-y-1">
                <h3 className="text-lg font-semibold text-red-900">
                  Search Request Failed
                </h3>
                <p className="text-sm text-red-700">
                  Unable to complete flight search. Please review the details below.
                </p>
              </div>
            </div>

            {/* Error Details */}
            <div className="bg-white rounded-lg border border-red-200 divide-y divide-red-100">
              {/* Parse error message for structured display */}
              {(() => {
                const lines = error.split('\n').filter(Boolean);
                const mainMessage = lines[0] || error;
                const errorDetails = lines.find(line => line.includes('Error Details:'));
                const ndcErrors = lines.slice(lines.findIndex(line => line.includes('Error Details:')) + 1).filter(Boolean);

                return (
                  <>
                    {/* Main Error Message */}
                    <div className="p-4">
                      <div className="flex items-start gap-3">
                        <div className="w-1.5 h-1.5 bg-red-500 rounded-full mt-2 flex-shrink-0"></div>
                        <div className="flex-1">
                          <p className="text-sm font-medium text-gray-900 mb-1">Search Criteria</p>
                          <p className="text-sm text-gray-700 leading-relaxed">
                            {mainMessage}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* NDC Error Details */}
                    {ndcErrors.length > 0 && (
                      <div className="p-4 bg-red-50/50">
                        <div className="flex items-start gap-3">
                          <div className="w-1.5 h-1.5 bg-red-500 rounded-full mt-2 flex-shrink-0"></div>
                          <div className="flex-1">
                            <p className="text-sm font-medium text-gray-900 mb-2">Technical Details</p>
                            <div className="space-y-2">
                              {ndcErrors.map((errLine, idx) => {
                                // Parse error code and message (e.g., "CF4000: nsk-server:PromotionNotFound")
                                const match = errLine.match(/^([A-Z0-9]+):\s*(.+)$/);
                                if (match) {
                                  const [, code, message] = match;
                                  return (
                                    <div key={idx} className="flex items-start gap-3 p-3 bg-white rounded-lg border border-red-200">
                                      <code className="px-2 py-1 bg-red-100 text-red-700 text-xs font-mono font-semibold rounded flex-shrink-0">
                                        {code}
                                      </code>
                                      <p className="text-sm text-gray-700 leading-relaxed break-all">
                                        {message}
                                      </p>
                                    </div>
                                  );
                                }
                                return (
                                  <p key={idx} className="text-sm text-gray-700 p-3 bg-white rounded-lg border border-red-200">
                                    {errLine}
                                  </p>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-between pt-2">
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Tip: Try adjusting your search criteria or check for valid promotional codes</span>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleNewSearch}
                className="border-red-300 text-red-700 hover:bg-red-50"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                New Search
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Flight Results - Outbound */}
      {selectionStep === 'outbound' && (
        <div className="space-y-4">
          <div className="flex items-center justify-end">
            <Button variant="ghost" size="sm" onClick={handleNewSearch}>
              <RefreshCw className="w-4 h-4 mr-2" />
              New Search
            </Button>
          </div>

          {outboundOffers.length > 0 ? (
            <FlightTableView
              direction="outbound"
              offers={outboundOffers}
              selectedOfferId={selection.outbound?.offerId}
              selectedBundleId={selection.outbound?.bundleId}
              onFlightSelect={handleOutboundSelect}
              route={{ origin, destination }}
              date={departureDate}
              passengers={{ adults, children, infants }}
            />
          ) : searchPerformed && !isLoading && !error ? (
            <Card className="p-12">
              <div className="flex flex-col items-center justify-center text-center space-y-4">
                <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center">
                  <MapPin className="w-8 h-8 text-slate-400" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-lg font-semibold text-slate-900">
                    No Outbound Flights Available
                  </h3>
                  <p className="text-slate-600 max-w-md">
                    Unfortunately, there are no flights available from <strong>{origin}</strong> to <strong>{destination}</strong> on {new Date(departureDate).toLocaleDateString('en-AU', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}.
                  </p>
                  <p className="text-sm text-slate-500 mt-4">
                    Please try:
                  </p>
                  <ul className="text-sm text-slate-600 list-disc list-inside space-y-1">
                    <li>Selecting a different date</li>
                    <li>Choosing different airports</li>
                    <li>Checking if this route is operated by Jetstar</li>
                  </ul>
                </div>
                <Button onClick={handleNewSearch} className="mt-4">
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Try Different Search
                </Button>
              </div>
            </Card>
          ) : null}
        </div>
      )}

      {/* Flight Results - Return */}
      {selectionStep === 'return' && (
        <div className="space-y-4">
          <div className="flex items-center justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setSelectionStep('outbound')}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Outbound
            </Button>
            <Button variant="ghost" size="sm" onClick={handleNewSearch}>
              <RefreshCw className="w-4 h-4 mr-2" />
              New Search
            </Button>
          </div>

          {returnOffers.length > 0 ? (
            <FlightTableView
              direction="return"
              offers={returnOffers}
              selectedOfferId={selection.inbound?.offerId}
              selectedBundleId={selection.inbound?.bundleId}
              onFlightSelect={handleReturnSelect}
              route={{
                origin: tripType === 'openjaw' ? returnOrigin : destination,
                destination: tripType === 'openjaw' ? returnDestination : origin,
              }}
              date={returnDate}
              passengers={{ adults, children, infants }}
            />
          ) : searchPerformed && !isLoading && !error ? (
            <Card className="p-12">
              <div className="flex flex-col items-center justify-center text-center space-y-4">
                <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center">
                  <MapPin className="w-8 h-8 text-slate-400" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-lg font-semibold text-slate-900">
                    No Return Flights Available
                  </h3>
                  <p className="text-slate-600 max-w-md">
                    Unfortunately, there are no return flights available from <strong>{tripType === 'openjaw' ? returnOrigin : destination}</strong> to <strong>{tripType === 'openjaw' ? returnDestination : origin}</strong> on {new Date(returnDate).toLocaleDateString('en-AU', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}.
                  </p>
                  <p className="text-sm text-slate-500 mt-4">
                    Please try:
                  </p>
                  <ul className="text-sm text-slate-600 list-disc list-inside space-y-1">
                    <li>Selecting a different return date</li>
                    <li>Choosing different return airports (for open jaw)</li>
                    <li>Going back to select a different outbound flight</li>
                    <li>Checking if this return route is operated by Jetstar</li>
                  </ul>
                </div>
                <div className="flex gap-3 mt-4">
                  <Button variant="outline" onClick={() => setSelectionStep('outbound')}>
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Change Outbound Flight
                  </Button>
                  <Button onClick={handleNewSearch}>
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Try Different Search
                  </Button>
                </div>
              </div>
            </Card>
          ) : null}
        </div>
      )}

      {/* Fixed Footer Navigation - Consistent with other steps */}
      {selectionStep !== 'search' && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 p-4 z-40 shadow-lg">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <button
              onClick={selectionStep === 'return' ? handleBackToOutbound : handleNewSearch}
              className="flex items-center gap-2 px-4 py-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              {selectionStep === 'return' ? 'Back to Outbound' : 'New Search'}
            </button>

            <div className="text-sm text-slate-500">
              {selectionStep === 'outbound' && (tripType === 'return' || tripType === 'openjaw')
                ? 'Step 1 of 2: Select Outbound'
                : selectionStep === 'return'
                  ? 'Step 2 of 2: Select Return'
                  : 'Select Your Flight'}
            </div>

            <button
              onClick={handleMainContinue}
              disabled={!canContinue()}
              className="flex items-center gap-2 px-6 py-2.5 bg-orange-500 hover:bg-orange-600 disabled:bg-slate-200 disabled:text-slate-400 text-white font-semibold rounded-xl transition-colors"
            >
              {getContinueButtonText()}
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Flight card for selection summary
interface FlightSelectionCardProps {
  direction: 'outbound' | 'return';
  offer: FlightOffer;
  bundleId: string;
  price: number;
  currency: string;
  onClick: () => void;
}

function FlightSelectionCard({ direction, offer, bundleId, price, currency, onClick }: FlightSelectionCardProps) {
  const journey = offer.journey;
  const firstSeg = journey.segments[0];
  const lastSeg = journey.segments[journey.segments.length - 1];

  return (
    <button
      onClick={onClick}
      className="w-full p-4 bg-white border border-slate-200 rounded-lg hover:border-orange-300 hover:shadow-md transition-all text-left"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className={cn(
            'w-10 h-10 rounded-full flex items-center justify-center',
            direction === 'outbound' ? 'bg-orange-100 text-orange-600' : 'bg-purple-100 text-purple-600'
          )}>
            {direction === 'outbound' ? <ArrowRight className="w-5 h-5" /> : <ArrowLeft className="w-5 h-5" />}
          </div>
          <div>
            <p className="font-semibold text-slate-900">{firstSeg.origin} → {lastSeg.destination}</p>
            <p className="text-sm text-slate-500">{firstSeg.departureTime} - {lastSeg.arrivalTime}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="font-bold text-slate-900">
            {formatCurrency(price, currency)}
          </p>
          <p className="text-xs text-orange-600 hover:underline">Edit</p>
        </div>
      </div>
    </button>
  );
}
