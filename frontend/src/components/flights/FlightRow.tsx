/**
 * FlightRow - Compact tabular row for GDS-style flight display
 *
 * Shows flight info in a single compact row:
 * Flight | Route | Depart | Arrive | Duration | Stops | Fare | Price
 *
 * Clicking expands to show segment details and bundle selection
 */

import { cn } from '@/lib/cn';
import { formatTime, formatDuration, formatCurrency } from '@/lib/format';
import { ChevronRight, ChevronDown, Plane } from 'lucide-react';
import type { FlightOffer } from './FlightList';
import type { BundleOption } from './FlightCard';

export interface FlightRowProps {
  offer: FlightOffer;
  isExpanded: boolean;
  isSelected: boolean;
  selectedBundleId?: string;
  onToggleExpand: () => void;
  onSelectBundle: (bundleId: string) => void;
  passengers?: {
    adults: number;
    children: number;
    infants: number;
  };
}

/**
 * Format flight numbers from segments (e.g., "JQ 500" or "JQ 472/88")
 */
function formatFlightNumbers(segments: FlightOffer['journey']['segments']): string {
  if (segments.length === 1) {
    return `${segments[0].marketingCarrier} ${segments[0].flightNumber}`;
  }
  // Multiple segments - show carrier + all flight numbers
  const carrier = segments[0].marketingCarrier;
  const flightNums = segments.map(s => s.flightNumber).join('/');
  return `${carrier} ${flightNums}`;
}

/**
 * Format route showing all airports in sequence
 */
function formatRoute(segments: FlightOffer['journey']['segments']): string {
  const airports = [segments[0].origin];
  segments.forEach(s => airports.push(s.destination));

  if (airports.length === 2) {
    return `${airports[0]} → ${airports[1]}`;
  }
  return airports.join('-');
}

/**
 * Format stops indicator
 */
function formatStops(stops: number): { text: string; color: string } {
  if (stops === 0) {
    return { text: 'Direct', color: 'text-green-600 bg-green-50' };
  }
  if (stops === 1) {
    return { text: '1 Stop', color: 'text-amber-600 bg-amber-50' };
  }
  return { text: `${stops} Stops`, color: 'text-amber-600 bg-amber-50' };
}

/**
 * Get the lowest total price (base fare + cheapest bundle)
 */
function getLowestPrice(offer: FlightOffer, passengers?: FlightRowProps['passengers']): number {
  const paxCounts = passengers || { adults: 1, children: 0, infants: 0 };
  const payingPax = paxCounts.adults + paxCounts.children;
  const perPersonBaseFare = payingPax > 0 ? offer.baseFare / payingPax : offer.baseFare;
  const lowestBundle = Math.min(...offer.bundles.map(b => b.price));
  return perPersonBaseFare + lowestBundle;
}

/**
 * Get the default bundle (Starter/included one)
 */
function getDefaultBundle(bundles: BundleOption[]): BundleOption | undefined {
  return bundles.find(b => b.price === 0) || bundles[0];
}

export function FlightRow({
  offer,
  isExpanded,
  isSelected,
  selectedBundleId,
  onToggleExpand,
  onSelectBundle,
  passengers,
}: FlightRowProps) {
  const { journey, bundles, currency, fareBasisCode } = offer;
  const firstSegment = journey.segments[0];
  const lastSegment = journey.segments[journey.segments.length - 1];

  const flightNumbers = formatFlightNumbers(journey.segments);
  const route = formatRoute(journey.segments);
  const stopsInfo = formatStops(journey.stops);
  const lowestPrice = getLowestPrice(offer, passengers);

  // Default bundle for fare display - show bundle name + fare basis code
  const defaultBundle = getDefaultBundle(bundles);
  // Clean bundle name - remove "(NDC)" suffix if present
  const cleanBundleName = defaultBundle?.bundleName?.replace(/\s*\(NDC\)\s*/gi, '') || 'Economy';

  return (
    <div
      className={cn(
        'transition-all duration-200',
        isSelected && 'bg-gradient-to-r from-primary-50 to-orange-50 border-l-4 border-l-primary-500',
        isExpanded && !isSelected && 'bg-neutral-50',
        !isSelected && !isExpanded && 'hover:bg-neutral-50/80'
      )}
    >
      {/* Compact Row - Use table-like layout for perfect alignment */}
      <button
        onClick={onToggleExpand}
        className={cn(
          'w-full text-left transition-colors group',
          isExpanded && 'bg-neutral-100/50'
        )}
      >
        <div className="grid grid-cols-[40px_120px_140px_70px_70px_70px_70px_120px_90px] items-center px-2 py-3.5">
          {/* Expand/Collapse Icon */}
          <div className="flex items-center justify-center">
            <div className={cn(
              'w-6 h-6 rounded-full flex items-center justify-center transition-all',
              isExpanded
                ? 'bg-primary-100 text-primary-600'
                : 'bg-neutral-100 text-neutral-400 group-hover:bg-primary-50 group-hover:text-primary-500'
            )}>
              {isExpanded ? (
                <ChevronDown className="w-4 h-4" />
              ) : (
                <ChevronRight className="w-4 h-4" />
              )}
            </div>
          </div>

          {/* Flight Number */}
          <div className="flex items-center gap-2">
            <div className={cn(
              'w-7 h-7 rounded-lg flex items-center justify-center',
              isSelected ? 'bg-primary-100' : 'bg-neutral-100'
            )}>
              <Plane className={cn(
                'w-4 h-4',
                isSelected ? 'text-primary-600' : 'text-neutral-500'
              )} />
            </div>
            <span className="font-bold text-neutral-900 text-sm">
              {flightNumbers}
            </span>
          </div>

          {/* Route */}
          <div>
            <span className="text-sm text-neutral-600 font-medium">
              {route}
            </span>
          </div>

          {/* Departure Time */}
          <div className="text-center">
            <span className="font-bold text-neutral-900 text-sm">
              {formatTime(firstSegment.departureTime)}
            </span>
          </div>

          {/* Arrival Time */}
          <div className="text-center">
            <span className="font-bold text-neutral-900 text-sm">
              {formatTime(lastSegment.arrivalTime)}
            </span>
            {lastSegment.arrivalDate !== firstSegment.departureDate && (
              <span className="text-[10px] text-amber-600 font-bold ml-0.5">+1</span>
            )}
          </div>

          {/* Duration */}
          <div className="text-center">
            <span className="text-sm text-neutral-500">
              {formatDuration(journey.totalDuration)}
            </span>
          </div>

          {/* Stops */}
          <div className="text-center">
            <span className={cn(
              'inline-block px-2.5 py-1 rounded-full text-xs font-semibold',
              stopsInfo.color
            )}>
              {stopsInfo.text}
            </span>
          </div>

          {/* Fare Basis Code */}
          <div className="text-center">
            <span className="text-xs text-neutral-600 font-mono bg-neutral-100 px-2 py-1 rounded">
              {fareBasisCode || cleanBundleName}
            </span>
          </div>

          {/* Price */}
          <div className="text-right pr-2">
            <span className={cn(
              'font-bold text-lg',
              isSelected ? 'text-primary-700' : 'text-primary-600'
            )}>
              {formatCurrency(lowestPrice, currency)}
            </span>
          </div>
        </div>
      </button>

      {/* Expanded Content */}
      {isExpanded && (
        <FlightRowExpanded
          offer={offer}
          selectedBundleId={selectedBundleId}
          onSelectBundle={onSelectBundle}
          passengers={passengers}
        />
      )}
    </div>
  );
}

/**
 * Expanded view showing segment details and bundle selection
 */
interface FlightRowExpandedProps {
  offer: FlightOffer;
  selectedBundleId?: string;
  onSelectBundle: (bundleId: string) => void;
  passengers?: FlightRowProps['passengers'];
}

function FlightRowExpanded({
  offer,
  selectedBundleId,
  onSelectBundle,
  passengers,
}: FlightRowExpandedProps) {
  const { journey, bundles, baseFare, currency } = offer;

  // Calculate per-person base fare
  const paxCounts = passengers || { adults: 1, children: 0, infants: 0 };
  const payingPax = paxCounts.adults + paxCounts.children;
  const perPersonBaseFare = payingPax > 0 ? baseFare / payingPax : baseFare;

  // Clean bundle name helper
  const cleanName = (name: string) => name.replace(/\s*\(NDC\)\s*/gi, '');

  return (
    <div className="px-5 pb-5 pt-3 border-t border-neutral-200 bg-gradient-to-b from-neutral-50 to-white">
      {/* Segment Details */}
      <div className="mb-5">
        <h4 className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest mb-3">
          Flight Details
        </h4>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-neutral-100 space-y-4">
          {journey.segments.map((segment, idx) => (
            <>
              <div key={segment.segmentId} className="flex items-center gap-4 text-sm">
                {/* Origin */}
                <div className="flex items-center gap-3 min-w-[160px]">
                  <div className="text-center">
                    <div className="font-bold text-lg text-neutral-900">{segment.origin}</div>
                    <div className="text-sm text-neutral-500">{formatTime(segment.departureTime)}</div>
                  </div>
                </div>

                {/* Flight Path */}
                <div className="flex-1 flex items-center gap-3">
                  <div className="h-px flex-1 bg-gradient-to-r from-neutral-300 to-neutral-200" />
                  <div className="flex flex-col items-center gap-1">
                    <span className="px-3 py-1.5 bg-primary-50 text-primary-700 rounded-full text-xs font-bold whitespace-nowrap border border-primary-100">
                      {segment.marketingCarrier} {segment.flightNumber}
                    </span>
                    <span className="text-[10px] text-neutral-400 font-medium">
                      {formatDuration(segment.duration)} {segment.aircraft && `• ${segment.aircraft}`}
                    </span>
                  </div>
                  <div className="h-px flex-1 bg-gradient-to-r from-neutral-200 to-neutral-300" />
                </div>

                {/* Destination */}
                <div className="flex items-center gap-3 min-w-[160px] justify-end">
                  <div className="text-center">
                    <div className="font-bold text-lg text-neutral-900">{segment.destination}</div>
                    <div className="text-sm text-neutral-500">{formatTime(segment.arrivalTime)}</div>
                  </div>
                </div>
              </div>

              {/* Layover indicator - shown between segments */}
              {idx < journey.segments.length - 1 && (
                <div className="flex justify-center -my-2">
                  <div className="text-xs text-amber-700 bg-amber-50 px-3 py-1 rounded-full font-medium border border-amber-200">
                    Layover at {segment.destination}
                  </div>
                </div>
              )}
            </>
          ))}
        </div>
      </div>

      {/* Bundle Selection - IMPORTANT: This is where bundle cards are rendered in flight selection */}
      {/* Bundle codes (S050, P200, M202, F202) are displayed here in brackets next to bundle names */}
      <div>
        <h4 className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest mb-3">
          Select Fare Bundle
        </h4>
        <div className="grid grid-cols-4 gap-4">
          {bundles.map((bundle) => {
            const isSelected = selectedBundleId === bundle.bundleId;
            const totalPrice = perPersonBaseFare + bundle.price;

            return (
              <button
                key={bundle.bundleId}
                onClick={() => onSelectBundle(bundle.bundleId)}
                className={cn(
                  'relative p-4 rounded-xl border-2 text-left transition-all duration-200',
                  isSelected
                    ? 'border-primary-500 bg-gradient-to-br from-primary-50 to-orange-50 shadow-lg ring-2 ring-primary-200 scale-[1.02]'
                    : getBundleTierStyle(bundle.tier),
                  'hover:shadow-lg hover:scale-[1.01]'
                )}
              >
                {/* Bundle Name with Code - wrapped for long names */}
                <div className="font-bold text-neutral-900 text-xs leading-tight break-words hyphens-auto">
                  {cleanName(bundle.bundleName)}{bundle.bundleCode ? ` (${bundle.bundleCode})` : ''}
                </div>

                {/* Price */}
                <div className={cn(
                  'text-xl font-bold mt-1',
                  bundle.price === 0 ? 'text-emerald-600' : 'text-primary-600'
                )}>
                  {bundle.price === 0 ? 'Included' : `+${formatCurrency(bundle.price, bundle.currency)}`}
                </div>

                {/* Key Inclusions - horizontal chip display */}
                <div className="mt-3 flex flex-wrap gap-1">
                  {bundle.inclusions.otherInclusions && bundle.inclusions.otherInclusions.length > 0 ? (
                    <>
                      {bundle.inclusions.otherInclusions.slice(0, 4).map((other: { code: string; name: string } | string, idx: number) => {
                        const code = typeof other === 'string' ? other : other.code;
                        return (
                          <span
                            key={`other-${idx}`}
                            className="inline-flex items-center px-1.5 py-0.5 bg-green-50 text-green-700 text-[10px] rounded font-medium"
                            title={typeof other === 'string' ? other : `${other.name} (${other.code})`}
                          >
                            {code}
                          </span>
                        );
                      })}
                      {bundle.inclusions.otherInclusions.length > 4 && (
                        <span className="inline-flex items-center px-1.5 py-0.5 bg-neutral-100 text-neutral-500 text-[10px] rounded font-medium">
                          +{bundle.inclusions.otherInclusions.length - 4}
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="text-neutral-400 text-[10px]">No inclusions</span>
                  )}
                </div>

                {/* Selection Circle */}
                <div className={cn(
                  'absolute top-3 right-3 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all',
                  isSelected ? 'border-primary-500 bg-primary-500 shadow-md' : 'border-neutral-300 bg-white'
                )}>
                  {isSelected && (
                    <svg className="w-3.5 h-3.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  )}
                </div>

                {/* Total price at bottom */}
                <div className="mt-4 pt-3 border-t border-neutral-200">
                  <span className="text-[10px] text-neutral-400 uppercase tracking-wider">Total: </span>
                  <span className="font-bold text-primary-600 text-base">
                    {formatCurrency(totalPrice, currency)}
                  </span>
                  <span className="text-xs text-neutral-500">/person</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/**
 * Get bundle tier styling
 */
function getBundleTierStyle(tier: number): string {
  switch (tier) {
    case 1: return 'border-neutral-200 bg-white hover:border-neutral-300';
    case 2: return 'border-orange-200 bg-orange-50 hover:border-orange-300';
    case 3: return 'border-emerald-200 bg-emerald-50 hover:border-emerald-300';
    case 4: return 'border-purple-200 bg-purple-50 hover:border-purple-300';
    default: return 'border-neutral-200 bg-white hover:border-neutral-300';
  }
}

/**
 * Inclusion item with checkmark - displays items from API response
 */
function InclusionItem({ included, text }: { included: boolean; text: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={cn(
        'w-3 h-3 flex items-center justify-center flex-shrink-0 text-[10px]',
        included ? 'text-green-600' : 'text-neutral-400'
      )}>
        {included ? '✓' : '✗'}
      </span>
      <span className={cn(
        included ? 'text-neutral-700' : 'text-neutral-400'
      )}>
        {text}
      </span>
    </div>
  );
}
