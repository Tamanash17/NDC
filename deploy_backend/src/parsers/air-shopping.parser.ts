// ============================================================================
// AIR SHOPPING RESPONSE PARSER
// Parses Jetstar NDC 21.3 AirShopping response format
// ============================================================================

import { BaseXmlParser } from "./base.parser.js";
import type { Offer, OfferItem, FlightSegment, PaxJourney, BundleOfferItem } from "../types/ndc.types.js";
import type { AirShoppingResponseData } from "../types/api.types.js";

// Bundle definition from ServiceDefinitionList
export interface BundleDefinition {
  serviceDefinitionId: string;
  serviceCode: string;
  name: string;
  description?: string;
  rfic: string;
  rfisc: string;
  // Inclusions referenced via ServiceBundle
  includedServiceRefIds?: string[];
}

// Service definition (for inclusions parsing)
export interface ServiceDefinition {
  serviceDefinitionId: string;
  serviceCode: string;
  name: string;
  description?: string;
  rfic: string;
  rfisc: string;
  serviceType: 'bundle' | 'baggage' | 'seat' | 'meal' | 'ancillary';
}

// ALaCarteOffer item with eligibility info
export interface ALaCarteOfferItem {
  offerItemId: string;
  serviceDefinitionRefId: string;
  price: { value: number; currency: string };
  paxRefIds: string[];
  journeyRefId?: string;  // Which journey this bundle applies to (first ref for backward compat)
  journeyRefIds?: string[];  // ALL journey refs this bundle applies to (for round trips)
  segmentRefIds?: string[];  // Which segments this bundle applies to
}

// PriceClass contains fare info (FareBasisCode, RBD, cabin)
export interface PriceClass {
  priceClassId: string;
  code: string;  // Price class code (e.g., "S" for Starter)
  name?: string;
  fareBasisCode?: string;
  cabinType?: string;
  rbd?: string;  // Reservation Booking Designator (class of service)
}

export interface AirShoppingParseResult extends AirShoppingResponseData {
  success: boolean;
  errors?: Array<{ code: string; message: string }>;
  bundleDefinitions?: BundleDefinition[];
  serviceDefinitions?: ServiceDefinition[];  // All service definitions (for inclusions)
  priceClasses?: PriceClass[];  // Fare classes with FareBasisCode, RBD
  alaCarteOfferId?: string;  // The ALaCarteOffer ID for bundle selection
}

export class AirShoppingParser extends BaseXmlParser {
  parse(xml: string): AirShoppingParseResult {
    const doc = this.parseXml(xml);

    if (this.hasErrors(doc)) {
      return {
        success: false,
        errors: this.extractErrors(doc),
        offers: [],
        dataLists: { paxJourneyList: [], paxSegmentList: [] },
      };
    }

    // Try to get ShoppingResponseID from standard locations
    let shoppingResponseId = this.getText(doc, "ShoppingResponseID") ||
                              this.getText(doc, "ResponseID") || undefined;

    // Jetstar embeds the shopping response ID in the offer IDs
    // Format: id-v2-{uuid}-o-{n} or id-v2-{uuid}-{uuid2}-{n}
    // We extract the first UUID as the shopping response ID
    if (!shoppingResponseId) {
      // Try to extract from first offer ID
      const firstOfferEl = this.getElement(doc, "Offer");
      const firstOfferId = firstOfferEl ?
        (this.getAttribute(firstOfferEl, "OfferID") || this.getText(firstOfferEl, "OfferID")) : null;

      if (firstOfferId) {
        // Extract UUID from offer ID pattern: id-v2-{uuid}-...
        const uuidMatch = firstOfferId.match(/id-v2-([a-f0-9-]{36})/i);
        if (uuidMatch) {
          shoppingResponseId = uuidMatch[1];
          console.log("[AirShoppingParser] Extracted shoppingResponseId from offerId:", shoppingResponseId);
        }
      }
    }

    console.log("[AirShoppingParser] Final shoppingResponseId:", shoppingResponseId);

    // Parse segments first so we can reference them in offers
    const segments = this.parseSegments(doc);

    // Parse ALL service definitions (including non-bundle services for inclusions)
    const { bundleDefinitions, serviceDefinitions } = this.parseServiceDefinitions(doc);

    // Parse PriceClasses (contains FareBasisCode, RBD)
    const priceClasses = this.parsePriceClasses(doc);

    // Parse ALaCarteOffer for bundle pricing (separate from main Offer elements)
    const { alaCarteOfferId, alaCarteItems } = this.parseALaCarteOffer(doc, bundleDefinitions);

    return {
      success: true,
      offers: this.parseOffers(doc, segments, bundleDefinitions, alaCarteItems, serviceDefinitions, priceClasses),
      dataLists: {
        paxJourneyList: this.parseJourneys(doc),
        paxSegmentList: segments,
      },
      shoppingResponseId,
      bundleDefinitions,
      serviceDefinitions,
      priceClasses,
      alaCarteOfferId,
    };
  }

  /**
   * Parse ALL service definitions from ServiceDefinitionList
   * Bundles are identified by RFIC=G, RFISC=0L8, and having ServiceBundle
   * Other services are categorized by RFIC code
   */
  private parseServiceDefinitions(doc: Document): {
    bundleDefinitions: BundleDefinition[],
    serviceDefinitions: ServiceDefinition[]
  } {
    const bundles: BundleDefinition[] = [];
    const services: ServiceDefinition[] = [];
    const serviceDefElements = this.getElements(doc, "ServiceDefinition");

    console.log(`[AirShoppingParser] Found ${serviceDefElements.length} ServiceDefinition elements`);

    for (const serviceEl of serviceDefElements) {
      const serviceDefinitionId = this.getText(serviceEl, "ServiceDefinitionID") || "";
      const serviceCode = this.getText(serviceEl, "ServiceCode") || "";
      const name = this.getText(serviceEl, "Name") || serviceCode;
      const rfic = this.getText(serviceEl, "RFIC") || "";
      const rfisc = this.getText(serviceEl, "RFISC") || "";

      // Get description from Desc/DescText
      const descEl = this.getElement(serviceEl, "Desc");
      const description = descEl ? this.getText(descEl, "DescText") : undefined;

      // Check if this is a bundle (has ServiceBundle element AND RFIC=G, RFISC=0L8)
      const serviceBundleEl = this.getElement(serviceEl, "ServiceBundle");
      const hasServiceBundle = serviceBundleEl !== null;
      const isBundle = rfic === "G" && rfisc === "0L8" && hasServiceBundle;

      // Determine service type based on RFIC code
      let serviceType: ServiceDefinition['serviceType'] = 'ancillary';
      if (isBundle) {
        serviceType = 'bundle';
      } else if (rfic === 'C') {
        serviceType = 'baggage';
      } else if (rfic === 'A') {
        serviceType = 'seat';
      } else if (rfic === 'F') {
        serviceType = 'meal';
      }

      // Add to services list
      services.push({
        serviceDefinitionId,
        serviceCode,
        name,
        description,
        rfic,
        rfisc,
        serviceType,
      });

      // If it's a bundle, parse inclusions from ServiceBundle
      if (isBundle && serviceBundleEl) {
        // Get included service references from ServiceBundle/ServiceDefinitionRefID
        const includedServiceRefIds = this.getElements(serviceBundleEl, "ServiceDefinitionRefID")
          .map(el => el.textContent?.trim() || "")
          .filter(id => id.length > 0);

        console.log(`[AirShoppingParser] Bundle ${serviceCode}: ${includedServiceRefIds.length} inclusions`);

        bundles.push({
          serviceDefinitionId,
          serviceCode,
          name,
          description,
          rfic,
          rfisc,
          includedServiceRefIds,
        });
      }
    }

    console.log(`[AirShoppingParser] Total bundles: ${bundles.length}, Total services: ${services.length}`);
    return { bundleDefinitions: bundles, serviceDefinitions: services };
  }

  /**
   * Parse PriceClassList for FareBasisCode, RBD, and cabin info
   */
  private parsePriceClasses(doc: Document): PriceClass[] {
    const priceClasses: PriceClass[] = [];
    const priceClassElements = this.getElements(doc, "PriceClass");

    for (const pcEl of priceClassElements) {
      const priceClassId = this.getText(pcEl, "PriceClassID") ||
                            this.getAttribute(pcEl, "PriceClassID") || "";
      const code = this.getText(pcEl, "Code") || "";
      const name = this.getText(pcEl, "Name") || undefined;
      const fareBasisCode = this.getText(pcEl, "FareBasisCode") || undefined;

      // Cabin type might be in CabinType/CabinTypeCode
      const cabinTypeEl = this.getElement(pcEl, "CabinType");
      const cabinType = cabinTypeEl ?
        this.getText(cabinTypeEl, "CabinTypeCode") : undefined;

      // RBD is sometimes in ClassOfService or RBD element
      const rbd = this.getText(pcEl, "ClassOfService") ||
                  this.getText(pcEl, "RBD") || undefined;

      if (priceClassId) {
        priceClasses.push({
          priceClassId,
          code,
          name,
          fareBasisCode,
          cabinType,
          rbd,
        });
      }
    }

    console.log(`[AirShoppingParser] Parsed ${priceClasses.length} PriceClasses`);
    return priceClasses;
  }

  /**
   * Parse ALaCarteOffer which contains bundle pricing
   * This is a separate offer structure at OffersGroup/CarrierOffers/ALaCarteOffer
   */
  private parseALaCarteOffer(doc: Document, bundleDefinitions: BundleDefinition[]): {
    alaCarteOfferId?: string;
    alaCarteItems: ALaCarteOfferItem[]
  } {
    const items: ALaCarteOfferItem[] = [];

    // Create a map for quick lookup of bundle definitions
    const bundleDefMap = new Map<string, BundleDefinition>();
    for (const def of bundleDefinitions) {
      bundleDefMap.set(def.serviceDefinitionId, def);
    }

    // Find ALaCarteOffer element - it's at OffersGroup/CarrierOffers/ALaCarteOffer
    const alaCarteOfferEl = this.getElement(doc, "ALaCarteOffer");
    if (!alaCarteOfferEl) {
      console.log(`[AirShoppingParser] No ALaCarteOffer found in response`);
      return { alaCarteItems: items };
    }

    const alaCarteOfferId = this.getText(alaCarteOfferEl, "OfferID") ||
                             this.getAttribute(alaCarteOfferEl, "OfferID") || undefined;
    console.log(`[AirShoppingParser] Found ALaCarteOffer with ID: ${alaCarteOfferId}`);

    // Parse OfferItem elements within ALaCarteOffer
    const offerItemElements = this.getElements(alaCarteOfferEl, "OfferItem");
    console.log(`[AirShoppingParser] Found ${offerItemElements.length} OfferItem elements in ALaCarteOffer`);

    for (const itemEl of offerItemElements) {
      const offerItemId = this.getAttribute(itemEl, "OfferItemID") ||
                          this.getText(itemEl, "OfferItemID") || "";

      // Get service reference - look for Service/ServiceDefinitionRefID
      const serviceEl = this.getElement(itemEl, "Service");
      const serviceDefRefId = serviceEl ?
        (this.getText(serviceEl, "ServiceDefinitionRefID") ||
         this.getAttribute(serviceEl, "ServiceDefinitionRefID") || "") : "";

      // Check if this is a bundle service
      const bundleDef = bundleDefMap.get(serviceDefRefId);
      if (!bundleDef) {
        // Not a bundle, skip
        continue;
      }

      console.log(`[AirShoppingParser] ALaCarteOffer OfferItem: id=${offerItemId}, serviceDefRef=${serviceDefRefId}, bundle=${bundleDef.serviceCode}`);

      // Parse price from UnitPrice/TotalAmount
      const unitPriceEl = this.getElement(itemEl, "UnitPrice");
      let priceValue = 0;
      let currency = "AUD";

      if (unitPriceEl) {
        const totalAmountEl = this.getElement(unitPriceEl, "TotalAmount");
        if (totalAmountEl) {
          priceValue = parseFloat(totalAmountEl.textContent?.trim() || "0");
          currency = this.getText(unitPriceEl, "CurCode") ||
                    this.getAttribute(totalAmountEl, "CurCode") || "AUD";
        }
      }
      console.log(`[AirShoppingParser] -> Price: ${priceValue} ${currency}`);

      // Get pax refs and deduplicate (Jetstar sometimes returns duplicates)
      const paxRefIds = [...new Set(
        this.getElements(itemEl, "PaxRefID")
          .map(el => el.textContent?.trim() || "")
          .filter(id => id.length > 0)
      )];

      // Get eligibility info - journey refs
      const eligibilityEl = this.getElement(itemEl, "Eligibility");
      let journeyRefId: string | undefined;
      let journeyRefIds: string[] | undefined;
      let segmentRefIds: string[] | undefined;

      if (eligibilityEl) {
        const flightAssocEl = this.getElement(eligibilityEl, "OfferFlightAssociations") ||
                              this.getElement(eligibilityEl, "FlightAssociations");
        if (flightAssocEl) {
          // Try PaxJourneyRef first (for journey-level bundles)
          // CRITICAL: Extract ALL PaxJourneyRefID elements (bundles can apply to multiple journeys)
          const journeyRefEl = this.getElement(flightAssocEl, "PaxJourneyRef");
          if (journeyRefEl) {
            const journeyRefs = this.getElements(journeyRefEl, "PaxJourneyRefID")
              .map(el => el.textContent?.trim() || "")
              .filter(id => id.length > 0);
            if (journeyRefs.length > 0) {
              journeyRefIds = journeyRefs;
              journeyRefId = journeyRefs[0];  // Keep first ref for backward compatibility
            }
          }

          // Also check segment refs
          const segRefs = this.getElements(flightAssocEl, "PaxSegmentRefID")
            .map(el => el.textContent?.trim() || "")
            .filter(id => id.length > 0);
          if (segRefs.length > 0) {
            segmentRefIds = segRefs;
          }
        }
      }

      console.log(`[AirShoppingParser] -> JourneyRef: ${journeyRefId}, JourneyRefs: ${journeyRefIds?.join(',') || 'none'}, SegmentRefs: ${segmentRefIds?.join(',') || 'none'}`);

      items.push({
        offerItemId,
        serviceDefinitionRefId: serviceDefRefId,
        price: { value: priceValue, currency },
        paxRefIds,
        journeyRefId,
        journeyRefIds,  // NEW: Array of all journey refs
        segmentRefIds,
      });
    }

    console.log(`[AirShoppingParser] Total ALaCarte bundle items parsed: ${items.length}`);
    return { alaCarteOfferId, alaCarteItems: items };
  }

  private parseOffers(doc: Document, segments: FlightSegment[], bundleDefinitions: BundleDefinition[], alaCarteItems: ALaCarteOfferItem[], serviceDefinitions: ServiceDefinition[], priceClasses: PriceClass[]): Offer[] {
    const offers: Offer[] = [];
    const offerElements = this.getElements(doc, "Offer");

    for (const offerEl of offerElements) {
      const offerId = this.getAttribute(offerEl, "OfferID") ||
                      this.getText(offerEl, "OfferID") ||
                      this.getAttribute(offerEl, "OfferRefID") || "";
      const ownerCode = this.getAttribute(offerEl, "Owner") ||
                        this.getText(offerEl, "OwnerCode") || "JQ";

      // Parse TotalPrice - Jetstar uses nested structure
      let totalAmountEl = this.getElement(offerEl, "TotalPrice");
      if (!totalAmountEl) totalAmountEl = this.getElement(offerEl, "TotalAmount");
      if (!totalAmountEl) totalAmountEl = this.getElement(offerEl, "Price");

      const totalPrice = this.parseTotalPrice(totalAmountEl) || { value: 0, currency: "AUD" };
      const expirationDateTime = this.getText(offerEl, "ExpirationDateTime") ||
                                  this.getText(offerEl, "TimeLimits") || undefined;

      // Create a map for price class lookup
      const priceClassMap = new Map<string, PriceClass>();
      for (const pc of priceClasses) {
        priceClassMap.set(pc.priceClassId, pc);
      }

      const offerItems: OfferItem[] = this.getElements(offerEl, "OfferItem").map(itemEl => {
        const itemId = this.getAttribute(itemEl, "OfferItemID") ||
                       this.getText(itemEl, "OfferItemID") ||
                       this.getAttribute(itemEl, "OfferItemRefID") || "";

        // Jetstar uses FareDetail/Price structure (like Postman script shows)
        const fareDetailEl = this.getElement(itemEl, "FareDetail");
        const fareDetailPriceEl = fareDetailEl ? this.getElement(fareDetailEl, "Price") : null;

        // Parse UnitPrice as fallback
        const unitPriceEl = this.getElement(itemEl, "UnitPrice");

        // Get TotalAmount - try FareDetail/Price first, then UnitPrice, then direct
        let itemAmountEl = fareDetailPriceEl ? this.getElement(fareDetailPriceEl, "TotalAmount") : null;
        if (!itemAmountEl && unitPriceEl) itemAmountEl = this.getElement(unitPriceEl, "TotalAmount");
        if (!itemAmountEl) itemAmountEl = this.getElement(itemEl, "TotalAmount");
        if (!itemAmountEl) itemAmountEl = this.getElement(itemEl, "Price");

        // Get BaseAmount - try FareDetail/Price first (Jetstar format per Postman script)
        let baseAmountEl = fareDetailPriceEl ? this.getElement(fareDetailPriceEl, "BaseAmount") : null;
        if (!baseAmountEl) baseAmountEl = this.getElement(itemEl, "BaseAmount");
        if (!baseAmountEl && unitPriceEl) baseAmountEl = this.getElement(unitPriceEl, "BaseAmount");

        // Get TaxAmount - try FareDetail/Price/TaxSummary/TotalTaxAmount first (Jetstar format)
        let taxAmountEl: Element | null = null;
        if (fareDetailPriceEl) {
          const taxSummaryEl = this.getElement(fareDetailPriceEl, "TaxSummary");
          if (taxSummaryEl) {
            taxAmountEl = this.getElement(taxSummaryEl, "TotalTaxAmount");
          }
        }
        if (!taxAmountEl) taxAmountEl = this.getElement(itemEl, "TaxAmount");
        if (!taxAmountEl) taxAmountEl = this.getElement(itemEl, "Taxes");
        if (!taxAmountEl && unitPriceEl) taxAmountEl = this.getElement(unitPriceEl, "Taxes");

        // Get pax refs - try FareDetail/PaxRefID first (Jetstar format per Postman script)
        let paxRefIds: string[] = [];
        if (fareDetailEl) {
          const fareDetailPaxRefs = this.getElements(fareDetailEl, "PaxRefID")
            .map(el => el.textContent?.trim() || "")
            .filter(id => id.length > 0);
          if (fareDetailPaxRefs.length > 0) {
            paxRefIds = [...new Set(fareDetailPaxRefs)];
          }
        }
        // Fallback to direct PaxRefID in OfferItem
        if (paxRefIds.length === 0) {
          paxRefIds = [...new Set(
            this.getElements(itemEl, "PaxRefID")
              .map(el => el.textContent?.trim() || "")
              .filter(id => id.length > 0)
          )];
        }

        // Get segment refs - Jetstar uses DatedMarketingSegmentRefID
        let segmentRefIds = this.getElements(itemEl, "DatedMarketingSegmentRefID")
          .map(el => el.textContent?.trim() || "")
          .filter(id => id.length > 0);

        // Fallback to PaxSegmentRefID
        if (segmentRefIds.length === 0) {
          segmentRefIds = this.getElements(itemEl, "PaxSegmentRefID")
            .map(el => el.textContent?.trim() || "")
            .filter(id => id.length > 0);
        }

        // Try to get FareBasisCode from direct element or from FareComponent/PriceClassRef
        let fareBasisCode = this.getText(itemEl, "FareBasisCode") ||
                            this.getText(itemEl, "FareCode") || undefined;
        let cabinType: string | undefined;
        let rbd: string | undefined;

        // Look in FareDetail/FareComponent for PriceClassRefID (fareDetailEl already declared above)
        if (fareDetailEl) {
          const fareComponentEls = this.getElements(fareDetailEl, "FareComponent");
          for (const fcEl of fareComponentEls) {
            const priceClassRefId = this.getText(fcEl, "PriceClassRefID");
            if (priceClassRefId) {
              const priceClass = priceClassMap.get(priceClassRefId);
              if (priceClass) {
                if (!fareBasisCode && priceClass.fareBasisCode) {
                  fareBasisCode = priceClass.fareBasisCode;
                }
                if (!cabinType && priceClass.cabinType) {
                  cabinType = priceClass.cabinType;
                }
                if (!rbd && priceClass.rbd) {
                  rbd = priceClass.rbd;
                }
              }
            }
          }
        }

        return {
          offerItemId: itemId,
          paxRefIds,
          baseAmount: this.parseTotalPrice(baseAmountEl) || undefined,
          taxAmount: this.parseTotalPrice(taxAmountEl) || undefined,
          totalAmount: this.parseTotalPrice(itemAmountEl) || { value: 0, currency: "AUD" },
          fareBasisCode,
          cabinType,
          rbd,
          segmentRefIds: segmentRefIds.length > 0 ? segmentRefIds : undefined,
        };
      });

      // Get all segment refs for this offer to match with ALaCarteOffer items
      const allSegmentRefs = new Set<string>();
      for (const item of offerItems) {
        if (item.segmentRefIds) {
          item.segmentRefIds.forEach(ref => allSegmentRefs.add(ref));
        }
      }

      // Get journey refs from the offer - look in Service/OfferServiceAssociation/PaxJourneyRef/PaxJourneyRefID
      // (per Postman script: item.Service.OfferServiceAssociation.PaxJourneyRef.PaxJourneyRefID)
      const journeyRefs = new Set<string>();
      for (const itemEl of this.getElements(offerEl, "OfferItem")) {
        const serviceEl = this.getElement(itemEl, "Service");
        if (serviceEl) {
          // Try OfferServiceAssociation/PaxJourneyRef/PaxJourneyRefID first (Jetstar format)
          const offerServiceAssocEl = this.getElement(serviceEl, "OfferServiceAssociation");
          if (offerServiceAssocEl) {
            const paxJourneyRefEl = this.getElement(offerServiceAssocEl, "PaxJourneyRef");
            if (paxJourneyRefEl) {
              const journeyRef = this.getText(paxJourneyRefEl, "PaxJourneyRefID");
              if (journeyRef) journeyRefs.add(journeyRef);
            }
          }
          // Fallback to direct PaxJourneyRefID in Service
          const directServiceJourneyRef = this.getText(serviceEl, "PaxJourneyRefID");
          if (directServiceJourneyRef) journeyRefs.add(directServiceJourneyRef);
        }
        // Also check direct PaxJourneyRefID in OfferItem
        const directJourneyRef = this.getText(itemEl, "PaxJourneyRefID");
        if (directJourneyRef) journeyRefs.add(directJourneyRef);
      }

      // Match ALaCarteOffer items with this offer based on journey/segment overlap
      // ALaCarteOffer items contain bundle pricing for segments/journeys
      const bundleOffers = this.matchALaCarteItemsToOffer(
        alaCarteItems,
        bundleDefinitions,
        serviceDefinitions,
        allSegmentRefs,
        journeyRefs
      );

      const bundleSummary = bundleOffers.length > 0
        ? bundleOffers.map(b => `${b.serviceCode}=$${b.price.value}`).join(', ')
        : 'NONE';

      // Use currency from bundle offers or offer items if totalPrice currency is missing/defaulted to AUD
      let offerCurrency = totalPrice.currency;
      if (offerCurrency === "AUD" && bundleOffers.length > 0 && bundleOffers[0].price.currency !== "AUD") {
        offerCurrency = bundleOffers[0].price.currency;
      } else if (offerCurrency === "AUD" && offerItems.length > 0 && offerItems[0].totalAmount.currency !== "AUD") {
        offerCurrency = offerItems[0].totalAmount.currency;
      }

      console.log(`[Backend] Offer ${offerId.substring(0, 30)}... → ${offerItems.length} items, ${bundleOffers.length} bundles (${bundleSummary}), totalPrice=${totalPrice.value} ${offerCurrency}`);

      offers.push({
        offerId,
        ownerCode,
        totalPrice: { value: totalPrice.value, currency: offerCurrency },
        expirationDateTime,
        offerItems,
        bundleOffers: bundleOffers.length > 0 ? bundleOffers : undefined,
      });
    }

    console.log(`[Backend] ✅ Parsed ${offers.length} total offers`);
    return offers;
  }

  /**
   * Match ALaCarteOffer items to an offer based on journey/segment overlap
   * ALaCarteOffer items have journeyRefId indicating which flight they apply to
   * We filter by journey first, then deduplicate by serviceCode
   *
   * IMPORTANT: Bundle prices vary by journey (direct vs connecting flights have different prices)
   * We must filter items by the offer's specific journey before picking the price
   */
  private matchALaCarteItemsToOffer(
    alaCarteItems: ALaCarteOfferItem[],
    bundleDefinitions: BundleDefinition[],
    serviceDefinitions: ServiceDefinition[],
    offerSegmentRefs: Set<string>,
    offerJourneyRefs: Set<string>
  ): BundleOfferItem[] {
    // Create a map for quick lookup of bundle definitions
    const bundleDefMap = new Map<string, BundleDefinition>();
    for (const def of bundleDefinitions) {
      bundleDefMap.set(def.serviceDefinitionId, def);
    }

    // Create a map for service definitions (to resolve inclusions)
    const serviceDefMap = new Map<string, ServiceDefinition>();
    for (const def of serviceDefinitions) {
      serviceDefMap.set(def.serviceDefinitionId, def);
    }

    // First, filter ALaCarteOffer items by this offer's journey/segments
    // ALaCarteOffer items have JourneyRef like "fl913653037"
    // Offers have segmentRefIds like ["seg913653037"]
    // They share the numeric part (913653037)
    const matchingItems: ALaCarteOfferItem[] = [];

    // Extract numeric IDs from segment refs for matching
    // e.g., "seg913653037" -> "913653037"
    const offerSegmentNumericIds = new Set<string>();
    for (const segRef of offerSegmentRefs) {
      const numericId = segRef.replace(/^seg|^Mkt-seg/, '');
      if (numericId) offerSegmentNumericIds.add(numericId);
    }

    for (const item of alaCarteItems) {
      if (item.journeyRefId) {
        // Journey IDs look like "fl913653037" or "fl0391852403"
        // Extract numeric part: "fl913653037" -> "913653037", "fl0391852403" -> "0391852403"
        const journeyNumeric = item.journeyRefId.replace(/^fl/, '');

        // Check if this journey's numeric ID matches any of the offer's segment numeric IDs
        const matchesSegment = offerSegmentNumericIds.has(journeyNumeric);

        // Also check journey refs if available
        const matchesJourney = offerJourneyRefs.size > 0 && (
          offerJourneyRefs.has(item.journeyRefId) ||
          Array.from(offerJourneyRefs).some(ref => ref.includes(journeyNumeric))
        );

        if (matchesSegment || matchesJourney) {
          matchingItems.push(item);
        }
      }
    }

    // If no journey-specific matches found, fall back to all items (shouldn't happen normally)
    const itemsToProcess = matchingItems.length > 0 ? matchingItems : alaCarteItems;

    // Group by serviceCode - collect ALL items per bundle type to get per-passenger offerItemIds
    // Different passengers (ADT, CHD, INF) may have different offerItemIds for the same bundle
    const bundleItemsByCode = new Map<string, {
      items: ALaCarteOfferItem[];
      bundleDef: BundleDefinition;
    }>();

    for (const item of itemsToProcess) {
      const bundleDef = bundleDefMap.get(item.serviceDefinitionRefId);
      if (!bundleDef) {
        continue; // Skip if not a known bundle
      }

      // Collect all items for this bundle code
      if (!bundleItemsByCode.has(bundleDef.serviceCode)) {
        bundleItemsByCode.set(bundleDef.serviceCode, { items: [], bundleDef });
      }
      bundleItemsByCode.get(bundleDef.serviceCode)!.items.push(item);
    }

    // Now build BundleOfferItems with per-passenger offerItemIds
    const bundleOffers: BundleOfferItem[] = [];

    for (const [serviceCode, { items, bundleDef }] of bundleItemsByCode) {
      // Skip if no items (shouldn't happen but type safety)
      if (items.length === 0) continue;

      // Use first item as primary (for backwards compatibility with offerItemId field)
      const primaryItem = items[0];

      // Build per-passenger offerItemId mapping from ALL items
      const paxOfferItemIds: Record<string, string> = {};
      const allPaxRefIds: string[] = [];

      for (const item of items) {
        for (const paxRefId of item.paxRefIds) {
          paxOfferItemIds[paxRefId] = item.offerItemId;
          if (!allPaxRefIds.includes(paxRefId)) {
            allPaxRefIds.push(paxRefId);
          }
        }
      }

      // Get the journeyRefId from the primary item - this is CRITICAL for OfferPrice requests
      // The journeyRefId format (e.g., "fl913653037") is different from PaxJourneyID
      const journeyRefId = primaryItem!.journeyRefId;
      const journeyRefIds = primaryItem!.journeyRefIds;  // NEW: Array of ALL journey refs
      console.log(`[AirShoppingParser] Bundle ${serviceCode} journeyRefId: ${journeyRefId}, journeyRefIds: ${journeyRefIds?.join(',') || 'none'}, paxOfferItemIds:`, paxOfferItemIds);

      // Resolve inclusions from ServiceBundle references
      const inclusions: BundleOfferItem['inclusions'] = {
        baggage: [],
        seats: [],
        meals: [],
        other: [],
      };

      if (bundleDef.includedServiceRefIds) {
        for (const refId of bundleDef.includedServiceRefIds) {
          const includedService = serviceDefMap.get(refId);
          if (includedService) {
            const inclusion = {
              serviceCode: includedService.serviceCode,
              name: includedService.name,
              description: includedService.description,
            };

            switch (includedService.serviceType) {
              case 'baggage':
                inclusions.baggage.push(inclusion);
                break;
              case 'seat':
                inclusions.seats.push(inclusion);
                break;
              case 'meal':
                inclusions.meals.push(inclusion);
                break;
              default:
                inclusions.other.push(inclusion);
                break;
            }
          }
        }
      }

      bundleOffers.push({
        offerItemId: primaryItem!.offerItemId,  // Keep for backwards compatibility
        serviceDefinitionRefId: primaryItem!.serviceDefinitionRefId,
        serviceCode: bundleDef.serviceCode,
        bundleName: bundleDef.name,
        description: bundleDef.description,
        price: primaryItem!.price,
        paxRefIds: allPaxRefIds,  // All passengers that can use this bundle
        paxOfferItemIds,  // Per-passenger offerItemId mapping
        journeyRefId,  // Journey ref from ALaCarteOffer - MUST use for OfferPrice (first ref for backward compat)
        journeyRefIds,  // NEW: ALL journey refs this bundle applies to (for round trips with same bundle)
        inclusions,
      });
    }
    console.log(`[AirShoppingParser] Matched ${bundleOffers.length} bundles to offer (filtered from ${itemsToProcess.length}/${alaCarteItems.length} items)`);
    return bundleOffers;
  }

  private parseSegments(doc: Document): FlightSegment[] {
    const segments: FlightSegment[] = [];

    // Jetstar uses DatedMarketingSegment instead of PaxSegment
    let segmentElements = this.getElements(doc, "DatedMarketingSegment");

    // Fallback to PaxSegment if DatedMarketingSegment not found
    if (segmentElements.length === 0) {
      segmentElements = this.getElements(doc, "PaxSegment");
    }

    for (const segEl of segmentElements) {
      // Jetstar uses DatedMarketingSegmentId
      const paxSegmentId = this.getText(segEl, "DatedMarketingSegmentId") ||
                           this.getAttribute(segEl, "PaxSegmentID") ||
                           this.getText(segEl, "PaxSegmentID") || "";

      // Parse departure - Jetstar uses Dep with AircraftScheduledDateTime
      const depEl = this.getElement(segEl, "Dep") || this.getElement(segEl, "Departure");
      const depLocationEl = depEl ? this.getElement(depEl, "IATA_LocationCode") : null;
      const depAirport = depLocationEl?.textContent?.trim() ||
                         this.getText(segEl, "OriginCode") || "";

      // Parse departure datetime
      const depDateTime = depEl ? this.getText(depEl, "AircraftScheduledDateTime") : null;
      let depDate = "";
      let depTime: string | undefined;
      if (depDateTime) {
        const parts = depDateTime.split("T");
        depDate = parts[0] || "";
        depTime = parts[1] || undefined;
      } else {
        depDate = this.getText(depEl || segEl, "Date") ||
                  this.getText(segEl, "DepartureDate") || "";
        depTime = this.getText(depEl || segEl, "Time") ||
                  this.getText(segEl, "DepartureTime") || undefined;
      }

      // Parse arrival - Jetstar uses Arrival with AircraftScheduledDateTime
      const arrEl = this.getElement(segEl, "Arrival") || this.getElement(segEl, "Arr");
      const arrLocationEl = arrEl ? this.getElement(arrEl, "IATA_LocationCode") : null;
      const arrAirport = arrLocationEl?.textContent?.trim() ||
                         this.getText(segEl, "DestinationCode") || "";

      // Parse arrival datetime
      const arrDateTime = arrEl ? this.getText(arrEl, "AircraftScheduledDateTime") : null;
      let arrDate: string | undefined;
      let arrTime: string | undefined;
      if (arrDateTime) {
        const parts = arrDateTime.split("T");
        arrDate = parts[0] || undefined;
        arrTime = parts[1] || undefined;
      } else {
        arrDate = this.getText(arrEl || segEl, "Date") ||
                  this.getText(segEl, "ArrivalDate") || undefined;
        arrTime = this.getText(arrEl || segEl, "Time") ||
                  this.getText(segEl, "ArrivalTime") || undefined;
      }

      // Jetstar puts CarrierDesigCode and MarketingCarrierFlightNumberText directly in segment
      const carrierCode = this.getText(segEl, "CarrierDesigCode") || "";
      const flightNumber = this.getText(segEl, "MarketingCarrierFlightNumberText") || "";

      const marketingCarrier = (carrierCode || flightNumber) ? {
        airlineCode: carrierCode,
        flightNumber: flightNumber,
      } : undefined;

      // Check for operating carrier info
      const operatingRefId = this.getText(segEl, "DatedOperatingSegmentRefId");
      const operatingCarrier = operatingRefId ? {
        airlineCode: carrierCode, // Usually same as marketing for Jetstar
        flightNumber: flightNumber,
      } : undefined;

      // Equipment info would be in DatedOperatingLeg (separate list)
      const equipment = undefined; // Would need to cross-reference DatedOperatingLegList

      const cabinCode = this.getText(segEl, "CabinCode") ||
                        this.getText(segEl, "CabinTypeCode") || undefined;
      const classOfService = this.getText(segEl, "ClassOfService") ||
                             this.getText(segEl, "RBD") || undefined;
      const fareBasisCode = this.getText(segEl, "FareBasisCode") || undefined;

      segments.push({
        paxSegmentId,
        origin: depAirport,
        destination: arrAirport,
        departureDate: depDate,
        departureTime: depTime,
        arrivalDate: arrDate,
        arrivalTime: arrTime,
        marketingCarrier,
        operatingCarrier,
        equipment,
        duration: this.getText(segEl, "Duration") || undefined,
        cabinCode,
        classOfService,
        fareBasisCode,
      });
    }

    return segments;
  }

  private parseJourneys(doc: Document): PaxJourney[] {
    const journeys: PaxJourney[] = [];
    const journeyElements = this.getElements(doc, "PaxJourney");

    for (const jEl of journeyElements) {
      const journeyId = this.getAttribute(jEl, "PaxJourneyID") ||
                        this.getText(jEl, "PaxJourneyID") || "";

      // Try DatedMarketingSegmentRefID first (Jetstar), then PaxSegmentRefID
      let segmentRefs = this.getElements(jEl, "DatedMarketingSegmentRefID")
        .map(el => el.textContent?.trim() || "")
        .filter(id => id.length > 0);

      if (segmentRefs.length === 0) {
        segmentRefs = this.getElements(jEl, "PaxSegmentRefID")
          .map(el => el.textContent?.trim() || "")
          .filter(id => id.length > 0);
      }

      journeys.push({
        paxJourneyId: journeyId,
        segmentRefIds: segmentRefs,
        duration: this.getText(jEl, "Duration") || undefined,
      });
    }

    return journeys;
  }

  /**
   * Parse total price with currency - handles Jetstar nested structure
   */
  private parseTotalPrice(element: Element | null): { value: number; currency: string } | null {
    if (!element) return null;

    // Try to get amount from nested TotalAmount first
    let amountText = this.getText(element, "TotalAmount");
    let currencyCode = this.getText(element, "CurCode");

    // If not nested, try direct text content
    if (!amountText) {
      amountText = element.textContent?.trim() || "0";
    }

    // Try to get currency from attribute if not found as element
    if (!currencyCode) {
      currencyCode = this.getAttribute(element, "CurCode") || "AUD";
    }

    const value = parseFloat(amountText);
    return { value: isNaN(value) ? 0 : value, currency: currencyCode };
  }
}

export const airShoppingParser = new AirShoppingParser();
