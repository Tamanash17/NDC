import { useState } from 'react';
import { cn } from '@/lib/cn';
import { formatTime, formatDuration, formatCurrency } from '@/lib/format';
import { Card, Badge } from '@/components/ui';
import { Plane, Clock, Users, Luggage, ChevronDown, ChevronUp, MapPin } from 'lucide-react';

export interface FlightSegment {
  segmentId: string;
  flightNumber: string;
  marketingCarrier: string;
  operatingCarrier?: string;
  origin: string;
  destination: string;
  departureDate: string;
  departureTime: string;
  arrivalDate: string;
  arrivalTime: string;
  duration: number; // minutes
  aircraft?: string;
  cabinClass?: string;
}

export interface FlightJourney {
  journeyId: string;
  segments: FlightSegment[];
  totalDuration: number;
  stops: number;
}

export interface BundleOption {
  bundleId: string;
  bundleName: string;
  bundleCode: string;
  description?: string;
  price: number;
  currency: string;
  tier: number;
  isRecommended?: boolean;
  inclusions: {
    baggage: string;
    meals: boolean;
    seatSelection: boolean;
    changes: string;
    cancellation: string;
    otherInclusions?: string[];
  };
  // Per-passenger-type offerItemIds - bundles have different IDs for ADT, CHD, INF
  // Key is paxRefId (e.g., "ADT0", "CHD0"), value is the offerItemId for that passenger
  paxOfferItemIds?: Record<string, string>;
  // Journey ref from ALaCarteOffer - MUST use this for OfferPrice requests
  // Format: e.g., "fl913653037" - different from PaxJourneyID in journey.journeyId
  journeyRefId?: string;
}

export interface FlightCardProps {
  journey: FlightJourney;
  bundles: BundleOption[];
  baseFare: number;  // Base fare price (total for all paying pax)
  currency: string;
  selectedBundleId?: string;
  onBundleSelect: (bundleId: string) => void;
  onViewDetails?: () => void;
  isSelected?: boolean;
  className?: string;
  // Fare info
  fareBasisCode?: string;
  cabinType?: string;
  rbd?: string;
  // Passenger counts for per-person pricing
  passengers?: {
    adults: number;
    children: number;
    infants: number;
  };
}

// Calculate layover duration between two segments
function calculateLayover(prevSegment: FlightSegment, nextSegment: FlightSegment): number {
  try {
    // Parse arrival and departure times
    const arrivalDateTime = new Date(`${prevSegment.arrivalDate} ${prevSegment.arrivalTime}`);
    const departureDateTime = new Date(`${nextSegment.departureDate} ${nextSegment.departureTime}`);
    const diffMs = departureDateTime.getTime() - arrivalDateTime.getTime();
    return Math.round(diffMs / (1000 * 60)); // Return minutes
  } catch {
    return 0;
  }
}

export function FlightCard({
  journey,
  bundles,
  baseFare,
  currency,
  selectedBundleId,
  onBundleSelect,
  onViewDetails,
  isSelected,
  className,
  fareBasisCode,
  cabinType,
  rbd,
  passengers,
}: FlightCardProps) {
  const [showStopDetails, setShowStopDetails] = useState(false);
  const firstSegment = journey.segments[0];
  const lastSegment = journey.segments[journey.segments.length - 1];

  // Calculate per-person pricing
  // baseFare is total for all paying passengers (ADT + CHD)
  // Bundle price is per passenger
  const paxCounts = passengers || { adults: 1, children: 0, infants: 0 };
  const payingPax = paxCounts.adults + paxCounts.children;
  const perPersonBaseFare = payingPax > 0 ? baseFare / payingPax : baseFare;
  const lowestBundlePrice = bundles.reduce((min, b) => Math.min(min, b.price), bundles[0]?.price || 0);
  const fromPrice = perPersonBaseFare + lowestBundlePrice;

  // Get stop cities (destinations of all segments except the last)
  const stopCities = journey.segments.slice(0, -1).map(seg => seg.destination);

  return (
    <Card className={cn(
      'overflow-hidden transition-all duration-200',
      isSelected && 'ring-2 ring-primary-500 shadow-lg',
      className
    )}>
      {/* Flight Timeline Header */}
      <div className="p-4 border-b border-neutral-100">
        <div className="flex items-center justify-between">
          {/* Departure */}
          <div className="text-center">
            <p className="text-2xl font-bold text-neutral-900">
              {formatTime(firstSegment.departureTime)}
            </p>
            <p className="text-sm font-medium text-neutral-700">{firstSegment.origin}</p>
            <p className="text-xs text-neutral-500">{firstSegment.departureDate}</p>
          </div>

          {/* Timeline */}
          <div className="flex-1 mx-4">
            <div className="flex items-center">
              <div className="w-2 h-2 rounded-full bg-primary-500" />
              <div className="flex-1 h-0.5 bg-neutral-200 relative mx-1">
                {/* Show stop indicators */}
                {stopCities.map((city, idx) => (
                  <div
                    key={city}
                    className="absolute inset-y-0 flex items-center"
                    style={{ left: `${((idx + 1) / (stopCities.length + 1)) * 100}%` }}
                    title={city}
                  >
                    <div className="w-2 h-2 rounded-full bg-amber-500 border border-white" />
                  </div>
                ))}
                <Plane className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-4 text-primary-500" />
              </div>
              <div className="w-2 h-2 rounded-full bg-primary-500" />
            </div>
            <div className="flex items-center justify-center mt-1 gap-2">
              <Clock className="w-3 h-3 text-neutral-400" />
              <span className="text-xs text-neutral-500">
                {formatDuration(journey.totalDuration)}
              </span>
              {journey.stops > 0 && (
                <button
                  onClick={() => setShowStopDetails(!showStopDetails)}
                  className="flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-700 rounded text-xs font-medium hover:bg-amber-200 transition-colors"
                >
                  <MapPin className="w-3 h-3" />
                  {journey.stops} stop{journey.stops > 1 ? 's' : ''}: {stopCities.join(', ')}
                  {showStopDetails ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                </button>
              )}
              {journey.stops === 0 && (
                <Badge variant="success" size="sm">
                  Direct
                </Badge>
              )}
            </div>
          </div>

          {/* Arrival */}
          <div className="text-center">
            <p className="text-2xl font-bold text-neutral-900">
              {formatTime(lastSegment.arrivalTime)}
            </p>
            <p className="text-sm font-medium text-neutral-700">{lastSegment.destination}</p>
            <p className="text-xs text-neutral-500">{lastSegment.arrivalDate}</p>
          </div>

          {/* Price */}
          <div className="ml-6 text-right">
            <p className="text-xs text-neutral-500">from</p>
            <p className="text-xl font-bold text-primary-600">
              {formatCurrency(fromPrice, currency)}
            </p>
            <p className="text-xs text-neutral-500">per person</p>
          </div>
        </div>

        {/* Flight Info */}
        <div className="flex items-center flex-wrap gap-x-4 gap-y-1 mt-3 text-xs text-neutral-500">
          <span className="flex items-center gap-1">
            <Plane className="w-3 h-3" />
            {firstSegment.marketingCarrier} {firstSegment.flightNumber}
          </span>
          {firstSegment.aircraft && (
            <span>{firstSegment.aircraft}</span>
          )}
          {/* Fare info badges */}
          {cabinType && (
            <span className="px-1.5 py-0.5 bg-slate-100 rounded text-slate-600 font-medium">
              {cabinType === '5' ? 'Economy' : cabinType === '4' ? 'Business' : `Cabin ${cabinType}`}
            </span>
          )}
          {rbd && (
            <span className="px-1.5 py-0.5 bg-blue-50 rounded text-blue-600 font-mono text-[10px]">
              RBD: {rbd}
            </span>
          )}
          {fareBasisCode && (
            <span className="px-1.5 py-0.5 bg-amber-50 rounded text-amber-700 font-mono text-[10px]">
              {fareBasisCode}
            </span>
          )}
          {onViewDetails && (
            <button
              onClick={onViewDetails}
              className="text-primary-600 hover:underline ml-auto"
            >
              View details
            </button>
          )}
        </div>

        {/* Expanded Stop Details */}
        {showStopDetails && journey.stops > 0 && (
          <div className="mt-4 pt-4 border-t border-neutral-200">
            <h4 className="text-sm font-semibold text-neutral-700 mb-3">Flight Details</h4>
            <div className="space-y-3">
              {journey.segments.map((segment, idx) => (
                <div key={segment.segmentId}>
                  {/* Segment */}
                  <div className="flex items-start gap-3 bg-white rounded-lg p-3 border border-neutral-100">
                    <div className="flex flex-col items-center">
                      <div className="w-3 h-3 rounded-full bg-primary-500" />
                      <div className="w-0.5 h-12 bg-neutral-300" />
                      <div className="w-3 h-3 rounded-full bg-primary-500" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-semibold text-neutral-900">
                            {formatTime(segment.departureTime)} - {segment.origin}
                          </p>
                          <p className="text-xs text-neutral-500">{segment.departureDate}</p>
                        </div>
                        <div className="text-right">
                          <span className="text-xs font-medium px-2 py-0.5 bg-primary-100 text-primary-700 rounded">
                            {segment.marketingCarrier} {segment.flightNumber}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 my-2 text-xs text-neutral-500">
                        <Clock className="w-3 h-3" />
                        <span>{formatDuration(segment.duration)}</span>
                        {segment.aircraft && (
                          <>
                            <span>•</span>
                            <span>{segment.aircraft}</span>
                          </>
                        )}
                        {segment.operatingCarrier && segment.operatingCarrier !== segment.marketingCarrier && (
                          <>
                            <span>•</span>
                            <span className="text-amber-600">Operated by {segment.operatingCarrier}</span>
                          </>
                        )}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-neutral-900">
                          {formatTime(segment.arrivalTime)} - {segment.destination}
                        </p>
                        <p className="text-xs text-neutral-500">{segment.arrivalDate}</p>
                      </div>
                    </div>
                  </div>

                  {/* Layover info between segments */}
                  {idx < journey.segments.length - 1 && (
                    <div className="flex items-center gap-2 my-2 ml-4">
                      <div className="flex-1 h-px bg-amber-300" />
                      <div className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-full">
                        <MapPin className="w-3.5 h-3.5 text-amber-600" />
                        <span className="text-xs font-medium text-amber-700">
                          {formatDuration(calculateLayover(segment, journey.segments[idx + 1]))} layover in {segment.destination}
                        </span>
                      </div>
                      <div className="flex-1 h-px bg-amber-300" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Bundle Selection */}
      <div className="p-4 bg-neutral-50">
        <div className="grid grid-cols-3 gap-3">
          {bundles.map((bundle) => (
            <BundleCard
              key={bundle.bundleId}
              bundle={bundle}
              isSelected={selectedBundleId === bundle.bundleId}
              onSelect={() => onBundleSelect(bundle.bundleId)}
            />
          ))}
        </div>
      </div>
    </Card>
  );
}

interface BundleCardProps {
  bundle: BundleOption;
  isSelected: boolean;
  onSelect: () => void;
}

function BundleCard({ bundle, isSelected, onSelect }: BundleCardProps) {
  const tierColors = {
    1: 'border-neutral-300 bg-white',
    2: 'border-orange-300 bg-orange-50',
    3: 'border-emerald-300 bg-emerald-50',
    4: 'border-purple-300 bg-purple-50',
  };

  return (
    <button
      onClick={onSelect}
      className={cn(
        'relative p-3 rounded-lg border-2 text-left transition-all min-h-[180px]',
        isSelected
          ? 'border-primary-500 bg-primary-50 shadow-md ring-2 ring-primary-200'
          : tierColors[bundle.tier as keyof typeof tierColors] || 'border-neutral-200 bg-white',
        'hover:shadow-md'
      )}
    >
      {bundle.isRecommended && (
        <Badge
          variant="primary"
          size="sm"
          className="absolute -top-2 left-1/2 -translate-x-1/2 whitespace-nowrap z-10"
        >
          Recommended
        </Badge>
      )}

      <h4 className="font-semibold text-neutral-900 pr-6">
        {bundle.bundleName}{bundle.bundleCode ? ` (${bundle.bundleCode})` : ''}
      </h4>

      <div className="text-xs bg-red-100 p-2 my-2">
        DEBUG: bundleCode={bundle.bundleCode || 'UNDEFINED'} / bundleName={bundle.bundleName}
      </div>

      <p className="text-lg font-bold text-neutral-900 mt-1">
        {bundle.price === 0 ? 'Included' : `+${formatCurrency(bundle.price, bundle.currency)}`}
      </p>

      <div className="mt-2 space-y-1.5 text-xs">
        {/* Baggage */}
        <div className="flex items-center gap-1.5">
          <Luggage className="w-3 h-3 text-neutral-400 flex-shrink-0" />
          <span className={bundle.inclusions.baggage ? 'text-neutral-700' : 'text-neutral-400'}>
            {bundle.inclusions.baggage || '7kg carry-on'}
          </span>
        </div>

        {/* Seat Selection */}
        <div className="flex items-center gap-1.5">
          <span className={cn('w-3 h-3 flex items-center justify-center flex-shrink-0', bundle.inclusions.seatSelection ? 'text-green-600' : 'text-neutral-400')}>
            {bundle.inclusions.seatSelection ? '✓' : '✗'}
          </span>
          <span className={bundle.inclusions.seatSelection ? 'text-neutral-700' : 'text-neutral-400'}>
            Seat selection
          </span>
        </div>

        {/* Meals */}
        <div className="flex items-center gap-1.5">
          <span className={cn('w-3 h-3 flex items-center justify-center flex-shrink-0', bundle.inclusions.meals ? 'text-green-600' : 'text-neutral-400')}>
            {bundle.inclusions.meals ? '✓' : '✗'}
          </span>
          <span className={bundle.inclusions.meals ? 'text-neutral-700' : 'text-neutral-400'}>
            Meals included
          </span>
        </div>

        {/* Changes */}
        <div className="flex items-center gap-1.5">
          <span className={cn('w-3 h-3 flex items-center justify-center flex-shrink-0', bundle.inclusions.changes === 'Included' ? 'text-green-600' : 'text-neutral-400')}>
            {bundle.inclusions.changes === 'Included' ? '✓' : '~'}
          </span>
          <span className={bundle.inclusions.changes === 'Included' ? 'text-neutral-700' : 'text-neutral-400'}>
            {bundle.inclusions.changes}
          </span>
        </div>

        {/* Other inclusions */}
        {bundle.inclusions.otherInclusions && bundle.inclusions.otherInclusions.length > 0 && (
          <div className="flex items-start gap-1.5 pt-1 border-t border-neutral-200">
            <span className="text-green-600 w-3 h-3 flex items-center justify-center flex-shrink-0">+</span>
            <span className="text-neutral-600 text-[10px]">
              {bundle.inclusions.otherInclusions.slice(0, 3).join(', ')}
              {bundle.inclusions.otherInclusions.length > 3 && ` +${bundle.inclusions.otherInclusions.length - 3} more`}
            </span>
          </div>
        )}
      </div>

      {/* Selection indicator */}
      <div className={cn(
        'absolute top-2 right-2 w-5 h-5 rounded-full border-2 flex items-center justify-center',
        isSelected ? 'border-primary-500 bg-primary-500' : 'border-neutral-300'
      )}>
        {isSelected && (
          <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
          </svg>
        )}
      </div>
    </button>
  );
}
