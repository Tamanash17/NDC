import type { FlightOffer, FlightJourney, FlightSegment, BundleOption, AirShoppingPriceBreakdown, OfferItemWithPax, PerPaxTypePricing } from '@/components/flights';

export interface ParsedAirShoppingResponse {
  shoppingResponseId: string;
  offers: FlightOffer[];
  warnings?: string[];
  errors?: string[];
}

// Backend response types (what comes from the API)
interface BackendSegment {
  paxSegmentId: string;
  origin: string;
  destination: string;
  departureDate: string;
  departureTime?: string;
  arrivalDate?: string;
  arrivalTime?: string;
  marketingCarrier?: {
    airlineCode: string;
    flightNumber: string;
  };
  operatingCarrier?: {
    airlineCode: string;
    flightNumber?: string;
  };
  equipment?: {
    aircraftCode: string;
    aircraftName?: string;
  };
  duration?: string;
  cabinCode?: string;
  classOfService?: string;
}

interface BackendOfferItem {
  offerItemId: string;
  paxRefIds: string[];
  baseAmount?: { value: number; currency: string };
  taxAmount?: { value: number; currency: string };
  totalAmount: { value: number; currency: string };
  fareBasisCode?: string;
  cabinType?: string;
  rbd?: string;
  segmentRefIds?: string[];
}

// Bundle inclusion from API
interface BackendBundleInclusion {
  serviceCode: string;
  name: string;
  description?: string;
}

// Bundle offer item from AddlOfferItem
interface BackendBundleOffer {
  offerItemId: string;
  serviceDefinitionRefId: string;
  serviceCode: string;
  bundleName: string;
  description?: string;
  price: { value: number; currency: string };
  paxRefIds: string[];
  // Per-passenger-type offerItemIds - bundles have different IDs for ADT, CHD, INF
  paxOfferItemIds?: Record<string, string>;
  // Journey ref from ALaCarteOffer - MUST use for OfferPrice requests
  // Format: e.g., "fl913653037" - different from PaxJourneyID
  journeyRefId?: string;
  // Inclusions from ServiceBundle parsing
  inclusions?: {
    baggage: BackendBundleInclusion[];
    seats: BackendBundleInclusion[];
    meals: BackendBundleInclusion[];
    other: BackendBundleInclusion[];
  };
}

interface BackendOffer {
  offerId: string;
  ownerCode: string;
  totalPrice: { value: number; currency: string };
  expirationDateTime?: string;
  offerItems: BackendOfferItem[];
  bundleOffers?: BackendBundleOffer[];
}

interface BackendDataLists {
  paxJourneyList: Array<{
    paxJourneyId: string;
    segmentRefIds: string[];
    duration?: string;
  }>;
  paxSegmentList: BackendSegment[];
}

interface BackendResponse {
  success: boolean;
  offers: BackendOffer[];
  dataLists: BackendDataLists;
  shoppingResponseId?: string;
  errors?: Array<{ code: string; message: string }>;
}

// Known bundle codes and their display info
// Jetstar uses codes like S050, P200, M201, F204
const BUNDLE_CONFIG: Record<string, { name: string; tier: number; inclusions: BundleOption['inclusions'] }> = {
  // Generic bundle names (fallback)
  'STARTER': {
    name: 'Starter',
    tier: 1,
    inclusions: {
      baggage: '7kg carry-on',
      meals: false,
      seatSelection: false,
      changes: 'Fee applies',
      cancellation: 'Non-refundable',
    },
  },
  'PLUS': {
    name: 'Plus',
    tier: 2,
    inclusions: {
      baggage: '20kg checked bag',
      meals: false,
      seatSelection: true,
      changes: 'Fee applies',
      cancellation: 'Credit voucher',
    },
  },
  'MAX': {
    name: 'Max',
    tier: 3,
    inclusions: {
      baggage: '30kg checked bag',
      meals: true,
      seatSelection: true,
      changes: 'Included',
      cancellation: 'Refundable',
    },
  },
  'BIZMAX': {
    name: 'Business Max',
    tier: 4,
    inclusions: {
      baggage: '30kg checked bag',
      meals: true,
      seatSelection: true,
      changes: 'Included',
      cancellation: 'Refundable',
    },
  },
  // Jetstar-specific bundle codes
  'S050': {
    name: 'Starter',
    tier: 1,
    inclusions: {
      baggage: '7kg carry-on',
      meals: false,
      seatSelection: false,
      changes: 'Fee applies',
      cancellation: 'Non-refundable',
    },
  },
  'P200': {
    name: 'Plus',
    tier: 2,
    inclusions: {
      baggage: '20kg checked bag',
      meals: false,
      seatSelection: true,
      changes: 'Fee applies',
      cancellation: 'Credit voucher',
    },
  },
  'M201': {
    name: 'Max',
    tier: 3,
    inclusions: {
      baggage: '30kg checked bag',
      meals: true,
      seatSelection: true,
      changes: 'Included',
      cancellation: 'Refundable',
    },
  },
  'F204': {
    name: 'Flex Max',
    tier: 4,
    inclusions: {
      baggage: '30kg checked bag',
      meals: true,
      seatSelection: true,
      changes: 'Included',
      cancellation: 'Refundable',
    },
  },
  // Business class bundles
  'B050': {
    name: 'Business',
    tier: 4,
    inclusions: {
      baggage: '30kg checked bag',
      meals: true,
      seatSelection: true,
      changes: 'Included',
      cancellation: 'Refundable',
    },
  },
  'B200': {
    name: 'Business Plus',
    tier: 4,
    inclusions: {
      baggage: '30kg checked bag',
      meals: true,
      seatSelection: true,
      changes: 'Included',
      cancellation: 'Refundable',
    },
  },
};

export function parseAirShoppingResponse(data: any): ParsedAirShoppingResponse {
  console.log('[Parser] Input data:', data);

  // Handle wrapper response from backend route
  const response: BackendResponse = data.parsed || data;

  console.log('[Parser] Response after unwrap:', response);
  console.log('[Parser] response.success:', response.success);
  console.log('[Parser] response.offers:', response.offers);

  // Check for errors
  if (!response.success || response.errors?.length) {
    console.log('[Parser] Returning early due to errors');
    return {
      shoppingResponseId: '',
      offers: [],
      errors: response.errors?.map(e => e.message) || ['Unknown error'],
    };
  }

  const shoppingResponseId = response.shoppingResponseId || '';
  console.log('[Parser] shoppingResponseId:', shoppingResponseId);

  // Create a map of segments for quick lookup
  const segmentMap = new Map<string, BackendSegment>();
  for (const seg of response.dataLists?.paxSegmentList || []) {
    const id = seg.paxSegmentId;
    segmentMap.set(id, seg);
    // Also index without prefix (Mkt-seg123 -> seg123)
    if (id.startsWith('Mkt-')) {
      segmentMap.set(id.substring(4), seg);
    }
    // Also index without any prefix
    const numericMatch = id.match(/(\d+)$/);
    if (numericMatch) {
      segmentMap.set(numericMatch[1], seg);
    }
  }

  // Create a map of segment refs to actual PaxJourneyID and duration
  // This is critical - we need the REAL journey ID from the API for OfferPrice requests
  const segmentRefsToJourneyId = new Map<string, string>();
  const segmentRefsToJourneyDuration = new Map<string, string>(); // Store API-provided duration
  for (const journey of response.dataLists?.paxJourneyList || []) {
    const key = [...new Set(journey.segmentRefIds)].sort().join('|');
    segmentRefsToJourneyId.set(key, journey.paxJourneyId);
    if (journey.duration) {
      segmentRefsToJourneyDuration.set(key, journey.duration);
    }
    console.log(`[Parser] Journey mapping: ${key} -> ${journey.paxJourneyId}, duration: ${journey.duration || 'not provided'}`);
  }

  // Transform backend offers to frontend FlightOffer format
  const offers: FlightOffer[] = [];

  // Group offers by unique journey (unique set of segments)
  const offersBySegments = new Map<string, BackendOffer[]>();

  for (const offer of response.offers || []) {
    // Get all segment refs from offer items
    const segmentRefs: string[] = [];
    for (const item of offer.offerItems) {
      if (item.segmentRefIds) {
        segmentRefs.push(...item.segmentRefIds);
      }
    }

    // Create a unique key for this segment combination
    const key = [...new Set(segmentRefs)].sort().join('|');

    if (!offersBySegments.has(key)) {
      offersBySegments.set(key, []);
    }
    offersBySegments.get(key)!.push(offer);
  }

  // Now create FlightOffers for each unique journey
  let journeyIndex = 0;
  for (const [, relatedOffers] of offersBySegments) {
    if (relatedOffers.length === 0) continue;

    const firstOffer = relatedOffers[0];
    console.log('[Parser] Processing offer:', firstOffer.offerId, 'bundleOffers?', !!firstOffer.bundleOffers, 'count:', firstOffer.bundleOffers?.length || 0);

    // Get segment refs from first offer
    const segmentRefs: string[] = [];
    for (const item of firstOffer.offerItems) {
      if (item.segmentRefIds) {
        segmentRefs.push(...item.segmentRefIds);
      }
    }
    const uniqueSegmentRefs = [...new Set(segmentRefs)];

    // Build segments for this journey
    const segments: FlightSegment[] = uniqueSegmentRefs
      .map(refId => {
        const seg = segmentMap.get(refId);
        if (!seg) return null;
        return transformSegment(seg);
      })
      .filter((s): s is FlightSegment => s !== null);

    if (segments.length === 0) continue;

    // Get the segment key for looking up journey info
    const segmentKey = uniqueSegmentRefs.sort().join('|');

    // Calculate journey duration - prefer API-provided duration, then calculate from times
    let totalDuration = 0;
    const apiDuration = segmentRefsToJourneyDuration.get(segmentKey);

    if (apiDuration) {
      // Use API-provided journey duration (most accurate)
      totalDuration = parseDuration(apiDuration);
      console.log(`[Parser] Using API duration for ${segmentKey}: ${apiDuration} = ${totalDuration} minutes`);
    } else if (segments.length === 1) {
      // Single segment - use the segment's own duration
      totalDuration = segments[0].duration;
    } else {
      // Multi-segment - calculate from first departure to last arrival (includes layovers)
      const rawSegments = uniqueSegmentRefs
        .map(refId => segmentMap.get(refId))
        .filter((s): s is BackendSegment => s !== null);

      if (rawSegments.length > 1) {
        const firstRaw = rawSegments[0];
        const lastRaw = rawSegments[rawSegments.length - 1];
        totalDuration = calculateDuration(
          firstRaw.departureDate,
          firstRaw.departureTime || '',
          lastRaw.arrivalDate || lastRaw.departureDate,
          lastRaw.arrivalTime || ''
        );
      } else {
        // Fallback to sum of segment durations
        totalDuration = segments.reduce((total, seg) => total + seg.duration, 0);
      }
    }

    // Get the REAL PaxJourneyID from the API response - critical for OfferPrice requests
    const realJourneyId = segmentRefsToJourneyId.get(segmentKey);
    if (!realJourneyId) {
      console.warn(`[Parser] Could not find real PaxJourneyID for segments: ${segmentKey}, using fallback`);
    }

    const journey: FlightJourney = {
      journeyId: realJourneyId || `journey-${journeyIndex++}`,  // Use real ID, fallback to synthetic if not found
      segments,
      totalDuration,
      stops: Math.max(0, segments.length - 1),
    };
    console.log(`[Parser] Created journey with ID: ${journey.journeyId} for segments: ${segmentKey}`);

    // Build bundles from the offer
    const currency = firstOffer.totalPrice.currency;

    const bundles: BundleOption[] = [];
    let hasStarterFromApi = false;

    // First, check if we have bundle offers from the API
    if (firstOffer.bundleOffers && firstOffer.bundleOffers.length > 0) {
      console.log('[Parser] Found bundleOffers:', firstOffer.bundleOffers);

      // GROUP bundle offers by serviceCode - same bundle type may have different offerItemIds per passenger type
      // Key: bundleCode (serviceCode uppercase), Value: array of bundle offers with same code
      const bundlesByCode = new Map<string, BackendBundleOffer[]>();

      for (const bundleOffer of firstOffer.bundleOffers) {
        console.log('[Parser] bundleOffer:', JSON.stringify(bundleOffer, null, 2));
        const bundleCode = bundleOffer.serviceCode.toUpperCase();
        console.log('[Parser] Extracted bundleCode:', bundleCode);
        if (!bundlesByCode.has(bundleCode)) {
          bundlesByCode.set(bundleCode, []);
        }
        bundlesByCode.get(bundleCode)!.push(bundleOffer);
      }

      console.log('[Parser] Grouped bundles by code:', Array.from(bundlesByCode.keys()));

      // Process each bundle type (grouped by serviceCode)
      for (const [bundleCode, bundleOffers] of bundlesByCode) {
        const configFallback = BUNDLE_CONFIG[bundleCode] || BUNDLE_CONFIG['PLUS'];

        // Determine tier based on bundle code pattern
        let tier = configFallback.tier;
        if (bundleCode.startsWith('S') || bundleCode === 'STARTER') tier = 1;
        else if (bundleCode.startsWith('P') || bundleCode === 'PLUS') tier = 2;
        else if (bundleCode.startsWith('M') || bundleCode === 'MAX') tier = 3;
        else if (bundleCode.startsWith('F') || bundleCode.startsWith('B') || bundleCode === 'BIZMAX' || bundleCode === 'FLEX') tier = 4;

        // Check if this is a starter bundle
        const isStarterBundle = tier === 1;
        if (isStarterBundle) {
          hasStarterFromApi = true;
        }

        // Use first bundle offer as representative for common properties
        const firstBundleOffer = bundleOffers[0];

        // For starter bundles, price is always $0 (upgrade cost)
        // For other bundles, use the API price (upgrade cost from base fare)
        const bundlePrice = isStarterBundle ? 0 : firstBundleOffer.price.value;

        // Build inclusions from API data if available, otherwise use fallback
        let inclusions: BundleOption['inclusions'];
        if (firstBundleOffer.inclusions) {
          // Use actual inclusions from API
          const apiInclusions = firstBundleOffer.inclusions;

          // Format baggage - combine all baggage inclusions
          const baggageItems = apiInclusions.baggage.map(b => b.name || b.serviceCode).join(', ');

          // Check if seats are included
          const hasSeatSelection = apiInclusions.seats.length > 0;

          // Check if meals are included
          const hasMeals = apiInclusions.meals.length > 0;

          // Format other inclusions
          const otherItems = apiInclusions.other.map(o => o.name || o.serviceCode);

          inclusions = {
            baggage: baggageItems || '7kg carry-on',
            meals: hasMeals,
            seatSelection: hasSeatSelection,
            changes: tier >= 3 ? 'Included' : 'Fee applies',
            cancellation: tier >= 3 ? 'Refundable' : (tier === 2 ? 'Credit voucher' : 'Non-refundable'),
            otherInclusions: otherItems.length > 0 ? otherItems : undefined,
          };
        } else {
          // Use fallback config
          inclusions = configFallback.inclusions;
        }

        // Use name from API if available, otherwise from config
        const bundleName = firstBundleOffer.bundleName || configFallback.name || bundleCode;

        // GET per-passenger offerItemId mapping
        // NEW: Backend now provides this directly via paxOfferItemIds
        // Fallback: Build it from grouped bundleOffers (for backwards compatibility)
        let paxOfferItemIds: Record<string, string> = {};

        // Use backend-provided paxOfferItemIds if available (from first bundleOffer)
        if (firstBundleOffer.paxOfferItemIds && Object.keys(firstBundleOffer.paxOfferItemIds).length > 0) {
          paxOfferItemIds = { ...firstBundleOffer.paxOfferItemIds };
          console.log(`[Parser] Bundle ${bundleCode} using backend paxOfferItemIds:`, paxOfferItemIds);
        } else {
          // Fallback: build from grouped bundleOffers (legacy)
          for (const bundleOffer of bundleOffers) {
            for (const paxRefId of bundleOffer.paxRefIds || []) {
              paxOfferItemIds[paxRefId] = bundleOffer.offerItemId;
            }
          }
          console.log(`[Parser] Bundle ${bundleCode} built paxOfferItemIds from grouped offers:`, paxOfferItemIds);
        }

        bundles.push({
          bundleId: firstBundleOffer.offerItemId, // Keep for backwards compatibility, use first offer's ID
          bundleName,
          bundleCode,
          description: firstBundleOffer.description,
          price: bundlePrice,
          currency: firstBundleOffer.price.currency || currency,
          tier,
          isRecommended: false, // No automatic recommendation
          inclusions,
          paxOfferItemIds, // Per-passenger offerItemId mapping
          journeyRefId: firstBundleOffer.journeyRefId, // Journey ref for OfferPrice - MUST use this, not journey.journeyId
        });
      }
    } else {
      console.log('[Parser] No bundleOffers found for offer:', firstOffer.offerId);
    }

    // Check if we already have a $0 "included" bundle from API
    // For Economy, this would be S050 (Starter)
    // For Business, this would be B050 (Business)
    const hasIncludedBundle = bundles.some(b => b.price === 0);

    // Only add synthetic Starter bundle if:
    // 1. No Starter from API AND
    // 2. No other $0 "included" bundle (like B050 for Business class)
    if (!hasStarterFromApi && !hasIncludedBundle) {
      bundles.push({
        bundleId: `${firstOffer.offerId}-starter`,
        bundleName: 'Starter',
        bundleCode: 'STARTER',
        price: 0, // Starter is always $0
        currency,
        tier: 1,
        isRecommended: false,
        inclusions: BUNDLE_CONFIG['STARTER'].inclusions,
      });
    }

    // Sort bundles by tier
    bundles.sort((a, b) => a.tier - b.tier);

    // Extract fare info from first offer item
    const firstOfferItem = firstOffer.offerItems[0];
    const fareBasisCode = firstOfferItem?.fareBasisCode;
    const cabinType = firstOfferItem?.cabinType;
    const rbd = firstOfferItem?.rbd;

    // Extract base offer item IDs - needed for OfferPrice along with bundle ID
    const offerItemIds = firstOffer.offerItems.map(item => item.offerItemId);

    // NEW: Build per-item paxRefIds for correct OfferPrice request structure
    // Each SelectedOfferItem should only include its own passenger's PaxRefID
    const offerItemsWithPax: OfferItemWithPax[] = firstOffer.offerItems.map(item => ({
      offerItemId: item.offerItemId,
      paxRefIds: item.paxRefIds || [],
    }));

    // Extract unique paxRefIds from all offer items - needed for OfferPrice (legacy)
    const allPaxRefIds = new Set<string>();
    for (const item of firstOffer.offerItems) {
      for (const paxId of item.paxRefIds || []) {
        allPaxRefIds.add(paxId);
      }
    }
    const paxRefIds = Array.from(allPaxRefIds);

    // Calculate price breakdown from offer items (for OfferPrice comparison)
    // This aggregates baseAmount and taxAmount from ALL related offers (not just first offer)
    // Jetstar splits prices into TWO structures:
    // 1. offer.offerItems - BASE FARES with taxes (from PriceGuaranteeOffer)
    // 2. offer.bundleOffers - BUNDLE PRICES (from ALaCarteOffer)
    // WE MUST AGGREGATE BOTH!
    let totalBaseAmount = 0;
    let totalTaxAmount = 0;
    let totalBundleAmount = 0;
    const allOfferItems: BackendOfferItem[] = [];
    const allBundleOffers: BackendBundleOffer[] = [];

    for (const offer of relatedOffers) {
      // Aggregate flight base fares and taxes
      allOfferItems.push(...offer.offerItems);
      for (const item of offer.offerItems) {
        if (item.baseAmount) {
          totalBaseAmount += item.baseAmount.value;
        }
        if (item.taxAmount) {
          totalTaxAmount += item.taxAmount.value;
        }
      }

      // CRITICAL FIX: Also aggregate bundle prices!
      // bundleOffers contain the upgrade prices (e.g., Starter Plus, Flex, etc.)
      if (offer.bundleOffers && offer.bundleOffers.length > 0) {
        allBundleOffers.push(...offer.bundleOffers);
        for (const bundle of offer.bundleOffers) {
          totalBundleAmount += bundle.price.value;
        }
      }
    }

    console.log('═══════════════════════════════════════════════════════════════');
    console.log('[Parser] 💰 PRICE AGGREGATION - Journey:', segments.map(s => s.departureAirport + '→' + s.arrivalAirport).join(', '));
    console.log('[Parser] Aggregating from', relatedOffers.length, 'related offers');
    console.log('[Parser]  ✈️  Flight items:', allOfferItems.length, '→ baseAmount:', totalBaseAmount.toFixed(2), ', taxAmount:', totalTaxAmount.toFixed(2));
    console.log('[Parser]  📦 Bundle offers:', allBundleOffers.length, '→ totalBundleAmount:', totalBundleAmount.toFixed(2));
    console.log('[Parser]  💵 TOTAL CALCULATED:', (totalBaseAmount + totalTaxAmount + totalBundleAmount).toFixed(2));
    console.log('[Parser] Detailed offer breakdown:');
    for (let i = 0; i < relatedOffers.length; i++) {
      const o = relatedOffers[i];
      console.log(`  Offer [${i}]: ${o.offerId.substring(0, 30)}...`);
      console.log(`    - offerItems: ${o.offerItems.length}, bundleOffers: ${o.bundleOffers?.length || 0}`);
      console.log(`    - backend totalPrice: ${o.totalPrice.value}`);
      if (o.bundleOffers && o.bundleOffers.length > 0) {
        for (const b of o.bundleOffers) {
          console.log(`    - 📦 Bundle: ${b.serviceCode} (${b.bundleName}) = $${b.price.value} for ${b.paxRefIds.length} pax`);
        }
      }
    }
    console.log('═══════════════════════════════════════════════════════════════');

    // Build price breakdown if we have actual data from the API
    // CRITICAL: Include bundle amounts in the base calculation!
    // totalAmount should be: base fares + taxes + bundle upgrades
    const priceBreakdown: AirShoppingPriceBreakdown | undefined =
      (totalBaseAmount > 0 || totalTaxAmount > 0 || totalBundleAmount > 0) ? {
        baseAmount: totalBaseAmount + totalBundleAmount,  // Include bundles in base
        taxAmount: totalTaxAmount,
        totalAmount: totalBaseAmount + totalTaxAmount + totalBundleAmount,  // Total = base + tax + bundles
        currency: firstOffer.totalPrice.currency,
      } : undefined;

    // Build per-passenger-type pricing from offer items
    // Jetstar can structure offer items in different ways:
    // 1. Separate items per passenger type: ["ADT0", "ADT1"], ["CHD0"], ["INF0"]
    // 2. Mixed items: ["ADT0", "CHD0", "INF0"] all in one item
    // We need to handle BOTH cases by examining each paxRefId individually
    const perPaxPricing: PerPaxTypePricing[] = [];
    const paxTypeGroups = new Map<'ADT' | 'CHD' | 'INF', { count: number; total: number }>();

    console.log('[Parser] Building per-pax pricing from', allOfferItems.length, 'flight items +', allBundleOffers.length, 'bundle offers');
    console.log('[Parser] allOfferItems raw:', JSON.stringify(allOfferItems, null, 2));

    // First, process flight offer items
    for (const item of allOfferItems) {
      const itemTotal = item.totalAmount?.value || 0;
      const paxIds = item.paxRefIds || [];

      console.log('[Parser] OfferItem:', {
        offerItemId: item.offerItemId,
        totalAmount: itemTotal,
        paxRefIds: paxIds,
      });

      if (paxIds.length === 0) {
        console.log('[Parser] Skipping item - no paxRefIds');
        continue;
      }

      // Check if all paxRefIds are of the same type
      const paxTypeCounts = new Map<'ADT' | 'CHD' | 'INF', number>();
      for (const paxId of paxIds) {
        let paxType: 'ADT' | 'CHD' | 'INF' = 'ADT';
        if (paxId.startsWith('CHD')) {
          paxType = 'CHD';
        } else if (paxId.startsWith('INF')) {
          paxType = 'INF';
        }
        paxTypeCounts.set(paxType, (paxTypeCounts.get(paxType) || 0) + 1);
      }

      // If all passengers are the same type, assign full total to that type
      if (paxTypeCounts.size === 1) {
        const [[paxType, count]] = Array.from(paxTypeCounts.entries());
        const existing = paxTypeGroups.get(paxType) || { count: 0, total: 0 };
        existing.count += count;

        // ============================================================================
        // CRITICAL FIX (2026-01-09): Multi-passenger pricing bug
        // ============================================================================
        // BUG: Was treating itemTotal as total for ALL passengers: existing.total += itemTotal
        // This caused massive underpricing for multi-passenger bookings (e.g., 6 ADT showed as 1 ADT)
        //
        // ROOT CAUSE: Jetstar's AirShopping XML returns PER-PASSENGER amounts in UnitPrice/TotalAmount
        // Example XML: <TotalAmount>242.93</TotalAmount> with 6 ADT passengers
        // This means $242.93 PER ADULT, not $242.93 total for all 6 adults
        //
        // FIX: Multiply itemTotal by passenger count to get actual total
        // Before: itemTotal ($242.93) was stored directly → total = $242.93 (WRONG)
        // After:  itemTotal × count ($242.93 × 6) → total = $1,457.58 (CORRECT)
        //
        // This matches the OfferPrice parser logic (offer-price.parser.ts:394-398) which also
        // multiplies per-person amounts by passenger count
        //
        // DO NOT REMOVE THIS MULTIPLICATION - it will break multi-passenger pricing!
        // ============================================================================
        existing.total += itemTotal * count;
        paxTypeGroups.set(paxType, existing);
        console.log('[Parser] Same-type item, added to', paxType, '- count:', existing.count, 'itemTotal (per-pax):', itemTotal, 'total after multiply:', existing.total);
      } else {
        // MIXED passenger types in one offer item!
        // This means itemTotal is for ALL passengers combined
        // We need to split proportionally or use per-passenger amount
        console.log('[Parser] MIXED pax types in one item:', Array.from(paxTypeCounts.entries()));

        // Typical case: itemTotal is per-passenger, not combined
        // But we can't be sure, so we need to check the amount
        // If itemTotal seems reasonable for one person, multiply by count for each type

        // Strategy: Divide itemTotal by total passengers, then assign proportionally
        // This assumes equal fare per passenger which isn't always true (INF is cheaper)
        // For now, we'll assign per-pax amount equally and note this is an approximation
        const totalPaxInItem = paxIds.length;
        const perPaxAmount = itemTotal / totalPaxInItem;

        for (const [paxType, count] of paxTypeCounts) {
          const existing = paxTypeGroups.get(paxType) || { count: 0, total: 0 };
          existing.count += count;
          existing.total += perPaxAmount * count;
          paxTypeGroups.set(paxType, existing);
          console.log('[Parser] Mixed-type item, added to', paxType, '- count:', existing.count, 'total:', existing.total);
        }
      }
    }

    // NOTE: Bundle offers are OPTIONS, not included in base price!
    // perPaxPricing.totalAmount should ONLY include base fare + taxes
    // Bundle prices are stored separately in the bundles array for user selection
    // DO NOT add bundle prices to perPaxPricing.totalAmount here
    console.log('[Parser] Skipping bundle aggregation - bundles are optional add-ons, not included in base price');
    console.log('[Parser] Bundle offers available:', allBundleOffers.length, 'bundles as options');

    // Convert to PerPaxTypePricing array
    for (const [paxType, data] of paxTypeGroups) {
      if (data.count > 0) {
        perPaxPricing.push({
          paxType,
          paxCount: data.count,
          perPersonAmount: data.total / data.count,
          totalAmount: data.total,
          currency: firstOffer.totalPrice.currency,
        });
      }
    }

    console.log('[Parser] Final per-pax pricing:', JSON.stringify(perPaxPricing, null, 2));
    console.log('[Parser] paxTypeGroups Map entries:', Array.from(paxTypeGroups.entries()));

    const newOffer: FlightOffer = {
      offerId: firstOffer.offerId,
      journey,
      bundles,
      baseFare: firstOffer.totalPrice.value,  // Base economy fare
      currency: firstOffer.totalPrice.currency,
      fareBasisCode,
      cabinType,
      rbd,
      shoppingResponseId,  // Include for OfferPrice API
      offerItemIds,  // Base fare item IDs needed for OfferPrice
      paxRefIds,  // Passenger reference IDs needed for OfferPrice (legacy)
      offerItemsWithPax,  // NEW: Per-item paxRefIds for correct OfferPrice structure
      priceBreakdown,  // Detailed price breakdown for OfferPrice comparison
      perPaxPricing,  // Per-passenger-type pricing for accurate sidebar display
    };
    console.log('[Parser] Creating offer:', newOffer.offerId, 'with offerItemsWithPax:', offerItemsWithPax);
    offers.push(newOffer);
  }

  console.log('[Parser] Parsed offers:', offers);

  return {
    shoppingResponseId,
    offers,
    warnings: [],
    errors: [],
  };
}

function transformSegment(seg: BackendSegment): FlightSegment {
  // Parse duration from ISO format if present, or calculate from times
  let durationMinutes = 0;
  if (seg.duration) {
    durationMinutes = parseDuration(seg.duration);
  } else if (seg.departureTime && seg.arrivalTime) {
    durationMinutes = calculateDuration(
      seg.departureDate,
      seg.departureTime,
      seg.arrivalDate || seg.departureDate,
      seg.arrivalTime
    );
  }

  return {
    segmentId: seg.paxSegmentId,
    flightNumber: seg.marketingCarrier?.flightNumber || '',
    marketingCarrier: seg.marketingCarrier?.airlineCode || 'JQ',
    operatingCarrier: seg.operatingCarrier?.airlineCode,
    origin: seg.origin,
    destination: seg.destination,
    departureDate: formatDisplayDate(seg.departureDate),
    departureTime: formatDisplayTime(seg.departureTime || ''),
    arrivalDate: formatDisplayDate(seg.arrivalDate || seg.departureDate),
    arrivalTime: formatDisplayTime(seg.arrivalTime || ''),
    duration: durationMinutes,
    aircraft: seg.equipment?.aircraftCode,
    cabinClass: seg.cabinCode,
  };
}

function parseDuration(duration: string): number {
  // Parse ISO 8601 duration like "PT3H20M"
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
  if (!match) return 0;
  const hours = parseInt(match[1] || '0', 10);
  const minutes = parseInt(match[2] || '0', 10);
  return hours * 60 + minutes;
}

function calculateDuration(
  depDate: string,
  depTime: string,
  arrDate: string,
  arrTime: string
): number {
  try {
    const dep = new Date(`${depDate}T${depTime}`);
    const arr = new Date(`${arrDate}T${arrTime}`);
    return Math.round((arr.getTime() - dep.getTime()) / (1000 * 60));
  } catch {
    return 0;
  }
}

function formatDisplayDate(dateStr: string): string {
  if (!dateStr) return '';
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-AU', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    });
  } catch {
    return dateStr;
  }
}

function formatDisplayTime(timeStr: string): string {
  if (!timeStr) return '';
  // If already in HH:MM format, return as is
  if (/^\d{2}:\d{2}$/.test(timeStr)) {
    return timeStr;
  }
  // If in HH:MM:SS format, strip seconds
  if (/^\d{2}:\d{2}:\d{2}$/.test(timeStr)) {
    return timeStr.substring(0, 5);
  }
  return timeStr;
}
