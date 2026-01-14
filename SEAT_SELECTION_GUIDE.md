# Seat Selection Feature - Complete Guide

## Overview

The Seat Selection feature allows passengers to choose specific seats for each flight segment, with intelligent handling of special seat types, passenger restrictions, and automatic SSR (Special Service Request) generation.

---

## Key Features

### 1. Segment-Based Selection
- Each flight segment requires individual seat selection
- Multi-segment journeys (with layovers) show separate seat maps
- Automatic progression through all segments

### 2. Passenger-by-Passenger Selection
- Select seats for each passenger individually
- Visual indicator of which passengers have selected seats
- Auto-advance to next passenger after selection

### 3. Special Seat Detection & SSR Auto-Generation

#### Exit Row Seats (`EK`)
- **Characteristics**: Extra space, emergency exit responsibility
- **Restrictions**: NO children (CHD) or infants (INF) allowed
- **SSR Required**: None
- **Visual Indicator**: Red restriction warning for ineligible passengers

#### Upfront Seats (`F`)
- **Characteristics**: Front of cabin, early boarding/deplaning
- **SSR Required**: **`UPFX`** (Mandatory - auto-added to booking)
- **Visual Indicator**: Premium seat badge, tooltip shows SSR requirement
- **Price**: Usually chargeable

#### Extra Legroom Seats (`L`)
- **Characteristics**: Additional legroom
- **SSR Required**: **`LEGX`** (Mandatory - auto-added to booking)
- **Visual Indicator**: Premium seat badge, tooltip shows SSR requirement
- **Price**: Usually chargeable

#### Premium/Chargeable Seats (`CH`)
- **Characteristics**: Enhanced comfort, priority features
- **SSR Required**: None
- **Visual Indicator**: Premium badge
- **Price**: Chargeable

### 4. Passenger Safety Restrictions

Based on Jetstar NDC API safety regulations:

| Seat Characteristic | Restricted Passenger Types | Reason |
|---------------------|---------------------------|--------|
| `EK` (Exit Row) | CHD (Children), INF (Infants) | Safety: Must be able to operate emergency exits |
| `1C` | CHD (Children) | Explicit no-children restriction |
| `1N` | INF (Infants) | Explicit no-infants restriction |

---

## User Interface

### Layout

```
┌─────────────────────────────────────────────────────────────┐
│  🎯 Select Your Seats                                       │
│  Segment 1 of 3 • SYD → MEL (JQ501)                        │
│  Progress: [████████░░░░░░░░] 40%                          │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  Passenger Selector:                                         │
│  [Adult 1 ✓ 12A] [Adult 2 (current)] [Child 1] [Infant 1]  │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  Legend:                                                     │
│  🟢 Available  ⚪ Occupied  🔵 Selected  🟡 Premium          │
│  ⚠️ Exit rows not available for children/infants            │
│  ℹ️  Special seats may require additional SSRs               │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  ✈️ Aircraft Cabin • Rows 1-30                              │
│                                                              │
│  Row    A   B   C      D   E   F                           │
│   1    🟡  🟡  🟡     🟡  🟡  🟡  (Upfront - UPFX)         │
│   2    🟢  🟢  ⚪     🟢  🟢  🟢                           │
│   3    🟢  🔵  🟢     🟢  🟢  ⚪                           │
│  ...                                                         │
│  12    🟠  🟠  🟠     🟠  🟠  🟠  (Exit Row - EK)          │
│  13    🟡  🟡  🟡     🟡  🟡  🟡  (Extra Legroom - LEGX)   │
│  ...                                                         │
└─────────────────────────────────────────────────────────────┘

[← Previous Segment]         [Skip Seats]  [Next Segment →]
```

### Seat States & Colors

| State | Color | Border | Condition |
|-------|-------|--------|-----------|
| Available | Green (`bg-green-100`) | Green | Free seat, no restrictions |
| Selected | Blue (`bg-blue-500`) | Blue | Current passenger selected |
| Occupied | Gray (`bg-neutral-200`) | Gray | Already taken |
| Restricted | Red (`bg-red-50`) | Red | Not allowed for current passenger type |
| Premium | Amber (`bg-amber-100`) | Amber | Paid/special seat (L, F, CH, EK) |

### Hover Tooltips

When hovering over a seat, display:
```
┌─────────────────────┐
│ Seat 12A            │
│ Window, Exit Row    │
│ $25.00 AUD          │
│ Required: UPFX      │
└─────────────────────┘
```

---

## Technical Implementation

### Component Structure

```
SeatSelectionStep (Main Container)
├── Progress Header
│   ├── Segment info
│   ├── Current passenger
│   └── Progress bar
├── Passenger Selector
│   └── Passenger buttons with selection status
├── Legend
│   └── Seat state explanations
├── SeatMapDisplay
│   └── SeatRow (per row)
│       └── SeatButton (per seat)
│           └── Tooltip
└── Navigation
    ├── Previous Segment
    ├── Skip Seats
    └── Next Segment / Continue
```

### Data Flow

```
1. Component Mount
   ↓
2. Fetch Seat Availability API
   - POST /api/seat-availability
   - Body: { offerId, ownerCode, segmentRefIds }
   ↓
3. Parse Seat Maps
   - Map segments to seat data
   - Extract cabin compartments, rows, seats
   ↓
4. User Interaction
   - Click seat → Validate restrictions
   - Check if occupied
   - Check passenger type eligibility
   ↓
5. Selection Storage
   {
     passengerId: 'ADT0',
     segmentId: 'seg123',
     seatId: '12A',
     characteristics: ['W', 'EK'],
     requiredSSRs: []  // Empty for exit row
   }
   ↓
6. Special Seat Detection
   - Detect L, F, EK, CH characteristics
   - Auto-add required SSRs to list
   ↓
7. Segment Completion
   - All passengers selected? → Next segment
   - All segments done? → Continue to next step
   ↓
8. Save Selections
   - Store seat selections in flight store
   - Extract all required SSRs
   - Pass to OrderCreate step
```

### Selection State Interface

```typescript
interface SeatSelection {
  passengerId: string;           // e.g., 'ADT0', 'CHD0', 'INF0'
  passengerType: 'ADT' | 'CHD' | 'INF';
  passengerName: string;          // e.g., 'Adult 1'
  segmentId: string;              // Segment reference ID
  seatId: string;                 // e.g., '12A'
  row: string;                    // e.g., '12'
  column: string;                 // e.g., 'A'
  price: number;                  // Seat price (0 if free)
  currency: string;               // e.g., 'AUD'
  characteristics: string[];      // e.g., ['W', 'EK']
  requiredSSRs: string[];        // e.g., ['UPFX'], ['LEGX']
  offerItemRefId?: string;        // API reference for pricing
}
```

---

## SSR Auto-Generation Logic

### Mapping Rules

```typescript
const SSR_REQUIREMENTS: Record<string, string> = {
  'L': 'LEGX',  // Extra Legroom → LEGX SSR
  'F': 'UPFX',  // Upfront → UPFX SSR
};
```

### Generation Process

1. **Seat Selection**: User clicks seat with characteristic `F` (Upfront)
2. **Detection**: System detects `F` in `seat.characteristics`
3. **Lookup**: `SSR_REQUIREMENTS['F']` returns `'UPFX'`
4. **Storage**: Add `'UPFX'` to `selection.requiredSSRs[]`
5. **Display**: Show info badge "Required: UPFX" in tooltip
6. **OrderCreate**: Include all `requiredSSRs` in booking request

### Example: Upfront Seat Selection

```typescript
// User selects seat 3B (Upfront)
const seat = {
  columnId: 'B',
  rowNumber: '3',
  characteristics: ['A', 'F'],  // Aisle + Upfront
  price: 15.00,
};

// Auto-generate SSRs
const requiredSSRs = getRequiredSSRs(['A', 'F']);
// Returns: ['UPFX']

// Store selection
{
  passengerId: 'ADT0',
  seatId: '3B',
  characteristics: ['A', 'F'],
  requiredSSRs: ['UPFX'],  // ← Will be added to OrderCreate
}
```

### Final OrderCreate Request

When submitting the booking, the system will:

1. Collect all `requiredSSRs` from seat selections
2. Deduplicate (e.g., if 2 passengers select upfront, only send UPFX once per passenger)
3. Add to OrderCreate XML:

```xml
<OrderCreate>
  <!-- ... other booking details ... -->
  <Services>
    <!-- Seat selections -->
    <Service>
      <ServiceID>SEAT_ADT0_SEG1</ServiceID>
      <SeatAssignment>
        <Row>3</Row>
        <Column>B</Column>
      </SeatAssignment>
    </Service>

    <!-- Auto-generated SSRs -->
    <Service>
      <ServiceCode>UPFX</ServiceCode>
      <PassengerRef>ADT0</PassengerRef>
      <SegmentRef>SEG1</SegmentRef>
    </Service>
  </Services>
</OrderCreate>
```

---

## Restriction Validation

### Function: `isSeatRestricted()`

```typescript
function isSeatRestricted(
  characteristics: string[],
  passengerType: 'ADT' | 'CHD' | 'INF'
): boolean {
  for (const char of characteristics) {
    const restrictions = PASSENGER_RESTRICTIONS[char];
    if (restrictions && restrictions.includes(passengerType)) {
      return true;  // Seat not allowed
    }
  }
  return false;  // Seat allowed
}
```

### Example Scenarios

#### Scenario 1: Child Selecting Exit Row
```typescript
isSeatRestricted(['W', 'EK'], 'CHD')
// Checks PASSENGER_RESTRICTIONS['EK'] = ['CHD', 'INF']
// 'CHD' is in the list
// Returns: true (RESTRICTED)
```

#### Scenario 2: Adult Selecting Exit Row
```typescript
isSeatRestricted(['W', 'EK'], 'ADT')
// Checks PASSENGER_RESTRICTIONS['EK'] = ['CHD', 'INF']
// 'ADT' is NOT in the list
// Returns: false (ALLOWED)
```

#### Scenario 3: Infant Selecting Regular Seat
```typescript
isSeatRestricted(['W', 'A'], 'INF')
// No restrictions for 'W' or 'A'
// Returns: false (ALLOWED)
```

---

## API Integration

### SeatAvailability Request

```http
POST /api/seat-availability
Content-Type: application/json

{
  "offerId": "offer-abc-123",
  "ownerCode": "JQ",
  "responseId": "shopping-response-xyz",
  "segmentRefIds": ["seg-1", "seg-2", "seg-3"]
}
```

### SeatAvailability Response

```json
{
  "success": true,
  "seatMaps": [
    {
      "paxSegmentRefId": "seg-1",
      "cabinCompartments": [
        {
          "cabinTypeCode": "M",  // Economy
          "firstRow": 1,
          "lastRow": 30,
          "columnLayout": "ABC DEF",
          "seatRows": [
            {
              "rowNumber": "12",
              "seats": [
                {
                  "columnId": "A",
                  "rowNumber": "12",
                  "occupationStatus": "F",  // Free
                  "characteristics": ["W", "EK"],  // Window, Exit Row
                  "offerItemRefId": "seat-offer-123",
                  "price": 0  // Free exit row
                }
              ]
            }
          ]
        }
      ]
    }
  ]
}
```

---

## Testing Checklist

### Basic Functionality
- [ ] Seat map loads for all segments
- [ ] Can select seat for each passenger
- [ ] Selected seats show in blue
- [ ] Can change seat selection
- [ ] Progress bar updates correctly
- [ ] Auto-advance to next passenger works

### Special Seats
- [ ] Exit rows show amber color
- [ ] Upfront seats show amber color
- [ ] Extra legroom seats show amber color
- [ ] Premium seats show price badge
- [ ] Hover tooltips display correctly

### Restrictions
- [ ] Children cannot select exit rows
- [ ] Infants cannot select exit rows
- [ ] Restricted seats show red for ineligible passengers
- [ ] Alert shown when clicking restricted seat

### SSR Generation
- [ ] Upfront seat selection adds UPFX to requiredSSRs
- [ ] Extra legroom selection adds LEGX to requiredSSRs
- [ ] Exit row selection does NOT add SSRs
- [ ] Multiple selections deduplicate SSRs correctly

### Navigation
- [ ] Can navigate between segments
- [ ] Previous segment button works
- [ ] Next segment button works
- [ ] Skip seats button bypasses selection
- [ ] Continue button appears on final segment

---

## Future Enhancements

1. **Seat Recommendations**: Suggest best available seats based on passenger preferences
2. **Group Seating**: Auto-select adjacent seats for families
3. **Seat Filtering**: Filter by window/aisle/characteristics
4. **Price Sorting**: Show cheapest/most expensive seats first
5. **Seat Preview Images**: Show actual seat photos
6. **Real-time Updates**: WebSocket for live seat availability

---

## Common Issues & Solutions

### Issue: Seats Not Loading
**Cause**: API call failed or returned empty seat maps
**Solution**: Check network tab, verify offerId and segmentRefIds are correct

### Issue: All Seats Show as Occupied
**Cause**: Occupation status incorrectly parsed
**Solution**: Verify parser maps 'F'/'A'/'O' status correctly

### Issue: Restrictions Not Working
**Cause**: Passenger type not matching
**Solution**: Ensure passenger types are exactly 'ADT', 'CHD', 'INF'

### Issue: SSRs Not Generated
**Cause**: Characteristics not detected
**Solution**: Check seat.characteristics array contains 'L' or 'F'

### Issue: Price Not Showing
**Cause**: seat.price is undefined or 0
**Solution**: Check if price comes from seat object or offer item

---

## Code Reference

**Main Component**: `frontend/src/steps/seat-selection/SeatSelectionStep.tsx`
**Type Definitions**: Lines 11-44 (interfaces and constants)
**SSR Logic**: Lines 138-147 (`getRequiredSSRs` function)
**Restriction Logic**: Lines 127-137 (`isSeatRestricted` function)
**Selection Handler**: Lines 159-193 (`handleSeatSelect` function)

---

## Contact & Support

For questions or issues with seat selection:
- Check the Jetstar NDC API documentation for SeatAvailability endpoint
- Review Postman collection "SeatAvailability" request for examples
- Refer to FIXES_2026-01-10.md for general debugging tips

**Last Updated**: 2026-01-10
**Component Version**: 1.0.0
