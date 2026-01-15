import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useXmlViewer } from '@/core/context/XmlViewerContext';
import { useSessionStore, useDistributionContext } from '@/core/context/SessionStore';
import { airShopping } from '@/lib/ndc-api';
import { parseAirShoppingResponse, type ParsedAirShoppingResponse } from '@/lib/parsers';
import { annotateXml, generateXmlSummary, type AnnotationContext } from '@/lib/xml-annotator';
import { TransactionLogger } from '@/lib/transaction-logger';
import type { FlightOffer } from '@/components/flights';

export interface ServiceCriteriaConfig {
  includeInd: boolean;
  RFIC: string;
  RFISC: string;
}

export interface NdcConfig {
  offerCriteria?: {
    serviceCriteria?: ServiceCriteriaConfig[];
  };
  cabinPreference?: string; // M=Economy, C=Business, F=First
}

export interface FlightSearchParams {
  origin: string;
  destination: string;
  departureDate: string;
  returnDate?: string;
  // Open jaw support: specify different return origin/destination
  returnOrigin?: string;      // Where return flight departs from (defaults to destination)
  returnDestination?: string; // Where return flight arrives (defaults to origin)
  passengers: {
    adults: number;
    children: number;
    infants: number;
  };
  promoCode?: string;
  currency?: string;
  ndcConfig?: NdcConfig;
  /** If true, merge results with existing offers (for Mixed mode). Otherwise replace. */
  additive?: boolean;
}

export interface CombinedSearchResult {
  outboundOffers: FlightOffer[];
  returnOffers: FlightOffer[];
  shoppingResponseId: string;
}

export interface UseFlightSearchResult {
  offers: FlightOffer[];
  shoppingResponseId: string | null;
  isLoading: boolean;
  error: string | null;
  search: (params: FlightSearchParams) => Promise<void>;
  searchCombined: (params: FlightSearchParams) => Promise<CombinedSearchResult | null>;
  reset: () => void;
}

export function useFlightSearch(): UseFlightSearchResult {
  const [offers, setOffers] = useState<FlightOffer[]>([]);
  const [shoppingResponseId, setShoppingResponseId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { addCapture, clearCaptures, startNewSession } = useXmlViewer();
  const navigate = useNavigate();
  const logout = useSessionStore((state) => state.logout);
  const distributionContext = useDistributionContext();

  const search = useCallback(async (params: FlightSearchParams) => {
    setIsLoading(true);
    setError(null);

    // Clear previous XML captures and start fresh session for new search
    clearCaptures();
    startNewSession();

    // =========================================================================
    // TRANSACTION LOGGING: Start new transaction and search step
    // =========================================================================
    const tripType = params.returnDate
      ? (params.returnOrigin || params.returnDestination ? 'openjaw' : 'return')
      : 'oneway';

    TransactionLogger.startTransaction(`search-${Date.now()}`);
    TransactionLogger.setSearchCriteria({
      origin: params.origin,
      destination: params.destination,
      departureDate: params.departureDate,
      returnDate: params.returnDate,
      passengers: params.passengers,
      cabinClass: params.ndcConfig?.cabinPreference === 'C' ? 'Business' : 'Economy',
      tripType,
    });
    TransactionLogger.startStep('search', 'Flight Search (AirShopping)', 1);
    TransactionLogger.logUserAction('Initiated flight search', {
      origin: params.origin,
      destination: params.destination,
      departureDate: params.departureDate,
      returnDate: params.returnDate,
      passengers: params.passengers,
    });

    const startTime = Date.now();

    // Transform passengers from { adults, children, infants } to backend format
    const passengers: Array<{ ptc: 'ADT' | 'CHD' | 'INF'; count: number }> = [];
    if (params.passengers.adults > 0) {
      passengers.push({ ptc: 'ADT', count: params.passengers.adults });
    }
    if (params.passengers.children > 0) {
      passengers.push({ ptc: 'CHD', count: params.passengers.children });
    }
    if (params.passengers.infants > 0) {
      passengers.push({ ptc: 'INF', count: params.passengers.infants });
    }

    // Build distribution chain from distribution context (set in wizard)
    console.log('[FlightSearch] Distribution context:', {
      isValid: distributionContext.isValid,
      bookingType: distributionContext.bookingType,
      seller: distributionContext.seller,
      partyConfig: distributionContext.getPartyConfig(),
    });

    const distributionChain = distributionContext.isValid ? {
      links: distributionContext.getPartyConfig()?.participants.map(p => ({
        ordinal: p.ordinal,
        orgRole: p.role,
        orgId: p.orgCode,
        orgName: p.orgName,
      })) || []
    } : undefined;

    console.log('[FlightSearch] Built distributionChain:', JSON.stringify(distributionChain, null, 2));

    const requestPayload = {
      origin: params.origin,
      destination: params.destination,
      departureDate: params.departureDate,
      returnDate: params.returnDate,
      // Open jaw support
      returnOrigin: params.returnOrigin,
      returnDestination: params.returnDestination,
      passengers,
      promoCode: params.promoCode,
      currency: params.currency,
      ndcConfig: params.ndcConfig,
      // Pass cabin preference at top level for the builder
      cabinPreference: params.ndcConfig?.cabinPreference,
      // Include distribution chain for DistributionChainLink in XML
      distributionChain,
    };

    // Log the request payload being sent
    console.log('='.repeat(60));
    console.log('[FlightSearch] REQUEST PAYLOAD:');
    console.log(JSON.stringify(requestPayload, null, 2));
    console.log(`[FlightSearch] Cabin: ${params.ndcConfig?.cabinPreference === 'C' ? 'BUSINESS (CabinTypeCode=2)' : 'ECONOMY (CabinTypeCode=5)'}`);
    console.log('='.repeat(60));

    try {
      const response = await airShopping(requestPayload);

      // Log the request XML that was sent
      console.log('='.repeat(60));
      console.log('[FlightSearch] REQUEST XML:');
      console.log(response.requestXml || 'Not captured');
      console.log('='.repeat(60));

      console.log('[FlightSearch] Raw API response:', response);
      console.log('[FlightSearch] response.data:', response.data);

      // WORKAROUND: Backend not returning error correctly, check data.success
      // If backend wrapped error in success:true, detect it and throw to trigger catch block
      if (response.data && !response.data.success && response.data.errors && response.data.errors.length > 0) {
        console.error('[FlightSearch] NDC response contained errors (detected in frontend):', response.data.errors);
        // Create a fake error response so it goes through normal error handling
        const fakeError: any = new Error('NDC Error');
        fakeError.response = {
          status: 400,
          data: response.data
        };
        throw fakeError;
      }

      // Build descriptive operation name with route codes
      const routeLabel = params.returnDate
        ? `${params.origin}-${params.destination} / ${params.returnOrigin || params.destination}-${params.returnDestination || params.origin}`
        : `${params.origin}-${params.destination}`;
      const cabinLabel = params.ndcConfig?.cabinPreference === 'C' ? 'Business' : 'Economy';
      const operationName = `AirShopping (${routeLabel}, ${cabinLabel})`;

      // Build annotation context for human-readable comments
      const annotationCtx: AnnotationContext = {
        operation: 'AirShopping',
        stepInWorkflow: 'Step 1: Flight Search',
        flight: {
          origin: params.origin,
          destination: params.destination,
          departureDate: params.departureDate,
          returnDate: params.returnDate,
          cabinClass: cabinLabel,
          passengers: params.passengers,
        },
        timestamp: new Date(),
      };

      // Annotate the request XML with human-readable comments
      const annotatedRequest = annotateXml(response.requestXml || '<request not captured>', annotationCtx);

      // Generate human-readable summary for log panel
      const summary = generateXmlSummary(annotationCtx);

      // Capture XML for debugging
      addCapture({
        operation: operationName,
        request: annotatedRequest,
        response: response.responseXml || '<response not captured>',
        duration: Date.now() - startTime,
        status: 'success',
        userAction: 'Searched for available flights',
        summary,
      });

      const parsed = parseAirShoppingResponse(response.data);

      console.log('[FlightSearch] Parsed result:', parsed);
      console.log('[FlightSearch] Offers count:', parsed.offers.length);
      console.log('[FlightSearch] Additive mode:', params.additive);
      console.log('[FlightSearch] Parsed offers with shoppingResponseId:', parsed.offers.map(o => ({
        offerId: o.offerId,
        shoppingResponseId: o.shoppingResponseId
      })));

      // =========================================================================
      // TRANSACTION LOGGING: AirShopping Success
      // =========================================================================
      TransactionLogger.logApiCall({
        operation: operationName,
        requestSummary: `Search ${params.origin}-${params.destination} on ${params.departureDate}`,
        responseSummary: `${parsed.offers.length} offers found`,
        duration: Date.now() - startTime,
        success: true,
      });

      TransactionLogger.logDebug('AirShopping Response', {
        offersCount: parsed.offers.length,
        shoppingResponseId: parsed.shoppingResponseId,
        warnings: parsed.warnings,
        bundlesPerOffer: parsed.offers.slice(0, 3).map(o => ({
          offerId: o.offerId.substring(0, 30),
          bundleCount: o.bundles.length,
          bundleNames: o.bundles.map(b => b.bundleName),
        })),
      });

      TransactionLogger.completeStep('completed');

      // Check if this is an additive search (for mixed mode) - merge with existing offers
      // Only merge when explicitly requested via additive flag
      setOffers(prevOffers => {
        if (params.additive && prevOffers.length > 0 && parsed.offers.length > 0) {
          // Additive mode (Mixed cabin search): merge offers, avoiding duplicates
          const existingIds = new Set(prevOffers.map(o => o.offerId));
          const newOffers = parsed.offers.filter(o => !existingIds.has(o.offerId));
          console.log(`[FlightSearch] Merging ${newOffers.length} new offers with ${prevOffers.length} existing`);
          const merged = [...prevOffers, ...newOffers];
          console.log('[FlightSearch] Merged offers with shoppingResponseId:', merged.map(o => ({
            offerId: o.offerId,
            shoppingResponseId: o.shoppingResponseId
          })));
          return merged;
        }
        // Default: replace offers (for new searches or different direction)
        return parsed.offers;
      });
      setShoppingResponseId(parsed.shoppingResponseId);

      if (parsed.warnings && parsed.warnings.length > 0) {
        console.warn('AirShopping warnings:', parsed.warnings);
        parsed.warnings.forEach(warn => TransactionLogger.logWarning(warn));
      }
    } catch (err: any) {
      console.error('[FlightSearch] Error:', err);
      console.error('[FlightSearch] Error response:', err.response);
      console.error('[FlightSearch] Error response data:', err.response?.data);

      const statusCode = err.response?.status;

      // Handle session expiry - redirect to login
      if (statusCode === 401) {
        console.log('[FlightSearch] Session expired, redirecting to login');
        logout();
        navigate('/login');
        return;
      }

      // Extract the most useful error message and include XML error details
      let errorMessage = 'Search failed';
      const responseData = err.response?.data;

      if (responseData) {
        // Try various error message locations
        if (typeof responseData === 'string') {
          errorMessage = responseData;
        } else if (responseData.error) {
          const rawError = typeof responseData.error === 'string'
            ? responseData.error
            : responseData.error.message || JSON.stringify(responseData.error);

          // Add helpful context if it looks like an NDC error (has error codes)
          if (rawError.match(/^[A-Z]{2}\d{4}:/)) {
            errorMessage = `No flights available for the selected search criteria.\n\nError Details:\n${rawError}`;
          } else {
            errorMessage = rawError;
          }
        } else if (responseData.message) {
          errorMessage = responseData.message;
        } else if (responseData.errors && Array.isArray(responseData.errors)) {
          // Format NDC errors with helpful context
          const ndcErrorDetails = responseData.errors.map((e: any) => {
            if (typeof e === 'string') return e;
            if (e.code && e.message) return `${e.code}: ${e.message}`;
            return e.message || e;
          }).join('; ');

          // Add helpful message before NDC error details
          errorMessage = `No flights available for the selected search criteria.\n\nError Details:\n${ndcErrorDetails}`;
        } else if (responseData.parsed?.errors) {
          errorMessage = responseData.parsed.errors.map((e: any) => e.message || e).join('; ');
        } else {
          // Show raw response for debugging
          errorMessage = `API Error (${statusCode}): ${JSON.stringify(responseData).substring(0, 500)}`;
        }

        // ENHANCED: If parsed NDC errors exist, append them for better debugging
        if (responseData.parsed?.errors && Array.isArray(responseData.parsed.errors)) {
          const ndcErrors = responseData.parsed.errors
            .map((e: any) => {
              if (typeof e === 'string') return e;
              if (e.TypeCode && e.DescText) return `${e.TypeCode}: ${e.DescText}`;
              if (e.DescText) return e.DescText;
              if (e.ShortText) return e.ShortText;
              return JSON.stringify(e);
            })
            .filter(Boolean)
            .join(' | ');

          if (ndcErrors && !errorMessage.includes(ndcErrors)) {
            errorMessage = `${errorMessage}\n\nNDC Error Details:\n${ndcErrors}`;
          }
        }
      } else if (err.message) {
        errorMessage = err.message;
      }

      setError(errorMessage);

      // Build descriptive operation name with route codes (for error capture)
      const routeLabel = params.returnDate
        ? `${params.origin}-${params.destination} / ${params.returnOrigin || params.destination}-${params.returnDestination || params.origin}`
        : `${params.origin}-${params.destination}`;
      const cabinLabel = params.ndcConfig?.cabinPreference === 'C' ? 'Business' : 'Economy';
      const operationName = `AirShopping (${routeLabel}, ${cabinLabel})`;

      // Build annotation context for error case
      const errorAnnotationCtx: AnnotationContext = {
        operation: 'AirShopping (FAILED)',
        stepInWorkflow: 'Step 1: Flight Search',
        flight: {
          origin: params.origin,
          destination: params.destination,
          departureDate: params.departureDate,
          returnDate: params.returnDate,
          cabinClass: cabinLabel,
          passengers: params.passengers,
        },
        timestamp: new Date(),
        changesSinceLastStep: [`Error: ${errorMessage}`],
      };

      const annotatedErrorRequest = annotateXml('<request not captured>', errorAnnotationCtx);
      const errorSummary = generateXmlSummary(errorAnnotationCtx);

      addCapture({
        operation: operationName,
        request: annotatedErrorRequest,
        response: err.response?.data?.xml || err.response?.data?.responseXml || `<error>${errorMessage}</error>`,
        duration: Date.now() - startTime,
        status: 'error',
        summary: errorSummary,
      });

      // =========================================================================
      // TRANSACTION LOGGING: AirShopping Error
      // =========================================================================
      TransactionLogger.logApiCall({
        operation: operationName,
        requestSummary: `Search ${params.origin}-${params.destination} on ${params.departureDate}`,
        responseSummary: `ERROR: ${errorMessage}`,
        duration: Date.now() - startTime,
        success: false,
        errorMessage,
      });

      TransactionLogger.logError(`AirShopping failed: ${errorMessage}`, {
        statusCode,
        responseData: err.response?.data,
      });

      TransactionLogger.completeStep('failed');
    } finally {
      setIsLoading(false);
    }
  }, [addCapture, clearCaptures, startNewSession, logout, navigate, distributionContext]);

  /**
   * Search with return date included - returns both outbound and return offers in single API call
   * Offers are split by direction based on origin of first segment
   */
  const searchCombined = useCallback(async (params: FlightSearchParams): Promise<CombinedSearchResult | null> => {
    if (!params.returnDate) {
      console.error('[FlightSearch] searchCombined requires returnDate');
      return null;
    }

    setIsLoading(true);
    setError(null);

    // Clear previous XML captures and start fresh session for new search
    clearCaptures();
    startNewSession();

    const startTime = Date.now();

    // Transform passengers from { adults, children, infants } to backend format
    const passengers: Array<{ ptc: 'ADT' | 'CHD' | 'INF'; count: number }> = [];
    if (params.passengers.adults > 0) {
      passengers.push({ ptc: 'ADT', count: params.passengers.adults });
    }
    if (params.passengers.children > 0) {
      passengers.push({ ptc: 'CHD', count: params.passengers.children });
    }
    if (params.passengers.infants > 0) {
      passengers.push({ ptc: 'INF', count: params.passengers.infants });
    }

    // Build distribution chain from distribution context (set in wizard)
    const distributionChainCombined = distributionContext.isValid ? {
      links: distributionContext.getPartyConfig()?.participants.map(p => ({
        ordinal: p.ordinal,
        orgRole: p.role,
        orgId: p.orgCode,
        orgName: p.orgName,
      })) || []
    } : undefined;

    const requestPayload = {
      origin: params.origin,
      destination: params.destination,
      departureDate: params.departureDate,
      returnDate: params.returnDate,  // Include return date for combined search
      // Open jaw support
      returnOrigin: params.returnOrigin,
      returnDestination: params.returnDestination,
      passengers,
      promoCode: params.promoCode,
      currency: params.currency,
      ndcConfig: params.ndcConfig,
      cabinPreference: params.ndcConfig?.cabinPreference,
      // Include distribution chain for DistributionChainLink in XML
      distributionChain: distributionChainCombined,
    };

    console.log('='.repeat(60));
    console.log('[FlightSearch] COMBINED SEARCH (outbound + return in 1 call)');
    console.log('[FlightSearch] REQUEST PAYLOAD:');
    console.log(JSON.stringify(requestPayload, null, 2));
    console.log(`[FlightSearch] Cabin: ${params.ndcConfig?.cabinPreference === 'C' ? 'BUSINESS' : 'ECONOMY'}`);
    console.log('='.repeat(60));

    try {
      const response = await airShopping(requestPayload);

      console.log('='.repeat(60));
      console.log('[FlightSearch] COMBINED REQUEST XML:');
      console.log(response.requestXml || 'Not captured');
      console.log('='.repeat(60));

      // WORKAROUND: Backend not returning error correctly, check data.success
      // If backend wrapped error in success:true, detect it and throw to trigger catch block
      if (response.data && !response.data.success && response.data.errors && response.data.errors.length > 0) {
        console.error('[FlightSearch] NDC response contained errors (detected in frontend):', response.data.errors);
        // Create a fake error response so it goes through normal error handling
        const fakeError: any = new Error('NDC Error');
        fakeError.response = {
          status: 400,
          data: response.data
        };
        throw fakeError;
      }

      // Build descriptive operation name with both routes
      const returnFrom = params.returnOrigin || params.destination;
      const returnTo = params.returnDestination || params.origin;
      const cabinLabel = params.ndcConfig?.cabinPreference === 'C' ? 'Business' : 'Economy';
      const operationName = `AirShopping (${params.origin}-${params.destination} + ${returnFrom}-${returnTo}, ${cabinLabel})`;

      // Build annotation context for combined search
      const combinedAnnotationCtx: AnnotationContext = {
        operation: 'AirShopping (Return/OpenJaw)',
        stepInWorkflow: 'Step 1: Flight Search (Combined Outbound + Return)',
        flight: {
          origin: params.origin,
          destination: params.destination,
          departureDate: params.departureDate,
          returnDate: params.returnDate,
          cabinClass: cabinLabel,
          passengers: params.passengers,
        },
        timestamp: new Date(),
        changesSinceLastStep: [
          `Outbound: ${params.origin} → ${params.destination} on ${params.departureDate}`,
          `Return: ${returnFrom} → ${returnTo} on ${params.returnDate}`,
        ],
      };

      const annotatedCombinedRequest = annotateXml(response.requestXml || '<request not captured>', combinedAnnotationCtx);
      const combinedSummary = generateXmlSummary(combinedAnnotationCtx);

      addCapture({
        operation: operationName,
        request: annotatedCombinedRequest,
        response: response.responseXml || '<response not captured>',
        duration: Date.now() - startTime,
        status: 'success',
        userAction: 'Searched for outbound + return flights (combined)',
        summary: combinedSummary,
      });

      const parsed = parseAirShoppingResponse(response.data);

      console.log('[FlightSearch] Parsed offers count:', parsed.offers.length);

      // Split offers by direction based on first segment's origin
      // For open jaw: outbound departs from origin, return departs from returnOrigin (or destination if not specified)
      const outboundOffers: FlightOffer[] = [];
      const returnOffers: FlightOffer[] = [];
      const returnFromAirport = params.returnOrigin || params.destination;

      for (const offer of parsed.offers) {
        const firstSegmentOrigin = offer.journey.segments[0]?.origin;
        if (firstSegmentOrigin === params.origin) {
          // Origin matches search origin -> outbound flight
          outboundOffers.push(offer);
        } else if (firstSegmentOrigin === returnFromAirport) {
          // Origin matches return departure airport -> return flight
          returnOffers.push(offer);
        } else {
          // Fallback: add to outbound
          console.warn('[FlightSearch] Could not determine direction for offer:', offer.offerId, 'origin:', firstSegmentOrigin);
          outboundOffers.push(offer);
        }
      }

      console.log(`[FlightSearch] Split: ${outboundOffers.length} outbound, ${returnOffers.length} return`);

      // Also update the state for legacy compatibility
      setOffers(parsed.offers);
      setShoppingResponseId(parsed.shoppingResponseId);

      return {
        outboundOffers,
        returnOffers,
        shoppingResponseId: parsed.shoppingResponseId,
      };
    } catch (err: any) {
      console.error('[FlightSearch] Combined search error:', err);
      const statusCode = err.response?.status;

      if (statusCode === 401) {
        logout();
        navigate('/login');
        return null;
      }

      let errorMessage = 'Search failed';
      const responseData = err.response?.data;
      if (responseData?.error) {
        errorMessage = typeof responseData.error === 'string'
          ? responseData.error
          : responseData.error.message || JSON.stringify(responseData.error);
      } else if (responseData?.message) {
        errorMessage = responseData.message;
      }

      // ENHANCED: If parsed NDC errors exist, append them for better debugging
      if (responseData?.parsed?.errors && Array.isArray(responseData.parsed.errors)) {
        const ndcErrors = responseData.parsed.errors
          .map((e: any) => {
            if (typeof e === 'string') return e;
            if (e.TypeCode && e.DescText) return `${e.TypeCode}: ${e.DescText}`;
            if (e.DescText) return e.DescText;
            if (e.ShortText) return e.ShortText;
            return JSON.stringify(e);
          })
          .filter(Boolean)
          .join(' | ');

        if (ndcErrors && !errorMessage.includes(ndcErrors)) {
          errorMessage = `${errorMessage}\n\nNDC Error Details:\n${ndcErrors}`;
        }
      }

      setError(errorMessage);

      // Build descriptive operation name with both routes (for error capture)
      const returnFrom = params.returnOrigin || params.destination;
      const returnTo = params.returnDestination || params.origin;
      const cabinLabel = params.ndcConfig?.cabinPreference === 'C' ? 'Business' : 'Economy';
      const errorOperationName = `AirShopping (${params.origin}-${params.destination} + ${returnFrom}-${returnTo}, ${cabinLabel})`;

      // Build annotation context for combined search error
      const combinedErrorAnnotationCtx: AnnotationContext = {
        operation: 'AirShopping (Return/OpenJaw) - FAILED',
        stepInWorkflow: 'Step 1: Flight Search (Combined)',
        flight: {
          origin: params.origin,
          destination: params.destination,
          departureDate: params.departureDate,
          returnDate: params.returnDate,
          cabinClass: cabinLabel,
          passengers: params.passengers,
        },
        timestamp: new Date(),
        changesSinceLastStep: [`Error: ${errorMessage}`],
      };

      const annotatedCombinedErrorRequest = annotateXml('<request not captured>', combinedErrorAnnotationCtx);
      const combinedErrorSummary = generateXmlSummary(combinedErrorAnnotationCtx);

      addCapture({
        operation: errorOperationName,
        request: annotatedCombinedErrorRequest,
        response: `<error>${errorMessage}</error>`,
        duration: Date.now() - startTime,
        status: 'error',
        summary: combinedErrorSummary,
      });

      return null;
    } finally {
      setIsLoading(false);
    }
  }, [addCapture, clearCaptures, startNewSession, logout, navigate, distributionContext]);

  const reset = useCallback(() => {
    setOffers([]);
    setShoppingResponseId(null);
    setError(null);
  }, []);

  return {
    offers,
    shoppingResponseId,
    isLoading,
    error,
    search,
    searchCombined,
    reset,
  };
}
