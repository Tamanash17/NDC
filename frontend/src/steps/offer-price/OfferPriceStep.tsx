import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useWorkflow } from '@/core/engines';
import { useXmlViewer } from '@/core/context/XmlViewerContext';
import { useFlightSelectionStore } from '@/hooks/useFlightSelection';
import { useDistributionContext } from '@/core/context/SessionStore';
import { offerPrice } from '@/lib/ndc-api';
import { parseOfferPriceResponse, createPriceSnapshot } from '@/lib/parsers';
import { annotateXml, type AnnotationContext, type OfferContext, type ServiceContext } from '@/lib/xml-annotator';
import { TransactionLogger, formatPriceTable, type PriceBreakdownRow } from '@/lib/transaction-logger';
import { Card, Button, Alert, Badge } from '@/components/ui';
import { PriceComparisonPanel, FlightPriceBreakdownPanel, type PriceMismatch, type AirShoppingPrice, type BundleSelection } from '@/components/pricing';
import { DollarSign, Clock, Loader2, CheckCircle, AlertTriangle, ArrowUpRight, ArrowDownRight, Equal, Package, ArrowLeft, ChevronRight } from 'lucide-react';
import { formatCurrency } from '@/lib/format';
import { createLogger } from '@/utils/debug-logger';

/**
 * Extract the embedded response ID (UUID) from a Jetstar offer ID.
 * Jetstar embeds the shoppingResponseId in the offer ID itself.
 *
 * Formats:
 * - 908074475_id-e237a20b-70c7-43d5-8c3a-8be03fdb919b-o-3
 * - id-v2-e237a20b-70c7-43d5-8c3a-8be03fdb919b-o-3
 *
 * Returns the UUID part (e.g., "e237a20b-70c7-43d5-8c3a-8be03fdb919b")
 */
function extractEmbeddedResponseId(offerId: string): string | null {
  // Pattern 1: 908074475_id-{uuid}-o-{n}
  const pattern1 = /id-([a-f0-9-]{36})-o-/i;
  // Pattern 2: id-v2-{uuid}-o-{n}
  const pattern2 = /id-v2-([a-f0-9-]{36})-o-/i;

  let match = offerId.match(pattern2) || offerId.match(pattern1);
  return match ? match[1].toLowerCase() : null;
}

/**
 * Check if two offers share the same embedded response ID.
 * If they do, they can be combined in a single OfferPrice call.
 * If not (Mixed mode with separate searches), they need separate calls.
 */
function offersShareResponseId(outboundOfferId: string, inboundOfferId: string): boolean {
  const outboundUuid = extractEmbeddedResponseId(outboundOfferId);
  const inboundUuid = extractEmbeddedResponseId(inboundOfferId);

  console.log('[OfferPriceStep] Comparing embedded response IDs:');
  console.log('  Outbound offer:', outboundOfferId, '-> UUID:', outboundUuid);
  console.log('  Inbound offer:', inboundOfferId, '-> UUID:', inboundUuid);

  if (!outboundUuid || !inboundUuid) {
    console.log('  Could not extract UUID from one or both offers');
    return false;
  }

  const match = outboundUuid === inboundUuid;
  console.log('  UUIDs match:', match);
  return match;
}

// Type for per-item paxRefIds - extended for a la carte items
interface OfferItemWithPax {
  offerItemId: string;
  paxRefIds: string[];
  // A la carte properties for ancillaries/SSRs
  isALaCarte?: boolean;
  quantity?: number;
  associationType?: 'segment' | 'journey' | 'leg';
  segmentRefIds?: string[];
  journeyRefIds?: string[];
  legRefIds?: string[];
  // Service type for identifying seats
  serviceType?: string;
  // Seat-specific fields for OfferPrice <SelectedSeat> element
  seatRow?: string;
  seatColumn?: string;
}

// Type for selected service from ServiceList
interface SelectedServiceForOfferPrice {
  serviceId: string;
  serviceCode: string;
  serviceName: string;
  serviceType: string;
  quantity: number;
  price: number;
  currency: string;
  offerId: string;
  offerItemId: string;
  paxRefIds: string[];
  associationType: 'segment' | 'journey' | 'leg' | 'unknown';
  segmentRefs?: string[];
  journeyRefs?: string[];
  legRefs?: string[];
  direction: 'outbound' | 'inbound' | 'both';
  seatRow?: string;
  seatColumn?: string;
}

/**
 * Build offerItems for FLIGHT FARE offers only (base fares, no bundles).
 * Bundles are a la carte items and must go in ALaCarteOffer with PaxJourneyRef.
 * Per Jetstar Postman: base fares go in flight offer, bundles go in ALaCarteOffer.
 */
function buildFlightFareItems(
  offerItemsWithPax: OfferItemWithPax[] | undefined
): OfferItemWithPax[] {
  const items: OfferItemWithPax[] = [];

  // Add ONLY base fare items - these are NOT a la carte
  // Bundles must be handled separately via ALaCarteOffer with PaxJourneyRef
  if (offerItemsWithPax && offerItemsWithPax.length > 0) {
    // Filter out any items already marked as a la carte (shouldn't be here but safety check)
    const fareItems = offerItemsWithPax.filter(item => !item.isALaCarte);
    items.push(...fareItems);
  }

  console.log('[OfferPriceStep] Built flight FARE items (no bundles):', items);
  return items;
}

/**
 * Build bundle a la carte items with PaxJourneyRef associations.
 * Per Jetstar Postman: bundles need SelectedALaCarteOfferItem with PaxJourneyRef.
 *
 * IMPORTANT: Bundles have DIFFERENT offerItemIds per passenger type (ADT, CHD, INF).
 * We must use paxOfferItemIds to get the correct ID for each passenger.
 *
 * CRITICAL: Per Postman script, each passenger gets its OWN SelectedOfferItem:
 * - ONE <PaxRefID> per <SelectedOfferItem>
 * - Journey ref MUST be included inside <SelectedALaCarteOfferItem>
 * - Structure: <SelectedOfferItem><OfferItemRefID/><PaxRefID/><SelectedALaCarteOfferItem>...</SelectedALaCarteOfferItem></SelectedOfferItem>
 */
function buildBundleALaCarteItems(
  bundleId: string,
  offerId: string,
  paxRefIds: string[] | undefined,
  journeyRefIds: string[] | undefined,
  paxOfferItemIds?: Record<string, string>
): OfferItemWithPax[] {
  const items: OfferItemWithPax[] = [];

  // SYNTHETIC BUNDLE CHECK:
  // Synthetic bundles are UI-only constructs created when no real bundle is selected.
  // They look like: "{flightOfferId}-bundle" (e.g., "id-v2-abc123-bundle")
  // Real bundles from ALaCarteOffer look like: "id-v2-xxx-yyy-N" (numeric suffix)
  // Bundle swaps from ServiceList also have numeric suffixes.
  //
  // The OLD check `bundleId.startsWith(offerId + '-')` was WRONG because:
  // - For bundle swaps, offerId is the ALaCarteOffer ID (e.g., "id-v2-xxx-yyy")
  // - bundleId is the OfferItemID (e.g., "id-v2-xxx-yyy-5") which DOES start with offerId!
  // This incorrectly filtered out real bundle swaps.
  //
  // NEW check: Only skip if bundleId ends with "-bundle" (the literal synthetic pattern)
  const isSyntheticBundle = bundleId.endsWith('-bundle');

  // Synthetic bundles (bundleId = offerId-bundle) are just UI constructs, skip them
  if (isSyntheticBundle) {
    console.log('[OfferPriceStep] Skipping synthetic bundle:', bundleId);
    return items;
  }

  if (!paxRefIds || paxRefIds.length === 0) {
    console.warn('[OfferPriceStep] No paxRefIds for bundle:', bundleId);
    return items;
  }

  if (!journeyRefIds || journeyRefIds.length === 0) {
    console.warn('[OfferPriceStep] No journeyRefIds for bundle:', bundleId);
    return items;
  }

  console.log('[OfferPriceStep] Building bundle items with paxOfferItemIds:', paxOfferItemIds);
  console.log('[OfferPriceStep] JourneyRefIds for this bundle:', journeyRefIds);

  // Check if we have per-passenger mappings or need to use bundleId fallback
  const hasPaxMappings = paxOfferItemIds && Object.keys(paxOfferItemIds).length > 0;

  if (hasPaxMappings) {
    console.log('[OfferPriceStep] Using per-passenger offerItemId mappings (AirShopping bundles)');
  } else {
    console.log('[OfferPriceStep] Using single bundleId for all passengers (ServiceList journey-based bundles):', bundleId);
  }

  // Per Postman: Each passenger gets their OWN SelectedOfferItem with ONE PaxRefID
  // and the journey ref inside SelectedALaCarteOfferItem
  for (const paxRefId of paxRefIds) {
    let offerItemIdForPax: string | undefined;

    if (hasPaxMappings) {
      // AirShopping bundles: Use passenger-specific offerItemId
      offerItemIdForPax = paxOfferItemIds![paxRefId];

      // Skip passengers that don't have a bundle offerItemId mapping
      // This typically means infants (lap infants don't get bundles in Jetstar)
      if (!offerItemIdForPax) {
        console.log(`[OfferPriceStep] Skipping ${paxRefId} - no bundle offerItemId in mapping`);
        continue;
      }
    } else {
      // ServiceList bundles: Use single bundleId for ALL non-infant passengers
      // ServiceList bundles are journey-based with ONE offerItemId for all paying passengers
      if (paxRefId.startsWith('INF')) {
        console.log(`[OfferPriceStep] Skipping infant ${paxRefId} (infants not eligible for bundles)`);
        continue;
      }
      offerItemIdForPax = bundleId;
      console.log(`[OfferPriceStep] Using journey-based bundleId for ${paxRefId}: ${bundleId}`);
    }

    console.log(`[OfferPriceStep] Creating bundle item for ${paxRefId}: offerItemId=${offerItemIdForPax}, journeys=${journeyRefIds.join(',')}`);

    // Each passenger gets their own SelectedOfferItem with ONE PaxRefID
    items.push({
      offerItemId: offerItemIdForPax,
      paxRefIds: [paxRefId],  // ONE passenger per SelectedOfferItem
      isALaCarte: true,
      associationType: 'journey',
      journeyRefIds,  // Journey refs array - backend will expand into separate items per journey
    });
  }

  console.log('[OfferPriceStep] Built bundle a la carte items (one per passenger):', items);
  return items;
}

/**
 * Build service a la carte items from ServiceList.
 * Returns array of OfferItemWithPax for services (not bundles).
 */
function buildServiceALaCarteItems(
  selectedServices: SelectedServiceForOfferPrice[]
): OfferItemWithPax[] {
  if (!selectedServices || selectedServices.length === 0) {
    return [];
  }

  console.log(`[OfferPriceStep] Building service a la carte items for ${selectedServices.length} services`);

  // DEDUPLICATE services by offerItemId - when user selects same service for outbound AND inbound,
  // they have the same offerItemId. The original service already covers BOTH flights (direction: 'both'),
  // so we should NOT add quantities - just merge paxRefIds and keep the original refs.
  // CRITICAL EXCEPTION: NEVER merge seat services - each seat is per-passenger-per-segment
  const itemMap = new Map<string, OfferItemWithPax>();

  for (const service of selectedServices) {
    // CRITICAL VALIDATION: Check for empty or missing offerItemId
    if (!service.offerItemId || service.offerItemId.trim() === '') {
      console.error(`[OfferPriceStep] ❌ CRITICAL: Service has EMPTY offerItemId!`, {
        serviceType: service.serviceType,
        serviceCode: service.serviceCode,
        serviceName: service.serviceName,
        serviceId: service.serviceId,
        offerId: service.offerId,
        paxRefIds: service.paxRefIds,
        direction: service.direction,
        fullService: service,
      });
      // Skip this service - we cannot send empty offerItemId to OfferPrice
      continue;
    }

    // Skip services with unknown association type
    if (service.associationType === 'unknown') {
      console.warn(`[OfferPriceStep] Skipping service ${service.serviceCode} with unknown association type`);
      continue;
    }

    // CRITICAL: For seats, use a unique key that includes paxRefId to prevent merging
    // Each seat is per-passenger-per-segment, so they should NEVER be merged even with same offerItemId
    const isSeat = service.serviceType === 'seat';
    const mapKey = isSeat
      ? `${service.offerItemId}:${service.paxRefIds[0]}:${service.segmentRefs?.[0] || ''}`
      : service.offerItemId;

    const existingItem = itemMap.get(mapKey);

    if (existingItem && !isSeat) {
      // Merge with existing item - DO NOT add quantities since the original service already covers both flights.
      // Only merge paxRefIds (deduped) to ensure all passengers are included.
      const paxSet = new Set([...existingItem.paxRefIds, ...service.paxRefIds]);
      existingItem.paxRefIds = Array.from(paxSet);
      console.log(`[OfferPriceStep] Merged duplicate offerItemId ${service.offerItemId} (same service covers both flights):`, existingItem);
    } else {
      // Create new item
      const aLaCarteItem: OfferItemWithPax = {
        offerItemId: service.offerItemId,
        paxRefIds: [...service.paxRefIds],
        isALaCarte: true,
        quantity: service.quantity || 1,
        associationType: service.associationType,
        serviceType: service.serviceType,
      };

      // Add the appropriate refs based on association type
      if (service.associationType === 'segment' && service.segmentRefs) {
        aLaCarteItem.segmentRefIds = service.segmentRefs;
      } else if (service.associationType === 'journey' && service.journeyRefs) {
        aLaCarteItem.journeyRefIds = service.journeyRefs;
      } else if (service.associationType === 'leg' && service.legRefs) {
        aLaCarteItem.legRefIds = service.legRefs;
      }

      // CRITICAL: Add seat row/column for seat services
      if (service.serviceType === 'seat' && service.seatRow && service.seatColumn) {
        aLaCarteItem.seatRow = service.seatRow;
        aLaCarteItem.seatColumn = service.seatColumn;
      }

      console.log(`[OfferPriceStep] Adding service a la carte item:`, {
        serviceCode: service.serviceCode,
        serviceType: service.serviceType,
        offerItemId: aLaCarteItem.offerItemId,
        paxRefIds: aLaCarteItem.paxRefIds,
        associationType: aLaCarteItem.associationType,
        refs: aLaCarteItem.segmentRefIds || aLaCarteItem.journeyRefIds || aLaCarteItem.legRefIds,
        seatRow: aLaCarteItem.seatRow,
        seatColumn: aLaCarteItem.seatColumn,
        mapKey: isSeat ? `${service.offerItemId}:${service.paxRefIds[0]}:${service.segmentRefs?.[0]}` : service.offerItemId,
      });

      itemMap.set(mapKey, aLaCarteItem);
    }
  }

  return Array.from(itemMap.values());
}

/**
 * Build combined ALaCarteOffer containing both bundles and services.
 * Per Jetstar Postman: bundles and services share the same ALaCarteOffer ID.
 * Returns null if no bundles or services.
 */
interface ALaCarteOfferData {
  offerId: string;
  ownerCode: string;
  offerItems: OfferItemWithPax[];
}

interface BundleInfo {
  bundleId: string;
  offerId: string;
  paxRefIds: string[];
  journeyRefIds: string[];  // ARRAY of journey IDs - bundles can apply to multiple journeys
  // Per-passenger-type offerItemIds - bundles have different IDs for ADT, CHD, INF
  paxOfferItemIds?: Record<string, string>;
}

function buildCombinedALaCarteOffer(
  bundles: BundleInfo[],
  selectedServices: SelectedServiceForOfferPrice[],
  aLaCarteOfferId: string | null
): ALaCarteOfferData | null {
  const allItems: OfferItemWithPax[] = [];

  // Add bundle items (each passenger gets their own item with PaxJourneyRef and correct offerItemId)
  console.log('[OfferPriceStep] ===== BUILDING BUNDLE ALACARTE ITEMS =====');
  console.log('[OfferPriceStep] Processing', bundles.length, 'bundles');
  for (const bundle of bundles) {
    console.log('[OfferPriceStep] Processing bundle:', {
      bundleId: bundle.bundleId,
      offerId: bundle.offerId,
      journeyRefIds: bundle.journeyRefIds,
      paxRefIds: bundle.paxRefIds,
      hasPaxOfferItemIds: !!bundle.paxOfferItemIds,
    });
    const bundleItems = buildBundleALaCarteItems(
      bundle.bundleId,
      bundle.offerId,
      bundle.paxRefIds,
      bundle.journeyRefIds,
      bundle.paxOfferItemIds  // Pass per-passenger offerItemIds
    );
    console.log('[OfferPriceStep] Bundle produced', bundleItems.length, 'items');
    allItems.push(...bundleItems);
  }
  console.log('[OfferPriceStep] Total bundle items:', allItems.length);
  console.log('[OfferPriceStep] ==========================================');

  // Add service items
  const serviceItems = buildServiceALaCarteItems(selectedServices);
  allItems.push(...serviceItems);

  if (allItems.length === 0) {
    console.error('[OfferPriceStep] CRITICAL: No ALaCarte items generated! Bundles will NOT be priced!');
    console.error('[OfferPriceStep] Bundles input:', bundles);
    console.error('[OfferPriceStep] Services input:', selectedServices);
    return null;
  }

  // Determine the ALaCarteOffer ID:
  // - If we have services, use their offerId (from ServiceList response)
  // - If bundles have an offerId (from ServiceList swap), use that
  // - If only original bundles (from AirShopping), extract from bundleId pattern
  let offerId = aLaCarteOfferId;
  if (!offerId && selectedServices.length > 0) {
    offerId = selectedServices[0].offerId;
  }
  if (!offerId && bundles.length > 0) {
    // Check if this is a bundle SWAP from ServiceList (no paxOfferItemIds) or original from AirShopping
    // Bundle swaps from ServiceList have the ALaCarteOffer ID in bundle.offerId
    // Original bundles from AirShopping have paxOfferItemIds and need extraction from bundleId
    const firstBundle = bundles[0];
    const isServiceListSwap = !firstBundle.paxOfferItemIds && firstBundle.offerId;

    if (isServiceListSwap) {
      // Bundle swap from ServiceList - use the ALaCarteOffer ID directly
      offerId = firstBundle.offerId;
      console.log('[OfferPriceStep] Using bundle.offerId from ServiceList swap:', offerId);
      console.log('[OfferPriceStep] CRITICAL: This offerId MUST be the ALaCarteOffer ID from ServiceList, NOT a flight offer ID!');
      console.log('[OfferPriceStep] If duplicate offers error occurs, the ServiceList offerId is wrong');
    } else {
      // Original bundle from AirShopping - extract ALaCarteOffer ID from bundleId pattern
      // Bundle IDs from AirShopping ALaCarteOffer look like:
      // id-v2-{uuid}-{alacarte-uuid}-{n}
      // The ALaCarteOffer ID is: id-v2-{uuid}-{alacarte-uuid}
      const bundleId = firstBundle.bundleId;
      const match = bundleId.match(/^(.+-[a-f0-9-]+)-\d+$/i);
      offerId = match ? match[1] : bundleId;
      console.log('[OfferPriceStep] Extracted offerId from bundleId pattern:', offerId);
    }
  }

  if (!offerId) {
    console.error('[OfferPriceStep] Could not determine ALaCarteOffer ID');
    return null;
  }

  console.log('[OfferPriceStep] Built combined ALaCarteOffer:', {
    offerId,
    bundleCount: bundles.length,
    serviceCount: selectedServices.length,
    totalItems: allItems.length,
    bundles: bundles.map(b => ({
      bundleId: b.bundleId,
      offerId: b.offerId,
      hasPaxOfferItemIds: !!b.paxOfferItemIds,
      journeyRefIds: b.journeyRefIds,
    })),
  });

  return {
    offerId,
    ownerCode: 'JQ',
    offerItems: allItems,
  };
}


// Helper to calculate pre-OfferPrice total from selection using actual per-pax pricing
function calculatePreOfferPriceTotal(
  selection: { outbound: any; inbound: any },
  searchCriteria: { passengers: { adults: number; children: number; infants: number } } | null
) {
  let total = 0;
  const paxCounts = searchCriteria?.passengers || { adults: 1, children: 0, infants: 0 };

  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log('║ [OfferPriceStep] 💰 CALCULATING PRE-OFFERPRICE TOTAL          ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝');
  console.log('[OfferPriceStep] Passengers:', paxCounts);

  // Helper to calculate flight total using actual per-pax pricing when available
  const calculateFlightTotal = (selectionItem: any, direction: string): number => {
    if (!selectionItem) return 0;
    const bundlePrice = selectionItem.bundle?.price || 0;
    const perPaxPricing = selectionItem.perPaxPricing;

    console.log(`[OfferPriceStep] ${direction} selectionItem:`, {
      baseFare: selectionItem.baseFare,
      bundlePrice,
      perPaxPricing,
      hasPerPaxPricing: perPaxPricing && perPaxPricing.length > 0,
    });

    // Use actual per-pax pricing from AirShopping if available
    if (perPaxPricing && perPaxPricing.length > 0) {
      let flightTotal = 0;
      for (const paxPricing of perPaxPricing) {
        // paxPricing.totalAmount includes base fare + taxes (NO bundles)
        // Bundles are optional add-ons that the user selects
        const fareTotal = paxPricing.totalAmount;
        flightTotal += fareTotal;

        // Add the selected bundle price for paying passengers (not infants)
        if (paxPricing.paxType !== 'INF') {
          const bundleForPax = paxPricing.paxCount * bundlePrice;
          flightTotal += bundleForPax;
          console.log(`[OfferPriceStep] ${direction} ${paxPricing.paxType} (count=${paxPricing.paxCount}): fareTotal=${fareTotal.toFixed(2)}, bundle=${bundlePrice}, bundleForPax=${bundleForPax.toFixed(2)}`);
        } else {
          console.log(`[OfferPriceStep] ${direction} ${paxPricing.paxType} (count=${paxPricing.paxCount}): fareTotal=${fareTotal.toFixed(2)}, no bundle (infant)`);
        }
      }
      console.log(`[OfferPriceStep] ${direction} flightTotal (fare + selected bundle):`, flightTotal.toFixed(2));
      return flightTotal;
    }

    // Fallback: estimate using old logic
    console.log(`[OfferPriceStep] ${direction} using FALLBACK estimation (no perPaxPricing)`);
    const payingPax = paxCounts.adults + paxCounts.children;
    const adultBaseFare = payingPax > 0 ? selectionItem.baseFare / payingPax : selectionItem.baseFare;
    const infantBaseFare = Math.round(adultBaseFare * 0.1);

    let flightTotal = 0;
    flightTotal += paxCounts.adults * (adultBaseFare + bundlePrice);
    flightTotal += paxCounts.children * (adultBaseFare + bundlePrice);
    flightTotal += paxCounts.infants * infantBaseFare;
    console.log(`[OfferPriceStep] ${direction} flightTotal (fallback):`, flightTotal);
    return flightTotal;
  };

  const outboundTotal = calculateFlightTotal(selection.outbound, 'OUTBOUND');
  const inboundTotal = calculateFlightTotal(selection.inbound, 'INBOUND');
  total = outboundTotal + inboundTotal;

  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log('║ [OfferPriceStep] 📊 PRE-OFFERPRICE SUMMARY                    ║');
  console.log('╠═══════════════════════════════════════════════════════════════╣');
  console.log('║ Outbound Total:  $' + outboundTotal.toFixed(2).padStart(10) + '                        ║');
  console.log('║ Inbound Total:   $' + inboundTotal.toFixed(2).padStart(10) + '                        ║');
  console.log('║ ───────────────────────────────────────────────────────────── ║');
  console.log('║ GRAND TOTAL:     $' + total.toFixed(2).padStart(10) + '                        ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝');
  return total;
}

interface OfferPriceStepProps {
  workflowOptions?: any;
  onComplete?: () => void;
  onBack?: () => void;
  onPriceVerified?: (total: number) => void;
  stepId?: string;
}

const logger = createLogger('OfferPriceStep');

export function OfferPriceStep({ onComplete, onBack, onPriceVerified, stepId }: OfferPriceStepProps) {
  const { context, updateContext, nextStep, previousStep } = useWorkflow();
  const { addCapture } = useXmlViewer();
  const flightStore = useFlightSelectionStore();
  const distributionContext = useDistributionContext();

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [priceData, setPriceData] = useState<any>(null);
  // Store mismatches for logging and potential future UI restrictions
  const [_priceMismatches, setPriceMismatches] = useState<PriceMismatch[]>([]);

  // Default payment card type for OfferPrice API calls
  const selectedPaymentCode = 'VI';

  // Track if component is mounted to prevent state updates after unmount
  // and use AbortController to cancel in-flight requests
  const isMountedRef = useRef(true);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Handle mismatch detection from FlightPriceBreakdownPanel
  const handleMismatchDetected = useCallback((mismatches: PriceMismatch[]) => {
    setPriceMismatches(mismatches);
    // Log mismatches for API team investigation
    if (mismatches.length > 0) {
      console.warn('[OfferPriceStep] PRICE MISMATCH DETECTED - API Team Investigation Required:', mismatches);
    }
  }, []);

  // Helper to check if a bundle was included in OfferPrice request
  // A bundle is included when: not synthetic AND has journeyRefId
  const isBundleIncludedInOfferPrice = (selectionItem: typeof flightStore.selection.outbound): boolean => {
    if (!selectionItem || !selectionItem.bundle) return false;
    const isSynthetic = selectionItem.bundleId.startsWith(`${selectionItem.offerId}-`);
    return !isSynthetic && !!selectionItem.bundle.journeyRefId;
  };

  // Build AirShopping prices for comparison using actual per-pax pricing
  // NOTE: Jetstar NDC AirShopping API does NOT provide separate base/tax breakdown
  // The offer.totalPrice is the TOTAL including taxes for ALL passengers
  // We use per-pax pricing when available for accurate comparison
  const airShoppingPrices = useMemo((): AirShoppingPrice[] => {
    const prices: AirShoppingPrice[] = [];
    const selection = flightStore.selection;
    const searchCriteria = flightStore.searchCriteria;
    const paxCounts = searchCriteria?.passengers || { adults: 1, children: 0, infants: 0 };

    // Helper to calculate flight fare total using actual per-pax pricing
    const calculateFlightFareTotal = (selectionItem: typeof selection.outbound): number => {
      if (!selectionItem) return 0;
      const perPaxPricing = selectionItem.perPaxPricing;

      if (perPaxPricing && perPaxPricing.length > 0) {
        // Sum up all per-pax totals (base fare only, no bundle)
        return perPaxPricing.reduce((sum, p) => sum + p.totalAmount, 0);
      }

      // Fallback: use baseFare directly (legacy behavior)
      return selectionItem.baseFare;
    };

    // Helper to calculate bundle total for ADT + CHD
    const calculateBundleTotal = (selectionItem: typeof selection.outbound): number => {
      if (!selectionItem) return 0;
      const bundlePrice = selectionItem.bundle?.price || 0;
      const perPaxPricing = selectionItem.perPaxPricing;

      if (perPaxPricing && perPaxPricing.length > 0) {
        // Only ADT and CHD get bundles
        const payingPaxCount = perPaxPricing
          .filter(p => p.paxType !== 'INF')
          .reduce((sum, p) => sum + p.paxCount, 0);
        return payingPaxCount * bundlePrice;
      }

      // Fallback: estimate
      const payingPax = paxCounts.adults + paxCounts.children;
      return payingPax * bundlePrice;
    };

    if (selection.outbound) {
      const route = `${searchCriteria?.origin || 'XXX'} - ${searchCriteria?.destination || 'XXX'}`;
      const fareTotal = calculateFlightFareTotal(selection.outbound);
      const bundleTotal = calculateBundleTotal(selection.outbound);
      const bundleIncluded = isBundleIncludedInOfferPrice(selection.outbound);

      prices.push({
        route,
        baseFare: fareTotal,  // Total fare for all passengers (no bundle)
        taxAmount: undefined,  // Usually undefined for Jetstar
        bundlePrice: bundleTotal,  // Total bundle cost for paying pax
        total: fareTotal + bundleTotal,
        currency: selection.outbound.bundle?.currency || 'AUD',
        bundlesIncludedInOfferPrice: bundleIncluded,  // Flag for comparison logic
      });
    }

    if (selection.inbound) {
      const route = `${searchCriteria?.destination || 'XXX'} - ${searchCriteria?.origin || 'XXX'}`;
      const fareTotal = calculateFlightFareTotal(selection.inbound);
      const bundleTotal = calculateBundleTotal(selection.inbound);
      const bundleIncluded = isBundleIncludedInOfferPrice(selection.inbound);

      prices.push({
        route,
        baseFare: fareTotal,
        taxAmount: undefined,
        bundlePrice: bundleTotal,
        total: fareTotal + bundleTotal,
        currency: selection.inbound.bundle?.currency || 'AUD',
        bundlesIncludedInOfferPrice: bundleIncluded,  // Flag for comparison logic
      });
    }

    return prices;
  }, [flightStore.selection, flightStore.searchCriteria]);

  // Build bundle selections for display in FlightPriceBreakdownPanel
  // This shows the CURRENT bundles being priced - either original or swapped
  const bundleSelections = useMemo((): BundleSelection[] => {
    const selections: BundleSelection[] = [];
    const selection = flightStore.selection;
    const searchCriteria = flightStore.searchCriteria;
    const paxCounts = searchCriteria?.passengers || { adults: 1, children: 0, infants: 0 };

    // Check for bundle swaps from ServiceList step
    const selectedServices = flightStore.selectedServices || [];
    const bundleSwaps = selectedServices.filter((s: { serviceType: string }) => s.serviceType === 'bundle');
    const outboundBundleSwap = bundleSwaps.find((b: { direction: string }) => b.direction === 'outbound');
    const inboundBundleSwap = bundleSwaps.find((b: { direction: string }) => b.direction === 'inbound');

    // Helper to build bundle selection for a flight
    const buildBundleSelection = (
      selectionItem: typeof selection.outbound,
      flightNumber: number,
      route: string,
      swappedBundle?: { serviceName: string; serviceCode: string; price: number; currency: string; journeyRefs?: string[] }
    ): BundleSelection | null => {
      // Use swapped bundle info if available, otherwise use original selection
      let bundleName: string;
      let bundleCode: string;
      let pricePerPerson: number;
      let currency: string;
      let journeyId: string | undefined;
      let isServiceListBundle = false;

      if (swappedBundle) {
        // Bundle was swapped in ServiceList
        // CRITICAL: ServiceList bundles are journey-based with ONE price for ALL paying passengers
        // The price is NOT per-person, it's the total for the entire journey
        bundleName = swappedBundle.serviceName || 'Bundle';
        bundleCode = swappedBundle.serviceCode || '';
        pricePerPerson = swappedBundle.price || 0;
        currency = swappedBundle.currency || 'AUD';
        // Extract journey ID - for outbound use first [0], for inbound use second [1] or fallback to [0]
        journeyId = flightNumber === 1
          ? swappedBundle.journeyRefs?.[0]  // Outbound = first journey
          : (swappedBundle.journeyRefs?.[1] || swappedBundle.journeyRefs?.[0]);  // Inbound = second journey or fallback
        isServiceListBundle = true;
      } else if (selectionItem?.bundle) {
        // Original bundle from flight selection
        bundleName = selectionItem.bundle.bundleName || 'Bundle';
        bundleCode = selectionItem.bundle.bundleCode || '';
        pricePerPerson = selectionItem.bundle.price || 0;
        currency = selectionItem.bundle.currency || 'AUD';
        journeyId = selectionItem.bundle.journeyRefId;
        isServiceListBundle = false;
      } else {
        return null;
      }

      // Build per-pax breakdown
      const paxBreakdown: BundleSelection['paxBreakdown'] = [];

      // Use per-pax pricing if available to get accurate counts
      const perPaxPricing = selectionItem?.perPaxPricing;

      if (perPaxPricing && perPaxPricing.length > 0) {
        // Build from actual per-pax data
        for (const pax of perPaxPricing) {
          const count = pax.paxCount;
          // INF don't get bundles
          let total = 0;
          if (pax.paxType !== 'INF') {
            if (isServiceListBundle) {
              // ServiceList: price is TOTAL for all passengers, not per-person
              // Don't multiply - just divide equally among passenger types
              total = pricePerPerson / (paxCounts.adults + paxCounts.children);
            } else {
              // AirShopping: price is per-person
              total = count * pricePerPerson;
            }
          }
          paxBreakdown.push({
            ptc: pax.paxType,
            count,
            total,
          });
        }
      } else {
        // Fallback: use search criteria counts
        const totalPayingPax = paxCounts.adults + paxCounts.children;
        if (paxCounts.adults > 0) {
          const total = isServiceListBundle
            ? pricePerPerson * (paxCounts.adults / totalPayingPax)  // ServiceList: divide total price
            : paxCounts.adults * pricePerPerson;  // AirShopping: multiply per-person price
          paxBreakdown.push({ ptc: 'ADT', count: paxCounts.adults, total });
        }
        if (paxCounts.children > 0) {
          const total = isServiceListBundle
            ? pricePerPerson * (paxCounts.children / totalPayingPax)  // ServiceList: divide total price
            : paxCounts.children * pricePerPerson;  // AirShopping: multiply per-person price
          paxBreakdown.push({ ptc: 'CHD', count: paxCounts.children, total });
        }
        if (paxCounts.infants > 0) {
          paxBreakdown.push({ ptc: 'INF', count: paxCounts.infants, total: 0 }); // INF free
        }
      }

      // Sort: ADT, CHD, INF
      paxBreakdown.sort((a, b) => {
        const order = { 'ADT': 0, 'CHD': 1, 'INF': 2 };
        return (order[a.ptc as keyof typeof order] || 99) - (order[b.ptc as keyof typeof order] || 99);
      });

      const totalBundlePrice = paxBreakdown.reduce((sum, p) => sum + p.total, 0);

      return {
        flightNumber,
        route,
        journeyId,
        bundleName,
        bundleCode,
        pricePerPerson,
        paxBreakdown,
        totalBundlePrice,
        currency,
      };
    };

    // Check if the same bundle is selected for both journeys (ServiceList returns ONE price for round trip)
    const sameBundle = outboundBundleSwap && inboundBundleSwap &&
      outboundBundleSwap.serviceCode === inboundBundleSwap.serviceCode &&
      outboundBundleSwap.price === inboundBundleSwap.price;

    // Helper to get route from journey segments - shows all stops (e.g., ADL → MEL → AYQ)
    const getJourneyRoute = (selectionItem: typeof selection.outbound): string => {
      const segments = selectionItem?.journey?.segments;
      if (segments && segments.length > 0) {
        // Build route showing all stops: origin → stop1 → stop2 → destination
        const routeParts: string[] = [];
        for (const seg of segments) {
          if (seg?.origin && routeParts.length === 0) {
            routeParts.push(seg.origin);
          }
          if (seg?.destination) {
            routeParts.push(seg.destination);
          }
        }
        if (routeParts.length > 1) {
          return routeParts.join(' → ');
        }
      }
      return 'Unknown Route';
    };

    // Outbound - use swapped bundle if available
    if (selection.outbound) {
      // Prefer searchCriteria, fallback to journey segment data
      const route = searchCriteria?.origin && searchCriteria?.destination
        ? `${searchCriteria.origin} → ${searchCriteria.destination}`
        : getJourneyRoute(selection.outbound);
      const bundleSel = buildBundleSelection(
        selection.outbound,
        1,
        route,
        outboundBundleSwap as any
      );
      if (bundleSel) {
        if (sameBundle && selection.inbound) {
          // CRITICAL: ServiceList returns ONE bundle price for the entire round trip
          // Don't show it twice - combine both journeys into one display row
          const roundTripRoute = searchCriteria?.origin && searchCriteria?.destination
            ? `${searchCriteria.origin} ↔ ${searchCriteria.destination} (Round Trip)`
            : `${getJourneyRoute(selection.outbound).replace(' → ', ' ↔ ')} (Round Trip)`;
          bundleSel.route = roundTripRoute;
          bundleSel.flightNumber = 0;  // Indicate it's for both flights
          console.log('[OfferPriceStep] Same bundle for both journeys - showing as single round-trip bundle');
        }
        selections.push(bundleSel);
      }
    }

    // Inbound (return flight) - use swapped bundle if available
    // SKIP if same bundle already added for round trip
    if (selection.inbound && !sameBundle) {
      // Prefer searchCriteria, fallback to journey segment data
      const route = searchCriteria?.destination && searchCriteria?.origin
        ? `${searchCriteria.destination} → ${searchCriteria.origin}`
        : getJourneyRoute(selection.inbound);
      const bundleSel = buildBundleSelection(
        selection.inbound,
        2,
        route,
        inboundBundleSwap as any
      );
      if (bundleSel) selections.push(bundleSel);
    }

    console.log('[OfferPriceStep] Built bundleSelections (including swaps):', selections);
    return selections;
  }, [flightStore.selection, flightStore.searchCriteria, flightStore.selectedServices]);

  // Calculate pre-OfferPrice total from AirShopping selection
  const preOfferPriceTotal = useMemo(() => {
    return calculatePreOfferPriceTotal(flightStore.selection, flightStore.searchCriteria);
  }, [flightStore.selection, flightStore.searchCriteria]);

  // Create a unique fetch key based on services to detect when we need to re-fetch
  // This allows the same OfferPrice component to fetch fresh data when services change
  const selectedServicesKey = useMemo(() => {
    const services = flightStore.selectedServices || [];
    if (services.length === 0) return 'no-services';
    // Create a deterministic key from service IDs and quantities
    return services.map(s => `${s.serviceId}:${s.quantity}`).sort().join('|');
  }, [flightStore.selectedServices]);

  // Effect to handle component lifecycle and prevent duplicate API calls
  useEffect(() => {
    // Reset mounted state on mount
    isMountedRef.current = true;

    return () => {
      // Mark as unmounted and cancel any in-flight request
      isMountedRef.current = false;
      if (abortControllerRef.current) {
        console.log('[OfferPriceStep] Cancelling in-flight OfferPrice request on unmount');
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    };
  }, []);

  // ============================================================================
  // CRITICAL FIX (2026-01-09): Stale verified total from previous search
  // ============================================================================
  // BUG: When user clicked "New Search" and performed a different search,
  // the OfferPrice step still showed the verified total from the previous transaction
  // Example: Search 1 verified at $25,132.80, Search 2 should be different but still showed $25,132.80
  //
  // ROOT CAUSE: priceData state was not being cleared when a new AirShopping search was performed
  // The shoppingResponseId changes when a new search is done, but we weren't watching for this change
  //
  // FIX: Watch for shoppingResponseId changes and clear cached priceData
  // This forces a fresh OfferPrice API call for the new search results
  //
  // DO NOT REMOVE THIS EFFECT - it will cause stale pricing from previous searches!
  // ============================================================================
  useEffect(() => {
    console.log('[OfferPriceStep] ShoppingResponseId changed, clearing cached price data');
    setPriceData(null);
    setError(null);
  }, [flightStore.shoppingResponseId]);

  useEffect(() => {
    // Cancel any previous in-flight request before starting a new one
    if (abortControllerRef.current) {
      console.log('[OfferPriceStep] Cancelling previous OfferPrice request');
      abortControllerRef.current.abort();
    }

    // Create new AbortController for this request
    const controller = new AbortController();
    abortControllerRef.current = controller;

    console.log('[OfferPriceStep] Starting OfferPrice fetch with services key:', selectedServicesKey);

    fetchOfferPrice(controller.signal).finally(() => {
      // Only clear ref if this is still the active controller
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
    });
  }, [selectedServicesKey]);

  const fetchOfferPrice = async (signal?: AbortSignal) => {
    const selection = flightStore.selection;
    const searchCriteria = flightStore.searchCriteria;

    // =========================================================================
    // TRANSACTION LOGGING: Start OfferPrice Step
    // =========================================================================
    TransactionLogger.startStep('offer-price', 'Price Verification (OfferPrice)', 3);
    TransactionLogger.logUserAction('Initiated price verification');

    // Log current flight selections
    if (selection.outbound) {
      TransactionLogger.logSelection({
        type: 'flight',
        direction: 'outbound',
        data: {
          offerId: selection.outbound.offerId,
          bundleId: selection.outbound.bundleId,
          bundleName: selection.outbound.bundle?.bundleName,
          bundleCode: selection.outbound.bundle?.bundleCode,
          journeyRefId: selection.outbound.bundle?.journeyRefId,
          baseFare: selection.outbound.baseFare,
          bundlePrice: selection.outbound.bundle?.price,
          journeyId: selection.outbound.journey?.journeyId,
        },
        summary: `${searchCriteria?.origin}-${searchCriteria?.destination} | ${selection.outbound.bundle?.bundleName || 'No bundle'} @ ${selection.outbound.bundle?.currency || 'AUD'} ${selection.outbound.bundle?.price || 0}/pax`,
      });
    }

    if (selection.inbound) {
      TransactionLogger.logSelection({
        type: 'flight',
        direction: 'inbound',
        data: {
          offerId: selection.inbound.offerId,
          bundleId: selection.inbound.bundleId,
          bundleName: selection.inbound.bundle?.bundleName,
          bundleCode: selection.inbound.bundle?.bundleCode,
          journeyRefId: selection.inbound.bundle?.journeyRefId,
          baseFare: selection.inbound.baseFare,
          bundlePrice: selection.inbound.bundle?.price,
          journeyId: selection.inbound.journey?.journeyId,
        },
        summary: `${searchCriteria?.destination}-${searchCriteria?.origin} | ${selection.inbound.bundle?.bundleName || 'No bundle'} @ ${selection.inbound.bundle?.currency || 'AUD'} ${selection.inbound.bundle?.price || 0}/pax`,
      });
    }

    console.log('[OfferPriceStep] fetchOfferPrice called');
    console.log('[OfferPriceStep] selection:', selection);

    if (!selection.outbound) {
      console.error('[OfferPriceStep] Missing outbound selection');
      TransactionLogger.logError('Missing outbound flight selection');
      TransactionLogger.completeStep('failed');
      if (isMountedRef.current) {
        setError('Missing selected offer');
        setIsLoading(false);
      }
      return;
    }

    // Check if request was aborted before starting
    if (signal?.aborted) {
      console.log('[OfferPriceStep] Request aborted before starting');
      TransactionLogger.logWarning('Request aborted before starting');
      return;
    }

    if (isMountedRef.current) {
      setIsLoading(true);
      setError(null);
    }

    // Small delay before first OfferPrice call to allow Jetstar session to initialize
    // This helps avoid "NoBookingInState" or SSR selling errors on first call
    await new Promise(resolve => setTimeout(resolve, 500));

    // Check if aborted during delay
    if (signal?.aborted) {
      console.log('[OfferPriceStep] Request aborted during initial delay');
      TransactionLogger.logWarning('Request aborted during delay');
      return;
    }

    const startTime = Date.now();

    // Build route labels for descriptive operation names
    const origin = searchCriteria?.origin || 'XXX';
    const destination = searchCriteria?.destination || 'XXX';
    const outboundRouteLabel = `${origin}-${destination}`;
    const inboundRouteLabel = `${destination}-${origin}`;

    // Helper function to build annotation context for OfferPrice
    const buildOfferPriceAnnotation = (
      stepDescription: string,
      selectedServices: SelectedServiceForOfferPrice[]
    ): AnnotationContext => {
      // Build outbound offer context
      const outboundOffer: OfferContext = {
        offerId: selection.outbound?.offerId,
        bundleId: selection.outbound?.bundleId,
        bundleName: selection.outbound?.bundle?.bundleName,
        bundleCode: selection.outbound?.bundle?.bundleCode,
        fareBasis: selection.outbound?.fareBasisCode,
        route: `${origin} → ${destination}`,
        departureTime: searchCriteria?.departureDate,
        direction: 'outbound',
      };

      // Build inbound offer context if exists
      const inboundOffer: OfferContext | undefined = selection.inbound ? {
        offerId: selection.inbound.offerId,
        bundleId: selection.inbound.bundleId,
        bundleName: selection.inbound.bundle?.bundleName,
        bundleCode: selection.inbound.bundle?.bundleCode,
        fareBasis: selection.inbound.fareBasisCode,
        route: `${destination} → ${origin}`,
        departureTime: searchCriteria?.returnDate,
        direction: 'inbound',
      } : undefined;

      // Build services context
      const services: ServiceContext[] = selectedServices.map(svc => ({
        serviceCode: svc.serviceCode,
        serviceName: svc.serviceName,
        serviceType: svc.serviceType,
        quantity: svc.quantity,
        price: svc.price,
        currency: svc.currency,
        passengerRef: svc.paxRefIds?.join(', '),
        segmentRef: svc.segmentRefs?.join(', '),
      }));

      // Build changes list
      const changes: string[] = [];
      if (outboundOffer.bundleName) {
        changes.push(`Outbound bundle: ${outboundOffer.bundleName} (${outboundOffer.bundleCode || outboundOffer.bundleId})`);
      }
      if (inboundOffer?.bundleName) {
        changes.push(`Inbound bundle: ${inboundOffer.bundleName} (${inboundOffer.bundleCode || inboundOffer.bundleId})`);
      }
      if (services.length > 0) {
        services.forEach(svc => {
          changes.push(`Service: ${svc.serviceName || svc.serviceCode} x${svc.quantity} @ ${svc.currency} ${svc.price}`);
        });
      }

      return {
        operation: 'OfferPrice',
        stepInWorkflow: stepDescription,
        flight: {
          origin,
          destination,
          departureDate: searchCriteria?.departureDate,
          returnDate: searchCriteria?.returnDate,
          cabinClass: searchCriteria?.cabinClass,
          passengers: searchCriteria?.passengers,
        },
        outboundOffer,
        inboundOffer,
        services: services.length > 0 ? services : undefined,
        shoppingResponseId: flightStore.shoppingResponseId || undefined,
        timestamp: new Date(),
        changesSinceLastStep: changes.length > 0 ? changes : undefined,
      };
    };

    try {
      // Build distribution chain from user's session context
      const distributionChain = distributionContext.isValid ? {
        links: distributionContext.getPartyConfig()?.participants.map(p => ({
          ordinal: p.ordinal,
          orgRole: p.role,
          orgId: p.orgCode,
          orgName: p.orgName,
        })) || []
      } : undefined;

      // Get passenger counts from search criteria
      const passengers = flightStore.searchCriteria?.passengers || { adults: 1, children: 0, infants: 0 };

      // Get selected services from ServiceList step
      const selectedServices = flightStore.selectedServices as SelectedServiceForOfferPrice[] || [];
      console.log('[OfferPriceStep] ===== SELECTED SERVICES BREAKDOWN =====');
      console.log('[OfferPriceStep] Total services:', selectedServices.length);
      console.log('[OfferPriceStep] Service types:', {
        bundles: selectedServices.filter(s => s.serviceType === 'bundle').length,
        seats: selectedServices.filter(s => s.serviceType === 'seat').length,
        ssrs: selectedServices.filter(s => s.serviceType === 'ssr').length,
        other: selectedServices.filter(s => !['bundle', 'seat', 'ssr'].includes(s.serviceType)).length,
      });
      console.log('[OfferPriceStep] All selected services:', selectedServices);

      const servicesBreakdown = {
        totalServices: selectedServices.length,
        serviceTypes: {
          bundles: selectedServices.filter(s => s.serviceType === 'bundle').length,
          seats: selectedServices.filter(s => s.serviceType === 'seat').length,
          ssrs: selectedServices.filter(s => s.serviceType === 'ssr').length,
          other: selectedServices.filter(s => !['bundle', 'seat', 'ssr'].includes(s.serviceType)).length,
        },
        allServices: selectedServices
      };

      await logger.logGroup('===== SELECTED SERVICES BREAKDOWN =====', [
        { label: 'Total services', value: servicesBreakdown.totalServices },
        { label: 'Service types', value: servicesBreakdown.serviceTypes },
        { label: 'All services', value: servicesBreakdown.allServices }
      ]);

      // Determine if we can combine outbound + inbound in single call
      // Jetstar embeds shoppingResponseId in each offer ID
      // If they share the same embedded UUID, we can combine them
      // If not (Mixed mode with separate searches), we need separate calls
      const hasInbound = !!selection.inbound;
      const canCombine = hasInbound && offersShareResponseId(
        selection.outbound.offerId,
        selection.inbound!.offerId
      );

      // Build FLIGHT FARE items only (base fares, NO bundles)
      // Bundles must go in ALaCarteOffer with PaxJourneyRef per Postman pattern
      const outboundFareItems = buildFlightFareItems(
        selection.outbound.offerItemsWithPax
      );
      const inboundFareItems = hasInbound ? buildFlightFareItems(
        selection.inbound!.offerItemsWithPax
      ) : [];

      // Build bundle info for ALaCarteOffer
      // Per Postman: bundles need SelectedALaCarteOfferItem with PaxJourneyRef
      // CRITICAL: Must use bundle.journeyRefId (from ALaCarteOffer Eligibility), NOT journey.journeyId
      const bundles: BundleInfo[] = [];

      // NOTE: Each bundle from AirShopping has its OWN journey ref from the ALaCarteOffer eligibility
      // Even if the same bundle tier (e.g., M202) is selected for both journeys, Jetstar sends
      // SEPARATE ALaCarteOffer items for each journey with different bundleIds and journey refs
      // We MUST send each bundle with its original journey ref - DO NOT try to combine them!
      const outboundBundleId = selection.outbound.bundleId;
      const inboundBundleId = selection.inbound?.bundleId;

      // DEBUG: Log what's in the bundle selections from flight store
      console.log('[OfferPriceStep] DEBUG - Outbound bundle from selection:', {
        bundleId: selection.outbound.bundleId,
        bundleName: selection.outbound.bundle?.bundleName,
        bundleCode: selection.outbound.bundle?.bundleCode,
        journeyRefId: selection.outbound.bundle?.journeyRefId,
        paxOfferItemIds: selection.outbound.bundle?.paxOfferItemIds,
        fullBundle: selection.outbound.bundle,
      });
      if (selection.inbound) {
        console.log('[OfferPriceStep] DEBUG - Inbound bundle from selection:', {
          bundleId: selection.inbound.bundleId,
          bundleName: selection.inbound.bundle?.bundleName,
          bundleCode: selection.inbound.bundle?.bundleCode,
          journeyRefId: selection.inbound.bundle?.journeyRefId,
          paxOfferItemIds: selection.inbound.bundle?.paxOfferItemIds,
          fullBundle: selection.inbound.bundle,
        });
      }

      // Check if user selected bundle SWAPS in ServiceList step
      // Bundle swaps override the original bundles from flight selection
      const bundleSwaps = selectedServices.filter(s => s.serviceType === 'bundle');
      const outboundBundleSwap = bundleSwaps.find(b => b.direction === 'outbound' || b.direction === 'both');
      const inboundBundleSwap = bundleSwaps.find(b => b.direction === 'inbound' || b.direction === 'both');

      // DEBUG: Log full bundle swap data to verify offerId is present
      console.log('[OfferPriceStep] ===== BUNDLE SWAPS FROM STORE =====');
      console.log('[OfferPriceStep] Total bundle swaps found:', bundleSwaps.length);
      bundleSwaps.forEach((swap, i) => {
        console.log(`[OfferPriceStep] BundleSwap[${i}]:`, {
          serviceName: swap.serviceName,
          serviceCode: swap.serviceCode,
          direction: swap.direction,
          offerId: swap.offerId,          // <-- CRITICAL: Must be ALaCarteOffer ID from ServiceList
          offerItemId: swap.offerItemId,  // <-- CRITICAL: Must be bundle's OfferItemID
          serviceId: swap.serviceId,
          journeyRefs: swap.journeyRefs,
          paxRefIds: swap.paxRefIds,
          price: swap.price,
        });
      });
      console.log('[OfferPriceStep] ===================================');

      // =========================================================================
      // TRANSACTION LOGGING: Bundle Swaps Detection
      // =========================================================================
      if (bundleSwaps.length > 0) {
        TransactionLogger.logUserAction(`Bundle swap detected: ${bundleSwaps.length} bundle(s) changed in ServiceList`);

        if (outboundBundleSwap) {
          TransactionLogger.logSelection({
            type: 'bundle',
            direction: 'outbound',
            data: {
              bundleId: outboundBundleSwap.offerItemId || outboundBundleSwap.serviceId,
              bundleName: outboundBundleSwap.serviceName,
              bundleCode: outboundBundleSwap.serviceCode,
              price: outboundBundleSwap.price,
              currency: outboundBundleSwap.currency,
              journeyRefs: outboundBundleSwap.journeyRefs,
              isSwap: true,
            },
            summary: `SWAP: ${outboundBundleSwap.serviceName} @ ${outboundBundleSwap.currency} ${outboundBundleSwap.price}/pax`,
          });
        }

        if (inboundBundleSwap) {
          TransactionLogger.logSelection({
            type: 'bundle',
            direction: 'inbound',
            data: {
              bundleId: inboundBundleSwap.offerItemId || inboundBundleSwap.serviceId,
              bundleName: inboundBundleSwap.serviceName,
              bundleCode: inboundBundleSwap.serviceCode,
              price: inboundBundleSwap.price,
              currency: inboundBundleSwap.currency,
              journeyRefs: inboundBundleSwap.journeyRefs,
              isSwap: true,
            },
            summary: `SWAP: ${inboundBundleSwap.serviceName} @ ${inboundBundleSwap.currency} ${inboundBundleSwap.price}/pax`,
          });
        }
      }

      console.log('[OfferPriceStep] ===== BUNDLE SWAPS FROM SERVICELIST =====');
      if (outboundBundleSwap) {
        console.log('[OfferPriceStep] Outbound Bundle Swap:', {
          serviceId: outboundBundleSwap.serviceId,
          serviceCode: outboundBundleSwap.serviceCode,
          name: outboundBundleSwap.serviceName,
          offerId: outboundBundleSwap.offerId,
          offerItemId: outboundBundleSwap.offerItemId,
          journeyRefs: outboundBundleSwap.journeyRefs || [],
          segmentRefs: outboundBundleSwap.segmentRefs || [],
          legRefs: outboundBundleSwap.legRefs || [],
          paxRefIds: outboundBundleSwap.paxRefIds || [],
          price: outboundBundleSwap.price,
          currency: outboundBundleSwap.currency,
        });
      }
      if (inboundBundleSwap) {
        console.log('[OfferPriceStep] Inbound Bundle Swap:', {
          serviceId: inboundBundleSwap.serviceId,
          serviceCode: inboundBundleSwap.serviceCode,
          name: inboundBundleSwap.serviceName,
          offerId: inboundBundleSwap.offerId,
          offerItemId: inboundBundleSwap.offerItemId,
          journeyRefs: inboundBundleSwap.journeyRefs || [],
          segmentRefs: inboundBundleSwap.segmentRefs || [],
          legRefs: inboundBundleSwap.legRefs || [],
          paxRefIds: inboundBundleSwap.paxRefIds || [],
          price: inboundBundleSwap.price,
          currency: inboundBundleSwap.currency,
        });
      }
      console.log('[OfferPriceStep] ==========================================');

      // Filter out bundle swaps from selectedServices since we'll process them separately as bundles
      const nonBundleServices = selectedServices.filter(s => s.serviceType !== 'bundle');

      // Log any non-bundle services selected
      if (nonBundleServices.length > 0) {
        TransactionLogger.logUserAction(`${nonBundleServices.length} ancillary service(s) selected`);
        nonBundleServices.forEach(svc => {
          TransactionLogger.logSelection({
            type: 'service',
            direction: svc.direction as 'outbound' | 'inbound' | 'both',
            data: svc,
            summary: `${svc.serviceName} x${svc.quantity} @ ${svc.currency} ${svc.price}`,
          });
        });
      }

      // Get the ORIGINAL journeyRefIds from the flight selection's bundles
      // These are needed because ServiceList bundles often don't have journeyRefIds populated
      // The journey association stays the same when swapping bundle tiers
      const originalOutboundJourneyRefId = selection.outbound.bundle?.journeyRefId;
      const originalInboundJourneyRefId = selection.inbound?.bundle?.journeyRefId;

      // LAST RESORT FALLBACK: Use journey.journeyId if bundle.journeyRefId is not available
      // This is less reliable as Jetstar uses different IDs for ALaCarteOffer eligibility vs PaxJourney
      // But it's better than not sending the bundle at all
      const outboundJourneyIdFallback = selection.outbound.journey?.journeyId;
      const inboundJourneyIdFallback = selection.inbound?.journey?.journeyId;

      console.log('[OfferPriceStep] Original bundle journeyRefIds from selection:', {
        outbound: originalOutboundJourneyRefId,
        inbound: originalInboundJourneyRefId,
        outboundFallback: outboundJourneyIdFallback,
        inboundFallback: inboundJourneyIdFallback,
      });

      // Handle bundles separately for outbound and inbound
      // CRITICAL: Even if same bundle code (e.g., M202) selected for both journeys,
      // they must be sent as SEPARATE entries with their respective journey refs.
      // Per Postman logic: each bundle gets its own <SelectedOfferItem> entry.

      // Outbound bundle: Use SWAP if user selected one, otherwise use original bundle from flight selection
      if (outboundBundleSwap) {
          // User swapped the outbound bundle in ServiceList
          // CRITICAL: For bundle swaps, we MUST use the journeyRef from ServiceList response
          // because the new bundle's offerItemId is only valid with its corresponding journeyRef.
          //
          // IMPORTANT: ServiceList returns bundles with journeyRefs array containing BOTH journeys if bundle applies to both!
          // We must use journeyRefs[0] for outbound (first journey in array)
          //
          // FALLBACK CHAIN (in priority order):
          // 1. swap.journeyRefs[0] (from ServiceList response - PREFERRED - always use [0] for outbound)
          // 2. original bundle's journeyRefId (from AirShopping ALaCarteOffer - may work if same structure)
          // 3. journey.journeyId (last resort - from PaxJourney in AirShopping)
          const swapJourneyRef = outboundBundleSwap.journeyRefs?.[0];  // [0] = FIRST journey = OUTBOUND
          const journeyRefId = swapJourneyRef
            || originalOutboundJourneyRefId
            || outboundJourneyIdFallback;

          console.log('[OfferPriceStep] Outbound bundle swap journeyRefId resolution:', {
            allJourneyRefs: outboundBundleSwap.journeyRefs,
            fromSwap_index0: swapJourneyRef,
            fromOriginalBundle: originalOutboundJourneyRefId,
            fromJourneyFallback: outboundJourneyIdFallback,
            resolved: journeyRefId,
            WARNING: !swapJourneyRef ? 'ServiceList did NOT provide journeyRef - using fallback!' : null,
          });

          if (journeyRefId) {
            bundles.push({
              bundleId: outboundBundleSwap.offerItemId || outboundBundleSwap.serviceId,
              offerId: outboundBundleSwap.offerId,
              paxRefIds: outboundBundleSwap.paxRefIds || selection.outbound.paxRefIds || [],
              journeyRefIds: [journeyRefId],  // Wrap in array for backend
              paxOfferItemIds: outboundBundleSwap.paxOfferItemIds,  // undefined for ServiceList bundles (journey-based)
            });
            console.log('[OfferPriceStep] Added SWAPPED outbound bundle:', outboundBundleSwap.serviceName, 'offerItemId:', outboundBundleSwap.offerItemId, 'journeyRefId:', journeyRefId, 'hasPaxMappings:', !!outboundBundleSwap.paxOfferItemIds);
          } else {
            console.error('[OfferPriceStep] CRITICAL: Outbound bundle swap has NO journeyRefId from ANY source - bundle WILL NOT BE SENT to OfferPrice:', {
              bundleName: outboundBundleSwap.serviceName,
              swapJourneyRefs: outboundBundleSwap.journeyRefs,
              originalBundleJourneyRefId: originalOutboundJourneyRefId,
              journeyFallback: outboundJourneyIdFallback,
            });
          }
      } else {
        // Use original bundle from flight selection (if not synthetic)
        const outboundPaxOfferItemIds = selection.outbound.bundle?.paxOfferItemIds;
        const isSyntheticOutbound = outboundBundleId.startsWith(`${selection.outbound.offerId}-`);

        // Use fallback chain for original bundles too (in case journeyRefId wasn't stored)
        const resolvedOutboundJourneyRefId = originalOutboundJourneyRefId || outboundJourneyIdFallback;

        if (!isSyntheticOutbound && resolvedOutboundJourneyRefId) {
          // CRITICAL FIX: Extract ALaCarteOffer ID from bundleId pattern
          // Original bundles from AirShopping have bundleIds like: id-v2-{uuid}-{alacarte-uuid}-{n}
          // The ALaCarteOffer ID is: id-v2-{uuid}-{alacarte-uuid}
          // We MUST NOT use selection.outbound.offerId as that's the FLIGHT offer ID!
          const match = outboundBundleId.match(/^(.+-[a-f0-9-]+)-\d+$/i);
          const aLaCarteOfferId = match ? match[1] : outboundBundleId;

          // Use SINGLE journey ref from bundle (each bundle has its own journey ref from eligibility)
          const journeyRefs = [resolvedOutboundJourneyRefId];

          console.log('[OfferPriceStep] Original outbound bundle - extracting ALaCarteOffer ID:', {
            bundleId: outboundBundleId,
            flightOfferId: selection.outbound.offerId,
            extractedALaCarteOfferId: aLaCarteOfferId,
            journeyRefs,
          });

          bundles.push({
            bundleId: outboundBundleId,
            offerId: aLaCarteOfferId,  // Use extracted ALaCarteOffer ID, NOT flight offer ID
            paxRefIds: selection.outbound.paxRefIds || [],
            journeyRefIds: journeyRefs,  // Include ALL journey refs from bundle or fallback
            paxOfferItemIds: outboundPaxOfferItemIds,
          });
          console.log('[OfferPriceStep] Added original bundle:', outboundBundleId, 'journeyRefIds:', journeyRefs, 'ALaCarteOfferId:', aLaCarteOfferId);
        } else if (!isSyntheticOutbound) {
          console.warn('[OfferPriceStep] Outbound bundle missing journeyRefId from all sources - cannot add to OfferPrice:', {
            bundleId: outboundBundleId,
            bundleJourneyRefId: originalOutboundJourneyRefId,
            journeyFallback: outboundJourneyIdFallback,
          });
        }
      }

      // Inbound bundle: Use SWAP if user selected one, otherwise use original bundle from flight selection
      if (hasInbound) {
          if (inboundBundleSwap) {
            // User swapped the inbound bundle in ServiceList
            //
            // CRITICAL: ServiceList returns bundles with journeyRefs array containing BOTH journeys if bundle applies to both!
            // We must use journeyRefs[1] for inbound (second journey in array)
            // If only one journey ref exists (rare), fall back to [0]
            //
            // FALLBACK CHAIN (in priority order):
            // 1. swap.journeyRefs[1] or [0] (from ServiceList response - PREFERRED - use [1] for inbound, [0] if only one ref)
            // 2. original bundle's journeyRefId (from AirShopping ALaCarteOffer)
            // 3. journey.journeyId (last resort - from PaxJourney in AirShopping)
            const swapJourneyRef = inboundBundleSwap.journeyRefs?.[1] || inboundBundleSwap.journeyRefs?.[0];  // [1] = SECOND journey = INBOUND
            const journeyRefId = swapJourneyRef
              || originalInboundJourneyRefId
              || inboundJourneyIdFallback;

            console.log('[OfferPriceStep] Inbound bundle swap journeyRefId resolution:', {
              allJourneyRefs: inboundBundleSwap.journeyRefs,
              fromSwap_index1: inboundBundleSwap.journeyRefs?.[1],
              fromSwap_index0_fallback: inboundBundleSwap.journeyRefs?.[0],
              fromOriginalBundle: originalInboundJourneyRefId,
              fromJourneyFallback: inboundJourneyIdFallback,
              resolved: journeyRefId,
            });

            if (journeyRefId) {
              bundles.push({
                bundleId: inboundBundleSwap.offerItemId || inboundBundleSwap.serviceId,
                offerId: inboundBundleSwap.offerId,
                paxRefIds: inboundBundleSwap.paxRefIds || selection.inbound!.paxRefIds || [],
                journeyRefIds: [journeyRefId],  // Wrap in array for backend
                paxOfferItemIds: inboundBundleSwap.paxOfferItemIds,  // undefined for ServiceList bundles (journey-based)
              });
              console.log('[OfferPriceStep] Added SWAPPED inbound bundle:', inboundBundleSwap.serviceName, 'offerItemId:', inboundBundleSwap.offerItemId, 'journeyRefId:', journeyRefId, 'hasPaxMappings:', !!inboundBundleSwap.paxOfferItemIds);
            } else {
              console.error('[OfferPriceStep] CRITICAL: Inbound bundle swap has NO journeyRefId from ANY source - bundle WILL NOT BE SENT to OfferPrice:', {
                bundleName: inboundBundleSwap.serviceName,
                swapJourneyRefs: inboundBundleSwap.journeyRefs,
                originalBundleJourneyRefId: originalInboundJourneyRefId,
                journeyFallback: inboundJourneyIdFallback,
              });
            }
          } else {
            // Use original bundle from flight selection (if not synthetic)
            // Each bundle has its OWN journey ref from AirShopping - send them all separately
            const inboundPaxOfferItemIds = selection.inbound!.bundle?.paxOfferItemIds;
            const isSyntheticInbound = inboundBundleId!.startsWith(`${selection.inbound!.offerId}-`);

            // Use fallback chain for original bundles too (in case journeyRefId wasn't stored)
            const resolvedInboundJourneyRefId = originalInboundJourneyRefId || inboundJourneyIdFallback;

            if (!isSyntheticInbound && resolvedInboundJourneyRefId) {
              // CRITICAL FIX: Extract ALaCarteOffer ID from bundleId pattern
              // Original bundles from AirShopping have bundleIds like: id-v2-{uuid}-{alacarte-uuid}-{n}
              // The ALaCarteOffer ID is: id-v2-{uuid}-{alacarte-uuid}
              // We MUST NOT use selection.inbound.offerId as that's the FLIGHT offer ID!
              const match = inboundBundleId.match(/^(.+-[a-f0-9-]+)-\d+$/i);
              const aLaCarteOfferId = match ? match[1] : inboundBundleId;

              console.log('[OfferPriceStep] Original inbound bundle - extracting ALaCarteOffer ID:', {
                bundleId: inboundBundleId,
                flightOfferId: selection.inbound!.offerId,
                extractedALaCarteOfferId: aLaCarteOfferId,
              });

              bundles.push({
                bundleId: inboundBundleId,
                offerId: aLaCarteOfferId,  // Use extracted ALaCarteOffer ID, NOT flight offer ID
                paxRefIds: selection.inbound!.paxRefIds || [],
                journeyRefIds: [resolvedInboundJourneyRefId],  // Wrap in array
                paxOfferItemIds: inboundPaxOfferItemIds,
              });
              console.log('[OfferPriceStep] Added original inbound bundle:', inboundBundleId, 'journeyRefId:', resolvedInboundJourneyRefId, 'ALaCarteOfferId:', aLaCarteOfferId);
            } else if (!isSyntheticInbound) {
              console.warn('[OfferPriceStep] Inbound bundle missing journeyRefId from all sources - cannot add to OfferPrice:', {
                bundleId: inboundBundleId,
                bundleJourneyRefId: originalInboundJourneyRefId,
                journeyFallback: inboundJourneyIdFallback,
              });
            }
          }
        }

      // =========================================================================
      // TRANSACTION LOGGING: Final Bundle Summary Before OfferPrice
      // =========================================================================
      console.log('[OfferPriceStep] ===== BUNDLE SUMMARY FOR OFFER PRICE =====');
      console.log('[OfferPriceStep] Total bundles to send:', bundles.length);
      bundles.forEach((b, i) => {
        console.log(`[OfferPriceStep] Bundle[${i}]:`, {
          bundleId: b.bundleId,
          offerId: b.offerId,
          journeyRefIds: b.journeyRefIds,
          paxRefIds: b.paxRefIds,
          hasPaxOfferItemIds: !!b.paxOfferItemIds,
        });
      });

      // Log what SHOULD have been added
      const expectedBundles = [];
      if (outboundBundleSwap) {
        expectedBundles.push({ direction: 'outbound', type: 'SWAP', name: outboundBundleSwap.serviceName, code: outboundBundleSwap.serviceCode });
      } else if (selection.outbound.bundle && !selection.outbound.bundleId.startsWith(`${selection.outbound.offerId}-`)) {
        expectedBundles.push({ direction: 'outbound', type: 'ORIGINAL', name: selection.outbound.bundle.bundleName, code: selection.outbound.bundle.bundleCode });
      }
      if (hasInbound) {
        if (inboundBundleSwap) {
          expectedBundles.push({ direction: 'inbound', type: 'SWAP', name: inboundBundleSwap.serviceName, code: inboundBundleSwap.serviceCode });
        } else if (selection.inbound?.bundle && !selection.inbound.bundleId.startsWith(`${selection.inbound.offerId}-`)) {
          expectedBundles.push({ direction: 'inbound', type: 'ORIGINAL', name: selection.inbound.bundle.bundleName, code: selection.inbound.bundle.bundleCode });
        }
      }
      console.log('[OfferPriceStep] Expected bundles:', expectedBundles);
      console.log('[OfferPriceStep] Actual bundles count:', bundles.length, 'Expected:', expectedBundles.length);
      if (bundles.length !== expectedBundles.length) {
        console.error('[OfferPriceStep] MISMATCH: Bundle count does not match expected!');
      }
      console.log('[OfferPriceStep] ==========================================');

      // Build SEPARATE ALaCarteOffers grouped by their offerId
      // CRITICAL FIX: Bundles and services from DIFFERENT ALaCarteOffers (different offerIds)
      // must be sent in SEPARATE <SelectedOffer> blocks, NOT combined into one!
      // Example: M202 bundles (offerId: id-v2-...-71212) and 10kg baggage (offerId: id-v2-...-04b29)
      // must be in separate <SelectedOffer> blocks, otherwise Jetstar returns OF4005 error.
      console.log('[OfferPriceStep] ===== GROUPING ALACARTE ITEMS BY OFFER ID =====');

      // Group bundles by their offerId
      const bundlesByOfferId = new Map<string, BundleInfo[]>();
      for (const bundle of bundles) {
        if (!bundle.offerId) {
          console.error('[OfferPriceStep] Bundle missing offerId:', bundle);
          continue;
        }
        const existing = bundlesByOfferId.get(bundle.offerId) || [];
        existing.push(bundle);
        bundlesByOfferId.set(bundle.offerId, existing);
      }

      // Group services by their offerId
      const servicesByOfferId = new Map<string, SelectedServiceForOfferPrice[]>();
      for (const service of nonBundleServices) {
        if (!service.offerId) {
          console.error('[OfferPriceStep] Service missing offerId:', service);
          continue;
        }
        const existing = servicesByOfferId.get(service.offerId) || [];
        existing.push(service);
        servicesByOfferId.set(service.offerId, existing);
      }

      // Get all unique offerIds
      const allOfferIds = new Set([...bundlesByOfferId.keys(), ...servicesByOfferId.keys()]);

      console.log('[OfferPriceStep] Found', allOfferIds.size, 'unique ALaCarteOffer IDs');
      console.log('[OfferPriceStep] Bundle offer IDs:', Array.from(bundlesByOfferId.keys()));
      console.log('[OfferPriceStep] Service offer IDs:', Array.from(servicesByOfferId.keys()));

      // Build separate ALaCarteOffer for each unique offerId
      const aLaCarteOffers: ALaCarteOfferData[] = [];
      for (const offerId of allOfferIds) {
        const bundlesForOffer = bundlesByOfferId.get(offerId) || [];
        const servicesForOffer = servicesByOfferId.get(offerId) || [];

        console.log(`[OfferPriceStep] Building ALaCarteOffer for ${offerId}:`, {
          bundles: bundlesForOffer.length,
          services: servicesForOffer.length,
        });

        const offer = buildCombinedALaCarteOffer(bundlesForOffer, servicesForOffer, offerId);
        if (offer) {
          aLaCarteOffers.push(offer);
        }
      }

      console.log('[OfferPriceStep] Built', aLaCarteOffers.length, 'separate ALaCarteOffer blocks');
      console.log('[OfferPriceStep] ==========================================');

      console.log('[OfferPriceStep] Has inbound:', hasInbound);
      console.log('[OfferPriceStep] Can combine in single call:', canCombine);
      console.log('[OfferPriceStep] Bundles:', bundles);
      console.log('[OfferPriceStep] ALaCarte offers:', aLaCarteOffers);

      let finalData: any;

      // Build selected offers array - flights first, then all a la carte offers
      const buildSelectedOffers = (flightOffers: any[]) => {
        const offers = [...flightOffers];
        // Add all ALaCarte offers (each with unique offerId)
        offers.push(...aLaCarteOffers);
        return offers;
      };

      if (!hasInbound) {
        // One-way trip: single call with outbound only + a la carte
        console.log('[OfferPriceStep] One-way trip: single OfferPrice call');
        console.log('[OfferPriceStep] Outbound offerItems:', outboundFareItems);

        const selectedOffers = buildSelectedOffers([{
          offerId: selection.outbound.offerId,
          ownerCode: 'JQ',
          offerItems: outboundFareItems,
        }]);

        console.log('[OfferPriceStep] Selected offers for request:', selectedOffers);

        const response = await offerPrice({
          shoppingResponseId: flightStore.shoppingResponseId || '',
          selectedOffers,
          distributionChain,
          passengers,
          paymentCardType: selectedPaymentCode,
        });

        const opName = `OfferPrice (${outboundRouteLabel}${aLaCarteOffers.length > 0 ? ' + SSRs' : ''})`;

        // Build annotation with human-readable context
        const annotationCtx = buildOfferPriceAnnotation(
          aLaCarteOffers.length > 0 ? 'Step 4: Verify Total (with Services)' : 'Step 2: Verify Price (One-way)',
          selectedServices
        );
        const annotatedRequest = annotateXml(response.requestXml || '', annotationCtx);

        addCapture({
          operation: opName,
          request: annotatedRequest,
          response: response.responseXml || '',
          duration: response.duration || 0,
          status: 'success',
          userAction: aLaCarteOffers.length > 0 ? 'Priced one-way offer with services' : 'Priced selected one-way offer',
        });

        finalData = parseOfferPriceResponse(response.data);
        console.log('[OfferPriceStep] Parsed:', finalData);

      } else if (canCombine) {
        // Return trip from same shopping response: single call with both offers + a la carte
        console.log('[OfferPriceStep] Return trip (same response ID): single OfferPrice call with both offers');
        console.log('[OfferPriceStep] Outbound offerItems:', outboundFareItems);
        console.log('[OfferPriceStep] Inbound offerItems:', inboundFareItems);

        const selectedOffers = buildSelectedOffers([
          {
            offerId: selection.outbound.offerId,
            ownerCode: 'JQ',
            offerItems: outboundFareItems,
          },
          {
            offerId: selection.inbound!.offerId,
            ownerCode: 'JQ',
            offerItems: inboundFareItems,
          },
        ]);

        console.log('[OfferPriceStep] Selected offers for request:', selectedOffers);

        const response = await offerPrice({
          shoppingResponseId: flightStore.shoppingResponseId || '',
          selectedOffers,
          distributionChain,
          passengers,
          paymentCardType: selectedPaymentCode,
        });

        const opName = `OfferPrice (${outboundRouteLabel} + ${inboundRouteLabel}${aLaCarteOffers.length > 0 ? ' + SSRs' : ''})`;

        // Build annotation with human-readable context
        const annotationCtx = buildOfferPriceAnnotation(
          aLaCarteOffers.length > 0 ? 'Step 4: Verify Total (Return + Services)' : 'Step 2: Verify Price (Return)',
          selectedServices
        );
        const annotatedRequest = annotateXml(response.requestXml || '', annotationCtx);

        addCapture({
          operation: opName,
          request: annotatedRequest,
          response: response.responseXml || '',
          duration: response.duration || 0,
          status: 'success',
          userAction: aLaCarteOffers.length > 0 ? 'Priced return offers with services' : 'Priced selected return offers',
        });

        finalData = parseOfferPriceResponse(response.data);
        console.log('[OfferPriceStep] Combined parsed:', finalData);

      } else {
        // Mixed mode: offers from different shopping responses, need separate calls
        // NOTE: A la carte services go with outbound call for now
        console.log('[OfferPriceStep] Mixed mode (different response IDs): separate OfferPrice calls');

        // Call for outbound + a la carte
        console.log('[OfferPriceStep] Calling OfferPrice for outbound');
        console.log('[OfferPriceStep] Outbound offerItems:', outboundFareItems);

        const outboundSelectedOffers = buildSelectedOffers([{
          offerId: selection.outbound.offerId,
          ownerCode: 'JQ',
          offerItems: outboundFareItems,
        }]);

        const outboundResponse = await offerPrice({
          shoppingResponseId: flightStore.shoppingResponseId || '',
          selectedOffers: outboundSelectedOffers,
          distributionChain,
          passengers,
          paymentCardType: selectedPaymentCode,
        });

        // Build annotation for outbound (mixed mode)
        const outboundAnnotationCtx = buildOfferPriceAnnotation(
          aLaCarteOffers.length > 0 ? 'Step 4: Verify Total (Mixed - Outbound + SSRs)' : 'Step 2: Verify Price (Mixed - Outbound)',
          selectedServices
        );
        const annotatedOutboundRequest = annotateXml(outboundResponse.requestXml || '', outboundAnnotationCtx);

        addCapture({
          operation: `OfferPrice (${outboundRouteLabel}, Mixed${aLaCarteOffers.length > 0 ? ' + SSRs' : ''})`,
          request: annotatedOutboundRequest,
          response: outboundResponse.responseXml || '',
          duration: outboundResponse.duration || 0,
          status: 'success',
          userAction: 'Priced outbound offer (mixed mode)',
        });

        const outboundParsed = parseOfferPriceResponse(outboundResponse.data);
        console.log('[OfferPriceStep] Outbound parsed:', outboundParsed);

        // Call for inbound (no a la carte - already included in outbound)
        console.log('[OfferPriceStep] Calling OfferPrice for inbound');
        console.log('[OfferPriceStep] Inbound offerItems:', inboundFareItems);
        const inboundResponse = await offerPrice({
          shoppingResponseId: flightStore.shoppingResponseId || '',
          selectedOffers: [{
            offerId: selection.inbound!.offerId,
            ownerCode: 'JQ',
            offerItems: inboundFareItems,
          }],
          distributionChain,
          passengers,
          paymentCardType: selectedPaymentCode,
        });

        // Build annotation for inbound (mixed mode)
        const inboundAnnotationCtx = buildOfferPriceAnnotation(
          'Step 2: Verify Price (Mixed - Inbound)',
          []
        );
        const annotatedInboundRequest = annotateXml(inboundResponse.requestXml || '', inboundAnnotationCtx);

        addCapture({
          operation: `OfferPrice (${inboundRouteLabel}, Mixed)`,
          request: annotatedInboundRequest,
          response: inboundResponse.responseXml || '',
          duration: inboundResponse.duration || 0,
          status: 'success',
          userAction: 'Priced inbound offer (mixed mode)',
        });

        const inboundParsed = parseOfferPriceResponse(inboundResponse.data);
        console.log('[OfferPriceStep] Inbound parsed:', inboundParsed);

        // Combine outbound + inbound totals
        finalData = {
          offerId: outboundParsed.offerId,
          totalAmount: outboundParsed.totalAmount + inboundParsed.totalAmount,
          currency: outboundParsed.currency || inboundParsed.currency || 'AUD',
          breakdown: {
            base: outboundParsed.breakdown.base + inboundParsed.breakdown.base,
            taxes: outboundParsed.breakdown.taxes + inboundParsed.breakdown.taxes,
            fees: outboundParsed.breakdown.fees + inboundParsed.breakdown.fees,
            services: (outboundParsed.breakdown.services || 0) + (inboundParsed.breakdown.services || 0),
          },
          paymentFees: outboundParsed.paymentFees || inboundParsed.paymentFees,
          priceGuaranteeExpiry: outboundParsed.priceGuaranteeExpiry || inboundParsed.priceGuaranteeExpiry,
          warnings: [...(outboundParsed.warnings || []), ...(inboundParsed.warnings || [])],
        };
      }

      // Check if request was aborted during API call
      if (signal?.aborted) {
        console.log('[OfferPriceStep] Request aborted during API call, ignoring results');
        return;
      }

      console.log('[OfferPriceStep] Final data:', finalData);

      // =========================================================================
      // TRANSACTION LOGGING: OfferPrice Response Success
      // =========================================================================
      TransactionLogger.logApiCall({
        operation: `OfferPrice (${outboundRouteLabel}${hasInbound ? ` + ${inboundRouteLabel}` : ''})`,
        requestSummary: `Verify price for ${bundles.length} bundle(s), ${nonBundleServices.length} service(s)`,
        responseSummary: `Total: ${finalData.currency} ${finalData.totalAmount.toFixed(2)}`,
        duration: Date.now() - startTime,
        success: true,
      });

      // Log detailed price breakdown
      const priceBreakdownRows: PriceBreakdownRow[] = [
        { label: 'Base Fare', amount: finalData.breakdown.base, currency: finalData.currency },
        { label: 'Taxes', amount: finalData.breakdown.taxes, currency: finalData.currency },
        { label: 'Fees', amount: finalData.breakdown.fees, currency: finalData.currency },
      ];
      if (finalData.breakdown.services > 0) {
        priceBreakdownRows.push({ label: 'Services/Bundles', amount: finalData.breakdown.services, currency: finalData.currency });
      }

      TransactionLogger.logPriceSnapshot(
        'OfferPrice Verified Total',
        finalData.totalAmount,
        finalData.currency,
        priceBreakdownRows
      );

      // Log debug data for investigation
      TransactionLogger.logDebug('OfferPrice Full Response', {
        offerId: finalData.offerId,
        totalAmount: finalData.totalAmount,
        breakdown: finalData.breakdown,
        bundlesIncluded: bundles.length,
        servicesIncluded: nonBundleServices.length,
        priceGuaranteeExpiry: finalData.priceGuaranteeExpiry,
        warnings: finalData.warnings,
      });

      TransactionLogger.completeStep('completed');

      // Override flightBreakdowns route labels using the correct route from flight selection store
      // The backend parser may not correctly build the route for multi-segment journeys
      if (finalData.flightBreakdowns && finalData.flightBreakdowns.length > 0) {
        const outboundRoute = getJourneyRoute(selection.outbound);
        const inboundRoute = selection.inbound ? getJourneyRoute(selection.inbound) : null;

        console.log('[OfferPriceStep] Overriding flightBreakdowns routes:', {
          outboundRoute,
          inboundRoute,
          currentRoutes: finalData.flightBreakdowns.map(fb => fb.route),
        });

        // Override routes based on flight number (1 = outbound, 2 = inbound)
        finalData.flightBreakdowns = finalData.flightBreakdowns.map((breakdown, idx) => {
          // flightNumber 1 is outbound, flightNumber 2 is inbound
          // Or if only one breakdown, it's outbound
          const isOutbound = breakdown.flightNumber === 1 || finalData.flightBreakdowns!.length === 1;
          const correctRoute = isOutbound ? outboundRoute : (inboundRoute || outboundRoute);

          return {
            ...breakdown,
            route: correctRoute,
          };
        });

        console.log('[OfferPriceStep] Updated flightBreakdowns routes:',
          finalData.flightBreakdowns.map(fb => `Flight ${fb.flightNumber}: ${fb.route}`)
        );
      }

      // Only update state if still mounted
      if (isMountedRef.current) {
        setPriceData(finalData);

        // Save OfferPrice data to store for OrderCreate
        // OrderCreate needs: offerId, ownerCode, offerItems with offerItemId and paxRefIds
        if (finalData.pricedOffers && finalData.pricedOffers.length > 0) {
          const primaryOffer = finalData.pricedOffers[0];
          flightStore.setOfferPriceData({
            offerId: primaryOffer.offerId,
            ownerCode: primaryOffer.ownerCode || 'JQ',
            totalAmount: finalData.totalAmount,
            currency: finalData.currency,
            offerItems: primaryOffer.offerItems.map(item => ({
              offerItemId: item.offerItemId,
              paxRefIds: item.paxRefIds,
              segmentRefIds: item.segmentRefIds,
            })),
            responseId: primaryOffer.responseId,
          });
          console.log('[OfferPriceStep] Saved OfferPrice data to store for OrderCreate:', {
            offerId: primaryOffer.offerId,
            offerItemsCount: primaryOffer.offerItems.length,
          });
        }

        // Notify parent of verified price for sidebar display
        if (onPriceVerified) {
          onPriceVerified(finalData.totalAmount);
        }

        // Add price snapshot
        const snapshot = createPriceSnapshot('OfferPrice', finalData);
        const currentSnapshots = (context?.pricingSnapshots as any[]) || [];
        updateContext({
          pricingSnapshots: [...currentSnapshots, snapshot],
          currentPrice: finalData.totalAmount,
          currency: finalData.currency,
        });
      }

    } catch (err: any) {
      // Ignore abort errors - they're expected when cancelling duplicate requests
      if (err.name === 'AbortError' || signal?.aborted) {
        console.log('[OfferPriceStep] Request was aborted');
        return;
      }

      // Only update state if still mounted
      if (!isMountedRef.current) return;

      // Check if this is a bundle unavailability error (OF4053)
      const isBundleUnavailable = err.response?.data?.isBundleUnavailable === true;

      if (isBundleUnavailable) {
        console.warn('[OfferPriceStep] Bundle not available on this route - removing bundle swap and retrying with base fare only');
        TransactionLogger.logWarning('Bundle not available - retrying without bundle swap');

        // Remove bundle swaps from flight store
        // This will trigger useEffect to auto-retry OfferPrice with new selectedServices
        flightStore.setSelectedServices(
          (flightStore.selectedServices || []).filter((s: any) => s.serviceType !== 'bundle'),
          (flightStore.selectedServices || [])
            .filter((s: any) => s.serviceType !== 'bundle')
            .reduce((sum: number, s: any) => sum + (s.price * s.quantity), 0)
        );

        // Show warning to user (will be cleared when retry succeeds)
        setError('The selected bundle is not available on this route. Retrying with base fare + selected extras...');

        // No manual retry needed - useEffect will auto-trigger when selectedServices changes
        return;
      }

      const errorMessage = err.response?.data?.message || err.message || 'Failed to get price';
      setError(errorMessage);

      // Build descriptive operation name for error capture
      const hasInbound = !!selection.inbound;
      const errorRouteLabel = hasInbound
        ? `${outboundRouteLabel} + ${inboundRouteLabel}`
        : outboundRouteLabel;

      const errorOpName = `OfferPrice (${errorRouteLabel})`;

      // Get selected services for error annotation (re-fetch from store since we're in catch block)
      const errorSelectedServices = flightStore.selectedServices as SelectedServiceForOfferPrice[] || [];

      // Build services context for error annotation
      const errorServices: ServiceContext[] = errorSelectedServices.map(svc => ({
        serviceCode: svc.serviceCode,
        serviceName: svc.serviceName,
        serviceType: svc.serviceType,
        quantity: svc.quantity,
        price: svc.price,
        currency: svc.currency,
        passengerRef: svc.paxRefIds?.join(', '),
        segmentRef: svc.segmentRefs?.join(', '),
      }));

      // Build error annotation context
      const errorAnnotationCtx: AnnotationContext = {
        operation: 'OfferPrice (FAILED)',
        stepInWorkflow: 'Price Verification Failed',
        flight: {
          origin,
          destination,
          departureDate: searchCriteria?.departureDate,
          returnDate: searchCriteria?.returnDate,
          passengers: searchCriteria?.passengers,
        },
        outboundOffer: {
          offerId: selection.outbound?.offerId,
          bundleId: selection.outbound?.bundleId,
          bundleName: selection.outbound?.bundle?.bundleName,
          bundleCode: selection.outbound?.bundle?.bundleCode,
          route: `${origin} → ${destination}`,
          direction: 'outbound',
        },
        inboundOffer: selection.inbound ? {
          offerId: selection.inbound.offerId,
          bundleId: selection.inbound.bundleId,
          bundleName: selection.inbound.bundle?.bundleName,
          bundleCode: selection.inbound.bundle?.bundleCode,
          route: `${destination} → ${origin}`,
          direction: 'inbound',
        } : undefined,
        services: errorServices.length > 0 ? errorServices : undefined,
        shoppingResponseId: flightStore.shoppingResponseId || undefined,
        timestamp: new Date(),
        changesSinceLastStep: [
          `ERROR: ${errorMessage}`,
          ...(errorServices.length > 0 ? [`Services attempted: ${errorServices.map(s => s.serviceName || s.serviceCode).join(', ')}`] : []),
        ],
      };

      const annotatedErrorRequest = annotateXml(err.response?.data?.requestXml || '', errorAnnotationCtx);

      addCapture({
        operation: errorOpName,
        request: annotatedErrorRequest,
        response: err.response?.data?.responseXml || err.response?.data?.xml || `<Error><Message>${errorMessage}</Message></Error>`,
        duration: Date.now() - startTime,
        status: 'error',
      });

      // =========================================================================
      // TRANSACTION LOGGING: OfferPrice Error
      // =========================================================================
      TransactionLogger.logApiCall({
        operation: errorOpName,
        requestSummary: 'OfferPrice verification attempt',
        responseSummary: `ERROR: ${errorMessage}`,
        duration: Date.now() - startTime,
        success: false,
        errorMessage,
      });

      TransactionLogger.logError(`OfferPrice API failed: ${errorMessage}`, {
        errorCode: err.response?.status,
        errorData: err.response?.data,
      });

      TransactionLogger.completeStep('failed');
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  };

  const handleContinue = () => {
    if (!priceData) return;

    updateContext({
      verifiedPrice: priceData.totalAmount,
    });

    // Use onComplete prop if provided (from BookingPage), otherwise fallback to workflow nextStep
    if (onComplete) {
      onComplete();
    } else {
      nextStep();
    }
  };

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      previousStep();
    }
  };

  if (isLoading) {
    return (
      <Card className="p-8 text-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary-500 mx-auto mb-4" />
        <p className="text-neutral-600">Verifying price...</p>
      </Card>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <Alert variant="error" title="Price Verification Failed">
          {error}
        </Alert>
        <div className="flex gap-3">
          <Button variant="outline" onClick={handleBack}>Go Back</Button>
          <Button variant="primary" onClick={() => fetchOfferPrice()}>Retry</Button>
        </div>
      </div>
    );
  }

  // Calculate total bundle cost from bundle selections
  const totalBundleCost = bundleSelections.reduce((sum, b) => sum + b.totalBundlePrice, 0);

  // Get services total from store
  const servicesTotal = flightStore.servicesTotal || 0;

  // Pre-OfferPrice total includes flights + bundles + services
  const preOfferPriceTotalWithServices = preOfferPriceTotal + servicesTotal;

  // Check if bundles were successfully included in OfferPrice request
  // If bundle has journeyRefId and is not synthetic, it was added to OfferPrice
  // In that case, priceData.totalAmount already includes bundle costs
  const outboundBundleIncludedInOfferPrice = (() => {
    const sel = flightStore.selection.outbound;
    if (!sel || !sel.bundle) return false;
    const isSynthetic = sel.bundleId.startsWith(`${sel.offerId}-`);
    return !isSynthetic && !!sel.bundle.journeyRefId;
  })();

  const inboundBundleIncludedInOfferPrice = (() => {
    const sel = flightStore.selection.inbound;
    if (!sel || !sel.bundle) return false;
    const isSynthetic = sel.bundleId.startsWith(`${sel.offerId}-`);
    return !isSynthetic && !!sel.bundle.journeyRefId;
  })();

  const bundlesIncludedInOfferPrice = outboundBundleIncludedInOfferPrice || inboundBundleIncludedInOfferPrice;

  // Verified Total = OfferPrice API response total
  // ISSUE: Seats are being sent in request but NOT returned in response - need to investigate
  const offerPriceTotal = priceData.totalAmount;

  console.log('[OfferPriceStep] Bundle inclusion check:', {
    outboundBundleIncluded: outboundBundleIncludedInOfferPrice,
    inboundBundleIncluded: inboundBundleIncludedInOfferPrice,
    bundlesIncludedInOfferPrice,
    totalBundleCost,
    offerPriceRaw: priceData.totalAmount,
    offerPriceTotal,
  });

  // Check if user swapped bundles in ServiceList step
  const storeSelectedServices = flightStore.selectedServices || [];
  const bundleSwaps = storeSelectedServices.filter((s: { serviceType: string; serviceName: string }) => s.serviceType === 'bundle');
  const hasBundleSwaps = bundleSwaps.length > 0;

  // Get original AirShopping total (flights + original bundles) for like-for-like comparison
  // This is set when user clicks Continue in AirShopping and never changes during bundle swaps
  const originalAirShoppingTotal = flightStore.originalAirShoppingTotal;

  // Bundle swap comparison: Original AirShopping price vs OfferPrice (with new bundles)
  // This shows the impact of changing bundles only (excludes ancillaries/services)
  const bundleSwapDifference = hasBundleSwaps && originalAirShoppingTotal !== null
    ? priceData.totalAmount - originalAirShoppingTotal  // Compare OfferPrice total vs original
    : 0;
  const hasBundleSavings = bundleSwapDifference < -0.01;
  const hasBundleCostIncrease = bundleSwapDifference > 0.01;

  // Calculate price difference (comparing apples to apples: both WITHOUT services)
  // This compares AirShopping estimate (flights + bundles) vs OfferPrice verified total (flights + bundles)
  // Services are NOT included in this comparison because they are not part of OfferPrice
  const priceDifference = offerPriceTotal - preOfferPriceTotal;
  const priceMatches = Math.abs(priceDifference) < 0.01; // Within 1 cent
  const priceIncreased = priceDifference > 0.01;
  const priceDecreased = priceDifference < -0.01;
  const differencePercentage = preOfferPriceTotal > 0 ? (priceDifference / preOfferPriceTotal) * 100 : 0;

  // Debug logging for price comparison
  console.log('[OfferPriceStep] Price comparison:', {
    offerPriceRaw: priceData.totalAmount,
    offerPriceTotal,  // After bundle adjustment
    totalBundleCost,
    bundlesIncludedInOfferPrice,
    servicesTotal,
    preOfferPriceTotal,
    preOfferPriceTotalWithServices,
    difference: priceDifference,
    percentDiff: differencePercentage,
    matches: priceMatches,
    breakdownServices: priceData.breakdown.services,
    airShoppingPrices,
    // Bundle swap comparison
    hasBundleSwaps,
    originalAirShoppingTotal,
    bundleSwapDifference,
    hasBundleSavings,
    bundleSwapNames: bundleSwaps.map((b: { serviceName: string }) => b.serviceName),
  });

  return (
    <div className="space-y-6 pb-24">
      {/* Bundle Swap Comparison - PRIMARY display when user changed bundles in ServiceList */}
      {/* This is shown INSTEAD of the standard Price Verification when bundles were swapped */}
      {hasBundleSwaps && originalAirShoppingTotal !== null ? (
        <Card className={`p-6 ${hasBundleSavings ? 'border-green-200 bg-green-50' : hasBundleCostIncrease ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-slate-50'}`}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-neutral-900 flex items-center gap-2">
              <Package className="w-6 h-6 text-primary-500" />
              Bundle Change Impact
            </h2>
            {hasBundleSavings && (
              <Badge variant="success" className="flex items-center gap-1">
                <CheckCircle className="w-4 h-4" />
                Savings Applied
              </Badge>
            )}
            {hasBundleCostIncrease && (
              <Badge variant="warning" className="flex items-center gap-1">
                <AlertTriangle className="w-4 h-4" />
                Added Cost
              </Badge>
            )}
            {!hasBundleSavings && !hasBundleCostIncrease && (
              <Badge variant="secondary" className="flex items-center gap-1">
                <Equal className="w-4 h-4" />
                No Change
              </Badge>
            )}
          </div>

          <div className="grid grid-cols-3 gap-4">
            {/* Original AirShopping (Flights + Original Bundles) */}
            <div className="bg-white rounded-lg p-4 border border-slate-200">
              <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Original Selection</p>
              <p className="text-2xl font-bold text-slate-700">
                {formatCurrency(originalAirShoppingTotal, priceData.currency)}
              </p>
              <p className="text-xs text-slate-400 mt-1">Flights + original bundles</p>
            </div>

            {/* Arrow with difference */}
            <div className="flex flex-col items-center justify-center">
              {hasBundleSavings ? (
                <div className="flex flex-col items-center text-green-600">
                  <ArrowDownRight className="w-8 h-8" />
                  <span className="text-lg font-bold">{formatCurrency(bundleSwapDifference, priceData.flightBreakdowns?.[0]?.currency || bundleSelections?.[0]?.currency || priceData.currency)}</span>
                  <span className="text-xs">You save</span>
                </div>
              ) : hasBundleCostIncrease ? (
                <div className="flex flex-col items-center text-amber-600">
                  <ArrowUpRight className="w-8 h-8" />
                  <span className="text-lg font-bold">+{formatCurrency(bundleSwapDifference, priceData.flightBreakdowns?.[0]?.currency || bundleSelections?.[0]?.currency || priceData.currency)}</span>
                  <span className="text-xs">Added cost</span>
                </div>
              ) : (
                <div className="flex flex-col items-center text-slate-500">
                  <Equal className="w-8 h-8" />
                  <span className="text-sm font-medium mt-1">No change</span>
                </div>
              )}
            </div>

            {/* OfferPrice with new bundles */}
            <div className={`rounded-lg p-4 border-2 ${hasBundleSavings ? 'bg-green-100 border-green-300' : hasBundleCostIncrease ? 'bg-amber-100 border-amber-300' : 'bg-slate-100 border-slate-300'}`}>
              <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">After Bundle Change</p>
              <p className={`text-2xl font-bold ${hasBundleSavings ? 'text-green-700' : hasBundleCostIncrease ? 'text-amber-700' : 'text-slate-700'}`}>
                {formatCurrency(priceData.totalAmount, priceData.flightBreakdowns?.[0]?.currency || bundleSelections?.[0]?.currency || priceData.currency)}
              </p>
              <p className="text-xs text-slate-400 mt-1">
                New: {bundleSwaps.map((b: { serviceName: string }) => b.serviceName).join(', ')}
              </p>
            </div>
          </div>

          <p className="text-xs text-slate-500 mt-4 italic">
            Comparing flights + bundles only (excludes ancillaries). Price verified by OfferPrice API.
          </p>
        </Card>
      ) : (
        /* Standard Price Verification - shown when NO bundle swaps occurred */
        <Card className={`p-6 ${priceMatches ? 'border-green-200 bg-green-50' : priceIncreased ? 'border-amber-200 bg-amber-50' : 'border-blue-200 bg-blue-50'}`}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-neutral-900 flex items-center gap-2">
              <DollarSign className="w-6 h-6 text-primary-500" />
              Price Verification
            </h2>
            {priceMatches ? (
              <Badge variant="success" className="flex items-center gap-1">
                <CheckCircle className="w-4 h-4" />
                Price Match
              </Badge>
            ) : (
              <Badge variant="warning" className="flex items-center gap-1">
                <AlertTriangle className="w-4 h-4" />
                Price Mismatch
              </Badge>
            )}
          </div>

          {/* Side-by-side Comparison */}
          <div className="grid grid-cols-3 gap-4">
            {/* Pre-OfferPrice (AirShopping only - does NOT include services) */}
            <div className="bg-white rounded-lg p-4 border border-neutral-200">
              <p className="text-xs text-neutral-500 uppercase tracking-wide mb-1">AirShopping Estimate</p>
              <p className="text-2xl font-bold text-neutral-700">
                {formatCurrency(preOfferPriceTotal, priceData.flightBreakdowns?.[0]?.currency || bundleSelections?.[0]?.currency || priceData.currency)}
              </p>
              <p className="text-xs text-neutral-400 mt-1">
                Base fares + bundles (taxes estimated)
              </p>
            </div>

            {/* Difference Arrow */}
            <div className="flex flex-col items-center justify-center">
              {priceMatches ? (
                <div className="flex flex-col items-center text-green-600">
                  <Equal className="w-8 h-8" />
                  <span className="text-sm font-medium mt-1">Match</span>
                </div>
              ) : priceIncreased ? (
                <div className="flex flex-col items-center text-amber-600">
                  <ArrowUpRight className="w-8 h-8" />
                  <span className="text-lg font-bold">+{formatCurrency(priceDifference, priceData.flightBreakdowns?.[0]?.currency || bundleSelections?.[0]?.currency || priceData.currency)}</span>
                  <span className="text-xs">+{differencePercentage.toFixed(1)}%</span>
                </div>
              ) : (
                <div className="flex flex-col items-center text-blue-600">
                  <ArrowDownRight className="w-8 h-8" />
                  <span className="text-lg font-bold">{formatCurrency(priceDifference, priceData.flightBreakdowns?.[0]?.currency || bundleSelections?.[0]?.currency || priceData.currency)}</span>
                  <span className="text-xs">{differencePercentage.toFixed(1)}%</span>
                </div>
              )}
            </div>

            {/* OfferPrice (Verified) - bundles included in total when successfully priced */}
            <div className={`rounded-lg p-4 border-2 ${priceMatches ? 'bg-green-100 border-green-300' : priceIncreased ? 'bg-amber-100 border-amber-300' : priceDecreased ? 'bg-blue-100 border-blue-300' : 'bg-neutral-100 border-neutral-300'}`}>
              <p className="text-xs text-neutral-500 uppercase tracking-wide mb-1">Verified Total</p>
              <p className={`text-2xl font-bold ${priceMatches ? 'text-green-700' : priceIncreased ? 'text-amber-700' : priceDecreased ? 'text-blue-700' : 'text-neutral-700'}`}>
                {formatCurrency(offerPriceTotal, priceData.flightBreakdowns?.[0]?.currency || bundleSelections?.[0]?.currency || priceData.currency)}
              </p>
              <p className="text-xs text-neutral-400 mt-1">
                {bundlesIncludedInOfferPrice
                  ? 'Fares + Bundles (verified)'
                  : totalBundleCost > 0
                    ? `Fares ${formatCurrency(priceData.totalAmount, priceData.flightBreakdowns?.[0]?.currency || bundleSelections?.[0]?.currency || priceData.currency)} + Bundles ${formatCurrency(totalBundleCost, priceData.flightBreakdowns?.[0]?.currency || bundleSelections?.[0]?.currency || priceData.currency)}`
                    : 'Verified price'}
              </p>
            </div>
          </div>

          {/* Price Difference Note */}
          {!priceMatches && (
            <div className={`mt-4 p-3 rounded-lg ${priceIncreased ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'}`}>
              <p className="text-sm">
                <strong>{priceIncreased ? 'Price Increase:' : 'Price Decrease:'}</strong> The verified price differs from the AirShopping estimate by{' '}
                <strong>{formatCurrency(Math.abs(priceDifference), priceData.flightBreakdowns?.[0]?.currency || bundleSelections?.[0]?.currency || priceData.currency)}</strong>.
                {priceIncreased
                  ? ' AirShopping provides initial fare estimates. OfferPrice includes detailed taxes, fees, and any fare adjustments. This difference is normal, especially for multi-passenger bookings.'
                  : ' The actual price is lower than estimated - you\'re getting a better deal!'}
              </p>
            </div>
          )}
        </Card>
      )}

      {/* Detailed Flight-Level Price Breakdown */}
      {priceData.flightBreakdowns && priceData.flightBreakdowns.length > 0 ? (
        <FlightPriceBreakdownPanel
          breakdowns={priceData.flightBreakdowns}
          airShoppingPrices={airShoppingPrices}
          bundleSelections={bundleSelections}
          selectedServices={flightStore.selectedServices as any[]}
          grandTotal={offerPriceTotal}
          currency={priceData.currency}
          onMismatchDetected={handleMismatchDetected}
          bundlesIncludedInGrandTotal={bundlesIncludedInOfferPrice}
        />
      ) : (
        <Card className="p-6">
          <h3 className="text-lg font-semibold text-neutral-900 mb-4">OfferPrice Breakdown</h3>
          <div className="space-y-3">
            <div className="flex justify-between text-neutral-600">
              <span>Base Fare</span>
              <span>{formatCurrency(priceData.breakdown.base, priceData.currency)}</span>
            </div>
            <div className="flex justify-between text-neutral-600">
              <span>Taxes & Fees</span>
              <span>{formatCurrency(priceData.breakdown.taxes + priceData.breakdown.fees, priceData.currency)}</span>
            </div>
            {priceData.breakdown.services > 0 && (
              <div className="flex justify-between text-neutral-600">
                <span>Services (Bundles)</span>
                <span>{formatCurrency(priceData.breakdown.services, priceData.currency)}</span>
              </div>
            )}
            <div className="border-t pt-3 flex justify-between font-bold text-lg">
              <span>Total</span>
              <span className="text-primary-600">{formatCurrency(priceData.totalAmount, priceData.currency)}</span>
            </div>
          </div>
        </Card>
      )}

      {/* Selected Services Summary - Brief indicator that services are included */}
      {(() => {
        const selectedServices = flightStore.selectedServices as SelectedServiceForOfferPrice[] || [];
        if (selectedServices.length === 0) return null;

        // Calculate total services cost
        const servicesTotalCost = selectedServices.reduce((sum, s) => sum + (s.price * s.quantity), 0);
        const currency = selectedServices[0]?.currency || priceData.currency;

        return (
          <Card className="p-4 bg-purple-50 border-purple-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Package className="w-5 h-5 text-purple-600" />
                <span className="font-medium text-purple-800">
                  {selectedServices.length} Service{selectedServices.length > 1 ? 's' : ''} Selected
                </span>
              </div>
              <span className="font-bold text-purple-700">
                {formatCurrency(servicesTotalCost, currency)}
              </span>
            </div>
            <p className="text-xs text-purple-600 mt-1">
              See sidebar for full breakdown
            </p>
          </Card>
        );
      })()}

      {/* Price Guarantee */}
      {priceData.priceGuaranteeExpiry && (
        <Card className="p-4">
          <div className="flex items-center gap-2 text-sm text-neutral-500">
            <Clock className="w-4 h-4" />
            Price guaranteed until {new Date(priceData.priceGuaranteeExpiry).toLocaleTimeString()}
          </div>
        </Card>
      )}

      {/* Price Progression */}
      {(() => {
        const snapshots = (context?.pricingSnapshots as any[]) || [];
        return snapshots.length > 1 ? (
          <PriceComparisonPanel
            snapshots={snapshots}
            showBreakdown
          />
        ) : null;
      })()}

      {/* Navigation - Fixed footer style to match AppLayout */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 shadow-lg z-40">
        <div className="max-w-5xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <button
              onClick={handleBack}
              className="flex items-center gap-2 px-4 py-2 text-slate-600 hover:text-slate-900"
            >
              <ArrowLeft className="w-4 h-4" />
              Previous
            </button>
            <button
              onClick={handleContinue}
              disabled={!priceData}
              className="flex items-center gap-2 px-6 py-2.5 bg-orange-500 hover:bg-orange-600 disabled:bg-slate-200 disabled:text-slate-400 text-white font-semibold rounded-xl"
            >
              {stepId === 'offer-price-flight' ? 'Continue to Add Extras' : stepId === 'offer-price-services' ? 'Continue to Seat Selection' : 'Passengers'}
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
