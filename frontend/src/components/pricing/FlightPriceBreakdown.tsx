import { useState, useEffect, useRef } from 'react';
import { cn } from '@/lib/cn';
import { formatCurrency } from '@/lib/format';
import { Card } from '@/components/ui';
import { ChevronDown, ChevronRight, AlertTriangle, CheckCircle } from 'lucide-react';

// Types matching backend parser output
export interface TaxFeeItem {
  code: string;
  name: string;
  amount: number;
  currency: string;
}

export interface PassengerPriceBreakdown {
  ptc: string;
  paxCount: number;
  baseFare: number;
  discountedBaseFare: number;
  surcharges: number;
  adjustments: number;
  publishedFare: number;
  taxes: TaxFeeItem[];
  fees: TaxFeeItem[];
  totalTaxesFees: number;
  total: number;
}

export interface FlightPriceBreakdown {
  flightNumber: number;
  route: string;
  segmentIds: string[];
  publishedFare: {
    label: string;
    baseFare: number;
    discountedBaseFare: number;
    surcharges: number;
    adjustments: number;
    total: number;
  };
  feesAndTaxes: TaxFeeItem[];
  totalFeesAndTaxes: number;
  flightTotal: number;
  currency: string;
  // Per-passenger breakdown from backend
  passengerBreakdown?: PassengerPriceBreakdown[];
}

// Price comparison data from AirShopping for mismatch detection
export interface AirShoppingPrice {
  route: string;
  // NOTE: AirShopping API doesn't provide separate base/tax breakdown
  // baseFare here is actually the TOTAL fare including taxes from the Offer
  // We keep this field for backward compatibility but should use flightTotal for comparison
  baseFare: number;           // Total fare (including taxes) from AirShopping Offer
  taxAmount?: number;         // Taxes from AirShopping (usually undefined - not provided by Jetstar)
  bundlePrice: number;        // Bundle upgrade price
  total: number;              // Total including bundle price (baseFare + bundlePrice)
  currency: string;
  // Flag to indicate if bundles are included in OfferPrice response
  // When true, compare using total; when false, compare using baseFare
  bundlesIncludedInOfferPrice?: boolean;
}

// Bundle selection info for display
export interface BundleSelection {
  flightNumber: number;
  route: string;
  journeyId?: string;  // Journey ID from NDC (e.g., fl1135788775)
  bundleName: string;
  bundleCode: string;
  pricePerPerson: number;  // Price per passenger
  paxBreakdown: {
    ptc: string;
    count: number;
    total: number;  // count × pricePerPerson (0 for INF)
  }[];
  totalBundlePrice: number;  // Sum of all pax totals
  currency: string;
}

// Selected service data for SSR/baggage display
export interface SelectedService {
  serviceId: string;
  serviceCode: string;
  serviceName: string;
  serviceType: string;
  price: number;
  quantity: number;
  currency: string;
  paxRefIds?: string[];
  segmentRefs?: string[];
  journeyRefIds?: string[];
  legRefIds?: string[];  // Leg references for meal services
  direction?: 'outbound' | 'inbound';
}

export interface FlightPriceBreakdownPanelProps {
  breakdowns: FlightPriceBreakdown[];
  airShoppingPrices?: AirShoppingPrice[];
  bundleSelections?: BundleSelection[];  // Bundle pricing per flight
  selectedServices?: SelectedService[];  // SSR/baggage services
  grandTotal: number;
  currency: string;
  className?: string;
  onMismatchDetected?: (mismatches: PriceMismatch[]) => void;
  // Flag to indicate if grandTotal already includes bundle costs
  // When true, don't add bundleSelections totals to grandTotal in display
  bundlesIncludedInGrandTotal?: boolean;
}

export interface PriceMismatch {
  flightNumber: number;
  route: string;
  field: string;
  airShoppingValue: number;
  offerPriceValue: number;
  difference: number;
  percentDiff: number;
}

export function FlightPriceBreakdownPanel({
  breakdowns,
  airShoppingPrices,
  bundleSelections,
  selectedServices,
  grandTotal,
  currency,
  className,
  onMismatchDetected,
  bundlesIncludedInGrandTotal = false,
}: FlightPriceBreakdownPanelProps) {
  const [expandedFlights, setExpandedFlights] = useState<Set<number>>(new Set([1]));

  // Detect price mismatches between AirShopping and OfferPrice
  // Use a ref to track if we've already notified to prevent infinite loops
  const hasNotifiedRef = useRef(false);

  const mismatches: PriceMismatch[] = [];
  if (airShoppingPrices && airShoppingPrices.length > 0) {
    breakdowns.forEach((breakdown, idx) => {
      const airPrice = airShoppingPrices[idx];
      if (airPrice) {
        // ============================================================================
        // CRITICAL FIX (2026-01-09): False price mismatch warnings
        // ============================================================================
        // IMPORTANT: AirShopping API (Jetstar NDC) does NOT provide separate base/tax breakdown
        // airPrice.baseFare is the TOTAL fare including taxes from AirShopping (NO bundle)
        // airPrice.total includes baseFare + bundlePrice
        //
        // BUG: Was comparing airPrice.total (with bundle) vs breakdown.flightTotal (without bundle)
        // This caused false "Price Differences" warnings showing -12.8%, -4.4% differences
        // The "differences" were just the bundle costs, not actual pricing errors
        //
        // ROOT CAUSE: Jetstar's OfferPrice ALWAYS returns flight totals WITHOUT bundles
        // Bundles are shown in a separate "Selected Bundles" section in the OfferPrice response
        // But the code was checking bundlesIncludedInOfferPrice flag and comparing against
        // airPrice.total when true, which included bundle costs
        //
        // FIX: ALWAYS compare flight totals WITHOUT bundles (apples-to-apples comparison)
        // - AirShopping: airPrice.baseFare (fare + taxes, NO bundle)
        // - OfferPrice:  breakdown.flightTotal (fare + taxes, NO bundle)
        //
        // The bundlesIncludedInOfferPrice flag just indicates if bundles were sent in the
        // OfferPrice request, NOT whether they're included in the flight total response
        //
        // DO NOT change this back to using airPrice.total - it will show false mismatches!
        // ============================================================================

        // Always compare flight total without bundles (Jetstar returns bundles separately)
        const airShoppingFlightTotal = airPrice.baseFare;  // Fare only (no bundle)
        const offerPriceFlightTotal = breakdown.flightTotal;
        const totalDiff = Math.abs(offerPriceFlightTotal - airShoppingFlightTotal);

        // Allow small tolerance for rounding differences (up to $0.10)
        if (totalDiff > 0.10 && airShoppingFlightTotal > 0) {
          mismatches.push({
            flightNumber: breakdown.flightNumber,
            route: breakdown.route,
            field: 'Flight Total',
            airShoppingValue: airShoppingFlightTotal,
            offerPriceValue: offerPriceFlightTotal,
            difference: offerPriceFlightTotal - airShoppingFlightTotal,
            percentDiff: airShoppingFlightTotal > 0
              ? ((offerPriceFlightTotal - airShoppingFlightTotal) / airShoppingFlightTotal) * 100
              : 0,
          });
        }

        // Only check tax breakdown if AirShopping actually provides it (rare for Jetstar)
        if (airPrice.taxAmount !== undefined && airPrice.taxAmount > 0) {
          const taxDiff = Math.abs(breakdown.totalFeesAndTaxes - airPrice.taxAmount);
          if (taxDiff > 0.10) {
            mismatches.push({
              flightNumber: breakdown.flightNumber,
              route: breakdown.route,
              field: 'Taxes & Fees',
              airShoppingValue: airPrice.taxAmount,
              offerPriceValue: breakdown.totalFeesAndTaxes,
              difference: breakdown.totalFeesAndTaxes - airPrice.taxAmount,
              percentDiff: airPrice.taxAmount > 0
                ? ((breakdown.totalFeesAndTaxes - airPrice.taxAmount) / airPrice.taxAmount) * 100
                : 0,
            });
          }
        }
      }
    });
  }

  // Notify parent of mismatches via useEffect to prevent infinite render loop
  useEffect(() => {
    if (mismatches.length > 0 && onMismatchDetected && !hasNotifiedRef.current) {
      hasNotifiedRef.current = true;
      onMismatchDetected(mismatches);
    }
  }, [mismatches.length]); // Only re-run when mismatch count changes

  const toggleFlight = (flightNumber: number) => {
    setExpandedFlights(prev => {
      const next = new Set(prev);
      if (next.has(flightNumber)) {
        next.delete(flightNumber);
      } else {
        next.add(flightNumber);
      }
      return next;
    });
  };

  const hasMismatches = mismatches.length > 0;

  return (
    <Card className={cn('overflow-hidden', className)}>
      {/* Header */}
      <div className="bg-slate-50 border-b border-slate-200 px-4 py-3">
        <h3 className="font-semibold text-slate-900 flex items-center gap-2">
          Flight Price Breakdown
          {hasMismatches ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-700 rounded-full">
              <AlertTriangle className="w-3 h-3" />
              Price Note{mismatches.length > 1 ? 's' : ''}
            </span>
          ) : breakdowns.length > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-emerald-100 text-emerald-700 rounded-full">
              <CheckCircle className="w-3 h-3" />
              Verified
            </span>
          )}
        </h3>
      </div>

      {/* Table header - dynamically show all passenger types */}
      {(() => {
        // Collect all unique PTCs with their counts from first breakdown
        const paxColumns: { ptc: string; count: number }[] = [];
        if (breakdowns.length > 0 && breakdowns[0].passengerBreakdown) {
          for (const pax of breakdowns[0].passengerBreakdown) {
            paxColumns.push({ ptc: pax.ptc, count: pax.paxCount });
          }
        }
        // Fallback if no breakdown data
        if (paxColumns.length === 0) {
          paxColumns.push({ ptc: 'ADT', count: 1 });
        }

        return (
          <div className="bg-slate-100 border-b border-slate-200">
            <div className="grid px-4 py-2 text-xs font-semibold text-slate-600 uppercase tracking-wider"
                 style={{ gridTemplateColumns: `1fr ${paxColumns.map(() => '100px').join(' ')} 120px` }}>
              <div>Description</div>
              {paxColumns.map(({ ptc, count }) => (
                <div key={ptc} className="text-right">{ptc} ({count})</div>
              ))}
              <div className="text-right">Total</div>
            </div>
          </div>
        );
      })()}

      {/* Flight breakdowns */}
      <div className="divide-y divide-slate-200">
        {breakdowns.map((flight) => (
          <FlightBreakdownRow
            key={flight.flightNumber}
            breakdown={flight}
            airShoppingPrice={airShoppingPrices?.[flight.flightNumber - 1]}
            isExpanded={expandedFlights.has(flight.flightNumber)}
            onToggle={() => toggleFlight(flight.flightNumber)}
            mismatches={mismatches.filter(m => m.flightNumber === flight.flightNumber)}
          />
        ))}
      </div>

      {/* Bundle/Service Selections Section - Always show when bundles are selected for visibility */}
      {/* Note: When bundlesIncludedInGrandTotal is true, bundles ARE priced in the fare totals above */}
      {bundleSelections && bundleSelections.length > 0 && (() => {
        // Get pax columns from first breakdown
        const paxColumns: { ptc: string; count: number }[] = [];
        if (breakdowns.length > 0 && breakdowns[0].passengerBreakdown) {
          for (const pax of breakdowns[0].passengerBreakdown) {
            paxColumns.push({ ptc: pax.ptc, count: pax.paxCount });
          }
        }
        if (paxColumns.length === 0) {
          paxColumns.push({ ptc: 'ADT', count: 1 });
        }
        const gridCols = `1fr ${paxColumns.map(() => '100px').join(' ')} 120px`;

        // Calculate total bundle cost across all flights
        const totalBundleCost = bundleSelections.reduce((sum, b) => sum + b.totalBundlePrice, 0);

        // Calculate per-pax bundle totals
        const paxBundleTotals = new Map<string, number>();
        for (const bundle of bundleSelections) {
          for (const pax of bundle.paxBreakdown) {
            paxBundleTotals.set(pax.ptc, (paxBundleTotals.get(pax.ptc) || 0) + pax.total);
          }
        }

        return (
          <div className="border-t-2 border-orange-200">
            {/* Bundle section header */}
            <div className="bg-orange-50 border-b border-orange-200 px-4 py-2">
              <h4 className="font-semibold text-orange-800 flex items-center gap-2">
                <ChevronDown className="w-4 h-4" />
                Selected Bundles
                {bundlesIncludedInGrandTotal && (
                  <span className="text-xs font-normal text-orange-600 bg-orange-100 px-2 py-0.5 rounded">
                    Included in fare above
                  </span>
                )}
              </h4>
            </div>

            {/* Individual bundle rows */}
            <div className="divide-y divide-slate-100">
              {bundleSelections.map((bundle) => (
                <div key={bundle.flightNumber} className="px-4 py-2 bg-orange-50/30">
                  <div className="grid text-sm" style={{ gridTemplateColumns: gridCols }}>
                    <div className="text-slate-700">
                      <span className="font-medium">{bundle.bundleName}</span>
                      <span className="text-slate-500 ml-2">({bundle.bundleCode})</span>
                      <span className="text-slate-400 ml-2">
                        - Journey {bundle.route}
                        {bundle.journeyId && ` (${bundle.journeyId})`}
                      </span>
                    </div>
                    {paxColumns.map(({ ptc }) => {
                      const paxBundle = bundle.paxBreakdown.find(p => p.ptc === ptc);
                      const amount = paxBundle?.total || 0;
                      return (
                        <div key={ptc} className="text-right text-orange-600">
                          {amount > 0 ? formatCurrency(amount, bundle.currency) : '-'}
                        </div>
                      );
                    })}
                    <div className="text-right text-orange-600 font-medium">
                      {formatCurrency(bundle.totalBundlePrice, bundle.currency)}
                    </div>
                  </div>
                  {/* Per-person price note */}
                  <div className="text-xs text-slate-500 mt-1">
                    {formatCurrency(bundle.pricePerPerson, bundle.currency)} per person (ADT/CHD only)
                  </div>
                </div>
              ))}
            </div>

            {/* Bundle subtotal */}
            <div className="bg-orange-100 px-4 py-2 border-t border-orange-200">
              <div className="grid font-medium text-orange-800" style={{ gridTemplateColumns: gridCols }}>
                <div>
                  Total Bundles
                  {bundlesIncludedInGrandTotal && (
                    <span className="text-xs font-normal ml-2">(already in fare)</span>
                  )}
                </div>
                {paxColumns.map(({ ptc }) => (
                  <div key={ptc} className="text-right">
                    {formatCurrency(paxBundleTotals.get(ptc) || 0, bundleSelections?.[0]?.currency || currency)}
                  </div>
                ))}
                <div className="text-right">{formatCurrency(totalBundleCost, bundleSelections?.[0]?.currency || currency)}</div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* SSR/Baggage Services Section - Show selected extras with segment/journey details */}
      {selectedServices && selectedServices.length > 0 && (() => {
        // Filter out bundles (bundles are already shown in bundle section)
        const nonBundleServices = selectedServices.filter(s => s.serviceType !== 'bundle');

        // Calculate total services cost
        const totalServicesCost = nonBundleServices.reduce((sum, s) => sum + (s.price * s.quantity), 0);

        // Group services by type (seats vs other services)
        const seatServices = nonBundleServices.filter(s => s.serviceType === 'seat');
        const otherServices = nonBundleServices.filter(s => s.serviceType !== 'seat');

        // Group seats by segment for better display
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

        return (
          <div className="border-t-2 border-purple-200">
            {/* Services section header */}
            <div className="bg-purple-50 border-b border-purple-200 px-4 py-2">
              <h4 className="font-semibold text-purple-800 flex items-center gap-2">
                <ChevronDown className="w-4 h-4" />
                Selected Extras
              </h4>
            </div>

            {/* Seat selections grouped by segment */}
            {Object.keys(seatsBySegment).length > 0 && (
              <div className="divide-y divide-slate-200">
                {Object.entries(seatsBySegment).map(([segmentKey, seats], segmentIdx) => {
                  const segmentTotal = seats.reduce((sum, s) => sum + s.price, 0);

                  // Find segment info from breakdowns
                  let segmentLabel = segmentKey;
                  let flightNumber = segmentIdx + 1;

                  // Try to match segment ID with breakdown data
                  for (const bd of breakdowns) {
                    if (bd.segmentIds.includes(segmentKey) || bd.segmentIds.some(sid => sid.includes(segmentKey))) {
                      segmentLabel = `${bd.route} (Flight ${bd.flightNumber})`;
                      flightNumber = bd.flightNumber;
                      break;
                    }
                  }

                  // If no match found in breakdowns, create a readable label from segment index
                  if (segmentLabel === segmentKey) {
                    // Determine if outbound or return based on segment index
                    const direction = segmentIdx < 3 ? 'Outbound' : 'Return';
                    const segmentNum = segmentIdx < 3 ? segmentIdx + 1 : segmentIdx - 2;
                    segmentLabel = `${direction} Segment ${segmentNum} (Flight ${flightNumber})`;
                  }

                  return (
                    <div key={segmentKey} className="bg-white">
                      {/* Segment header */}
                      <div className="bg-slate-100 px-4 py-2 border-b border-slate-200">
                        <div className="flex justify-between items-center">
                          <span className="font-medium text-slate-700 text-sm">{segmentLabel}</span>
                          <span className="text-slate-600 text-sm">{seats.length} seat{seats.length > 1 ? 's' : ''}</span>
                        </div>
                      </div>

                      {/* Seat rows */}
                      <div className="divide-y divide-slate-100">
                        {seats.map((seat, idx) => {
                          const paxId = seat.paxRefIds && seat.paxRefIds.length > 0 ? seat.paxRefIds[0] : 'Unknown';

                          return (
                            <div key={`${seat.serviceId}-${idx}`} className="px-4 py-2 bg-purple-50/20 hover:bg-purple-50/40">
                              <div className="flex justify-between items-center text-sm">
                                <div className="text-slate-700">
                                  <span className="font-medium">{seat.serviceName}</span>
                                  <span className="text-slate-500 ml-2">({seat.serviceCode})</span>
                                  <span className="text-slate-600 ml-2">• Passenger: {paxId}</span>
                                </div>
                                <div className="text-purple-600 font-medium">
                                  {formatCurrency(seat.price, seat.currency)}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Segment subtotal */}
                      <div className="bg-slate-50 px-4 py-2 border-t border-slate-200">
                        <div className="flex justify-between items-center text-sm">
                          <span className="text-slate-600">Segment Total</span>
                          <span className="text-purple-700 font-medium">{formatCurrency(segmentTotal, seats[0].currency)}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Other services (non-seats) */}
            {otherServices.length > 0 && (
              <div className="divide-y divide-slate-100">
                {otherServices.map((service, idx) => {
                  // Determine segment/journey/leg info for display
                  const hasSegmentRefs = service.segmentRefs && service.segmentRefs.length > 0;
                  const hasJourneyRefs = service.journeyRefIds && service.journeyRefIds.length > 0;
                  const legRefs = service.legRefIds || (service as any).legRefs;
                  const hasLegRefs = legRefs && legRefs.length > 0;

                  let flightInfo = '';
                  if (hasSegmentRefs) {
                    flightInfo = `Segment ${service.segmentRefs!.join(', ')}`;
                  } else if (hasLegRefs) {
                    flightInfo = `Leg ${legRefs!.join(', ')}`;
                  } else if (hasJourneyRefs) {
                    flightInfo = `Journey ${service.journeyRefIds!.join(', ')}`;
                  } else if (service.direction) {
                    flightInfo = service.direction === 'outbound' ? 'Outbound' : 'Inbound';
                  }

                  const serviceTotal = service.price * service.quantity;
                  const paxCount = service.paxRefIds ? service.paxRefIds.length : 0;

                  return (
                    <div key={`${service.serviceId}-${idx}`} className="px-4 py-2 bg-purple-50/30">
                      <div className="flex justify-between items-center text-sm">
                        <div className="text-slate-700">
                          <span className="font-medium">{service.serviceName}</span>
                          <span className="text-slate-500 ml-2">({service.serviceCode})</span>
                          {paxCount > 0 && (
                            <span className="text-slate-600 ml-2">× {paxCount} pax</span>
                          )}
                          {flightInfo && (
                            <span className="text-slate-400 ml-2">- {flightInfo}</span>
                          )}
                        </div>
                        <div className="text-purple-600 font-medium">
                          {formatCurrency(serviceTotal, service.currency)}
                        </div>
                      </div>
                      {paxCount > 0 && (
                        <div className="text-xs text-slate-500 mt-1">
                          {formatCurrency(service.price, service.currency)} × {paxCount} passengers
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Services subtotal */}
            <div className="bg-purple-100 px-4 py-2 border-t-2 border-purple-200">
              <div className="flex justify-between items-center font-medium text-purple-800">
                <div>Total Extras</div>
                <div>{formatCurrency(totalServicesCost, nonBundleServices[0]?.currency || currency)}</div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Grand total - with per-pax columns (including bundles and services) */}
      {(() => {
        // Collect all unique PTCs with counts from first breakdown
        const paxColumns: { ptc: string; count: number }[] = [];
        if (breakdowns.length > 0 && breakdowns[0].passengerBreakdown) {
          for (const pax of breakdowns[0].passengerBreakdown) {
            paxColumns.push({ ptc: pax.ptc, count: pax.paxCount });
          }
        }
        if (paxColumns.length === 0) {
          paxColumns.push({ ptc: 'ADT', count: 1 });
        }

        // Calculate per-pax flight totals
        const paxFlightTotals = new Map<string, number>();
        for (const flight of breakdowns) {
          for (const pax of flight.passengerBreakdown || []) {
            paxFlightTotals.set(pax.ptc, (paxFlightTotals.get(pax.ptc) || 0) + pax.total);
          }
        }

        // Calculate per-pax bundle totals
        const paxBundleTotals = new Map<string, number>();
        if (bundleSelections) {
          for (const bundle of bundleSelections) {
            for (const pax of bundle.paxBreakdown) {
              paxBundleTotals.set(pax.ptc, (paxBundleTotals.get(pax.ptc) || 0) + pax.total);
            }
          }
        }

        // Calculate services total (non-bundle services only)
        const nonBundleServices = selectedServices?.filter(s => s.serviceType !== 'bundle') || [];
        const totalServicesCost = nonBundleServices.reduce((sum, s) => sum + (s.price * s.quantity), 0);

        // Combined totals - only add bundles if NOT already included in grandTotal
        const paxGrandTotals = new Map<string, number>();
        for (const ptc of paxColumns.map(p => p.ptc)) {
          const flightTotal = paxFlightTotals.get(ptc) || 0;
          const bundleTotal = bundlesIncludedInGrandTotal ? 0 : (paxBundleTotals.get(ptc) || 0);
          paxGrandTotals.set(ptc, flightTotal + bundleTotal);
        }

        // Total bundle cost - only add if NOT already included in grandTotal
        const totalBundleCost = bundleSelections?.reduce((sum, b) => sum + b.totalBundlePrice, 0) || 0;
        const displayGrandTotal = bundlesIncludedInGrandTotal ? grandTotal : grandTotal + totalBundleCost;

        // IMPORTANT: Services (baggage/SSR) are already included in grandTotal from OfferPrice
        // The grandTotal parameter comes from OfferPrice response which includes flights + bundles + services
        // So we DON'T add totalServicesCost here to avoid double-counting
        const displayGrandTotalWithServices = displayGrandTotal;

        // Use currency from breakdowns or bundleSelections, not the parent currency prop
        // This fixes issue where OfferPrice returns currency="AUD" at top level but items have correct currency
        const displayCurrency = breakdowns[0]?.currency || bundleSelections?.[0]?.currency || currency;

        const gridCols = `1fr ${paxColumns.map(() => '100px').join(' ')} 120px`;

        return (
          <div className="bg-slate-800 text-white px-4 py-3">
            <div className="grid" style={{ gridTemplateColumns: gridCols }}>
              <div className="font-bold">Grand Total</div>
              {paxColumns.map(({ ptc }) => (
                <div key={ptc} className="text-right font-bold">
                  {formatCurrency(paxGrandTotals.get(ptc) || 0, displayCurrency)}
                </div>
              ))}
              <div className="text-right font-bold">{formatCurrency(displayGrandTotalWithServices, displayCurrency)}</div>
            </div>
          </div>
        );
      })()}

      {/* Mismatch Alert */}
      {hasMismatches && (
        <div className="bg-blue-50 border-t border-blue-200 px-4 py-3">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-blue-800">Price Differences Between Estimates and Final Pricing</p>
              <p className="text-sm text-blue-700 mt-1">
                AirShopping provides quick fare estimates. OfferPrice calculates binding prices with complete taxes and fees. Differences are normal:
              </p>
              <ul className="mt-2 space-y-1">
                {mismatches.map((m, idx) => (
                  <li key={idx} className="text-sm text-amber-700">
                    <strong>Flight {m.flightNumber} ({m.route})</strong> - {m.field}:{' '}
                    AirShopping {formatCurrency(m.airShoppingValue, currency)} vs{' '}
                    OfferPrice {formatCurrency(m.offerPriceValue, currency)}{' '}
                    <span className={cn(
                      'font-medium',
                      m.difference > 0 ? 'text-red-600' : 'text-green-600'
                    )}>
                      ({m.difference > 0 ? '+' : ''}{formatCurrency(m.difference, currency)}, {m.percentDiff.toFixed(1)}%)
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

// Individual flight breakdown row
interface FlightBreakdownRowProps {
  breakdown: FlightPriceBreakdown;
  airShoppingPrice?: AirShoppingPrice;
  isExpanded: boolean;
  onToggle: () => void;
  mismatches: PriceMismatch[];
}

function FlightBreakdownRow({
  breakdown,
  airShoppingPrice: _airShoppingPrice, // Reserved for future AirShopping comparison display
  isExpanded,
  onToggle,
  mismatches,
}: FlightBreakdownRowProps) {
  const { flightNumber, route, publishedFare, feesAndTaxes, totalFeesAndTaxes, flightTotal, currency, passengerBreakdown } = breakdown;
  const hasMismatch = mismatches.length > 0;

  // Build pax columns from breakdown data
  const paxColumns = passengerBreakdown && passengerBreakdown.length > 0
    ? passengerBreakdown.map(p => ({ ptc: p.ptc, count: p.paxCount }))
    : [{ ptc: 'ADT', count: 1 }];

  // Dynamic grid template based on number of pax types
  const gridCols = `1fr ${paxColumns.map(() => '100px').join(' ')} 120px`;

  // Helper to get value for a specific passenger type
  // All fields (baseFare, publishedFare, totalTaxesFees, total) are ALREADY TOTALS
  // for all passengers of that type (accumulated by backend parser)
  const getPaxValue = (ptc: string, field: 'baseFare' | 'publishedFare' | 'totalTaxesFees' | 'total'): number => {
    const pax = passengerBreakdown?.find(p => p.ptc === ptc);
    if (!pax) return 0;
    return pax[field] || 0;
  };

  return (
    <div className={cn(hasMismatch && 'bg-amber-50/50')}>
      {/* Flight header - collapsible */}
      <button
        onClick={onToggle}
        className={cn(
          'w-full px-4 py-2 flex items-center justify-between hover:bg-slate-50 transition-colors text-left',
          hasMismatch && 'hover:bg-amber-100/50'
        )}
      >
        <div className="flex items-center gap-2">
          {isExpanded ? (
            <ChevronDown className="w-4 h-4 text-slate-400" />
          ) : (
            <ChevronRight className="w-4 h-4 text-slate-400" />
          )}
          <span className="font-bold text-sky-600">Flight {flightNumber} ({route})</span>
          {hasMismatch && (
            <AlertTriangle className="w-4 h-4 text-amber-500" />
          )}
        </div>
        <span className="font-bold text-slate-900">{formatCurrency(flightTotal, currency)}</span>
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div className="border-l-4 border-sky-200 ml-4">
          {/* Published Fare Section */}
          <div className="border-b border-slate-100">
            <div className="px-4 py-2 bg-slate-50/50">
              <button className="w-full flex items-center gap-2 text-sm font-medium text-slate-700">
                <ChevronDown className="w-3 h-3" />
                Published Fare (may include some fees and taxes)
              </button>
            </div>

            {/* Fare details - now with per-pax columns */}
            <div className="px-8 py-1 space-y-1 text-sm">
              <div className="grid text-slate-600" style={{ gridTemplateColumns: gridCols }}>
                <div className="pl-4">{publishedFare.label || `${flightNumber} ${route} Published Fare:`}</div>
                {paxColumns.map(({ ptc }) => (
                  <div key={ptc} className="text-right">{formatCurrency(getPaxValue(ptc, 'baseFare'), currency)}</div>
                ))}
                <div className="text-right">{formatCurrency(publishedFare.baseFare, currency)}</div>
              </div>
              <div className="grid text-slate-600" style={{ gridTemplateColumns: gridCols }}>
                <div className="pl-4">Base Fare:</div>
                {paxColumns.map(({ ptc }) => (
                  <div key={ptc} className="text-right">{formatCurrency(getPaxValue(ptc, 'baseFare'), currency)}</div>
                ))}
                <div className="text-right">{formatCurrency(publishedFare.baseFare, currency)}</div>
              </div>
              <div className="grid text-slate-600" style={{ gridTemplateColumns: gridCols }}>
                <div className="pl-4">Discounted Base Fare</div>
                {paxColumns.map(({ ptc }) => (
                  <div key={ptc} className="text-right">{formatCurrency(getPaxValue(ptc, 'baseFare'), currency)}</div>
                ))}
                <div className="text-right">{formatCurrency(publishedFare.discountedBaseFare, currency)}</div>
              </div>
              {publishedFare.surcharges > 0 && (
                <div className="grid text-slate-600" style={{ gridTemplateColumns: gridCols }}>
                  <div className="pl-4 flex items-center gap-1">
                    <ChevronRight className="w-3 h-3" />
                    Surcharges
                  </div>
                  {paxColumns.map(({ ptc }) => (
                    <div key={ptc} className="text-right text-sky-600">-</div>
                  ))}
                  <div className="text-right text-sky-600">{formatCurrency(publishedFare.surcharges, currency)}</div>
                </div>
              )}
              {publishedFare.adjustments !== 0 && (
                <div className="grid text-slate-600" style={{ gridTemplateColumns: gridCols }}>
                  <div className="pl-4 flex items-center gap-1">
                    <ChevronRight className="w-3 h-3" />
                    Adjustments
                  </div>
                  {paxColumns.map(({ ptc }) => (
                    <div key={ptc} className="text-right text-sky-600">-</div>
                  ))}
                  <div className="text-right text-sky-600">{formatCurrency(publishedFare.adjustments, currency)}</div>
                </div>
              )}
              <div className="grid text-slate-500 bg-slate-50 py-1 -mx-4 px-4" style={{ gridTemplateColumns: gridCols }}>
                <div className="pl-4">Total Published Fare (may include some fees and taxes)</div>
                {paxColumns.map(({ ptc }) => (
                  <div key={ptc} className="text-right text-sky-600">{formatCurrency(getPaxValue(ptc, 'publishedFare'), currency)}</div>
                ))}
                <div className="text-right text-sky-600">{formatCurrency(publishedFare.total, currency)}</div>
              </div>
            </div>
          </div>

          {/* Fees and Taxes Section */}
          <div>
            <div className="px-4 py-2 bg-slate-50/50">
              <button className="w-full flex items-center gap-2 text-sm font-medium text-slate-700">
                <ChevronDown className="w-3 h-3" />
                Fees and Taxes
              </button>
            </div>

            {/* Individual tax/fee items */}
            <div className="px-8 py-1 space-y-1 text-sm">
              {feesAndTaxes.map((item, idx) => (
                <div key={idx} className="grid text-slate-600" style={{ gridTemplateColumns: gridCols }}>
                  <div className="pl-4">{item.code} - {item.name}</div>
                  {paxColumns.map(({ ptc }) => (
                    <div key={ptc} className="text-right">-</div>
                  ))}
                  <div className="text-right">{formatCurrency(item.amount, item.currency)}</div>
                </div>
              ))}

              {feesAndTaxes.length === 0 && (
                <div className="text-slate-400 italic pl-4">No itemized fees/taxes available</div>
              )}

              {/* Total Fees and Taxes */}
              <div className="grid text-slate-500 bg-slate-50 py-1 -mx-4 px-4 mt-2" style={{ gridTemplateColumns: gridCols }}>
                <div className="pl-4">Total Fees and Taxes</div>
                {paxColumns.map(({ ptc }) => (
                  <div key={ptc} className="text-right text-sky-600">{formatCurrency(getPaxValue(ptc, 'totalTaxesFees'), currency)}</div>
                ))}
                <div className="text-right text-sky-600">{formatCurrency(totalFeesAndTaxes, currency)}</div>
              </div>
            </div>
          </div>

          {/* Flight Total */}
          <div className="bg-sky-50 border-t border-sky-100">
            <div className="grid px-4 py-2 font-bold text-sky-700" style={{ gridTemplateColumns: gridCols }}>
              <div>Total Flight {flightNumber} ({route})</div>
              {paxColumns.map(({ ptc }) => (
                <div key={ptc} className="text-right">{formatCurrency(getPaxValue(ptc, 'total'), currency)}</div>
              ))}
              <div className="text-right">{formatCurrency(flightTotal, currency)}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default FlightPriceBreakdownPanel;
