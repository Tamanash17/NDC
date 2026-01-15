// ============================================================================
// FLIGHT JOURNEY TIMELINE - Visual Flight Path Display
// Shows journeys, segments, and legs with beautiful timeline visualization
// ============================================================================

import { cn } from '@/lib/cn';
import {
  Plane, MapPin, Clock, Calendar, ArrowRight, Luggage, Users,
  Utensils, Armchair, ChevronDown, ChevronUp
} from 'lucide-react';
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
    <div className="space-y-6">
      {journeys.map((journey, idx) => (
        <JourneyCard
          key={journey.journeyId}
          journey={journey}
          journeyNumber={idx + 1}
          totalJourneys={journeys.length}
          passengerServices={passengerServices}
          showDetails={showDetails}
        />
      ))}
    </div>
  );
}

// Journey Card Component
interface JourneyCardProps {
  journey: FlightJourney;
  journeyNumber: number;
  totalJourneys: number;
  passengerServices?: PassengerServices[];
  showDetails: boolean;
}

function JourneyCard({
  journey,
  journeyNumber,
  totalJourneys,
  passengerServices,
  showDetails,
}: JourneyCardProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  const directionLabels = {
    outbound: 'Outbound Flight',
    return: 'Return Flight',
    multi: `Flight ${journeyNumber} of ${totalJourneys}`,
  };

  const directionColors = {
    outbound: 'from-orange-500 to-orange-600',
    return: 'from-blue-500 to-blue-600',
    multi: 'from-purple-500 to-purple-600',
  };

  return (
    <div className="bg-white rounded-2xl shadow-lg overflow-hidden border border-gray-100">
      {/* Journey Header */}
      <div className={cn(
        'bg-gradient-to-r px-6 py-4 text-white',
        directionColors[journey.direction]
      )}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="p-2 bg-white/20 rounded-xl backdrop-blur-sm">
              <Plane className="w-6 h-6" />
            </div>
            <div>
              <p className="text-white/80 text-sm font-medium">
                {directionLabels[journey.direction]}
              </p>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-2xl font-bold">{journey.origin}</span>
                <ArrowRight className="w-5 h-5 text-white/60" />
                <span className="text-2xl font-bold">{journey.destination}</span>
              </div>
            </div>
          </div>

          <div className="text-right">
            <p className="text-white/80 text-sm">
              {formatDate(journey.departureDate)}
            </p>
            {journey.totalDuration && (
              <p className="text-white font-semibold mt-1">
                {journey.totalDuration}
              </p>
            )}
          </div>
        </div>

        {/* Toggle Button */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="mt-4 flex items-center gap-2 text-white/80 hover:text-white transition-colors text-sm"
        >
          {isExpanded ? (
            <>
              <ChevronUp className="w-4 h-4" />
              Hide Details
            </>
          ) : (
            <>
              <ChevronDown className="w-4 h-4" />
              Show Details ({journey.segments.length} segment{journey.segments.length !== 1 ? 's' : ''})
            </>
          )}
        </button>
      </div>

      {/* Segments */}
      {isExpanded && (
        <div className="p-6">
          {journey.segments.map((segment, segIdx) => (
            <div key={segment.segmentId}>
              <SegmentCard
                segment={segment}
                isFirst={segIdx === 0}
                isLast={segIdx === journey.segments.length - 1}
                showDetails={showDetails}
                passengerServices={passengerServices?.map(ps => ({
                  ...ps,
                  seats: ps.seats?.filter(s => s.segmentId === segment.segmentId),
                  baggage: ps.baggage?.filter(b => b.segmentId === segment.segmentId),
                  meals: ps.meals?.filter(m => m.segmentId === segment.segmentId),
                }))}
              />

              {/* Connection Indicator */}
              {segIdx < journey.segments.length - 1 && (
                <ConnectionIndicator
                  arrivalTime={segment.arrivalDateTime}
                  departureTime={journey.segments[segIdx + 1].departureDateTime}
                  city={segment.destination}
                />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Segment Card Component
interface SegmentCardProps {
  segment: FlightSegment;
  isFirst: boolean;
  isLast: boolean;
  showDetails: boolean;
  passengerServices?: PassengerServices[];
}

function SegmentCard({
  segment,
  showDetails,
  passengerServices,
}: SegmentCardProps) {
  const departure = parseDateTime(segment.departureDateTime);
  const arrival = parseDateTime(segment.arrivalDateTime);

  return (
    <div className="relative">
      {/* Flight Path Visualization */}
      <div className="flex items-stretch gap-4">
        {/* Timeline */}
        <div className="flex flex-col items-center w-16">
          {/* Departure Time */}
          <div className="text-center">
            <p className="text-lg font-bold text-gray-900">{departure.time}</p>
            <p className="text-xs text-gray-500">{departure.date}</p>
          </div>

          {/* Vertical Line with Plane */}
          <div className="flex-1 relative my-2 w-px bg-gradient-to-b from-orange-500 via-orange-400 to-orange-500">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white p-1 rounded-full border-2 border-orange-500">
              <Plane className="w-4 h-4 text-orange-500 transform rotate-90" />
            </div>
          </div>

          {/* Arrival Time */}
          <div className="text-center">
            <p className="text-lg font-bold text-gray-900">{arrival.time}</p>
            <p className="text-xs text-gray-500">{arrival.date}</p>
          </div>
        </div>

        {/* Segment Details */}
        <div className="flex-1 bg-gray-50 rounded-xl p-4 border border-gray-100">
          {/* Airport Pair */}
          <div className="flex items-center justify-between mb-4">
            <AirportBadge
              code={segment.origin}
              name={segment.originName}
              type="departure"
            />

            <div className="flex-1 mx-4 flex items-center justify-center">
              <div className="flex items-center gap-2 px-3 py-1.5 bg-white rounded-full border border-gray-200 shadow-sm">
                <span className="font-bold text-orange-600">
                  {segment.carrierCode} {segment.flightNumber}
                </span>
                {segment.duration && (
                  <>
                    <span className="text-gray-300">|</span>
                    <Clock className="w-3.5 h-3.5 text-gray-400" />
                    <span className="text-sm text-gray-600">{segment.duration}</span>
                  </>
                )}
              </div>
            </div>

            <AirportBadge
              code={segment.destination}
              name={segment.destinationName}
              type="arrival"
            />
          </div>

          {/* Flight Details Row */}
          {showDetails && (
            <div className="flex flex-wrap gap-4 text-sm">
              {segment.aircraft && (
                <DetailChip icon={Plane} label="Aircraft" value={segment.aircraft} />
              )}
              {segment.cabinClass && (
                <DetailChip icon={Armchair} label="Cabin" value={segment.cabinClass} />
              )}
              {segment.rbd && (
                <DetailChip icon={Armchair} label="Class" value={segment.rbd} />
              )}
              {segment.operatingCarrier && segment.operatingCarrier !== segment.carrierCode && (
                <DetailChip icon={Plane} label="Operated by" value={segment.operatingCarrier} />
              )}
            </div>
          )}

          {/* Passenger Services for this Segment */}
          {showDetails && passengerServices && passengerServices.length > 0 && (
            <PassengerServicesGrid passengers={passengerServices} />
          )}
        </div>
      </div>
    </div>
  );
}

// Airport Badge Component
interface AirportBadgeProps {
  code: string;
  name?: string;
  type: 'departure' | 'arrival';
}

function AirportBadge({ code, name, type }: AirportBadgeProps) {
  return (
    <div className={cn(
      'text-center',
      type === 'departure' ? 'text-left' : 'text-right'
    )}>
      <div className="flex items-center gap-2">
        <MapPin className={cn(
          'w-4 h-4',
          type === 'departure' ? 'text-green-500' : 'text-red-500'
        )} />
        <span className="text-2xl font-bold text-gray-900">{code}</span>
      </div>
      {name && (
        <p className="text-xs text-gray-500 mt-0.5 max-w-[120px] truncate">
          {name}
        </p>
      )}
    </div>
  );
}

// Detail Chip Component
interface DetailChipProps {
  icon: React.ElementType;
  label: string;
  value: string;
}

function DetailChip({ icon: Icon, label, value }: DetailChipProps) {
  return (
    <div className="flex items-center gap-1.5 px-2 py-1 bg-white rounded-md border border-gray-200">
      <Icon className="w-3.5 h-3.5 text-gray-400" />
      <span className="text-gray-500">{label}:</span>
      <span className="font-medium text-gray-700">{value}</span>
    </div>
  );
}

// Connection Indicator
interface ConnectionIndicatorProps {
  arrivalTime: string;
  departureTime: string;
  city: string;
}

function ConnectionIndicator({ arrivalTime, departureTime, city }: ConnectionIndicatorProps) {
  const layover = calculateLayover(arrivalTime, departureTime);

  return (
    <div className="flex items-center gap-4 my-4 pl-16">
      <div className="flex-1 border-t-2 border-dashed border-gray-300" />
      <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 border border-amber-200 rounded-full">
        <Clock className="w-4 h-4 text-amber-600" />
        <span className="text-sm font-medium text-amber-700">
          {layover} layover in {city}
        </span>
      </div>
      <div className="flex-1 border-t-2 border-dashed border-gray-300" />
    </div>
  );
}

// Passenger Services Grid
interface PassengerServicesGridProps {
  passengers: PassengerServices[];
}

function PassengerServicesGrid({ passengers }: PassengerServicesGridProps) {
  const hasAnyServices = passengers.some(p =>
    (p.seats && p.seats.length > 0) ||
    (p.baggage && p.baggage.length > 0) ||
    (p.meals && p.meals.length > 0)
  );

  if (!hasAnyServices) return null;

  return (
    <div className="mt-4 pt-4 border-t border-gray-200">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
        Passenger Services
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {passengers.map(pax => {
          const hasServices =
            (pax.seats && pax.seats.length > 0) ||
            (pax.baggage && pax.baggage.length > 0) ||
            (pax.meals && pax.meals.length > 0);

          if (!hasServices) return null;

          return (
            <div key={pax.paxId} className="bg-white rounded-lg p-3 border border-gray-200">
              <div className="flex items-center gap-2 mb-2">
                <Users className="w-4 h-4 text-gray-400" />
                <span className="font-medium text-gray-700">{pax.name}</span>
                <span className={cn(
                  'text-xs px-1.5 py-0.5 rounded',
                  pax.type === 'ADT' ? 'bg-blue-100 text-blue-700' :
                  pax.type === 'CHD' ? 'bg-purple-100 text-purple-700' :
                  'bg-pink-100 text-pink-700'
                )}>
                  {pax.type}
                </span>
              </div>

              <div className="space-y-1.5">
                {pax.seats?.map((seat, i) => (
                  <ServiceBadge key={i} icon={Armchair} text={`Seat ${seat.seat}`} variant="seat" />
                ))}
                {pax.baggage?.map((bag, i) => (
                  <ServiceBadge key={i} icon={Luggage} text={bag.description} variant="baggage" />
                ))}
                {pax.meals?.map((meal, i) => (
                  <ServiceBadge key={i} icon={Utensils} text={meal.description} variant="meal" />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Service Badge
interface ServiceBadgeProps {
  icon: React.ElementType;
  text: string;
  variant: 'seat' | 'baggage' | 'meal';
}

function ServiceBadge({ icon: Icon, text, variant }: ServiceBadgeProps) {
  const variants = {
    seat: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    baggage: 'bg-orange-50 text-orange-700 border-orange-200',
    meal: 'bg-green-50 text-green-700 border-green-200',
  };

  return (
    <div className={cn(
      'flex items-center gap-1.5 text-xs px-2 py-1 rounded border',
      variants[variant]
    )}>
      <Icon className="w-3 h-3" />
      <span>{text}</span>
    </div>
  );
}

// Helper Functions
function formatDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

function parseDateTime(dateTimeStr: string): { date: string; time: string } {
  try {
    const date = new Date(dateTimeStr);
    return {
      date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      time: date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }),
    };
  } catch {
    return { date: '', time: dateTimeStr };
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
