/**
 * FLIGHT SELECTION STORE - Global state management for booking flow
 *
 * DATA FLOW & REUSABILITY GUIDE:
 * ==============================
 *
 * This store manages the complete selection state across the booking flow:
 * 1. Flight Selection (origin/destination flights with bundles)
 * 2. Service Selection (baggage, meals, seats, insurance, etc.)
 *
 * PROGRESSIVE SERVICE SELECTION FLOW:
 * -----------------------------------
 * ServiceList Step → OfferPrice Step → SeatSelection Step → OfferPrice Step (updated)
 *     ↓                    ↓                     ↓                      ↓
 * Select baggage      Verify price         Select seats          Verify new total
 * Select meals        Display breakdown    For passengers        Display updated breakdown
 *     ↓                                          ↓
 * setSelectedServices()                    appendServices()
 *
 * HOW TO ADD NEW ANCILLARY TYPES (e.g., Seats):
 * ---------------------------------------------
 * 1. In your step component (e.g., SeatSelectionStep), build SelectedServiceItem[] array:
 *    - serviceType: 'seat'
 *    - associationType: 'segment' (seats are segment-based)
 *    - segmentRefs: ['seg123'] (which segment this seat applies to)
 *    - paxRefIds: ['ADT0'] (which passenger this seat is for)
 *    - offerId, offerItemId: from SeatMap response
 *    - price, currency, quantity: seat pricing info
 *
 * 2. Call flightStore.appendServices(seatSelections) to add to existing selection
 *
 * 3. The OfferPrice step will automatically re-trigger with ALL services (baggage + meals + seats)
 *    because it watches flightStore.selectedServices via useEffect
 *
 * 4. The OfferPrice builder will correctly structure the XML request based on associationType:
 *    - segment-based: Creates separate SelectedOfferItem per segment
 *    - journey-based: Creates single SelectedOfferItem with all journey refs
 *    - leg-based: Creates single SelectedOfferItem with all leg refs
 *
 * REUSABILITY GUARANTEE:
 * ---------------------
 * The SelectedServiceItem interface is 100% reusable for ALL ancillary types.
 * No code changes needed in OfferPrice step or builder when adding new ancillary types.
 * Just populate the interface correctly and append to the store.
 */

import { useMemo } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useWorkflow } from '@/core/engines';
import type { FlightOffer, BundleOption, FlightJourney, AirShoppingPriceBreakdown, OfferItemWithPax, PerPaxTypePricing } from '@/components/flights';

export interface FlightSelectionItem {
  offerId: string;
  bundleId: string;
  journey: FlightJourney;
  bundle: BundleOption;
  baseFare: number;
  // Fare info from offer
  fareBasisCode?: string;
  cabinType?: string;
  rbd?: string;
  // Base offer item IDs (flight fare items) - needed for OfferPrice along with bundle
  offerItemIds?: string[];
  // Passenger reference IDs from AirShopping - needed for OfferPrice (legacy)
  paxRefIds?: string[];
  // NEW: Per-item paxRefIds for correct OfferPrice request structure
  offerItemsWithPax?: OfferItemWithPax[];
  // Detailed price breakdown from AirShopping (for OfferPrice comparison)
  priceBreakdown?: AirShoppingPriceBreakdown;
  // Per-passenger-type pricing from AirShopping (for accurate total calculation)
  perPaxPricing?: PerPaxTypePricing[];
}

export interface FlightSelection {
  outbound: FlightSelectionItem | null;
  inbound: FlightSelectionItem | null;
}

export interface SearchCriteriaState {
  origin: string;
  destination: string;
  departureDate: string;
  returnDate?: string;
  passengers: {
    adults: number;
    children: number;
    infants: number;
  };
  cabinClass?: string;
}

// Selected services from ServiceList - includes all data needed for OfferPrice
// This structure is REUSABLE for all ancillary types: baggage, meals, seats, insurance, etc.
// When adding new ancillary types (e.g., seats), use this same structure and append via appendServices()
export interface SelectedServiceItem {
  serviceId: string;
  serviceCode: string;
  serviceName: string;
  serviceType: 'baggage' | 'meal' | 'insurance' | 'bundle' | 'ssr' | 'flexibility' | 'seat' | 'other';
  quantity: number;
  price: number;
  currency: string;
  offerId: string;
  offerItemId: string;
  paxRefIds: string[];
  // Association type determines how to structure OfferPrice request
  associationType: 'segment' | 'journey' | 'leg' | 'unknown';
  // References for OfferPrice request structure
  segmentRefs?: string[];
  journeyRefs?: string[];
  legRefs?: string[];
  // Direction for round-trip display
  direction: 'outbound' | 'inbound' | 'both';
  // Seat-specific fields for OfferPrice <SelectedSeat> element
  seatRow?: string;
  seatColumn?: string;
}

// SSR mapping entry - contains both offerId and offerItemId needed for OfferPrice
export interface SSRMappingEntry {
  offerId: string;      // ServiceList ALaCarteOffer ID
  offerItemId: string;  // Specific offer item ID for this SSR/segment/pax
}

// SSR mapping from ServiceList - maps SSR code to offer IDs by segment and passenger
// Example: { 'UPFX': { 'seg123': { 'ADT0': { offerId: 'alacarte-123', offerItemId: 'item-upfx-seg123-adt0' } } } }
export interface SSRMapping {
  [ssrCode: string]: {
    [segmentId: string]: {
      [paxRefId: string]: SSRMappingEntry;
    };
  };
}

// OfferPrice response data - saved for OrderCreate
// Contains the priced offer details that need to be passed to OrderCreate
export interface OfferPriceData {
  // The priced offer ID from OfferPrice response
  offerId: string;
  // Airline owner code
  ownerCode: string;
  // Total priced amount
  totalAmount: number;
  currency: string;
  // Offer items with their IDs and passenger associations
  offerItems: Array<{
    offerItemId: string;
    paxRefIds: string[];
    // Optional: segment references for the item
    segmentRefIds?: string[];
  }>;
  // ResponseID from OfferPrice (if different from AirShopping)
  responseId?: string;
}

// Zustand store for flight selection (globally accessible)
interface FlightSelectionStore {
  selection: FlightSelection;
  isRoundTrip: boolean;
  shoppingResponseId: string | null;
  searchCriteria: SearchCriteriaState | null;
  selectedServices: SelectedServiceItem[];
  servicesTotal: number;
  // Original AirShopping total (flights + bundles) before any bundle swaps
  // This is set when flights are selected and never changes during bundle swaps
  originalAirShoppingTotal: number | null;
  // SSR mappings from ServiceList response - used when creating SSR services for seats
  ssrMappings: SSRMapping;
  // OfferPrice response data - saved for OrderCreate
  // Contains all data needed to construct OrderCreate request
  offerPriceData: OfferPriceData | null;

  // Payment-related fields (for PaymentPage)
  orderId: string | null;
  pnr: string | null;
  totalAmount: number;
  currency: string;
  totalPrice: number;

  // Actions
  setOutbound: (item: FlightSelectionItem | null) => void;
  setInbound: (item: FlightSelectionItem | null) => void;
  setRoundTrip: (value: boolean) => void;
  setShoppingResponseId: (id: string | null) => void;
  setSearchCriteria: (criteria: SearchCriteriaState | null) => void;
  setSelectedServices: (services: SelectedServiceItem[], total: number) => void;
  // Append new services to existing selection (for adding seats, insurance, etc. after initial service selection)
  // This allows progressive service selection: ServiceList → OfferPrice → SeatSelection → OfferPrice (with seats added)
  appendServices: (newServices: SelectedServiceItem[]) => void;
  // Update bundle info for a direction (used when swapping bundles in ServiceList)
  updateBundle: (direction: 'outbound' | 'inbound', bundleInfo: Partial<BundleOption>) => void;
  // Store the original AirShopping total for price comparison
  setOriginalAirShoppingTotal: (total: number) => void;
  // Store SSR mappings from ServiceList
  setSSRMappings: (mappings: SSRMapping) => void;
  // Store OfferPrice response data for OrderCreate
  setOfferPriceData: (data: OfferPriceData | null) => void;
  // Payment-related setters
  setOrderId: (id: string | null) => void;
  setPnr: (pnr: string | null) => void;
  setTotalAmount: (amount: number) => void;
  setCurrency: (currency: string) => void;
  setTotalPrice: (price: number) => void;
  clearSelection: () => void;
  reset: () => void;
}

export const useFlightSelectionStore = create<FlightSelectionStore>()(
  persist(
    (set) => ({
      selection: { outbound: null, inbound: null },
      isRoundTrip: false,
      shoppingResponseId: null,
      searchCriteria: null,
      selectedServices: [],
      servicesTotal: 0,
      originalAirShoppingTotal: null,
      ssrMappings: {},
      offerPriceData: null,
      // Payment-related initial state
      orderId: null,
      pnr: null,
      totalAmount: 0,
      currency: 'AUD',
      totalPrice: 0,

      setOutbound: (item) => set((state) => ({
        selection: { ...state.selection, outbound: item }
      })),

  setInbound: (item) => set((state) => ({
    selection: { ...state.selection, inbound: item }
  })),

  setRoundTrip: (value) => set({ isRoundTrip: value }),

  setShoppingResponseId: (id) => set({ shoppingResponseId: id }),

  setSearchCriteria: (criteria) => set({ searchCriteria: criteria }),

  setSelectedServices: (services, total) => set({ selectedServices: services, servicesTotal: total }),

  appendServices: (newServices) => set((state) => {
    // Merge new services with existing services
    const mergedServices = [...state.selectedServices, ...newServices];

    // Recalculate total
    const newTotal = mergedServices.reduce((sum, service) => sum + (service.price * service.quantity), 0);

    console.log('[FlightStore] Appending services:', {
      existing: state.selectedServices.length,
      new: newServices.length,
      merged: mergedServices.length,
      oldTotal: state.servicesTotal,
      newTotal,
    });

    return {
      selectedServices: mergedServices,
      servicesTotal: newTotal,
    };
  }),

  updateBundle: (direction, bundleInfo) => set((state) => {
    const currentItem = direction === 'outbound' ? state.selection.outbound : state.selection.inbound;
    if (!currentItem) return state;

    const updatedBundle: BundleOption = {
      ...currentItem.bundle,
      ...bundleInfo,
    };

    const updatedItem: FlightSelectionItem = {
      ...currentItem,
      bundle: updatedBundle,
      // Also update bundleId if bundleId is provided
      bundleId: bundleInfo.bundleId || currentItem.bundleId,
    };

    if (direction === 'outbound') {
      return { selection: { ...state.selection, outbound: updatedItem } };
    } else {
      return { selection: { ...state.selection, inbound: updatedItem } };
    }
  }),

  setOriginalAirShoppingTotal: (total) => set({ originalAirShoppingTotal: total }),

  setSSRMappings: (mappings) => set({ ssrMappings: mappings }),

  setOfferPriceData: (data) => set({ offerPriceData: data }),

  // Payment-related setters
  setOrderId: (id) => set({ orderId: id }),
  setPnr: (pnr) => set({ pnr }),
  setTotalAmount: (amount) => set({ totalAmount: amount }),
  setCurrency: (currency) => set({ currency }),
  setTotalPrice: (price) => set({ totalPrice: price }),

  clearSelection: () => set({
    selection: { outbound: null, inbound: null },
    selectedServices: [],
    servicesTotal: 0,
    offerPriceData: null,
    // Clear pricing fields to prevent stale estimates from previous searches
    totalPrice: 0,
    totalAmount: 0,
    orderId: null,
    pnr: null,
    // Don't clear originalAirShoppingTotal or ssrMappings here - they should persist until reset
  }),

  reset: () => set({
    selection: { outbound: null, inbound: null },
    isRoundTrip: false,
    shoppingResponseId: null,
    searchCriteria: null,
    selectedServices: [],
    servicesTotal: 0,
    originalAirShoppingTotal: null,
    ssrMappings: {},
    offerPriceData: null,
    // Reset payment fields
    orderId: null,
    pnr: null,
    totalAmount: 0,
    currency: 'AUD',
    totalPrice: 0,
  }),
    }),
    {
      name: 'flight-selection-storage',
      partialize: (state) => ({
        // Only persist essential booking data
        selection: state.selection,
        isRoundTrip: state.isRoundTrip,
        searchCriteria: state.searchCriteria,
        selectedServices: state.selectedServices,
        servicesTotal: state.servicesTotal,
        offerPriceData: state.offerPriceData,
        orderId: state.orderId,
        pnr: state.pnr,
        totalAmount: state.totalAmount,
        currency: state.currency,
        totalPrice: state.totalPrice,
      }),
    }
  )
);

export interface UseFlightSelectionResult {
  selection: FlightSelection;
  selectOutbound: (offer: FlightOffer, bundleId: string) => void;
  selectInbound: (offer: FlightOffer, bundleId: string) => void;
  clearSelection: () => void;
  totalPrice: number;
  currency: string;
  isComplete: boolean;
  isRoundTrip: boolean;
  setRoundTrip: (value: boolean) => void;
  shoppingResponseId: string | null;
  setShoppingResponseId: (id: string | null) => void;
  searchCriteria: SearchCriteriaState | null;
  setSearchCriteria: (criteria: SearchCriteriaState | null) => void;
}

export function useFlightSelection(): UseFlightSelectionResult {
  const { updateContext } = useWorkflow();
  const store = useFlightSelectionStore();

  const selectOutbound = (offer: FlightOffer, bundleId: string) => {
    console.log('[FlightSelection] selectOutbound called with offer:', {
      offerId: offer.offerId,
      shoppingResponseId: offer.shoppingResponseId,
      hasShoppingResponseId: 'shoppingResponseId' in offer,
    });

    const bundle = offer.bundles.find(b => b.bundleId === bundleId);
    if (!bundle) return;

    store.setOutbound({
      offerId: offer.offerId,
      bundleId,
      journey: offer.journey,
      bundle,
      baseFare: offer.baseFare,
      fareBasisCode: offer.fareBasisCode,
      cabinType: offer.cabinType,
      rbd: offer.rbd,
      offerItemIds: offer.offerItemIds,  // Base fare item IDs for OfferPrice
      paxRefIds: offer.paxRefIds,  // Passenger reference IDs for OfferPrice (legacy)
      offerItemsWithPax: offer.offerItemsWithPax,  // NEW: Per-item paxRefIds
      priceBreakdown: offer.priceBreakdown,  // Detailed price breakdown for comparison
      perPaxPricing: offer.perPaxPricing,  // Per-pax-type pricing for accurate totals
    });

    // Store the shoppingResponseId from the offer (important for mixed mode)
    console.log('[FlightSelection] Storing shoppingResponseId:', offer.shoppingResponseId);
    if (offer.shoppingResponseId) {
      store.setShoppingResponseId(offer.shoppingResponseId);
    } else {
      console.warn('[FlightSelection] No shoppingResponseId on offer!');
    }

    // Update workflow context
    updateContext({
      selectedOffers: [{
        offerId: offer.offerId,
        bundleId,
        direction: 'outbound',
      }] as unknown as Record<string, unknown>,
    });
  };

  const selectInbound = (offer: FlightOffer, bundleId: string) => {
    const bundle = offer.bundles.find(b => b.bundleId === bundleId);
    if (!bundle) return;

    store.setInbound({
      offerId: offer.offerId,
      bundleId,
      journey: offer.journey,
      bundle,
      baseFare: offer.baseFare,
      fareBasisCode: offer.fareBasisCode,
      cabinType: offer.cabinType,
      rbd: offer.rbd,
      offerItemIds: offer.offerItemIds,  // Base fare item IDs for OfferPrice
      paxRefIds: offer.paxRefIds,  // Passenger reference IDs for OfferPrice (legacy)
      offerItemsWithPax: offer.offerItemsWithPax,  // NEW: Per-item paxRefIds
      priceBreakdown: offer.priceBreakdown,  // Detailed price breakdown for comparison
      perPaxPricing: offer.perPaxPricing,  // Per-pax-type pricing for accurate totals
    });
  };

  const totalPrice = useMemo(() => {
    let total = 0;
    const paxCounts = store.searchCriteria?.passengers || { adults: 1, children: 0, infants: 0 };

    console.log('[useFlightSelection] 🧮 Calculating totalPrice with paxCounts:', paxCounts);

    // Helper to calculate flight total using per-person amounts and CURRENT pax counts
    const calculateFlightTotal = (selectionItem: FlightSelectionItem): number => {
      const bundlePrice = selectionItem.bundle.price;
      const perPaxPricing = selectionItem.perPaxPricing;

      // Use per-person amounts from AirShopping with CURRENT pax counts from searchCriteria
      // NOTE: perPaxPricing.paxCount may be stale from a previous search, so we use paxCounts instead
      if (perPaxPricing && perPaxPricing.length > 0) {
        // Get per-person fares from AirShopping response
        const adtPricing = perPaxPricing.find(p => p.paxType === 'ADT');
        const chdPricing = perPaxPricing.find(p => p.paxType === 'CHD');
        const infPricing = perPaxPricing.find(p => p.paxType === 'INF');

        const adultFarePerPerson = adtPricing?.perPersonAmount ?? 0;
        const childFarePerPerson = chdPricing?.perPersonAmount ?? adultFarePerPerson;
        const infantFarePerPerson = infPricing?.perPersonAmount ?? 0;

        console.log('[useFlightSelection] Per-person fares: ADT=', adultFarePerPerson, 'CHD=', childFarePerPerson, 'INF=', infantFarePerPerson);
        console.log('[useFlightSelection] Current paxCounts:', paxCounts);

        // Apply CURRENT passenger counts (not stale perPaxPricing.paxCount)
        let flightTotal = 0;
        flightTotal += paxCounts.adults * (adultFarePerPerson + bundlePrice);
        flightTotal += paxCounts.children * (childFarePerPerson + bundlePrice);
        flightTotal += paxCounts.infants * infantFarePerPerson; // INF doesn't get bundle

        console.log('[useFlightSelection] Flight total (using current paxCounts):', flightTotal);
        return flightTotal;
      }

      // Fallback: estimate using old logic (divide baseFare by paying pax)
      const payingPax = paxCounts.adults + paxCounts.children;
      const adultBaseFare = payingPax > 0 ? selectionItem.baseFare / payingPax : selectionItem.baseFare;
      const infantBaseFare = Math.round(adultBaseFare * 0.1);

      let flightTotal = 0;
      flightTotal += paxCounts.adults * (adultBaseFare + bundlePrice);
      flightTotal += paxCounts.children * (adultBaseFare + bundlePrice);
      flightTotal += paxCounts.infants * infantBaseFare;
      return flightTotal;
    };

    if (store.selection.outbound) {
      const outboundTotal = calculateFlightTotal(store.selection.outbound);
      console.log('[useFlightSelection] 🚀 Outbound total:', outboundTotal);
      total += outboundTotal;
    }
    if (store.selection.inbound) {
      const inboundTotal = calculateFlightTotal(store.selection.inbound);
      console.log('[useFlightSelection] 🛬 Inbound total:', inboundTotal);
      total += inboundTotal;
    }
    console.log('[useFlightSelection] ✅ FINAL TOTAL:', total);
    return total;
  }, [store.selection, store.searchCriteria]);

  const currency = store.selection.outbound?.bundle.currency || 'AUD';

  const isComplete = useMemo(() => {
    if (store.isRoundTrip) {
      return store.selection.outbound !== null && store.selection.inbound !== null;
    }
    return store.selection.outbound !== null;
  }, [store.selection, store.isRoundTrip]);

  return {
    selection: store.selection,
    selectOutbound,
    selectInbound,
    clearSelection: store.clearSelection,
    totalPrice,
    currency,
    isComplete,
    isRoundTrip: store.isRoundTrip,
    setRoundTrip: store.setRoundTrip,
    shoppingResponseId: store.shoppingResponseId,
    setShoppingResponseId: store.setShoppingResponseId,
    searchCriteria: store.searchCriteria,
    setSearchCriteria: store.setSearchCriteria,
  };
}
