// ============================================================================
// BASE XML BUILDER
// Foundation class for all NDC XML builders
// ============================================================================

import type { DistributionChain } from "../types/ndc.types.js";
import { config } from "../config/index.js";

// NDC 21.3 Namespaces
export const NDC_NAMESPACES = {
  airShopping: "http://www.iata.org/IATA/2015/00/2019.2/IATA_AirShoppingRQ",
  offerPrice: "http://www.iata.org/IATA/2015/00/2019.2/IATA_OfferPriceRQ",
  serviceList: "http://www.iata.org/IATA/2015/00/2019.2/IATA_ServiceListRQ",
  seatAvailability: "http://www.iata.org/IATA/2015/00/2019.2/IATA_SeatAvailabilityRQ",
  orderCreate: "http://www.iata.org/IATA/2015/00/2019.2/IATA_OrderCreateRQ",
  orderRetrieve: "http://www.iata.org/IATA/2015/00/2019.2/IATA_OrderRetrieveRQ",
  orderReshop: "http://www.iata.org/IATA/2015/00/2019.2/IATA_OrderReshopRQ",
  orderQuote: "http://www.iata.org/IATA/2015/00/2019.2/IATA_OrderQuoteRQ",
  orderChange: "http://www.iata.org/IATA/2015/00/2019.2/IATA_OrderChangeRQ",
} as const;

/**
 * Escape XML special characters
 */
export function escapeXml(value: string | undefined | null): string {
  if (!value) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Format date as YYYY-MM-DD
 */
export function formatDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toISOString().split("T")[0]!;
}

/**
 * Format datetime as ISO string
 */
export function formatDateTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toISOString();
}

/**
 * Build Point of Sale element with defaults
 */
export function buildPointOfSale(countryCode?: string, cityCode?: string): string {
  const country = countryCode || config.distributionChain.countryCode;
  const city = cityCode || config.distributionChain.cityCode;
  
  return `
  <PointOfSale>
    <Location>
      <CountryCode>${escapeXml(country)}</CountryCode>
      <CityCode>${escapeXml(city)}</CityCode>
    </Location>
    <RequestTime>${new Date().toISOString()}</RequestTime>
  </PointOfSale>`;
}

/**
 * Build Distribution Chain / Party element
 * Priority: chain parameter > config values > empty fallback
 */
export function buildParty(chain?: DistributionChain): string {
  const ownerCode = chain?.ownerCode || config.distributionChain.ownerCode;

  // Use chain links from parameter first, then config, with sensible defaults
  const orgId = chain?.links?.[0]?.orgId || config.distributionChain.orgCode;
  const orgName = chain?.links?.[0]?.orgName || config.distributionChain.orgName || orgId;

  let xml = `
  <Party>
    <Sender>
      <TravelAgency>
        <AgencyID>${escapeXml(orgId)}</AgencyID>
        <Name>${escapeXml(orgName)}</Name>
      </TravelAgency>
    </Sender>
    <Recipient>
      <Airline>
        <AirlineDesigCode>${escapeXml(ownerCode)}</AirlineDesigCode>
      </Airline>
    </Recipient>
  </Party>`;

  return xml;
}

/**
 * Conditionally include XML if value exists
 */
export function optional(value: unknown, xml: string): string {
  return value !== undefined && value !== null && value !== "" ? xml : "";
}