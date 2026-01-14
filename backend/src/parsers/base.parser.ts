// ============================================================================
// BASE XML PARSER
// Uses @xmldom/xmldom for XML parsing
// ============================================================================

import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
import { logger } from "../utils/logger.js";

export class BaseXmlParser {
  protected readonly parser: DOMParser;
  protected readonly serializer: XMLSerializer;

  constructor() {
    this.parser = new DOMParser();
    this.serializer = new XMLSerializer();
  }

  /**
   * Parse XML string to Document
   */
  protected parseXml(xml: string): Document {
    try {
      return this.parser.parseFromString(xml, "text/xml");
    } catch (error) {
      logger.error({ error }, "Failed to parse XML");
      throw new Error(`XML parsing failed: ${(error as Error).message}`);
    }
  }

  /**
   * Get text content of first matching element
   */
  protected getText(parent: Element | Document, tagName: string): string | null {
    const elements = parent.getElementsByTagName(tagName);
    if (elements.length === 0) return null;
    return elements[0]?.textContent?.trim() || null;
  }

  /**
   * Get all elements matching tag name
   */
  protected getElements(parent: Element | Document, tagName: string): Element[] {
    const nodeList = parent.getElementsByTagName(tagName);
    return Array.from(nodeList) as Element[];
  }

  /**
   * Get first element matching tag name
   */
  protected getElement(parent: Element | Document, tagName: string): Element | null {
    const elements = parent.getElementsByTagName(tagName);
    return (elements[0] as Element) || null;
  }

  /**
   * Get attribute value
   */
  protected getAttribute(element: Element, name: string): string | null {
    return element.getAttribute(name);
  }

  /**
   * Check if response contains errors
   */
  protected hasErrors(doc: Document): boolean {
    const errors = doc.getElementsByTagName("Error");
    return errors.length > 0;
  }

  /**
   * Extract errors from response
   * Jetstar uses: <Error><DescText>message</DescText><TypeCode>code</TypeCode></Error>
   */
  protected extractErrors(doc: Document): Array<{ code: string; message: string }> {
    const errorElements = this.getElements(doc, "Error");
    return errorElements.map((el) => ({
      code: this.getAttribute(el, "Code") ||
            this.getText(el, "Code") ||
            this.getText(el, "TypeCode") ||
            "UNKNOWN",
      message: this.getText(el, "Description") ||
               this.getText(el, "DescText") ||
               this.getText(el, "Message") ||
               el.textContent?.trim() ||
               "Unknown error",
    }));
  }

  /**
   * Parse amount with currency
   */
  protected parseAmount(element: Element | null): { value: number; currency: string } | null {
    if (!element) return null;
    const value = parseFloat(element.textContent || "0");
    const currency = this.getAttribute(element, "CurCode") || "AUD";
    return { value, currency };
  }
}