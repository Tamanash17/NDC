// ============================================================================
// LONG SELL REQUEST BUILDER FROM ORDER DATA
// Constructs Long Sell (CC surcharge) request from OrderRetrieve response
//
// This utility extracts segments, journeys, passengers, bundles, SSRs, and seats
// from an existing order to build an accurate Long Sell request for CC fee calculation.
//
// Works for both:
// - Prime Booking: After OrderCreate, before payment
// - Servicing: For existing orders when adding payment
// ============================================================================

import type { Order, Passenger, PaxJourney, FlightSegment, DistributionChain } from "../types/ndc.types.js";
import type {
  OrderExtended,
  ServiceItemParsed,
  DatedMarketingSegmentParsed,
  SeatAssignmentParsed,
} from "../parsers/order.parser.js";
import type {
  LongSellRequest,
  LongSellSegment,
  LongSellJourney,
  LongSellPassenger,
  LongSellBundle,
  LongSellSSR,
  LongSellSeat,
} from "../builders/long-sell.builder.js";

export interface BuildLongSellFromOrderInput {
  order: OrderExtended;
  cardBrand: string;
  currency?: string;
  distributionChain?: DistributionChain;
}

export interface BuildLongSellFromOrderResult {
  success: boolean;
  request?: LongSellRequest;
  error?: string;
  debug?: {
    segmentsCount: number;
    journeysCount: number;
    passengersCount: number;
    bundlesCount: number;
    ssrsCount: number;
    seatsCount: number;
  };
}

/**
 * Build Long Sell request from OrderRetrieve response data
 *
 * This extracts all booking items from the order and constructs
 * a Long Sell request that can be used for CC fee calculation.
 */
export function buildLongSellFromOrder(input: BuildLongSellFromOrderInput): BuildLongSellFromOrderResult {
  const { order, cardBrand, distributionChain } = input;
  const currency = input.currency || order.totalPrice?.currency || 'AUD';

  try {
    // 1. Build segments from marketingSegments or segments
    const segments: LongSellSegment[] = buildSegments(order);
    if (segments.length === 0) {
      return { success: false, error: "No segments found in order" };
    }

    // 2. Build journeys from order journeys
    const journeys: LongSellJourney[] = buildJourneys(order, segments);
    if (journeys.length === 0) {
      return { success: false, error: "No journeys found in order" };
    }

    // 3. Build passengers
    const passengers: LongSellPassenger[] = buildPassengers(order);
    if (passengers.length === 0) {
      return { success: false, error: "No passengers found in order" };
    }

    // 4. Build bundles from service items
    const bundles: LongSellBundle[] = buildBundles(order, journeys, passengers);

    // 5. Build SSRs from service items
    const ssrs: LongSellSSR[] = buildSSRs(order, segments, passengers);

    // 6. Build seats from seat assignments
    const seats: LongSellSeat[] = buildSeats(order, segments);

    const request: LongSellRequest = {
      segments,
      journeys,
      passengers,
      cardBrand,
      currency,
      distributionChain,
      bundles: bundles.length > 0 ? bundles : undefined,
      ssrs: ssrs.length > 0 ? ssrs : undefined,
      seats: seats.length > 0 ? seats : undefined,
    };

    return {
      success: true,
      request,
      debug: {
        segmentsCount: segments.length,
        journeysCount: journeys.length,
        passengersCount: passengers.length,
        bundlesCount: bundles.length,
        ssrsCount: ssrs.length,
        seatsCount: seats.length,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: `Failed to build Long Sell request: ${error.message}`,
    };
  }
}

/**
 * Build segments from order data
 */
function buildSegments(order: OrderExtended): LongSellSegment[] {
  const segments: LongSellSegment[] = [];

  // Prefer marketingSegments (parsed from DatedMarketingSegmentList)
  if (order.marketingSegments && order.marketingSegments.length > 0) {
    order.marketingSegments.forEach((seg, idx) => {
      segments.push({
        segmentId: seg.segmentId || `seg-${idx}`,
        origin: seg.origin,
        destination: seg.destination,
        departureDateTime: seg.departureDateTime,
        carrierCode: seg.carrierCode,
        flightNumber: seg.flightNumber,
        cabinCode: '5', // Default economy
      });
    });
    return segments;
  }

  // Fallback to order.segments
  if (order.segments && order.segments.length > 0) {
    order.segments.forEach((seg, idx) => {
      // Combine date and time
      let departureDateTime = seg.departureDate;
      if (seg.departureTime) {
        departureDateTime = `${seg.departureDate}T${seg.departureTime}`;
      }

      segments.push({
        segmentId: seg.paxSegmentId || `seg-${idx}`,
        origin: seg.origin,
        destination: seg.destination,
        departureDateTime,
        carrierCode: seg.marketingCarrier?.airlineCode || 'JQ',
        flightNumber: seg.marketingCarrier?.flightNumber || '',
        cabinCode: seg.cabinCode || '5',
      });
    });
    return segments;
  }

  return segments;
}

/**
 * Build journeys from order data
 */
function buildJourneys(order: OrderExtended, segments: LongSellSegment[]): LongSellJourney[] {
  const journeys: LongSellJourney[] = [];

  // Create segment ID to index mapping (marketing segment ID -> segment)
  // Segment IDs from DatedMarketingSegmentList are like "Mkt-seg0897091484"
  // But PaxSegmentRefID in PaxJourneyList are like "seg0897091484" (without Mkt- prefix)
  const segmentMap = new Map<string, LongSellSegment>();
  segments.forEach((seg) => {
    segmentMap.set(seg.segmentId, seg);
    // Also map without Mkt- prefix
    if (seg.segmentId.startsWith('Mkt-')) {
      segmentMap.set(seg.segmentId.replace('Mkt-', ''), seg);
    }
    // Also map just the numeric part
    const numMatch = seg.segmentId.match(/\d+/);
    if (numMatch) {
      segmentMap.set(`seg${numMatch[0]}`, seg);
    }
  });

  // Try PaxJourneyList from DataLists first (most reliable)
  if (order.DataLists?.PaxJourneyList?.PaxJourney) {
    const paxJourneys = order.DataLists.PaxJourneyList.PaxJourney;
    paxJourneys.forEach((journey: any, idx: number) => {
      const journeyId = journey.PaxJourneyID || `journey-${idx}`;

      // Get segment refs - can be single value or array
      let segmentRefIds: string[] = [];
      if (journey.PaxSegmentRefID) {
        if (Array.isArray(journey.PaxSegmentRefID)) {
          segmentRefIds = journey.PaxSegmentRefID;
        } else {
          segmentRefIds = [journey.PaxSegmentRefID];
        }
      }

      // Find origin/destination from segments
      let origin = '';
      let destination = '';
      const matchedSegmentIds: string[] = [];

      if (segmentRefIds.length > 0) {
        const firstSeg = segmentMap.get(segmentRefIds[0]);
        const lastSeg = segmentMap.get(segmentRefIds[segmentRefIds.length - 1]);
        origin = firstSeg?.origin || '';
        destination = lastSeg?.destination || '';

        // Map segment refs to our segment IDs
        segmentRefIds.forEach(ref => {
          const seg = segmentMap.get(ref);
          if (seg) {
            matchedSegmentIds.push(seg.segmentId);
          }
        });
      }

      journeys.push({
        journeyId,
        origin,
        destination,
        segmentIds: matchedSegmentIds.length > 0 ? matchedSegmentIds : segmentRefIds,
      });
    });
    return journeys;
  }

  // Use order.journeys if available
  if (order.journeys && order.journeys.length > 0) {
    order.journeys.forEach((journey, idx) => {
      // Get origin/destination from segments
      const journeySegmentIds = journey.segmentRefIds || [];
      let origin = '';
      let destination = '';

      if (journeySegmentIds.length > 0) {
        // Find first and last segments
        const firstSeg = segmentMap.get(journeySegmentIds[0]);
        const lastSeg = segmentMap.get(journeySegmentIds[journeySegmentIds.length - 1]);

        origin = firstSeg?.origin || '';
        destination = lastSeg?.destination || '';
      }

      journeys.push({
        journeyId: journey.paxJourneyId || `journey-${idx}`,
        origin,
        destination,
        segmentIds: journeySegmentIds,
      });
    });
    return journeys;
  }

  // Fallback: Create journeys by grouping segments
  // Simple heuristic: split by date gap or return to origin city
  if (segments.length > 0) {
    // For now, create a single journey with all segments (outbound)
    // and if there's a return pattern, split into two journeys
    const firstOrigin = segments[0].origin;
    const lastDestination = segments[segments.length - 1].destination;

    // Check if it's a round trip (last destination matches first origin)
    const returnSegmentIdx = segments.findIndex((seg, idx) =>
      idx > 0 && seg.destination === firstOrigin
    );

    if (returnSegmentIdx > 0 && returnSegmentIdx < segments.length - 1) {
      // Split into outbound and return
      const outboundSegments = segments.slice(0, returnSegmentIdx + 1);
      const returnSegments = segments.slice(returnSegmentIdx + 1);

      journeys.push({
        journeyId: 'journey-out',
        origin: outboundSegments[0].origin,
        destination: outboundSegments[outboundSegments.length - 1].destination,
        segmentIds: outboundSegments.map(s => s.segmentId),
      });

      if (returnSegments.length > 0) {
        journeys.push({
          journeyId: 'journey-in',
          origin: returnSegments[0].origin,
          destination: returnSegments[returnSegments.length - 1].destination,
          segmentIds: returnSegments.map(s => s.segmentId),
        });
      }
    } else {
      // Single journey
      journeys.push({
        journeyId: 'journey-out',
        origin: firstOrigin,
        destination: lastDestination,
        segmentIds: segments.map(s => s.segmentId),
      });
    }
  }

  return journeys;
}

/**
 * Build passengers from order data
 */
function buildPassengers(order: OrderExtended): LongSellPassenger[] {
  const passengers: LongSellPassenger[] = [];

  if (order.passengers && order.passengers.length > 0) {
    // Count by type for generating paxIds
    const counts = { ADT: 0, CHD: 0, INF: 0 };

    order.passengers.forEach((pax) => {
      const ptc = pax.ptc as 'ADT' | 'CHD' | 'INF';
      const paxId = pax.paxId || `${ptc}${counts[ptc]}`;
      counts[ptc]++;

      passengers.push({
        paxId,
        ptc,
      });
    });
  }

  return passengers;
}

/**
 * Build bundles from service items
 */
function buildBundles(
  order: OrderExtended,
  journeys: LongSellJourney[],
  passengers: LongSellPassenger[]
): LongSellBundle[] {
  const bundles: LongSellBundle[] = [];
  const addedBundles = new Set<string>();

  // Get paying passengers (exclude INF)
  const payingPaxIds = passengers.filter(p => p.ptc !== 'INF').map(p => p.paxId);

  // Find bundle services from serviceItems
  if (order.serviceItems) {
    order.serviceItems.forEach((service) => {
      if (service.serviceType === 'BUNDLE' && service.serviceCode) {
        // Determine journey index from segment refs
        let journeyIndex = 0;
        if (service.segmentRefIds && service.segmentRefIds.length > 0) {
          // Find which journey this segment belongs to
          const segmentRef = service.segmentRefIds[0];
          journeys.forEach((journey, idx) => {
            if (journey.segmentIds.includes(segmentRef)) {
              journeyIndex = idx;
            }
          });
        }

        // Dedupe: one bundle per code per journey
        const bundleKey = `${service.serviceCode}-${journeyIndex}`;
        if (!addedBundles.has(bundleKey)) {
          addedBundles.add(bundleKey);
          bundles.push({
            bundleCode: service.serviceCode,
            journeyIndex,
            paxIds: payingPaxIds,
          });
        }
      }
    });
  }

  return bundles;
}

/**
 * Build SSRs from service items
 */
function buildSSRs(
  order: OrderExtended,
  segments: LongSellSegment[],
  passengers: LongSellPassenger[]
): LongSellSSR[] {
  const ssrs: LongSellSSR[] = [];
  const addedSSRs = new Set<string>();

  // Create segment ID to index mapping
  const segmentIdToIndex = new Map<string, number>();
  segments.forEach((seg, idx) => {
    segmentIdToIndex.set(seg.segmentId, idx);
  });

  // Find SSR services from serviceItems
  if (order.serviceItems) {
    order.serviceItems.forEach((service) => {
      if (service.serviceType === 'SSR' && service.serviceCode) {
        // Get segment index
        let segmentIndex = 0;
        if (service.segmentRefIds && service.segmentRefIds.length > 0) {
          const idx = segmentIdToIndex.get(service.segmentRefIds[0]);
          if (idx !== undefined) {
            segmentIndex = idx;
          }
        }

        // Add SSR for each passenger
        service.paxRefIds.forEach((paxId) => {
          const ssrKey = `${service.serviceCode}-${segmentIndex}-${paxId}`;
          if (!addedSSRs.has(ssrKey)) {
            addedSSRs.add(ssrKey);
            ssrs.push({
              ssrCode: service.serviceCode,
              segmentIndex,
              paxId,
            });
          }
        });
      }
    });
  }

  return ssrs;
}

/**
 * Build seats from seat assignments
 */
function buildSeats(
  order: OrderExtended,
  segments: LongSellSegment[]
): LongSellSeat[] {
  const seats: LongSellSeat[] = [];
  const addedSeats = new Set<string>();

  // Create segment ID to index mapping
  const segmentIdToIndex = new Map<string, number>();
  segments.forEach((seg, idx) => {
    segmentIdToIndex.set(seg.segmentId, idx);
  });

  // Also create origin-dest to segment index mapping for SeatProfileList parsing
  // SeatProfileID format: s-AVVSYD-JQ612-A438252931-2D-2D
  const routeToSegmentIndex = new Map<string, number>();
  segments.forEach((seg, idx) => {
    const routeKey = `${seg.origin}${seg.destination}`;
    routeToSegmentIndex.set(routeKey, idx);
  });

  // Use seatAssignments from order
  if (order.seatAssignments && order.seatAssignments.length > 0) {
    order.seatAssignments.forEach((seat) => {
      const segmentIndex = segmentIdToIndex.get(seat.segmentRefId) ?? 0;
      const seatKey = `${segmentIndex}-${seat.paxRefId}`;

      if (!addedSeats.has(seatKey)) {
        addedSeats.add(seatKey);
        seats.push({
          segmentIndex,
          paxId: seat.paxRefId,
          row: seat.row,
          column: seat.column,
        });
      }
    });
  }

  // Also check serviceItems for seats if seatAssignments is empty
  if (seats.length === 0 && order.serviceItems) {
    order.serviceItems.forEach((service) => {
      if (service.serviceType === 'SEAT' && service.seatAssignment) {
        const segmentIndex = segmentIdToIndex.get(service.seatAssignment.segmentRefId) ?? 0;
        const seatKey = `${segmentIndex}-${service.seatAssignment.paxRefId}`;

        if (!addedSeats.has(seatKey)) {
          addedSeats.add(seatKey);
          seats.push({
            segmentIndex,
            paxId: service.seatAssignment.paxRefId,
            row: service.seatAssignment.row,
            column: service.seatAssignment.column,
          });
        }
      }
    });
  }

  // Parse SeatProfileList from DataLists if still no seats
  // SeatProfileID format: s-AVVSYD-JQ612-A438252931-2D-2D (route-flight-paxId-row-column)
  if (seats.length === 0 && order.DataLists?.SeatProfileList) {
    const seatProfiles = order.DataLists.SeatProfileList.SeatProfile || [];
    seatProfiles.forEach((profile: any) => {
      const seatProfileId = profile.SeatProfileID || '';
      // Parse format: s-ORIGDEST-FLIGHT-PAXID-ROW-COLUMN
      // Example: s-AVVSYD-JQ612-A438252931-2D-2D
      const match = seatProfileId.match(/^s-([A-Z]{6})-[A-Z0-9]+-([A-Z0-9]+)-(\d+)([A-Z])-/);
      if (match) {
        const routeKey = match[1]; // e.g., AVVSYD
        const paxId = match[2];    // e.g., A438252931
        const row = match[3];      // e.g., 2
        const column = match[4];   // e.g., D

        const segmentIndex = routeToSegmentIndex.get(routeKey) ?? 0;
        const seatKey = `${segmentIndex}-${paxId}`;

        if (!addedSeats.has(seatKey)) {
          addedSeats.add(seatKey);
          seats.push({
            segmentIndex,
            paxId,
            row,
            column,
          });
        }
      }
    });
  }

  return seats;
}
