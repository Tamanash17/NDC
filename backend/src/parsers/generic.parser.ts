// ============================================================================
// GENERIC RESPONSE PARSER
// Handles common parsing for all NDC responses
// ============================================================================

import { BaseXmlParser } from "./base.parser.js";

export interface GenericNDCResponse {
  success: boolean;
  errors?: Array<{ code: string; message: string }>;
  responseId?: string;
  orderId?: string;
  ownerCode?: string;
  rawXml?: string;
}

export class GenericParser extends BaseXmlParser {
  parse(xml: string): GenericNDCResponse {
    const doc = this.parseXml(xml);

    // Check for errors
    if (this.hasErrors(doc)) {
      return {
        success: false,
        errors: this.extractErrors(doc),
        rawXml: xml,
      };
    }

    // Extract common fields
    const responseId = this.getText(doc, "ResponseID") || undefined;
    const orderId = this.getText(doc, "OrderID") || this.getText(doc, "OrderRefID") || undefined;
    const ownerCode = this.parseOwnerCode(doc);

    return {
      success: true,
      responseId,
      orderId,
      ownerCode,
      rawXml: xml,
    };
  }

  private parseOwnerCode(doc: Document): string | undefined {
    // Try to find Owner attribute on OrderID or other elements
    const orderIdEl = this.getElement(doc, "OrderID");
    if (orderIdEl) {
      const owner = this.getAttribute(orderIdEl, "Owner");
      if (owner) return owner;
    }

    // Try OwnerCode element
    return this.getText(doc, "OwnerCode") || undefined;
  }
}

export const genericParser = new GenericParser();