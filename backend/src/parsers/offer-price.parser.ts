// ============================================================================
// OFFER PRICE RESPONSE PARSER
// Extracts priced offers from OfferPrice response
// Jetstar-specific: handles EASD namespace and nested price structures
// ============================================================================

import { BaseXmlParser } from "./base.parser.js";
import type { Offer, OfferItem, TaxFeeItem as NDCTaxFeeItem } from "../types/ndc.types.js";
import type { OfferPriceResponseData } from "../types/api.types.js";

// Detailed tax/fee item for flight-level breakdown
export interface TaxFeeItem {
  code: string;      // Tax/Fee code (e.g., AGT, BF, FBZ, QR, WG)
  name: string;      // Descriptive name
  amount: number;    // Amount value
  currency: string;  // Currency code
}

// Per-passenger breakdown for a flight
export interface PassengerPriceBreakdown {
  ptc: string;        // Passenger type code (ADT, CHD, INF)
  paxCount: number;   // Number of passengers of this type
  baseFare: number;
  discountedBaseFare: number;
  surcharges: number;
  adjustments: number;
  publishedFare: number;  // Base + surcharges + adjustments
  taxes: TaxFeeItem[];
  fees: TaxFeeItem[];
  totalTaxesFees: number;
  total: number;
}

// Per-flight breakdown (matches screenshot format)
export interface FlightPriceBreakdown {
  flightNumber: number;   // Flight 1, Flight 2, etc.
  route: string;          // e.g., "MEL - SYD"
  segmentIds: string[];   // Segment reference IDs
  publishedFare: {
    label: string;        // e.g., "432 MEL-OOL Published Fare"
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
  // Per-passenger breakdown (for multi-pax display)
  passengerBreakdown: PassengerPriceBreakdown[];
}

// Extended parse result with detailed breakdown
export interface OfferPriceParseResult extends OfferPriceResponseData {
  success: boolean;
  errors?: Array<{ code: string; message: string }>;
  // Detailed flight-level breakdown for verification display
  flightBreakdowns?: FlightPriceBreakdown[];
}

// Tax/Fee code to name mapping (from Jetstar NDC documentation)
const TAX_FEE_NAMES: Record<string, string> = {
  'AGT': 'GROSS AGENT Channel Charge',
  'BF': 'Baggage (Included)',
  'FBZ': 'FlexiBiz Fee',
  'FLX': 'Japan Agents Flexibility Fee',
  'MFE': 'Meal Voucher Fee (Included)',
  'PLS': 'PLUS Product Charge',
  'QR': 'Passenger Service Charge - Domestic',
  'SF': 'Seat Fee W/G Class',
  'WG': 'Safety and Security Charge',
  'YQ': 'Carrier Surcharge',
  'YR': 'Carrier Surcharge',
  'AU': 'Australia GST',
  'UO': 'Australia Departure Tax',
  'WY': 'Passenger Service Fee',
  'ZR': 'International Tax',
  'OI': 'Other Tax',
  'XT': 'Multiple Taxes',
};

export class OfferPriceParser extends BaseXmlParser {
  parse(xml: string): OfferPriceParseResult {
    const doc = this.parseXml(xml);

    // Debug: log raw XML structure
    console.log("[OfferPriceParser] Parsing XML, length:", xml.length);

    // Parse warnings FIRST
    const warnings: string[] = [];
    const warningElements = this.getElements(doc, "Warning");
    for (const wEl of warningElements) {
      const msg = this.getText(wEl, "Message") || wEl.textContent?.trim();
      if (msg) warnings.push(msg);
    }

    // Parse pricing data BEFORE checking for errors
    const pricedOffers = this.parsePricedOffers(doc);
    console.log("[OfferPriceParser] Found offers:", pricedOffers.length);

    // Parse segment information for route labels
    const segments = this.parseSegments(doc);
    console.log("[OfferPriceParser] Found segments:", segments.length);

    // Parse detailed flight-level breakdown from OfferItems
    const flightBreakdowns = this.buildFlightBreakdownsFromOfferItems(pricedOffers, segments);
    console.log("[OfferPriceParser] Built flight breakdowns:", flightBreakdowns.length);

    // Collect errors
    const errors = this.extractErrors(doc);

    // Determine success: if we got pricing data, it's a success (even with bundle-specific SSR errors)
    // Only fail if we got NO data at all AND there are errors
    const hasData = pricedOffers.length > 0;
    const success = hasData || errors.length === 0;

    if (!success) {
      console.warn('[OfferPriceParser] OfferPrice failed - no data and errors present:', errors);
      return {
        success: false,
        errors,
        pricedOffers: [],
      };
    }

    // If we have errors but also have data, treat errors as warnings
    if (errors.length > 0) {
      console.warn('[OfferPriceParser] OfferPrice succeeded with warnings:', errors);
      warnings.push(...errors.map(e => typeof e === 'string' ? e : `${e.code}: ${e.message}`));
    }

    const expirationDateTime = this.getText(doc, "ExpirationDateTime") ||
                                this.getText(doc, "TicketDocQuantity") || undefined;

    return {
      success: true,
      pricedOffers,
      expirationDateTime,
      warnings: warnings.length > 0 ? warnings : undefined,
      flightBreakdowns: flightBreakdowns.length > 0 ? flightBreakdowns : undefined,
    };
  }

  // Simple segment info for route labels
  private parseSegments(doc: Document): Array<{ id: string; origin: string; destination: string }> {
    const segments: Array<{ id: string; origin: string; destination: string }> = [];

    // Try DatedMarketingSegmentList first
    const segmentElements = this.getElements(doc, "DatedMarketingSegment");
    console.log("[OfferPriceParser] parseSegments: found", segmentElements.length, "DatedMarketingSegment elements");

    for (const segEl of segmentElements) {
      const id = this.getText(segEl, "DatedMarketingSegmentId") ||
                 this.getAttribute(segEl, "SegmentID") || "";

      // Get origin from Dep element
      const depEl = this.getElement(segEl, "Dep");
      const origin = depEl ? this.getText(depEl, "IATA_LocationCode") || "" : "";

      // Get destination from Arrival element
      const arrEl = this.getElement(segEl, "Arrival");
      const destination = arrEl ? this.getText(arrEl, "IATA_LocationCode") || "" : "";

      console.log("[OfferPriceParser] parseSegments: segment", { id, origin, destination });

      if (id && origin && destination) {
        segments.push({ id, origin, destination });
      }
    }

    return segments;
  }

  /**
   * Build flight breakdowns from parsed OfferItems
   * Groups items by segment/flight and passenger type
   *
   * Jetstar can return items in various orders - we need to group by:
   * 1. Segment reference (to identify which flight)
   * 2. Passenger type (ADT, CHD, INF)
   */
  private buildFlightBreakdownsFromOfferItems(
    offers: Offer[],
    segments: Array<{ id: string; origin: string; destination: string }>
  ): FlightPriceBreakdown[] {
    const breakdowns: FlightPriceBreakdown[] = [];

    if (offers.length === 0) return breakdowns;

    const offer = offers[0]!; // Primary offer (we checked length > 0 above)
    const items = offer.offerItems || [];

    if (items.length === 0) return breakdowns;

    console.log("[OfferPriceParser] Building breakdowns from items:", {
      totalItems: items.length,
      items: items.map(i => ({
        id: i.offerItemId,
        pax: i.paxRefIds,
        segRefs: i.segmentRefIds,
        base: i.baseAmount?.value,
        total: i.totalAmount?.value
      })),
      segments,
    });

    // FILTER OUT BUNDLE ITEMS: Only include fare items for price breakdown
    // Bundle/service items have Service/ServiceDefinitionRefID in XML and don't have FareDetail
    // Flight fare items have FareDetail with fareBasisCode, cabinType, rbd
    // We want ONLY base flight fares for the passenger breakdown table
    const fareItems = items.filter(item => {
      // Flight fare items will have fareBasisCode from FareDetail
      // Bundle items won't have this field
      const hasFareBasisCode = !!item.fareBasisCode;

      // Also check that it has a valid base amount
      const hasBaseFare = item.baseAmount && item.baseAmount.value > 0;

      return hasFareBasisCode && hasBaseFare;
    });

    const bundleItems = items.filter(item => !item.fareBasisCode || !item.baseAmount || item.baseAmount.value === 0);

    console.log("[OfferPriceParser] ========== BUNDLE/SERVICE ITEMS IN OFFERPRICE RESPONSE ==========");
    console.log("[OfferPriceParser] Filtered fare items:", {
      totalItems: items.length,
      fareItems: fareItems.length,
      bundleItems: bundleItems.length,
    });

    if (bundleItems.length > 0) {
      console.log("[OfferPriceParser] Bundle/Service items breakdown:");
      bundleItems.forEach((b, idx) => {
        console.log(`[OfferPriceParser]   Bundle item #${idx + 1}:`, {
          offerItemId: b.offerItemId,
          paxRefIds: b.paxRefIds || [],
          segmentRefs: b.segmentRefIds || [],
          baseAmount: b.baseAmount?.value || 0,
          taxAmount: b.taxAmount?.value || 0,
          totalAmount: b.totalAmount?.value || 0,
          currency: b.totalAmount?.currency || 'AUD',
          hasFareBasisCode: !!b.fareBasisCode,
        });
      });

      const totalBundleCost = bundleItems.reduce((sum, b) => sum + (b.totalAmount?.value || 0), 0);
      console.log(`[OfferPriceParser] Total bundle/service cost: ${totalBundleCost.toFixed(2)} AUD`);
    }
    console.log("[OfferPriceParser] ================================================================");

    // Group fare items by JOURNEY (unique combination of segment refs)
    // A multi-segment journey (e.g., ADL→MEL→AYQ) should be treated as ONE flight
    // not split into separate "Flight 1" and "Flight 2"
    const itemsByJourney = new Map<string, OfferItem[]>();
    const itemsWithoutSegment: OfferItem[] = [];

    for (const item of fareItems) {
      const segRefs = item.segmentRefIds || [];
      if (segRefs.length > 0) {
        // Use ALL segment refs as the key (sorted for consistency)
        const journeyKey = [...segRefs].sort().join('|');
        if (!itemsByJourney.has(journeyKey)) {
          itemsByJourney.set(journeyKey, []);
        }
        itemsByJourney.get(journeyKey)!.push(item);
      } else {
        itemsWithoutSegment.push(item);
      }
    }

    console.log("[OfferPriceParser] Items grouped by journey:", {
      journeyGroups: Array.from(itemsByJourney.keys()),
      itemsWithoutSegment: itemsWithoutSegment.length,
    });

    // Alias for backward compatibility with rest of code
    const itemsBySegment = itemsByJourney;

    // If no segment refs, fall back to grouping by passenger count
    // Assume fare items are evenly distributed across flights
    if (itemsBySegment.size === 0 && itemsWithoutSegment.length > 0) {
      // Get unique passenger types
      const paxTypeCounts = new Map<string, number>();
      for (const item of fareItems) {
        for (const paxId of item.paxRefIds || []) {
          const ptc = paxId.replace(/\d+$/, "");
          paxTypeCounts.set(ptc, (paxTypeCounts.get(ptc) || 0) + 1);
        }
      }

      const numPaxTypes = Math.max(1, paxTypeCounts.size);
      const numFlights = Math.max(1, Math.round(fareItems.length / numPaxTypes));

      console.log("[OfferPriceParser] Fallback grouping:", { numPaxTypes, numFlights });

      // Group fare items per flight by position
      for (let flightIdx = 0; flightIdx < numFlights; flightIdx++) {
        const startIdx = flightIdx * numPaxTypes;
        const endIdx = Math.min(startIdx + numPaxTypes, fareItems.length);
        const flightItems = fareItems.slice(startIdx, endIdx);

        const segKey = segments[flightIdx]?.id || `flight-${flightIdx}`;
        itemsBySegment.set(segKey, flightItems);
      }
    }

    // Now build breakdown for each segment/flight
    let flightNumber = 0;
    // Get currency from offer totalPrice, or fallback to first offer item's currency
    let currency = offer.totalPrice?.currency || "AUD";
    if (currency === "AUD" && offer.offerItems && offer.offerItems.length > 0) {
      currency = offer.offerItems[0].totalAmount?.currency || "AUD";
    }

    for (const [journeyKey, segItems] of itemsBySegment) {
      flightNumber++;

      // Parse segment IDs from the journey key (could be single or multiple segments)
      const segmentIds = journeyKey.split('|');

      // For multi-segment journeys, find origin of first segment and destination of last segment
      // This gives us the FULL journey route (e.g., ADL → AYQ for ADL→MEL→AYQ)
      let route = `Flight ${flightNumber}`;

      if (segmentIds.length > 0) {
        // Find all segments in this journey
        console.log(`[OfferPriceParser] Looking for segment IDs: ${segmentIds.join(', ')}`);
        console.log(`[OfferPriceParser] Available segments:`, segments.map(s => `${s.id}: ${s.origin}-${s.destination}`));

        const journeySegments = segmentIds
          .map(id => segments.find(s => s.id === id))
          .filter((s): s is { id: string; origin: string; destination: string } => s != null && s.origin && s.origin.length > 0);

        console.log(`[OfferPriceParser] Found ${journeySegments.length} matching segments`);

        if (journeySegments.length > 0) {
          // First segment origin → Last segment destination
          const firstSeg = journeySegments[0];
          const lastSeg = journeySegments[journeySegments.length - 1];
          route = `${firstSeg.origin} → ${lastSeg.destination}`;

          console.log(`[OfferPriceParser] Journey route: ${route} (${journeySegments.length} segments: ${segmentIds.join(', ')})`);
        } else {
          console.log(`[OfferPriceParser] WARNING: Could not find matching segments for journey`);
        }
      }

      // Group items by passenger type
      const paxBreakdowns = new Map<string, PassengerPriceBreakdown>();
      // Track unique passenger IDs per type to get accurate count
      const uniquePaxIdsByType = new Map<string, Set<string>>();
      let flightTotal = 0;
      let flightBaseFare = 0;
      let flightTaxesFees = 0;

      // Aggregate all individual taxes from all items for this flight
      const taxAggregation = new Map<string, TaxFeeItem>();

      // First pass: collect all passenger IDs and per-person amounts
      const perPersonAmounts = new Map<string, { base: number; total: number; taxesFees: number }>();

      for (const item of segItems) {
        // Determine passenger type from first paxRefId
        const paxId = item.paxRefIds?.[0] || "ADT0";
        const ptc = paxId.replace(/\d+$/, "");

        const paxBase = item.baseAmount?.value || 0;
        const paxTotal = item.totalAmount?.value || 0;
        const paxTaxesFees = paxTotal - paxBase;

        // Initialize breakdown for this pax type if not exists
        if (!paxBreakdowns.has(ptc)) {
          paxBreakdowns.set(ptc, {
            ptc,
            paxCount: 0,  // Will be set from unique pax IDs after loop
            baseFare: 0,
            discountedBaseFare: 0,
            surcharges: 0,
            adjustments: 0,
            publishedFare: 0,
            taxes: [],
            fees: [],
            totalTaxesFees: 0,
            total: 0,
          });
          uniquePaxIdsByType.set(ptc, new Set());
        }

        const paxIdSet = uniquePaxIdsByType.get(ptc)!;

        // Track unique passenger IDs (e.g., "ADT0", "CHD0", "INF0")
        for (const pid of item.paxRefIds || [paxId]) {
          paxIdSet.add(pid);
        }

        // Store per-person amount (we'll multiply by actual passenger count later)
        perPersonAmounts.set(ptc, {
          base: paxBase,
          total: paxTotal,
          taxesFees: paxTaxesFees,
        });

        console.log(`[OfferPriceParser] Stored per-person for ${ptc}: base=${paxBase}, total=${paxTotal}`);

        // Aggregate individual taxes from this item
        if (item.taxItems && item.taxItems.length > 0) {
          for (const taxItem of item.taxItems) {
            if (taxAggregation.has(taxItem.code)) {
              // Add to existing tax code
              const existing = taxAggregation.get(taxItem.code)!;
              existing.amount += taxItem.amount;
            } else {
              // Create new tax entry
              taxAggregation.set(taxItem.code, {
                code: taxItem.code,
                name: taxItem.name,
                amount: taxItem.amount,
                currency: taxItem.currency,
              });
            }
          }
        }

        // Don't accumulate here - we'll calculate flight totals after multiplying by correct pax count
      }

      // Convert aggregated taxes to array
      const aggregatedTaxes = Array.from(taxAggregation.values());

      // RECONCILIATION CHECK: Verify itemized fees match calculated total
      const itemizedFeesTotal = aggregatedTaxes.reduce((sum, t) => sum + t.amount, 0);
      const reconciliationDiff = Math.abs(itemizedFeesTotal - flightTaxesFees);
      if (reconciliationDiff > 0.01) {
        console.warn(`[OfferPriceParser] Fee RECONCILIATION MISMATCH for Flight ${flightNumber}:`, {
          itemizedTotal: itemizedFeesTotal.toFixed(2),
          calculatedTotal: flightTaxesFees.toFixed(2),
          difference: reconciliationDiff.toFixed(2),
          itemizedFees: aggregatedTaxes.map(t => `${t.code}: ${t.amount}`),
        });
      } else {
        console.log(`[OfferPriceParser] Fee reconciliation OK for Flight ${flightNumber}: ${itemizedFeesTotal.toFixed(2)} == ${flightTaxesFees.toFixed(2)}`);
      }

      // Set paxCount from unique passenger IDs (not from item accumulation)
      // AND multiply per-person amounts by the CORRECT passenger count
      flightBaseFare = 0;
      flightTaxesFees = 0;
      flightTotal = 0;

      for (const [ptc, paxData] of paxBreakdowns) {
        const uniquePaxIds = uniquePaxIdsByType.get(ptc);
        const correctPaxCount = uniquePaxIds ? uniquePaxIds.size : 1;
        paxData.paxCount = correctPaxCount;

        // Now multiply the per-person amounts by the correct passenger count
        const perPerson = perPersonAmounts.get(ptc);
        if (perPerson) {
          paxData.baseFare = perPerson.base * correctPaxCount;
          paxData.discountedBaseFare = perPerson.base * correctPaxCount;
          paxData.publishedFare = perPerson.base * correctPaxCount;
          paxData.totalTaxesFees = perPerson.taxesFees * correctPaxCount;
          paxData.total = perPerson.total * correctPaxCount;

          // Accumulate flight totals
          flightBaseFare += paxData.baseFare;
          flightTaxesFees += paxData.totalTaxesFees;
          flightTotal += paxData.total;

          console.log(`[OfferPriceParser] Multiplied ${ptc}: ${perPerson.base} × ${correctPaxCount} = ${paxData.baseFare}`);
        }
      }

      // Convert to array and ensure consistent order (ADT, CHD, INF)
      const passengerBreakdown = Array.from(paxBreakdowns.values())
        .sort((a, b) => {
          const order = { 'ADT': 0, 'CHD': 1, 'INF': 2 };
          return (order[a.ptc as keyof typeof order] || 99) - (order[b.ptc as keyof typeof order] || 99);
        });

      console.log(`[OfferPriceParser] Flight ${flightNumber} (${route}):`, {
        journeyKey,
        itemCount: segItems.length,
        passengerBreakdown: passengerBreakdown.map(p => `${p.ptc}(${p.paxCount}): base=${p.baseFare}, total=${p.total}`),
        flightTotal,
        aggregatedTaxes: aggregatedTaxes.length,
      });

      breakdowns.push({
        flightNumber,
        route,
        segmentIds: segmentIds,
        publishedFare: {
          label: "Published Fare",
          baseFare: flightBaseFare,
          discountedBaseFare: flightBaseFare,
          surcharges: 0,
          adjustments: 0,
          total: flightBaseFare,
        },
        feesAndTaxes: aggregatedTaxes,
        totalFeesAndTaxes: flightTaxesFees,
        flightTotal,
        currency,
        passengerBreakdown,
      });
    }

    return breakdowns;
  }

  /**
   * Parse individual tax/fee breakdown items from XML
   * Handles Jetstar's Tax and Fee elements with TaxCode/FeeCode
   */
  private parseTaxFeeItems(parentEl: Element, elementName: string, codeAttr: string): TaxFeeItem[] {
    const items: TaxFeeItem[] = [];
    const elements = this.getElements(parentEl, elementName);

    for (const el of elements) {
      const code = this.getAttribute(el, codeAttr) ||
                   this.getText(el, codeAttr) ||
                   this.getText(el, "TaxCode") ||
                   this.getText(el, "FeeCode") || "";

      let amount = 0;
      let currency = "AUD";

      // Try Amount element
      const amountEl = this.getElement(el, "Amount");
      if (amountEl) {
        amount = parseFloat(amountEl.textContent?.trim() || "0");
        currency = this.getAttribute(amountEl, "CurCode") ||
                   this.getText(el, "CurCode") || "AUD";
      } else {
        // Try direct text content
        amount = parseFloat(el.textContent?.trim() || "0");
      }

      if (code && !isNaN(amount)) {
        items.push({
          code,
          name: TAX_FEE_NAMES[code] || `${elementName} ${code}`,
          amount,
          currency,
        });
      }
    }

    return items;
  }

  /**
   * Parse individual Tax items from TaxSummary element
   * Jetstar format: <TaxSummary><Tax><TaxCode>WG</TaxCode><Amount CurCode="AUD">4.82</Amount></Tax>...</TaxSummary>
   */
  private parseTaxItemsFromSummary(taxSummaryEl: Element): TaxFeeItem[] {
    const items: TaxFeeItem[] = [];
    const taxElements = this.getElements(taxSummaryEl, "Tax");

    console.log("[OfferPriceParser] parseTaxItemsFromSummary: found", taxElements.length, "Tax elements");

    for (const taxEl of taxElements) {
      // Get tax code - try multiple formats
      const code = this.getText(taxEl, "TaxCode") ||
                   this.getAttribute(taxEl, "TaxCode") ||
                   this.getText(taxEl, "Code") ||
                   this.getAttribute(taxEl, "Code") || "";

      // Get amount - try Amount element first, then direct text
      let amount = 0;
      let currency = "AUD";

      const amountEl = this.getElement(taxEl, "Amount");
      if (amountEl) {
        amount = parseFloat(amountEl.textContent?.trim() || "0");
        currency = this.getAttribute(amountEl, "CurCode") ||
                   this.getAttribute(amountEl, "Code") ||
                   this.getText(taxEl, "CurCode") || "AUD";
      } else {
        // Try TaxAmount element
        const taxAmountEl = this.getElement(taxEl, "TaxAmount");
        if (taxAmountEl) {
          amount = parseFloat(taxAmountEl.textContent?.trim() || "0");
          currency = this.getAttribute(taxAmountEl, "CurCode") || "AUD";
        }
      }

      // Only add if we have a code and valid amount
      if (code && !isNaN(amount) && amount > 0) {
        items.push({
          code,
          name: TAX_FEE_NAMES[code] || `Tax ${code}`,
          amount,
          currency,
        });
        console.log("[OfferPriceParser] Parsed tax item:", { code, name: TAX_FEE_NAMES[code], amount, currency });
      }
    }

    return items;
  }

  /**
   * Parse Fee elements directly from Price element
   * Jetstar format: <Price><Fee><Amount CurCode="AUD">22.00</Amount><DescText>TRAVEL_FEE - Indirect Markup</DescText><DesigText>IIM</DesigText></Fee>...</Price>
   */
  private parseFeeItemsFromPrice(priceEl: Element): TaxFeeItem[] {
    const items: TaxFeeItem[] = [];
    const feeElements = this.getElements(priceEl, "Fee");

    console.log("[OfferPriceParser] parseFeeItemsFromPrice: found", feeElements.length, "Fee elements");

    for (const feeEl of feeElements) {
      // Get fee code from DesigText (e.g., IIM, L7, OP, SG, WY)
      const code = this.getText(feeEl, "DesigText") ||
                   this.getText(feeEl, "FeeCode") ||
                   this.getAttribute(feeEl, "Code") || "";

      // Get description from DescText
      const descText = this.getText(feeEl, "DescText") || "";

      // Get amount
      let amount = 0;
      let currency = "AUD";

      const amountEl = this.getElement(feeEl, "Amount");
      if (amountEl) {
        amount = parseFloat(amountEl.textContent?.trim() || "0");
        currency = this.getAttribute(amountEl, "CurCode") || "AUD";
      }

      // Only add if we have valid amount
      if (!isNaN(amount) && amount > 0) {
        // Use DescText as name if available, otherwise use TAX_FEE_NAMES mapping
        const name = descText || TAX_FEE_NAMES[code] || `Fee ${code}`;
        items.push({
          code: code || "FEE",
          name,
          amount,
          currency,
        });
        console.log("[OfferPriceParser] Parsed fee item:", { code, name, amount, currency });
      }
    }

    return items;
  }

  /**
   * Parse total price with currency - handles Jetstar nested structure
   * Jetstar uses: <TotalPrice><TotalAmount>123.45</TotalAmount><CurCode>AUD</CurCode></TotalPrice>
   */
  private parseTotalPrice(element: Element | null): { value: number; currency: string } | null {
    if (!element) return null;

    // Try to get amount from nested TotalAmount first (Jetstar format)
    let amountText = this.getText(element, "TotalAmount");
    let currencyCode = this.getText(element, "CurCode");

    // Also try Amount element (alternative format)
    if (!amountText) {
      amountText = this.getText(element, "Amount");
    }

    // If not nested, try direct text content
    if (!amountText) {
      amountText = element.textContent?.trim() || "0";
    }

    // Try to get currency from attribute if not found as element
    if (!currencyCode) {
      currencyCode = this.getAttribute(element, "CurCode") ||
                     this.getAttribute(element, "Code") ||
                     this.getText(element, "Code") ||
                     "AUD";
    }

    const value = parseFloat(amountText);
    console.log("[OfferPriceParser] parseTotalPrice:", { amountText, currencyCode, value });
    return { value: isNaN(value) ? 0 : value, currency: currencyCode };
  }

  private parsePricedOffers(doc: Document): Offer[] {
    const offers: Offer[] = [];

    // Try multiple element names that Jetstar might use
    let offerElements = this.getElements(doc, "PricedOffer");
    if (offerElements.length === 0) {
      offerElements = this.getElements(doc, "Offer");
    }
    // Also check Response/PricedOffer path
    if (offerElements.length === 0) {
      const responseEl = this.getElement(doc, "Response");
      if (responseEl) {
        offerElements = this.getElements(responseEl, "PricedOffer");
        if (offerElements.length === 0) {
          offerElements = this.getElements(responseEl, "Offer");
        }
      }
    }

    console.log("[OfferPriceParser] Found offer elements:", offerElements.length);

    for (const offerEl of offerElements) {
      // Try multiple ways to get offer ID
      const offerId = this.getAttribute(offerEl, "OfferID") ||
                      this.getText(offerEl, "OfferID") ||
                      this.getText(offerEl, "OfferRefID") || "";
      const ownerCode = this.getAttribute(offerEl, "Owner") ||
                        this.getText(offerEl, "OwnerCode") ||
                        this.getText(offerEl, "Owner") || "JQ";

      const responseId = this.getText(offerEl, "ResponseID") ||
                         this.getAttribute(offerEl, "ResponseID") || undefined;

      // Try multiple element names for total price
      let totalAmountEl = this.getElement(offerEl, "TotalPrice");
      if (!totalAmountEl) totalAmountEl = this.getElement(offerEl, "TotalAmount");
      if (!totalAmountEl) totalAmountEl = this.getElement(offerEl, "Price");

      const totalPrice = this.parseTotalPrice(totalAmountEl) || { value: 0, currency: "AUD" };
      console.log("[OfferPriceParser] Offer total price:", totalPrice);

      // Parse OfferItems
      let offerItemElements = this.getElements(offerEl, "OfferItem");
      // Also try PricedOfferItem
      if (offerItemElements.length === 0) {
        offerItemElements = this.getElements(offerEl, "PricedOfferItem");
      }

      const offerItems: OfferItem[] = offerItemElements.map(itemEl => {
        const itemId = this.getAttribute(itemEl, "OfferItemID") ||
                       this.getText(itemEl, "OfferItemID") ||
                       this.getText(itemEl, "OfferItemRefID") || "";

        // Jetstar OfferPrice uses FareDetail/Price structure (like your Postman script)
        const fareDetailEl = this.getElement(itemEl, "FareDetail");
        let priceEl = fareDetailEl ? this.getElement(fareDetailEl, "Price") : null;

        // Also try direct Price element in OfferItem (alternative Jetstar format)
        // <OfferItem><Price><Fee>...</Fee><TotalAmount>...</TotalAmount></Price></OfferItem>
        if (!priceEl) {
          priceEl = this.getElement(itemEl, "Price");
        }

        // Also try UnitPrice as fallback
        const unitPriceEl = this.getElement(itemEl, "UnitPrice");

        // Extract BaseAmount - try FareDetail/Price first, then UnitPrice
        let baseAmountEl = priceEl ? this.getElement(priceEl, "BaseAmount") : null;
        if (!baseAmountEl && unitPriceEl) baseAmountEl = this.getElement(unitPriceEl, "BaseAmount");
        if (!baseAmountEl) baseAmountEl = this.getElement(itemEl, "BaseAmount");

        // Extract TaxAmount from TaxSummary/TotalTaxAmount (Jetstar format)
        let taxAmount: { value: number; currency: string } | null = null;
        let individualTaxes: TaxFeeItem[] = [];
        const taxSummaryEl = priceEl ? this.getElement(priceEl, "TaxSummary") : null;
        if (taxSummaryEl) {
          const totalTaxEl = this.getElement(taxSummaryEl, "TotalTaxAmount");
          taxAmount = this.parseTotalPrice(totalTaxEl);

          // Parse individual Tax elements from TaxSummary
          // Jetstar format: <Tax><TaxCode>WG</TaxCode><Amount CurCode="AUD">4.82</Amount></Tax>
          individualTaxes = this.parseTaxItemsFromSummary(taxSummaryEl);
        }

        // Also parse Fee elements directly from Price element
        // Jetstar format: <Price><Fee><Amount>22.00</Amount><DescText>...</DescText><DesigText>IIM</DesigText></Fee>...</Price>
        if (priceEl) {
          const feeItems = this.parseFeeItemsFromPrice(priceEl);
          individualTaxes = [...individualTaxes, ...feeItems];
        }

        // Fallback to other tax elements
        if (!taxAmount) {
          let taxAmountEl = unitPriceEl ? this.getElement(unitPriceEl, "TaxAmount") : null;
          if (!taxAmountEl) taxAmountEl = this.getElement(itemEl, "TaxAmount");
          if (!taxAmountEl) taxAmountEl = this.getElement(itemEl, "Taxes");
          taxAmount = this.parseTotalPrice(taxAmountEl);
        }

        // Extract TotalAmount - try FareDetail/Price first
        let itemAmountEl = priceEl ? this.getElement(priceEl, "TotalAmount") : null;
        if (!itemAmountEl && unitPriceEl) itemAmountEl = this.getElement(unitPriceEl, "TotalAmount");
        if (!itemAmountEl) itemAmountEl = this.getElement(itemEl, "TotalAmount");
        if (!itemAmountEl) itemAmountEl = this.getElement(itemEl, "Price");
        if (!itemAmountEl) itemAmountEl = this.getElement(itemEl, "TotalPrice");

        const itemTotal = this.parseTotalPrice(itemAmountEl);
        const itemBase = this.parseTotalPrice(baseAmountEl);

        // Get segment references from Service element
        let segmentRefIds: string[] = [];
        const serviceEl = this.getElement(itemEl, "Service");
        if (serviceEl) {
          const journeyRefEl = this.getElement(serviceEl, "PaxJourneyRefID");
          if (journeyRefEl) {
            segmentRefIds.push(journeyRefEl.textContent?.trim() || "");
          }
        }

        console.log("[OfferPriceParser] OfferItem:", {
          itemId,
          total: itemTotal,
          base: itemBase,
          tax: taxAmount,
          hasFareDetail: !!fareDetailEl,
          hasPrice: !!priceEl,
          segmentRefIds,
          feesCount: individualTaxes.length,
          feesCodes: individualTaxes.map(t => t.code),
        });

        // Get paxRefIds - try FareDetail first (Jetstar), then direct, then Service
        let paxRefIds: string[] = [];

        // Try FareDetail/PaxRefID first (Jetstar OfferPrice structure)
        if (fareDetailEl) {
          const fareDetailPaxRefs = this.getElements(fareDetailEl, "PaxRefID")
            .map(el => el.textContent?.trim() || "")
            .filter(id => id.length > 0);
          paxRefIds.push(...fareDetailPaxRefs);
        }

        // Fallback: direct PaxRefID elements
        if (paxRefIds.length === 0) {
          const directPaxRefs = this.getElements(itemEl, "PaxRefID")
            .map(el => el.textContent?.trim() || "")
            .filter(id => id.length > 0);
          paxRefIds.push(...directPaxRefs);
        }

        // Also check Service/PaxRefID
        if (paxRefIds.length === 0 && serviceEl) {
          const servicePaxRef = this.getText(serviceEl, "PaxRefID");
          if (servicePaxRef) paxRefIds.push(servicePaxRef);
        }

        // Deduplicate
        paxRefIds = [...new Set(paxRefIds)];

        console.log("[OfferPriceParser] OfferItem paxRefIds:", paxRefIds);
        console.log("[OfferPriceParser] OfferItem individualTaxes:", individualTaxes);

        return {
          offerItemId: itemId,
          paxRefIds,
          baseAmount: itemBase || undefined,
          taxAmount: taxAmount || undefined,
          totalAmount: itemTotal || { value: 0, currency: "AUD" },
          fareBasisCode: this.getText(itemEl, "FareBasisCode") ||
                         (fareDetailEl ? this.getText(fareDetailEl, "FareBasisCode") : undefined) || undefined,
          segmentRefIds: segmentRefIds.length > 0 ? segmentRefIds : undefined,
          taxItems: individualTaxes.length > 0 ? individualTaxes : undefined,
        };
      });

      console.log(`[OfferPriceParser] ========== OFFER ${offerId} TOTAL PRICE ==========`);
      console.log(`[OfferPriceParser] Total price from XML: ${totalPrice.value.toFixed(2)} ${totalPrice.currency}`);
      console.log(`[OfferPriceParser] Number of offer items: ${offerItems.length}`);

      const fareItemsSum = offerItems
        .filter(item => item.fareBasisCode && item.baseAmount && item.baseAmount.value > 0)
        .reduce((sum, item) => sum + (item.totalAmount?.value || 0), 0);
      const bundleItemsSum = offerItems
        .filter(item => !item.fareBasisCode || !item.baseAmount || item.baseAmount.value === 0)
        .reduce((sum, item) => sum + (item.totalAmount?.value || 0), 0);

      console.log(`[OfferPriceParser] Fare items total: ${fareItemsSum.toFixed(2)} ${totalPrice.currency}`);
      console.log(`[OfferPriceParser] Bundle/service items total: ${bundleItemsSum.toFixed(2)} ${totalPrice.currency}`);
      console.log(`[OfferPriceParser] Sum check: ${fareItemsSum.toFixed(2)} + ${bundleItemsSum.toFixed(2)} = ${(fareItemsSum + bundleItemsSum).toFixed(2)}`);

      // CRITICAL LOGIC: Determine if we need to add a la carte items to the XML TotalPrice
      //
      // Jetstar's behavior:
      // - After AirShopping (with bundles): XML TotalPrice INCLUDES bundles (which have baseAmount > 0)
      // - After SeatSelection (with seats): XML TotalPrice does NOT include seats (which have baseAmount = 0, totalAmount > 0)
      //
      // Strategy: Separate "bundleItems" into:
      // 1. Fare-included bundles: items with baseAmount > 0 (already in XML total)
      // 2. True ancillaries (seats/meals): items with baseAmount = 0 but totalAmount > 0 (NOT in XML total)

      const xmlTotal = totalPrice.value;
      const fareOnly = fareItemsSum;

      // REVERT TO SIMPLE LOGIC: Just use XML total as-is
      // Jetstar ALWAYS includes everything in the XML TotalPrice
      let finalTotal = xmlTotal;

      console.log(`[OfferPriceParser] ✅ Using XML TotalPrice as-is: $${finalTotal.toFixed(2)}`);
      console.log(`[OfferPriceParser]    Fares: $${fareOnly.toFixed(2)}`);
      console.log(`[OfferPriceParser]    Bundles/Services: $${bundleItemsSum.toFixed(2)}`);
      console.log(`[OfferPriceParser]    Total from items: $${(fareItemsSum + bundleItemsSum).toFixed(2)}`);

      console.log(`[OfferPriceParser] ================================================================`);

      offers.push({
        offerId,
        ownerCode,
        responseId,
        totalPrice: {
          value: finalTotal,
          currency: totalPrice.currency,
        },
        offerItems,
      });
    }

    return offers;
  }
}

export const offerPriceParser = new OfferPriceParser();