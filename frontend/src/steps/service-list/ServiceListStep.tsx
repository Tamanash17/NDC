import { useState, useEffect, useRef, useMemo } from 'react';
import { useXmlViewer } from '@/core/context/XmlViewerContext';
import { useFlightSelectionStore } from '@/hooks/useFlightSelection';
import { useDistributionContext } from '@/core/context/SessionStore';
import { serviceList } from '@/lib/ndc-api';
import { annotateXml, type AnnotationContext } from '@/lib/xml-annotator';
import { Card, Alert } from '@/components/ui';
import {
  Luggage, Utensils, ShieldCheck, Package, Loader2, Check,
  Plane, Users, Bug, ChevronDown, ChevronUp, UserCircle, Sparkles,
  ArrowUpCircle, Briefcase, Coffee, Armchair, RefreshCw, Ban,
  ArrowLeft, ChevronRight, X
} from 'lucide-react';
import { formatCurrency } from '@/lib/format';
import { cn } from '@/lib/cn';
import type { BundleOption } from '@/components/flights';
import serviceCategoriesConfig from '@/config/service-categories.json';

// Flight segment mapping - maps API segment IDs to friendly descriptions
interface FlightSegmentMapping {
  apiSegmentId: string;  // The actual segment ID from the API (e.g., "seg01996009212")
  origin: string;
  destination: string;
  flightNumber?: string;
  carrier?: string;
  departureDate?: string;
}

// Passenger info for per-pax selection
interface PassengerInfo {
  paxId: string;       // API ID like "ADT0", "CHD0"
  paxType: string;     // "ADT", "CHD", "INF"
  displayLabel: string; // "Adult 1", "Child 1"
}

interface Service {
  serviceId: string;
  serviceCode: string;
  serviceName: string;
  serviceType: 'baggage' | 'meal' | 'insurance' | 'bundle' | 'ssr' | 'flexibility' | 'other';
  price: number;
  currency: string;
  description?: string;
  segmentRefs?: string[];
  journeyRefs?: string[];
  legRefs?: string[];
  paxRefIds?: string[];
  maxQuantity?: number;
  offerId?: string;
  offerItemId?: string;
  associationType: 'segment' | 'journey' | 'leg' | 'unknown';
  weight?: string;
  rfic?: string;
  rfisc?: string;
  direction: 'outbound' | 'inbound' | 'both';  // Which flight this service applies to
  // Per-passenger offerItemIds - bundles have different IDs for ADT, CHD, INF
  paxOfferItemIds?: Record<string, string>;
}

// Per-passenger service selection tracking
// Key format: "serviceId:paxId" (e.g., "offer123:ADT0")
type PerPaxSelections = Map<string, Set<string>>;

// Load service categorization from config JSON
const BUNDLE_CODE_PATTERNS = new RegExp(serviceCategoriesConfig.bundleCodePattern, 'i');
const BUNDLE_INCLUSION_CODES = new Set(serviceCategoriesConfig.bundleInclusions.codes.map(c => c.toUpperCase()));
const SERVICE_TYPES_CONFIG = serviceCategoriesConfig.serviceTypes;

// Build bundle tiers from config
const BUNDLE_CODE_TIERS: Record<string, number> = Object.fromEntries(
  Object.entries(serviceCategoriesConfig.bundleTiers).map(([key, val]) => [key, val.tier])
);

// Build tier names from config
const BUNDLE_TIER_NAMES: Record<number, string> = {};
Object.values(serviceCategoriesConfig.bundleTiers).forEach(val => {
  BUNDLE_TIER_NAMES[val.tier] = val.name;
});

// Empty default inclusions - all bundle inclusions come from XML ServiceBundle refs
// No hardcoded values - everything is realtime from API
const EMPTY_BUNDLE_INCLUSIONS: BundleOption['inclusions'] = {
  baggage: '',
  meals: false,
  seatSelection: false,
  changes: '',
  cancellation: '',
};

// Detected bundle from ServiceList
interface DetectedBundle {
  serviceId: string;
  serviceCode: string;
  serviceName: string;
  tier: number;
  tierName: string;
  price: number;
  currency: string;
  inclusions: BundleOption['inclusions'];
  offerId?: string;
  offerItemId?: string;
  journeyRefs?: string[];
  segmentRefs?: string[];  // Segment references for direction detection
  isCurrentBundle: boolean;
  direction: 'outbound' | 'inbound' | 'both';  // Which journey this bundle applies to
  paxOfferItemIds?: Record<string, string>;  // Per-passenger offerItemIds for bundle swaps
}

interface ServiceListStepProps {
  workflowOptions?: any;
  onComplete?: () => void;
  onBack?: () => void;
}

export function ServiceListStep({ onComplete, onBack }: ServiceListStepProps) {
  const { addCapture } = useXmlViewer();
  const flightStore = useFlightSelectionStore();
  const distributionContext = useDistributionContext();

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [perPaxSelections, setPerPaxSelections] = useState<PerPaxSelections>(new Map());
  const [showDebug, setShowDebug] = useState(false);
  const [segmentMapping, setSegmentMapping] = useState<Map<string, FlightSegmentMapping>>(new Map());
  const [expandedServices, setExpandedServices] = useState<Set<string>>(new Set());

  // Bundle swap state - separate for outbound and inbound
  const [detectedBundles, setDetectedBundles] = useState<DetectedBundle[]>([]);
  const [selectedOutboundBundleSwap, setSelectedOutboundBundleSwap] = useState<string | null>(null);
  const [selectedInboundBundleSwap, setSelectedInboundBundleSwap] = useState<string | null>(null);
  const [bundleSwapExpanded, setBundleSwapExpanded] = useState(true);

  const fetchInProgress = useRef(false);

  // Get current bundle selections from flight store (outbound and inbound)
  const currentOutboundBundle = useMemo((): BundleOption | null => {
    return flightStore.selection.outbound?.bundle || null;
  }, [flightStore.selection.outbound]);

  const currentInboundBundle = useMemo((): BundleOption | null => {
    return flightStore.selection.inbound?.bundle || null;
  }, [flightStore.selection.inbound]);

  const isRoundTrip = useMemo((): boolean => {
    return flightStore.selection.inbound !== null;
  }, [flightStore.selection.inbound]);


  // Build passenger list from search criteria
  const passengers = useMemo((): PassengerInfo[] => {
    const pax: PassengerInfo[] = [];
    const counts = flightStore.searchCriteria?.passengers || { adults: 1, children: 0, infants: 0 };

    for (let i = 0; i < counts.adults; i++) {
      pax.push({
        paxId: `ADT${i}`,
        paxType: 'ADT',
        displayLabel: `Adult ${i + 1}`,
      });
    }
    for (let i = 0; i < counts.children; i++) {
      pax.push({
        paxId: `CHD${i}`,
        paxType: 'CHD',
        displayLabel: `Child ${i + 1}`,
      });
    }
    // Note: Infants typically don't have ancillaries, but include for completeness
    for (let i = 0; i < counts.infants; i++) {
      pax.push({
        paxId: `INF${i}`,
        paxType: 'INF',
        displayLabel: counts.infants > 1 ? `Infant ${i + 1}` : 'Infant',
      });
    }
    return pax;
  }, [flightStore.searchCriteria]);

  useEffect(() => {
    if (fetchInProgress.current) {
      console.log('[ServiceListStep] Skipping duplicate ServiceList call (already in progress)');
      return;
    }
    fetchInProgress.current = true;

    // CRITICAL: Clear per-passenger selections when component mounts
    // This prevents mixing offer IDs from different AirShopping sessions
    // When user goes back and selects a different flight, the old service selections
    // would have offer IDs from a previous AirShopping session which causes
    // "Invalid OfferItemID" errors when calling OfferPrice
    console.log('[ServiceListStep] Clearing per-passenger selections on mount');
    setPerPaxSelections(new Map());

    // Build segment mapping from flight selection
    buildSegmentMapping();
    fetchServices();

    return () => {
      setTimeout(() => {
        fetchInProgress.current = false;
      }, 100);
    };
  }, []);

  // Helper to extract numeric portion of segment ID for matching
  const extractNumericSegmentId = (id: string): string => {
    if (!id) return '';
    // Remove prefixes: Mkt-, Opr-, seg, fl, paxseg
    let normalized = id.replace(/^(Mkt-|Opr-)/i, '');
    normalized = normalized.replace(/^(seg|fl|paxseg)/i, '');
    // Remove leg suffix
    normalized = normalized.replace(/-leg\d+$/i, '');
    // Extract numeric portion
    const numMatch = normalized.match(/^(\d+)/);
    return numMatch ? numMatch[1] : normalized;
  };

  // Build mapping from API segment IDs to friendly flight descriptions
  const buildSegmentMapping = () => {
    const mapping = new Map<string, FlightSegmentMapping>();
    const selection = flightStore.selection;
    const searchCriteria = flightStore.searchCriteria;

    console.log('[ServiceListStep] Building segment mapping from selection:', {
      outboundJourney: selection.outbound?.journey,
      inboundJourney: selection.inbound?.journey,
    });

    // Helper to add segment to mapping with multiple key variants
    const addSegmentToMapping = (segmentId: string, info: FlightSegmentMapping) => {
      // Add with original ID
      mapping.set(segmentId, info);

      // Also add with normalized numeric ID for easier lookup
      const numericId = extractNumericSegmentId(segmentId);
      if (numericId && numericId !== segmentId) {
        mapping.set(numericId, info);
        // Also try with common prefixes stripped
        mapping.set(`seg${numericId}`, info);
      }
    };

    // Process outbound journey segments - MUST handle multi-segment journeys
    if (selection.outbound?.journey?.segments) {
      console.log('[ServiceListStep] Outbound segments count:', selection.outbound.journey.segments.length);
      selection.outbound.journey.segments.forEach((seg, idx) => {
        console.log(`[ServiceListStep] Outbound segment ${idx}:`, seg);
        if (seg.segmentId) {
          const info: FlightSegmentMapping = {
            apiSegmentId: seg.segmentId,
            origin: seg.origin || searchCriteria?.origin || 'XXX',
            destination: seg.destination || searchCriteria?.destination || 'XXX',
            flightNumber: seg.flightNumber,
            carrier: seg.marketingCarrier || 'JQ',
            departureDate: seg.departureDate,
          };
          addSegmentToMapping(seg.segmentId, info);
        }
      });
    }

    // Process inbound journey segments
    if (selection.inbound?.journey?.segments) {
      console.log('[ServiceListStep] Inbound segments count:', selection.inbound.journey.segments.length);
      selection.inbound.journey.segments.forEach((seg, idx) => {
        console.log(`[ServiceListStep] Inbound segment ${idx}:`, seg);
        if (seg.segmentId) {
          const info: FlightSegmentMapping = {
            apiSegmentId: seg.segmentId,
            origin: seg.origin || searchCriteria?.destination || 'XXX',
            destination: seg.destination || searchCriteria?.origin || 'XXX',
            flightNumber: seg.flightNumber,
            carrier: seg.marketingCarrier || 'JQ',
            departureDate: seg.departureDate,
          };
          addSegmentToMapping(seg.segmentId, info);
        }
      });
    }

    console.log('[ServiceListStep] Built segment mapping with', mapping.size, 'entries:', Array.from(mapping.entries()));
    setSegmentMapping(mapping);
  };

  const fetchServices = async () => {
    const selection = flightStore.selection;
    const searchCriteria = flightStore.searchCriteria;

    console.log('[ServiceListStep] fetchServices called');

    if (!selection.outbound) {
      console.error('[ServiceListStep] No outbound selection found');
      setError('No flight selection found');
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    const startTime = Date.now();

    // PROD FIX: Use segments as primary source since searchCriteria may not be populated
    const outboundSegments = selection.outbound?.journey?.segments;
    const inboundSegments = selection.inbound?.journey?.segments;

    // Primary origin/destination from segments (more reliable)
    const origin = outboundSegments?.[0]?.origin || searchCriteria?.origin || 'XXX';
    const destination = outboundSegments?.[outboundSegments?.length - 1]?.destination || searchCriteria?.destination || 'XXX';

    // Inbound endpoints (for route labels)
    const inboundOrigin = inboundSegments?.[0]?.origin || destination;
    const inboundDest = inboundSegments?.[inboundSegments?.length - 1]?.destination || origin;

    try {
      const distributionChain = distributionContext.isValid ? {
        links: distributionContext.getPartyConfig()?.participants.map(p => ({
          ordinal: p.ordinal,
          orgRole: p.role,
          orgId: p.orgCode,
          orgName: p.orgName,
        })) || []
      } : undefined;

      const selectedOffers: Array<{
        offerId: string;
        ownerCode: string;
        offerItems: Array<{ offerItemId: string; serviceId?: string; paxRefIds?: string[] }>;
      }> = [];

      // Add outbound offer
      const outboundOfferItems = selection.outbound.offerItemsWithPax?.map(item => ({
        offerItemId: item.offerItemId,
        serviceId: item.offerItemId,
        paxRefIds: item.paxRefIds,
      })) || [];

      const outboundBundleId = selection.outbound.bundleId;
      const isSyntheticBundle = outboundBundleId.startsWith(`${selection.outbound.offerId}-`);
      if (!isSyntheticBundle) {
        outboundOfferItems.push({
          offerItemId: outboundBundleId,
          serviceId: outboundBundleId,
          paxRefIds: selection.outbound.paxRefIds || [],
        });
      }

      selectedOffers.push({
        offerId: selection.outbound.offerId,
        ownerCode: 'JQ',
        offerItems: outboundOfferItems,
      });

      // Add inbound offer if exists
      if (selection.inbound) {
        const inboundOfferItems = selection.inbound.offerItemsWithPax?.map(item => ({
          offerItemId: item.offerItemId,
          serviceId: item.offerItemId,
          paxRefIds: item.paxRefIds,
        })) || [];

        const inboundBundleId = selection.inbound.bundleId;
        const isInboundSyntheticBundle = inboundBundleId.startsWith(`${selection.inbound.offerId}-`);
        if (!isInboundSyntheticBundle) {
          inboundOfferItems.push({
            offerItemId: inboundBundleId,
            serviceId: inboundBundleId,
            paxRefIds: selection.inbound.paxRefIds || [],
          });
        }

        selectedOffers.push({
          offerId: selection.inbound.offerId,
          ownerCode: 'JQ',
          offerItems: inboundOfferItems,
        });
      }

      console.log('[ServiceListStep] Calling ServiceList with selectedOffers:', selectedOffers);

      const response = await serviceList({
        selectedOffers,
        distributionChain,
        ownerCode: 'JQ',
      });

      const routeLabel = selection.inbound
        ? `${origin}-${destination} + ${inboundOrigin}-${inboundDest}`
        : `${origin}-${destination}`;

      const opName = `ServiceList (${routeLabel})`;

      // Build annotation context for ServiceList
      const annotationCtx: AnnotationContext = {
        operation: 'ServiceList',
        stepInWorkflow: 'Step 3: Add Extras (Ancillary Services)',
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
          route: `${inboundOrigin} → ${inboundDest}`,
          direction: 'inbound',
        } : undefined,
        shoppingResponseId: flightStore.shoppingResponseId || undefined,
        timestamp: new Date(),
        changesSinceLastStep: [
          `Outbound: ${selection.outbound?.bundle?.bundleName || 'Base fare'} selected`,
          selection.inbound ? `Inbound: ${selection.inbound.bundle?.bundleName || 'Base fare'} selected` : null,
        ].filter(Boolean) as string[],
      };

      const annotatedRequest = annotateXml(response.requestXml || '', annotationCtx);

      addCapture({
        operation: opName,
        request: annotatedRequest,
        response: response.responseXml || '',
        duration: response.duration || Date.now() - startTime,
        status: 'success',
        userAction: 'Requested available ancillary services',
      });

      const { services: parsedServices, bundles: parsedBundles, ssrMappings } = parseServicesAndBundles(response.data);
      console.log('[ServiceListStep] Parsed services:', parsedServices);
      console.log('[ServiceListStep] Detected bundles:', parsedBundles);
      console.log('[ServiceListStep] SSR mappings:', ssrMappings);
      setServices(parsedServices);
      setDetectedBundles(parsedBundles);

      // Store SSR mappings in global state for use in SeatSelectionStep
      flightStore.setSSRMappings(ssrMappings);

    } catch (err: any) {
      const errorMessage = err.response?.data?.message || err.message || 'Failed to load services';
      setError(errorMessage);

      // Build error annotation context
      const errorAnnotationCtx: AnnotationContext = {
        operation: 'ServiceList (FAILED)',
        stepInWorkflow: 'Step 3: Add Extras - Error',
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
          route: `${origin} → ${destination}`,
          direction: 'outbound',
        },
        inboundOffer: selection.inbound ? {
          offerId: selection.inbound.offerId,
          bundleId: selection.inbound.bundleId,
          bundleName: selection.inbound.bundle?.bundleName,
          route: `${destination} → ${origin}`,
          direction: 'inbound',
        } : undefined,
        timestamp: new Date(),
        changesSinceLastStep: [`ERROR: ${errorMessage}`],
      };

      const annotatedErrorRequest = annotateXml(err.response?.data?.requestXml || '', errorAnnotationCtx);

      addCapture({
        operation: 'ServiceList',
        request: annotatedErrorRequest,
        response: err.response?.data?.responseXml || err.response?.data?.xml || `<error>${err.message}</error>`,
        duration: Date.now() - startTime,
        status: 'error',
      });

    } finally {
      setIsLoading(false);
    }
  };

  // Check if a service code is a bundle code
  // Bundles are ALWAYS journey-based and have codes like S050, P200, M202, F202, B050
  // NOT service inclusions like PLUS, MAX, FLEX, BMAX which are segment-based
  const isBundleCode = (code: string): boolean => {
    if (!code) return false;
    const upperCode = code.toUpperCase();
    // ONLY check for known bundle code patterns: S050, P200, M201, F204, B050, etc.
    // Format: [SPMFB] followed by 2-3 digits
    return BUNDLE_CODE_PATTERNS.test(upperCode);
  };

  // Check if a service code is a bundle inclusion (component of bundles, not standalone purchasable)
  // These should be filtered out from the services list
  // AUTO-DETECTION: Checks both config list AND service characteristics
  const isBundleInclusion = (code: string, serviceName?: string, price?: number): boolean => {
    if (!code) return false;
    const upperCode = code.toUpperCase();

    // 1. Check explicit config list first (known bundle inclusion codes)
    if (BUNDLE_INCLUSION_CODES.has(upperCode)) {
      return true;
    }

    // 2. AUTO-DETECT based on service characteristics:
    // Bundle inclusions typically have $0.00 price AND specific keywords in name
    if (price === 0 && serviceName) {
      const upperName = serviceName.toUpperCase();

      // Keywords that indicate bundle-related flexibility/change services
      const bundleKeywords = [
        'CANCEL', 'CHANGE', 'FLEX', 'CREDIT', 'REFUND', 'MODIFY',
        'REBOOK', 'RESCHEDULE', 'VOUCHER', 'FARE LOCK', 'FARE HOLD',
        'FEE WAIVER', 'NO SHOW', 'NAME CHANGE'
      ];

      // Check if the name contains any bundle-related keyword
      const isBundleRelated = bundleKeywords.some(keyword => upperName.includes(keyword));

      if (isBundleRelated) {
        console.log(`[ServiceListStep] Auto-detected bundle inclusion: ${code} (${serviceName}) - $0.00 with bundle keyword`);
        return true;
      }
    }

    return false;
  };

  // Get bundle tier from code
  const getBundleTier = (code: string): number => {
    if (!code) return 1;
    const firstChar = code.toUpperCase().charAt(0);
    return BUNDLE_CODE_TIERS[firstChar] || 1;
  };

  // Determine direction (outbound/inbound/both) from refs
  // PRIORITY: Journey ID matching is most reliable since segment IDs differ between AirShopping and ServiceList
  const getServiceDirection = (
    segmentRefs: string[],
    journeyRefs: string[],
    legRefs: string[]
  ): 'outbound' | 'inbound' | 'both' => {
    const selection = flightStore.selection;
    const isRoundTrip = !!selection.inbound;

    // For one-way trips, everything is outbound
    if (!isRoundTrip) {
      return 'outbound';
    }

    // Get journey IDs - these are the MOST RELIABLE for matching
    const outboundJourneyId = selection.outbound?.journey?.journeyId || '';
    const inboundJourneyId = selection.inbound?.journey?.journeyId || '';

    // Get ALL outbound segment IDs - including from legs within segments
    const outboundSegmentIds = new Set<string>();
    if (selection.outbound?.journey?.segments) {
      for (const seg of selection.outbound.journey.segments) {
        if (seg.segmentId) outboundSegmentIds.add(seg.segmentId);
        if ((seg as any).legs) {
          for (const leg of (seg as any).legs) {
            if (leg.legId) outboundSegmentIds.add(leg.legId);
          }
        }
      }
    }

    // Get ALL inbound segment IDs
    const inboundSegmentIds = new Set<string>();
    if (selection.inbound?.journey?.segments) {
      for (const seg of selection.inbound.journey.segments) {
        if (seg.segmentId) inboundSegmentIds.add(seg.segmentId);
        if ((seg as any).legs) {
          for (const leg of (seg as any).legs) {
            if (leg.legId) inboundSegmentIds.add(leg.legId);
          }
        }
      }
    }

    console.log('[getServiceDirection] Journey IDs - outbound:', outboundJourneyId, 'inbound:', inboundJourneyId);
    console.log('[getServiceDirection] Service refs:', { journeyRefs, segmentRefs, legRefs });

    let matchesOutbound = false;
    let matchesInbound = false;

    // Helper to normalize IDs by extracting core numeric portion
    const normalizeId = (id: string): string => {
      if (!id) return '';
      // Remove all common prefixes
      let normalized = id.replace(/^(Mkt-|Opr-|seg|fl|paxseg|pj)/gi, '');
      // Remove leg suffix
      normalized = normalized.replace(/-leg\d+$/i, '');
      // Extract numeric portion
      const numMatch = normalized.match(/(\d+)/);
      return numMatch ? numMatch[1] : normalized;
    };

    // PRIORITY 1: Match by JOURNEY ID (most reliable)
    if (journeyRefs && journeyRefs.length > 0) {
      for (const ref of journeyRefs) {
        const normalizedRef = normalizeId(ref);
        const normalizedOutbound = normalizeId(outboundJourneyId);
        const normalizedInbound = normalizeId(inboundJourneyId);

        console.log(`[getServiceDirection] journeyRef "${ref}" (normalized: ${normalizedRef}) vs outbound "${outboundJourneyId}" (${normalizedOutbound}), inbound "${inboundJourneyId}" (${normalizedInbound})`);

        // Direct match
        if (ref === outboundJourneyId) {
          console.log(`[getServiceDirection]   ✓ EXACT MATCH OUTBOUND JOURNEY`);
          matchesOutbound = true;
        } else if (ref === inboundJourneyId) {
          console.log(`[getServiceDirection]   ✓ EXACT MATCH INBOUND JOURNEY`);
          matchesInbound = true;
        }
        // Normalized match
        else if (normalizedRef && normalizedOutbound && normalizedRef === normalizedOutbound) {
          console.log(`[getServiceDirection]   ✓ NORMALIZED MATCH OUTBOUND JOURNEY`);
          matchesOutbound = true;
        } else if (normalizedRef && normalizedInbound && normalizedRef === normalizedInbound) {
          console.log(`[getServiceDirection]   ✓ NORMALIZED MATCH INBOUND JOURNEY`);
          matchesInbound = true;
        }
        // Partial/contains match for long numeric IDs
        else if (normalizedRef.length >= 6) {
          if (normalizedOutbound && (normalizedRef.includes(normalizedOutbound) || normalizedOutbound.includes(normalizedRef))) {
            console.log(`[getServiceDirection]   ✓ PARTIAL MATCH OUTBOUND JOURNEY`);
            matchesOutbound = true;
          }
          if (normalizedInbound && (normalizedRef.includes(normalizedInbound) || normalizedInbound.includes(normalizedRef))) {
            console.log(`[getServiceDirection]   ✓ PARTIAL MATCH INBOUND JOURNEY`);
            matchesInbound = true;
          }
        }
      }
    }

    // If journey matching found results, use them
    if (matchesOutbound || matchesInbound) {
      const direction = matchesOutbound && matchesInbound ? 'both' :
                       matchesOutbound ? 'outbound' : 'inbound';
      console.log('[getServiceDirection] Result (from journey match):', direction);
      return direction;
    }

    // PRIORITY 2: Match by segment IDs (less reliable due to different ID formats)
    if (segmentRefs && segmentRefs.length > 0) {
      for (const ref of segmentRefs) {
        const normalizedRef = normalizeId(ref);

        // Check against outbound segments
        for (const segId of outboundSegmentIds) {
          if (ref === segId || normalizeId(segId) === normalizedRef) {
            console.log(`[getServiceDirection]   ✓ SEGMENT MATCH OUTBOUND: ${ref} = ${segId}`);
            matchesOutbound = true;
            break;
          }
        }

        // Check against inbound segments
        for (const segId of inboundSegmentIds) {
          if (ref === segId || normalizeId(segId) === normalizedRef) {
            console.log(`[getServiceDirection]   ✓ SEGMENT MATCH INBOUND: ${ref} = ${segId}`);
            matchesInbound = true;
            break;
          }
        }
      }
    }

    // If segment matching found results, use them
    if (matchesOutbound || matchesInbound) {
      const direction = matchesOutbound && matchesInbound ? 'both' :
                       matchesOutbound ? 'outbound' : 'inbound';
      console.log('[getServiceDirection] Result (from segment match):', direction);
      return direction;
    }

    // PRIORITY 3: Match by leg IDs
    if (legRefs && legRefs.length > 0) {
      for (const ref of legRefs) {
        const normalizedRef = normalizeId(ref);

        for (const segId of outboundSegmentIds) {
          if (normalizeId(segId) === normalizedRef) {
            matchesOutbound = true;
            break;
          }
        }
        for (const segId of inboundSegmentIds) {
          if (normalizeId(segId) === normalizedRef) {
            matchesInbound = true;
            break;
          }
        }
      }
    }

    if (matchesOutbound || matchesInbound) {
      const direction = matchesOutbound && matchesInbound ? 'both' :
                       matchesOutbound ? 'outbound' : 'inbound';
      console.log('[getServiceDirection] Result (from leg match):', direction);
      return direction;
    }

    // FALLBACK: If no refs provided or no matches, use association type and position heuristics
    // For round trips with no matching refs, we should show as 'both' to allow user selection
    console.log('[getServiceDirection] No matches found - defaulting to "both" for round trip');
    return 'both';
  };

  // Parse services and bundles separately
  const parseServicesAndBundles = (data: any): {
    services: Service[];
    bundles: DetectedBundle[];
    ssrMappings: import('@/hooks/useFlightSelection').SSRMapping;
  } => {
    const services: Service[] = [];
    const bundles: DetectedBundle[] = [];
    const ssrMappings: import('@/hooks/useFlightSelection').SSRMapping = {};

    const serviceDefinitions = data.services || data.Services || [];
    const ancillaryOffers = data.ancillaryOffers || data.AncillaryOffers || [];

    // DEBUG: Log raw ancillary offers to verify offerId is present from API
    console.log('[ServiceListStep] ===== RAW ANCILLARY OFFERS FROM API =====');
    console.log('[ServiceListStep] Total offers:', ancillaryOffers.length);
    console.log('[ServiceListStep] Total serviceDefinitions:', serviceDefinitions.length);

    // Log bundle offers with their includedServiceRefIds
    const bundleOffers = ancillaryOffers.filter((o: any) => o.serviceType === 'BUNDLE');
    console.log('[ServiceListStep] Bundle offers:', bundleOffers.length);
    bundleOffers.forEach((offer: any, i: number) => {
      console.log(`[ServiceListStep] BundleOffer[${i}]:`, {
        offerId: offer.offerId,
        offerItemId: offer.offerItemId,
        serviceCode: offer.serviceCode,
        serviceName: offer.serviceName,
        serviceType: offer.serviceType,
        includedServiceRefIds: offer.includedServiceRefIds || 'NONE',
        price: offer.price,
      });
    });

    ancillaryOffers.slice(0, 5).forEach((offer: any, i: number) => {
      console.log(`[ServiceListStep] Offer[${i}]:`, {
        offerId: offer.offerId,         // <-- This MUST be the ALaCarteOffer ID
        offerItemId: offer.offerItemId, // <-- This is the specific bundle/service item ID
        serviceCode: offer.serviceCode,
        serviceName: offer.serviceName,
        price: offer.price,
      });
    });

    console.log('[ServiceListStep] ==============================================');

    // NEW: Get segment and journey data from ServiceList response for direction detection
    const apiSegments: Array<{
      segmentId: string;
      origin: string;
      destination: string;
    }> = data.segments || [];
    const apiJourneys: Array<{
      journeyId: string;
      segmentRefIds: string[];
    }> = data.journeys || [];

    // Build lookup maps for direction detection
    const segmentMap = new Map<string, { origin: string; destination: string }>();
    for (const seg of apiSegments) {
      segmentMap.set(seg.segmentId, { origin: seg.origin, destination: seg.destination });
    }

    const journeySegmentsMap = new Map<string, string[]>();
    for (const journey of apiJourneys) {
      journeySegmentsMap.set(journey.journeyId, journey.segmentRefIds);
    }

    // Get search criteria for direction detection (origin/destination)
    const searchOrigin = flightStore.searchCriteria?.origin || '';
    const searchDestination = flightStore.searchCriteria?.destination || '';
    const isRoundTripSearch = !!flightStore.selection.inbound;

    console.log('[ServiceListStep] API DataLists:', {
      segments: apiSegments,
      journeys: apiJourneys,
      searchOrigin,
      searchDestination,
      isRoundTripSearch,
      segmentMapKeys: Array.from(segmentMap.keys()),
      journeyMapKeys: Array.from(journeySegmentsMap.keys()),
    });

    // Direction detection - uses multiple strategies
    const detectDirection = (
      segmentRefs: string[],
      journeyRefs: string[],
      legRefs: string[]
    ): 'outbound' | 'inbound' | 'both' => {
      // For one-way trips, everything is outbound
      if (!isRoundTripSearch) {
        return 'outbound';
      }

      // STRATEGY 1: Use segment data from API if available
      // Works for open jaw too by comparing with stored flight segment origins
      if (apiSegments.length > 0) {
        const segmentIdsToCheck: string[] = [...segmentRefs];

        // Add segments from journey refs via lookup
        for (const journeyRef of journeyRefs) {
          const journeySegments = journeySegmentsMap.get(journeyRef);
          if (journeySegments) {
            segmentIdsToCheck.push(...journeySegments);
          }
        }

        // Get origins from stored flight data (works for open jaw)
        const outboundOrigins = new Set(
          flightStore.selection.outbound?.journey?.segments?.map(s => s.origin) || []
        );
        const outboundDestinations = new Set(
          flightStore.selection.outbound?.journey?.segments?.map(s => s.destination) || []
        );
        const inboundOrigins = new Set(
          flightStore.selection.inbound?.journey?.segments?.map(s => s.origin) || []
        );
        const inboundDestinations = new Set(
          flightStore.selection.inbound?.journey?.segments?.map(s => s.destination) || []
        );

        let hasOutbound = false;
        let hasInbound = false;

        for (const segId of segmentIdsToCheck) {
          const segInfo = segmentMap.get(segId);
          if (segInfo) {
            // Outbound: segment origin/destination matches outbound flight cities
            if (outboundOrigins.has(segInfo.origin) || outboundDestinations.has(segInfo.destination)) {
              hasOutbound = true;
            }
            // Inbound: segment origin/destination matches inbound flight cities
            if (inboundOrigins.has(segInfo.origin) || inboundDestinations.has(segInfo.destination)) {
              hasInbound = true;
            }
          }
        }

        if (hasOutbound || hasInbound) {
          const direction = hasOutbound && hasInbound ? 'both' : hasOutbound ? 'outbound' : 'inbound';
          console.log(`[detectDirection] From API segments: ${direction}`);
          return direction;
        }
      }

      // STRATEGY 2: Count journey refs - 2+ means BOTH flights
      if (journeyRefs.length >= 2) {
        console.log(`[detectDirection] ${journeyRefs.length} journey refs = BOTH flights`);
        return 'both';
      }

      // STRATEGY 3: Match single journey ref to stored flight data
      if (journeyRefs.length === 1) {
        const journeyRef = journeyRefs[0];
        const outboundJourneyId = flightStore.selection.outbound?.journey?.journeyId || '';
        const inboundJourneyId = flightStore.selection.inbound?.journey?.journeyId || '';

        // Extract numeric part for comparison
        const extractNum = (id: string) => (id.match(/\d+/g) || []).join('');
        const refNum = extractNum(journeyRef);
        const outNum = extractNum(outboundJourneyId);
        const inNum = extractNum(inboundJourneyId);

        console.log(`[detectDirection] Journey ref ${journeyRef} (${refNum}) vs outbound ${outboundJourneyId} (${outNum}), inbound ${inboundJourneyId} (${inNum})`);

        if (journeyRef === outboundJourneyId || refNum === outNum) {
          console.log(`[detectDirection] Matched OUTBOUND journey`);
          return 'outbound';
        }
        if (journeyRef === inboundJourneyId || refNum === inNum) {
          console.log(`[detectDirection] Matched INBOUND journey`);
          return 'inbound';
        }
      }

      // STRATEGY 4: Match segment refs to stored flight segments
      if (segmentRefs.length > 0) {
        const outboundSegIds = flightStore.selection.outbound?.journey?.segments?.map(s => s.segmentId) || [];
        const inboundSegIds = flightStore.selection.inbound?.journey?.segments?.map(s => s.segmentId) || [];

        const extractNum = (id: string) => (id.match(/\d+/g) || []).join('');

        let matchesOutbound = false;
        let matchesInbound = false;

        for (const ref of segmentRefs) {
          const refNum = extractNum(ref);
          if (outboundSegIds.some(s => extractNum(s) === refNum)) matchesOutbound = true;
          if (inboundSegIds.some(s => extractNum(s) === refNum)) matchesInbound = true;
        }

        if (matchesOutbound || matchesInbound) {
          const direction = matchesOutbound && matchesInbound ? 'both' : matchesOutbound ? 'outbound' : 'inbound';
          console.log(`[detectDirection] From segment matching: ${direction}`);
          return direction;
        }
      }

      // STRATEGY 5: Match leg refs to stored flight segments (leg IDs contain segment IDs)
      // Leg refs like "seg1799359779-leg1" should match segment "seg1799359779"
      if (legRefs.length > 0) {
        const outboundSegIds = flightStore.selection.outbound?.journey?.segments?.map(s => s.segmentId) || [];
        const inboundSegIds = flightStore.selection.inbound?.journey?.segments?.map(s => s.segmentId) || [];

        // Extract numeric portion, stripping leg suffix (e.g., "seg1799359779-leg1" -> "1799359779")
        const extractNumWithoutLeg = (id: string) => {
          const withoutLeg = id.replace(/-leg\d+$/i, '');
          return (withoutLeg.match(/\d+/g) || []).join('');
        };

        let matchesOutbound = false;
        let matchesInbound = false;

        for (const ref of legRefs) {
          const refNum = extractNumWithoutLeg(ref);
          if (outboundSegIds.some(s => extractNumWithoutLeg(s) === refNum)) matchesOutbound = true;
          if (inboundSegIds.some(s => extractNumWithoutLeg(s) === refNum)) matchesInbound = true;
        }

        if (matchesOutbound || matchesInbound) {
          const direction = matchesOutbound && matchesInbound ? 'both' : matchesOutbound ? 'outbound' : 'inbound';
          console.log(`[detectDirection] From leg matching: ${direction} (legRefs: ${legRefs.join(', ')})`);
          return direction;
        }
      }

      // Fallback: if no matches, default to 'both' for visibility
      console.log(`[detectDirection] No match found - defaulting to 'both'`);
      return 'both';
    };

    console.log('[ServiceListStep] Current outbound bundle CODE:', currentOutboundBundle?.bundleCode);
    console.log('[ServiceListStep] Current inbound bundle CODE:', currentInboundBundle?.bundleCode);

    const serviceDefMap = new Map<string, any>();
    for (const svc of serviceDefinitions) {
      const id = svc.serviceId || svc.ServiceID || '';
      serviceDefMap.set(id, svc);
    }

    // Track bundle inclusion codes by direction (OOCP, MORE, FLEX, CCSH etc.)
    // These are filtered OUT from regular services but NOT displayed in bundle cards
    // because Jetstar's ServiceList returns them by direction, not linked to specific bundles.
    const bundleInclusionsByDirection: Record<'outbound' | 'inbound' | 'both', { code: string; name: string }[]> = {
      outbound: [],
      inbound: [],
      both: [],
    };

    for (const offer of ancillaryOffers) {
      const serviceRefId = offer.serviceRefId || offer.ServiceRefID;
      const serviceDef = serviceDefMap.get(serviceRefId);

      const serviceCode = serviceDef?.serviceCode || serviceDef?.ServiceCode || offer.serviceCode || '';
      const rawName = serviceDef?.serviceName || serviceDef?.ServiceName || offer.serviceName || 'Service';

      const associationType = offer.associationType || 'unknown';
      const journeyRefs = offer.journeyRefIds || [];
      const segmentRefs = offer.segmentRefIds || [];
      const legRefs = offer.legRefIds || [];
      const offerId = offer.offerId || offer.OfferID;

      // Debug: Log association type for each service
      if (legRefs.length > 0 || associationType === 'leg') {
        console.log(`[ServiceListStep] LEG SERVICE: ${serviceCode} - assocType=${associationType}, legRefs=${legRefs.join(',')}`);
      }

      // Determine direction using segment origin/destination from API DataLists
      const direction = detectDirection(segmentRefs, journeyRefs, legRefs);
      const bundleDirection: 'outbound' | 'inbound' | 'both' = direction;

      // Get service price
      const servicePrice = offer.price?.value || offer.Price?.Amount || 0;

      // Check if this is a bundle inclusion (OOCP, MORE, FLEX, CCSH etc.)
      // These are filtered OUT from regular services - they're part of bundles, not purchasable separately
      // AUTO-DETECTS: $0 services with bundle-related keywords (cancel, change, flex, etc.)
      if (isBundleInclusion(serviceCode, rawName, servicePrice)) {
        bundleInclusionsByDirection[bundleDirection].push({
          code: serviceCode.toUpperCase(),
          name: rawName,
        });
        console.log(`[ServiceListStep] Bundle inclusion filtered (not purchasable): ${serviceCode} -> ${rawName} ($${servicePrice}), direction=${bundleDirection}`);
        continue; // Don't add to services array - these are bundle components, not standalone services
      }

      // Check if this is a bundle
      if (isBundleCode(serviceCode)) {
        const tier = getBundleTier(serviceCode);
        const upperCode = serviceCode.toUpperCase();

        // Check if this is the current bundle for this direction
        // ONLY match by EXACT code - tier matching causes wrong matches
        // For 'both' direction, check if matches EITHER outbound or inbound current bundle
        let isCurrentBundle = false;
        if (bundleDirection === 'both') {
          const outboundCode = currentOutboundBundle?.bundleCode?.toUpperCase() || '';
          const inboundCode = currentInboundBundle?.bundleCode?.toUpperCase() || '';
          isCurrentBundle = upperCode === outboundCode || upperCode === inboundCode;
        } else {
          const currentBundleForDirection = bundleDirection === 'inbound'
            ? currentInboundBundle
            : currentOutboundBundle;
          const currentBundleCode = currentBundleForDirection?.bundleCode?.toUpperCase() || '';
          isCurrentBundle = currentBundleCode === upperCode;
        }

        console.log(`[ServiceListStep] Bundle ${upperCode} isCurrentBundle check: direction=${bundleDirection}, match=${isCurrentBundle}`);

        // Bundle name comes directly from XML - just clean up common prefixes/suffixes
        let bundleName = rawName;
        bundleName = bundleName.replace(/^JQ\s*/i, '').trim();
        bundleName = bundleName.replace(/\s*Current\s*$/i, '').trim();
        bundleName = bundleName.replace(/\s*Bundle\s*$/i, '').trim();
        bundleName = bundleName.replace(/\s*\(NDC\)\s*/gi, '').trim();
        bundleName = bundleName.replace(/\s*NDC\s*$/i, '').trim();
        bundleName = bundleName.replace(/\s+\d+\s*$/i, '').trim();

        // If name is empty or just the code, use tier name from config as fallback
        if (!bundleName || bundleName === serviceCode || bundleName.toUpperCase() === upperCode) {
          bundleName = BUNDLE_TIER_NAMES[tier] || upperCode;
        }

        // Capitalize first letter for consistency
        if (bundleName && bundleName === bundleName.toUpperCase()) {
          bundleName = bundleName.charAt(0).toUpperCase() + bundleName.slice(1).toLowerCase();
        }

        // Get bundle's included service refs from ServiceBundle (parsed by backend)
        const includedServiceRefIds = offer.includedServiceRefIds || [];
        console.log(`[ServiceListStep] Bundle detected: code=${upperCode}, rawName="${rawName}", resolvedName="${bundleName}", tier=${tier}, direction=${bundleDirection}, offerId=${offerId}, journeyRefs=${journeyRefs}, segmentRefs=${segmentRefs}, includedServiceRefIds=${includedServiceRefIds.length}`);

        bundles.push({
          serviceId: offer.offerItemId || offer.OfferItemID || serviceRefId || '',
          serviceCode: upperCode,
          serviceName: bundleName,
          tier,
          tierName: bundleName,
          price: offer.price?.value || offer.Price?.Amount || 0,
          currency: offer.price?.currency || offer.Price?.CurrencyCode || 'AUD',
          inclusions: { ...EMPTY_BUNDLE_INCLUSIONS },  // Empty - will be populated from XML ServiceBundle refs
          offerId,
          offerItemId: offer.offerItemId || offer.OfferItemID,
          journeyRefs,
          segmentRefs,
          isCurrentBundle,
          direction: bundleDirection,
          paxOfferItemIds: offer.paxOfferItemIds,
          includedServiceRefIds,  // Store refs to resolve inclusions later
        });
      } else {
        // Regular ancillary service
        const weight = extractWeight(rawName, serviceCode);
        const friendlyName = makeFriendlyName(rawName, serviceCode, weight);
        const segmentRefs = offer.segmentRefIds || [];
        const legRefs = offer.legRefIds || [];
        const offerId = offer.offerId || offer.OfferID;

        // Determine direction for this service using segment origin/destination from API
        const serviceDirection = detectDirection(segmentRefs, journeyRefs, legRefs);

        services.push({
          serviceId: offer.offerItemId || offer.OfferItemID || serviceRefId || '',
          serviceCode,
          serviceName: friendlyName,
          serviceType: detectServiceType(serviceCode, rawName, serviceDef?.rfic),
          price: offer.price?.value || offer.Price?.Amount || 0,
          currency: offer.price?.currency || offer.Price?.CurrencyCode || 'AUD',
          description: serviceDef?.description || serviceDef?.Description,
          offerId,
          offerItemId: offer.offerItemId || offer.OfferItemID,
          paxRefIds: offer.paxRefIds || [],
          segmentRefs,
          journeyRefs,
          legRefs,
          associationType,
          maxQuantity: 1,
          weight,
          rfic: serviceDef?.rfic || '',
          rfisc: serviceDef?.rfisc || '',
          direction: serviceDirection,
        });
      }
    }

    // FOR ROUND TRIPS: Split "both" services into separate outbound/inbound options
    // This allows users to select services per-flight (e.g., different baggage each way)
    // NOTE: We keep the ORIGINAL refs from the API - the backend will use them as-as
    // The direction split is only for UI display purposes
    // API TEAM REQUIREMENT: Show ALL services including $0 priced ones for review
    let processedServices: Service[] = [];

    if (isRoundTripSearch) {
      for (const svc of services) {
        // Note: Bundle inclusions (OOCP, MORE, FLEX, etc.) are already filtered in the offer loop
        // and added to bundleInclusionsByDirection to be shown inside bundle cards
        // Include ALL services (including $0 priced) for API team review
        if (svc.direction === 'both') {
          // Split into two separate service options for UI
          // KEEP original refs - the API knows which segments they apply to
          processedServices.push({
            ...svc,
            serviceId: `${svc.serviceId}-outbound`,
            direction: 'outbound',
            // Keep original refs unchanged - API will handle them
          });
          processedServices.push({
            ...svc,
            serviceId: `${svc.serviceId}-inbound`,
            direction: 'inbound',
            // Keep original refs unchanged - API will handle them
          });
        } else {
          // Keep as-is (already outbound or inbound)
          processedServices.push(svc);
        }
      }
    } else {
      // One-way: all services are outbound
      // Note: Bundle inclusions already filtered in offer loop
      // Include ALL services (including $0 priced) for API team review
      processedServices = services;
    }

    // VISUAL GROUPING: Group duplicate services for display while keeping all segment services internally
    // Key: serviceCode + direction + serviceName (for grouping identical services)
    // Value: Array of ALL segment services (each with unique offerItemId)
    const serviceGroups = new Map<string, Service[]>();

    for (const svc of processedServices) {
      const groupKey = `${svc.serviceCode}-${svc.direction}-${svc.serviceName}`;

      if (!serviceGroups.has(groupKey)) {
        serviceGroups.set(groupKey, []);
      }
      serviceGroups.get(groupKey)!.push(svc);
    }

    // Create display services: ONE per group with summed price, but track all segment services internally
    const uniqueServices = new Map<string, Service>();
    for (const [groupKey, segmentServices] of serviceGroups.entries()) {
      // Use first service as the display service
      const displayService = { ...segmentServices[0] };

      // Sum prices across all segments
      displayService.price = segmentServices.reduce((sum, svc) => sum + svc.price, 0);

      // Merge all refs from grouped services (for display purposes)
      // This ensures we show ALL leg/segment/journey refs even if service is split across multiple offers
      const allSegmentRefs = new Set<string>();
      const allJourneyRefs = new Set<string>();
      const allLegRefs = new Set<string>();
      for (const svc of segmentServices) {
        svc.segmentRefs?.forEach(r => allSegmentRefs.add(r));
        svc.journeyRefs?.forEach(r => allJourneyRefs.add(r));
        svc.legRefs?.forEach(r => allLegRefs.add(r));
      }
      displayService.segmentRefs = Array.from(allSegmentRefs);
      displayService.journeyRefs = Array.from(allJourneyRefs);
      displayService.legRefs = Array.from(allLegRefs);

      // Store array of segment services in a custom property for internal tracking
      (displayService as any).segmentServices = segmentServices;

      // Use group key as serviceId for display
      displayService.serviceId = groupKey;

      uniqueServices.set(groupKey, displayService);

      console.log(`[ServiceListStep] Grouped ${segmentServices.length} segments for "${displayService.serviceName}" - Total price: $${displayService.price}, legRefs: ${displayService.legRefs?.join(',')}`);
    }

    console.log('[ServiceListStep] Created display groups:', uniqueServices.size, 'groups from', processedServices.length, 'segment services');

    // Log all bundles BEFORE any processing
    console.log('[ServiceListStep] ALL bundles before inference (count=' + bundles.length + '):',
      bundles.map(b => ({ code: b.serviceCode, direction: b.direction, journeyRefs: b.journeyRefs, segmentRefs: b.segmentRefs })));

    // SMART DIRECTION HANDLING FOR ROUND TRIPS
    const hasRoundTrip = !!flightStore.selection.inbound;
    const outboundSegmentId = flightStore.selection.outbound?.journey?.segments?.[0]?.segmentId;
    const inboundSegmentId = flightStore.selection.inbound?.journey?.segments?.[0]?.segmentId;

    console.log('[ServiceListStep] hasRoundTrip:', hasRoundTrip, 'outboundSegmentId:', outboundSegmentId, 'inboundSegmentId:', inboundSegmentId);

    // For round trips, we need to handle bundles that apply to BOTH flights
    // The API often returns a single bundle entry that covers both directions
    // We need to DUPLICATE these bundles - one for outbound, one for inbound
    let processedBundles: DetectedBundle[] = [];

    if (hasRoundTrip) {
      // Get current bundle codes for exact matching
      const outboundCurrentCode = currentOutboundBundle?.bundleCode?.toUpperCase() || '';
      const inboundCurrentCode = currentInboundBundle?.bundleCode?.toUpperCase() || '';

      console.log('[ServiceListStep] Current bundle codes - outbound:', outboundCurrentCode, 'inbound:', inboundCurrentCode);

      // Get journey IDs to match bundles to correct column
      const outboundJourneyId = flightStore.selection.outbound?.journey?.journeyId || '';
      const inboundJourneyId = flightStore.selection.inbound?.journey?.journeyId || '';
      console.log('[ServiceListStep] Journey IDs - outbound:', outboundJourneyId, 'inbound:', inboundJourneyId);

      for (const bundle of bundles) {
        const upperBundleCode = bundle.serviceCode.toUpperCase();

        const isOutboundCurrent = upperBundleCode === outboundCurrentCode;
        const isInboundCurrent = upperBundleCode === inboundCurrentCode;

        // Check if bundle has BOTH journey refs (round-trip bundle that needs splitting)
        const hasMultipleJourneys = bundle.journeyRefs && bundle.journeyRefs.length > 1;

        const outboundJourneyRef = bundle.journeyRefs?.[0];
        const inboundJourneyRef = bundle.journeyRefs?.[1];

        console.log(`[ServiceListStep] Processing bundle ${bundle.serviceCode}:`, {
          originalOfferItemId: bundle.offerItemId,
          originalJourneyRefs: bundle.journeyRefs,
          hasMultipleJourneys,
        });

        if (hasMultipleJourneys) {
          // Bundle applies to BOTH journeys - split into outbound and inbound with SINGLE journey refs
          const outboundBundle = {
            ...bundle,
            serviceId: `${bundle.serviceId}-outbound`,
            direction: 'outbound' as const,
            isCurrentBundle: isOutboundCurrent,
            journeyRefs: [outboundJourneyRef],
          };

          const inboundBundle = {
            ...bundle,
            serviceId: `${bundle.serviceId}-inbound`,
            direction: 'inbound' as const,
            isCurrentBundle: isInboundCurrent,
            journeyRefs: [inboundJourneyRef],
          };

          console.log(`[ServiceListStep] Round-trip bundle ${bundle.serviceCode} - splitting into separate outbound/inbound entries`);
          processedBundles.push(outboundBundle);
          processedBundles.push(inboundBundle);
        } else {
          // Bundle has SINGLE journey ref - show ONLY in the column that matches that journey
          const journeyRef = bundle.journeyRefs?.[0];

          // Determine which column this bundle belongs to
          const isForOutbound = journeyRef === outboundJourneyId;
          const isForInbound = journeyRef === inboundJourneyId;

          if (isForOutbound) {
            const outboundBundle = {
              ...bundle,
              serviceId: `${bundle.serviceId}-outbound`,
              direction: 'outbound' as const,
              isCurrentBundle: isOutboundCurrent,
            };
            console.log(`[ServiceListStep] Single-journey bundle ${bundle.serviceCode} - showing ONLY in outbound column`);
            processedBundles.push(outboundBundle);
          } else if (isForInbound) {
            const inboundBundle = {
              ...bundle,
              serviceId: `${bundle.serviceId}-inbound`,
              direction: 'inbound' as const,
              isCurrentBundle: isInboundCurrent,
            };
            console.log(`[ServiceListStep] Single-journey bundle ${bundle.serviceCode} - showing ONLY in inbound column`);
            processedBundles.push(inboundBundle);
          } else {
            console.warn(`[ServiceListStep] Bundle ${bundle.serviceCode} journey ref "${journeyRef}" doesn't match outbound "${outboundJourneyId}" or inbound "${inboundJourneyId}" - skipping`);
          }
        }
      }
    } else {
      // One-way trip - all bundles are outbound
      processedBundles = bundles.map(b => ({ ...b, direction: 'outbound' as const }));
    }

    console.log('[ServiceListStep] Processed bundles after direction assignment:', processedBundles.map(b => ({
      code: b.serviceCode,
      direction: b.direction,
      isCurrentBundle: b.isCurrentBundle,
      serviceId: b.serviceId,
      offerItemId: b.offerItemId,
      journeyRefs: b.journeyRefs,
    })));

    // NOW deduplicate bundles by code + direction (after direction assignment)
    const uniqueBundles = new Map<string, DetectedBundle>();
    for (const bundle of processedBundles) {
      const key = `${bundle.serviceCode}-${bundle.direction}`;
      if (!uniqueBundles.has(key)) {
        uniqueBundles.set(key, bundle);
      }
    }

    const bundleArray = Array.from(uniqueBundles.values());

    // Sort bundles by direction (outbound first), then by tier
    const sortedBundles = bundleArray.sort((a, b) => {
      // Outbound first
      if (a.direction === 'outbound' && b.direction !== 'outbound') return -1;
      if (a.direction !== 'outbound' && b.direction === 'outbound') return 1;
      // Then inbound before both
      if (a.direction === 'inbound' && b.direction === 'both') return -1;
      if (a.direction === 'both' && b.direction === 'inbound') return 1;
      // Then by tier
      return a.tier - b.tier;
    });

    console.log('[ServiceListStep] Final bundles with directions:', sortedBundles.map(b => ({
      code: b.serviceCode,
      name: b.tierName,
      direction: b.direction,
      journeyRefs: b.journeyRefs,
      isCurrentBundle: b.isCurrentBundle,
    })));

    // Build SSR mappings for seat characteristics (UPFX, LEGX, etc.)
    // These SSRs typically have $0.00 price and are used when seats with those characteristics are selected
    // Structure: { 'UPFX': { 'seg123': { 'ADT0': 'item-upfx-seg123-adt0' } } }
    console.log('[ServiceListStep] Building SSR mappings from ancillary offers');
    console.log('[ServiceListStep] ServiceDefMap size:', serviceDefMap.size);
    console.log('[ServiceListStep] Total ancillaryOffers:', ancillaryOffers.length);

    // Debug: Check if UPFX/LEGX/JLSF are in ancillaryOffers by serviceCode
    const SEAT_SSR_DEBUG = ['UPFX', 'LEGX', 'JLSF'];
    const ssrOffersWithCode = ancillaryOffers.filter((o: any) =>
      SEAT_SSR_DEBUG.includes((o.serviceCode || '').toUpperCase())
    );
    console.log('[ServiceListStep] SSR offers with direct serviceCode:', ssrOffersWithCode.length, ssrOffersWithCode.map((o: any) => o.serviceCode));

    // Debug: Find any UPFX/LEGX/JLSF in serviceDefMap
    const SEAT_SSR_CODES_DEBUG = ['UPFX', 'LEGX', 'JLSF'];
    const ssrDefIds: string[] = [];
    serviceDefMap.forEach((def, id) => {
      const code = def?.serviceCode || def?.ServiceCode || '';
      if (SEAT_SSR_CODES_DEBUG.includes(code)) {
        console.log(`[ServiceListStep] 🔍 ServiceDefMap contains ${code}:`, { id, def });
        ssrDefIds.push(id);
      }
    });
    console.log('[ServiceListStep] ====== SSR DEBUG START ======');
    console.log('[ServiceListStep] SSR serviceIds in serviceDefMap:', ssrDefIds);

    // Debug: Check if ancillaryOffers have matching serviceRefIds
    const matchingOffers = ancillaryOffers.filter((o: any) => ssrDefIds.includes(o.serviceRefId || o.ServiceRefID));
    console.log('[ServiceListStep] AncillaryOffers matching SSR serviceRefIds:', matchingOffers.length, matchingOffers.map((o: any) => ({
      serviceRefId: o.serviceRefId,
      serviceCode: o.serviceCode,
      offerItemId: o.offerItemId,
    })));

    for (const offer of ancillaryOffers) {
      const serviceRefId = offer.serviceRefId || offer.ServiceRefID;
      const serviceDef = serviceDefMap.get(serviceRefId);
      const serviceCode = serviceDef?.serviceCode || serviceDef?.ServiceCode || offer.serviceCode || '';
      const serviceType = serviceDef?.serviceType || 'OTHER';
      const rfic = serviceDef?.rfic || '';

      // Known seat-related SSR codes that need to be mapped for seat selection
      const SEAT_SSR_CODES = ['UPFX', 'LEGX', 'JLSF'];

      // Debug: Log if we find a seat-related SSR
      if (SEAT_SSR_CODES.includes(serviceCode)) {
        console.log(`[ServiceListStep] 🎯 Found seat SSR: ${serviceCode}`, {
          serviceRefId,
          offerItemId: offer.offerItemId,
          serviceType,
          rfic,
          segmentRefIds: offer.segmentRefIds,
          paxRefIds: offer.paxRefIds,
        });
      }

      // Process SSR services (RFIC = 'P', serviceType = 'SSR', or known seat SSR codes)
      if (serviceType === 'SSR' || rfic === 'P' || SEAT_SSR_CODES.includes(serviceCode)) {
        const offerId = offer.offerId || offer.OfferID || '';  // ServiceList ALaCarteOffer ID
        const offerItemId = offer.offerItemId || offer.OfferItemID || '';
        const paxRefIds = offer.paxRefIds || [];
        const segmentRefIds = offer.segmentRefIds || [];

        // Initialize SSR code in mapping if not exists
        if (!ssrMappings[serviceCode]) {
          ssrMappings[serviceCode] = {};
        }

        // Map SSR to segment and passenger - store both offerId and offerItemId
        for (const segmentId of segmentRefIds) {
          if (!ssrMappings[serviceCode][segmentId]) {
            ssrMappings[serviceCode][segmentId] = {};
          }

          for (const paxId of paxRefIds) {
            ssrMappings[serviceCode][segmentId][paxId] = { offerId, offerItemId };
          }
        }

        console.log(`[ServiceListStep] SSR Mapping: ${serviceCode} -> seg[${segmentRefIds.join(',')}] -> pax[${paxRefIds.join(',')}] = { offerId: ${offerId}, offerItemId: ${offerItemId} }`);
      }
    }

    console.log('[ServiceListStep] Complete SSR mappings:', ssrMappings);

    // Resolve bundle inclusions using includedServiceRefIds from the backend
    // Each bundle has a ServiceBundle element containing ServiceDefinitionRefID elements
    // Just display raw service names from XML - no categorization
    console.log('[ServiceListStep] 🔍 Resolving bundle inclusions...');
    console.log('[ServiceListStep] serviceDefMap size:', serviceDefMap.size);

    for (const bundle of sortedBundles) {
      const includedRefs = (bundle as any).includedServiceRefIds || [];
      console.log(`[ServiceListStep] 📦 Bundle ${bundle.serviceCode} has ${includedRefs.length} includedRefs:`, includedRefs);

      if (includedRefs.length > 0) {
        const resolvedInclusions: { code: string; name: string }[] = [];

        for (const refId of includedRefs) {
          // Look up the service definition by its ID
          const serviceDef = serviceDefMap.get(refId);
          if (serviceDef) {
            const code = (serviceDef.serviceCode || serviceDef.ServiceCode || '').toUpperCase();
            const name = serviceDef.serviceName || serviceDef.ServiceName || code;
            // Add all inclusions as raw data - no categorization
            resolvedInclusions.push({ code, name });
          }
        }

        // Update bundle inclusions - only use otherInclusions for raw display
        bundle.inclusions = {
          baggage: '',
          meals: false,
          seatSelection: false,
          changes: '',
          cancellation: '',
          otherInclusions: resolvedInclusions,
        };

        console.log(`[ServiceListStep] Bundle ${bundle.serviceCode} resolved ${resolvedInclusions.length} inclusions:`,
          resolvedInclusions.map(i => `${i.name} (${i.code})`));
      }
    }

    // Log any remaining inclusion codes that were filtered but not linked to bundles
    console.log('[ServiceListStep] Bundle inclusions filtered from services (direction-based):', bundleInclusionsByDirection);

    return {
      services: Array.from(uniqueServices.values()),
      bundles: sortedBundles,
      ssrMappings,
    };
  };

  const extractWeight = (name: string, code: string): string | undefined => {
    const combined = (name + ' ' + code).toUpperCase();
    const weightMatch = combined.match(/(\d+)\s*KG/);
    return weightMatch ? `${weightMatch[1]}kg` : undefined;
  };

  const makeFriendlyName = (rawName: string, code: string, weight?: string): string => {
    let name = rawName;
    if (weight) {
      const type = rawName.toUpperCase().includes('CHECKED') ? 'Checked Bag' : 'Bag';
      return `${weight} ${type}`;
    }
    name = name.replace(/^JQ\s*/i, '');
    name = name.replace(/\s+/g, ' ').trim();
    if (name === name.toUpperCase() && name.length > 3) {
      name = name.charAt(0) + name.slice(1).toLowerCase();
    }
    return name || code;
  };

  // Config-driven service type detection
  const detectServiceType = (code: string, name: string, rfic?: string): Service['serviceType'] => {
    // SSR services have RFIC = 'P'
    if (rfic === 'P') return 'ssr';

    const combined = (code + ' ' + name).toUpperCase();
    const upperCode = code.toUpperCase();

    // Helper to check if code matches a service type config
    const matchesConfig = (config: typeof SERVICE_TYPES_CONFIG.baggage): boolean => {
      // Check prefixes
      if (config.prefixes?.some(p => upperCode.startsWith(p.toUpperCase()))) return true;
      // Check exact codes (for SSR)
      if ((config as any).exactCodes?.some((c: string) => upperCode === c.toUpperCase())) return true;
      // Check keywords in combined string
      if (config.keywords?.some(k => combined.includes(k.toUpperCase()))) return true;
      return false;
    };

    // Check each service type in order (order matters for precedence)
    // SSR is checked FIRST to catch CB codes (carry-on baggage) before general baggage
    if (matchesConfig(SERVICE_TYPES_CONFIG.ssr)) return 'ssr';
    if (matchesConfig(SERVICE_TYPES_CONFIG.baggage)) return 'baggage';
    if (matchesConfig(SERVICE_TYPES_CONFIG.meal)) return 'meal';
    if (matchesConfig(SERVICE_TYPES_CONFIG.insurance)) return 'insurance';
    if (matchesConfig(SERVICE_TYPES_CONFIG.flexibility)) return 'flexibility';
    if (matchesConfig(SERVICE_TYPES_CONFIG.bundle)) return 'bundle';

    return 'other';
  };

  // Toggle service for a specific passenger
  const toggleServiceForPax = (serviceId: string, paxId: string) => {
    console.log('[ServiceListStep] toggleServiceForPax called:', { serviceId, paxId });
    setPerPaxSelections(prev => {
      const newMap = new Map(prev);
      const key = serviceId;
      const currentPaxSet = newMap.get(key) || new Set();
      const newPaxSet = new Set(currentPaxSet);

      if (newPaxSet.has(paxId)) {
        newPaxSet.delete(paxId);
        console.log('[ServiceListStep] Removed pax from service:', { serviceId, paxId });
      } else {
        newPaxSet.add(paxId);
        console.log('[ServiceListStep] Added pax to service:', { serviceId, paxId });
      }

      if (newPaxSet.size === 0) {
        newMap.delete(key);
      } else {
        newMap.set(key, newPaxSet);
      }

      console.log('[ServiceListStep] Updated perPaxSelections:', Array.from(newMap.entries()).map(([k, v]) => ({ serviceId: k, paxIds: Array.from(v) })));
      return newMap;
    });
  };

  // Select service for all passengers at once
  const toggleServiceForAllPax = (serviceId: string) => {
    const eligiblePax = getEligiblePassengers(services.find(s => s.serviceId === serviceId));

    setPerPaxSelections(prev => {
      const newMap = new Map(prev);
      const currentPaxSet = newMap.get(serviceId) || new Set();

      // If all eligible pax are selected, deselect all; otherwise select all
      const allSelected = eligiblePax.every(p => currentPaxSet.has(p.paxId));

      if (allSelected) {
        newMap.delete(serviceId);
      } else {
        newMap.set(serviceId, new Set(eligiblePax.map(p => p.paxId)));
      }

      return newMap;
    });
  };

  // Toggle expand/collapse for a service card
  const toggleExpand = (serviceId: string) => {
    setExpandedServices(prev => {
      const newSet = new Set(prev);
      if (newSet.has(serviceId)) {
        newSet.delete(serviceId);
      } else {
        newSet.add(serviceId);
      }
      return newSet;
    });
  };

  // Get passengers eligible for a service (based on paxRefIds if specified)
  const getEligiblePassengers = (service: Service | undefined): PassengerInfo[] => {
    if (!service) return passengers;

    // If service has specific paxRefIds, filter to those
    if (service.paxRefIds && service.paxRefIds.length > 0) {
      return passengers.filter(p => {
        // Match by type prefix (ADT, CHD, INF)
        return service.paxRefIds?.some(ref => ref.startsWith(p.paxType));
      });
    }

    // Exclude infants from SSR services (lot of SSR shouldn't be allowed for INF)
    if (service.serviceType === 'ssr') {
      return passengers.filter(p => p.paxType !== 'INF');
    }

    return passengers;
  };

  // Calculate total based on per-pax selections
  const calculateServicesTotal = (): number => {
    let total = 0;
    perPaxSelections.forEach((paxSet, serviceId) => {
      const service = services.find(s => s.serviceId === serviceId);
      if (service) {
        total += service.price * paxSet.size;
      }
    });

    // Add bundle swap costs (price per paying passenger)
    const paxCounts = flightStore.searchCriteria?.passengers || { adults: 1, children: 0, infants: 0 };
    const payingPaxCount = paxCounts.adults + paxCounts.children; // Infants don't pay for bundles

    if (selectedOutboundBundleSwap) {
      const outboundBundle = detectedBundles.find(b => b.serviceId === selectedOutboundBundleSwap);
      if (outboundBundle) {
        total += outboundBundle.price * payingPaxCount;
      }
    }
    if (selectedInboundBundleSwap) {
      const inboundBundle = detectedBundles.find(b => b.serviceId === selectedInboundBundleSwap);
      if (inboundBundle) {
        total += inboundBundle.price * payingPaxCount;
      }
    }

    return total;
  };

  // Count total selected items (service + pax combinations + bundle swaps)
  const countSelectedItems = (): number => {
    let count = 0;
    perPaxSelections.forEach((paxSet) => {
      count += paxSet.size;
    });
    // Also count bundle swaps as selections
    if (selectedOutboundBundleSwap) count++;
    if (selectedInboundBundleSwap) count++;
    return count;
  };

  const handleContinue = () => {
    console.log('[ServiceListStep] handleContinue called');
    console.log('[ServiceListStep] perPaxSelections state:', Array.from(perPaxSelections.entries()).map(([k, v]) => ({ serviceId: k, paxIds: Array.from(v) })));
    console.log('[ServiceListStep] selectedOutboundBundleSwap:', selectedOutboundBundleSwap);
    console.log('[ServiceListStep] selectedInboundBundleSwap:', selectedInboundBundleSwap);
    console.log('[ServiceListStep] detectedBundles:', detectedBundles);
    console.log('[ServiceListStep] services count:', services.length);

    let servicesTotal = calculateServicesTotal();
    const selectedServicesList: Array<{
      serviceId: string;
      serviceCode: string;
      serviceName: string;
      serviceType: Service['serviceType'];
      quantity: number;
      price: number;
      currency: string;
      offerId: string;
      offerItemId: string;
      paxRefIds: string[];
      associationType: Service['associationType'];
      segmentRefs?: string[];
      journeyRefs?: string[];
      legRefs?: string[];
      direction: Service['direction'];
      paxOfferItemIds?: Record<string, string>;  // Per-passenger offerItemIds for bundles
    }> = [];

    // 1. Add selected SSRs/ancillaries from perPaxSelections
    // CRITICAL: Expand grouped services back into individual segment services for API
    perPaxSelections.forEach((paxSet, serviceId) => {
      const service = services.find(s => s.serviceId === serviceId);
      if (service && paxSet.size > 0) {
        // Check if this is a grouped service (has segmentServices array)
        const segmentServices = (service as any).segmentServices as Service[] | undefined;

        if (segmentServices && segmentServices.length > 1) {
          // GROUPED SERVICE: Expand into multiple segment services for API
          // This ensures multi-leg/multi-segment SSRs send ALL required offerItemIds
          console.log(`[ServiceListStep] 🔄 EXPANDING grouped service "${service.serviceName}" (${service.serviceCode}) into ${segmentServices.length} segment services`);
          console.log(`[ServiceListStep] Each will have its own offerItemId for the API`);

          for (const segmentService of segmentServices) {
            console.log(`[ServiceListStep] ➡️ Adding segment service ${segmentService.serviceCode}:`, {
              offerId: segmentService.offerId,
              offerItemId: segmentService.offerItemId,
              price: segmentService.price,
              segmentRefs: segmentService.segmentRefs,
              journeyRefs: segmentService.journeyRefs,
              legRefs: segmentService.legRefs,
              associationType: segmentService.associationType,
            });

            selectedServicesList.push({
              serviceId: segmentService.serviceId,
              serviceCode: segmentService.serviceCode,
              serviceName: segmentService.serviceName,
              serviceType: segmentService.serviceType,
              quantity: paxSet.size,
              price: segmentService.price,  // Original segment price
              currency: segmentService.currency,
              offerId: segmentService.offerId || '',
              offerItemId: segmentService.offerItemId || '',  // Original segment offerItemId
              paxRefIds: Array.from(paxSet),
              associationType: segmentService.associationType,
              segmentRefs: segmentService.segmentRefs,
              journeyRefs: segmentService.journeyRefs,
              legRefs: segmentService.legRefs,
              direction: segmentService.direction,
            });
          }
        } else {
          // SINGLE SERVICE: Add as-is
          console.log(`[ServiceListStep] Adding single service ${service.serviceCode}:`, {
            serviceId,
            offerId: service.offerId,
            offerItemId: service.offerItemId,
          });

          selectedServicesList.push({
            serviceId,
            serviceCode: service.serviceCode,
            serviceName: service.serviceName,
            serviceType: service.serviceType,
            quantity: paxSet.size,
            price: service.price,
            currency: service.currency,
            offerId: service.offerId || '',
            offerItemId: service.offerItemId || '',
            paxRefIds: Array.from(paxSet),
            associationType: service.associationType,
            segmentRefs: service.segmentRefs,
            journeyRefs: service.journeyRefs,
            legRefs: service.legRefs,
            direction: service.direction,
          });
        }
      }
    });

    // 2. Add selected bundle swaps (if any) - bundles are journey-based
    // CRITICAL FIX: When SAME bundle is selected for BOTH journeys, create ONE entry with ALL journey refs
    console.log('[ServiceListStep] ===== BUNDLE MERGE DETECTION =====');
    console.log('[ServiceListStep] Selected bundle IDs:', {
      outbound: selectedOutboundBundleSwap,
      inbound: selectedInboundBundleSwap,
    });

    const outboundBundleObj = selectedOutboundBundleSwap ? detectedBundles.find(b => b.serviceId === selectedOutboundBundleSwap) : null;
    const inboundBundleObj = selectedInboundBundleSwap ? detectedBundles.find(b => b.serviceId === selectedInboundBundleSwap) : null;

    console.log('[ServiceListStep] Found bundle objects:', {
      outbound: outboundBundleObj ? {
        serviceId: outboundBundleObj.serviceId,
        offerItemId: outboundBundleObj.offerItemId,
        serviceName: outboundBundleObj.serviceName,
        journeyRefs: outboundBundleObj.journeyRefs,
      } : null,
      inbound: inboundBundleObj ? {
        serviceId: inboundBundleObj.serviceId,
        offerItemId: inboundBundleObj.offerItemId,
        serviceName: inboundBundleObj.serviceName,
        journeyRefs: inboundBundleObj.journeyRefs,
      } : null,
    });

    // Handle bundles for outbound/inbound separately - ALWAYS send as separate entries
    // Even if same bundle code selected, Jetstar needs to price each journey's bundle separately
    const bundleSwaps = [
      { bundle: outboundBundleObj, direction: 'outbound' as const },
      { bundle: inboundBundleObj, direction: 'inbound' as const },
    ].filter(item => item.bundle !== null);

    console.log('[ServiceListStep] Processing bundle swaps:', {
      outboundBundle: outboundBundleObj ? {
        serviceCode: outboundBundleObj.serviceCode,
        offerItemId: outboundBundleObj.offerItemId,
        journeyRefs: outboundBundleObj.journeyRefs,
      } : null,
      inboundBundle: inboundBundleObj ? {
        serviceCode: inboundBundleObj.serviceCode,
        offerItemId: inboundBundleObj.offerItemId,
        journeyRefs: inboundBundleObj.journeyRefs,
      } : null,
      note: 'Each bundle sent as SEPARATE entry for proper pricing',
    });

    for (const { bundle: selectedBundle, direction } of bundleSwaps) {
      if (selectedBundle) {
        const paxCounts = flightStore.searchCriteria?.passengers || { adults: 1, children: 0, infants: 0 };
        const bundlePaxRefIds: string[] = [];
        for (let i = 0; i < paxCounts.adults; i++) bundlePaxRefIds.push(`ADT${i}`);
        for (let i = 0; i < paxCounts.children; i++) bundlePaxRefIds.push(`CHD${i}`);

        const bundleQuantity = bundlePaxRefIds.length;
        const bundleTotalPrice = selectedBundle.price * bundleQuantity;

        selectedServicesList.push({
          serviceId: selectedBundle.serviceId,
          serviceCode: selectedBundle.serviceCode,
          serviceName: selectedBundle.serviceName,
          serviceType: 'bundle',
          quantity: bundleQuantity,
          price: selectedBundle.price,
          currency: selectedBundle.currency,
          offerId: selectedBundle.offerId || '',
          offerItemId: selectedBundle.offerItemId || '',
          paxRefIds: bundlePaxRefIds,
          associationType: 'journey',
          journeyRefs: selectedBundle.journeyRefs,
          segmentRefs: selectedBundle.segmentRefs,
          paxOfferItemIds: selectedBundle.paxOfferItemIds,
          direction: direction,
        });

        servicesTotal += bundleTotalPrice;

        console.log(`[ServiceListStep] Added ${direction} bundle swap to services:`, {
          bundle: selectedBundle.serviceName,
          serviceCode: selectedBundle.serviceCode,
          price: selectedBundle.price,
          quantity: bundleQuantity,
          totalBundleCost: bundleTotalPrice,
          paxRefIds: bundlePaxRefIds,
          direction: direction,
          offerId: selectedBundle.offerId,
          offerItemId: selectedBundle.offerItemId,
          journeyRefs: selectedBundle.journeyRefs,
          paxOfferItemIds: selectedBundle.paxOfferItemIds,
        });

        const swapJourneyRefId = selectedBundle.journeyRefs?.[0];
        flightStore.updateBundle(direction, {
          bundleId: selectedBundle.offerItemId || selectedBundle.serviceId,
          bundleCode: selectedBundle.serviceCode,
          bundleName: selectedBundle.serviceName,
          price: selectedBundle.price,
          tier: selectedBundle.tier,
          paxOfferItemIds: selectedBundle.paxOfferItemIds,
          ...(swapJourneyRefId ? { journeyRefId: swapJourneyRefId } : {}),
        });

        console.log(`[ServiceListStep] Updated ${direction} bundle in selection:`, {
          bundleCode: selectedBundle.serviceCode,
          bundleName: selectedBundle.serviceName,
          price: selectedBundle.price,
        });
      }
    }

    console.log('[ServiceListStep] ========== SAVING TO STORE ==========');
    console.log('[ServiceListStep] Total selected services:', selectedServicesList.length);
    console.log('[ServiceListStep] Selected services breakdown:');
    selectedServicesList.forEach((s, idx) => {
      console.log(`[ServiceListStep]   [${idx}] ${s.serviceCode} (${s.serviceType}):`, {
        name: s.serviceName,
        direction: s.direction,
        quantity: s.quantity,
        price: s.price,
        currency: s.currency,
        journeyRefs: s.journeyRefs || [],
        segmentRefs: s.segmentRefs || [],
        legRefs: s.legRefs || [],
        paxRefIds: s.paxRefIds || [],
        offerId: s.offerId,
        offerItemId: s.offerItemId,
      });
    });

    // CRITICAL DEBUG: Show bundle services explicitly to verify merge
    const bundleServices = selectedServicesList.filter(s => s.serviceType === 'bundle');
    console.log('[ServiceListStep] ===== BUNDLE SERVICES BEING SAVED =====');
    console.log(`[ServiceListStep] Bundle count: ${bundleServices.length}`);
    bundleServices.forEach((b, i) => {
      console.log(`[ServiceListStep] Bundle[${i}]:`, {
        serviceId: b.serviceId,
        serviceCode: b.serviceCode,
        serviceName: b.serviceName,
        direction: b.direction,
        offerItemId: b.offerItemId,
        journeyRefs: b.journeyRefs || [],
        paxRefIds: b.paxRefIds || [],
      });
    });
    console.log('[ServiceListStep] ==========================================');

    console.log('[ServiceListStep] Services total cost:', servicesTotal);
    console.log('[ServiceListStep] ======================================');
    flightStore.setSelectedServices(selectedServicesList, servicesTotal);

    if (onComplete) {
      onComplete();
    }
  };

  const handleBack = () => {
    if (onBack) {
      onBack();
    }
  };

  // Convert segment ID to friendly flight label
  const getFlightLabel = (segmentId: string): string => {
    const seg = segmentMapping.get(segmentId);
    if (seg) {
      const flightNum = seg.flightNumber ? `${seg.carrier || 'JQ'}${seg.flightNumber}` : '';
      return flightNum
        ? `${flightNum} ${seg.origin}-${seg.destination}`
        : `${seg.origin}-${seg.destination}`;
    }
    // Fallback: try to extract info from the segment ID itself
    return segmentId;
  };

  // Convert leg ref to friendly label (leg refs are usually "segmentId-leg0")
  const getLegLabel = (legRef: string): string => {
    const parts = legRef.split('-');
    const segmentId = parts[0];
    const legNum = parts[1]?.replace('leg', '') || '0';
    const seg = segmentMapping.get(segmentId);

    if (seg) {
      const flightNum = seg.flightNumber ? `${seg.carrier || 'JQ'}${seg.flightNumber}` : '';
      const base = flightNum
        ? `${flightNum} ${seg.origin}-${seg.destination}`
        : `${seg.origin}-${seg.destination}`;
      return parts.length > 1 ? `${base} (Leg ${parseInt(legNum) + 1})` : base;
    }
    return legRef;
  };

  // Group services by type (bundles are now detected separately via parseServicesAndBundles)
  // Ensure no service appears in multiple categories by tracking seen serviceIds
  const seenServiceIds = new Set<string>();

  const baggageServices = services.filter(s => {
    if (s.serviceType === 'baggage' && !seenServiceIds.has(s.serviceId)) {
      seenServiceIds.add(s.serviceId);
      return true;
    }
    return false;
  });

  const mealServices = services.filter(s => {
    if (s.serviceType === 'meal' && !seenServiceIds.has(s.serviceId)) {
      seenServiceIds.add(s.serviceId);
      return true;
    }
    return false;
  });

  const insuranceServices = services.filter(s => {
    if (s.serviceType === 'insurance' && !seenServiceIds.has(s.serviceId)) {
      seenServiceIds.add(s.serviceId);
      return true;
    }
    return false;
  });

  const ssrServices = services.filter(s => {
    if (s.serviceType === 'ssr' && !seenServiceIds.has(s.serviceId)) {
      seenServiceIds.add(s.serviceId);
      return true;
    }
    return false;
  });

  const flexibilityServices = services.filter(s => {
    if (s.serviceType === 'flexibility' && !seenServiceIds.has(s.serviceId)) {
      seenServiceIds.add(s.serviceId);
      return true;
    }
    return false;
  });

  const otherServices = services.filter(s => {
    if (s.serviceType === 'other' && !seenServiceIds.has(s.serviceId)) {
      seenServiceIds.add(s.serviceId);
      return true;
    }
    return false;
  });

  // Debug: Log service distribution
  console.log('[ServiceListStep] Service distribution:', {
    total: services.length,
    unique: seenServiceIds.size,
    baggage: baggageServices.length,
    meals: mealServices.length,
    insurance: insuranceServices.length,
    ssr: ssrServices.length,
    flexibility: flexibilityServices.length,
    other: otherServices.length,
  });

  // Debug: Log other services to verify JCON appears
  if (otherServices.length > 0) {
    console.log('[ServiceListStep] Other services:', otherServices.map(s => ({
      code: s.serviceCode,
      name: s.serviceName,
      price: s.price,
      direction: s.direction,
    })));
  }

  // Log any services that weren't categorized
  const uncategorized = services.filter(s => !seenServiceIds.has(s.serviceId));
  if (uncategorized.length > 0) {
    console.warn('[ServiceListStep] Uncategorized services:', uncategorized.map(s => ({ code: s.serviceCode, name: s.serviceName, type: s.serviceType })));
  }

  // Group bundles by direction
  const outboundBundles = detectedBundles.filter(b => b.direction === 'outbound' || b.direction === 'both');
  const inboundBundles = detectedBundles.filter(b => b.direction === 'inbound');

  // Get flight labels for display - show all flight numbers and route clearly
  const outboundFlightLabel = useMemo(() => {
    const segments = flightStore.selection.outbound?.journey?.segments;
    if (segments && segments.length > 0) {
      const origin = segments[0].origin;
      const destination = segments[segments.length - 1].destination;

      // Collect all flight numbers: JQ612, JQ39, JQ43
      const flightNumbers = segments
        .map(seg => seg.flightNumber ? `${seg.marketingCarrier || 'JQ'}${seg.flightNumber}` : '')
        .filter(Boolean);

      // Show: "JQ612, JQ39, JQ43 MEL-SIN" or just "MEL-SIN"
      return flightNumbers.length > 0
        ? `${flightNumbers.join(', ')} ${origin}-${destination}`
        : `${origin}-${destination}`;
    }
    return flightStore.searchCriteria ? `${flightStore.searchCriteria.origin}-${flightStore.searchCriteria.destination}` : 'Outbound';
  }, [flightStore.selection.outbound, flightStore.searchCriteria]);

  const inboundFlightLabel = useMemo(() => {
    const segments = flightStore.selection.inbound?.journey?.segments;
    if (segments && segments.length > 0) {
      const origin = segments[0].origin;
      const destination = segments[segments.length - 1].destination;

      // Collect all flight numbers
      const flightNumbers = segments
        .map(seg => seg.flightNumber ? `${seg.marketingCarrier || 'JQ'}${seg.flightNumber}` : '')
        .filter(Boolean);

      // Show: "JQ3 SIN-MEL" or just "SIN-MEL"
      return flightNumbers.length > 0
        ? `${flightNumbers.join(', ')} ${origin}-${destination}`
        : `${origin}-${destination}`;
    }
    return flightStore.searchCriteria ? `${flightStore.searchCriteria.destination}-${flightStore.searchCriteria.origin}` : 'Return';
  }, [flightStore.selection.inbound, flightStore.searchCriteria]);

  const servicesTotal = calculateServicesTotal();
  const selectedCount = countSelectedItems();

  if (isLoading) {
    return (
      <Card className="p-8 text-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary-500 mx-auto mb-4" />
        <p className="text-neutral-600">Loading available extras...</p>
      </Card>
    );
  }

  return (
    <div className="space-y-6 pb-28">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-neutral-900">Add Extras</h2>
          <p className="text-sm text-neutral-500 mt-1">
            Select extras for each passenger individually
          </p>
        </div>
        <div className="flex items-center gap-3">
          {passengers.length > 1 && (
            <div className="flex items-center gap-2 text-sm text-neutral-600 bg-neutral-100 px-3 py-1.5 rounded-full">
              <Users className="w-4 h-4" />
              {passengers.length} passengers
            </div>
          )}
          <button
            type="button"
            onClick={() => setShowDebug(!showDebug)}
            className={cn(
              'flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full transition-colors',
              showDebug
                ? 'bg-amber-100 text-amber-700 border border-amber-300'
                : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200'
            )}
            title="Toggle API debug info"
          >
            <Bug className="w-3.5 h-3.5" />
            {showDebug ? 'Debug ON' : 'Debug'}
          </button>
        </div>
      </div>

      {error && (
        <Alert variant="warning" title="Could not load extras">
          {error}. You can continue without adding extras.
        </Alert>
      )}

      {/* Debug Summary Panel */}
      {showDebug && services.length > 0 && (
        <Card className="bg-amber-50 border-amber-200">
          <div className="p-4">
            <h3 className="text-sm font-bold text-amber-800 flex items-center gap-2 mb-3">
              <Bug className="w-4 h-4" />
              API Debug Summary
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
              <div className="bg-white rounded-lg p-3 border border-amber-200">
                <div className="text-amber-600 font-medium mb-1">Total Services</div>
                <div className="text-2xl font-bold text-amber-900">{services.length}</div>
              </div>
              <div className="bg-white rounded-lg p-3 border border-amber-200">
                <div className="text-amber-600 font-medium mb-1">Segment-Based</div>
                <div className="text-2xl font-bold text-blue-600">
                  {services.filter(s => s.associationType === 'segment').length}
                </div>
              </div>
              <div className="bg-white rounded-lg p-3 border border-amber-200">
                <div className="text-amber-600 font-medium mb-1">Journey-Based</div>
                <div className="text-2xl font-bold text-green-600">
                  {services.filter(s => s.associationType === 'journey').length}
                </div>
              </div>
              <div className="bg-white rounded-lg p-3 border border-amber-200">
                <div className="text-amber-600 font-medium mb-1">Leg-Based</div>
                <div className="text-2xl font-bold text-amber-600">
                  {services.filter(s => s.associationType === 'leg').length}
                </div>
              </div>
            </div>

            {/* Segment mapping */}
            {segmentMapping.size > 0 && (
              <div className="mt-4 pt-3 border-t border-amber-200">
                <div className="text-xs text-amber-700 font-medium mb-2">Segment ID Mapping:</div>
                <div className="flex flex-wrap gap-2">
                  {Array.from(segmentMapping.entries()).map(([segId, info]) => (
                    <span key={segId} className="px-2 py-1 bg-white border border-amber-200 rounded text-xs">
                      <span className="font-mono text-neutral-500">{segId}</span>
                      <span className="mx-1">=</span>
                      <span className="font-medium text-neutral-700">
                        {info.flightNumber ? `${info.carrier}${info.flightNumber} ` : ''}
                        {info.origin}-{info.destination}
                      </span>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Bundle Swap Section */}
      {detectedBundles.length > 0 && (
        <Card className="overflow-hidden border-2 border-indigo-200">
          <button
            type="button"
            onClick={() => setBundleSwapExpanded(!bundleSwapExpanded)}
            className="w-full bg-gradient-to-r from-indigo-500 to-purple-600 px-6 py-4 flex items-center justify-between"
          >
            <div>
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Sparkles className="w-5 h-5" />
                Upgrade Your Bundle
              </h3>
              <p className="text-white/80 text-sm mt-1">
                Change or upgrade your fare bundle{isRoundTrip ? ' for each flight' : ''}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {(selectedOutboundBundleSwap || selectedInboundBundleSwap) && (
                <span className="bg-white/20 text-white px-3 py-1 rounded-full text-sm font-medium">
                  {selectedOutboundBundleSwap && selectedInboundBundleSwap
                    ? '2 upgrades selected'
                    : 'Upgrade selected'}
                </span>
              )}
              {bundleSwapExpanded ? (
                <ChevronUp className="w-5 h-5 text-white" />
              ) : (
                <ChevronDown className="w-5 h-5 text-white" />
              )}
            </div>
          </button>

          {bundleSwapExpanded && (
            <div className="p-6">
              {/* Side-by-side layout for round trip, single column for one-way */}
              <div className={cn(
                "grid gap-6",
                isRoundTrip ? "grid-cols-2" : "grid-cols-1"
              )}>
                {/* OUTBOUND FLIGHT BUNDLES */}
                <div>
                  <div className="flex items-center gap-2 mb-4 pb-2 border-b-2 border-indigo-200">
                    <Plane className="w-5 h-5 text-indigo-600" />
                    <div>
                      <div className="font-bold text-base text-neutral-900">Outbound Flight</div>
                      <div className="text-xs text-neutral-600">{outboundFlightLabel}</div>
                    </div>
                  </div>

                {/* Current Outbound Bundle - prefer ServiceList data if available */}
                {(() => {
                  // Find the current bundle from ServiceList (more accurate inclusions)
                  const currentFromServiceList = outboundBundles.find(b => b.isCurrentBundle);
                  // Fall back to flight store data if ServiceList doesn't have it
                  const displayBundle = currentFromServiceList || (currentOutboundBundle ? {
                    tierName: currentOutboundBundle.bundleName,
                    serviceCode: currentOutboundBundle.bundleCode || '',
                    inclusions: currentOutboundBundle.inclusions,
                  } : null);

                  if (!displayBundle) return null;

                  return (
                    <div className="mb-3">
                      <div className="relative border-2 border-indigo-400 bg-indigo-50 rounded-xl p-4">
                        {/* Current badge - top right */}
                        <div className="absolute top-3 right-3 bg-indigo-500 text-white px-2 py-1 rounded-full text-[10px] font-bold flex items-center gap-1">
                          <Check className="w-3 h-3" />
                          Current
                        </div>

                        <div className="pr-20">
                          <div className="font-bold text-lg text-indigo-900 mb-2">
                            {displayBundle.tierName} {displayBundle.serviceCode && <span className="text-sm font-normal text-indigo-700">({displayBundle.serviceCode})</span>}
                          </div>

                          <div className="bg-white/70 rounded-lg px-2 py-1 mb-3">
                            <div className="text-xs text-indigo-700 flex items-center gap-1">
                              <Sparkles className="w-3 h-3" />
                              Included in fare
                            </div>
                          </div>

                          <BundleKeyInclusions inclusions={displayBundle.inclusions} />
                        </div>
                      </div>
                    </div>
                  );
                })()}

                  {/* Available Outbound Bundles - show ALL (not just upgrades) */}
                  <div className="space-y-3">
                    {outboundBundles
                      .filter(b => !b.isCurrentBundle)
                      .map((bundle) => (
                        <BundleCompactCard
                          key={`outbound-${bundle.serviceCode}`}
                          bundle={bundle}
                          isSelected={selectedOutboundBundleSwap === bundle.serviceId}
                          onSelect={() => setSelectedOutboundBundleSwap(
                            selectedOutboundBundleSwap === bundle.serviceId ? null : bundle.serviceId
                          )}
                          currentTier={currentOutboundBundle?.tier || 0}
                          showDebug={showDebug}
                        />
                      ))}
                    {outboundBundles.filter(b => !b.isCurrentBundle).length === 0 && (
                      <div className="text-center py-4 text-neutral-500 text-xs bg-neutral-50 rounded-lg border border-dashed border-neutral-300">
                        No other bundles available
                      </div>
                    )}
                  </div>
                </div>

                {/* INBOUND FLIGHT BUNDLES (only for round trip) */}
                {isRoundTrip && (
                  <div>
                    <div className="flex items-center gap-2 mb-4 pb-2 border-b-2 border-indigo-200">
                      <Plane className="w-5 h-5 text-indigo-600 rotate-180" />
                      <div>
                        <div className="font-bold text-base text-neutral-900">Return Flight</div>
                        <div className="text-xs text-neutral-600">{inboundFlightLabel}</div>
                      </div>
                    </div>

                  {/* Current Inbound Bundle - prefer ServiceList data if available */}
                  {(() => {
                    // Find the current bundle from ServiceList (more accurate inclusions)
                    const currentFromServiceList = inboundBundles.find(b => b.isCurrentBundle);
                    // Fall back to flight store data if ServiceList doesn't have it
                    const displayBundle = currentFromServiceList || (currentInboundBundle ? {
                      tierName: currentInboundBundle.bundleName,
                      serviceCode: currentInboundBundle.bundleCode || '',
                      inclusions: currentInboundBundle.inclusions,
                    } : null);

                    if (!displayBundle) return null;

                    return (
                      <div className="mb-3">
                        <div className="relative border-2 border-indigo-400 bg-indigo-50 rounded-xl p-4">
                          {/* Current badge - top right */}
                          <div className="absolute top-3 right-3 bg-indigo-500 text-white px-2 py-1 rounded-full text-[10px] font-bold flex items-center gap-1">
                            <Check className="w-3 h-3" />
                            Current
                          </div>

                          <div className="pr-20">
                            <div className="font-bold text-lg text-indigo-900 mb-2">
                              {displayBundle.tierName} {displayBundle.serviceCode && <span className="text-sm font-normal text-indigo-700">({displayBundle.serviceCode})</span>}
                            </div>

                            <div className="bg-white/70 rounded-lg px-2 py-1 mb-3">
                              <div className="text-xs text-indigo-700 flex items-center gap-1">
                                <Sparkles className="w-3 h-3" />
                                Included in fare
                              </div>
                            </div>

                            <BundleKeyInclusions inclusions={displayBundle.inclusions} />
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                    {/* Available Inbound Bundles - show ALL (not just upgrades) */}
                    <div className="space-y-3">
                      {inboundBundles
                        .filter(b => !b.isCurrentBundle)
                        .map((bundle) => (
                          <BundleCompactCard
                            key={`inbound-${bundle.serviceCode}`}
                            bundle={bundle}
                            isSelected={selectedInboundBundleSwap === bundle.serviceId}
                            onSelect={() => setSelectedInboundBundleSwap(
                              selectedInboundBundleSwap === bundle.serviceId ? null : bundle.serviceId
                            )}
                            currentTier={currentInboundBundle?.tier || 0}
                            showDebug={showDebug}
                          />
                        ))}
                      {inboundBundles.filter(b => !b.isCurrentBundle).length === 0 && (
                        <div className="text-center py-4 text-neutral-500 text-xs bg-neutral-50 rounded-lg border border-dashed border-neutral-300">
                          No other bundles available
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Debug: Show all detected bundles */}
              {showDebug && detectedBundles.length > 0 && (
                <div className="mt-4 pt-3 border-t border-neutral-200">
                  <div className="text-xs text-neutral-500 font-medium mb-2">Detected Bundles from ServiceList:</div>
                  <div className="flex flex-wrap gap-2">
                    {detectedBundles.map((bundle, idx) => (
                      <span
                        key={`${bundle.serviceCode}-${bundle.direction}-${idx}`}
                        className={cn(
                          'px-2 py-1 rounded text-xs font-mono',
                          bundle.isCurrentBundle
                            ? 'bg-indigo-100 text-indigo-700 border border-indigo-300'
                            : 'bg-neutral-100 text-neutral-600 border border-neutral-200'
                        )}
                      >
                        {bundle.serviceCode} ({bundle.direction}) T{bundle.tier} - {formatCurrency(bundle.price, bundle.currency)}
                        {bundle.isCurrentBundle && ' [CURRENT]'}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </Card>
      )}

      {/* Baggage */}
      {baggageServices.length > 0 && (
        <CompactServiceSection
          title="Checked Baggage"
          subtitle="Add extra bags for your journey"
          icon={<Luggage className="w-5 h-5" />}
          gradient="from-primary-500 to-primary-600"
          accentColor="primary"
          services={baggageServices}
          passengers={passengers}
          perPaxSelections={perPaxSelections}
          showDebug={showDebug}
          onToggleServiceForPax={toggleServiceForPax}
          onToggleServiceForAllPax={toggleServiceForAllPax}
          getEligiblePassengers={getEligiblePassengers}
          isRoundTrip={isRoundTrip}
          outboundFlightLabel={outboundFlightLabel}
          inboundFlightLabel={inboundFlightLabel}
        />
      )}

      {/* Meals */}
      {mealServices.length > 0 && (
        <CompactServiceSection
          title="In-Flight Meals"
          subtitle="Pre-order your meal and save"
          icon={<Utensils className="w-5 h-5" />}
          gradient="from-orange-500 to-orange-600"
          accentColor="orange"
          services={mealServices}
          passengers={passengers}
          perPaxSelections={perPaxSelections}
          showDebug={showDebug}
          onToggleServiceForPax={toggleServiceForPax}
          onToggleServiceForAllPax={toggleServiceForAllPax}
          getEligiblePassengers={getEligiblePassengers}
          isRoundTrip={isRoundTrip}
          outboundFlightLabel={outboundFlightLabel}
          inboundFlightLabel={inboundFlightLabel}
        />
      )}

      {/* Insurance */}
      {insuranceServices.length > 0 && (
        <CompactServiceSection
          title="Travel Protection"
          subtitle="Travel with peace of mind"
          icon={<ShieldCheck className="w-5 h-5" />}
          gradient="from-green-500 to-green-600"
          accentColor="emerald"
          services={insuranceServices}
          passengers={passengers}
          perPaxSelections={perPaxSelections}
          showDebug={showDebug}
          onToggleServiceForPax={toggleServiceForPax}
          onToggleServiceForAllPax={toggleServiceForAllPax}
          getEligiblePassengers={getEligiblePassengers}
          isRoundTrip={isRoundTrip}
          outboundFlightLabel={outboundFlightLabel}
          inboundFlightLabel={inboundFlightLabel}
        />
      )}

      {/* SSR / Special Assistance - Compact layout with per-passenger selection */}
      {ssrServices.length > 0 && (
        <CompactServiceSection
          title="Special Services (SSR)"
          subtitle="Request special assistance for your journey"
          icon={<Users className="w-5 h-5" />}
          gradient="from-purple-500 to-purple-600"
          accentColor="purple"
          services={ssrServices}
          passengers={passengers}
          perPaxSelections={perPaxSelections}
          showDebug={showDebug}
          onToggleServiceForPax={toggleServiceForPax}
          onToggleServiceForAllPax={toggleServiceForAllPax}
          getEligiblePassengers={getEligiblePassengers}
          isRoundTrip={isRoundTrip}
          outboundFlightLabel={outboundFlightLabel}
          inboundFlightLabel={inboundFlightLabel}
        />
      )}

      {/* Flexibility Options */}
      {flexibilityServices.length > 0 && (
        <CompactServiceSection
          title="Flexibility Options"
          subtitle="Add flexibility to change or cancel"
          icon={<RefreshCw className="w-5 h-5" />}
          gradient="from-cyan-500 to-cyan-600"
          accentColor="cyan"
          services={flexibilityServices}
          passengers={passengers}
          perPaxSelections={perPaxSelections}
          showDebug={showDebug}
          onToggleServiceForPax={toggleServiceForPax}
          onToggleServiceForAllPax={toggleServiceForAllPax}
          getEligiblePassengers={getEligiblePassengers}
          isRoundTrip={isRoundTrip}
          outboundFlightLabel={outboundFlightLabel}
          inboundFlightLabel={inboundFlightLabel}
        />
      )}

      {/* Other Services */}
      {otherServices.length > 0 && (
        <CompactServiceSection
          title="Other Extras"
          subtitle="Additional services"
          icon={<Package className="w-5 h-5" />}
          gradient="from-neutral-600 to-neutral-700"
          accentColor="slate"
          services={otherServices}
          passengers={passengers}
          perPaxSelections={perPaxSelections}
          showDebug={showDebug}
          onToggleServiceForPax={toggleServiceForPax}
          onToggleServiceForAllPax={toggleServiceForAllPax}
          getEligiblePassengers={getEligiblePassengers}
          isRoundTrip={isRoundTrip}
          outboundFlightLabel={outboundFlightLabel}
          inboundFlightLabel={inboundFlightLabel}
        />
      )}

      {/* No Services Available */}
      {services.length === 0 && detectedBundles.length === 0 && !error && (
        <Card className="p-8 text-center">
          <Package className="w-12 h-12 text-neutral-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-neutral-700 mb-2">No extras available</h3>
          <p className="text-neutral-500">There are no additional services available for this flight.</p>
        </Card>
      )}

      {/* Selection Summary */}
      {selectedCount > 0 && (
        <div className="bg-white border border-neutral-200 rounded-lg p-4 mt-8">
          <div className="flex items-center justify-between">
            <p className="text-sm text-neutral-500">
              {selectedCount} item{selectedCount > 1 ? 's' : ''} selected
            </p>
            <p className="text-xl font-bold text-primary-600">
              +{formatCurrency(servicesTotal, 'AUD')}
            </p>
          </div>
        </div>
      )}

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
            <div className="flex items-center gap-3">
              {selectedCount > 0 && (
                <span className="text-sm text-slate-500">
                  +{formatCurrency(servicesTotal, 'AUD')}
                </span>
              )}
              <button
                onClick={handleContinue}
                className="flex items-center gap-2 px-6 py-2.5 bg-orange-500 hover:bg-orange-600 text-white font-semibold rounded-xl"
              >
                {selectedCount > 0 ? 'Continue' : 'Skip Extras'}
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Service Section Component
interface ServiceSectionProps {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  gradient: string;
  services: Service[];
  passengers: PassengerInfo[];
  perPaxSelections: PerPaxSelections;
  expandedServices: Set<string>;
  showDebug: boolean;
  onToggleServiceForPax: (serviceId: string, paxId: string) => void;
  onToggleServiceForAllPax: (serviceId: string) => void;
  onToggleExpand: (serviceId: string) => void;
  getEligiblePassengers: (service: Service) => PassengerInfo[];
  getFlightLabel: (segmentId: string) => string;
  getLegLabel: (legRef: string) => string;
  isRoundTrip?: boolean;
  outboundFlightLabel?: string;
  inboundFlightLabel?: string;
}

function ServiceSection({
  title,
  subtitle,
  icon,
  gradient,
  services,
  passengers,
  perPaxSelections,
  expandedServices,
  showDebug,
  onToggleServiceForPax,
  onToggleServiceForAllPax,
  onToggleExpand,
  getEligiblePassengers,
  getFlightLabel,
  getLegLabel,
  isRoundTrip = false,
  outboundFlightLabel = 'Outbound',
  inboundFlightLabel = 'Return',
}: ServiceSectionProps) {
  // Group services by direction for round trips
  const outboundServices = services.filter(s => s.direction === 'outbound');
  const inboundServices = services.filter(s => s.direction === 'inbound');
  const bothServices = services.filter(s => s.direction === 'both');

  // For round trips, show grouped; otherwise show flat list
  const showGrouped = isRoundTrip && (outboundServices.length > 0 || inboundServices.length > 0);

  const renderServiceCard = (service: Service) => (
    <ServiceCard
      key={service.serviceId}
      service={service}
      passengers={passengers}
      selectedPaxIds={perPaxSelections.get(service.serviceId) || new Set()}
      isExpanded={expandedServices.has(service.serviceId)}
      showDebug={showDebug}
      onToggleForPax={(paxId) => onToggleServiceForPax(service.serviceId, paxId)}
      onToggleForAll={() => onToggleServiceForAllPax(service.serviceId)}
      onToggleExpand={() => onToggleExpand(service.serviceId)}
      eligiblePassengers={getEligiblePassengers(service)}
      getFlightLabel={getFlightLabel}
      getLegLabel={getLegLabel}
    />
  );

  return (
    <Card className="overflow-hidden">
      <div className={cn('bg-gradient-to-r px-6 py-4', gradient)}>
        <h3 className="text-lg font-bold text-white flex items-center gap-2">
          {icon}
          {title}
        </h3>
        <p className="text-white/80 text-sm mt-1">{subtitle}</p>
      </div>
      <div className="p-4 space-y-3">
        {showGrouped ? (
          <>
            {/* Outbound services */}
            {outboundServices.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-blue-700 bg-blue-50 px-3 py-2 rounded-lg border border-blue-200">
                  <Plane className="w-4 h-4" />
                  <span>→ Outbound: {outboundFlightLabel}</span>
                  <span className="ml-auto text-xs text-blue-500 font-normal">{outboundServices.length} option{outboundServices.length !== 1 ? 's' : ''}</span>
                </div>
                {outboundServices.map(renderServiceCard)}
              </div>
            )}

            {/* Inbound services */}
            {inboundServices.length > 0 && (
              <div className="space-y-3 mt-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-purple-700 bg-purple-50 px-3 py-2 rounded-lg border border-purple-200">
                  <Plane className="w-4 h-4 rotate-180" />
                  <span>← Return: {inboundFlightLabel}</span>
                  <span className="ml-auto text-xs text-purple-500 font-normal">{inboundServices.length} option{inboundServices.length !== 1 ? 's' : ''}</span>
                </div>
                {inboundServices.map(renderServiceCard)}
              </div>
            )}

            {/* Both/All flights services - services that apply to the entire journey */}
            {bothServices.length > 0 && (
              <div className="space-y-3 mt-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-green-700 bg-green-50 px-3 py-2 rounded-lg border border-green-200">
                  <Plane className="w-4 h-4" />
                  <span>↔ Both Flights</span>
                  <span className="ml-auto text-xs text-green-500 font-normal">{bothServices.length} option{bothServices.length !== 1 ? 's' : ''}</span>
                </div>
                {bothServices.map(renderServiceCard)}
              </div>
            )}
          </>
        ) : (
          // Flat list for one-way trips
          services.map(renderServiceCard)
        )}
      </div>
    </Card>
  );
}

// Service Card Component with per-passenger selection
interface ServiceCardProps {
  service: Service;
  passengers: PassengerInfo[];
  selectedPaxIds: Set<string>;
  isExpanded: boolean;
  showDebug: boolean;
  onToggleForPax: (paxId: string) => void;
  onToggleForAll: () => void;
  onToggleExpand: () => void;
  eligiblePassengers: PassengerInfo[];
  getFlightLabel: (segmentId: string) => string;
  getLegLabel: (legRef: string) => string;
}

function ServiceCard({
  service,
  selectedPaxIds,
  isExpanded,
  showDebug,
  onToggleForPax,
  onToggleForAll,
  onToggleExpand,
  eligiblePassengers,
  getFlightLabel,
  getLegLabel,
}: ServiceCardProps) {
  const hasSelections = selectedPaxIds.size > 0;
  const allSelected = eligiblePassengers.length > 0 &&
    eligiblePassengers.every(p => selectedPaxIds.has(p.paxId));

  // Get friendly flight scope - simplified since direction badge already shows outbound/inbound/both
  const getFlightScope = (): string => {
    // Direction already tells us which flight(s), so keep scope simple
    switch (service.direction) {
      case 'outbound':
        return 'Outbound flight';
      case 'inbound':
        return 'Return flight';
      case 'both':
        return 'Both flights';
      default:
        return 'All flights';
    }
  };

  // Direction badge - shows which flight this service applies to
  const getDirectionBadge = () => {
    switch (service.direction) {
      case 'outbound':
        return { label: 'Outbound', icon: '→', color: 'bg-blue-100 text-blue-700 border-blue-200' };
      case 'inbound':
        return { label: 'Return', icon: '←', color: 'bg-purple-100 text-purple-700 border-purple-200' };
      case 'both':
        return { label: 'Both Flights', icon: '↔', color: 'bg-green-100 text-green-700 border-green-200' };
      default:
        return { label: 'Both Flights', icon: '↔', color: 'bg-green-100 text-green-700 border-green-200' };
    }
  };

  // Association badge
  const getAssociationBadge = () => {
    switch (service.associationType) {
      case 'segment':
        return { label: 'Per Segment', color: 'bg-blue-50 text-blue-600' };
      case 'journey':
        return { label: 'Per Journey', color: 'bg-green-50 text-green-600' };
      case 'leg':
        return { label: 'Per Leg', color: 'bg-amber-50 text-amber-600' };
      default:
        return { label: 'Unknown', color: 'bg-neutral-100 text-neutral-600' };
    }
  };

  const directionBadge = getDirectionBadge();
  const associationBadge = getAssociationBadge();

  return (
    <div className={cn(
      'border-2 rounded-xl transition-all',
      hasSelections ? 'border-primary-500 bg-primary-50/50' : 'border-neutral-200 bg-white',
    )}>
      {/* Main service row - click to expand/collapse */}
      <button
        type="button"
        onClick={onToggleExpand}
        className="w-full flex items-center justify-between p-4 text-left hover:bg-neutral-50/50 transition-colors"
      >
        <div className="flex items-center gap-4 flex-1 min-w-0">
          {/* Selection summary indicator */}
          <div className={cn(
            'w-8 h-8 rounded-full border-2 flex items-center justify-center flex-shrink-0 text-sm font-bold',
            hasSelections
              ? 'border-primary-500 bg-primary-500 text-white'
              : 'border-neutral-300 bg-white text-neutral-400'
          )}>
            {hasSelections ? selectedPaxIds.size : ''}
          </div>

          {/* Service info */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-neutral-900">{service.serviceName}</span>
              {service.weight && (
                <span className="text-xs bg-neutral-100 text-neutral-600 px-2 py-0.5 rounded-full">
                  {service.weight}
                </span>
              )}
              {/* Direction badge - prominently shows which flight */}
              <span className={cn('text-xs px-2 py-0.5 rounded-full border font-medium', directionBadge.color)}>
                {directionBadge.icon} {directionBadge.label}
              </span>
              {/* SSR Code badge - only show for actual SSR services (RFIC = 'P') */}
              {service.rfic === 'P' && (
                <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-mono">
                  SSR{service.rfisc && service.rfisc !== '000' ? `: ${service.rfisc}` : ''}
                </span>
              )}
            </div>

            {/* Flight scope - now with friendly labels + association type badge */}
            <div className="flex items-center gap-1 mt-1 text-xs text-neutral-500">
              <Plane className="w-3 h-3" />
              <span>{getFlightScope()}</span>
              {/* Association type badge - always visible so users know if it's per-segment/leg/journey */}
              <span className={cn('ml-2 px-1.5 py-0.5 rounded text-xs', associationBadge.color)}>
                {associationBadge.label}
              </span>
            </div>

            {/* Service code always visible */}
            <div className="text-xs text-neutral-400 mt-1 font-mono">
              Code: {service.serviceCode}
            </div>
          </div>
        </div>

        {/* Price and expand indicator */}
        <div className="flex items-center gap-3 flex-shrink-0 ml-4">
          <div className="text-right">
            <span className={cn(
              'text-lg font-bold',
              hasSelections ? 'text-primary-600' : 'text-neutral-900'
            )}>
              {formatCurrency(service.price, service.currency)}
            </span>
            <p className="text-xs text-neutral-400">per person</p>
          </div>
          {isExpanded ? (
            <ChevronUp className="w-5 h-5 text-neutral-400" />
          ) : (
            <ChevronDown className="w-5 h-5 text-neutral-400" />
          )}
        </div>
      </button>

      {/* Expanded passenger selection */}
      {isExpanded && (
        <div className="border-t border-neutral-200 p-4 bg-white rounded-b-xl">
          {/* Quick select all */}
          {eligiblePassengers.length > 1 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleForAll();
              }}
              className={cn(
                'w-full flex items-center justify-between p-3 rounded-lg border mb-3 transition-all',
                allSelected
                  ? 'border-primary-500 bg-primary-50'
                  : 'border-neutral-200 hover:border-neutral-300'
              )}
            >
              <div className="flex items-center gap-3">
                <div className={cn(
                  'w-5 h-5 rounded border-2 flex items-center justify-center',
                  allSelected ? 'border-primary-500 bg-primary-500' : 'border-neutral-300'
                )}>
                  {allSelected && <Check className="w-3 h-3 text-white" />}
                </div>
                <span className="font-medium text-neutral-700">
                  Select for all passengers
                </span>
              </div>
              <span className="text-sm text-neutral-500">
                {formatCurrency(service.price * eligiblePassengers.length, service.currency)}
              </span>
            </button>
          )}

          {/* Individual passenger selection */}
          <div className="space-y-2">
            {eligiblePassengers.map((pax) => {
              const isSelected = selectedPaxIds.has(pax.paxId);
              return (
                <button
                  type="button"
                  key={pax.paxId}
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleForPax(pax.paxId);
                  }}
                  className={cn(
                    'w-full flex items-center justify-between p-3 rounded-lg border transition-all',
                    isSelected
                      ? 'border-primary-500 bg-primary-50'
                      : 'border-neutral-200 hover:border-neutral-300'
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      'w-5 h-5 rounded border-2 flex items-center justify-center',
                      isSelected ? 'border-primary-500 bg-primary-500' : 'border-neutral-300'
                    )}>
                      {isSelected && <Check className="w-3 h-3 text-white" />}
                    </div>
                    <UserCircle className="w-5 h-5 text-neutral-400" />
                    <span className="font-medium text-neutral-700">{pax.displayLabel}</span>
                    <span className="text-xs text-neutral-400 font-mono">({pax.paxId})</span>
                  </div>
                  <span className="text-sm font-medium text-neutral-600">
                    {formatCurrency(service.price, service.currency)}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Debug info */}
          {showDebug && (
            <div className="mt-4 pt-3 border-t border-neutral-200 text-xs font-mono bg-neutral-50 -mx-4 -mb-4 p-4 rounded-b-xl">
              <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                <div><span className="text-neutral-500">OfferItemID:</span> <span className="text-neutral-700">{service.offerItemId}</span></div>
                <div><span className="text-neutral-500">ServiceCode:</span> <span className="text-neutral-700">{service.serviceCode}</span></div>
                <div><span className="text-neutral-500">OfferId:</span> <span className="text-neutral-700">{service.offerId}</span></div>
                <div><span className="text-neutral-500">AssocType:</span> <span className="text-neutral-700">{service.associationType}</span></div>
                <div><span className="text-neutral-500">Direction:</span> <span className="text-neutral-700 font-bold">{service.direction}</span></div>
                {service.rfic && <div><span className="text-neutral-500">RFIC:</span> <span className="text-neutral-700">{service.rfic}</span></div>}
                {service.rfisc && <div><span className="text-neutral-500">RFISC:</span> <span className="text-neutral-700">{service.rfisc}</span></div>}
                {service.segmentRefs && service.segmentRefs.length > 0 && (
                  <div className="col-span-2">
                    <span className="text-neutral-500">SegmentRefs:</span>{' '}
                    <span className="text-neutral-700">{service.segmentRefs.join(', ')}</span>
                  </div>
                )}
                {service.journeyRefs && service.journeyRefs.length > 0 && (
                  <div className="col-span-2">
                    <span className="text-neutral-500">JourneyRefs:</span>{' '}
                    <span className="text-neutral-700">{service.journeyRefs.join(', ')}</span>
                  </div>
                )}
                {service.legRefs && service.legRefs.length > 0 && (
                  <div className="col-span-2">
                    <span className="text-neutral-500">LegRefs:</span>{' '}
                    <span className="text-neutral-700">{service.legRefs.join(', ')}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Compact Bundle Card Component for side-by-side layout
interface BundleCompactCardProps {
  bundle: DetectedBundle;
  isSelected: boolean;
  onSelect: () => void;
  currentTier: number;
  showDebug: boolean;
}

function BundleCompactCard({ bundle, isSelected, onSelect, currentTier, showDebug }: BundleCompactCardProps) {
  const tierDiff = bundle.tier - currentTier;
  const isUpgrade = tierDiff > 0;
  const isDowngrade = tierDiff < 0;

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'w-full rounded-xl p-4 text-left transition-all duration-200 relative',
        'border-2 hover:shadow-md',
        isSelected
          ? 'border-purple-500 bg-purple-50 shadow-md'
          : 'border-neutral-200 hover:border-purple-300 bg-white'
      )}
    >
      {/* Selection indicator - top right */}
      <div className={cn(
        'absolute top-3 right-3 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all',
        isSelected
          ? 'border-purple-500 bg-purple-500'
          : 'border-neutral-300'
      )}>
        {isSelected && <Check className="w-3 h-3 text-white" />}
      </div>

      {/* Bundle name and badge */}
      <div className="flex items-start gap-2 mb-3 pr-8">
        <div className="flex-1">
          <div className="font-bold text-lg text-neutral-900 mb-1">
            {bundle.tierName} {bundle.serviceCode && <span className="text-sm font-normal text-neutral-600">({bundle.serviceCode})</span>}
          </div>
        </div>
      </div>

      {/* Price */}
      <div className={cn(
        'mb-3 px-3 py-2 rounded-lg',
        isSelected ? 'bg-purple-100' : 'bg-neutral-50'
      )}>
        <div className="flex items-baseline gap-1">
          <div className={cn(
            'text-xl font-bold',
            isSelected ? 'text-purple-600' : 'text-neutral-900'
          )}>
            +{formatCurrency(bundle.price, bundle.currency)}
          </div>
          <span className="text-xs text-neutral-500">per person</span>
        </div>
      </div>

      {/* Key inclusions - compact version */}
      <div className="space-y-1.5">
        <BundleKeyInclusions inclusions={bundle.inclusions} />
      </div>
    </button>
  );
}

// Original Bundle Upgrade Card Component (kept for backwards compatibility)
interface BundleUpgradeCardProps {
  bundle: DetectedBundle;
  isSelected: boolean;
  onSelect: () => void;
  currentTier: number;
  showDebug: boolean;
}

function BundleUpgradeCard({ bundle, isSelected, onSelect, currentTier, showDebug }: BundleUpgradeCardProps) {
  const tierDiff = bundle.tier - currentTier;
  const isUpgrade = tierDiff > 0;
  const isDowngrade = tierDiff < 0;

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'w-full rounded-2xl p-5 text-left transition-all duration-200 relative overflow-hidden',
        'border-3 shadow-sm hover:shadow-lg',
        isSelected
          ? 'border-purple-500 bg-gradient-to-br from-purple-50 to-indigo-50 shadow-purple-200'
          : 'border-neutral-200 hover:border-purple-300 bg-white hover:bg-purple-50/30'
      )}
    >
      {/* Selection checkmark badge - top right corner */}
      {isSelected && (
        <div className="absolute top-3 right-3 bg-purple-500 rounded-full p-1.5 shadow-lg">
          <Check className="w-4 h-4 text-white" />
        </div>
      )}

      {/* Bundle header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1 pr-12">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="font-bold text-2xl text-neutral-900">
              {bundle.tierName} {bundle.serviceCode && <span className="text-base font-normal text-neutral-600">({bundle.serviceCode})</span>}
            </span>
          </div>

          {/* Tier indicator badge */}
        </div>
      </div>

      {/* Price - prominent display */}
      <div className={cn(
        'mb-4 p-3 rounded-xl',
        isSelected ? 'bg-purple-100/50' : 'bg-neutral-50'
      )}>
        <div className="flex items-baseline gap-2">
          <span className="text-xs text-neutral-500 uppercase tracking-wide">Additional cost</span>
          <div className={cn(
            'text-3xl font-bold',
            isSelected ? 'text-purple-600' : 'text-neutral-900'
          )}>
            +{formatCurrency(bundle.price, bundle.currency)}
          </div>
          <span className="text-sm text-neutral-500">per person</span>
        </div>
      </div>

      {/* Bundle inclusions - enhanced display */}
      <div className="space-y-2">
        <span className="text-xs font-semibold text-neutral-600 uppercase tracking-wider">What's included</span>
        <BundleInclusionsList inclusions={bundle.inclusions} compact={false} enhanced />
      </div>

      {/* Selection action */}
      <div className={cn(
        'mt-5 pt-4 border-t flex items-center justify-center gap-2 font-medium',
        isSelected ? 'border-purple-200' : 'border-neutral-200'
      )}>
        {isSelected ? (
          <>
            <Check className="w-5 h-5 text-purple-600" />
            <span className="text-purple-700">Selected</span>
          </>
        ) : (
          <>
            <span className="text-neutral-600">Click to select</span>
          </>
        )}
      </div>
    </button>
  );
}

// Bundle Key Inclusions - Ultra compact for side-by-side view
interface BundleKeyInclusionsProps {
  inclusions: BundleOption['inclusions'];
}

function BundleKeyInclusions({ inclusions }: BundleKeyInclusionsProps) {
  // Only show items that are actually available - don't show "No X" for missing items
  const keyItems = [
    inclusions.baggage ? { icon: Briefcase, text: inclusions.baggage, available: true } : null,
    inclusions.meals ? { icon: Coffee, text: 'Meals', available: true } : null,
    inclusions.seatSelection ? { icon: Armchair, text: 'Seat selection', available: true } : null,
  ].filter(Boolean) as { icon: any; text: string; available: boolean }[];

  return (
    <div className="space-y-1">
      {keyItems.map((item, idx) => (
        <div key={idx} className="flex items-center gap-2 text-xs">
          <div className={cn(
            'flex-shrink-0 w-4 h-4 rounded-full flex items-center justify-center',
            item.available ? 'bg-emerald-500' : 'bg-neutral-300'
          )}>
            {item.available ? (
              <Check className="w-2.5 h-2.5 text-white" />
            ) : (
              <X className="w-2.5 h-2.5 text-white" />
            )}
          </div>
          <span className={cn(
            'text-xs',
            item.available ? 'text-neutral-700' : 'text-neutral-400'
          )}>
            {item.text}
          </span>
        </div>
      ))}
      {/* Bundle inclusion codes (OOCP, MORE, FLEX, CCSH etc.) - resolved from ServiceBundle refs */}
      {inclusions.otherInclusions && inclusions.otherInclusions.length > 0 && (
        inclusions.otherInclusions.map((other: { code: string; name: string } | string, idx: number) => {
          const code = typeof other === 'string' ? other : other.code;
          const name = typeof other === 'string' ? '' : other.name;
          const displayText = name ? `${name} (${code})` : code;
          return (
            <div key={`other-${idx}`} className="flex items-center gap-2 text-xs">
              <div className="flex-shrink-0 w-4 h-4 rounded-full flex items-center justify-center bg-indigo-500">
                <Check className="w-2.5 h-2.5 text-white" />
              </div>
              <span className="text-xs text-neutral-700">{displayText}</span>
            </div>
          );
        })
      )}
    </div>
  );
}

// ============================================================================
// COMPACT SERVICE SECTION - Generic per-passenger selection layout for all service types
// ============================================================================

interface CompactServiceSectionProps {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  gradient: string;
  accentColor: string; // e.g., "purple", "orange", "emerald", "blue", "amber", "rose"
  services: Service[];
  passengers: PassengerInfo[];
  perPaxSelections: PerPaxSelections;
  showDebug: boolean;
  onToggleServiceForPax: (serviceId: string, paxId: string) => void;
  onToggleServiceForAllPax: (serviceId: string) => void;
  getEligiblePassengers: (service: Service) => PassengerInfo[];
  isRoundTrip?: boolean;
  outboundFlightLabel?: string;
  inboundFlightLabel?: string;
}

function CompactServiceSection({
  title,
  subtitle,
  icon,
  gradient,
  accentColor,
  services,
  passengers,
  perPaxSelections,
  showDebug,
  onToggleServiceForPax,
  onToggleServiceForAllPax,
  getEligiblePassengers,
  isRoundTrip = false,
  outboundFlightLabel = 'Outbound',
  inboundFlightLabel = 'Return',
}: CompactServiceSectionProps) {
  // Group services by direction for round trips
  const outboundServicesRaw = services.filter(s => s.direction === 'outbound');
  const inboundServicesRaw = services.filter(s => s.direction === 'inbound');
  const bothServices = services.filter(s => s.direction === 'both');

  // Smart sorting: Show services available on BOTH flights first (alphabetically),
  // then unique services for each direction
  const outboundCodes = new Set(outboundServicesRaw.map(s => s.serviceCode));
  const inboundCodes = new Set(inboundServicesRaw.map(s => s.serviceCode));

  // Find common service codes (available on both flights)
  const commonCodes = new Set(
    Array.from(outboundCodes).filter(code => inboundCodes.has(code))
  );

  // Sort services: common first (alphabetically), then unique (alphabetically)
  const sortByName = (a: Service, b: Service) =>
    (a.serviceName || a.serviceCode || '').localeCompare(b.serviceName || b.serviceCode || '');

  const outboundCommon = outboundServicesRaw
    .filter(s => commonCodes.has(s.serviceCode))
    .sort(sortByName);
  const outboundUnique = outboundServicesRaw
    .filter(s => !commonCodes.has(s.serviceCode))
    .sort(sortByName);
  const outboundServices = [...outboundCommon, ...outboundUnique];

  const inboundCommon = inboundServicesRaw
    .filter(s => commonCodes.has(s.serviceCode))
    .sort(sortByName);
  const inboundUnique = inboundServicesRaw
    .filter(s => !commonCodes.has(s.serviceCode))
    .sort(sortByName);
  const inboundServices = [...inboundCommon, ...inboundUnique];

  // For round trips, show grouped; otherwise show flat list
  const showGrouped = isRoundTrip && (outboundServices.length > 0 || inboundServices.length > 0);

  // Color mapping for Tailwind classes (must be complete strings for Tailwind to detect)
  const colorClasses = {
    primary: {
      hoverBorder: 'hover:border-primary-300',
      badgeBg: 'bg-primary-100',
      badgeText: 'text-primary-700',
      priceText: 'text-primary-600',
      selectedBg: 'bg-primary-500',
      selectedBorder: 'border-primary-500',
      countText: 'text-primary-600',
      dividerBorder: 'border-primary-200',
      iconColor: 'text-primary-600',
    },
    orange: {
      hoverBorder: 'hover:border-orange-300',
      badgeBg: 'bg-orange-100',
      badgeText: 'text-orange-700',
      priceText: 'text-orange-600',
      selectedBg: 'bg-orange-500',
      selectedBorder: 'border-orange-500',
      countText: 'text-orange-600',
      dividerBorder: 'border-orange-200',
      iconColor: 'text-orange-600',
    },
    emerald: {
      hoverBorder: 'hover:border-emerald-300',
      badgeBg: 'bg-emerald-100',
      badgeText: 'text-emerald-700',
      priceText: 'text-emerald-600',
      selectedBg: 'bg-emerald-500',
      selectedBorder: 'border-emerald-500',
      countText: 'text-emerald-600',
      dividerBorder: 'border-emerald-200',
      iconColor: 'text-emerald-600',
    },
    purple: {
      hoverBorder: 'hover:border-purple-300',
      badgeBg: 'bg-purple-100',
      badgeText: 'text-purple-700',
      priceText: 'text-purple-600',
      selectedBg: 'bg-purple-500',
      selectedBorder: 'border-purple-500',
      countText: 'text-purple-600',
      dividerBorder: 'border-purple-200',
      iconColor: 'text-purple-600',
    },
    cyan: {
      hoverBorder: 'hover:border-cyan-300',
      badgeBg: 'bg-cyan-100',
      badgeText: 'text-cyan-700',
      priceText: 'text-cyan-600',
      selectedBg: 'bg-cyan-500',
      selectedBorder: 'border-cyan-500',
      countText: 'text-cyan-600',
      dividerBorder: 'border-cyan-200',
      iconColor: 'text-cyan-600',
    },
    slate: {
      hoverBorder: 'hover:border-slate-300',
      badgeBg: 'bg-slate-100',
      badgeText: 'text-slate-700',
      priceText: 'text-slate-600',
      selectedBg: 'bg-slate-500',
      selectedBorder: 'border-slate-500',
      countText: 'text-slate-600',
      dividerBorder: 'border-slate-200',
      iconColor: 'text-slate-600',
    },
  };

  const colors = colorClasses[accentColor as keyof typeof colorClasses] || colorClasses.purple;

  // State for toggling API debug info visibility
  const [showApiDebug, setShowApiDebug] = useState(false);

  // Get service type icon
  const getServiceIcon = (service: Service) => {
    const code = service.serviceCode?.toUpperCase() || '';
    const name = service.serviceName?.toLowerCase() || '';

    // Baggage
    if (service.serviceType === 'baggage' || code.includes('BAG') || name.includes('bag') || name.includes('luggage')) {
      return <Luggage className="w-5 h-5" />;
    }
    // Meals
    if (service.serviceType === 'meal' || code.includes('MEAL') || name.includes('meal') || name.includes('food')) {
      return <Utensils className="w-5 h-5" />;
    }
    // Seats
    if (code.includes('SEAT') || code.includes('STST') || name.includes('seat')) {
      return <Armchair className="w-5 h-5" />;
    }
    // Insurance/Protection
    if (service.serviceType === 'insurance' || name.includes('insurance') || name.includes('protect')) {
      return <ShieldCheck className="w-5 h-5" />;
    }
    // Flexibility
    if (service.serviceType === 'flexibility' || name.includes('flex') || name.includes('change')) {
      return <RefreshCw className="w-5 h-5" />;
    }
    // Priority/Upgrade
    if (name.includes('priority') || name.includes('upgrade') || name.includes('lounge')) {
      return <ArrowUpCircle className="w-5 h-5" />;
    }
    // Default
    return <Package className="w-5 h-5" />;
  };

  // Get association type styling with icon
  const getAssociationStyle = (type: Service['associationType']) => {
    switch (type) {
      case 'segment':
        return { bg: 'bg-gradient-to-r from-blue-500 to-blue-600', text: 'text-white', label: 'SEGMENT', icon: '✈' };
      case 'journey':
        return { bg: 'bg-gradient-to-r from-purple-500 to-purple-600', text: 'text-white', label: 'JOURNEY', icon: '🛫' };
      case 'leg':
        return { bg: 'bg-gradient-to-r from-amber-500 to-amber-600', text: 'text-white', label: 'LEG', icon: '📍' };
      default:
        return { bg: 'bg-gradient-to-r from-gray-400 to-gray-500', text: 'text-white', label: 'N/A', icon: '?' };
    }
  };

  const renderServiceCard = (service: Service) => {
    const eligiblePax = getEligiblePassengers(service);
    const selectedPaxIds = perPaxSelections.get(service.serviceId) || new Set();
    const allEligibleSelected = eligiblePax.length > 0 && eligiblePax.every(p => selectedPaxIds.has(p.paxId));
    const isSelected = selectedPaxIds.size > 0;
    const assocStyle = getAssociationStyle(service.associationType);

    return (
      <div
        key={service.serviceId}
        className={cn(
          "group relative rounded-xl overflow-hidden transition-all duration-300",
          "border-2 bg-white",
          isSelected
            ? cn("border-2 shadow-lg", colors.selectedBorder, "ring-2 ring-offset-2", `ring-${accentColor}-200`)
            : "border-neutral-200 hover:border-neutral-300 hover:shadow-md"
        )}
      >
        {/* Selected indicator ribbon */}
        {isSelected && (
          <div className={cn(
            "absolute top-0 right-0 w-20 h-20 overflow-hidden"
          )}>
            <div className={cn(
              "absolute top-3 -right-8 w-32 text-center text-xs font-bold py-1 rotate-45 shadow-sm",
              colors.selectedBg, "text-white"
            )}>
              SELECTED
            </div>
          </div>
        )}

        {/* Main card content */}
        <div className="p-4">
          {/* Service header with icon */}
          <div className="flex items-start gap-3 mb-4">
            {/* Service type icon */}
            <div className={cn(
              "flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center shadow-sm",
              "bg-gradient-to-br from-neutral-50 to-neutral-100 border border-neutral-200",
              isSelected && cn("from-white to-neutral-50", colors.selectedBorder)
            )}>
              <span className={cn(
                isSelected ? colors.priceText : "text-neutral-500",
                "transition-colors"
              )}>
                {getServiceIcon(service)}
              </span>
            </div>

            {/* Service info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h4 className="font-semibold text-neutral-900 text-base leading-tight truncate">
                    {service.serviceName || service.serviceCode || 'Service'}
                  </h4>
                  {service.description && (
                    <p className="text-sm text-neutral-500 mt-0.5 line-clamp-2">{service.description}</p>
                  )}
                </div>

                {/* Price badge */}
                <div className={cn(
                  "flex-shrink-0 text-right px-3 py-1.5 rounded-lg",
                  service.price === 0
                    ? "bg-gradient-to-r from-emerald-50 to-emerald-100 border border-emerald-200"
                    : cn("bg-gradient-to-r from-neutral-50 to-neutral-100 border border-neutral-200")
                )}>
                  <div className={cn(
                    "text-lg font-bold",
                    service.price === 0 ? "text-emerald-600" : colors.priceText
                  )}>
                    {service.price === 0 ? 'FREE' : `+${formatCurrency(service.price, service.currency)}`}
                  </div>
                  <div className="text-[10px] text-neutral-500 uppercase tracking-wide">per person</div>
                </div>
              </div>

              {/* Code badges row */}
              <div className="flex flex-wrap items-center gap-1.5 mt-2">
                {service.serviceCode && (
                  <span className={cn(
                    "inline-flex items-center text-xs font-mono px-2 py-0.5 rounded-full",
                    colors.badgeBg, colors.badgeText
                  )}>
                    {service.serviceCode}
                  </span>
                )}
                {/* Association type badge - modern pill style */}
                {service.associationType && (
                  <span className={cn(
                    "inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider",
                    assocStyle.bg, assocStyle.text
                  )}>
                    <span>{assocStyle.icon}</span>
                    {assocStyle.label}
                  </span>
                )}
                {/* Weight badge for baggage */}
                {service.weight && (
                  <span className="inline-flex items-center text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                    {service.weight}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* API Debug Panel - Collapsible for technical users */}
          {showDebug && (
            <div className="mb-3">
              <button
                type="button"
                onClick={() => setShowApiDebug(!showApiDebug)}
                className="flex items-center gap-1.5 text-[10px] font-medium text-neutral-400 hover:text-neutral-600 transition-colors"
              >
                <Bug className="w-3 h-3" />
                <span>API Details</span>
                {showApiDebug ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>
              {showApiDebug && (
                <div className="mt-2 p-2 rounded-lg bg-neutral-50 border border-neutral-200 font-mono text-[10px] text-neutral-600 space-y-1">
                  <div className="flex gap-4">
                    <span className="text-neutral-400">offerId:</span>
                    <span className="text-neutral-700">{service.offerId || 'N/A'}</span>
                  </div>
                  <div className="flex gap-4">
                    <span className="text-neutral-400">offerItemId:</span>
                    <span className="text-neutral-700">{service.offerItemId || 'N/A'}</span>
                  </div>
                  {service.segmentRefs && service.segmentRefs.length > 0 && (
                    <div className="flex gap-4">
                      <span className="text-blue-500">Segments:</span>
                      <span className="text-neutral-700">{service.segmentRefs.join(', ')}</span>
                    </div>
                  )}
                  {service.journeyRefs && service.journeyRefs.length > 0 && (
                    <div className="flex gap-4">
                      <span className="text-purple-500">Journeys:</span>
                      <span className="text-neutral-700">{service.journeyRefs.join(', ')}</span>
                    </div>
                  )}
                  {service.legRefs && service.legRefs.length > 0 && (
                    <div className="flex gap-4">
                      <span className="text-amber-500">Legs:</span>
                      <span className="text-neutral-700">{service.legRefs.join(', ')}</span>
                    </div>
                  )}
                  {service.rfic && (
                    <div className="flex gap-4">
                      <span className="text-neutral-400">RFIC:</span>
                      <span className="text-neutral-700">{service.rfic}</span>
                    </div>
                  )}
                  {service.rfisc && (
                    <div className="flex gap-4">
                      <span className="text-neutral-400">RFISC:</span>
                      <span className="text-neutral-700">{service.rfisc}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Passenger selection - Modern design */}
          <div className={cn(
            "mt-4 pt-4 border-t",
            isSelected ? "border-neutral-200" : "border-neutral-100"
          )}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Users className={cn("w-4 h-4", isSelected ? colors.priceText : "text-neutral-400")} />
              <span className="text-sm font-medium text-neutral-700">Select passengers</span>
            </div>
            {selectedPaxIds.size > 0 && (
              <span className={cn(
                "text-xs font-semibold px-2 py-0.5 rounded-full",
                colors.badgeBg, colors.badgeText
              )}>
                {selectedPaxIds.size} selected
              </span>
            )}
          </div>

          {/* "All passengers" button - Modern style */}
          {eligiblePax.length > 1 && (
            <button
              type="button"
              onClick={() => onToggleServiceForAllPax(service.serviceId)}
              className={cn(
                'w-full px-4 py-3 rounded-xl text-sm font-semibold transition-all duration-200 mb-3',
                'flex items-center justify-center gap-3',
                allEligibleSelected
                  ? cn(
                      "bg-gradient-to-r shadow-md",
                      accentColor === 'orange' && "from-orange-500 to-orange-600 text-white",
                      accentColor === 'emerald' && "from-emerald-500 to-emerald-600 text-white",
                      accentColor === 'purple' && "from-purple-500 to-purple-600 text-white",
                      accentColor === 'cyan' && "from-cyan-500 to-cyan-600 text-white",
                      accentColor === 'primary' && "from-primary-500 to-primary-600 text-white",
                      accentColor === 'slate' && "from-slate-500 to-slate-600 text-white"
                    )
                  : cn(
                      'bg-gradient-to-r from-neutral-50 to-neutral-100 text-neutral-700',
                      'border-2 border-dashed border-neutral-300',
                      'hover:border-solid hover:shadow-sm',
                      colors.hoverBorder
                    )
              )}
            >
              <div className={cn(
                'w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all',
                allEligibleSelected
                  ? 'border-white/50 bg-white/20'
                  : 'border-neutral-400 bg-white'
              )}>
                {allEligibleSelected && <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />}
              </div>
              <span>Select all {eligiblePax.length} passengers</span>
              {!allEligibleSelected && service.price > 0 && (
                <span className="text-xs text-neutral-500">
                  ({formatCurrency(service.price * eligiblePax.length, service.currency)} total)
                </span>
              )}
            </button>
          )}

          {/* Individual passenger buttons - Modern chip style */}
          <div className="space-y-2">
            {/* Group passengers by type */}
            {(() => {
              // Debug: Log passenger info
              if (eligiblePax.length > 0 && showDebug) {
                console.log('[ServiceCard] Eligible passengers:', eligiblePax.map(p => ({ paxId: p.paxId, type: p.type, label: p.displayLabel })));
              }

              const adults = eligiblePax.filter(p => p.type === 'ADT');
              const children = eligiblePax.filter(p => p.type === 'CHD');
              const infants = eligiblePax.filter(p => p.type === 'INF');

              // If no passengers match type filters, show all as-is
              const hasTypedPassengers = adults.length > 0 || children.length > 0 || infants.length > 0;

              // Modern passenger chip renderer
              const renderPassengerChip = (pax: { paxId: string; displayLabel: string }) => {
                const isPaxSelected = selectedPaxIds.has(pax.paxId);
                return (
                  <button
                    type="button"
                    key={pax.paxId}
                    onClick={() => onToggleServiceForPax(service.serviceId, pax.paxId)}
                    className={cn(
                      'group/pax relative px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 min-w-0',
                      'flex items-center gap-2.5 overflow-hidden',
                      isPaxSelected
                        ? cn(
                            "bg-gradient-to-r shadow-sm text-white",
                            accentColor === 'orange' && "from-orange-500 to-orange-600",
                            accentColor === 'emerald' && "from-emerald-500 to-emerald-600",
                            accentColor === 'purple' && "from-purple-500 to-purple-600",
                            accentColor === 'cyan' && "from-cyan-500 to-cyan-600",
                            accentColor === 'primary' && "from-primary-500 to-primary-600",
                            accentColor === 'slate' && "from-slate-500 to-slate-600"
                          )
                        : cn(
                            'bg-white text-neutral-700 border border-neutral-200',
                            'hover:border-neutral-300 hover:shadow-sm hover:bg-neutral-50'
                          )
                    )}
                  >
                    {/* Checkbox */}
                    <div className={cn(
                      'w-4 h-4 rounded-md border-2 flex items-center justify-center shrink-0 transition-all',
                      isPaxSelected
                        ? 'border-white/50 bg-white/20'
                        : 'border-neutral-300 bg-white group-hover/pax:border-neutral-400'
                    )}>
                      {isPaxSelected && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
                    </div>
                    {/* User icon */}
                    <UserCircle className={cn(
                      "w-4 h-4 shrink-0",
                      isPaxSelected ? "text-white/80" : "text-neutral-400"
                    )} />
                    {/* Label */}
                    <span className="truncate flex-1 text-left">{pax.displayLabel}</span>
                    {/* Price indicator when not selected */}
                    {!isPaxSelected && service.price > 0 && (
                      <span className="text-[10px] text-neutral-400 shrink-0">
                        +{formatCurrency(service.price, service.currency)}
                      </span>
                    )}
                  </button>
                );
              };

              if (!hasTypedPassengers && eligiblePax.length > 0) {
                // Fallback: show all passengers without grouping
                return (
                  <div className="grid grid-cols-2 gap-2">
                    {eligiblePax.map(renderPassengerChip)}
                  </div>
                );
              }

              return (
                <>
                  {/* Adults */}
                  {adults.length > 0 && (
                    <div>
                      {(adults.length > 1 || children.length > 0 || infants.length > 0) && (
                        <div className="flex items-center gap-2 mb-2 px-1">
                          <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wide">Adults</span>
                          <div className="flex-1 h-px bg-neutral-200" />
                        </div>
                      )}
                      <div className="grid grid-cols-2 gap-2">
                        {adults.map(renderPassengerChip)}
                      </div>
                    </div>
                  )}
                  {/* Children */}
                  {children.length > 0 && (
                    <div className="mt-3">
                      <div className="flex items-center gap-2 mb-2 px-1">
                        <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wide">Children</span>
                        <div className="flex-1 h-px bg-neutral-200" />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        {children.map(renderPassengerChip)}
                      </div>
                    </div>
                  )}
                  {/* Infants */}
                  {infants.length > 0 && (
                    <div className="mt-3">
                      <div className="flex items-center gap-2 mb-2 px-1">
                        <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wide">Infants</span>
                        <div className="flex-1 h-px bg-neutral-200" />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        {infants.map(renderPassengerChip)}
                      </div>
                    </div>
                  )}
                </>
              );
            })()}
          </div>

          {/* Selection summary - Modern card */}
          {selectedPaxIds.size > 0 && service.price > 0 && (
            <div className={cn(
              "mt-4 p-3 rounded-xl",
              "bg-gradient-to-r from-neutral-50 to-neutral-100/50",
              "border border-neutral-200"
            )}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Check className={cn("w-4 h-4", colors.priceText)} />
                  <span className="text-sm text-neutral-600">
                    {selectedPaxIds.size} passenger{selectedPaxIds.size > 1 ? 's' : ''} selected
                  </span>
                </div>
                <div className={cn("text-base font-bold", colors.priceText)}>
                  {formatCurrency(service.price * selectedPaxIds.size, service.currency)}
                </div>
              </div>
            </div>
          )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <Card className="overflow-hidden">
      <div className={cn("bg-gradient-to-r px-6 py-4", gradient)}>
        <h3 className="text-lg font-bold text-white flex items-center gap-2">
          {icon}
          {title}
        </h3>
        <p className="text-white/80 text-sm mt-1">{subtitle}</p>
      </div>

      <div className="p-4">
        {showGrouped ? (
          // Round trip: show side-by-side layout
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Outbound services */}
            {outboundServices.length > 0 && (
              <div>
                <div className={cn("flex items-center gap-2 mb-3 pb-2 border-b-2", colors.dividerBorder)}>
                  <Plane className={cn("w-4 h-4", colors.iconColor)} />
                  <div className="font-semibold text-sm text-neutral-900">{outboundFlightLabel}</div>
                </div>
                <div className="space-y-4">
                  {outboundServices.map(renderServiceCard)}
                </div>
              </div>
            )}

            {/* Inbound services */}
            {inboundServices.length > 0 && (
              <div>
                <div className={cn("flex items-center gap-2 mb-3 pb-2 border-b-2", colors.dividerBorder)}>
                  <Plane className={cn("w-4 h-4 rotate-180", colors.iconColor)} />
                  <div className="font-semibold text-sm text-neutral-900">{inboundFlightLabel}</div>
                </div>
                <div className="space-y-4">
                  {inboundServices.map(renderServiceCard)}
                </div>
              </div>
            )}
          </div>
        ) : (
          // One-way or services for both directions
          <div className="space-y-4">
            {services.map(renderServiceCard)}
          </div>
        )}

        {/* Services for both directions (shown below side-by-side if round trip) */}
        {bothServices.length > 0 && showGrouped && (
          <div className="mt-6 pt-6 border-t border-neutral-200">
            <div className="font-semibold text-sm text-neutral-700 mb-3">Available for both flights</div>
            <div className="space-y-4">
              {bothServices.map(renderServiceCard)}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

// Bundle Inclusions List Component
interface BundleInclusionsListProps {
  inclusions: BundleOption['inclusions'];
  compact?: boolean;
  enhanced?: boolean;
}

function BundleInclusionsList({ inclusions, compact = false, enhanced = false }: BundleInclusionsListProps) {
  // Only show items that have actual data from XML - don't show "No X" for missing items
  const items = [
    inclusions.baggage ? {
      icon: <Briefcase className="w-4 h-4" />,
      label: inclusions.baggage,
      available: true,
    } : null,
    inclusions.meals ? {
      icon: <Coffee className="w-4 h-4" />,
      label: 'Meals included',
      available: true,
    } : null,
    inclusions.seatSelection ? {
      icon: <Armchair className="w-4 h-4" />,
      label: 'Seat selection',
      available: true,
    } : null,
    inclusions.changes ? {
      icon: <RefreshCw className="w-4 h-4" />,
      label: `Changes: ${inclusions.changes}`,
      available: true,
    } : null,
    inclusions.cancellation ? {
      icon: <Ban className="w-4 h-4" />,
      label: `Cancellation: ${inclusions.cancellation}`,
      available: true,
    } : null,
  ].filter(Boolean) as { icon: React.ReactNode; label: string; available: boolean }[];

  // Enhanced list view for bundle cards
  if (enhanced) {
    return (
      <div className="grid grid-cols-1 gap-2">
        {items.map((item, idx) => (
          <div
            key={idx}
            className={cn(
              'flex items-center gap-3 p-2 rounded-lg',
              item.available
                ? 'bg-emerald-50 border border-emerald-200'
                : 'bg-neutral-50 border border-neutral-200'
            )}
          >
            <div className={cn(
              'flex-shrink-0 p-1.5 rounded-full',
              item.available ? 'bg-emerald-500' : 'bg-neutral-300'
            )}>
              {item.available ? (
                <Check className="w-3 h-3 text-white" />
              ) : (
                <X className="w-3 h-3 text-white" />
              )}
            </div>
            <span className={cn(
              'text-sm font-medium',
              item.available ? 'text-emerald-900' : 'text-neutral-500'
            )}>
              {item.label}
            </span>
          </div>
        ))}
        {/* Bundle inclusion codes (OOCP, MORE, FLEX, CCSH etc.) */}
        {inclusions.otherInclusions && inclusions.otherInclusions.length > 0 && (
          inclusions.otherInclusions.map((other: { code: string; name: string } | string, idx: number) => {
            const code = typeof other === 'string' ? other : other.code;
            const name = typeof other === 'string' ? '' : other.name;
            const displayText = name ? `${name} (${code})` : code;
            return (
              <div
                key={`other-${idx}`}
                className="flex items-center gap-3 p-2 rounded-lg bg-indigo-50 border border-indigo-200"
              >
                <div className="flex-shrink-0 p-1.5 rounded-full bg-indigo-500">
                  <Check className="w-3 h-3 text-white" />
                </div>
                <span className="text-sm font-medium text-indigo-900">{displayText}</span>
              </div>
            );
          })
        )}
      </div>
    );
  }

  if (compact) {
    return (
      <div className="flex flex-wrap gap-2 mt-2">
        {items.map((item, idx) => (
          <span
            key={idx}
            className={cn(
              'inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full',
              item.available
                ? 'bg-green-100 text-green-700'
                : 'bg-neutral-100 text-neutral-500'
            )}
          >
            {item.icon}
            <span className="truncate max-w-[120px]">{item.label}</span>
          </span>
        ))}
        {/* Bundle inclusion codes (OOCP, MORE, FLEX, CCSH etc.) */}
        {inclusions.otherInclusions && inclusions.otherInclusions.length > 0 && (
          inclusions.otherInclusions.map((other: { code: string; name: string } | string, idx: number) => {
            const code = typeof other === 'string' ? other : other.code;
            const name = typeof other === 'string' ? '' : other.name;
            const displayText = name ? `${name} (${code})` : code;
            return (
              <span
                key={`other-${idx}`}
                className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700"
              >
                <Check className="w-3 h-3" />
                <span className="truncate max-w-[150px]">{displayText}</span>
              </span>
            );
          })
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2 mt-3">
      {items.map((item, idx) => (
        <div
          key={idx}
          className={cn(
            'flex items-center gap-2 text-sm',
            item.available ? 'text-neutral-700' : 'text-neutral-400'
          )}
        >
          <span className={item.available ? 'text-green-600' : 'text-neutral-400'}>
            {item.available ? <Check className="w-4 h-4" /> : item.icon}
          </span>
          {item.label}
        </div>
      ))}
      {/* Bundle inclusion codes (OOCP, MORE, FLEX, CCSH etc.) */}
      {inclusions.otherInclusions && inclusions.otherInclusions.length > 0 && (
        inclusions.otherInclusions.map((other: { code: string; name: string } | string, idx: number) => {
          const code = typeof other === 'string' ? other : other.code;
          const name = typeof other === 'string' ? '' : other.name;
          const displayText = name ? `${name} (${code})` : code;
          return (
            <div
              key={`other-${idx}`}
              className="flex items-center gap-2 text-sm text-neutral-700"
            >
              <span className="text-indigo-600">
                <Check className="w-4 h-4" />
              </span>
              {displayText}
            </div>
          );
        })
      )}
    </div>
  );
}
