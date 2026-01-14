import { describe, it, expect } from "vitest";
import { buildAirShoppingXml } from "../builders/air-shopping.builder.js";
import { buildOrderRetrieveXml } from "../builders/order-retrieve.builder.js";

describe("XML Builders", () => {
  describe("buildAirShoppingXml", () => {
    it("builds valid XML for one-way flight", () => {
      const input = {
        origin: "SYD",
        destination: "MEL",
        departureDate: "2025-03-15",
        passengers: [{ ptc: "ADT" as const, count: 1 }],
      };
      const xml = buildAirShoppingXml(input);
      
      expect(xml).toContain('<?xml version="1.0"');
      expect(xml).toContain("<IATA_AirShoppingRQ");
      expect(xml).toContain("<IATA_LocationCode>SYD</IATA_LocationCode>");
      expect(xml).toContain("<IATA_LocationCode>MEL</IATA_LocationCode>");
      expect(xml).toContain("<Date>2025-03-15</Date>");
      expect(xml).toContain("<PTC>ADT</PTC>");
    });

    it("builds valid XML for round trip", () => {
      const input = {
        origin: "SYD",
        destination: "MEL",
        departureDate: "2025-03-15",
        returnDate: "2025-03-20",
        passengers: [{ ptc: "ADT" as const, count: 2 }],
      };
      const xml = buildAirShoppingXml(input);
      
      expect(xml).toContain("<Date>2025-03-15</Date>");
      expect(xml).toContain("<Date>2025-03-20</Date>");
      expect((xml.match(/<OriginDestCriteria>/g) || []).length).toBe(2);
    });
  });

  describe("buildOrderRetrieveXml", () => {
    it("builds valid XML for order retrieve", () => {
      const input = { orderId: "ABC123", ownerCode: "JQ" };
      const xml = buildOrderRetrieveXml(input);
      
      expect(xml).toContain("<IATA_OrderRetrieveRQ");
      expect(xml).toContain('Owner="JQ"');
      expect(xml).toContain(">ABC123</OrderID>");
    });
  });
});