// ============================================================================
// SEAT AVAILABILITY RESPONSE PARSER
// ============================================================================

import { BaseXmlParser } from "./base.parser.js";
import type { SeatMap, CabinCompartment, SeatRow, Seat, SeatCharacteristic, AncillaryOffer } from "../types/ndc.types.js";
import type { SeatAvailabilityResponseData } from "../types/api.types.js";

export interface SeatAvailabilityParseResult extends SeatAvailabilityResponseData {
  success: boolean;
  errors?: Array<{ code: string; message: string }>;
}

export class SeatAvailabilityParser extends BaseXmlParser {
  parse(xml: string): SeatAvailabilityParseResult {
    const doc = this.parseXml(xml);

    if (this.hasErrors(doc)) {
      return {
        success: false,
        errors: this.extractErrors(doc),
        seatMaps: [],
        seatOffers: [],
      };
    }

    // CRITICAL: Parse ALaCarteOffer FIRST to build the price mapping
    // ALaCarteOffer contains OfferItems with ServiceDefinitionRefID and prices
    const pricingMap = this.parseALaCarteOfferPricing(doc);

    // Extract ALaCarteOffer ID - this is what seats will use for OfferPrice
    const aLaCarteOfferId = this.parseALaCarteOfferId(doc);

    // Then parse SeatMaps and inject pricing from the mapping
    const seatMaps = this.parseSeatMaps(doc, pricingMap);

    return {
      success: true,
      seatMaps,
      seatOffers: this.parseSeatOffers(doc),
      aLaCarteOfferId,  // Include the offer ID for use in OfferPrice
    };
  }

  /**
   * Parse ALaCarteOffer to build a map from OfferItemID to price and eligible passenger types.
   *
   * JETSTAR SEATAVAILABILITY RESPONSE STRUCTURE:
   *
   * 1. ALaCarteOffer contains OfferItems with:
   *    - OfferItemID (e.g., "id-v2-...-2") - the ID to use when booking
   *    - Eligibility/PaxRefID - which passengers can use this offer (ADT0, CHD0, etc.)
   *    - UnitPrice/TotalAmount - the seat price
   *
   * 2. SeatMap/Seat elements have:
   *    - OfferItemRefID elements - MULTIPLE! One for each passenger type
   *    - Example: seat 2D has OfferItemRefID "-2" (ADT) and "-8" (CHD)
   *
   * MATCHING STRATEGY:
   * Build map: OfferItemID -> { price, paxTypes[] }
   * When parsing seats, read all OfferItemRefID elements and build offerItemIdsByPaxType
   */
  private parseALaCarteOfferPricing(doc: Document): Map<string, { price: number; paxTypes: string[] }> {
    // Map from OfferItemID -> { price, paxTypes }
    const offerItemMap = new Map<string, { price: number; paxTypes: string[] }>();

    // Get all ALaCarteOffer elements
    const alaCarteOffers = this.getElements(doc, "ALaCarteOffer");

    for (const offerEl of alaCarteOffers) {
      // Get all OfferItem elements within this ALaCarteOffer
      const offerItems = this.getElements(offerEl, "OfferItem");

      for (const itemEl of offerItems) {
        // Get OfferItemID - THIS is the key we'll use
        const offerItemId = this.getText(itemEl, "OfferItemID") || "";
        if (!offerItemId) continue;

        // Get price from UnitPrice/TotalAmount
        const unitPriceEl = this.getElement(itemEl, "UnitPrice");
        const price = unitPriceEl ? this.parseAmount(unitPriceEl) : undefined;
        const priceValue = price?.value !== undefined ? price.value : 0;

        // Parse Eligibility/PaxRefID to know which passenger types can use this offer
        const eligibilityEl = this.getElement(itemEl, "Eligibility");
        const paxTypes: string[] = [];

        if (eligibilityEl) {
          const paxRefIds = this.getElements(eligibilityEl, "PaxRefID");
          for (const paxEl of paxRefIds) {
            const paxId = paxEl.textContent?.trim();
            if (paxId) {
              // Extract passenger type from PaxRefID (e.g., "ADT0" -> "ADT", "CHD0" -> "CHD")
              const paxType = paxId.replace(/\d+$/, ''); // Remove trailing digits
              if (!paxTypes.includes(paxType)) {
                paxTypes.push(paxType);
              }
            }
          }
        }

        // Store in map keyed by OfferItemID
        offerItemMap.set(offerItemId, { price: priceValue, paxTypes });

        console.log(`[SeatAvailabilityParser] OfferItem ${offerItemId} -> $${priceValue} for ${paxTypes.join('/')}`);
      }
    }

    console.log(`[SeatAvailabilityParser] Built offerItem map with ${offerItemMap.size} entries`);

    return offerItemMap;
  }

  private parseSeatMaps(doc: Document, offerItemMap: Map<string, { price: number; paxTypes: string[] }>): SeatMap[] {
    const seatMaps: SeatMap[] = [];
    const seatMapElements = this.getElements(doc, "SeatMap");

    for (const mapEl of seatMapElements) {
      const segmentRef = this.getText(mapEl, "PaxSegmentRefID") ||
                         this.getAttribute(mapEl, "SegmentRef") || "";

      const cabinCompartments: CabinCompartment[] = [];
      const cabinElements = this.getElements(mapEl, "CabinCompartment");

      if (cabinElements.length === 0) {
        const cabinEl = this.getElement(mapEl, "Cabin");
        if (cabinEl) {
          cabinCompartments.push(this.parseCabin(cabinEl, offerItemMap));
        }
      } else {
        for (const cabinEl of cabinElements) {
          cabinCompartments.push(this.parseCabin(cabinEl, offerItemMap));
        }
      }

      seatMaps.push({
        paxSegmentRefId: segmentRef,
        cabinCompartments,
      });
    }

    return seatMaps;
  }

  /**
   * Build mapping from ServiceDefinitionID to set of characteristic codes
   * This allows matching seats (which have characteristics) to service definitions (which have pricing)
   */
  private buildServiceDefinitionCharacteristicMap(doc: Document): Map<string, Set<string>> {
    const serviceDefMap = new Map<string, Set<string>>();

    // Look for ServiceDefinition elements in DataLists/ServiceDefinitionList
    const serviceDefElements = this.getElements(doc, "ServiceDefinition");

    for (const defEl of serviceDefElements) {
      const serviceDefId = this.getText(defEl, "ServiceDefinitionID") || "";
      if (!serviceDefId) continue;

      // Get characteristic codes for this service definition
      const charElements = this.getElements(defEl, "SeatCharacteristicCode");
      const characteristics = new Set<string>();

      for (const charEl of charElements) {
        const code = charEl.textContent?.trim();
        if (code) {
          characteristics.add(code);
        }
      }

      serviceDefMap.set(serviceDefId, characteristics);
    }

    console.log(`[SeatAvailabilityParser] Built ServiceDefinition->Characteristics map with ${serviceDefMap.size} entries:`,
      Array.from(serviceDefMap.entries()).map(([id, chars]) => ({ serviceDefId: id, characteristics: Array.from(chars) })));

    return serviceDefMap;
  }

  /**
   * Parse a cabin compartment and extract seat data.
   *
   * CRITICAL: Jetstar seats have OfferItemRefID elements (can be multiple!)
   * Each OfferItemRefID corresponds to a different passenger type.
   * Example: Seat 2D has:
   *   <OfferItemRefID>id-v2-...-2</OfferItemRefID>  (for ADT)
   *   <OfferItemRefID>id-v2-...-8</OfferItemRefID>  (for CHD)
   */
  private parseCabin(
    cabinEl: Element,
    offerItemMap: Map<string, { price: number; paxTypes: string[] }>
  ): CabinCompartment {
    const rows: SeatRow[] = [];
    // Try both "SeatRow" and "Row" element names
    let rowElements = this.getElements(cabinEl, "SeatRow");
    if (rowElements.length === 0) {
      rowElements = this.getElements(cabinEl, "Row");
    }

    for (const rowEl of rowElements) {
      const rowNumber = this.getText(rowEl, "RowNumber") ||
                        this.getAttribute(rowEl, "Number") || "";

      const seats: Seat[] = [];
      const seatElements = this.getElements(rowEl, "Seat");

      for (const seatEl of seatElements) {
        const columnId = this.getText(seatEl, "ColumnID") ||
                         this.getAttribute(seatEl, "Column") || "";
        const occupationStatus = this.getText(seatEl, "OccupationStatusCode") || "O";

        // Parse seat characteristics (e.g., ["WINDOW", "AISLE"])
        const characteristics = this.parseCharacteristics(seatEl);

        // CRITICAL: Parse ALL OfferItemRefID elements from the seat
        // Jetstar puts MULTIPLE OfferItemRefIDs on each seat - one per passenger type!
        const offerItemRefElements = this.getElements(seatEl, "OfferItemRefID");
        const offerItemIdsByPaxType: Record<string, string> = {};
        let seatPrice: number | undefined;

        for (const refEl of offerItemRefElements) {
          const offerItemId = refEl.textContent?.trim();
          if (!offerItemId) continue;

          // Look up this OfferItemID in our map to get price and passenger types
          const offerData = offerItemMap.get(offerItemId);
          if (offerData) {
            // Set the price (all should be same for same seat)
            if (seatPrice === undefined) {
              seatPrice = offerData.price;
            }
            // Map each passenger type to this OfferItemID
            for (const paxType of offerData.paxTypes) {
              offerItemIdsByPaxType[paxType] = offerItemId;
            }
          }
        }

        const hasPaxTypes = Object.keys(offerItemIdsByPaxType).length > 0;
        if (hasPaxTypes) {
          console.log(`[SeatAvailabilityParser] ✅ Seat ${rowNumber}${columnId} - $${seatPrice} for ${Object.keys(offerItemIdsByPaxType).join('/')}`, offerItemIdsByPaxType);
        } else if (occupationStatus === 'F' || occupationStatus === 'A') {
          // Available seat but no OfferItemRefID - unusual
          console.log(`[SeatAvailabilityParser] ⚠️ Seat ${rowNumber}${columnId} is available but has no OfferItemRefID`);
        }

        seats.push({
          seatId: this.getAttribute(seatEl, "SeatID") || undefined,
          columnId,
          rowNumber,
          occupationStatus: this.mapOccupationStatus(occupationStatus),
          characteristics,
          offerItemIdsByPaxType: hasPaxTypes ? offerItemIdsByPaxType : undefined,
          price: seatPrice !== undefined ? { value: seatPrice, currency: "AUD" } : undefined,
        });
      }

      rows.push({ rowNumber, seats });
    }

    const cabinTypeCode = this.getText(cabinEl, "CabinTypeCode") || "M";
    const firstRow = parseInt(this.getText(cabinEl, "FirstRowNumber") || "1", 10);
    const lastRow = parseInt(this.getText(cabinEl, "LastRowNumber") || "30", 10);
    const columnLayout = this.getText(cabinEl, "SeatColumnLayout") || "ABC DEF";

    return {
      cabinTypeCode: cabinTypeCode as CabinCompartment["cabinTypeCode"],
      firstRow,
      lastRow,
      columnLayout,
      seatRows: rows,
    };
  }

  private mapOccupationStatus(status: string): Seat["occupationStatus"] {
    const statusMap: Record<string, Seat["occupationStatus"]> = {
      "F": "F", "O": "O", "Z": "Z", "AVAILABLE": "F", "FREE": "F", 
      "OCCUPIED": "O", "BLOCKED": "Z", "A": "F", "X": "O",
    };
    return statusMap[status.toUpperCase()] || "O";
  }

  private parseCharacteristics(seatEl: Element): SeatCharacteristic[] {
    const chars: SeatCharacteristic[] = [];
    const charElements = this.getElements(seatEl, "SeatCharacteristicCode");

    // Map known codes to friendly names, but keep ALL codes (not just mapped ones)
    const charMap: Record<string, SeatCharacteristic> = {
      "W": "WINDOW", "A": "AISLE", "M": "MIDDLE", "E": "EXIT_ROW",
      "L": "EXTRA_LEGROOM", "B": "BULKHEAD", "Q": "QUIET_ZONE",
    };

    for (const el of charElements) {
      const code = el.textContent?.trim().toUpperCase();
      if (code) {
        // Push mapped name if available, otherwise push the raw code
        // This ensures ALL characteristics are captured, not just the ones in charMap
        chars.push((charMap[code] || code) as SeatCharacteristic);
      }
    }

    return chars;
  }

  private parseSeatOffers(doc: Document): AncillaryOffer[] {
    const offers: AncillaryOffer[] = [];
    const offerElements = this.getElements(doc, "SeatOffer");

    for (const offerEl of offerElements) {
      const offerId = this.getAttribute(offerEl, "OfferID") || "";
      const ownerCode = this.getAttribute(offerEl, "Owner") || "JQ";
      const serviceRefId = this.getText(offerEl, "ServiceRefID") || "";
      const priceEl = this.getElement(offerEl, "Price");
      
      offers.push({
        offerId,
        ownerCode,
        serviceRefId,
        paxRefIds: this.getElements(offerEl, "PaxRefID")
          .map(el => el.textContent?.trim() || "")
          .filter(id => id.length > 0),
        price: this.parseAmount(priceEl) || { value: 0, currency: "AUD" },
      });
    }

    return offers;
  }

  /**
   * Extract the ALaCarteOffer ID from the response.
   * This is the offer ID that seats will use when creating an OfferPrice request.
   */
  private parseALaCarteOfferId(doc: Document): string | undefined {
    const alaCarteOffers = this.getElements(doc, "ALaCarteOffer");

    if (alaCarteOffers.length === 0) {
      console.warn('[SeatAvailabilityParser] No ALaCarteOffer found in response');
      return undefined;
    }

    // Get the first ALaCarteOffer's OfferID
    const firstOffer = alaCarteOffers[0];
    if (!firstOffer) {
      console.warn('[SeatAvailabilityParser] ALaCarteOffer array empty');
      return undefined;
    }

    const offerId = this.getText(firstOffer, "OfferID");

    if (offerId) {
      console.log('[SeatAvailabilityParser] Extracted ALaCarteOffer ID:', offerId);
    } else {
      console.warn('[SeatAvailabilityParser] ALaCarteOffer found but no OfferID element');
    }

    return offerId || undefined;
  }
}

export const seatAvailabilityParser = new SeatAvailabilityParser();