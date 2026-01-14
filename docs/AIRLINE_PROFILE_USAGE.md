# Airline Profile Integration Guide

## Overview

The Airline Profile feature allows you to fetch the complete list of origin-destination (OD) pairs supported by an airline. This replaces hardcoded airport combinations and enables dynamic route validation and airport dropdowns in your booking engine.

## How It Works

### 1. Fetch Airline Profile

First, request the airline's route network using the AirlineProfile endpoint:

```typescript
POST /api/ndc/airline-profile

{
  "ownerCode": "NV",  // Airline code (e.g., NV for Jetstar)
  "distributionChain": {
    "links": [{
      "ordinal": 1,
      "orgRole": "Seller",
      "orgId": "101234567"
    }]
  }
}
```

### 2. Response Structure

The API returns all available origin-destination pairs:

```typescript
{
  "success": true,
  "data": {
    "originDestinationPairs": [
      {
        "origin": "AAH",
        "destination": "CGN",
        "directionalInd": "3"  // 3 = both directions
      },
      {
        "origin": "AAH",
        "destination": "DON",
        "directionalInd": "3"
      },
      // ... hundreds more
    ],
    "ownerCode": "NV"
  }
}
```

### 3. Store OD Pairs

Store the OD pairs in your application state for:
- **Route Validation**: Check if a user's selected origin/destination is valid
- **Dynamic Dropdowns**: Populate destination airports based on selected origin
- **Auto-complete**: Filter available destinations as user types

### 4. Use with Air Shopping

Once you have the OD pairs, validate routes before calling AirShopping:

```typescript
// Example: Validate route before search
const isValidRoute = airlineProfileParser.isValidRoute(
  "SYD",  // origin
  "MEL",  // destination
  odPairs
);

if (!isValidRoute) {
  // Show error: "No flights available on this route"
  return;
}

// Proceed with air shopping
const searchResult = await fetch('/api/ndc/air-shopping', {
  method: 'POST',
  body: JSON.stringify({
    origin: "SYD",
    destination: "MEL",
    departureDate: "2026-03-15",
    passengers: [{ ptc: "ADT", count: 1 }],
    distributionChain: { /* ... */ }
  })
});
```

## Helper Functions

The parser provides utility functions:

### Get Destinations from Origin

```typescript
import { airlineProfileParser } from './parsers/airline-profile.parser';

const destinations = airlineProfileParser.getDestinationsFromOrigin(
  "SYD",
  odPairs
);
// Returns: ["MEL", "BNE", "OOL", "ADL", ...]
```

### Get Origins to Destination

```typescript
const origins = airlineProfileParser.getOriginsToDestination(
  "MEL",
  odPairs
);
// Returns: ["SYD", "BNE", "OOL", "ADL", ...]
```

### Group by Origin

```typescript
const grouped = airlineProfileParser.groupByOrigin(odPairs);
// Returns: Map<string, string[]>
// {
//   "SYD": ["MEL", "BNE", "OOL", ...],
//   "MEL": ["SYD", "BNE", "OOL", ...],
//   ...
// }
```

## Frontend Integration Example

### 1. Fetch and Cache OD Pairs on App Load

```typescript
// In your app initialization or session store
async function loadAirlineRoutes(ownerCode: string) {
  const response = await fetch('/api/ndc/airline-profile', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'Ocp-Apim-Subscription-Key': subscriptionKey
    },
    body: JSON.stringify({
      ownerCode,
      distributionChain: getDistributionContext()
    })
  });

  const result = await response.json();

  if (result.success) {
    // Store in state management (Zustand, Redux, etc.)
    sessionStore.setAirlineRoutes(result.data.originDestinationPairs);
  }
}
```

### 2. Dynamic Destination Dropdown

```typescript
function FlightSearchForm() {
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const odPairs = useSessionStore(state => state.airlineRoutes);

  // Get available destinations based on selected origin
  const availableDestinations = useMemo(() => {
    if (!origin || !odPairs) return [];

    return odPairs
      .filter(pair => pair.origin === origin)
      .map(pair => pair.destination);
  }, [origin, odPairs]);

  return (
    <form>
      <AirportSelect
        value={origin}
        onChange={setOrigin}
        label="From"
      />

      <AirportSelect
        value={destination}
        onChange={setDestination}
        label="To"
        // Only show valid destinations for selected origin
        filterAirports={availableDestinations}
        disabled={!origin}
      />

      <button type="submit">Search Flights</button>
    </form>
  );
}
```

### 3. Route Validation Before Search

```typescript
function handleFlightSearch() {
  // Validate route exists
  const isValid = odPairs.some(
    pair => pair.origin === origin && pair.destination === destination
  );

  if (!isValid) {
    toast.error(`No flights available from ${origin} to ${destination}`);
    return;
  }

  // Proceed with search
  performAirShopping({ origin, destination, ... });
}
```

## Caching Strategy

### Option 1: Session Storage (Recommended)
- Fetch once per user session
- Store in SessionStore/Context
- Re-fetch on airline change or session expiry

### Option 2: LocalStorage with TTL
- Cache for 24 hours
- Reduces API calls
- Check if cache expired before use

```typescript
const CACHE_KEY = 'airline_routes';
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

function getCachedRoutes(ownerCode: string) {
  const cached = localStorage.getItem(`${CACHE_KEY}_${ownerCode}`);

  if (!cached) return null;

  const { data, timestamp } = JSON.parse(cached);
  const isExpired = Date.now() - timestamp > CACHE_TTL;

  return isExpired ? null : data;
}

function setCachedRoutes(ownerCode: string, routes: OriginDestinationPair[]) {
  localStorage.setItem(
    `${CACHE_KEY}_${ownerCode}`,
    JSON.stringify({
      data: routes,
      timestamp: Date.now()
    })
  );
}
```

## API Endpoint Details

### Request
- **Method**: POST
- **Endpoint**: `/api/ndc/airline-profile`
- **Auth**: Bearer token + Subscription Key
- **Body**: `{ ownerCode: string, distributionChain: DistributionChain }`

### Response
```typescript
{
  success: boolean;
  data: {
    originDestinationPairs: Array<{
      origin: string;           // IATA airport code
      destination: string;      // IATA airport code
      directionalInd: string;   // Usually "3" (both directions)
    }>;
    ownerCode?: string;         // Airline code
  };
  requestXml: string;           // Request XML sent to airline
  responseXml: string;          // Response XML from airline
}
```

## Directional Indicator Values

The `directionalInd` field indicates route direction:
- **"1"**: Outbound only (origin → destination)
- **"2"**: Inbound only (destination → origin)
- **"3"**: Both directions (most common)

## Common Use Cases

### 1. Route Network Visualization
Display all routes on a map by plotting all OD pairs.

### 2. Smart Airport Search
Filter airport suggestions based on available routes from selected origin.

### 3. Open Jaw Booking Validation
Validate complex multi-city routes by checking each leg.

### 4. Error Prevention
Show only bookable routes, preventing "No flights found" errors.

## Performance Considerations

- **Initial Load**: ~1-5 seconds depending on airline network size
- **Response Size**: Can be large (hundreds of routes). Consider compression.
- **Caching**: Essential - fetch once per session, not per search
- **Filtering**: Use indexed data structures (Map, Set) for fast lookups

## Error Handling

```typescript
try {
  const response = await fetch('/api/ndc/airline-profile', { /* ... */ });
  const result = await response.json();

  if (!result.success) {
    console.error('Failed to load airline routes:', result.error);
    // Fallback: Allow any airport pair (no validation)
    // or show error message to user
  }
} catch (error) {
  console.error('Network error loading routes:', error);
  // Implement retry logic or fallback
}
```

## XML Format Reference

### Request XML
```xml
<?xml version="1.0" encoding="UTF-8"?>
<IATA_AirlineProfileRQ xmlns="http://www.iata.org/IATA/2015/EASD/00/IATA_OffersAndOrdersMessage">
  <DistributionChain>
    <DistributionChainLink xmlns="http://www.iata.org/IATA/2015/EASD/00/IATA_OffersAndOrdersCommonTypes">
      <Ordinal>1</Ordinal>
      <ParticipatingOrg>
        <OrgID>101234567</OrgID>
        <OrgRole>Seller</OrgRole>
      </ParticipatingOrg>
    </DistributionChainLink>
  </DistributionChain>
  <PayloadAttributes>
    <VersionNumber xmlns="http://www.iata.org/IATA/2015/EASD/00/IATA_OffersAndOrdersCommonTypes">21.3</VersionNumber>
  </PayloadAttributes>
  <Request>
    <AirlineProfileFilterCriteria xmlns="http://www.iata.org/IATA/2015/EASD/00/IATA_OffersAndOrdersCommonTypes">
      <AirlineProfileCriteria>
        <OwnerCode>NV</OwnerCode>
      </AirlineProfileCriteria>
    </AirlineProfileFilterCriteria>
  </Request>
</IATA_AirlineProfileRQ>
```

### Response XML (abbreviated)
```xml
<IATA_AirlineProfileRS xmlns="http://www.iata.org/IATA/2015/EASD/00/IATA_OffersAndOrdersMessage">
  <Response>
    <AirlineProfile xmlns="http://www.iata.org/IATA/2015/EASD/00/IATA_OffersAndOrdersCommonTypes">
      <AirlineProfileDataItem>
        <ActionTypeCode>Add</ActionTypeCode>
        <OfferFilterCriteria>
          <OfferFilterCriteriaChoice>
            <OfferFilterCriteriawithOriginandDest>
              <DirectionalIndText>3</DirectionalIndText>
              <OfferDestPoint>
                <IATA_LocationCode>CGN</IATA_LocationCode>
              </OfferDestPoint>
              <OfferOriginPoint>
                <IATA_LocationCode>AAH</IATA_LocationCode>
              </OfferOriginPoint>
            </OfferFilterCriteriawithOriginandDest>
          </OfferFilterCriteriaChoice>
        </OfferFilterCriteria>
        <!-- More criteria... -->
      </AirlineProfileDataItem>
    </AirlineProfile>
  </Response>
</IATA_AirlineProfileRS>
```

## Testing

### Test with Postman/cURL

```bash
curl -X POST http://localhost:3001/api/ndc/airline-profile \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Ocp-Apim-Subscription-Key: YOUR_KEY" \
  -d '{
    "ownerCode": "NV",
    "distributionChain": {
      "links": [{
        "ordinal": 1,
        "orgRole": "Seller",
        "orgId": "101234567"
      }]
    }
  }'
```

## Next Steps

1. **Fetch airline routes** on app initialization
2. **Cache the routes** in session storage
3. **Implement dynamic dropdowns** in flight search
4. **Add route validation** before air shopping calls
5. **Consider multi-airline** support if needed

## Benefits

✅ **No hardcoded routes** - Always up-to-date with airline network
✅ **Better UX** - Only show bookable routes
✅ **Fewer errors** - Prevent searches on unavailable routes
✅ **Dynamic updates** - Airline adds new routes? You get them automatically
✅ **Smart filtering** - Destination list changes based on origin
