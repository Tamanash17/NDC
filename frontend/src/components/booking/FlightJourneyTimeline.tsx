// ============================================================================
// FLIGHT JOURNEY TIMELINE - Compact Visual Flight Path Display
// Shows journeys and segments in minimal space with IDs for debugging
// ============================================================================

import { cn } from '@/lib/cn';
import { Plane, Clock, ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';

export interface FlightLeg {
  legId: string;
  origin: string;
  originName?: string;
  destination: string;
  destinationName?: string;
  departureDateTime: string;
  arrivalDateTime: string;
  flightNumber: string;
  carrierCode: string;
  aircraft?: string;
  duration?: string;
}

export interface FlightSegment {
  segmentId: string;
  origin: string;
  originName?: string;
  destination: string;
  destinationName?: string;
  departureDateTime: string;
  arrivalDateTime: string;
  flightNumber: string;
  carrierCode: string;
  operatingCarrier?: string;
  aircraft?: string;
  cabinClass?: string;
  rbd?: string;
  duration?: string;
  status?: string;
  legs?: FlightLeg[];
}

export interface FlightJourney {
  journeyId: string;
  direction: 'outbound' | 'return' | 'multi';
  origin: string;
  originName?: string;
  destination: string;
  destinationName?: string;
  departureDate: string;
  segments: FlightSegment[];
  totalDuration?: string;
}

export interface PassengerServices {
  paxId: string;
  name: string;
  type: 'ADT' | 'CHD' | 'INF';
  seats?: Array<{ segmentId: string; seat: string; }>;
  baggage?: Array<{ segmentId: string; description: string; }>;
  meals?: Array<{ segmentId: string; description: string; }>;
}

export interface FlightJourneyTimelineProps {
  journeys: FlightJourney[];
  passengerServices?: PassengerServices[];
  showDetails?: boolean;
}

export function FlightJourneyTimeline({
  journeys,
  passengerServices,
  showDetails = true,
}: FlightJourneyTimelineProps) {
  return (
    <div className="space-y-3">
      {journeys.map((journey, idx) => (
        <CompactJourneyCard
          key={journey.journeyId}
          journey={journey}
          journeyNumber={idx + 1}
          totalJourneys={journeys.length}
          showDetails={showDetails}
          passengerServices={passengerServices}
        />
      ))}
    </div>
  );
}

// Compact Journey Card Component
interface CompactJourneyCardProps {
  journey: FlightJourney;
  journeyNumber: number;
  totalJourneys: number;
  showDetails: boolean;
  passengerServices?: PassengerServices[];
}

function CompactJourneyCard({
  journey,
  journeyNumber,
  totalJourneys,
  showDetails,
  passengerServices,
}: CompactJourneyCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const directionLabels = {
    outbound: 'Outbound',
    return: 'Return',
    multi: `Flight ${journeyNumber}/${totalJourneys}`,
  };

  const directionColors = {
    outbound: 'bg-orange-500',
    return: 'bg-blue-500',
    multi: 'bg-purple-500',
  };

  return (
    <div className="bg-white rounded-xl shadow-md overflow-hidden border border-gray-100">
      {/* Compact Journey Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          {/* Direction Badge */}
          <span className={cn(
            'px-2 py-1 text-xs font-bold text-white rounded',
            directionColors[journey.direction]
          )}>
            {directionLabels[journey.direction]}
          </span>

          {/* Route */}
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold text-gray-900">{journey.origin}</span>
            <Plane className="w-4 h-4 text-gray-400" />
            <span className="text-lg font-bold text-gray-900">{journey.destination}</span>
          </div>

          {/* Journey ID */}
          <span className="text-[10px] font-mono text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
            {journey.journeyId}
          </span>
        </div>

        <div className="flex items-center gap-3">
          {/* Date & Duration */}
          <span className="text-sm text-gray-600">{formatDateShort(journey.departureDate)}</span>
          {journey.totalDuration && (
            <span className="text-sm font-medium text-gray-700 bg-gray-100 px-2 py-0.5 rounded">
              {journey.totalDuration}
            </span>
          )}
          {/* Segments count */}
          <span className="text-xs text-gray-500">
            {journey.segments.length} seg{journey.segments.length > 1 ? 's' : ''}
          </span>
          {isExpanded ? (
            <ChevronUp className="w-4 h-4 text-gray-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-gray-400" />
          )}
        </div>
      </button>

      {/* Expanded Segments - Compact Single Line Each */}
      {isExpanded && (
        <div className="border-t border-gray-100 bg-gray-50 px-4 py-3 space-y-2">
          {journey.segments.map((segment, segIdx) => {
            // Filter passenger services for this segment
            const segmentServices = passengerServices?.map(ps => ({
              ...ps,
              seats: ps.seats?.filter(s => s.segmentId === segment.segmentId),
              baggage: ps.baggage?.filter(b => b.segmentId === segment.segmentId),
              meals: ps.meals?.filter(m => m.segmentId === segment.segmentId),
            })).filter(ps =>
              (ps.seats && ps.seats.length > 0) ||
              (ps.baggage && ps.baggage.length > 0) ||
              (ps.meals && ps.meals.length > 0)
            );

            return (
              <div key={segment.segmentId}>
                <CompactSegmentRow segment={segment} passengerServices={segmentServices} />
                {/* Layover indicator between segments */}
                {segIdx < journey.segments.length - 1 && (
                  <LayoverBadge
                    arrivalTime={segment.arrivalDateTime}
                    departureTime={journey.segments[segIdx + 1].departureDateTime}
                    city={segment.destination}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Compact Segment Row - Single Line with all info
interface CompactSegmentRowProps {
  segment: FlightSegment;
  passengerServices?: PassengerServices[];
}

function CompactSegmentRow({ segment, passengerServices }: CompactSegmentRowProps) {
  const depTime = formatTime(segment.departureDateTime);
  const arrTime = formatTime(segment.arrivalDateTime);
  const depDate = formatDateShort(segment.departureDateTime);
  const arrDate = formatDateShort(segment.arrivalDateTime);
  const isDifferentDay = depDate !== arrDate;
  const hasOperatingCarrier = segment.operatingCarrier && segment.operatingCarrier !== segment.carrierCode;

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      {/* Main Flight Info Row */}
      <div className="flex items-center gap-2 px-3 py-2">
        {/* Flight Number Badge */}
        <div className="bg-orange-100 text-orange-700 px-2 py-1 rounded font-mono font-bold text-sm min-w-[65px] text-center">
          {segment.carrierCode} {segment.flightNumber}
        </div>

        {/* Origin */}
        <div className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
          <span className="font-semibold text-gray-900">{segment.origin}</span>
          <span className="text-sm text-gray-600">{depTime}</span>
        </div>

        {/* Flight Path Visual */}
        <div className="flex-1 flex items-center gap-1 px-1 min-w-[60px]">
          <div className="flex-1 h-px bg-gray-300" />
          <Plane className="w-3 h-3 text-gray-400 flex-shrink-0" />
          <div className="flex-1 h-px bg-gray-300" />
        </div>

        {/* Destination */}
        <div className="flex items-center gap-1">
          <span className="font-semibold text-gray-900">{segment.destination}</span>
          <span className="text-sm text-gray-600">
            {arrTime}
            {isDifferentDay && <sup className="text-[9px] text-orange-500 ml-0.5">+1</sup>}
          </span>
          <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
        </div>

        {/* Duration */}
        {segment.duration && (
          <span className="text-[10px] text-gray-500 flex items-center gap-0.5 bg-gray-100 px-1.5 py-0.5 rounded">
            <Clock className="w-2.5 h-2.5" />
            {segment.duration}
          </span>
        )}

        {/* Date */}
        <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">{depDate}</span>

        {/* Aircraft */}
        {segment.aircraft && (
          <span className="text-[10px] text-gray-500 border border-gray-200 px-1.5 py-0.5 rounded">
            {segment.aircraft}
          </span>
        )}

        {/* Cabin/RBD */}
        {(segment.cabinClass || segment.rbd) && (
          <span className="text-[10px] text-purple-600 bg-purple-50 border border-purple-200 px-1.5 py-0.5 rounded">
            {segment.cabinClass}{segment.rbd ? ` (${segment.rbd})` : ''}
          </span>
        )}

        {/* Operating Carrier */}
        {hasOperatingCarrier && (
          <span className="text-[10px] text-blue-600 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded">
            Op: {segment.operatingCarrier}
          </span>
        )}

        {/* Segment ID */}
        <span className="text-[10px] font-mono text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded">
          {segment.segmentId}
        </span>
      </div>

      {/* Passenger Services Row (if any) */}
      {passengerServices && passengerServices.length > 0 && (
        <div className="border-t border-gray-100 bg-gray-50 px-3 py-1.5 flex flex-wrap gap-2">
          {passengerServices.map(pax => (
            <div key={pax.paxId} className="flex items-center gap-1 text-[10px]">
              <span className="font-medium text-gray-600">{pax.name.split(' ')[0]}:</span>
              {pax.seats?.map((s, i) => (
                <span key={i} className="bg-purple-100 text-purple-700 px-1 py-0.5 rounded">
                  {s.seat}
                </span>
              ))}
              {pax.baggage?.map((b, i) => (
                <span key={i} className="bg-blue-100 text-blue-700 px-1 py-0.5 rounded">
                  {b.description}
                </span>
              ))}
              {pax.meals?.map((m, i) => (
                <span key={i} className="bg-green-100 text-green-700 px-1 py-0.5 rounded">
                  {m.description}
                </span>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Layover Badge - Minimal
interface LayoverBadgeProps {
  arrivalTime: string;
  departureTime: string;
  city: string;
}

function LayoverBadge({ arrivalTime, departureTime, city }: LayoverBadgeProps) {
  const layover = calculateLayover(arrivalTime, departureTime);

  return (
    <div className="flex justify-center my-1">
      <span className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full flex items-center gap-1">
        <Clock className="w-2.5 h-2.5" />
        {layover} in {city}
      </span>
    </div>
  );
}

// Helper Functions
function formatDateShort(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
  } catch {
    return dateStr;
  }
}

function formatTime(dateTimeStr: string): string {
  try {
    const date = new Date(dateTimeStr);
    return date.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', hour12: false });
  } catch {
    return dateTimeStr;
  }
}

function calculateLayover(arrivalTime: string, departureTime: string): string {
  try {
    const arrival = new Date(arrivalTime);
    const departure = new Date(departureTime);
    const diffMs = departure.getTime() - arrival.getTime();
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${mins}m`;
  } catch {
    return 'N/A';
  }
}
