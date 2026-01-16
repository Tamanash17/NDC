import { useState, useEffect, useMemo, useRef } from 'react';
import { Card, Button, Alert } from '@/components/ui';
import { useFlightSelectionStore } from '@/hooks/useFlightSelection';
import { useXmlViewer } from '@/core/context/XmlViewerContext';
import { useDistributionContext } from '@/core/context/SessionStore';
import { Loader2, Plane, AlertCircle, Info, Check, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { formatCurrency } from '@/lib/format';
import { cn } from '@/lib/cn';
import { seatAvailability } from '@/lib/ndc-api';
import type { SeatMap, Seat, CabinCompartment } from '@/types/ndc.types';
import { createLogger } from '@/utils/debug-logger';

// SSR code requirements for special seats
// NOTE: Backend maps some codes (L→EXTRA_LEGROOM) but keeps others raw (F stays F)
// We need to support BOTH the raw codes AND the mapped names
const SSR_REQUIREMENTS: Record<string, string> = {
  // Extra Legroom - both raw code and mapped name
  'L': 'LEGX',
  'EXTRA_LEGROOM': 'LEGX',
  // Upfront seats - raw code (not mapped in backend)
  'F': 'UPFX',
  'UPFRONT': 'UPFX',
  // Standard seats
  'AV': 'JLSF',
  'JLSF': 'JLSF',
};

// Passenger restrictions by seat characteristic
const PASSENGER_RESTRICTIONS: Record<string, string[]> = {
  '1C': ['CHD'],              // NCHILD: No children
  '1N': ['INF'],              // No infants
  '1A': ['INF'],              // NINFANT: Not suitable for infant
  'NINFANT': ['INF'],         // Not suitable for infant
  'NCHILD': ['CHD'],          // Not suitable for child
  'IE': ['CHD'],              // Not suitable for child
  'EK': ['CHD', 'INF'],       // ECONCOMF Exit rows: No children or infants
  'E': ['CHD', 'INF'],        // EXITROW: No children or infants
  'EXITROW': ['CHD', 'INF'],  // Emergency exit row restrictions
};

// Seat characteristic display names (from Jetstar NDC documentation)
const SEAT_CHAR_NAMES: Record<string, string> = {
  // Position
  'W': 'Window',
  'A': 'Aisle',

  // Exit & Premium
  'E': 'Exit Row',
  'EK': 'Economy Comfort (Exit Row)',
  'L': 'Extra Legroom',
  'F': 'Upfront',
  'CH': 'Chargeable',

  // Special Features
  'B': 'Bulkhead',
  'K': 'Bulkhead',
  'Q': 'Quiet Zone',
  '3': 'Individual Video Screen',
  '70': 'Individual Video Screen',
  'VIDSCR': 'Video Screen',
  'EC': 'Electronic Connection (Power)',

  // Restrictions
  '1C': 'No Children Allowed',
  'NCHILD': 'Not Suitable for Children',
  'IE': 'No Children Allowed',
  '1A': 'No Infants Allowed',
  '1N': 'No Infants Allowed',
  'NINFANT': 'Not Suitable for Infants',
  '1D': 'Restricted Recline',
  'RECLINE': 'Restricted Recline',
  'RESTRICT': 'Restricted (Special Conditions)',
  'SSRN': 'Requires SSR',
  'SSRGN': 'Requires Group SSR',
  'DE': 'Airport Check-in Only',
  '1W': 'Window Seat Without Window',
  'NWINDOW': 'No Window View',

  // Location Features
  '6': 'Near Galley',
  'GALLEY': 'Near Galley',
  '7': 'Near Lavatory',
  'LAVATORY': 'Near Lavatory',
  'AC': 'Near Closet',
  'CLOSET': 'Near Closet',
  'OW': 'Over Wing',
  'WING': 'Over Wing',
  'GN': 'Service Zone',
  'SRVZONE': 'Service Zone',

  // Special Services
  'BK': 'Blocked/Inoperable',
  'BLOCKED': 'Not Available',
  'BASSINET': 'Bassinet Available',
  'H': 'Accessible (Disability)',
  'DISABIL': 'Accessible',
  'I': 'Infant Allowed',
  'INFANT': 'Infant Allowed',
  'PC': 'Pet Allowed',
  'PET': 'Pet Allowed',

  // Grouping
  'GR': 'Group Seat',
  'GRPSEAT': 'Reserved for Groups',

  // Standard
  'AV': 'Standard',
  'JLSF': 'Standard',

  // Other
  'M': 'Middle / Movie Screen',
  'MOVIE': 'Overhead Screen',
  'N': 'No Smoking',
  'NSMOKING': 'Non-Smoking',
  'S': 'Smoking',
  'SMOKING': 'Smoking Permitted',
  'O': 'Preferential Seat',
  'PREFER': 'Premium Location',
  'V': 'Vacant/Hold',
  'VACHOLD': 'Reserved/Held',
  'Z': 'Buffer Seat',
  'BUFFER': 'Buffer/Spacing',
};

interface SeatSelection {
  passengerId: string;
  passengerType: 'ADT' | 'CHD' | 'INF';
  passengerName: string;
  segmentId: string;
  seatId: string;
  row: string;
  column: string;
  price: number;
  currency: string;
  characteristics: string[];
  requiredSSRs: string[];  // SSRs that will be auto-added
  offerItemRefId?: string;
}

interface SegmentSeatData {
  segmentId: string;
  origin: string;
  destination: string;
  flightNumber: string;
  seatMap: SeatMap;
}

interface SeatSelectionStepProps {
  onComplete?: () => void;
  onBack?: () => void;
}

const logger = createLogger('SeatSelection');

export function SeatSelectionStep({ onComplete, onBack }: SeatSelectionStepProps) {
  const flightStore = useFlightSelectionStore();
  const { addCapture } = useXmlViewer();
  const distributionContext = useDistributionContext();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [segmentSeatData, setSegmentSeatData] = useState<SegmentSeatData[]>([]);
  const [currentSegmentIndex, setCurrentSegmentIndex] = useState(0);
  const [selections, setSelections] = useState<SeatSelection[]>([]);
  const [aLaCarteOfferId, setALaCarteOfferId] = useState<string>('');
  const [currentPassengerIndex, setCurrentPassengerIndex] = useState(0);

  // CRITICAL: Use ref to always get latest selections value in async handlers
  // This prevents stale closure issues when handleContinue reads selections
  const selectionsRef = useRef<SeatSelection[]>([]);
  // Keep ref in sync with state
  selectionsRef.current = selections;

  // Auto-select modal state
  const [showAutoSelectModal, setShowAutoSelectModal] = useState(false);
  const [autoSelectResult, setAutoSelectResult] = useState<{
    count: number;
    extraLegroom: number;
    upfront: number;
    standard: number;
    totalPrice: number;
    seats: string[];
    // Enhanced breakdown
    byPassenger?: Array<{
      passengerId: string;
      passengerName: string;
      passengerType: string;
      segments: Array<{
        segmentId: string;
        route: string;
        seatId: string;
        seatType: 'Extra Legroom' | 'Upfront' | 'Standard' | 'Other';
        price: number;
      }>;
      totalCost: number;
    }>;
    bySegment?: Array<{
      segmentId: string;
      route: string;
      seats: Array<{
        passengerId: string;
        passengerName: string;
        seatId: string;
        seatType: string;
        price: number;
      }>;
      totalCost: number;
    }>;
  } | null>(null);

  // Prevent duplicate API calls in React StrictMode
  const fetchedRef = useRef(false);

  // Get all passengers from search criteria
  // NOTE: Infants are NOT included as they are lap infants and don't get separate seats
  const passengers = useMemo(() => {
    const criteria = flightStore.searchCriteria?.passengers || { adults: 1, children: 0, infants: 0 };
    const paxList: Array<{ id: string; type: 'ADT' | 'CHD' | 'INF'; name: string }> = [];

    for (let i = 0; i < criteria.adults; i++) {
      paxList.push({ id: `ADT${i}`, type: 'ADT', name: `Adult ${i + 1}` });
    }
    for (let i = 0; i < criteria.children; i++) {
      paxList.push({ id: `CHD${i}`, type: 'CHD', name: `Child ${i + 1}` });
    }
    // Infants are lap infants - they don't select seats, they're tagged with their accompanying adult
    // for (let i = 0; i < criteria.infants; i++) {
    //   paxList.push({ id: `INF${i}`, type: 'INF', name: `Infant ${i + 1}` });
    // }

    return paxList;
  }, [flightStore.searchCriteria]);

  // Get all segments from selected flights
  const allSegments = useMemo(() => {
    const segments: Array<{ id: string; origin: string; dest: string; flight: string }> = [];

    if (flightStore.selection.outbound) {
      flightStore.selection.outbound.journey.segments.forEach(seg => {
        segments.push({
          id: seg.segmentId,
          origin: seg.origin,
          dest: seg.destination,
          flight: `${seg.marketingCarrier}${seg.flightNumber}`,
        });
      });
    }

    if (flightStore.selection.inbound) {
      flightStore.selection.inbound.journey.segments.forEach(seg => {
        segments.push({
          id: seg.segmentId,
          origin: seg.origin,
          dest: seg.destination,
          flight: `${seg.marketingCarrier}${seg.flightNumber}`,
        });
      });
    }

    return segments;
  }, [flightStore.selection]);

  const currentSegment = segmentSeatData[currentSegmentIndex];
  const currentPassenger = passengers[currentPassengerIndex];

  // CRITICAL: Auto-save selections to store whenever they change
  // This ensures the right panel shows selections immediately for BOTH manual and auto-select
  // Note: We save directly here instead of calling saveSeatsToStore() to avoid function hoisting issues
  useEffect(() => {
    // Skip if no selections or still loading seat maps
    if (selections.length === 0 || isLoading || segmentSeatData.length === 0) {
      return;
    }

    // Debounce the save to avoid excessive updates during rapid seat changes
    const saveTimer = setTimeout(() => {

      // Get the ALaCarte offer ID
      const existingBundles = flightStore.selectedServices?.filter(s => s.serviceType === 'bundle') || [];
      const offerIdToUse = aLaCarteOfferId || existingBundles[0]?.offerId || flightStore.shoppingResponseId || '';

      // Filter valid selections (with offerItemRefId)
      const validSelections = selections.filter(sel => sel.offerItemRefId && sel.offerItemRefId.trim() !== '');

      if (validSelections.length === 0) {
        return;
      }

      // Convert to service items
      const seatServices = validSelections.map(sel => {
        const cleanSegmentId = sel.segmentId.replace(/^Mkt-/, '');
        return {
          serviceId: sel.offerItemRefId!,
          serviceCode: sel.seatId,
          serviceName: `Seat ${sel.seatId}`,
          serviceType: 'seat' as const,
          quantity: 1,
          price: sel.price,
          currency: sel.currency,
          offerId: offerIdToUse,
          offerItemId: sel.offerItemRefId!,
          paxRefIds: [sel.passengerId],
          associationType: 'segment' as const,
          segmentRefs: [cleanSegmentId],
          direction: (flightStore.selection.outbound?.journey.segments.some(s => sel.segmentId.includes(s.segmentId))
            ? 'outbound' : 'inbound') as 'outbound' | 'inbound',
          seatRow: sel.row,
          seatColumn: sel.column,
        };
      });

      // CRITICAL: Also create SSR services for seats with special characteristics (UPFX, LEGX)
      // Use getState() to get fresh SSR mappings from store
      const ssrMappings = useFlightSelectionStore.getState().ssrMappings;
      const ssrServices: typeof flightStore.selectedServices = [];

      // Get unique SSRs from all selections
      const uniqueSSRs = [...new Set(validSelections.flatMap(s => s.requiredSSRs || []))];

      for (const ssrCode of uniqueSSRs) {
        if (!ssrMappings[ssrCode]) {
          continue;
        }

        const seatsNeedingSSR = validSelections.filter(s => s.requiredSSRs?.includes(ssrCode));

        for (const seatSelection of seatsNeedingSSR) {
          const { passengerId, segmentId } = seatSelection;
          // CRITICAL FIX: Strip "Mkt-" prefix from segment ID for SSR mapping lookup
          // Seat selections use "Mkt-seg..." but SSR mappings use "seg..."
          const cleanSegmentId = segmentId.replace(/^Mkt-/, '');

          // SSR mapping now stores { offerId, offerItemId } instead of just offerItemId
          const ssrEntry = ssrMappings[ssrCode]?.[cleanSegmentId]?.[passengerId];

          if (!ssrEntry || !ssrEntry.offerItemId) {
            continue;
          }

          // Use the offerId from SSR mapping (ServiceList ALaCarteOffer ID)
          const ssrOfferId = ssrEntry.offerId;
          const ssrOfferItemId = ssrEntry.offerItemId;

          // Determine direction and get journey ID for SSR association
          const isOutbound = flightStore.selection.outbound?.journey.segments.some(s =>
            cleanSegmentId.includes(s.segmentId.replace(/^Mkt-/, '')) || s.segmentId.replace(/^Mkt-/, '').includes(cleanSegmentId)
          );
          const direction = isOutbound ? 'outbound' : 'inbound';

          ssrServices.push({
            serviceId: `ssr-${ssrCode}-${cleanSegmentId}-${passengerId}`,
            serviceCode: ssrCode,
            serviceName: ssrCode,
            serviceType: 'ssr' as const,
            quantity: 1,
            price: 0,
            currency: 'AUD',
            offerId: ssrOfferId,  // CRITICAL: Use the SSR's own offerId from ServiceList
            offerItemId: ssrOfferItemId,
            paxRefIds: [passengerId],
            // SSRs use SEGMENT association (same as seats) - they're tied to specific segments
            associationType: 'segment' as const,
            segmentRefs: [cleanSegmentId],
            direction: direction as 'outbound' | 'inbound',
          });
        }
      }

      // Keep non-seat/SSR services and replace seat + SSR services
      const existingNonSeatServices = flightStore.selectedServices.filter(s =>
        s.serviceType !== 'seat' && s.serviceType !== 'ssr'
      );

      const allNewServices = [...seatServices, ...ssrServices];
      const newTotal = allNewServices.reduce((sum, s) => sum + (s.price * s.quantity), 0);
      const otherServicesTotal = existingNonSeatServices.reduce((sum, s) => sum + (s.price * s.quantity), 0);

      flightStore.setSelectedServices(
        [...existingNonSeatServices, ...allNewServices],
        otherServicesTotal + newTotal
      );
    }, 300); // 300ms debounce

    return () => clearTimeout(saveTimer);
  }, [selections, isLoading, segmentSeatData.length, aLaCarteOfferId, flightStore]);

  // Fetch seat availability for all segments
  useEffect(() => {
    console.log('[SeatSelection] useEffect triggered - allSegments.length:', allSegments.length);
    console.log('[SeatSelection] Outbound selection:', flightStore.selection.outbound);
    console.log('[SeatSelection] Inbound selection:', flightStore.selection.inbound);

    // Prevent duplicate calls in React StrictMode
    if (fetchedRef.current) {
      console.log('[SeatSelection] Already fetched, skipping duplicate call');
      return;
    }

    const fetchSeatAvailability = async () => {
      fetchedRef.current = true;
      setIsLoading(true);
      setError(null);
      const startTime = Date.now();

      try {
        // Send ONE SeatAvailability request with BOTH offers (as per Postman example)

        // Build offers array - BOTH outbound and inbound in ONE request
        const offers = [];

        // Add outbound offer with ALL OfferItems and segment references
        // IMPORTANT: Strip "Mkt-" prefix from segment IDs - Jetstar expects just "seg123" format
        if (flightStore.selection.outbound) {
          const outboundSegmentIds = flightStore.selection.outbound.journey.segments
            .map(seg => seg.segmentId.replace(/^Mkt-/, '')); // Remove "Mkt-" prefix
          offers.push({
            offerId: flightStore.selection.outbound.offerId,
            ownerCode: 'JQ',
            offerItemIds: flightStore.selection.outbound.offerItemIds || [],
            segmentRefIds: outboundSegmentIds, // Include segment refs as per Postman
          });
        }

        // Add inbound offer with ALL OfferItems and segment references (if round-trip)
        if (flightStore.selection.inbound) {
          const inboundSegmentIds = flightStore.selection.inbound.journey.segments
            .map(seg => seg.segmentId.replace(/^Mkt-/, '')); // Remove "Mkt-" prefix
          offers.push({
            offerId: flightStore.selection.inbound.offerId,
            ownerCode: 'JQ',
            offerItemIds: flightStore.selection.inbound.offerItemIds || [],
            segmentRefIds: inboundSegmentIds, // Include segment refs as per Postman
          });
        }

        // Build distribution chain from user's session context (same as OfferPrice)
        const distributionChain = distributionContext.isValid ? {
          links: distributionContext.getPartyConfig()?.participants.map(p => ({
            ordinal: p.ordinal,
            orgRole: p.role,
            orgId: p.orgCode,
            orgName: p.orgName,
          })) || []
        } : undefined;

        // Send ONE request with all offers
        const result = await seatAvailability({
          offers, // Multi-offer format (one or two offers depending on trip type)
          responseId: flightStore.shoppingResponseId,
          ownerCode: 'JQ',
          distributionChain,
        });

        // Capture XML for XML Logs panel
        if (result.requestXml && result.responseXml) {
          // Build route label from segments
          const outSegs = flightStore.selection.outbound?.journey?.segments;
          const inSegs = flightStore.selection.inbound?.journey?.segments;
          const outOrigin = outSegs?.[0]?.origin || 'XXX';
          const outDest = outSegs?.[outSegs?.length - 1]?.destination || 'XXX';
          const routeLabel = inSegs
            ? `${outOrigin}-${outDest} + ${inSegs[0]?.origin || outDest}-${inSegs[inSegs.length - 1]?.destination || outOrigin}`
            : `${outOrigin}-${outDest}`;

          addCapture({
            operation: `SeatAvailability (${routeLabel})`,
            request: result.requestXml,
            response: result.responseXml,
            duration: Date.now() - startTime,
            status: result.data?.success !== false ? 'success' : 'error',
            userAction: 'Fetched seat availability for selected flights',
          });
        }

        const data = result.data;

        // Extract ALaCarte offer ID from SeatAvailability response for use in OfferPrice
        // All seats will use this offer ID when adding to selectedServices
        // CRITICAL: Use data.aLaCarteOfferId (from ALaCarteOffer/OfferID) NOT seatOffers[0].offerId
        const offerId = data.aLaCarteOfferId || data.seatOffers?.[0]?.offerId;

        if (offerId) {
          await logger.log('ALaCarte offer ID from SeatAvailability', {
            offerId,
            source: data.aLaCarteOfferId ? 'ALaCarteOffer' : 'seatOffers[0]',
            totalOffers: data.seatOffers?.length || 0
          });

          // CRITICAL: Clear old seat/SSR services with different offer IDs
          // Each SeatAvailability response generates a NEW offer ID, and old offer IDs expire
          // This prevents "The selected offer cannot be used on this endpoint" errors
          const currentServices = flightStore.selectedServices;
          const oldSeatsAndSSRs = currentServices.filter(s =>
            (s.serviceType === 'seat' || s.serviceType === 'ssr') && s.offerId !== offerId
          );

          if (oldSeatsAndSSRs.length > 0) {
            await logger.warn('Clearing old seats/SSRs with expired offer IDs', {
              totalOldServices: oldSeatsAndSSRs.length,
              oldOfferIds: [...new Set(oldSeatsAndSSRs.map(s => s.offerId))],
              newOfferId: offerId,
              oldServices: oldSeatsAndSSRs
            });

            // Keep only non-seat/SSR services (bundles, baggage, meals, etc.) or seats/SSRs with current offer ID
            const filteredServices = currentServices.filter(s =>
              !((s.serviceType === 'seat' || s.serviceType === 'ssr') && s.offerId !== offerId)
            );

            // Recalculate total
            const newTotal = filteredServices.reduce((sum, service) => sum + (service.price * service.quantity), 0);

            flightStore.setSelectedServices(filteredServices, newTotal);
          }

          setALaCarteOfferId(offerId);
        } else {
          console.warn('[SeatSelection] No seat offers found in response, will use fallback offer ID');
          await logger.warn('No seat offers found in response, will use fallback offer ID', { dataKeys: Object.keys(data) });
        }

        // Map segments to seat data
        const mappedData: SegmentSeatData[] = allSegments.map((seg) => {
          // Find the seat map for this segment by matching paxSegmentRefId
          const segmentIdWithoutPrefix = seg.id.replace(/^Mkt-/, '');
          const seatMap = data.seatMaps?.find(sm => sm.paxSegmentRefId === segmentIdWithoutPrefix) ||
                          { paxSegmentRefId: segmentIdWithoutPrefix, cabinCompartments: [] };

          return {
            segmentId: seg.id,
            origin: seg.origin,
            destination: seg.dest,
            flightNumber: seg.flight,
            seatMap,
          };
        });

        setSegmentSeatData(mappedData);
      } catch (err) {
        console.error('[SeatSelection] ERROR:', err);
        setError(err instanceof Error ? err.message : 'Failed to load seat maps');

        // Capture error in XML Logs panel
        const errorMessage = err instanceof Error ? err.message : 'Failed to load seat maps';
        const errorResponse = (err as any)?.response?.data?.responseXml || `<error>${errorMessage}</error>`;
        const errorRequest = (err as any)?.response?.data?.requestXml || '<request not captured>';

        // Build route label from segments
        const outSegs = flightStore.selection.outbound?.journey?.segments;
        const inSegs = flightStore.selection.inbound?.journey?.segments;
        const outOrigin = outSegs?.[0]?.origin || 'XXX';
        const outDest = outSegs?.[outSegs?.length - 1]?.destination || 'XXX';
        const routeLabel = inSegs
          ? `${outOrigin}-${outDest} + ${inSegs[0]?.origin || outDest}-${inSegs[inSegs.length - 1]?.destination || outOrigin}`
          : `${outOrigin}-${outDest}`;

        addCapture({
          operation: `SeatAvailability (${routeLabel})`,
          request: errorRequest,
          response: errorResponse,
          duration: Date.now() - startTime,
          status: 'error',
          userAction: 'Failed to fetch seat availability',
        });
      } finally {
        setIsLoading(false);
      }
    };

    if (allSegments.length > 0) {
      fetchSeatAvailability();
    }
  }, [allSegments, flightStore.selection.outbound?.offerId, flightStore.selection.inbound?.offerId, flightStore.shoppingResponseId, addCapture]);

  // Check if seat is restricted for passenger type
  const isSeatRestricted = (characteristics: string[], passengerType: string): boolean => {
    for (const char of characteristics) {
      const restrictions = PASSENGER_RESTRICTIONS[char];
      if (restrictions && restrictions.includes(passengerType)) {
        return true;
      }
    }
    return false;
  };

  // Get required SSRs for seat characteristics
  const getRequiredSSRs = (characteristics: string[]): string[] => {
    const ssrs: string[] = [];
    for (const char of characteristics) {
      const ssr = SSR_REQUIREMENTS[char];
      if (ssr && !ssrs.includes(ssr)) {
        ssrs.push(ssr);
      }
    }
    return ssrs;
  };

  // Check if seat is already selected
  const isSeatSelected = (seatId: string, segmentId: string): boolean => {
    return selections.some(s => s.seatId === seatId && s.segmentId === segmentId);
  };

  // Get passenger who selected this seat
  const getSeatOccupant = (seatId: string, segmentId: string): string | null => {
    const selection = selections.find(s => s.seatId === seatId && s.segmentId === segmentId);
    return selection ? selection.passengerName : null;
  };

  // Handle seat selection
  const handleSeatSelect = (seat: Seat, row: string, segmentId: string, price: number = 0) => {
    console.log('[SeatSelection] handleSeatSelect called:', { seat, row, segmentId, price, currentPassenger, currentSegment });
    console.log('[SeatSelection] Seat object keys:', Object.keys(seat));
    console.log('[SeatSelection] seat.offerItemIdsByPaxType:', seat.offerItemIdsByPaxType);
    console.log('[SeatSelection] Full seat object:', JSON.stringify(seat, null, 2));

    if (!currentPassenger || !currentSegment) {
      console.log('[SeatSelection] Early return - no currentPassenger or currentSegment');
      return;
    }

    const seatId = `${row}${seat.columnId}`;
    console.log('[SeatSelection] Selecting seat:', seatId, 'for passenger:', currentPassenger.id, currentPassenger.type);

    // Check if seat is restricted
    if (isSeatRestricted(seat.characteristics || [], currentPassenger.type)) {
      alert(`This seat is not available for ${currentPassenger.type === 'CHD' ? 'children' : 'infants'} due to safety regulations.`);
      return;
    }

    // Check if already selected by another passenger (but allow current passenger to change their seat)
    const existingSelection = selections.find(s => s.seatId === seatId && s.segmentId === segmentId);
    if (existingSelection && existingSelection.passengerId !== currentPassenger.id) {
      alert(`This seat is already selected by ${existingSelection.passengerName}.`);
      return;
    }

    const requiredSSRs = getRequiredSSRs(seat.characteristics || []);

    // DEBUG: Log characteristics and SSR detection
    console.log(`[SeatSelection] Seat ${seatId} characteristics:`, seat.characteristics);
    console.log(`[SeatSelection] Seat ${seatId} detected SSRs:`, requiredSSRs);

    // CRITICAL: Get passenger-type-specific offerItemId from offerItemIdsByPaxType
    // Jetstar returns different OfferItemIDs for same seat based on passenger type (ADT, CHD, INF)
    let offerItemRefId: string | undefined;
    if (seat.offerItemIdsByPaxType) {
      // Look up the offerItemId for this passenger's type
      offerItemRefId = seat.offerItemIdsByPaxType[currentPassenger.type];

      if (!offerItemRefId) {
        console.error(`[SeatSelection] ❌ CRITICAL: Seat ${seatId} has no offerItemId for passenger type ${currentPassenger.type}!`, {
          seatId,
          row,
          column: seat.columnId,
          passengerType: currentPassenger.type,
          offerItemIdsByPaxType: seat.offerItemIdsByPaxType,
          availablePaxTypes: Object.keys(seat.offerItemIdsByPaxType),
        });
        logger.error(`Seat ${seatId} has no offerItemId for ${currentPassenger.type}`, {
          seatId,
          row,
          column: seat.columnId,
          passengerType: currentPassenger.type,
          availablePaxTypes: Object.keys(seat.offerItemIdsByPaxType),
        });
        alert(`This seat is not available for ${currentPassenger.type} passengers.`);
        return;
      } else {
        console.log(`[SeatSelection] ✅ Seat ${seatId} has passenger-specific offerItemId for ${currentPassenger.type}: ${offerItemRefId}`);
      }
    } else {
      console.error(`[SeatSelection] ❌ CRITICAL: Seat ${seatId} is MISSING offerItemIdsByPaxType!`, {
        seatId,
        row,
        column: seat.columnId,
        price,
        segmentId,
        passengerId: currentPassenger.id,
        passengerType: currentPassenger.type,
        fullSeatObject: seat,
        seatKeys: Object.keys(seat),
      });
      logger.error(`Seat ${seatId} is missing offerItemIdsByPaxType`, {
        seatId,
        row,
        column: seat.columnId,
        segmentId,
        passengerId: currentPassenger.id,
        passengerType: currentPassenger.type,
        seatKeys: Object.keys(seat),
      });
    }

    // Remove existing selection for this passenger on this segment (allows changing seats)
    const newSelections = selections.filter(
      s => !(s.passengerId === currentPassenger.id && s.segmentId === segmentId)
    );

    // Add new selection with passenger-type-specific offerItemId
    newSelections.push({
      passengerId: currentPassenger.id,
      passengerType: currentPassenger.type,
      passengerName: currentPassenger.name,
      segmentId,
      seatId,
      row,
      column: seat.columnId,
      price,
      currency: 'AUD',
      characteristics: seat.characteristics || [],
      requiredSSRs,
      offerItemRefId,  // Passenger-type-specific OfferItemID
    });

    console.log('[SeatSelection] Setting new selections:', newSelections);
    console.log('[SeatSelection] New selection details:', newSelections.map(s => ({
      seatId: s.seatId,
      passengerId: s.passengerId,
      passengerType: s.passengerType,
      offerItemRefId: s.offerItemRefId,
      hasOfferItemRefId: !!s.offerItemRefId
    })));
    setSelections(newSelections);

    // Auto-advance to next passenger
    if (currentPassengerIndex < passengers.length - 1) {
      setCurrentPassengerIndex(currentPassengerIndex + 1);
    }
  };

  // Handle remove seat selection
  const handleRemoveSeat = (passengerId: string, segmentId: string) => {
    setSelections(selections.filter(
      s => !(s.passengerId === passengerId && s.segmentId === segmentId)
    ));
  };

  // Handle change seat (switch to that passenger and segment)
  const handleChangeSeat = (passengerId: string, segmentId: string) => {
    // Find passenger index
    const paxIndex = passengers.findIndex(p => p.id === passengerId);
    if (paxIndex >= 0) {
      setCurrentPassengerIndex(paxIndex);
    }

    // Find segment index
    const segIndex = segmentSeatData.findIndex(s => s.segmentId === segmentId);
    if (segIndex >= 0) {
      setCurrentSegmentIndex(segIndex);
    }
  };

  // Auto-select seats for all passengers on ALL segments with smart preferences
  const handleAutoSelect = () => {
    console.log('[AutoSelect] ===== Starting auto-selection for ALL segments =====');
    console.log('[AutoSelect] Total segments:', segmentSeatData.length);
    console.log('[AutoSelect] Total passengers:', passengers.length);

    const newSelections = [...selections];
    let totalSeatsSelected = 0;
    let totalExtraLegroom = 0;
    let totalUpfront = 0;
    let totalStandard = 0;
    let totalPrice = 0;
    const allSelectedSeats: string[] = [];

    // Process each segment
    for (let segIdx = 0; segIdx < segmentSeatData.length; segIdx++) {
      const segment = segmentSeatData[segIdx];
      const segmentId = segment.segmentId;

      console.log(`[AutoSelect] Processing segment ${segIdx + 1}/${segmentSeatData.length}: ${segment.origin}-${segment.destination}`);

      if (!segment.seatMap) {
        console.warn(`[AutoSelect] No seat map for segment ${segmentId}, skipping`);
        continue;
      }

      // Get passengers needing seats for this segment
      const passengersNeedingSeats = passengers.filter(pax =>
        !newSelections.some(s => s.passengerId === pax.id && s.segmentId === segmentId)
      );

      if (passengersNeedingSeats.length === 0) {
        console.log(`[AutoSelect] All passengers already have seats for segment ${segmentId}`);
        continue;
      }

      const hasInfants = passengersNeedingSeats.some(p => p.type === 'INF');
      const hasChildren = passengersNeedingSeats.some(p => p.type === 'CHD');
      console.log(`[AutoSelect] Segment ${segmentId}: ${passengersNeedingSeats.length} passengers need seats`, { hasInfants, hasChildren });

      // Categorize all available seats by type and characteristics
      type CategorizedSeat = {
        seat: Seat;
        row: string;
        rowNum: number;
        columnId: string;
        price: number;
        hasExtraLegroom: boolean;
        hasUpfront: boolean;
        isStandard: boolean;
        isExitRow: boolean;
        isWindow: boolean;
        isAisle: boolean;
        restrictedFor: string[];
      };

      const availableSeats: CategorizedSeat[] = [];

      // CRITICAL FIX: Do NOT filter by cabin type
      // SeatAvailability request doesn't specify cabin, so Jetstar returns all cabins
      // Jetstar's pricing (offerItemRefId) determines which seats are sellable
      // Auto-select should only pick seats WITH pricing (offerItemRefId present)

      console.log(`[AutoSelect] Segment ${segmentId} - Processing ALL cabins (no cabin filter)`);

      segment.seatMap.cabinCompartments.forEach(cabin => {
        console.log(`[AutoSelect] Processing cabin ${cabin.cabinTypeCode}`);

        cabin.seatRows.forEach(row => {
          row.seats.forEach(seat => {
            const seatId = `${row.rowNumber}${seat.columnId}`;
            // Skip occupied (O) and blocked (Z) seats
            const isOccupied = seat.occupationStatus === 'O' || seat.occupationStatus === 'Z';
            const isAlreadySelected = newSelections.some(s => s.seatId === seatId && s.segmentId === segmentId);

            if (!isOccupied && !isAlreadySelected) {
              const chars = seat.characteristics || [];

              // Check restrictions
              const restrictedFor: string[] = [];
              chars.forEach(char => {
                const restrictions = PASSENGER_RESTRICTIONS[char];
                if (restrictions) {
                  restrictedFor.push(...restrictions);
                }
              });

              availableSeats.push({
                seat,
                row: row.rowNumber,
                rowNum: parseInt(row.rowNumber, 10),
                columnId: seat.columnId,
                price: seat.price?.value || 0,
                hasExtraLegroom: chars.includes('L'),
                hasUpfront: chars.includes('F'),
                isStandard: chars.includes('AV') || chars.includes('JLSF'),
                isExitRow: chars.includes('E') || chars.includes('EK') || chars.includes('EXITROW'),
                isWindow: chars.includes('W'),
                isAisle: chars.includes('A'),
                restrictedFor: [...new Set(restrictedFor)],
              });
            }
          });
        });
      });

      console.log(`[AutoSelect] Segment ${segmentId} - Available seats:`, availableSeats.length);
      console.log(`[AutoSelect] Segment ${segmentId} - Extra legroom:`, availableSeats.filter(s => s.hasExtraLegroom).length);
      console.log(`[AutoSelect] Segment ${segmentId} - Upfront:`, availableSeats.filter(s => s.hasUpfront).length);
      console.log(`[AutoSelect] Segment ${segmentId} - Standard:`, availableSeats.filter(s => s.isStandard).length);

      if (availableSeats.length === 0) {
        console.error(`[AutoSelect] No available seats for segment ${segmentId}`);
        setAutoSelectResult({
          count: -1,
          extraLegroom: 0,
          upfront: 0,
          standard: 0,
          totalPrice: 0,
          seats: [],
        });
        setShowAutoSelectModal(true);
        return;
      }

      if (availableSeats.length < passengersNeedingSeats.length) {
        console.error(`[AutoSelect] Not enough seats for segment ${segmentId}: need ${passengersNeedingSeats.length}, have ${availableSeats.length}`);
        setAutoSelectResult({
          count: -2,
          extraLegroom: availableSeats.length,
          upfront: passengersNeedingSeats.length,
          standard: 0,
          totalPrice: 0,
          seats: [],
        });
        setShowAutoSelectModal(true);
        return;
      }

      // BUSINESS RULES FOR AUTO-SELECTION:
      // 1. If infants present: Must select non-exit row, non-restricted seats for adults with infants
      // 2. Preference order: Extra Legroom (L) > Upfront (F) > Standard (AV/JLSF)
      // 3. Try to keep group together (same row or adjacent rows)
      // 4. Vary seat selection across segments (don't always pick row 1)
      // 5. Prefer window/aisle over middle seats

      // Use segment index to vary selection
      const rowOffset = segIdx * 3; // Offset starting row by 3 per segment

      // Filter seats based on restrictions
      const suitableSeats = availableSeats.filter(s => {
        // If infants present, exclude exit rows
        if (hasInfants && s.isExitRow) {
          return false;
        }
        // If children present, exclude child-restricted seats
        if (hasChildren && s.restrictedFor.includes('CHD')) {
          return false;
        }
        return true;
      });

      console.log(`[AutoSelect] Segment ${segmentId} - Suitable seats (after restrictions):`, suitableSeats.length);

      if (suitableSeats.length < passengersNeedingSeats.length) {
        console.error(`[AutoSelect] Not enough suitable seats for segment ${segmentId}: need ${passengersNeedingSeats.length}, have ${suitableSeats.length}`);
        setAutoSelectResult({
          count: -3,
          extraLegroom: suitableSeats.length,
          upfront: passengersNeedingSeats.length,
          standard: 0,
          totalPrice: 0,
          seats: [],
        });
        setShowAutoSelectModal(true);
        return;
      }

      // Sort seats by preference: Extra Legroom > Upfront > Standard
      // Within each category: prioritize by row (with offset), then window/aisle preference
      suitableSeats.sort((a, b) => {
        // Primary: Seat type preference
        const aType = a.hasExtraLegroom ? 3 : a.hasUpfront ? 2 : a.isStandard ? 1 : 0;
        const bType = b.hasExtraLegroom ? 3 : b.hasUpfront ? 2 : b.isStandard ? 1 : 0;
        if (aType !== bType) return bType - aType; // Higher preference first

        // Secondary: Row number (with offset to vary across segments)
        const aRowPriority = Math.abs(a.rowNum - rowOffset);
        const bRowPriority = Math.abs(b.rowNum - rowOffset);
        if (aRowPriority !== bRowPriority) return aRowPriority - bRowPriority;

        // Tertiary: Window/Aisle preference
        const aPositionScore = (a.isWindow ? 2 : 0) + (a.isAisle ? 2 : 0);
        const bPositionScore = (b.isWindow ? 2 : 0) + (b.isAisle ? 2 : 0);
        if (aPositionScore !== bPositionScore) return bPositionScore - aPositionScore;

        // Quaternary: Price (prefer free seats)
        return a.price - b.price;
      });

      // Create selections for this segment
      // CRITICAL FIX: Dynamically find suitable seat for each passenger instead of pre-slicing
      let segmentSelectionCount = 0;
      const usedSeatIndices = new Set<number>();

      console.log(`[AutoSelect] Segment ${segmentId} - Attempting to assign ${passengersNeedingSeats.length} seats`);

      passengersNeedingSeats.forEach((pax, paxIdx) => {
        // Find first available seat that is NOT restricted for this passenger type
        let selectedSeat: typeof suitableSeats[0] | null = null;
        let seatIndex = -1;

        for (let i = 0; i < suitableSeats.length; i++) {
          if (usedSeatIndices.has(i)) continue; // Skip already assigned seats

          const candidate = suitableSeats[i];

          // Check if seat is restricted for this passenger type
          if (candidate.restrictedFor.includes(pax.type)) {
            console.log(`[AutoSelect] Seat ${candidate.row}${candidate.columnId} restricted for ${pax.type}, trying next...`);
            continue;
          }

          // Found a suitable seat!
          selectedSeat = candidate;
          seatIndex = i;
          break;
        }

        if (!selectedSeat) {
          console.error(`[AutoSelect] No suitable seat found for ${pax.name} (${pax.type}) on segment ${segmentId}`);
          return;
        }

        // Mark this seat as used
        usedSeatIndices.add(seatIndex);

        const requiredSSRs = getRequiredSSRs(selectedSeat.seat.characteristics || []);

        // CRITICAL: Get passenger-type-specific offerItemId from offerItemIdsByPaxType
        let offerItemRefId: string | undefined;
        if (selectedSeat.seat.offerItemIdsByPaxType) {
          offerItemRefId = selectedSeat.seat.offerItemIdsByPaxType[pax.type];
          if (!offerItemRefId) {
            console.error(`[AutoSelect] ⚠️ Seat ${selectedSeat.row}${selectedSeat.columnId} for ${pax.name} (${pax.type}) has no offerItemId for this passenger type!`);
            console.error(`[AutoSelect] Available types:`, Object.keys(selectedSeat.seat.offerItemIdsByPaxType));
          }
        } else {
          console.error(`[AutoSelect] ⚠️ Seat ${selectedSeat.row}${selectedSeat.columnId} for ${pax.name} is missing offerItemIdsByPaxType!`);
          console.error(`[AutoSelect] This seat will be filtered out during save. Seat data:`, selectedSeat.seat);
        }

        newSelections.push({
          passengerId: pax.id,
          passengerType: pax.type,
          passengerName: pax.name,
          segmentId,
          seatId: `${selectedSeat.row}${selectedSeat.columnId}`,
          row: selectedSeat.row,
          column: selectedSeat.columnId,
          price: selectedSeat.price,
          currency: 'AUD',
          characteristics: selectedSeat.seat.characteristics || [],
          requiredSSRs,
          offerItemRefId,  // Passenger-type-specific OfferItemID
        });
        segmentSelectionCount++;
        totalSeatsSelected++;
        totalPrice += selectedSeat.price;
        allSelectedSeats.push(`${segment.origin}-${segment.destination}: ${selectedSeat.row}${selectedSeat.columnId} for ${pax.name}`);

        // Track seat types
        if (selectedSeat.hasExtraLegroom) totalExtraLegroom++;
        if (selectedSeat.hasUpfront) totalUpfront++;
        if (selectedSeat.isStandard) totalStandard++;

        console.log(`[AutoSelect] ✓ Assigned ${selectedSeat.row}${selectedSeat.columnId} to ${pax.name} (${pax.type})`);
      });

      console.log(`[AutoSelect] Segment ${segmentId} - Assigned ${segmentSelectionCount} seats`);
    } // End of segment loop

    // Update selections with all new seats
    setSelections(newSelections);

    // Check if we selected any seats
    if (totalSeatsSelected === 0) {
      setAutoSelectResult({
        count: 0,
        extraLegroom: 0,
        upfront: 0,
        standard: 0,
        totalPrice: 0,
        seats: [],
      });
      setShowAutoSelectModal(true);
      console.log('[AutoSelect] ✅ All passengers already have seats');
      return;
    }

    // Build detailed breakdown by passenger
    const byPassenger = passengers.map(pax => {
      const paxSelections = newSelections.filter(s => s.passengerId === pax.id && !selections.some(old => old.passengerId === s.passengerId && old.segmentId === s.segmentId));
      const segments = paxSelections.map(sel => {
        const segment = segmentSeatData.find(s => s.segmentId === sel.segmentId);
        const seatType = sel.characteristics.includes('L') ? 'Extra Legroom' :
                        sel.characteristics.includes('F') ? 'Upfront' :
                        sel.characteristics.includes('AV') || sel.characteristics.includes('JLSF') ? 'Standard' :
                        'Other' as 'Extra Legroom' | 'Upfront' | 'Standard' | 'Other';

        return {
          segmentId: sel.segmentId,
          route: segment ? `${segment.origin}-${segment.destination}` : sel.segmentId,
          seatId: sel.seatId,
          seatType,
          price: sel.price,
        };
      });

      return {
        passengerId: pax.id,
        passengerName: pax.name,
        passengerType: pax.type,
        segments,
        totalCost: segments.reduce((sum, s) => sum + s.price, 0),
      };
    }).filter(p => p.segments.length > 0);

    // Build detailed breakdown by segment
    const bySegment = segmentSeatData.map(segment => {
      const segmentSelections = newSelections.filter(s => s.segmentId === segment.segmentId && !selections.some(old => old.passengerId === s.passengerId && old.segmentId === s.segmentId));
      const seats = segmentSelections.map(sel => {
        const seatType = sel.characteristics.includes('L') ? 'Extra Legroom' :
                        sel.characteristics.includes('F') ? 'Upfront' :
                        sel.characteristics.includes('AV') || sel.characteristics.includes('JLSF') ? 'Standard' :
                        'Other';

        return {
          passengerId: sel.passengerId,
          passengerName: sel.passengerName,
          seatId: sel.seatId,
          seatType,
          price: sel.price,
        };
      });

      return {
        segmentId: segment.segmentId,
        route: `${segment.origin}-${segment.destination}`,
        seats,
        totalCost: seats.reduce((sum, s) => sum + s.price, 0),
      };
    }).filter(s => s.seats.length > 0);

    // Show success message with detailed breakdown
    setAutoSelectResult({
      count: totalSeatsSelected,
      extraLegroom: totalExtraLegroom,
      upfront: totalUpfront,
      standard: totalStandard,
      totalPrice,
      seats: allSelectedSeats,
      byPassenger,
      bySegment,
    });
    setShowAutoSelectModal(true);

    console.log('[AutoSelect] ===== ✅ COMPLETED =====');
    console.log(`[AutoSelect] Total seats selected: ${totalSeatsSelected} across ${segmentSeatData.length} segments`);
    console.log(`[AutoSelect] Breakdown: ${totalExtraLegroom} Extra Legroom, ${totalUpfront} Upfront, ${totalStandard} Standard`);
    console.log(`[AutoSelect] Total cost: ${totalPrice} AUD`);
  };

  // Navigate to next segment
  const handleNextSegment = () => {
    console.log('[SeatSelection] Moving to next segment');
    if (currentSegmentIndex < segmentSeatData.length - 1) {
      setCurrentSegmentIndex(currentSegmentIndex + 1);
      setCurrentPassengerIndex(0);  // Reset to first passenger
      console.log('[SeatSelection] Moved to segment', currentSegmentIndex + 1);
    }
  };

  // Navigate to previous segment
  const handlePreviousSegment = () => {
    if (currentSegmentIndex > 0) {
      setCurrentSegmentIndex(currentSegmentIndex - 1);
      setCurrentPassengerIndex(0);
    }
  };

  // Save selections to store (without navigating)
  const saveSeatsToStore = async () => {
    // CRITICAL: Use selectionsRef.current to get latest state value
    // This prevents stale closure issues where selections is empty
    const currentSelections = selectionsRef.current;

    console.log('[SeatSelection] ===== SAVING SEAT SELECTIONS =====');
    console.log('[SeatSelection] Total selections (from ref):', currentSelections.length);
    console.log('[SeatSelection] Total selections (from state):', selections.length);
    console.log('[SeatSelection] Selections:', currentSelections);

    // Validate all passengers have seats for all segments
    const totalPassengers = passengers.length;
    const totalSegments = segmentSeatData.length;
    const expectedSelections = totalPassengers * totalSegments;
    console.log('[SeatSelection] Expected selections:', expectedSelections, `(${totalPassengers} passengers × ${totalSegments} segments)`);

    if (currentSelections.length < expectedSelections) {
      console.warn('[SeatSelection] ⚠️ Not all passengers have seats selected!');
      console.warn('[SeatSelection] Missing:', expectedSelections - currentSelections.length, 'seat selections');
    }

    // Use ALaCarte offer ID from SeatAvailability response
    // Fallback 1: Try existing bundles (if user selected bundle swaps)
    // Fallback 2: Use shopping response ID as last resort
    const existingBundles = flightStore.selectedServices?.filter(s => s.serviceType === 'bundle') || [];
    const offerIdToUse = aLaCarteOfferId || existingBundles[0]?.offerId || flightStore.shoppingResponseId || '';
    console.log('[SeatSelection] Using ALaCarte offer ID:', offerIdToUse);
    console.log('[SeatSelection] Source:', aLaCarteOfferId ? 'SeatAvailability' : existingBundles.length > 0 ? 'Bundle' : 'ShoppingResponse');

    // CRITICAL VALIDATION: Only filter out seats WITHOUT offerItemRefId
    // ALL seats with offerItemRefId must go to OfferPrice (including free seats)
    // Jetstar provides offerItemRefId even for free seats, meaning they MUST be sent to OfferPrice
    const validSelections = currentSelections.filter(sel => {
      // Seats must have offerItemRefId to be sent to OfferPrice
      if (!sel.offerItemRefId || sel.offerItemRefId.trim() === '') {
        console.error(`[SeatSelection] ❌ INVALID SEAT: ${sel.seatId} for ${sel.passengerId} on segment ${sel.segmentId} - missing offerItemRefId! Price: ${sel.price}`);
        return false;
      }
      return true;
    });

    const freeSeatsCount = currentSelections.filter(s => s.price === 0 && s.offerItemRefId).length;
    const paidSeatsCount = currentSelections.filter(s => s.price > 0 && s.offerItemRefId).length;
    const invalidSeatsCount = currentSelections.filter(s => !s.offerItemRefId || s.offerItemRefId.trim() === '').length;

    console.log(`[SeatSelection] Seat validation: ${currentSelections.length} total, ${freeSeatsCount} free (included), ${paidSeatsCount} paid (included), ${invalidSeatsCount} invalid (excluded), ${validSelections.length} valid for OfferPrice`);

    if (invalidSeatsCount > 0) {
      console.error(`[SeatSelection] ⚠️  Found ${invalidSeatsCount} seats without offer item IDs - these will be excluded!`);
      await logger.error(`Found ${invalidSeatsCount} invalid seats without offer item IDs`, {
        totalSelections: currentSelections.length,
        freeSeats: freeSeatsCount,
        paidSeats: paidSeatsCount,
        validSeats: validSelections.length,
        invalidSeats: currentSelections.filter(s => !s.offerItemRefId).map(s => ({
          seatId: s.seatId,
          passengerId: s.passengerId,
          segmentId: s.segmentId,
          price: s.price
        }))
      });
    }

    // Convert valid seat selections to SelectedServiceItem format for OfferPrice
    const seatServices: typeof flightStore.selectedServices = validSelections.map(sel => {
      // CRITICAL FIX: Strip "Mkt-" prefix from segment IDs for OfferPrice
      // Jetstar expects just "seg123" format, not "Mkt-seg123"
      const cleanSegmentId = sel.segmentId.replace(/^Mkt-/, '');

      return {
        serviceId: sel.offerItemRefId!,  // Use non-null assertion since we filtered
        serviceCode: sel.seatId,
        serviceName: `Seat ${sel.seatId}`,
        serviceType: 'seat' as const,
        quantity: 1,
        price: sel.price,
        currency: sel.currency,
        offerId: offerIdToUse,  // Use ALaCarte offer ID from SeatAvailability
        offerItemId: sel.offerItemRefId!,  // CRITICAL: Must have valid offer item ID
        paxRefIds: [sel.passengerId],
        associationType: 'segment' as const,  // Seats are segment-based
        segmentRefs: [cleanSegmentId],  // MUST NOT include "Mkt-" prefix
        direction: sel.segmentId.includes(flightStore.selection.outbound?.journey.segments[0]?.segmentId || '')
          ? 'outbound' as const
          : 'inbound' as const,
        // CRITICAL: Add seat row and column for OfferPrice <SelectedSeat> element
        seatRow: sel.row,
        seatColumn: sel.column,
      };
    });

    // CRITICAL: Create SSR services for seat characteristics (UPFX, LEGX) using offer item IDs from ServiceList
    // According to Postman examples, when seats with these characteristics are selected,
    // we MUST send the SSRs as separate services in OfferPrice using their offer item IDs from ServiceList.
    // The SSR offer IDs come from ServiceList ALaCarteOffer, NOT SeatAvailability.

    const ssrServices: typeof flightStore.selectedServices = [];

    // CRITICAL FIX: Use getState() to get fresh SSR mappings from store
    // Using flightStore.ssrMappings directly causes stale closure issues where mappings appear empty
    // even though they were set in ServiceListStep. getState() bypasses React's closure and gets current state.
    const ssrMappings = useFlightSelectionStore.getState().ssrMappings;
    console.log('[SeatSelection] SSR Mappings from ServiceList (using getState):', ssrMappings);
    console.log('[SeatSelection] SSR Mappings keys:', Object.keys(ssrMappings));

    // Get ServiceList ALaCarteOffer ID - this is the offer ID for SSRs (NOT same as seat offer ID)
    // SSRs come from ServiceList, seats come from SeatAvailability - they have different offer IDs
    // Use getState() for fresh values to avoid stale closure issues
    const freshSelectedServices = useFlightSelectionStore.getState().selectedServices;
    const serviceListOfferId = freshSelectedServices
      .find(s => s.serviceType === 'bundle' || s.serviceType === 'baggage')?.offerId;

    console.log('[SeatSelection] ServiceList ALaCarteOffer ID:', serviceListOfferId);

    // Get all unique SSRs from selected seats
    const uniqueSSRs = [...new Set(currentSelections.flatMap(s => s.requiredSSRs))];
    console.log('[SeatSelection] SSRs from selected seats:', uniqueSSRs);

    // CRITICAL VALIDATION: Check if SSR mappings are empty
    if (Object.keys(ssrMappings).length === 0 && uniqueSSRs.length > 0) {
      console.warn('[SeatSelection] ⚠️  SSR mappings are EMPTY but seats require SSRs:', uniqueSSRs);
      console.warn('[SeatSelection] This usually means ServiceList was not called or did not return SSR offers.');
      await logger.warn('SSR mappings are empty - SSRs will not be created', {
        ssrMappingsKeys: Object.keys(ssrMappings),
        requiredSSRs: uniqueSSRs,
        selectedServicesCount: flightStore.selectedServices.length,
        serviceTypes: flightStore.selectedServices.map(s => s.serviceType),
      });
    }

    // Create SSR services using offer item IDs from ServiceList mappings
    for (const ssrCode of uniqueSSRs) {
      // Skip if no mapping exists for this SSR code
      if (!ssrMappings[ssrCode]) {
        console.warn(`[SeatSelection] No ServiceList mapping found for SSR ${ssrCode} - skipping`);
        continue;
      }

      // Get all seat selections that require this SSR
      const seatsNeedingSSR = currentSelections.filter(s => s.requiredSSRs.includes(ssrCode));

      // Create SSR service for each seat selection (per passenger per segment)
      for (const seatSelection of seatsNeedingSSR) {
        const { passengerId, segmentId } = seatSelection;

        // CRITICAL FIX: Strip "Mkt-" prefix from segment ID for SSR mapping lookup
        // Seat selections use "Mkt-seg..." but SSR mappings use "seg..."
        const cleanSegmentId = segmentId.replace(/^Mkt-/, '');

        // SSR mapping now stores { offerId, offerItemId } instead of just offerItemId
        const ssrEntry = ssrMappings[ssrCode]?.[cleanSegmentId]?.[passengerId];

        if (!ssrEntry || !ssrEntry.offerItemId) {
          console.warn(`[SeatSelection] No SSR entry in mapping for ${ssrCode} segment ${cleanSegmentId} pax ${passengerId} - skipping`);
          continue;
        }

        // Use the offerId from SSR mapping (ServiceList ALaCarteOffer ID)
        const ssrOfferId = ssrEntry.offerId;
        const ssrOfferItemId = ssrEntry.offerItemId;

        // Determine direction and get journey ID for SSR association
        const isOutbound = flightStore.selection.outbound?.journey.segments.some(s =>
          cleanSegmentId.includes(s.segmentId.replace(/^Mkt-/, '')) || s.segmentId.replace(/^Mkt-/, '').includes(cleanSegmentId)
        );
        const direction = isOutbound ? 'outbound' : 'inbound';

        console.log(`[SeatSelection] Creating SSR service: ${ssrCode} for ${passengerId} direction=${direction} segmentId=${cleanSegmentId} offerId=${ssrOfferId} offerItemId=${ssrOfferItemId}`);

        ssrServices.push({
          serviceId: `ssr-${ssrCode}-${cleanSegmentId}-${passengerId}`,
          serviceCode: ssrCode,
          serviceName: ssrCode,
          serviceType: 'ssr' as const,
          quantity: 1,
          price: 0,  // SSRs typically have $0.00 price in ServiceList
          currency: 'AUD',
          offerId: ssrOfferId,  // CRITICAL: Use the SSR's own offerId from ServiceList
          offerItemId: ssrOfferItemId,
          paxRefIds: [passengerId],
          // SSRs use SEGMENT association (same as seats) - they're tied to specific segments
          associationType: 'segment' as const,
          segmentRefs: [cleanSegmentId],
          direction: direction as 'outbound' | 'inbound',
        });
      }
    }

    console.log('[SeatSelection] Seat services:', seatServices.length, 'items');
    console.log('[SeatSelection] Seat services detail:', seatServices);
    console.log('[SeatSelection] SSR services:', ssrServices.length, 'items');
    console.log('[SeatSelection] SSR services detail:', ssrServices);

    // Calculate total services being added
    const totalServices = seatServices.length + ssrServices.length;
    const totalCost = [...seatServices, ...ssrServices].reduce((sum, s) => sum + (s.price * s.quantity), 0);
    console.log('[SeatSelection] Total services to append:', totalServices);
    console.log('[SeatSelection] Total cost:', totalCost, 'AUD');

    // CRITICAL FIX: Remove old seat/SSR services before adding new ones
    // This prevents duplicate services when user re-selects seats (e.g., via auto-select)
    const existingNonSeatServices = flightStore.selectedServices.filter(s =>
      s.serviceType !== 'seat' && s.serviceType !== 'ssr'
    );

    const removedSeats = flightStore.selectedServices.filter(s => s.serviceType === 'seat').length;
    const removedSSRs = flightStore.selectedServices.filter(s => s.serviceType === 'ssr').length;

    console.log('[SeatSelection] ===== REPLACING SEAT/SSR SERVICES =====');
    console.log('[SeatSelection] Removing old seat services:', removedSeats);
    console.log('[SeatSelection] Removing old SSR services:', removedSSRs);
    console.log('[SeatSelection] Keeping other services:', existingNonSeatServices.length);
    console.log('[SeatSelection] Adding new seat services:', seatServices.length);
    console.log('[SeatSelection] Adding new SSR services:', ssrServices.length);
    console.log('[SeatSelection] Current store services BEFORE:', flightStore.selectedServices.length);

    await logger.logGroup('===== REPLACING SEAT/SSR SERVICES =====', [
      { label: 'Removed old seats', value: removedSeats },
      { label: 'Removed old SSRs', value: removedSSRs },
      { label: 'Keeping other services', value: existingNonSeatServices.length },
      { label: 'New seat services', value: seatServices.length },
      { label: 'New SSR services', value: ssrServices.length },
      { label: 'Store services BEFORE', value: flightStore.selectedServices.length },
      { label: 'Seat services detail', value: seatServices },
      { label: 'SSR services detail', value: ssrServices }
    ]);

    // Replace store services: keep non-seat/SSR services + add new seat/SSR services
    const newTotal = [...seatServices, ...ssrServices].reduce((sum, s) => sum + (s.price * s.quantity), 0);
    const otherServicesTotal = existingNonSeatServices.reduce((sum, s) => sum + (s.price * s.quantity), 0);
    flightStore.setSelectedServices(
      [...existingNonSeatServices, ...seatServices, ...ssrServices],
      otherServicesTotal + newTotal
    );

    console.log('[SeatSelection] ✅ Services appended successfully');
    console.log('[SeatSelection] Store now has', flightStore.selectedServices.length, 'total services');
    console.log('[SeatSelection] Store services breakdown:', {
      bundles: flightStore.selectedServices.filter(s => s.serviceType === 'bundle').length,
      seats: flightStore.selectedServices.filter(s => s.serviceType === 'seat').length,
      ssrs: flightStore.selectedServices.filter(s => s.serviceType === 'ssr').length,
      other: flightStore.selectedServices.filter(s => !['bundle', 'seat', 'ssr'].includes(s.serviceType)).length,
    });

    const servicesBreakdown = {
      bundles: flightStore.selectedServices.filter(s => s.serviceType === 'bundle').length,
      seats: flightStore.selectedServices.filter(s => s.serviceType === 'seat').length,
      ssrs: flightStore.selectedServices.filter(s => s.serviceType === 'ssr').length,
      other: flightStore.selectedServices.filter(s => !['bundle', 'seat', 'ssr'].includes(s.serviceType)).length,
      totalServices: flightStore.selectedServices.length,
      allServices: flightStore.selectedServices
    };

    await logger.log('✅ Services appended successfully', servicesBreakdown);
    console.log('[SeatSelection] ===== END APPENDING =====');
    console.log('[SeatSelection] ===== END SAVING =====');
  };

  // Save selections and navigate to next step
  const handleContinue = async () => {
    console.log('[SeatSelection] ===== handleContinue CALLED =====');
    console.log('[SeatSelection] Current selections state:', selections);
    console.log('[SeatSelection] Selections count:', selections.length);

    try {
      await saveSeatsToStore();
      console.log('[SeatSelection] saveSeatsToStore completed successfully');
    } catch (error) {
      console.error('[SeatSelection] ❌ ERROR in saveSeatsToStore:', error);
      // Don't block navigation on error - let user continue
    }

    if (onComplete) {
      console.log('[SeatSelection] Calling onComplete callback');
      onComplete();
    } else {
      console.warn('[SeatSelection] ⚠️ No onComplete callback provided - navigation may not work!');
    }
  };

  // Skip seat selection
  const handleSkip = () => {
    if (onComplete) {
      onComplete();
    }
  };

  if (isLoading) {
    return (
      <Card className="p-8 text-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary-500 mx-auto mb-4" />
        <p className="text-neutral-600">Loading seat maps...</p>
      </Card>
    );
  }

  if (error) {
    return (
      <Alert variant="error" title="Error Loading Seats">
        {error}
        <div className="flex gap-3 mt-4">
          <Button variant="outline" onClick={onBack}>Go Back</Button>
          <Button variant="primary" onClick={handleSkip}>Skip Seat Selection</Button>
        </div>
      </Alert>
    );
  }

  if (!currentSegment || !currentPassenger) {
    return (
      <Card className="p-8 text-center">
        <AlertCircle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-neutral-700 mb-2">No Seat Data Available</h3>
        <p className="text-neutral-500 mb-4">Unable to load seat maps for your flights.</p>
        <Button onClick={handleSkip}>Continue Without Seats</Button>
      </Card>
    );
  }

  // Get the user's selected cabin type from flight selection
  // Economy = '5', Business = '2', First = '3' (matching AirShopping CabinTypeCode)
  const getSelectedCabinType = (): string => {
    // Check which segment we're on (outbound vs inbound)
    const outboundSegmentCount = flightStore.selection.outbound?.journey.segments.length || 0;
    if (currentSegmentIndex < outboundSegmentCount) {
      return flightStore.selection.outbound?.cabinType || '5'; // Default to economy
    } else {
      return flightStore.selection.inbound?.cabinType || '5'; // Default to economy
    }
  };

  const selectedCabinType = getSelectedCabinType();

  // Find the cabin compartment that matches the user's selected cabin type
  // If not found, fall back to first compartment (but this shouldn't happen)
  const currentCabin = currentSegment.seatMap.cabinCompartments.find(
    (cabin: CabinCompartment) => cabin.cabinTypeCode === selectedCabinType
  ) || currentSegment.seatMap.cabinCompartments.find(
    // Also try matching by name for backwards compatibility
    (cabin: CabinCompartment) => (selectedCabinType === '5' && cabin.cabinTypeName?.toLowerCase().includes('economy')) ||
             (selectedCabinType === '2' && cabin.cabinTypeName?.toLowerCase().includes('business'))
  ) || currentSegment.seatMap.cabinCompartments[0];

  return (
    <div className="space-y-6 pb-24">
      {/* Header with Progress */}
      <div className="bg-gradient-to-r from-primary-500 to-orange-500 rounded-xl p-6 text-white">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-2xl font-bold mb-1">Select Your Seats</h2>
            <p className="text-primary-100">
              Segment {currentSegmentIndex + 1} of {segmentSeatData.length} •{' '}
              {currentSegment.origin} → {currentSegment.destination} ({currentSegment.flightNumber})
            </p>
          </div>
          <div className="bg-white/20 backdrop-blur-sm rounded-lg px-4 py-2">
            <div className="text-sm font-medium">Passenger {currentPassengerIndex + 1} of {passengers.length}</div>
            <div className="text-lg font-bold">{currentPassenger.name}</div>
          </div>
        </div>

        {/* Progress bar */}
        <div className="w-full bg-white/20 rounded-full h-2">
          <div
            className="bg-white rounded-full h-2 transition-all duration-300"
            style={{
              width: `${((currentSegmentIndex * passengers.length + currentPassengerIndex + 1) / (segmentSeatData.length * passengers.length)) * 100}%`
            }}
          />
        </div>
      </div>

      {/* Passenger Selector */}
      <Card className="p-4">
        <div className="flex items-center gap-3 overflow-x-auto">
          {passengers.map((pax, idx) => {
            const hasSelection = selections.some(s => s.passengerId === pax.id && s.segmentId === currentSegment.segmentId);
            return (
              <button
                key={pax.id}
                onClick={() => setCurrentPassengerIndex(idx)}
                className={cn(
                  'flex-shrink-0 px-4 py-2 rounded-lg border-2 transition-all',
                  idx === currentPassengerIndex
                    ? 'border-primary-500 bg-primary-50 text-primary-700'
                    : hasSelection
                    ? 'border-green-300 bg-green-50 text-green-700'
                    : 'border-neutral-200 hover:border-neutral-300'
                )}
              >
                <div className="text-xs font-medium">{pax.name}</div>
                {hasSelection && (
                  <div className="text-xs mt-1 flex items-center gap-1">
                    <Check className="w-3 h-3" />
                    {selections.find(s => s.passengerId === pax.id && s.segmentId === currentSegment.segmentId)?.seatId}
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* Auto Select Button */}
        <div className="mt-3 pt-3 border-t border-neutral-200">
          <button
            onClick={handleAutoSelect}
            className="w-full px-4 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-semibold rounded-lg transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            Auto Select Seats (Sit Together)
          </button>
          <p className="text-xs text-neutral-500 mt-2 text-center">
            Automatically selects seats for all passengers, keeping your group together in the same row when possible
          </p>
        </div>
      </Card>

      {/* Legend */}
      <Card className="p-4">
        <h4 className="text-sm font-semibold text-neutral-700 mb-3">Seat Status</h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <LegendItem color="bg-green-100 border-green-300" label="Available" />
          <LegendItem color="bg-neutral-200 border-neutral-300" label="Occupied" />
          <LegendItem color="bg-blue-100 border-blue-300" label="Selected" />
          <LegendItem color="bg-amber-100 border-amber-300" label="Premium/Paid" />
        </div>

        <h4 className="text-sm font-semibold text-neutral-700 mb-3 pt-3 border-t border-neutral-200">Seat Characteristics</h4>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
          <div className="flex items-center gap-2">
            <div className="bg-sky-500 text-white rounded-sm w-5 h-5 flex items-center justify-center text-[10px] font-bold">W</div>
            <span className="text-neutral-600">Window</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="bg-purple-500 text-white rounded-sm w-5 h-5 flex items-center justify-center text-[10px] font-bold">A</div>
            <span className="text-neutral-600">Aisle</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="bg-red-600 text-white rounded-sm w-5 h-5 flex items-center justify-center text-[10px] font-bold">E</div>
            <span className="text-neutral-600">Exit Row</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="bg-green-600 text-white rounded-sm w-5 h-5 flex items-center justify-center text-[10px] font-bold">+</div>
            <span className="text-neutral-600">Extra Legroom</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="bg-purple-600 text-white rounded-sm w-5 h-5 flex items-center justify-center text-[10px] font-bold">U</div>
            <span className="text-neutral-600">Upfront Seat</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="bg-orange-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-[10px] font-bold">$</div>
            <span className="text-neutral-600">Additional Fee</span>
          </div>
        </div>

        <div className="mt-3 pt-3 border-t border-neutral-200 flex flex-wrap gap-2 text-xs text-neutral-600">
          <span className="flex items-center gap-1">
            <AlertCircle className="w-3 h-3 text-red-500" />
            Exit rows not available for children/infants
          </span>
          <span className="flex items-center gap-1">
            <Info className="w-3 h-3 text-blue-500" />
            Special seats may require additional SSRs
          </span>
        </div>
      </Card>

      {/* Seat Selection Summary Panel - Shows all segments */}
      <Card className="p-4 bg-gradient-to-br from-blue-50 to-indigo-50 border-2 border-blue-200">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-base font-bold text-blue-900 flex items-center gap-2">
            <Check className="w-5 h-5" />
            Selected Seats ({selections.length} of {passengers.length * segmentSeatData.length})
          </h4>
          {selections.some(s => s.price > 0) && (
            <div className="text-xs font-medium text-blue-600 bg-blue-100 px-2 py-1 rounded">
              Est. +{formatCurrency(selections.reduce((sum, s) => sum + s.price, 0), 'AUD')}
            </div>
          )}
        </div>

        <div className="space-y-2">
          {segmentSeatData.map((segment) => {
            const segmentSelections = selections.filter(s => s.segmentId === segment.segmentId);
            const totalPassengers = passengers.length;
            const hasAllSeats = segmentSelections.length === totalPassengers;

            console.log(`[SidePanel] Segment ${segment.origin}-${segment.destination}: ${segmentSelections.length}/${totalPassengers} seats selected`);

            return (
              <div key={segment.segmentId} className="bg-white rounded-lg p-3 border border-blue-200">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-xs font-semibold text-neutral-600 flex items-center gap-2">
                    <Plane className="w-3 h-3" />
                    {segment.origin} → {segment.destination} ({segment.flightNumber})
                  </div>
                  {hasAllSeats ? (
                    <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded font-medium">
                      ✓ Complete
                    </span>
                  ) : (
                    <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded font-medium">
                      {segmentSelections.length}/{totalPassengers}
                    </span>
                  )}
                </div>

                {segmentSelections.length > 0 ? (
                  <div className="space-y-1.5">
                    {segmentSelections.map((sel) => {
                      console.log(`[SidePanel] Displaying seat: ${sel.passengerName} → Seat ${sel.seatId} (${sel.price > 0 ? formatCurrency(sel.price, sel.currency) : 'Free'})`);
                      return (
                        <div
                          key={`${sel.passengerId}-${sel.segmentId}`}
                          className="flex items-center justify-between bg-blue-50 rounded px-3 py-2 border border-blue-100"
                        >
                          <div className="flex items-center gap-3 flex-1">
                            <div className="font-semibold text-sm text-blue-900">{sel.passengerName}</div>
                            <div className="flex items-center gap-1">
                              <div className="font-bold text-blue-700 text-sm">Seat {sel.seatId}</div>
                              {sel.price > 0 && (
                                <span className="text-xs text-amber-600 font-medium">
                                  (+{formatCurrency(sel.price, sel.currency)})
                                </span>
                              )}
                            </div>

                            {sel.requiredSSRs.length > 0 && (
                              <div className="flex items-center gap-1 text-xs bg-amber-100 border border-amber-300 text-amber-800 px-2 py-0.5 rounded">
                                <Info className="w-3 h-3" />
                                <span>SSR: {sel.requiredSSRs.join(', ')}</span>
                              </div>
                            )}
                          </div>

                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleChangeSeat(sel.passengerId, sel.segmentId)}
                              className="p-1.5 hover:bg-blue-100 rounded text-blue-600 transition-colors"
                              title="Change seat"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                              </svg>
                            </button>
                            <button
                              onClick={() => handleRemoveSeat(sel.passengerId, sel.segmentId)}
                              className="p-1.5 hover:bg-red-100 rounded text-red-600 transition-colors"
                              title="Remove seat"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-xs text-neutral-500 italic py-2">
                    No seats selected for this segment
                  </div>
                )}
                </div>
              );
            })}
          </div>

          {/* SSR Summary */}
          {selections.some(s => s.requiredSSRs.length > 0) && (
            <div className="mt-3 pt-3 border-t border-blue-200">
              <div className="flex items-start gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded p-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold mb-1">Required SSRs will be automatically added:</div>
                  <div className="space-y-0.5">
                    {[...new Set(selections.flatMap(s => s.requiredSSRs))].map(ssr => (
                      <div key={ssr} className="font-medium">
                        • {ssr}: {ssr === 'LEGX' ? 'Extra Legroom' : ssr === 'UPFX' ? 'Upfront Seat' : ssr}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </Card>

      {/* Seat Map */}
      {currentCabin && (
        <SeatMapDisplay
          cabin={currentCabin}
          onSeatSelect={handleSeatSelect}
          segmentId={currentSegment.segmentId}
          currentPassenger={currentPassenger}
          selections={selections}
          isSeatRestricted={isSeatRestricted}
          isSeatSelected={isSeatSelected}
          getSeatOccupant={getSeatOccupant}
        />
      )}

      {/* Segment Navigation - Only show if multiple segments */}
      {segmentSeatData.length > 1 && (
        <div className="flex items-center justify-between gap-4">
          <Button
            variant="outline"
            onClick={handlePreviousSegment}
            disabled={currentSegmentIndex === 0}
            leftIcon={<ChevronLeft className="w-4 h-4" />}
          >
            Previous Segment
          </Button>
          <Button
            variant="outline"
            onClick={handleNextSegment}
            disabled={currentSegmentIndex >= segmentSeatData.length - 1}
            rightIcon={<ChevronRight className="w-4 h-4" />}
          >
            Next Segment
          </Button>
        </div>
      )}

      {/* Main Navigation - Fixed bottom bar like other steps */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 shadow-lg z-40">
        <div className="max-w-5xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <Button variant="outline" onClick={handleSkip}>
              Skip Seats
            </Button>
            <Button
              variant="primary"
              onClick={handleContinue}
            >
              Price Verification
            </Button>
          </div>
        </div>
      </div>

      {/* Auto-Select Result Modal */}
      {showAutoSelectModal && autoSelectResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full mx-4 overflow-hidden animate-in fade-in zoom-in duration-200 max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className={cn(
              "px-6 py-5 border-b",
              autoSelectResult.count > 0 ? "bg-gradient-to-r from-green-50 to-emerald-50 border-green-200" :
              autoSelectResult.count === 0 ? "bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200" :
              "bg-gradient-to-r from-amber-50 to-orange-50 border-amber-200"
            )}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {autoSelectResult.count > 0 ? (
                    <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
                      <Check className="w-6 h-6 text-green-600" />
                    </div>
                  ) : autoSelectResult.count === 0 ? (
                    <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center">
                      <Info className="w-6 h-6 text-blue-600" />
                    </div>
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center">
                      <AlertCircle className="w-6 h-6 text-amber-600" />
                    </div>
                  )}
                  <div>
                    <h3 className="text-lg font-bold text-slate-900">
                      {autoSelectResult.count > 0 ? 'Seats Auto-Selected!' :
                       autoSelectResult.count === 0 ? 'All Set!' :
                       'Unable to Auto-Select'}
                    </h3>
                    <p className="text-sm text-slate-600">
                      {autoSelectResult.count > 0 ? `${autoSelectResult.count} seat${autoSelectResult.count > 1 ? 's' : ''} selected` :
                       autoSelectResult.count === 0 ? 'This segment is complete' :
                       'Please review the issue'}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Body */}
            <div className="px-6 py-5">
              {autoSelectResult.count > 0 ? (
                <>
                  {/* Success - Show detailed breakdown */}
                  <div className="space-y-5">
                    {/* Summary Stats Row */}
                    <div className="grid grid-cols-4 gap-3">
                      <div className="bg-gradient-to-br from-green-50 to-emerald-50 border border-green-200 rounded-xl p-3 text-center">
                        <div className="text-2xl font-bold text-green-700">{autoSelectResult.count}</div>
                        <div className="text-xs text-green-600 font-medium">Total Seats</div>
                      </div>
                      {autoSelectResult.extraLegroom > 0 && (
                        <div className="bg-gradient-to-br from-purple-50 to-purple-100 border border-purple-200 rounded-xl p-3 text-center">
                          <div className="text-2xl font-bold text-purple-700">{autoSelectResult.extraLegroom}</div>
                          <div className="text-xs text-purple-600 font-medium">Extra Legroom</div>
                        </div>
                      )}
                      {autoSelectResult.upfront > 0 && (
                        <div className="bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200 rounded-xl p-3 text-center">
                          <div className="text-2xl font-bold text-blue-700">{autoSelectResult.upfront}</div>
                          <div className="text-xs text-blue-600 font-medium">Upfront</div>
                        </div>
                      )}
                      {autoSelectResult.standard > 0 && (
                        <div className="bg-gradient-to-br from-slate-50 to-slate-100 border border-slate-200 rounded-xl p-3 text-center">
                          <div className="text-2xl font-bold text-slate-700">{autoSelectResult.standard}</div>
                          <div className="text-xs text-slate-600 font-medium">Standard</div>
                        </div>
                      )}
                    </div>

                    {/* By Passenger Breakdown */}
                    {autoSelectResult.byPassenger && autoSelectResult.byPassenger.length > 0 && (
                      <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-4 border-2 border-blue-200">
                        <h4 className="text-sm font-bold text-blue-900 mb-3 flex items-center gap-2">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                          </svg>
                          Seats by Passenger
                        </h4>
                        <div className="space-y-3">
                          {autoSelectResult.byPassenger.map((pax, idx) => (
                            <div key={pax.passengerId} className="bg-white rounded-lg p-3 border border-blue-200 shadow-sm">
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                  <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-sm">
                                    {pax.passengerType}
                                  </div>
                                  <span className="font-bold text-slate-900">{pax.passengerName}</span>
                                </div>
                                {pax.totalCost > 0 && (
                                  <span className="text-sm font-bold text-amber-600">
                                    {formatCurrency(pax.totalCost, 'AUD')}
                                  </span>
                                )}
                              </div>
                              <div className="grid grid-cols-2 gap-2">
                                {pax.segments.map((seg, segIdx) => (
                                  <div key={seg.segmentId} className="bg-slate-50 rounded px-2 py-1.5 border border-slate-200">
                                    <div className="text-xs text-slate-600 font-medium">{seg.route}</div>
                                    <div className="flex items-center justify-between mt-1">
                                      <span className="text-sm font-bold text-blue-700">{seg.seatId}</span>
                                      <span className={cn(
                                        "text-[10px] px-1.5 py-0.5 rounded font-medium",
                                        seg.seatType === 'Extra Legroom' ? "bg-purple-100 text-purple-700" :
                                        seg.seatType === 'Upfront' ? "bg-blue-100 text-blue-700" :
                                        "bg-slate-200 text-slate-700"
                                      )}>
                                        {seg.seatType === 'Extra Legroom' ? 'LEG+' : seg.seatType === 'Upfront' ? 'UPFR' : 'STD'}
                                      </span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* By Segment Breakdown */}
                    {autoSelectResult.bySegment && autoSelectResult.bySegment.length > 0 && (
                      <div className="bg-gradient-to-br from-emerald-50 to-green-50 rounded-xl p-4 border-2 border-emerald-200">
                        <h4 className="text-sm font-bold text-emerald-900 mb-3 flex items-center gap-2">
                          <Plane className="w-4 h-4" />
                          Seats by Segment
                        </h4>
                        <div className="space-y-3">
                          {autoSelectResult.bySegment.map((segment, idx) => (
                            <div key={segment.segmentId} className="bg-white rounded-lg p-3 border border-emerald-200 shadow-sm">
                              <div className="flex items-center justify-between mb-2">
                                <div className="font-bold text-slate-900 flex items-center gap-2">
                                  <span className="text-emerald-600">{segment.route}</span>
                                  <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded font-medium">
                                    {segment.seats.length} seat{segment.seats.length > 1 ? 's' : ''}
                                  </span>
                                </div>
                                {segment.totalCost > 0 && (
                                  <span className="text-sm font-bold text-amber-600">
                                    {formatCurrency(segment.totalCost, 'AUD')}
                                  </span>
                                )}
                              </div>
                              <div className="grid grid-cols-3 gap-2">
                                {segment.seats.map((seat, seatIdx) => (
                                  <div key={seat.passengerId} className="bg-emerald-50 rounded px-2 py-1.5 border border-emerald-100">
                                    <div className="text-xs text-emerald-700 font-medium truncate">{seat.passengerName}</div>
                                    <div className="flex items-center justify-between mt-1">
                                      <span className="text-sm font-bold text-emerald-800">{seat.seatId}</span>
                                      {seat.price > 0 && (
                                        <span className="text-[10px] text-amber-600 font-bold">
                                          ${seat.price}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Total Price - Grand Summary */}
                    {autoSelectResult.totalPrice > 0 && (
                      <div className="bg-gradient-to-r from-amber-100 via-orange-100 to-amber-100 rounded-xl p-5 border-2 border-amber-300 shadow-lg">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="text-xs text-amber-700 font-semibold uppercase tracking-wide">Grand Total</div>
                            <div className="text-sm text-amber-600 mt-0.5">All passengers, all segments</div>
                          </div>
                          <div className="text-3xl font-bold text-amber-700">
                            {formatCurrency(autoSelectResult.totalPrice, 'AUD')}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              ) : autoSelectResult.count === 0 ? (
                <div className="text-center py-2">
                  <p className="text-slate-600">
                    All passengers already have seats selected for this segment.
                  </p>
                </div>
              ) : autoSelectResult.count === -1 ? (
                <div className="text-center py-2">
                  <p className="text-slate-600">
                    No available seats found for auto-selection.
                  </p>
                </div>
              ) : autoSelectResult.count === -2 ? (
                <div className="text-center py-2">
                  <p className="text-slate-600">
                    Not enough available seats. Need <span className="font-semibold">{autoSelectResult.upfront}</span> seats but only <span className="font-semibold">{autoSelectResult.extraLegroom}</span> available.
                  </p>
                </div>
              ) : autoSelectResult.count === -3 ? (
                <div className="text-center py-2">
                  <p className="text-slate-600">
                    Not enough suitable seats after applying safety restrictions. Need <span className="font-semibold">{autoSelectResult.upfront}</span> but only <span className="font-semibold">{autoSelectResult.extraLegroom}</span> available.
                  </p>
                </div>
              ) : null}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200">
              <Button
                variant="primary"
                onClick={async () => {
                  setShowAutoSelectModal(false);
                  // Save seats to store but don't navigate yet
                  console.log('[SeatSelection] Auto-select modal closed - saving seats to store');
                  try {
                    await saveSeatsToStore();
                    console.log('[SeatSelection] Auto-select: saveSeatsToStore completed');
                  } catch (error) {
                    console.error('[SeatSelection] Auto-select: saveSeatsToStore error:', error);
                  }
                }}
                className="w-full"
              >
                OK, Got It
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Seat Map Display Component
interface SeatMapDisplayProps {
  cabin: CabinCompartment;
  onSeatSelect: (seat: Seat, row: string, segmentId: string, price: number) => void;
  segmentId: string;
  currentPassenger: { id: string; type: 'ADT' | 'CHD' | 'INF'; name: string };
  selections: SeatSelection[];
  isSeatRestricted: (chars: string[], paxType: string) => boolean;
  isSeatSelected: (seatId: string, segmentId: string) => boolean;
  getSeatOccupant: (seatId: string, segmentId: string) => string | null;
}

function SeatMapDisplay({
  cabin,
  onSeatSelect,
  segmentId,
  currentPassenger,
  selections,
  isSeatRestricted,
  isSeatSelected,
  getSeatOccupant,
}: SeatMapDisplayProps) {
  return (
    <Card className="p-6">
      <div className="flex items-center gap-2 mb-6">
        <Plane className="w-5 h-5 text-primary-500 rotate-90" />
        <div className="text-sm font-medium text-neutral-700">
          Aircraft Cabin • Rows {cabin.firstRow}-{cabin.lastRow}
        </div>
      </div>

      {/* Seat Grid */}
      <div className="space-y-2 max-h-[600px] overflow-y-auto">
        {cabin.seatRows.map((row) => (
          <SeatRow
            key={row.rowNumber}
            row={row}
            columnLayout={cabin.columnLayout}
            onSeatSelect={(seat, price) => onSeatSelect(seat, row.rowNumber, segmentId, price)}
            currentPassenger={currentPassenger}
            segmentId={segmentId}
            selections={selections}
            isSeatRestricted={isSeatRestricted}
            isSeatSelected={isSeatSelected}
            getSeatOccupant={getSeatOccupant}
          />
        ))}
      </div>
    </Card>
  );
}

// Seat Row Component
interface SeatRowProps {
  row: { rowNumber: string; seats: Seat[] };
  columnLayout: string;
  onSeatSelect: (seat: Seat, price: number) => void;
  currentPassenger: { id: string; type: 'ADT' | 'CHD' | 'INF'; name: string };
  segmentId: string;
  selections: SeatSelection[];
  isSeatRestricted: (chars: string[], paxType: string) => boolean;
  isSeatSelected: (seatId: string, segmentId: string) => boolean;
  getSeatOccupant: (seatId: string, segmentId: string) => string | null;
}

function SeatRow({
  row,
  columnLayout,
  onSeatSelect,
  currentPassenger,
  segmentId,
  isSeatRestricted,
  isSeatSelected,
  getSeatOccupant,
}: SeatRowProps) {
  const columns = columnLayout.split(' ');

  return (
    <div className="flex items-center gap-8">
      {/* Row number */}
      <div className="w-8 text-center text-sm font-bold text-neutral-700">{row.rowNumber}</div>

      {/* Seat columns with aisle gaps */}
      {columns.map((colGroup, groupIdx) => (
        <div key={groupIdx} className="flex gap-1.5">
          {colGroup.split('').map((col, colIdx) => {
            const seat = row.seats.find(s => s.columnId === col);
            if (!seat) {
              return <div key={col} className="w-12 h-12" />; // Empty space
            }

            const seatId = `${row.rowNumber}${seat.columnId}`;
            // Block occupied (O) and blocked (Z) seats
            const isOccupied = seat.occupationStatus === 'O' || seat.occupationStatus === 'Z';
            const isSelected = isSeatSelected(seatId, segmentId);
            const isRestricted = isSeatRestricted(seat.characteristics || [], currentPassenger.type);
            const occupant = getSeatOccupant(seatId, segmentId);
            const hasPremium = seat.characteristics?.some(c => ['L', 'F', 'EK', 'CH'].includes(c));
            const requiredSSRs = seat.characteristics?.flatMap(c => SSR_REQUIREMENTS[c] ? [SSR_REQUIREMENTS[c]] : []) || [];

            // CRITICAL: Treat seats without offerItemIdsByPaxType as unavailable (not sellable for this fare)
            // Also check if the seat has an offerItemId for the current passenger type
            const hasNoPrice = !seat.offerItemIdsByPaxType || !seat.offerItemIdsByPaxType[currentPassenger.type];

            // Determine if this seat is at the edge of the row for tooltip positioning
            const isFirstGroup = groupIdx === 0;
            const isLastGroup = groupIdx === columns.length - 1;
            const isFirstInGroup = colIdx === 0;
            const isLastInGroup = colIdx === colGroup.length - 1;

            return (
              <SeatButton
                key={col}
                seat={seat}
                seatId={seatId}
                isOccupied={isOccupied}
                isSelected={isSelected}
                isRestricted={isRestricted}
                hasNoPrice={hasNoPrice}
                hasPremium={hasPremium}
                occupant={occupant}
                requiredSSRs={requiredSSRs}
                isLeftEdge={isFirstGroup && isFirstInGroup}
                isRightEdge={isLastGroup && isLastInGroup}
                onClick={() => {
                  console.log(`[SeatButton] Click on ${seatId}:`, { isOccupied, isRestricted, hasNoPrice, seat });
                  if (isOccupied) {
                    console.log(`[SeatButton] ${seatId} blocked: occupied`);
                    return;
                  }
                  if (isRestricted) {
                    console.log(`[SeatButton] ${seatId} blocked: restricted`);
                    return;
                  }
                  if (hasNoPrice) {
                    console.log(`[SeatButton] ${seatId} blocked: hasNoPrice - offerItemIdsByPaxType:`, seat.offerItemIdsByPaxType);
                    return;
                  }
                  console.log(`[SeatButton] ${seatId} - calling onSeatSelect with price:`, seat.price?.value || 0);
                  onSeatSelect(seat, seat.price?.value || 0);
                }}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}

// Seat Button Component
interface SeatButtonProps {
  seat: Seat;
  seatId: string;
  isOccupied: boolean;
  isSelected: boolean;
  isRestricted: boolean;
  hasNoPrice: boolean;
  hasPremium: boolean;
  occupant: string | null;
  requiredSSRs: string[];
  isLeftEdge?: boolean;
  isRightEdge?: boolean;
  onClick: () => void;
}

function SeatButton({
  seat,
  seatId,
  isOccupied,
  isSelected,
  isRestricted,
  hasNoPrice,
  hasPremium,
  occupant,
  requiredSSRs,
  isLeftEdge = false,
  isRightEdge = false,
  onClick,
}: SeatButtonProps) {
  // Show ALL characteristics - both raw codes and friendly names
  const charNames = seat.characteristics?.map(c => {
    const friendlyName = SEAT_CHAR_NAMES[c];
    return friendlyName ? `${friendlyName} (${c})` : c; // Show both name and code
  }).filter(Boolean) || [];
  const chars = seat.characteristics || [];

  // Check for specific characteristics
  const hasWindow = chars.includes('WINDOW');
  const hasAisle = chars.includes('AISLE');
  const hasExitRow = chars.includes('EXIT_ROW');
  const hasExtraLegroom = chars.includes('EXTRA_LEGROOM');
  const isOverWing = charNames.some(name => name.toLowerCase().includes('wing'));

  // Smart tooltip positioning based on seat position to prevent edge overflow
  // Use edge detection from parent to determine if this seat is at the far left or right
  const tooltipPosition = isLeftEdge
    ? 'left-0'
    : isRightEdge
    ? 'right-0'
    : 'left-1/2 -translate-x-1/2';

  // Arrow positioning to align with seat button
  const arrowPosition = isLeftEdge
    ? 'left-6'
    : isRightEdge
    ? 'right-6'
    : 'left-1/2 -translate-x-1/2';

  return (
    <div className="relative group">
      <button
        onClick={onClick}
        disabled={isOccupied || isRestricted || hasNoPrice}
        className={cn(
          'w-12 h-12 rounded-lg border-2 text-xs font-bold transition-all relative flex items-center justify-center',
          isSelected
            ? 'bg-blue-500 border-blue-600 text-white shadow-lg ring-2 ring-blue-300 scale-105'
            : isOccupied
            ? 'bg-neutral-300 border-neutral-400 text-neutral-500 cursor-not-allowed'
            : isRestricted
            ? 'bg-red-50 border-red-300 text-red-400 cursor-not-allowed'
            : hasNoPrice
            ? 'bg-neutral-200 border-neutral-300 text-neutral-400 cursor-not-allowed opacity-60'
            : hasPremium
            ? 'bg-amber-100 border-amber-500 text-amber-900 hover:bg-amber-200 hover:border-amber-600 hover:shadow-md'
            : 'bg-green-100 border-green-500 text-green-900 hover:bg-green-200 hover:border-green-600 hover:shadow-md'
        )}
      >
        {seatId}

        {/* Price indicator - orange dot */}
        {seat.price && seat.price.value > 0 && !isOccupied && !isRestricted && !hasNoPrice && (
          <div className="absolute -top-1 -right-1 bg-orange-500 rounded-full w-3 h-3 border-2 border-white shadow-sm" />
        )}

        {/* Exit row indicator - red badge */}
        {hasExitRow && !isOccupied && !isRestricted && !hasNoPrice && (
          <div className="absolute -bottom-1 -left-1 bg-red-600 text-white rounded w-3.5 h-3.5 text-[8px] flex items-center justify-center font-bold border-2 border-white shadow-sm">
            E
          </div>
        )}

        {/* Extra Legroom indicator - green badge with plus icon */}
        {hasExtraLegroom && !isOccupied && !isRestricted && !hasNoPrice && (
          <div className="absolute -bottom-1 -right-1 bg-green-600 text-white rounded w-3.5 h-3.5 text-[8px] flex items-center justify-center font-bold border-2 border-white shadow-sm">
            +
          </div>
        )}

        {/* Upfront seat indicator - purple badge */}
        {chars.includes('F') && !isOccupied && !isRestricted && !hasNoPrice && (
          <div className="absolute -top-1 -left-1 bg-purple-600 text-white rounded w-3.5 h-3.5 text-[8px] flex items-center justify-center font-bold border-2 border-white shadow-sm">
            U
          </div>
        )}
      </button>

      {/* Enhanced Tooltip with Animation - Smart positioning to prevent overflow */}
      {!isOccupied && !isRestricted && !hasNoPrice && (
        <div className={cn(
          "absolute bottom-full mb-3 hidden group-hover:block z-50 pointer-events-none animate-in fade-in slide-in-from-bottom-2 duration-200",
          tooltipPosition
        )}>
          {/* Arrow pointing down - aligned with seat button */}
          <div className={cn(
            "absolute -bottom-2 w-4 h-4 bg-white border-r-2 border-b-2 border-neutral-200 rotate-45",
            arrowPosition
          )}></div>

          <div className="relative bg-gradient-to-br from-white to-neutral-50 border-2 border-neutral-200 rounded-xl px-5 py-4 shadow-2xl min-w-[240px]">
            {/* Header with Seat Number */}
            <div className="flex items-center justify-center gap-2 mb-3 pb-3 border-b-2 border-neutral-200">
              <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9" />
              </svg>
              <span className="font-bold text-lg text-neutral-900">Seat {seatId}</span>
            </div>

            {/* Price - Most Prominent */}
            {seat.price && (
              <div className={cn(
                "text-center py-3 px-4 rounded-xl mb-3 font-bold text-xl shadow-md transition-all",
                seat.price.value > 0
                  ? "bg-gradient-to-br from-orange-100 to-orange-200 text-orange-800 border-2 border-orange-400"
                  : "bg-gradient-to-br from-green-100 to-green-200 text-green-800 border-2 border-green-400"
              )}>
                {seat.price.value > 0 ? formatCurrency(seat.price.value, seat.price.currency) : '✓ FREE'}
              </div>
            )}

            {/* Features with Icons */}
            {charNames.length > 0 && (
              <div className="bg-blue-50 rounded-lg p-3 mb-2 border border-blue-200">
                <div className="font-semibold mb-2 text-blue-900 text-sm flex items-center gap-1">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Features
                </div>
                <div className="space-y-1.5">
                  {charNames.map((name, idx) => (
                    <div key={idx} className="flex items-center gap-2 text-blue-800 text-xs">
                      <div className="w-2 h-2 bg-blue-500 rounded-full shadow-sm"></div>
                      <span className="font-medium">{name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Required SSRs */}
            {requiredSSRs.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-2 text-amber-800 text-xs mt-2">
                <span className="font-semibold">⚠ Requires:</span> {requiredSSRs.join(', ')}
              </div>
            )}

            {/* Occupant */}
            {occupant && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-2 text-green-800 mt-2 text-xs font-medium flex items-center gap-1">
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                Selected by: {occupant}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Legend Item
function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className={cn('w-6 h-6 rounded border-2', color)} />
      <span className="text-xs text-neutral-600">{label}</span>
    </div>
  );
}
