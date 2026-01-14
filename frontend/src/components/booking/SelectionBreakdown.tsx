import { cn } from '@/lib/cn';
import { Plane, Tag, Briefcase, CreditCard, Package, CheckCircle2 } from 'lucide-react';
import { formatCurrency } from '@/lib/format';
import type { FlightSelection, FlightSelectionItem, SelectedServiceItem } from '@/hooks/useFlightSelection';

interface PassengerCounts {
  adults: number;
  children: number;
  infants: number;
}

interface SelectionBreakdownProps {
  selection: FlightSelection;
  shoppingResponseId?: string | null;
  searchCriteria?: {
    origin: string;
    destination: string;
    departureDate: string;
    returnDate?: string;
    passengers: PassengerCounts;
    cabinClass?: string;
  };
  // Fare info from offer - can be passed separately or read from selection item
  outboundFareInfo?: {
    fareBasisCode?: string;
    cabinType?: string;
    rbd?: string;
  };
  inboundFareInfo?: {
    fareBasisCode?: string;
    cabinType?: string;
    rbd?: string;
  };
  // Selected services from ServiceList step
  selectedServices?: SelectedServiceItem[];
  // Verified price from OfferPrice API - if set, shows "Verified Total" instead of "Estimated"
  verifiedTotal?: number;
}

function getCabinLabel(cabinCode?: string): string {
  if (!cabinCode) return 'Economy';
  switch (cabinCode) {
    case '2':
    case 'C':
      return 'Business';
    case '4':
      return 'Premium Economy';
    case '5':
    case 'M':
    case 'Y':
      return 'Economy';
    case 'F':
      return 'First';
    default:
      return cabinCode;
  }
}


function FlightSection({
  direction,
  selectionItem,
  fareInfo,
  passengers
}: {
  direction: 'Outbound' | 'Return';
  selectionItem: FlightSelectionItem;
  fareInfo?: { fareBasisCode?: string; cabinType?: string; rbd?: string };
  passengers?: PassengerCounts;
}) {
  const { journey, bundle, baseFare, perPaxPricing } = selectionItem;
  const isOutbound = direction === 'Outbound';

  // Debug logging
  console.log(`[SelectionBreakdown] FlightSection ${direction}:`, {
    baseFare,
    bundlePrice: bundle.price,
    bundleId: bundle.bundleId,
    bundleName: bundle.bundleName,
    perPaxPricing,
    passengers,
    calculatedAdultTotal: passengers ? passengers.adults * (perPaxPricing?.find(p => p.paxType === 'ADT')?.perPersonAmount || 0) : 0,
    calculatedBundleForADT: passengers ? passengers.adults * bundle.price : 0,
  });
  // Use fareInfo from props if provided, otherwise from selection item
  const effectiveFareInfo = fareInfo || {
    fareBasisCode: selectionItem.fareBasisCode,
    cabinType: selectionItem.cabinType,
    rbd: selectionItem.rbd,
  };
  const firstSegment = journey.segments[0];
  const lastSegment = journey.segments[journey.segments.length - 1];
  const flightNumbers = journey.segments.map(s => `${s.marketingCarrier}${s.flightNumber}`).join(', ');

  const paxCounts = passengers || { adults: 1, children: 0, infants: 0 };

  // Use actual per-pax pricing from AirShopping if available
  let adultBaseFare: number;
  let childBaseFare: number;
  let infantBaseFare: number;

  if (perPaxPricing && perPaxPricing.length > 0) {
    // Use actual pricing from AirShopping API
    const adtPricing = perPaxPricing.find(p => p.paxType === 'ADT');
    const chdPricing = perPaxPricing.find(p => p.paxType === 'CHD');
    const infPricing = perPaxPricing.find(p => p.paxType === 'INF');

    adultBaseFare = adtPricing?.perPersonAmount ?? 0;
    childBaseFare = chdPricing?.perPersonAmount ?? adultBaseFare; // Fallback to adult if no CHD pricing
    infantBaseFare = infPricing?.perPersonAmount ?? 0;
  } else {
    // Fallback: estimate from baseFare (legacy behavior)
    const payingPax = paxCounts.adults + paxCounts.children;
    adultBaseFare = payingPax > 0 ? baseFare / payingPax : baseFare;
    childBaseFare = adultBaseFare; // CHD typically same as ADT for LCCs
    infantBaseFare = Math.round(adultBaseFare * 0.1); // INF ~10% of adult fare (estimate)
  }

  // Bundle pricing: ADT and CHD get bundles, INF does not
  const adultBundlePrice = bundle.price;
  const childBundlePrice = bundle.price;
  const infantBundlePrice = 0; // Infants don't get bundles (no seat, no baggage)

  // Per-pax totals (base fare + bundle)
  const adultPerPax = adultBaseFare + adultBundlePrice;
  const childPerPax = childBaseFare + childBundlePrice;
  const infantPerPax = infantBaseFare + infantBundlePrice;

  // Calculate totals per passenger type
  const adultTotal = paxCounts.adults * adultPerPax;
  const childTotal = paxCounts.children * childPerPax;
  const infantTotal = paxCounts.infants * infantPerPax;
  const flightTotal = adultTotal + childTotal + infantTotal;

  // Direction-specific styling
  const sectionStyles = isOutbound
    ? 'border-l-4 border-l-blue-500 bg-blue-50/50'
    : 'border-l-4 border-l-amber-500 bg-amber-50/50';

  const headerBgStyles = isOutbound
    ? 'bg-blue-500'
    : 'bg-amber-500';

  return (
    <div className={cn('rounded-lg overflow-hidden', sectionStyles)}>
      {/* Section Header - Prominent colored banner */}
      <div className={cn('px-3 py-2 flex items-center justify-between', headerBgStyles)}>
        <div className="flex items-center gap-2">
          <Plane className={cn('w-4 h-4 text-white', !isOutbound && 'rotate-180')} />
          <span className="text-sm font-bold text-white uppercase tracking-wide">{direction}</span>
        </div>
        <span className="text-xs text-white/90 font-medium">
          {firstSegment.origin} → {lastSegment.destination}
        </span>
      </div>

      {/* Content */}
      <div className="p-3 space-y-2">
        {/* Flight Details */}
        <div className="bg-white rounded-lg p-3 space-y-2 text-xs border border-slate-200">
          <div className="flex items-center justify-between">
            <span className="font-mono text-slate-600">{flightNumbers}</span>
            <span className="text-slate-500">{firstSegment.departureDate} {firstSegment.departureTime}</span>
          </div>

          <div className="flex items-center gap-3 text-slate-500">
            {effectiveFareInfo?.fareBasisCode && (
              <span className="font-mono">{effectiveFareInfo.fareBasisCode}</span>
            )}
            <span>{getCabinLabel(effectiveFareInfo?.cabinType)}</span>
            {journey.stops > 0 && (
              <span className="text-amber-600">{journey.stops} stop{journey.stops > 1 ? 's' : ''}</span>
            )}
          </div>

          {/* Bundle */}
          <div className="flex items-center justify-between pt-2 border-t border-slate-200">
            <div className="flex items-center gap-1.5">
              <Tag className="w-3 h-3 text-orange-500" />
              <span className="font-medium text-slate-700">{bundle.bundleName}</span>
            </div>
            <span className="font-mono text-slate-500">{bundle.bundleCode}</span>
          </div>
        </div>

        {/* Pricing */}
        <div className="space-y-1.5 text-xs px-1">
          {paxCounts.adults > 0 && (
            <div className="flex justify-between">
              <span className="text-slate-500">Adult x {paxCounts.adults}</span>
              <span className="text-slate-700">{formatCurrency(adultTotal, bundle.currency)}</span>
            </div>
          )}
          {paxCounts.children > 0 && (
            <div className="flex justify-between">
              <span className="text-slate-500">Child x {paxCounts.children}</span>
              <span className="text-slate-700">{formatCurrency(childTotal, bundle.currency)}</span>
            </div>
          )}
          {paxCounts.infants > 0 && (
            <div className="flex justify-between">
              <span className="text-slate-500">Infant x {paxCounts.infants}</span>
              <span className="text-slate-700">{formatCurrency(infantTotal, bundle.currency)}</span>
            </div>
          )}
          <div className="flex justify-between pt-1.5 border-t border-slate-200 font-medium">
            <span className="text-slate-600">Subtotal</span>
            <span className="text-slate-800">{formatCurrency(flightTotal, bundle.currency)}</span>
          </div>
          <div className="text-[10px] text-slate-400 italic mt-1">
            * Base fares from AirShopping. Final prices (with detailed taxes) shown in OfferPrice.
          </div>
        </div>
      </div>
    </div>
  );
}

export function SelectionBreakdown({
  selection,
  shoppingResponseId,
  searchCriteria,
  outboundFareInfo,
  inboundFareInfo,
  selectedServices,
  verifiedTotal,
}: SelectionBreakdownProps) {
  const hasSelection = selection.outbound || selection.inbound;

  // Calculate totals with per-passenger pricing
  let grandTotal = 0;
  let currency = 'AUD';

  const paxCounts = searchCriteria?.passengers || { adults: 1, children: 0, infants: 0 };

  // Helper to calculate flight total using actual per-pax pricing when available
  const calculateFlightTotal = (selectionItem: typeof selection.outbound): number => {
    if (!selectionItem) return 0;
    const bundlePrice = selectionItem.bundle.price;
    const perPaxPricing = selectionItem.perPaxPricing;

    // Use actual per-pax pricing from AirShopping if available
    if (perPaxPricing && perPaxPricing.length > 0) {
      let flightTotal = 0;
      for (const paxPricing of perPaxPricing) {
        // Base fare from AirShopping (total for this pax type)
        flightTotal += paxPricing.totalAmount;
        // Bundle upgrade cost: only ADT and CHD get bundles, INF does not
        if (paxPricing.paxType !== 'INF') {
          flightTotal += paxPricing.paxCount * bundlePrice;
        }
      }
      return flightTotal;
    }

    // Fallback: estimate using old logic
    const payingPax = paxCounts.adults + paxCounts.children;
    const adultBaseFare = payingPax > 0 ? selectionItem.baseFare / payingPax : selectionItem.baseFare;
    const infantBaseFare = Math.round(adultBaseFare * 0.1);

    let flightTotal = 0;
    flightTotal += paxCounts.adults * (adultBaseFare + bundlePrice);
    flightTotal += paxCounts.children * (adultBaseFare + bundlePrice);
    flightTotal += paxCounts.infants * infantBaseFare;
    return flightTotal;
  };

  if (selection.outbound) {
    grandTotal += calculateFlightTotal(selection.outbound);
    currency = selection.outbound.bundle.currency;
  }
  if (selection.inbound) {
    grandTotal += calculateFlightTotal(selection.inbound);
  }

  if (!hasSelection) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white">
        {/* Header */}
        <div className="px-4 py-3 border-b border-slate-100">
          <h3 className="font-semibold text-slate-800 text-sm flex items-center gap-2">
            <Briefcase className="w-4 h-4 text-slate-400" />
            Selection Breakdown
          </h3>
        </div>

        {/* Empty State */}
        <div className="p-6 text-center">
          <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-3">
            <Plane className="w-6 h-6 text-slate-400" />
          </div>
          <p className="text-sm text-slate-500">No flights selected</p>
          <p className="text-xs text-slate-400 mt-1">Select a flight to view pricing</p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
        <h3 className="font-semibold text-slate-800 text-sm flex items-center gap-2">
          <Briefcase className="w-4 h-4 text-orange-500" />
          Selection Breakdown
        </h3>
        <span className="text-xs text-emerald-600 font-medium">Active</span>
      </div>

      <div className="p-4 space-y-4">
        {/* Shopping Response ID - Collapsed by default */}
        {shoppingResponseId && (
          <details className="group">
            <summary className="text-[10px] text-slate-400 cursor-pointer hover:text-slate-600">
              Response ID
            </summary>
            <div className="font-mono text-slate-500 mt-1 break-all text-[9px] leading-tight">
              {shoppingResponseId}
            </div>
          </details>
        )}

        {/* Search Criteria Summary */}
        {searchCriteria && (
          <div className="bg-slate-50 rounded-lg p-3 text-xs space-y-1">
            <div className="font-medium text-slate-700 mb-1">Search Criteria</div>
            <div className="flex justify-between">
              <span className="text-slate-500">Route</span>
              <span className="text-slate-700">{searchCriteria.origin} → {searchCriteria.destination}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Departure</span>
              <span className="text-slate-700">{searchCriteria.departureDate}</span>
            </div>
            {searchCriteria.returnDate && (
              <div className="flex justify-between">
                <span className="text-slate-500">Return</span>
                <span className="text-slate-700">{searchCriteria.returnDate}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-slate-500">Passengers</span>
              <span className="text-slate-700">
                {searchCriteria.passengers.adults} ADT
                {searchCriteria.passengers.children > 0 && `, ${searchCriteria.passengers.children} CHD`}
                {searchCriteria.passengers.infants > 0 && `, ${searchCriteria.passengers.infants} INF`}
              </span>
            </div>
            {searchCriteria.cabinClass && (
              <div className="flex justify-between">
                <span className="text-slate-500">Cabin</span>
                <span className="text-slate-700">{searchCriteria.cabinClass}</span>
              </div>
            )}
          </div>
        )}

        {/* Outbound Flight */}
        {selection.outbound && (
          <FlightSection
            direction="Outbound"
            selectionItem={selection.outbound}
            fareInfo={outboundFareInfo}
            passengers={searchCriteria?.passengers}
          />
        )}

        {/* Return Flight */}
        {selection.inbound && (
          <FlightSection
            direction="Return"
            selectionItem={selection.inbound}
            fareInfo={inboundFareInfo}
            passengers={searchCriteria?.passengers}
          />
        )}

        {/* Selected Services (SSRs & Extras) - EXCLUDE bundles since they're already in flight fare */}
        {selectedServices && selectedServices.length > 0 && (() => {
          // Filter out bundles - they are already included in flight prices and shown in FlightSection
          const nonBundleServices = selectedServices.filter(s => s.serviceType !== 'bundle');
          if (nonBundleServices.length === 0) return null;

          return (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-purple-100 flex items-center justify-center">
                <Package className="w-3 h-3 text-purple-600" />
              </div>
              <span className="text-sm font-semibold text-slate-900">Selected Extras</span>
            </div>

            <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 space-y-2">
              {/* Group seats by segment, other services by direction */}
              {(() => {
                const seatServices = nonBundleServices.filter(s => s.serviceType === 'seat');
                const otherServices = nonBundleServices.filter(s => s.serviceType !== 'seat');

                // Group seats by segment
                const seatsBySegment: Record<string, typeof seatServices> = {};
                seatServices.forEach(seat => {
                  const segmentKey = seat.segmentRefs && seat.segmentRefs.length > 0
                    ? seat.segmentRefs[0]
                    : (seat.direction || 'unknown');
                  if (!seatsBySegment[segmentKey]) {
                    seatsBySegment[segmentKey] = [];
                  }
                  seatsBySegment[segmentKey].push(seat);
                });

                // Group other services by direction
                const outboundServices = otherServices.filter(s => s.direction === 'outbound' || s.direction === 'both');
                const inboundServices = otherServices.filter(s => s.direction === 'inbound');

                return (
                  <>
                    {/* Seat selections grouped by segment */}
                    {Object.keys(seatsBySegment).length > 0 && (
                      <div className="space-y-2">
                        {Object.entries(seatsBySegment).map(([segmentKey, seats], segmentIdx) => (
                          <div key={segmentKey} className="space-y-1">
                            <div className="text-xs font-semibold text-purple-700">
                              {segmentIdx < 3 ? 'Outbound' : 'Return'} Segment {segmentIdx < 3 ? segmentIdx + 1 : segmentIdx - 2}
                            </div>
                            {seats.map((seat, idx) => {
                              const paxId = seat.paxRefIds && seat.paxRefIds.length > 0 ? seat.paxRefIds[0] : '';
                              return (
                                <div key={`${segmentKey}-${idx}`} className="flex justify-between text-xs">
                                  <span className="text-slate-700">
                                    {seat.serviceName || seat.serviceCode}
                                    {paxId && <span className="text-slate-500"> ({paxId})</span>}
                                  </span>
                                  <span className="font-medium text-slate-900">
                                    {formatCurrency(seat.price, seat.currency)}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Other services grouped by direction */}
                    {outboundServices.length > 0 && (
                      <div className="space-y-1">
                        {selection.inbound && (
                          <div className="text-xs font-medium text-purple-700">Outbound</div>
                        )}
                        {outboundServices.map((service, idx) => (
                          <div key={`out-${idx}`} className="flex justify-between text-xs">
                            <span className="text-slate-700">
                              {service.serviceName || service.serviceCode}
                              {service.quantity > 1 && <span className="text-slate-500"> x{service.quantity}</span>}
                            </span>
                            <span className="font-medium text-slate-900">
                              {formatCurrency(service.price * service.quantity, service.currency)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                    {inboundServices.length > 0 && (
                      <div className="space-y-1">
                        <div className="text-xs font-medium text-purple-700">Return</div>
                        {inboundServices.map((service, idx) => (
                          <div key={`in-${idx}`} className="flex justify-between text-xs">
                            <span className="text-slate-700">
                              {service.serviceName || service.serviceCode}
                              {service.quantity > 1 && <span className="text-slate-500"> x{service.quantity}</span>}
                            </span>
                            <span className="font-medium text-slate-900">
                              {formatCurrency(service.price * service.quantity, service.currency)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                );
              })()}

              {/* Services Subtotal - only non-bundle services */}
              <div className="pt-2 border-t border-purple-200 flex justify-between items-center">
                <span className="text-xs font-medium text-slate-700">Services Subtotal</span>
                <span className="text-sm font-bold text-purple-600">
                  {formatCurrency(nonBundleServices.reduce((sum, s) => sum + s.price * s.quantity, 0), currency)}
                </span>
              </div>
            </div>
          </div>
          );
        })()}

        {/* Grand Total */}
        {(() => {
          const nonBundleServicesTotal = selectedServices
            ? selectedServices.filter(s => s.serviceType !== 'bundle').reduce((sum, s) => sum + s.price * s.quantity, 0)
            : 0;

          const isVerified = verifiedTotal !== undefined && verifiedTotal > 0;
          const displayTotal = isVerified ? verifiedTotal : (grandTotal + nonBundleServicesTotal);

          return (
            <div className={cn(
              'rounded-lg p-3',
              isVerified ? 'bg-emerald-50 border border-emerald-200' : 'bg-slate-100'
            )}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {isVerified ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  ) : (
                    <CreditCard className="w-4 h-4 text-slate-500" />
                  )}
                  <span className={cn(
                    'text-sm font-medium',
                    isVerified ? 'text-emerald-700' : 'text-slate-600'
                  )}>
                    {isVerified ? 'Verified Total' : 'Estimated Total'}
                  </span>
                </div>
                <span className={cn(
                  'text-lg font-bold',
                  isVerified ? 'text-emerald-700' : 'text-slate-800'
                )}>
                  {formatCurrency(displayTotal, currency)}
                </span>
              </div>
            </div>
          );
        })()}

      </div>
    </div>
  );
}
