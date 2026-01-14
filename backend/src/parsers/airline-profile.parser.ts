// ============================================================================
// AIRLINE PROFILE PARSER
// Parses AirlineProfile response to extract origin-destination pairs
// ============================================================================

import * as xml2js from "xml2js";

export interface OriginDestinationPair {
  origin: string;
  destination: string;
  directionalInd: string; // "3" = both directions typically
}

export interface AirlineProfileData {
  originDestinationPairs: OriginDestinationPair[];
  ownerCode?: string;
}

/**
 * Parse IATA_AirlineProfileRS XML response to extract OD pairs
 */
export async function parseAirlineProfileResponse(
  xmlResponse: string
): Promise<AirlineProfileData> {
  const parser = new xml2js.Parser({
    explicitArray: false,
    tagNameProcessors: [xml2js.processors.stripPrefix], // Remove namespace prefixes
    ignoreAttrs: false,
    mergeAttrs: true,
  });

  const result = await parser.parseStringPromise(xmlResponse);

  // Navigate to AirlineProfile data
  const response = result?.IATA_AirlineProfileRS?.Response;
  if (!response) {
    throw new Error("Invalid AirlineProfileRS: Missing Response element");
  }

  const airlineProfile = response.AirlineProfile;
  if (!airlineProfile) {
    return {
      originDestinationPairs: [],
    };
  }

  // Extract data items - can be array or single object
  let dataItems = airlineProfile.AirlineProfileDataItem;
  if (!dataItems) {
    return {
      originDestinationPairs: [],
    };
  }

  // Ensure dataItems is an array
  if (!Array.isArray(dataItems)) {
    dataItems = [dataItems];
  }

  const odPairs: OriginDestinationPair[] = [];

  // Parse each data item
  for (const dataItem of dataItems) {
    // Extract OfferFilterCriteria - can be array or single object
    let filterCriteria = dataItem.OfferFilterCriteria;
    if (!filterCriteria) continue;

    if (!Array.isArray(filterCriteria)) {
      filterCriteria = [filterCriteria];
    }

    // Parse each filter criteria
    for (const criteria of filterCriteria) {
      const choice = criteria.OfferFilterCriteriaChoice;
      if (!choice) continue;

      const odCriteria = choice.OfferFilterCriteriawithOriginandDest;
      if (!odCriteria) continue;

      // Extract origin and destination
      const origin = odCriteria.OfferOriginPoint?.IATA_LocationCode;
      const destination = odCriteria.OfferDestPoint?.IATA_LocationCode;
      const directionalInd = odCriteria.DirectionalIndText || "3";

      if (origin && destination) {
        odPairs.push({
          origin: String(origin),
          destination: String(destination),
          directionalInd: String(directionalInd),
        });
      }
    }
  }

  return {
    originDestinationPairs: odPairs,
  };
}

/**
 * Group OD pairs by origin for easier lookup
 */
export function groupByOrigin(
  odPairs: OriginDestinationPair[]
): Map<string, string[]> {
  const grouped = new Map<string, string[]>();

  for (const pair of odPairs) {
    const destinations = grouped.get(pair.origin) || [];
    if (!destinations.includes(pair.destination)) {
      destinations.push(pair.destination);
    }
    grouped.set(pair.origin, destinations);
  }

  return grouped;
}

/**
 * Check if a route is valid based on airline profile
 */
export function isValidRoute(
  origin: string,
  destination: string,
  odPairs: OriginDestinationPair[]
): boolean {
  return odPairs.some(
    (pair) =>
      pair.origin === origin &&
      pair.destination === destination
  );
}

/**
 * Get all available destinations from an origin
 */
export function getDestinationsFromOrigin(
  origin: string,
  odPairs: OriginDestinationPair[]
): string[] {
  return odPairs
    .filter((pair) => pair.origin === origin)
    .map((pair) => pair.destination);
}

/**
 * Get all available origins to a destination
 */
export function getOriginsToDestination(
  destination: string,
  odPairs: OriginDestinationPair[]
): string[] {
  return odPairs
    .filter((pair) => pair.destination === destination)
    .map((pair) => pair.origin);
}

export const airlineProfileParser = {
  parse: parseAirlineProfileResponse,
  groupByOrigin,
  isValidRoute,
  getDestinationsFromOrigin,
  getOriginsToDestination,
};
