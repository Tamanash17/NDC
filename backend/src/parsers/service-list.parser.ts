// ============================================================================
// SERVICE LIST RESPONSE PARSER - Jetstar NDC 21.3 Format
// Based on Jetstar NDC API Postman collection response processor
// ============================================================================

import { BaseXmlParser } from "./base.parser.js";
import type { ServiceDefinition, AncillaryOffer, ServiceType } from "../types/ndc.types.js";
import type { ServiceListResponseData, ServiceListSegment, ServiceListJourney } from "../types/api.types.js";

export interface ServiceListParseResult extends ServiceListResponseData {
  success: boolean;
  errors?: Array<{ code: string; message: string }>;
}

export interface ParsedOfferItem {
  offerItemId: string;
  serviceDefinitionRefId: string;
  price: number;
  currency: string;
  paxRefIds: string[];
  segmentRefIds: string[];
  journeyRefIds: string[];
  legRefIds: string[];
  serviceType: 'segment' | 'journey' | 'leg' | 'unknown';
}

// Extended ServiceDefinition with bundle inclusion refs
interface ExtendedServiceDefinition extends ServiceDefinition {
  includedServiceRefIds?: string[];  // For bundles: refs to included services
}

export class ServiceListParser extends BaseXmlParser {
  parse(xml: string): ServiceListParseResult {
    const doc = this.parseXml(xml);

    // ============================================================================
    // IMPORTANT FIX (2026-01-09): Jetstar ServiceList warnings vs fatal errors
    // ============================================================================
    // Jetstar may include Error elements in the XML for WARNINGS about specific
    // bundles or services (e.g., "Error encountered calling SSRs for service bundle M202")
    // while still returning valid service data for other bundles/services.
    //
    // We should NOT treat these as fatal errors if we successfully received services.
    // Only treat as fatal error if we have NO services at all.
    //
    // Example: ServiceList for bundle M202 may have a warning error, but still returns
    // 71 other services successfully. We should return success=true with warnings.
    // ============================================================================

    // Parse service definitions from DataLists (do this FIRST to check if we got data)
    const services = this.parseServiceDefinitions(doc);

    // Parse ALaCarteOffer items with pricing and associations
    const ancillaryOffers = this.parseALaCarteOffers(doc, services);

    // Parse segments and journeys from DataLists for direction detection
    const segments = this.parseSegments(doc);
    const journeys = this.parseJourneys(doc);

    console.log('[ServiceListParser] Parsed segments:', segments.length, segments.map(s => `${s.segmentId}: ${s.origin}-${s.destination}`));
    console.log('[ServiceListParser] Parsed journeys:', journeys.length, journeys.map(j => `${j.journeyId}: [${j.segmentRefIds.join(',')}]`));

    // Collect any errors/warnings from the response
    const errors = this.extractErrors(doc);
    const errorElement = this.getElement(doc, "Error");
    if (errorElement) {
      const typeCode = this.getText(errorElement, "TypeCode") || "UNKNOWN";
      const descText = this.getText(errorElement, "DescText") || "Unknown error";
      errors.push({ code: typeCode, message: descText });
    }

    // Determine success: if we got services OR ancillary offers, it's a success (even with warnings)
    // Only fail if we got NO data at all AND there are errors
    const hasData = services.length > 0 || ancillaryOffers.length > 0;
    const success = hasData || errors.length === 0;

    if (!success) {
      console.warn('[ServiceListParser] ServiceList failed - no data and errors present:', errors);
    } else if (errors.length > 0) {
      console.warn('[ServiceListParser] ServiceList succeeded with warnings:', errors);
    }

    return {
      success,
      services,
      ancillaryOffers,
      segments,
      journeys,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  /**
   * Parse ServiceDefinition elements from DataLists
   * For bundles: also parse ServiceBundle/ServiceDefinitionRefID to get included services
   */
  private parseServiceDefinitions(doc: Document): ExtendedServiceDefinition[] {
    const services: ExtendedServiceDefinition[] = [];

    // Look for ServiceDefinition in DataLists/ServiceDefinitionList
    const serviceElements = this.getElements(doc, "ServiceDefinition");

    for (const svcEl of serviceElements) {
      // Get ServiceDefinitionID attribute or element
      const serviceId =
        svcEl.getAttribute("ServiceDefinitionID") ||
        this.getText(svcEl, "ServiceDefinitionID") ||
        "";

      const serviceCode = this.getText(svcEl, "ServiceCode") || "";
      const serviceName = this.getText(svcEl, "Name") || "";
      const description = this.getText(svcEl, "Description") || undefined;

      // RFIC and RFISC for SSR identification
      const rfic = this.getText(svcEl, "RFIC") || "";
      const rfisc = this.getText(svcEl, "RFISC") || "";

      const serviceType = this.determineServiceType(serviceCode, serviceName, rfic);

      // Check for ServiceBundle element (bundles contain references to their inclusions)
      const serviceBundleEl = this.getElement(svcEl, "ServiceBundle");
      let includedServiceRefIds: string[] | undefined;

      if (serviceBundleEl) {
        // Parse ServiceDefinitionRefID elements within ServiceBundle
        const refElements = this.getElements(serviceBundleEl, "ServiceDefinitionRefID");
        includedServiceRefIds = refElements
          .map(el => el.textContent?.trim() || "")
          .filter(id => id.length > 0);

        if (includedServiceRefIds.length > 0) {
          console.log(`[ServiceListParser] Bundle ${serviceCode} has ${includedServiceRefIds.length} inclusions: ${includedServiceRefIds.join(', ')}`);
        }
      }

      services.push({
        serviceId,
        serviceCode,
        serviceName,
        serviceType,
        description,
        rfic,
        rfisc,
        includedServiceRefIds,
      });
    }

    return services;
  }

  /**
   * Determine service type from code, name, and RFIC
   */
  private determineServiceType(code: string, name: string, rfic: string): ServiceType {
    // SSR services have RFIC = 'P'
    if (rfic === "P") return "SSR";

    // Known seat-related SSR codes (UPFX, LEGX, JLSF) don't have RFIC='P' but are SSRs
    const SEAT_SSR_CODES = ['UPFX', 'LEGX', 'JLSF'];
    if (SEAT_SSR_CODES.includes(code.toUpperCase())) return "SSR";

    const combined = (code + " " + name).toUpperCase();

    // Baggage
    if (combined.includes("BAG") || combined.includes("LUGGAGE") || combined.includes("KG")) {
      return "BAGGAGE";
    }

    // Seat
    if (combined.includes("SEAT")) return "SEAT";

    // Meals
    if (combined.includes("MEAL") || combined.includes("FOOD") || combined.includes("SNACK")) {
      return "MEAL";
    }

    // Lounge
    if (combined.includes("LOUNGE")) return "LOUNGE";

    // Insurance
    if (combined.includes("INSURANCE") || combined.includes("INS")) return "INSURANCE";

    // Bundle detection
    if (combined.includes("BUNDLE") || combined.includes("PLUS") ||
        combined.includes("MAX") || combined.includes("STARTER") ||
        /^[PSMB]\d{3}$/.test(code)) {
      return "BUNDLE";
    }

    return "OTHER";
  }

  /**
   * Parse ALaCarteOffer and its OfferItem elements
   * CRITICAL FIX (2026-01-11): Group bundles by serviceCode and build per-passenger offerItemId mapping
   * Bundles have separate offerItemIds for each passenger type (ADT, CHD, INF) but share the same serviceCode.
   * We must group them and provide paxOfferItemIds mapping for OfferPrice to work correctly.
   *
   * 2026-01-17: Now also includes includedServiceRefIds for bundles to map inclusions to specific bundles
   */
  private parseALaCarteOffers(doc: Document, serviceDefinitions: ExtendedServiceDefinition[]): AncillaryOffer[] {
    const offers: AncillaryOffer[] = [];

    // Get ALL ALaCarteOffer elements (there can be multiple - one per flight)
    const aLaCarteOffers = this.getElements(doc, "ALaCarteOffer");
    if (!aLaCarteOffers || aLaCarteOffers.length === 0) {
      return offers;
    }

    console.log(`[ServiceListParser] Found ${aLaCarteOffers.length} ALaCarteOffer(s)`);

    // Process each ALaCarteOffer separately
    for (const aLaCarteOffer of aLaCarteOffers) {
      // Get the main offer ID for this ALaCarteOffer
      const mainOfferId = this.getText(aLaCarteOffer, "OfferID") || "";
      const offerIdElement = this.getElement(aLaCarteOffer, "OfferID");
      const ownerCode = offerIdElement?.getAttribute("Owner") || "JQ";

      console.log(`[ServiceListParser] Processing ALaCarteOffer: ${mainOfferId}`);

    // Get all OfferItem elements
    const offerItems = this.getElements(aLaCarteOffer, "OfferItem");

    // First pass: collect all items with their metadata
    interface ItemData {
      offerItemId: string;
      serviceDefRefId: string;
      serviceDef?: ExtendedServiceDefinition;
      price: number;
      currency: string;
      paxRefIds: string[];
      segmentRefIds: string[];
      journeyRefIds: string[];
      legRefIds: string[];
      associationType: 'segment' | 'journey' | 'leg' | 'unknown';
    }

    const allItems: ItemData[] = [];

    for (const itemEl of offerItems) {
      const offerItemId = this.getText(itemEl, "OfferItemID") || "";

      // Get service reference
      const serviceEl = this.getElement(itemEl, "Service");
      const serviceDefinitionRefId = serviceEl ? this.getText(serviceEl, "ServiceDefinitionRefID") || "" : "";

      // Find matching service definition
      const serviceDef = serviceDefinitions.find(s => s.serviceId === serviceDefinitionRefId);

      // Parse price from UnitPrice/TotalAmount
      const unitPriceEl = this.getElement(itemEl, "UnitPrice");
      const { price, currency } = this.parseUnitPrice(unitPriceEl);

      // Parse eligibility (passenger and flight associations)
      const eligibilityEl = this.getElement(itemEl, "Eligibility");
      const { paxRefIds, segmentRefIds, journeyRefIds, legRefIds, associationType } =
        this.parseEligibility(eligibilityEl);

      allItems.push({
        offerItemId,
        serviceDefRefId: serviceDefinitionRefId,
        serviceDef,
        price,
        currency,
        paxRefIds,
        segmentRefIds,
        journeyRefIds,
        legRefIds,
        associationType,
      });
    }

    // Second pass: Group bundles by serviceCode+journeyRefs, keep non-bundles as-is
    const bundleGroups = new Map<string, ItemData[]>();  // Key: serviceCode+journeyRefs
    const nonBundles: ItemData[] = [];

    // Debug: Check for seat SSR codes
    const SEAT_SSR_CODES = ['UPFX', 'LEGX', 'JLSF'];
    for (const item of allItems) {
      const code = item.serviceDef?.serviceCode || '';
      if (SEAT_SSR_CODES.includes(code.toUpperCase())) {
        console.log(`[ServiceListParser] 🎯 Found seat SSR in allItems: ${code}`, {
          serviceType: item.serviceDef?.serviceType,
          offerItemId: item.offerItemId,
          paxRefIds: item.paxRefIds,
          segmentRefIds: item.segmentRefIds,
        });
      }
    }

    for (const item of allItems) {
      const serviceType = item.serviceDef?.serviceType;

      if (serviceType === 'BUNDLE') {
        // Group bundles by serviceCode + journeyRefs combination
        const serviceCode = item.serviceDef?.serviceCode || '';
        const journeyKey = item.journeyRefIds.sort().join(',');
        const groupKey = `${serviceCode}|${journeyKey}`;

        if (!bundleGroups.has(groupKey)) {
          bundleGroups.set(groupKey, []);
        }
        bundleGroups.get(groupKey)!.push(item);
      } else {
        // Non-bundle services - keep as individual offers
        nonBundles.push(item);
      }
    }

    // Build grouped bundle offers WITHOUT per-passenger mappings
    // ServiceList bundles are JOURNEY-BASED: ONE offerItemId for ALL paying passengers
    for (const [groupKey, items] of bundleGroups.entries()) {
      if (items.length === 0) continue;

      // ServiceList returns bundles where ALL passengers are in the SAME OfferItem
      // Unlike AirShopping which provides different offerItemIds per passenger type,
      // ServiceList uses ONE offerItemId for ALL paying passengers (ADT, CHD)
      // Infants (INF) are typically excluded from bundles

      // All items should have the same offerItemId since they represent the same bundle
      // Just use the first item's data
      const bundleItem = items[0];

      // Collect ALL passenger refs from all items (should be the same across items)
      const allPaxRefIds: string[] = [];
      for (const item of items) {
        for (const paxRefId of item.paxRefIds) {
          if (!allPaxRefIds.includes(paxRefId)) {
            allPaxRefIds.push(paxRefId);
          }
        }
      }

      console.log(`[ServiceListParser] Bundle ${bundleItem.serviceDef?.serviceCode}:`, {
        offerId: mainOfferId,
        offerItemId: bundleItem.offerItemId,
        passengers: allPaxRefIds.join(','),
        journeyRefs: bundleItem.journeyRefIds.join(',') || 'NONE',
        segmentRefs: bundleItem.segmentRefIds.join(',') || 'NONE',
        legRefs: bundleItem.legRefIds.join(',') || 'NONE',
        associationType: bundleItem.associationType,
      });

      // SANITY CHECK: Bundles should have ALaCarteOffer ID (no -o-X suffix), not flight offer ID
      if (mainOfferId.includes('-o-')) {
        console.error(`[ServiceListParser] ⚠️  BUG DETECTED: Bundle ${bundleItem.serviceDef?.serviceCode} has FLIGHT offer ID instead of ALaCarteOffer ID!`);
        console.error(`[ServiceListParser]     offerId: ${mainOfferId} (should NOT contain '-o-')`);
      }

      offers.push({
        offerId: mainOfferId,
        offerItemId: bundleItem.offerItemId,  // ONE offerItemId for ALL passengers
        ownerCode,
        serviceRefId: bundleItem.serviceDefRefId,
        serviceName: bundleItem.serviceDef?.serviceName || "",
        serviceCode: bundleItem.serviceDef?.serviceCode || "",
        serviceType: bundleItem.serviceDef?.serviceType || "OTHER",
        paxRefIds: allPaxRefIds,  // All paying passengers
        segmentRefIds: bundleItem.segmentRefIds,
        journeyRefIds: bundleItem.journeyRefIds,
        legRefIds: bundleItem.legRefIds,
        associationType: bundleItem.associationType,
        price: { value: bundleItem.price, currency: bundleItem.currency },
        // Include bundle inclusion refs so frontend can map inclusions to specific bundles
        includedServiceRefIds: bundleItem.serviceDef?.includedServiceRefIds,
        // DO NOT include paxOfferItemIds - ServiceList bundles use ONE offerItemId for all
      });
    }

    // Add non-bundle services (no grouping needed)
    console.log(`[ServiceListParser] Non-bundles count: ${nonBundles.length}`);
    const seatSSRsInNonBundles = nonBundles.filter(item =>
      SEAT_SSR_CODES.includes((item.serviceDef?.serviceCode || '').toUpperCase())
    );
    console.log(`[ServiceListParser] Seat SSRs in nonBundles: ${seatSSRsInNonBundles.length}`,
      seatSSRsInNonBundles.map(i => i.serviceDef?.serviceCode));

    for (const item of nonBundles) {
      offers.push({
        offerId: mainOfferId,
        offerItemId: item.offerItemId,
        ownerCode,
        serviceRefId: item.serviceDefRefId,
        serviceName: item.serviceDef?.serviceName || "",
        serviceCode: item.serviceDef?.serviceCode || "",
        serviceType: item.serviceDef?.serviceType || "OTHER",
        paxRefIds: item.paxRefIds,
        segmentRefIds: item.segmentRefIds,
        journeyRefIds: item.journeyRefIds,
        legRefIds: item.legRefIds,
        associationType: item.associationType,
        price: { value: item.price, currency: item.currency },
      });
    }

      console.log(`[ServiceListParser] ALaCarteOffer ${mainOfferId}: Parsed ${offers.length} offers from this ALaCarteOffer`);
    } // End of for loop over aLaCarteOffers

    console.log(`[ServiceListParser] Total parsed offers: ${offers.length}`);
    return offers;
  }

  /**
   * Parse UnitPrice element to extract price and currency
   */
  private parseUnitPrice(unitPriceEl: Element | null): { price: number; currency: string } {
    if (!unitPriceEl) {
      return { price: 0, currency: "AUD" };
    }

    const totalAmountEl = this.getElement(unitPriceEl, "TotalAmount");
    if (!totalAmountEl) {
      return { price: 0, currency: "AUD" };
    }

    // Currency can be in CurCode attribute
    const currency = totalAmountEl.getAttribute("CurCode") || "AUD";

    // Price value is the text content
    const priceText = totalAmountEl.textContent?.trim() || "0";
    const price = parseFloat(priceText) || 0;

    return { price, currency };
  }

  /**
   * Parse Eligibility element for passenger and flight associations
   */
  private parseEligibility(eligibilityEl: Element | null): {
    paxRefIds: string[];
    segmentRefIds: string[];
    journeyRefIds: string[];
    legRefIds: string[];
    associationType: 'segment' | 'journey' | 'leg' | 'unknown';
  } {
    const result = {
      paxRefIds: [] as string[],
      segmentRefIds: [] as string[],
      journeyRefIds: [] as string[],
      legRefIds: [] as string[],
      associationType: 'unknown' as 'segment' | 'journey' | 'leg' | 'unknown',
    };

    if (!eligibilityEl) {
      return result;
    }

    // Parse PaxRefID elements (passenger eligibility)
    const paxRefElements = this.getElements(eligibilityEl, "PaxRefID");
    result.paxRefIds = paxRefElements
      .map(el => el.textContent?.trim() || "")
      .filter(id => id.length > 0);

    // Parse OfferFlightAssociations
    const flightAssoc = this.getElement(eligibilityEl, "OfferFlightAssociations");
    if (!flightAssoc) {
      return result;
    }

    // Check for PaxJourneyRef (journey-based services like bundles)
    const paxJourneyRef = this.getElement(flightAssoc, "PaxJourneyRef");
    if (paxJourneyRef) {
      const journeyRefElements = this.getElements(paxJourneyRef, "PaxJourneyRefID");
      result.journeyRefIds = journeyRefElements
        .map(el => el.textContent?.trim() || "")
        .filter(id => id.length > 0);
      result.associationType = 'journey';
    }

    // Check for PaxSegmentReferences (segment-based services like baggage)
    const paxSegmentRefs = this.getElement(flightAssoc, "PaxSegmentReferences");
    if (paxSegmentRefs) {
      const segmentRefElements = this.getElements(paxSegmentRefs, "PaxSegmentRefID");
      result.segmentRefIds = segmentRefElements
        .map(el => el.textContent?.trim() || "")
        .filter(id => id.length > 0);
      result.associationType = 'segment';
    }

    // Check for DatedOperatingLegRef (leg-based services like meals)
    const legRef = this.getElement(flightAssoc, "DatedOperatingLegRef");
    if (legRef) {
      const legRefElements = this.getElements(legRef, "DatedOperatingLegRefID");
      result.legRefIds = legRefElements
        .map(el => el.textContent?.trim() || "")
        .filter(id => id.length > 0);
      result.associationType = 'leg';
    }

    return result;
  }

  /**
   * Parse PaxSegmentList from DataLists - contains segment origin/destination for direction detection
   */
  private parseSegments(doc: Document): ServiceListSegment[] {
    const segments: ServiceListSegment[] = [];

    // Look for PaxSegment elements in DataLists/PaxSegmentList
    const segmentElements = this.getElements(doc, "PaxSegment");

    for (const segEl of segmentElements) {
      // Get segment ID from attribute or element
      const segmentId =
        segEl.getAttribute("PaxSegmentID") ||
        this.getText(segEl, "PaxSegmentID") ||
        "";

      if (!segmentId) continue;

      // Debug: log the segment element structure
      console.log(`[ServiceListParser] Segment ${segmentId} element children:`,
        Array.from(segEl.childNodes).filter(n => n.nodeType === 1).map((n: any) => n.tagName || n.nodeName).join(', '));

      // Get departure info - try multiple possible element names
      let depEl = this.getElement(segEl, "Dep");
      if (!depEl) depEl = this.getElement(segEl, "Departure");
      const origin = depEl ? (this.getText(depEl, "IATA_LocationCode") || this.getText(depEl, "AirportCode") || "") : "";
      const departureDate = depEl ? (this.getText(depEl, "AircraftScheduledDateTime") || this.getText(depEl, "Date") || "") : "";

      // Get arrival info
      const arrEl = this.getElement(segEl, "Arrival");
      const destination = arrEl ? this.getText(arrEl, "IATA_LocationCode") || "" : "";

      // Get marketing carrier info
      const marketingCarrierEl = this.getElement(segEl, "MarketingCarrierInfo");
      const carrier = marketingCarrierEl ? this.getText(marketingCarrierEl, "CarrierDesigCode") || "" : "";
      const flightNumber = marketingCarrierEl ? this.getText(marketingCarrierEl, "MarketingCarrierFlightNumberText") || "" : "";

      segments.push({
        segmentId,
        origin,
        destination,
        departureDate,
        carrier,
        flightNumber,
      });
    }

    return segments;
  }

  /**
   * Parse PaxJourneyList from DataLists - contains journey to segment mappings
   */
  private parseJourneys(doc: Document): ServiceListJourney[] {
    const journeys: ServiceListJourney[] = [];

    // Look for PaxJourney elements in DataLists/PaxJourneyList
    const journeyElements = this.getElements(doc, "PaxJourney");

    for (const journeyEl of journeyElements) {
      // Get journey ID from attribute or element
      const journeyId =
        journeyEl.getAttribute("PaxJourneyID") ||
        this.getText(journeyEl, "PaxJourneyID") ||
        "";

      if (!journeyId) continue;

      // Get segment references
      const segmentRefElements = this.getElements(journeyEl, "PaxSegmentRefID");
      const segmentRefIds = segmentRefElements
        .map(el => el.textContent?.trim() || "")
        .filter(id => id.length > 0);

      journeys.push({
        journeyId,
        segmentRefIds,
      });
    }

    return journeys;
  }

  /**
   * Override error extraction to handle Jetstar error format
   */
  protected extractErrors(doc: Document): Array<{ code: string; message: string }> {
    const errors: Array<{ code: string; message: string }> = [];

    // Check for Error element in IATA_ServiceListRS
    const errorElements = this.getElements(doc, "Error");

    for (const errEl of errorElements) {
      const code = this.getText(errEl, "TypeCode") ||
                   this.getText(errEl, "Code") ||
                   "UNKNOWN";
      const message = this.getText(errEl, "DescText") ||
                      this.getText(errEl, "ShortText") ||
                      "Unknown error";
      errors.push({ code, message });
    }

    return errors;
  }
}

export const serviceListParser = new ServiceListParser();
