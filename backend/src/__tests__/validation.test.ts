import { describe, it, expect } from "vitest";
import { airShoppingRequestSchema, passengerCountSchema, selectedOfferSchema } from "../validation/index.js";

describe("Validation Schemas", () => {
  describe("airShoppingRequestSchema", () => {
    it("validates correct input", () => {
      const validInput = {
        origin: "SYD",
        destination: "MEL",
        departureDate: "2025-03-15",
        passengers: [{ ptc: "ADT", count: 1 }],
      };
      const result = airShoppingRequestSchema.safeParse(validInput);
      expect(result.success).toBe(true);
    });

    it("validates round trip input", () => {
      const validInput = {
        origin: "SYD",
        destination: "MEL",
        departureDate: "2025-03-15",
        returnDate: "2025-03-20",
        passengers: [{ ptc: "ADT", count: 2 }, { ptc: "CHD", count: 1 }],
        cabinPreference: "M",
      };
      const result = airShoppingRequestSchema.safeParse(validInput);
      expect(result.success).toBe(true);
    });

    it("rejects invalid airport code", () => {
      const invalidInput = {
        origin: "SYDNEY",
        destination: "MEL",
        departureDate: "2025-03-15",
        passengers: [{ ptc: "ADT", count: 1 }],
      };
      const result = airShoppingRequestSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
    });

    it("rejects invalid date format", () => {
      const invalidInput = {
        origin: "SYD",
        destination: "MEL",
        departureDate: "15/03/2025",
        passengers: [{ ptc: "ADT", count: 1 }],
      };
      const result = airShoppingRequestSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
    });

    it("rejects missing passengers", () => {
      const invalidInput = {
        origin: "SYD",
        destination: "MEL",
        departureDate: "2025-03-15",
        passengers: [],
      };
      const result = airShoppingRequestSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
    });
  });

  describe("passengerCountSchema", () => {
    it("validates ADT passenger", () => {
      const result = passengerCountSchema.safeParse({ ptc: "ADT", count: 2 });
      expect(result.success).toBe(true);
    });

    it("rejects invalid PTC", () => {
      const result = passengerCountSchema.safeParse({ ptc: "ADULT", count: 1 });
      expect(result.success).toBe(false);
    });

    it("rejects count > 9", () => {
      const result = passengerCountSchema.safeParse({ ptc: "ADT", count: 10 });
      expect(result.success).toBe(false);
    });
  });

  describe("selectedOfferSchema", () => {
    it("validates correct offer selection", () => {
      const validOffer = {
        offerId: "OFFER123",
        ownerCode: "JQ",
        offerItemIds: ["ITEM1", "ITEM2"],
      };
      const result = selectedOfferSchema.safeParse(validOffer);
      expect(result.success).toBe(true);
    });

    it("rejects empty offerItemIds", () => {
      const invalidOffer = {
        offerId: "OFFER123",
        ownerCode: "JQ",
        offerItemIds: [],
      };
      const result = selectedOfferSchema.safeParse(invalidOffer);
      expect(result.success).toBe(false);
    });
  });
});