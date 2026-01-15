// ============================================================================
// ORDER RESPONSE PARSER
// Parses OrderCreate, OrderRetrieve, OrderChange responses
// ============================================================================

import { BaseXmlParser } from "./base.parser.js";
import type { 
  Order, Passenger, BookingReference, OrderItem, 
  FlightSegment, PaxJourney, OrderStatus 
} from "../types/ndc.types.js";

export interface OrderWarning {
  code?: string;
  message: string;
}

export interface OrderParseResult {
  success: boolean;
  errors?: Array<{ code: string; message: string }>;
  warnings?: OrderWarning[];
  order?: Order;
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

  private parseOrder(orderEl: Element, doc: Document): Order {
    const orderId = this.getAttribute(orderEl, "OrderID") || 
                    this.getText(orderEl, "OrderID") || "";
    const ownerCode = this.getAttribute(orderEl, "Owner") || 
                      this.getText(orderEl, "OwnerCode") || "JQ";

    const statusText = this.getText(orderEl, "StatusCode") || 
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

    return {
      orderId,
      ownerCode,
      status,
      creationDateTime,
      paymentTimeLimit,
      totalPrice,
      bookingReferences: bookingRefs,
      orderItems,
      passengers,
      journeys: journeys.length > 0 ? journeys : undefined,
      segments: segments.length > 0 ? segments : undefined,
    };
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
}

export const orderParser = new OrderParser();