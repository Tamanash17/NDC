/**
 * XML Annotator - Adds human-readable comments to NDC XML requests
 *
 * This utility enriches XML requests with contextual comments that explain
 * what the cryptic IDs mean, making it easier for the API team to debug.
 *
 * Features:
 * - Professional state-of-art comment blocks
 * - Human-readable flight numbers, passenger names, pricing
 * - Service association types (Per Segment/Leg/Journey)
 * - ID mapping for API correlation
 */

// ============================================================================
// TYPES
// ============================================================================

export interface FlightContext {
  origin?: string;
  destination?: string;
  departureDate?: string;
  returnDate?: string;
  cabinClass?: string;
  passengers?: {
    adults: number;
    children: number;
    infants: number;
  };
}

export interface OfferContext {
  offerId?: string;
  offerItemIds?: string[];
  bundleId?: string;
  bundleName?: string;
  bundleCode?: string;
  bundlePrice?: number;
  flightNumber?: string;
  route?: string;
  departureTime?: string;
  fareBasis?: string;
  cabinClass?: string;
  direction?: 'outbound' | 'inbound';
}

export interface ServiceContext {
  serviceCode?: string;
  serviceName?: string;
  serviceType?: string; // e.g., "Baggage", "Meal", "Seat"
  quantity?: number;
  price?: number;
  currency?: string;
  passengerRef?: string;
  segmentRef?: string;
  associationType?: 'segment' | 'journey' | 'leg' | 'unknown';
  direction?: 'outbound' | 'inbound' | 'both';
}

export interface PassengerContext {
  paxId: string;
  ptc: string; // ADT, CHD, INF
  name?: string;
  firstName?: string;
  lastName?: string;
  dateOfBirth?: string;
}

export interface PricingContext {
  flightsTotal?: number;
  bundlesTotal?: number;
  servicesTotal?: number;
  grandTotal?: number;
  currency?: string;
}

export interface AnnotationContext {
  operation: string;
  flight?: FlightContext;
  outboundOffer?: OfferContext;
  inboundOffer?: OfferContext;
  services?: ServiceContext[];
  passengers?: PassengerContext[];
  pricing?: PricingContext;
  shoppingResponseId?: string;
  outboundOfferId?: string;
  inboundOfferId?: string;
  orderId?: string;
  pnr?: string;
  timestamp?: Date;
  stepInWorkflow?: string;
  previousStep?: string;
  changesSinceLastStep?: string[];
}

/**
 * Summary for display in UI card
 */
export interface XmlSummary {
  title: string;
  subtitle: string;
  details: Array<{
    label: string;
    value: string;
    icon?: 'plane' | 'users' | 'calendar' | 'briefcase' | 'tag' | 'credit-card' | 'package';
  }>;
  highlights?: Array<{
    label: string;
    value: string;
    color: 'blue' | 'green' | 'amber' | 'red';
  }>;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const LINE_WIDTH = 80;
const BORDER_CHAR = '═';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function pad(str: string, width: number): string {
  return str.substring(0, width).padEnd(width);
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return '';
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-AU', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  } catch {
    return dateStr;
  }
}

function formatTime(timeStr?: string): string {
  if (!timeStr) return '';
  if (timeStr.includes('T')) {
    try {
      const date = new Date(timeStr);
      return date.toLocaleTimeString('en-AU', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      });
    } catch {
      return timeStr;
    }
  }
  return timeStr;
}

function formatCurrency(amount?: number, currency?: string): string {
  if (amount === undefined) return '';
  const curr = currency || 'AUD';
  return `${curr} ${amount.toFixed(2)}`;
}

function formatPassengerCounts(passengers?: { adults: number; children: number; infants: number }): string {
  if (!passengers) return '';
  const parts: string[] = [];
  if (passengers.adults > 0) parts.push(`${passengers.adults} ADT`);
  if (passengers.children > 0) parts.push(`${passengers.children} CHD`);
  if (passengers.infants > 0) parts.push(`${passengers.infants} INF`);
  return parts.join(', ');
}

function getOperationDescription(operation: string): string {
  const descriptions: Record<string, string> = {
    'AirShopping': 'Searching for available flights and fares',
    'OfferPrice': 'Verifying pricing for selected offers',
    'ServiceList': 'Retrieving available ancillary services',
    'SeatAvailability': 'Checking available seats for selection',
    'OrderCreate': 'Creating booking with payment',
    'OrderRetrieve': 'Retrieving existing booking details',
    'OrderCancel': 'Cancelling an existing booking',
    'OrderReshop': 'Searching for rebooking alternatives',
    'OrderQuote': 'Getting updated pricing for changes',
  };
  return descriptions[operation] || `Processing ${operation} request`;
}

/**
 * Creates a human-readable header comment for XML requests
 */
export function createXmlHeader(ctx: AnnotationContext): string {
  const lines: string[] = [];
  const timestamp = ctx.timestamp || new Date();

  lines.push('='.repeat(80));
  lines.push(`NDC ${ctx.operation} Request`);
  lines.push(`Generated: ${timestamp.toISOString()}`);

  if (ctx.stepInWorkflow) {
    lines.push(`Workflow Step: ${ctx.stepInWorkflow}`);
  }

  lines.push('='.repeat(80));
  lines.push('');

  // Flight Search Context
  if (ctx.flight) {
    lines.push('SEARCH CRITERIA:');
    if (ctx.flight.origin && ctx.flight.destination) {
      lines.push(`  Route: ${ctx.flight.origin} → ${ctx.flight.destination}`);
    }
    if (ctx.flight.departureDate) {
      lines.push(`  Departure: ${ctx.flight.departureDate}`);
    }
    if (ctx.flight.returnDate) {
      lines.push(`  Return: ${ctx.flight.returnDate}`);
    }
    if (ctx.flight.cabinClass) {
      lines.push(`  Cabin: ${ctx.flight.cabinClass}`);
    }
    if (ctx.flight.passengers) {
      const pax = ctx.flight.passengers;
      const parts: string[] = [];
      if (pax.adults > 0) parts.push(`${pax.adults} Adult${pax.adults > 1 ? 's' : ''}`);
      if (pax.children > 0) parts.push(`${pax.children} Child${pax.children > 1 ? 'ren' : ''}`);
      if (pax.infants > 0) parts.push(`${pax.infants} Infant${pax.infants > 1 ? 's' : ''}`);
      lines.push(`  Passengers: ${parts.join(', ')}`);
    }
    lines.push('');
  }

  // Outbound Offer
  if (ctx.outboundOffer) {
    lines.push('OUTBOUND FLIGHT SELECTED:');
    lines.push(formatOfferContext(ctx.outboundOffer, '  '));
    lines.push('');
  }

  // Inbound Offer
  if (ctx.inboundOffer) {
    lines.push('INBOUND FLIGHT SELECTED:');
    lines.push(formatOfferContext(ctx.inboundOffer, '  '));
    lines.push('');
  }

  // Services/Ancillaries
  if (ctx.services && ctx.services.length > 0) {
    lines.push('SERVICES SELECTED:');
    ctx.services.forEach((svc, idx) => {
      lines.push(`  ${idx + 1}. ${svc.serviceName || svc.serviceCode || 'Unknown Service'}`);
      if (svc.serviceType) lines.push(`     Type: ${svc.serviceType}`);
      if (svc.quantity) lines.push(`     Quantity: ${svc.quantity}`);
      if (svc.price && svc.currency) lines.push(`     Price: ${svc.currency} ${svc.price.toFixed(2)}`);
      if (svc.passengerRef) lines.push(`     For Passenger: ${svc.passengerRef}`);
      if (svc.segmentRef) lines.push(`     For Segment: ${svc.segmentRef}`);
    });
    lines.push('');
  }

  // Passengers
  if (ctx.passengers && ctx.passengers.length > 0) {
    lines.push('PASSENGERS:');
    ctx.passengers.forEach((pax, idx) => {
      const ptcLabel = pax.ptc === 'ADT' ? 'Adult' : pax.ptc === 'CHD' ? 'Child' : pax.ptc === 'INF' ? 'Infant' : pax.ptc;
      lines.push(`  ${idx + 1}. ${pax.name || pax.paxId} (${ptcLabel})`);
      if (pax.dateOfBirth) lines.push(`     DOB: ${pax.dateOfBirth}`);
    });
    lines.push('');
  }

  // Shopping Response ID
  if (ctx.shoppingResponseId) {
    lines.push('REFERENCE IDs:');
    lines.push(`  ShoppingResponseID: ${ctx.shoppingResponseId}`);
    lines.push('');
  }

  // Changes since last step
  if (ctx.changesSinceLastStep && ctx.changesSinceLastStep.length > 0) {
    lines.push('CHANGES SINCE LAST STEP:');
    ctx.changesSinceLastStep.forEach(change => {
      lines.push(`  • ${change}`);
    });
    lines.push('');
  }

  lines.push('='.repeat(80));

  return lines.map(line => `<!-- ${line} -->`).join('\n');
}

function formatOfferContext(offer: OfferContext, indent: string = ''): string {
  const lines: string[] = [];

  if (offer.route) {
    lines.push(`${indent}Route: ${offer.route}`);
  }
  if (offer.flightNumber) {
    lines.push(`${indent}Flight: ${offer.flightNumber}`);
  }
  if (offer.departureTime) {
    lines.push(`${indent}Departure: ${offer.departureTime}`);
  }
  if (offer.bundleName || offer.bundleCode) {
    lines.push(`${indent}Bundle: ${offer.bundleName || ''} ${offer.bundleCode ? `(${offer.bundleCode})` : ''}`);
  }
  if (offer.fareBasis) {
    lines.push(`${indent}Fare Basis: ${offer.fareBasis}`);
  }
  if (offer.cabinClass) {
    lines.push(`${indent}Cabin: ${offer.cabinClass}`);
  }
  if (offer.offerId) {
    lines.push(`${indent}OfferID: ${offer.offerId}`);
  }
  if (offer.bundleId) {
    lines.push(`${indent}BundleID: ${offer.bundleId}`);
  }
  if (offer.offerItemIds && offer.offerItemIds.length > 0) {
    lines.push(`${indent}OfferItemIDs: ${offer.offerItemIds.join(', ')}`);
  }

  return lines.join('\n');
}

/**
 * Prepends annotation comments to an XML string
 */
export function annotateXml(xml: string, ctx: AnnotationContext): string {
  if (!xml) return xml;

  const header = createXmlHeader(ctx);

  // Check if XML already has a declaration
  const hasDeclaration = xml.trim().startsWith('<?xml');

  if (hasDeclaration) {
    // Insert after the XML declaration
    const declarationEnd = xml.indexOf('?>');
    if (declarationEnd !== -1) {
      return xml.slice(0, declarationEnd + 2) + '\n' + header + '\n' + xml.slice(declarationEnd + 2);
    }
  }

  // Prepend to the start
  return header + '\n' + xml;
}

/**
 * Creates a summary line for quick identification in logs
 */
export function createOperationSummary(ctx: AnnotationContext): string {
  const parts: string[] = [ctx.operation];

  if (ctx.flight?.origin && ctx.flight?.destination) {
    parts.push(`${ctx.flight.origin}-${ctx.flight.destination}`);
  }

  if (ctx.outboundOffer?.bundleName) {
    parts.push(ctx.outboundOffer.bundleName);
  }

  if (ctx.services && ctx.services.length > 0) {
    parts.push(`+${ctx.services.length} services`);
  }

  return parts.join(' | ');
}

/**
 * Helper to build context from flight selection store
 */
export function buildOfferContextFromSelection(
  selection: {
    offerId: string;
    bundleId: string;
    bundle?: {
      name?: string;
      code?: string;
      fareBasisCode?: string;
    };
    offer?: {
      journey?: {
        segments?: Array<{
          flightNumber?: string;
          origin?: string;
          destination?: string;
          departureTime?: string;
          cabinClass?: string;
        }>;
      };
    };
  },
  direction: 'outbound' | 'inbound'
): OfferContext {
  const firstSegment = selection.offer?.journey?.segments?.[0];
  const lastSegment = selection.offer?.journey?.segments?.slice(-1)[0];

  return {
    offerId: selection.offerId,
    bundleId: selection.bundleId,
    bundleName: selection.bundle?.name,
    bundleCode: selection.bundle?.code,
    fareBasis: selection.bundle?.fareBasisCode,
    flightNumber: firstSegment?.flightNumber,
    route: firstSegment && lastSegment
      ? `${firstSegment.origin} → ${lastSegment.destination}`
      : undefined,
    departureTime: firstSegment?.departureTime,
    cabinClass: firstSegment?.cabinClass,
    direction,
  };
}

/**
 * Helper to build service context from selected services
 */
export function buildServiceContextList(
  services: Array<{
    serviceCode: string;
    serviceName?: string;
    serviceType?: string;
    quantity?: number;
    price?: number;
    currency?: string;
    paxRefId?: string;
    segmentRefId?: string;
  }>
): ServiceContext[] {
  return services.map(svc => ({
    serviceCode: svc.serviceCode,
    serviceName: svc.serviceName,
    serviceType: svc.serviceType,
    quantity: svc.quantity,
    price: svc.price,
    currency: svc.currency,
    passengerRef: svc.paxRefId,
    segmentRef: svc.segmentRefId,
  }));
}

/**
 * Helper to build passenger context
 */
export function buildPassengerContextList(
  passengers: Array<{
    paxId: string;
    ptc: string;
    firstName?: string;
    lastName?: string;
    dateOfBirth?: string;
  }>
): PassengerContext[] {
  return passengers.map(pax => ({
    paxId: pax.paxId,
    ptc: pax.ptc,
    name: pax.firstName && pax.lastName ? `${pax.firstName} ${pax.lastName}` : undefined,
    dateOfBirth: pax.dateOfBirth,
  }));
}

// ============================================================================
// SUMMARY GENERATION - For XmlLogPanel display
// ============================================================================

/**
 * Generate a human-readable summary for display in the XML Log Panel
 */
export function generateXmlSummary(ctx: AnnotationContext): XmlSummary {
  const details: XmlSummary['details'] = [];
  const highlights: XmlSummary['highlights'] = [];

  // Build title and subtitle based on operation
  let title = ctx.operation;
  let subtitle = getOperationDescription(ctx.operation);

  // Add flight search details
  if (ctx.flight) {
    if (ctx.flight.origin && ctx.flight.destination) {
      const route = ctx.flight.returnDate
        ? `${ctx.flight.origin} ↔ ${ctx.flight.destination}`
        : `${ctx.flight.origin} → ${ctx.flight.destination}`;
      subtitle = route;

      details.push({
        label: 'Route',
        value: route,
        icon: 'plane',
      });
    }

    if (ctx.flight.departureDate) {
      const dateStr = ctx.flight.returnDate
        ? `${formatDate(ctx.flight.departureDate)} → ${formatDate(ctx.flight.returnDate)}`
        : formatDate(ctx.flight.departureDate);
      details.push({
        label: 'Date',
        value: dateStr,
        icon: 'calendar',
      });
    }

    if (ctx.flight.passengers) {
      details.push({
        label: 'Passengers',
        value: formatPassengerCounts(ctx.flight.passengers),
        icon: 'users',
      });
    }

    if (ctx.flight.cabinClass) {
      details.push({
        label: 'Cabin',
        value: ctx.flight.cabinClass,
        icon: 'briefcase',
      });
    }
  }

  // Add outbound offer details
  if (ctx.outboundOffer) {
    const offerInfo = [];
    if (ctx.outboundOffer.flightNumber) {
      offerInfo.push(ctx.outboundOffer.flightNumber);
    }
    if (ctx.outboundOffer.departureTime) {
      offerInfo.push(formatTime(ctx.outboundOffer.departureTime));
    }
    if (ctx.outboundOffer.bundleName) {
      offerInfo.push(ctx.outboundOffer.bundleName);
    }

    if (offerInfo.length > 0) {
      highlights.push({
        label: 'Outbound',
        value: offerInfo.join(' '),
        color: 'blue',
      });
    }
  }

  // Add inbound offer details
  if (ctx.inboundOffer) {
    const offerInfo = [];
    if (ctx.inboundOffer.flightNumber) {
      offerInfo.push(ctx.inboundOffer.flightNumber);
    }
    if (ctx.inboundOffer.departureTime) {
      offerInfo.push(formatTime(ctx.inboundOffer.departureTime));
    }
    if (ctx.inboundOffer.bundleName) {
      offerInfo.push(ctx.inboundOffer.bundleName);
    }

    if (offerInfo.length > 0) {
      highlights.push({
        label: 'Inbound',
        value: offerInfo.join(' '),
        color: 'green',
      });
    }
  }

  // Add services summary
  if (ctx.services && ctx.services.length > 0) {
    const serviceTypes = ctx.services.reduce((acc, svc) => {
      const type = svc.serviceType || 'Other';
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const serviceSummary = Object.entries(serviceTypes)
      .map(([type, count]) => `${count} ${type}`)
      .join(', ');

    details.push({
      label: 'Services',
      value: serviceSummary,
      icon: 'package',
    });
  }

  // Add pricing if available
  if (ctx.pricing?.grandTotal) {
    highlights.push({
      label: 'Total',
      value: formatCurrency(ctx.pricing.grandTotal, ctx.pricing.currency),
      color: 'amber',
    });
  }

  // Add reference IDs for API correlation
  if (ctx.shoppingResponseId) {
    details.push({
      label: 'Shopping ID',
      value: ctx.shoppingResponseId.substring(0, 20) + '...',
      icon: 'tag',
    });
  }

  // Add PNR for order operations
  if (ctx.pnr) {
    highlights.push({
      label: 'PNR',
      value: ctx.pnr,
      color: 'green',
    });
  }

  return {
    title,
    subtitle,
    details,
    highlights: highlights.length > 0 ? highlights : undefined,
  };
}
