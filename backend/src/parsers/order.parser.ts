// ============================================================================
// ORDER RESPONSE PARSER
// Parses OrderCreate, OrderRetrieve, OrderChange responses
// ============================================================================

import { BaseXmlParser } from "./base.parser.js";
import type {
  Order, Passenger, BookingReference, OrderItem,
  FlightSegment, PaxJourney, OrderStatus, PaymentInfo, PaymentType, CardBrand,
  Amount
} from "../types/ndc.types.js";

// Extended types for full booking display
export interface ServiceDefinitionParsed {
  serviceDefinitionId: string;
  serviceCode?: string;
  serviceName?: string;
  description?: string;
  rfic?: string;
  rfisc?: string;
  serviceType: 'BAGGAGE' | 'SEAT' | 'MEAL' | 'BUNDLE' | 'SSR' | 'OTHER';
}

export interface SeatAssignmentParsed {
  paxRefId: string;
  segmentRefId: string;
  row: string;
  column: string;
  seatCharacteristics?: string[];
}

export interface ServiceItemParsed {
  orderItemId: string;
  serviceDefinitionRefId?: string;
  serviceName?: string;
  serviceCode?: string;
  serviceType: 'BAGGAGE' | 'SEAT' | 'MEAL' | 'BUNDLE' | 'SSR' | 'OTHER';
  paxRefIds: string[];
  segmentRefIds: string[];
  quantity?: number;
  price?: Amount;
  seatAssignment?: SeatAssignmentParsed;
}

export interface DatedMarketingSegmentParsed {
  segmentId: string;
  origin: string;
  destination: string;
  departureDateTime: string;
  arrivalDateTime: string;
  flightNumber: string;
  carrierCode: string;
  duration?: string;
  equipment?: {
    aircraftCode: string;
    aircraftName?: string;
  };
  cabinCode?: string;
  classOfService?: string;
}

// Parsed DataLists structure for frontend consumption
export interface ParsedDataLists {
  PaxList?: { Pax: any[] };
  PaxJourneyList?: { PaxJourney: any[] };
  PaxSegmentList?: { PaxSegment: any[] };
  DatedMarketingSegmentList?: { DatedMarketingSegment: any[] };
  DatedOperatingSegmentList?: { DatedOperatingSegment: any[] };
  ServiceDefinitionList?: { ServiceDefinition: any[] };
  SeatProfileList?: { SeatProfile: any[] };
}

// Extended Order with full DataLists
export interface OrderExtended extends Order {
  serviceDefinitions?: ServiceDefinitionParsed[];
  serviceItems?: ServiceItemParsed[];
  marketingSegments?: DatedMarketingSegmentParsed[];
  seatAssignments?: SeatAssignmentParsed[];
  // Raw DataLists for frontend to use directly
  DataLists?: ParsedDataLists;
}

export interface OrderWarning {
  code?: string;
  message: string;
}

export interface OrderParseResult {
  success: boolean;
  errors?: Array<{ code: string; message: string }>;
  warnings?: OrderWarning[];
  order?: OrderExtended;
}

export class OrderParser extends BaseXmlParser {
  parse(xml: string): OrderParseResult {
    const doc = this.parseXml(xml);

    // Try to get Order element first - even if there are "errors", the order may be present
    const orderEl = this.getElement(doc, "Order");

    // Only fail if there are errors AND no Order element
    if (this.hasErrors(doc) && !orderEl) {
      return {
        success: false,
        errors: this.extractErrors(doc),
      };
    }

    if (!orderEl) {
      return {
        success: false,
        errors: [{ code: "NO_ORDER", message: "No Order element found in response" }],
      };
    }

    // Parse warnings (e.g., "Order is underpaid") and also treat some errors as warnings
    const warnings = this.parseWarnings(doc);

    // Some "errors" from Jetstar are informational (like "Order has no order items")
    // Include them as warnings if we still have a valid order
    if (this.hasErrors(doc)) {
      const errors = this.extractErrors(doc);
      errors.forEach(err => {
        warnings.push({ code: err.code, message: err.message });
      });
    }

    return {
      success: true,
      warnings: warnings.length > 0 ? warnings : undefined,
      order: this.parseOrder(orderEl, doc),
    };
  }

  private parseWarnings(doc: Document): OrderWarning[] {
    const warnings: OrderWarning[] = [];
    const warningElements = this.getElements(doc, "Warning");

    for (const warnEl of warningElements) {
      const message = this.getText(warnEl, "DescText") ||
                      this.getText(warnEl, "Message") ||
                      warnEl.textContent?.trim() || "";
      if (message) {
        warnings.push({
          code: this.getText(warnEl, "TypeCode") || this.getText(warnEl, "Code") || undefined,
          message,
        });
      }
    }

    return warnings;
  }

  /**
   * Get text content of a DIRECT child element only (not nested descendants)
   */
  private getDirectChildText(parent: Element, tagName: string): string | null {
    const children = parent.childNodes;
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      if (child.nodeType === 1 && (child as Element).localName === tagName) {
        return child.textContent?.trim() || null;
      }
    }
    return null;
  }

  private parseOrder(orderEl: Element, doc: Document): OrderExtended {
    const orderId = this.getAttribute(orderEl, "OrderID") ||
                    this.getText(orderEl, "OrderID") || "";
    const ownerCode = this.getAttribute(orderEl, "Owner") ||
                      this.getText(orderEl, "OwnerCode") || "JQ";

    // Get StatusCode that is a DIRECT child of Order element (not nested in OrderItem)
    // getElementsByTagName gets ALL descendants, so we need to check direct children only
    const statusText = this.getDirectChildText(orderEl, "StatusCode") ||
                       this.getText(orderEl, "OrderStatus") || "CONFIRMED";
    const status = this.mapStatus(statusText);

    const creationDateTime = this.getText(orderEl, "CreationDateTime") ||
                             this.getText(orderEl, "CreateDateTime") || undefined;

    // Extract PaymentTimeLimitDateTime from first OrderItem
    const firstOrderItemEl = this.getElement(orderEl, "OrderItem");
    const paymentTimeLimit = this.getText(firstOrderItemEl, "PaymentTimeLimitDateTime") ||
                             this.getText(orderEl, "PaymentTimeLimitDateTime") || undefined;

    const bookingRefs: BookingReference[] = [];
    const bookingRefElements = this.getElements(orderEl, "BookingRef");
    if (bookingRefElements.length === 0) {
      const pnrEl = this.getElement(orderEl, "PNR");
      if (pnrEl) {
        bookingRefs.push({
          id: pnrEl.textContent?.trim() || "",
          type: "PNR",
        });
      }
    } else {
      for (const refEl of bookingRefElements) {
        bookingRefs.push({
          id: this.getText(refEl, "BookingID") || 
              this.getText(refEl, "ID") || 
              refEl.textContent?.trim() || "",
          carrier: this.getText(refEl, "AirlineID") || 
                   this.getAttribute(refEl, "Owner") || undefined,
          type: (this.getText(refEl, "BookingRefType") || 
                 this.getAttribute(refEl, "Type") || "PNR") as BookingReference["type"],
        });
      }
    }

    const totalEl = this.getElement(orderEl, "TotalPrice") || 
                    this.getElement(orderEl, "TotalOrderPrice") ||
                    this.getElement(orderEl, "TotalAmount");
    const totalPrice = this.parseAmount(totalEl) || { value: 0, currency: "AUD" };

    const orderItems: OrderItem[] = this.getElements(orderEl, "OrderItem").map(itemEl => ({
      orderItemId: this.getAttribute(itemEl, "OrderItemID") || 
                   this.getText(itemEl, "OrderItemID") || "",
      statusCode: this.getText(itemEl, "StatusCode") || "OK",
      totalAmount: this.parseAmount(this.getElement(itemEl, "Price") || 
                                    this.getElement(itemEl, "TotalAmount")) || 
                   { value: 0, currency: "AUD" },
      paxRefIds: this.getElements(itemEl, "PaxRefID")
        .map(el => el.textContent?.trim() || "")
        .filter(id => id.length > 0),
      serviceRefIds: this.getElements(itemEl, "ServiceRefID")
        .map(el => el.textContent?.trim() || "")
        .filter(id => id.length > 0),
    }));

    const passengers: Passenger[] = this.parsePassengers(doc);
    const journeys = this.parseJourneys(doc);
    const segments = this.parseSegments(doc);
    const payments = this.parseAllPayments(doc);
    const paymentInfo = payments.length > 0 ? payments[0] : undefined;

    // Parse extended DataLists
    const serviceDefinitions = this.parseServiceDefinitions(doc);
    const serviceItems = this.parseServiceItems(orderEl, serviceDefinitions);
    const marketingSegments = this.parseMarketingSegments(doc);
    const seatAssignments = this.parseSeatAssignments(orderEl);

    // Derive effective order status from payment info
    // If payment is SUCCESSFUL but XML has OPENED, the booking is actually CONFIRMED
    let effectiveStatus = status;
    if (paymentInfo?.status === "SUCCESSFUL" && status === "OPENED") {
      effectiveStatus = "CONFIRMED";
    }

    return {
      orderId,
      ownerCode,
      status: effectiveStatus,
      creationDateTime,
      paymentTimeLimit,
      totalPrice,
      bookingReferences: bookingRefs,
      orderItems,
      passengers,
      journeys: journeys.length > 0 ? journeys : undefined,
      segments: segments.length > 0 ? segments : undefined,
      paymentInfo,
      payments: payments.length > 0 ? payments : undefined,
      // Extended data
      serviceDefinitions: serviceDefinitions.length > 0 ? serviceDefinitions : undefined,
      serviceItems: serviceItems.length > 0 ? serviceItems : undefined,
      marketingSegments: marketingSegments.length > 0 ? marketingSegments : undefined,
      seatAssignments: seatAssignments.length > 0 ? seatAssignments : undefined,
      // Raw DataLists for frontend to use directly
      DataLists: this.parseDataLists(doc),
    };
  }

  /**
   * Parse DataLists section and return raw structure for frontend
   */
  private parseDataLists(doc: Document): ParsedDataLists {
    const dataLists: ParsedDataLists = {};

    // Parse PaxList
    const paxElements = this.getElements(doc, "Pax");
    if (paxElements.length > 0) {
      dataLists.PaxList = {
        Pax: paxElements.map(pax => this.elementToObject(pax))
      };
    }

    // Parse PaxJourneyList
    const journeyElements = this.getElements(doc, "PaxJourney");
    if (journeyElements.length > 0) {
      dataLists.PaxJourneyList = {
        PaxJourney: journeyElements.map(j => this.elementToObject(j))
      };
    }

    // Parse PaxSegmentList
    const paxSegElements = this.getElements(doc, "PaxSegment");
    if (paxSegElements.length > 0) {
      dataLists.PaxSegmentList = {
        PaxSegment: paxSegElements.map(s => this.elementToObject(s))
      };
    }

    // Parse DatedMarketingSegmentList
    const mktSegElements = this.getElements(doc, "DatedMarketingSegment");
    if (mktSegElements.length > 0) {
      dataLists.DatedMarketingSegmentList = {
        DatedMarketingSegment: mktSegElements.map(s => this.elementToObject(s))
      };
    }

    // Parse DatedOperatingSegmentList
    const oprSegElements = this.getElements(doc, "DatedOperatingSegment");
    if (oprSegElements.length > 0) {
      dataLists.DatedOperatingSegmentList = {
        DatedOperatingSegment: oprSegElements.map(s => this.elementToObject(s))
      };
    }

    // Parse ServiceDefinitionList
    const svcDefElements = this.getElements(doc, "ServiceDefinition");
    if (svcDefElements.length > 0) {
      dataLists.ServiceDefinitionList = {
        ServiceDefinition: svcDefElements.map(s => this.elementToObject(s))
      };
    }

    // Parse SeatProfileList
    const seatProfileElements = this.getElements(doc, "SeatProfile");
    if (seatProfileElements.length > 0) {
      dataLists.SeatProfileList = {
        SeatProfile: seatProfileElements.map(s => this.elementToObject(s))
      };
    }

    return dataLists;
  }

  /**
   * Convert XML element to plain object (recursive)
   */
  private elementToObject(element: Element): any {
    const obj: any = {};

    // Add attributes
    if (element.attributes.length > 0) {
      for (let i = 0; i < element.attributes.length; i++) {
        const attr = element.attributes[i];
        obj[attr.name] = attr.value;
      }
    }

    // Add child elements
    const children = element.childNodes;
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      if (child.nodeType === 1) { // Element node
        const childEl = child as Element;
        const tagName = childEl.localName;
        const childValue = this.elementToObject(childEl);

        // Check if this tag already exists (convert to array)
        if (obj[tagName]) {
          if (!Array.isArray(obj[tagName])) {
            obj[tagName] = [obj[tagName]];
          }
          obj[tagName].push(childValue);
        } else {
          obj[tagName] = childValue;
        }
      } else if (child.nodeType === 3) { // Text node
        const text = child.textContent?.trim();
        if (text) {
          // If element has no child elements, just return text
          if (Object.keys(obj).length === 0) {
            return text;
          }
          // Otherwise add as #text property
          obj['#text'] = text;
        }
      }
    }

    return Object.keys(obj).length > 0 ? obj : '';
  }

  /**
   * Parse a single PaymentProcessingSummary element into PaymentInfo
   */
  private parseSinglePayment(paymentSummaryEl: Element): PaymentInfo {
    const paymentStatusCode = this.getText(paymentSummaryEl, "PaymentStatusCode");
    const paymentId = this.getText(paymentSummaryEl, "PaymentID");

    // Parse payment amount
    const amountEl = this.getElement(paymentSummaryEl, "Amount");
    const amount = this.parseAmount(amountEl);

    // Parse surcharge amount
    const surchargeEl = this.getElement(paymentSummaryEl, "SurchargeAmount");
    const surchargeAmount = this.parseAmount(surchargeEl);

    // Parse payment method details
    const paymentMethodEl = this.getElement(paymentSummaryEl, "PaymentProcessingSummaryPaymentMethod");
    let method: PaymentInfo["method"] | undefined;

    if (paymentMethodEl) {
      const cardEl = this.getElement(paymentMethodEl, "PaymentCard");
      if (cardEl) {
        method = {
          type: "CC" as PaymentType,
          cardBrand: (this.getText(cardEl, "CardBrandCode") || "VI") as CardBrand,
          maskedCardNumber: this.getText(cardEl, "MaskedCardID") || undefined,
        };
      } else {
        // Check for other payment types
        const agencyEl = this.getElement(paymentMethodEl, "AgencyPayment");
        if (agencyEl) {
          method = { type: "AGT" as PaymentType };
        } else {
          method = { type: "CA" as PaymentType }; // Cash/BSP
        }
      }
    }

    // Map status code to our enum
    let status: PaymentInfo["status"] = "UNKNOWN";
    if (paymentStatusCode) {
      const upperStatus = paymentStatusCode.toUpperCase();
      if (upperStatus === "SUCCESSFUL" || upperStatus === "SUCCESS" || upperStatus === "PAID") {
        status = "SUCCESSFUL";
      } else if (upperStatus === "PENDING" || upperStatus === "PROCESSING") {
        status = "PENDING";
      } else if (upperStatus === "FAILED" || upperStatus === "REJECTED" || upperStatus === "DECLINED") {
        status = "FAILED";
      }
    }

    return {
      paymentId: paymentId || undefined,
      status,
      amount: amount || undefined,
      surchargeAmount: surchargeAmount || undefined,
      method,
    };
  }

  /**
   * Parse PaymentFunctions/PaymentProcessingSummary from response
   * This contains actual payment status after OrderChange with payment
   * Returns first payment as paymentInfo for backward compatibility
   */
  private parsePaymentInfo(doc: Document): PaymentInfo | undefined {
    const payments = this.parseAllPayments(doc);
    return payments.length > 0 ? payments[0] : undefined;
  }

  /**
   * Parse ALL PaymentProcessingSummary elements from response
   * Returns array of all payments on the order
   */
  private parseAllPayments(doc: Document): PaymentInfo[] {
    const payments: PaymentInfo[] = [];
    const paymentSummaryElements = this.getElements(doc, "PaymentProcessingSummary");

    for (const paymentEl of paymentSummaryElements) {
      payments.push(this.parseSinglePayment(paymentEl));
    }

    return payments;
  }

  private mapStatus(statusText: string): OrderStatus {
    const statusMap: Record<string, OrderStatus> = {
      "PENDING": "PENDING",
      "CONFIRMED": "CONFIRMED",
      "TICKETED": "TICKETED",
      "CANCELLED": "CANCELLED",
      "REFUNDED": "REFUNDED",
      "OPENED": "OPENED",  // Hold booking - payment required
      "ACTIVE": "CONFIRMED",  // OrderItem status
      "OK": "CONFIRMED",
      "HK": "CONFIRMED",
      "TK": "TICKETED",
      "XX": "CANCELLED",
    };
    return statusMap[statusText.toUpperCase()] || "CONFIRMED";
  }

  private parsePassengers(doc: Document): Passenger[] {
    const passengers: Passenger[] = [];
    const paxElements = this.getElements(doc, "Pax");

    for (const paxEl of paxElements) {
      const individualEl = this.getElement(paxEl, "Individual");
      
      passengers.push({
        paxId: this.getText(paxEl, "PaxID") || undefined,
        ptc: (this.getText(paxEl, "PTC") || "ADT") as Passenger["ptc"],
        title: this.getText(individualEl || paxEl, "Title") || undefined,
        givenName: this.getText(individualEl || paxEl, "GivenName") || 
                   this.getText(individualEl || paxEl, "FirstName") || "",
        middleName: this.getText(individualEl || paxEl, "MiddleName") || undefined,
        surname: this.getText(individualEl || paxEl, "Surname") || 
                 this.getText(individualEl || paxEl, "LastName") || "",
        birthdate: this.getText(individualEl || paxEl, "Birthdate") || 
                   this.getText(individualEl || paxEl, "BirthDate") || "",
        gender: (this.getText(individualEl || paxEl, "Gender") || "U") as Passenger["gender"],
        email: this.getText(paxEl, "EmailAddressText") || 
               this.getText(paxEl, "Email") || undefined,
        phone: this.getText(paxEl, "PhoneNumber") || 
               this.getText(paxEl, "Phone") || undefined,
      });
    }

    return passengers;
  }

  private parseJourneys(doc: Document): PaxJourney[] {
    const journeys: PaxJourney[] = [];
    const journeyElements = this.getElements(doc, "PaxJourney");

    for (const jEl of journeyElements) {
      journeys.push({
        paxJourneyId: this.getAttribute(jEl, "PaxJourneyID") || 
                      this.getText(jEl, "PaxJourneyID") || "",
        segmentRefIds: this.getElements(jEl, "PaxSegmentRefID")
          .map(el => el.textContent?.trim() || "")
          .filter(id => id.length > 0),
        duration: this.getText(jEl, "Duration") || undefined,
      });
    }

    return journeys;
  }

  private parseSegments(doc: Document): FlightSegment[] {
    const segments: FlightSegment[] = [];
    const segmentElements = this.getElements(doc, "PaxSegment");

    for (const segEl of segmentElements) {
      const depEl = this.getElement(segEl, "Dep") || this.getElement(segEl, "Departure");
      const arrEl = this.getElement(segEl, "Arr") || this.getElement(segEl, "Arrival");
      const marketingEl = this.getElement(segEl, "MarketingCarrierInfo");

      segments.push({
        paxSegmentId: this.getAttribute(segEl, "PaxSegmentID") || 
                      this.getText(segEl, "PaxSegmentID") || "",
        origin: this.getText(depEl || segEl, "IATA_LocationCode") || "",
        destination: this.getText(arrEl || segEl, "IATA_LocationCode") || "",
        departureDate: this.getText(depEl || segEl, "Date") || "",
        departureTime: this.getText(depEl || segEl, "Time") || undefined,
        arrivalDate: this.getText(arrEl || segEl, "Date") || undefined,
        arrivalTime: this.getText(arrEl || segEl, "Time") || undefined,
        marketingCarrier: marketingEl ? {
          airlineCode: this.getText(marketingEl, "CarrierDesigCode") || "",
          flightNumber: this.getText(marketingEl, "MarketingCarrierFlightNumberText") || "",
        } : undefined,
        duration: this.getText(segEl, "Duration") || undefined,
      });
    }

    return segments;
  }

  /**
   * Parse ServiceDefinitionList from DataLists
   */
  private parseServiceDefinitions(doc: Document): ServiceDefinitionParsed[] {
    const definitions: ServiceDefinitionParsed[] = [];
    const serviceDefElements = this.getElements(doc, "ServiceDefinition");

    for (const defEl of serviceDefElements) {
      const serviceCode = this.getText(defEl, "ServiceCode") || "";
      const serviceName = this.getText(defEl, "Name") || this.getText(defEl, "ServiceName") || "";
      const description = this.getText(defEl, "DescText") || this.getText(defEl, "Description") || undefined;
      const rfic = this.getText(defEl, "RFIC") || undefined;
      const rfisc = this.getText(defEl, "RFISC") || undefined;

      // Determine service type from code/name
      const serviceType = this.determineServiceType(serviceCode, serviceName, rfic);

      definitions.push({
        serviceDefinitionId: this.getAttribute(defEl, "ServiceDefinitionID") ||
                            this.getText(defEl, "ServiceDefinitionID") || "",
        serviceCode: serviceCode || undefined,
        serviceName: serviceName || undefined,
        description,
        rfic,
        rfisc,
        serviceType,
      });
    }

    return definitions;
  }

  /**
   * Determine service type from code and name
   */
  private determineServiceType(
    code: string,
    name: string,
    rfic?: string
  ): ServiceDefinitionParsed['serviceType'] {
    const upperCode = (code || "").toUpperCase();
    const upperName = (name || "").toUpperCase();
    const upperRfic = (rfic || "").toUpperCase();

    // Check RFIC codes
    if (upperRfic === "C") return "BAGGAGE"; // Cargo/Baggage
    if (upperRfic === "G") return "MEAL";    // In-flight services

    // Check code patterns
    if (upperCode.includes("BAG") || upperCode.includes("0GO") || upperCode.includes("0GP")) return "BAGGAGE";
    if (upperCode.includes("SEAT") || upperCode.includes("ST")) return "SEAT";
    if (upperCode.includes("MEAL") || upperCode.includes("ML")) return "MEAL";
    if (upperCode.includes("BNDL") || upperCode.includes("BDL")) return "BUNDLE";

    // Check name patterns
    if (upperName.includes("BAGGAGE") || upperName.includes("LUGGAGE") || upperName.includes("KG")) return "BAGGAGE";
    if (upperName.includes("SEAT") || upperName.includes("LEGROOM")) return "SEAT";
    if (upperName.includes("MEAL") || upperName.includes("FOOD") || upperName.includes("SNACK")) return "MEAL";
    if (upperName.includes("BUNDLE") || upperName.includes("STARTER") || upperName.includes("PLUS") ||
        upperName.includes("FLEX") || upperName.includes("MAX")) return "BUNDLE";

    // SSR patterns
    if (upperCode.length === 4 && /^[A-Z]{4}$/.test(upperCode)) return "SSR";

    return "OTHER";
  }

  /**
   * Parse service items from OrderItems that have Service elements
   */
  private parseServiceItems(
    orderEl: Element,
    serviceDefinitions: ServiceDefinitionParsed[]
  ): ServiceItemParsed[] {
    const serviceItems: ServiceItemParsed[] = [];
    const orderItemElements = this.getElements(orderEl, "OrderItem");

    for (const itemEl of orderItemElements) {
      const serviceEl = this.getElement(itemEl, "Service");
      if (!serviceEl) continue; // Skip flight-only items

      const orderItemId = this.getAttribute(itemEl, "OrderItemID") ||
                         this.getText(itemEl, "OrderItemID") || "";

      // Get service definition reference
      const serviceDefRefId = this.getText(serviceEl, "ServiceDefinitionRefID") ||
                              this.getText(serviceEl, "ServiceRefID") || undefined;

      // Look up service definition
      const serviceDef = serviceDefinitions.find(sd => sd.serviceDefinitionId === serviceDefRefId);

      // Get passenger and segment references
      const paxRefIds = this.getElements(itemEl, "PaxRefID")
        .map(el => el.textContent?.trim() || "")
        .filter(id => id.length > 0);

      const segmentRefIds = this.getElements(serviceEl, "PaxSegmentRefID")
        .map(el => el.textContent?.trim() || "")
        .filter(id => id.length > 0);

      // Parse price
      const priceEl = this.getElement(itemEl, "Price") || this.getElement(itemEl, "TotalAmount");
      const price = this.parseAmount(priceEl) || undefined;

      // Check for seat assignment
      let seatAssignment: SeatAssignmentParsed | undefined;
      const seatEl = this.getElement(serviceEl, "SeatAssignment") || this.getElement(serviceEl, "Seat");
      if (seatEl) {
        const row = this.getText(seatEl, "RowNumber") || this.getText(seatEl, "Row") || "";
        const column = this.getText(seatEl, "ColumnID") || this.getText(seatEl, "Column") || "";
        if (row && column) {
          seatAssignment = {
            paxRefId: paxRefIds[0] || "",
            segmentRefId: segmentRefIds[0] || "",
            row,
            column,
            seatCharacteristics: this.getElements(seatEl, "SeatCharacteristicCode")
              .map(el => el.textContent?.trim() || "")
              .filter(c => c.length > 0),
          };
        }
      }

      // Determine service type
      let serviceType: ServiceItemParsed['serviceType'] = serviceDef?.serviceType || "OTHER";
      if (seatAssignment) serviceType = "SEAT";

      serviceItems.push({
        orderItemId,
        serviceDefinitionRefId: serviceDefRefId,
        serviceName: serviceDef?.serviceName,
        serviceCode: serviceDef?.serviceCode,
        serviceType,
        paxRefIds,
        segmentRefIds,
        quantity: parseInt(this.getText(serviceEl, "Quantity") || "1") || 1,
        price,
        seatAssignment,
      });
    }

    return serviceItems;
  }

  /**
   * Parse DatedMarketingSegmentList for detailed flight info
   * Extracts RBD from multiple sources in priority order:
   * 1. FareComponent/RBD/RBD_Code (Jetstar OrderRetrieve response)
   * 2. PaxSegment/MarketingCarrierRBD_Code (shopping responses)
   * 3. Direct segment element
   */
  private parseMarketingSegments(doc: Document): DatedMarketingSegmentParsed[] {
    const segments: DatedMarketingSegmentParsed[] = [];
    const segmentElements = this.getElements(doc, "DatedMarketingSegment");

    // Build a map of segment ID -> RBD from multiple sources
    // Key format varies: "seg89013749" (PaxSegmentRefID) or "Mkt-seg89013749" (DatedMarketingSegmentId)
    const rbdMap = new Map<string, string>();

    // Source 1: FareComponent in OrderItem (Jetstar OrderRetrieve stores RBD here)
    // Structure: OrderItem/FareDetail/FareComponent/RBD/RBD_Code with PaxSegmentRefID
    const fareComponentElements = this.getElements(doc, "FareComponent");
    for (const fareCompEl of fareComponentElements) {
      // Get RBD from FareComponent - can be nested as RBD/RBD_Code
      const rbdEl = this.getElement(fareCompEl, "RBD");
      const rbd = rbdEl ? (this.getText(rbdEl, "RBD_Code") || "") : "";

      if (rbd) {
        // Get all PaxSegmentRefID elements (there can be multiple segments per FareComponent)
        const segRefIds = this.getElements(fareCompEl, "PaxSegmentRefID")
          .map(el => el.textContent?.trim() || "")
          .filter(id => id.length > 0);

        // Map each segment ref to this RBD
        for (const segRefId of segRefIds) {
          // Store with original format (e.g., "seg89013749")
          rbdMap.set(segRefId, rbd);
          // Also store with Mkt- prefix for DatedMarketingSegmentId lookup
          rbdMap.set(`Mkt-${segRefId}`, rbd);
        }
      }
    }

    // Source 2: PaxSegment/MarketingCarrierRBD_Code (shopping responses may have this)
    const paxSegmentElements = this.getElements(doc, "PaxSegment");
    for (const paxSegEl of paxSegmentElements) {
      const mktSegRefId = this.getText(paxSegEl, "DatedMarketingSegmentRefId") || "";
      const rbd = this.getText(paxSegEl, "MarketingCarrierRBD_Code") || "";
      if (mktSegRefId && rbd && !rbdMap.has(mktSegRefId)) {
        rbdMap.set(mktSegRefId, rbd);
        // Also store without Mkt- prefix
        if (mktSegRefId.startsWith("Mkt-")) {
          rbdMap.set(mktSegRefId.replace("Mkt-", ""), rbd);
        }
      }
    }

    for (const segEl of segmentElements) {
      const depEl = this.getElement(segEl, "Dep");
      const arrEl = this.getElement(segEl, "Arrival") || this.getElement(segEl, "Arr");

      const equipmentEl = this.getElement(segEl, "DatedOperatingLeg");
      let equipment: DatedMarketingSegmentParsed['equipment'] | undefined;
      if (equipmentEl) {
        const aircraftCode = this.getText(equipmentEl, "AircraftTypeCode") || "";
        if (aircraftCode) {
          equipment = {
            aircraftCode,
            aircraftName: this.getText(equipmentEl, "AircraftTypeName") || undefined,
          };
        }
      }

      const segmentId = this.getText(segEl, "DatedMarketingSegmentId") ||
                        this.getText(segEl, "DatedMarketingSegmentID") ||
                        this.getAttribute(segEl, "DatedMarketingSegmentId") || "";

      // Look up RBD from rbdMap with multiple key formats
      // DatedMarketingSegmentId is like "Mkt-seg89013749" but FareComponent uses "seg89013749"
      let classOfService: string | undefined;

      // Try direct lookup with segmentId (e.g., "Mkt-seg89013749")
      classOfService = rbdMap.get(segmentId);

      // Try without "Mkt-" prefix (e.g., "seg89013749")
      if (!classOfService && segmentId.startsWith("Mkt-")) {
        classOfService = rbdMap.get(segmentId.replace("Mkt-", ""));
      }

      // Try extracting just the numeric part (e.g., lookup "seg89013749" from "Mkt-seg89013749")
      if (!classOfService) {
        const numMatch = segmentId.match(/seg(\d+)/i);
        if (numMatch) {
          classOfService = rbdMap.get(`seg${numMatch[1]}`);
        }
      }

      // Fall back to checking the segment element directly
      if (!classOfService) {
        classOfService = this.getText(segEl, "ClassOfService") ||
                        this.getText(segEl, "RBD") ||
                        this.getText(segEl, "MarketingCarrierRBD_Code") || undefined;
      }

      segments.push({
        segmentId,
        origin: this.getText(depEl, "IATA_LocationCode") || "",
        destination: this.getText(arrEl, "IATA_LocationCode") || "",
        departureDateTime: this.getText(depEl, "AircraftScheduledDateTime") ||
                          this.getText(depEl, "DateTime") || "",
        arrivalDateTime: this.getText(arrEl, "AircraftScheduledDateTime") ||
                        this.getText(arrEl, "DateTime") || "",
        flightNumber: this.getText(segEl, "MarketingCarrierFlightNumberText") || "",
        carrierCode: this.getText(segEl, "CarrierDesigCode") || "",
        duration: this.getText(segEl, "Duration") || undefined,
        equipment,
        cabinCode: this.getText(segEl, "CabinTypeCode") || undefined,
        classOfService,
      });
    }

    return segments;
  }

  /**
   * Parse all seat assignments from OrderItems
   */
  private parseSeatAssignments(orderEl: Element): SeatAssignmentParsed[] {
    const seats: SeatAssignmentParsed[] = [];
    const orderItemElements = this.getElements(orderEl, "OrderItem");

    for (const itemEl of orderItemElements) {
      const serviceEl = this.getElement(itemEl, "Service");
      if (!serviceEl) continue;

      const seatEl = this.getElement(serviceEl, "SeatAssignment") || this.getElement(serviceEl, "Seat");
      if (!seatEl) continue;

      const row = this.getText(seatEl, "RowNumber") || this.getText(seatEl, "Row") || "";
      const column = this.getText(seatEl, "ColumnID") || this.getText(seatEl, "Column") || "";
      if (!row || !column) continue;

      const paxRefIds = this.getElements(itemEl, "PaxRefID")
        .map(el => el.textContent?.trim() || "")
        .filter(id => id.length > 0);

      const segmentRefIds = this.getElements(serviceEl, "PaxSegmentRefID")
        .map(el => el.textContent?.trim() || "")
        .filter(id => id.length > 0);

      seats.push({
        paxRefId: paxRefIds[0] || "",
        segmentRefId: segmentRefIds[0] || "",
        row,
        column,
        seatCharacteristics: this.getElements(seatEl, "SeatCharacteristicCode")
          .map(el => el.textContent?.trim() || "")
          .filter(c => c.length > 0),
      });
    }

    return seats;
  }
}

export const orderParser = new OrderParser();