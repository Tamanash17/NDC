import axios from "axios";
import { Router } from "express";
import fs from "fs";
import path from "path";
import { config } from "../config/index.js";
import { buildAirShoppingXml } from "../builders/air-shopping.builder.js";
import { buildOfferPriceXml } from "../builders/offer-price.builder.js";
import { buildServiceListXml } from "../builders/service-list.builder.js";
import { buildAirlineProfileXml } from "../builders/airline-profile.builder.js";
import { buildSeatAvailabilityXml } from "../builders/seat-availability.builder.js";
import { buildOrderCreateXml } from "../builders/order-create.builder.js";
import { buildLongSellXml } from "../builders/long-sell.builder.js";
import { buildOrderRetrieveXml } from "../builders/order-retrieve.builder.js";
import { buildPaymentXml } from "../builders/payment.builder.js";
import { buildLongSellFromOrder } from "../utils/long-sell-from-order.js";
import { orderParser } from "../parsers/order.parser.js";
import { airShoppingParser } from "../parsers/air-shopping.parser.js";
import { offerPriceParser } from "../parsers/offer-price.parser.js";
import { serviceListParser } from "../parsers/service-list.parser.js";
import { airlineProfileParser } from "../parsers/airline-profile.parser.js";
import { seatAvailabilityParser } from "../parsers/seat-availability.parser.js";
import { xmlTransactionLogger } from "../utils/xml-logger.js";

const router = Router();

// Version endpoint (no auth required) - to verify deployment
router.get("/version", (req: any, res: any) => {
  res.json({
    version: "1.1.1",
    buildDate: "2026-01-16T06:45:00Z",
    commit: "0e8c758",
    feature: "multiple-payments-warnings-synced",
    message: "Multiple payments display, CC fee breakdown, order warnings - root src synced"
  });
});

// Middleware to check auth + extract environment
const requireAuth = (req: any, res: any, next: any) => {
  const authHeader = req.headers.authorization;
  const subscriptionKey = req.headers["ocp-apim-subscription-key"];
  const environment = req.headers["x-ndc-environment"] as string;

  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({
      success: false,
      error: { message: "Missing Authorization header" },
    });
  }

  if (!subscriptionKey) {
    return res.status(401).json({
      success: false,
      error: { message: "Missing Ocp-Apim-Subscription-Key header" },
    });
  }

  req.token = authHeader.replace("Bearer ", "");
  req.subscriptionKey = subscriptionKey;
  req.ndcEnvironment = environment === "PROD" ? "PROD" : "UAT";

  next();
};

router.use(requireAuth);

// Helper function to save XML to file
function saveXmlToFile(operation: string, type: 'request' | 'response', xmlContent: string) {
  try {
    const logsDir = path.join(process.cwd(), 'logs', 'xml');
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = path.join(logsDir, `${operation.toLowerCase()}-${type}-${timestamp}.xml`);
    fs.writeFileSync(filename, xmlContent, 'utf8');
    console.log(`[NDC] ✅ XML ${type} saved to: ${filename}`);
  } catch (err) {
    console.error(`[NDC] Failed to save XML ${type}:`, err);
  }
}

// Generic NDC handler
async function callNDC(
  operation: string,
  endpoint: string,
  xmlRequest: string,
  token: string,
  subscriptionKey: string,
  _environment: string
) {
  const url = `${config.ndc.baseUrl}${endpoint}`;

  console.log(`[NDC] ${operation} -> ${url}`);

  // Save request XML
  saveXmlToFile(operation, 'request', xmlRequest);

  const response = await axios.post(url, xmlRequest, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Ocp-Apim-Subscription-Key": subscriptionKey,
      // Dynamic environment header (X-NDC-UAT or X-NDC-PROD)
      [config.ndc.envHeaderName]: config.ndc.envHeader,
      "Content-Type": "application/xml",
      Accept: "application/xml",
    },
    timeout: config.ndc.requestTimeout,
    responseType: "text",
  });

  // Save response XML
  saveXmlToFile(operation, 'response', response.data);

  return response.data;
}

function handleNDCRoute(operation: string, endpoint: string) {
  return async (req: any, res: any) => {
    try {
      const xmlRequest = typeof req.body === "string" ? req.body : req.body.xml;

      if (!xmlRequest) {
        return res.status(400).json({
          success: false,
          error: { message: "Missing XML request body" },
        });
      }

      const xmlResponse = await callNDC(
        operation,
        endpoint,
        xmlRequest,
        req.token,
        req.subscriptionKey,
        req.ndcEnvironment
      );

      const wantJson = req.headers.accept?.includes("application/json");

      if (wantJson) {
        res.json({ success: true, data: { xml: xmlResponse } });
      } else {
        res.type("application/xml").send(xmlResponse);
      }
    } catch (error: any) {
      console.error(`[NDC] ${operation} Error Status:`, error.response?.status);
      console.error(`[NDC] ${operation} Error Headers:`, error.response?.headers);
      console.error(`[NDC] ${operation} Error Data:`, error.response?.data);

      let errorMessage = error.message || 'Unknown error';
      let statusCode = error.response?.status || 500;

      // Check Jetstar custom error headers
      const headerErrorMsg = error.response?.headers?.['error-msg-0'];
      const headerErrorCode = error.response?.headers?.['error-code-0'];

      if (headerErrorMsg) {
        errorMessage = headerErrorCode ? `${headerErrorCode}: ${headerErrorMsg}` : headerErrorMsg;
      } else if (error.response?.data) {
        const data = error.response.data;
        if (typeof data === 'string') {
          const errorMatch = data.match(/<(?:Error|Message|Fault|Description)[^>]*>([^<]+)<\//i);
          errorMessage = errorMatch ? errorMatch[1] : (data.length > 500 ? data.substring(0, 500) + '...' : data);
        } else if (typeof data === 'object') {
          errorMessage = data.message || data.error || data.title || JSON.stringify(data);
        }
      }

      if (statusCode === 401) {
        errorMessage = 'Session expired - please log in again';
      }

      res.status(statusCode).json({
        success: false,
        error: errorMessage,
        message: errorMessage,
        status: statusCode,
      });
    }
  };
}

// AirShopping - accepts JSON and builds XML
router.post("/air-shopping", async (req: any, res: any) => {
  let xmlRequest: string | undefined;

  try {
    // If body has xml property, use it directly
    if (req.body.xml) {
      xmlRequest = req.body.xml;
    } else if (typeof req.body === "string") {
      xmlRequest = req.body;
    } else {
      // Build XML from JSON payload
      xmlRequest = buildAirShoppingXml(req.body);
    }

    console.log("[NDC] AirShopping XML Request (FULL):\n", xmlRequest);

    const xmlResponse = await callNDC(
      "AirShopping",
      config.ndc.endpoints.airShopping,
      xmlRequest,
      req.token,
      req.subscriptionKey,
      req.ndcEnvironment
    );

    // Parse XML response to JSON for frontend
    const parsed = airShoppingParser.parse(xmlResponse);

    console.log("[NDC] Parsed offers count:", parsed.offers?.length || 0);
    console.log("[NDC] Parsed segments count:", parsed.dataLists?.paxSegmentList?.length || 0);
    if (parsed.offers?.[0]) {
      console.log("[NDC] First offer:", JSON.stringify(parsed.offers[0], null, 2));
    }
    if (parsed.dataLists?.paxSegmentList?.[0]) {
      console.log("[NDC] First segment:", JSON.stringify(parsed.dataLists.paxSegmentList[0], null, 2));
    }
    // Show all segment IDs
    console.log("[NDC] All segment IDs:", parsed.dataLists?.paxSegmentList?.map(s => s.paxSegmentId));

    // CRITICAL: Check if parsing found errors in the NDC response
    if (!parsed.success && parsed.errors && parsed.errors.length > 0) {
      console.error("[NDC] AirShopping response contained errors:", parsed.errors);

      // Build descriptive error message with search context
      const searchParams = typeof req.body === 'object' && !req.body.xml ? req.body : {};
      const origin = searchParams.origin || 'Unknown';
      const destination = searchParams.destination || 'Unknown';
      const departureDate = searchParams.departureDate || 'Unknown';
      const returnDate = searchParams.returnDate;
      const passengers = searchParams.passengers || {};
      const totalPax = (passengers.adults || 0) + (passengers.children || 0) + (passengers.infants || 0);

      let contextMessage = `No flights available for ${origin} to ${destination} on ${departureDate}`;
      if (returnDate) {
        contextMessage += `, returning ${returnDate}`;
      }
      if (totalPax > 0) {
        contextMessage += ` (${totalPax} passenger${totalPax > 1 ? 's' : ''})`;
      }
      contextMessage += '.';

      // Format NDC error details
      const ndcErrorDetails = parsed.errors.map(e => `${e.code}: ${e.message}`).join(' | ');
      const fullErrorMessage = `${contextMessage}\n\nError Details:\n${ndcErrorDetails}`;

      // Return error response with parsed NDC errors
      return res.status(400).json({
        success: false,
        error: fullErrorMessage,
        parsed: {
          errors: parsed.errors
        },
        requestXml: xmlRequest,
        responseXml: xmlResponse,
      });
    }

    res.json({
      success: true,
      data: parsed,
      requestXml: xmlRequest,
      responseXml: xmlResponse,
    });
  } catch (error: any) {
    console.error("[NDC] AirShopping Error Status:", error.response?.status);
    console.error("[NDC] AirShopping Error Headers:", error.response?.headers);
    console.error("[NDC] AirShopping Error Data:", error.response?.data);
    console.error("[NDC] AirShopping Error Message:", error.message);

    // Extract the most useful error information
    let errorMessage = error.message || 'Unknown error';
    let errorDetails = '';
    let statusCode = error.response?.status || 500;

    // Check Jetstar custom error headers first (they return errors in headers)
    const headerErrorMsg = error.response?.headers?.['error-msg-0'];
    const headerErrorCode = error.response?.headers?.['error-code-0'];

    if (headerErrorMsg) {
      errorMessage = headerErrorCode ? `${headerErrorCode}: ${headerErrorMsg}` : headerErrorMsg;
      errorDetails = `Error from API headers: ${errorMessage}`;
    } else if (error.response?.data) {
      const data = error.response.data;
      if (typeof data === 'string') {
        // Might be XML error response - try to extract error message
        const errorMatch = data.match(/<(?:Error|Message|Fault|Description)[^>]*>([^<]+)<\//i);
        if (errorMatch) {
          errorMessage = errorMatch[1];
        } else {
          // Show truncated raw response
          errorMessage = data.length > 500 ? data.substring(0, 500) + '...' : data;
        }
        errorDetails = data;
      } else if (typeof data === 'object') {
        errorMessage = data.message || data.error || data.title || JSON.stringify(data);
        errorDetails = JSON.stringify(data);
      }
    }

    // Also check for axios-specific errors
    if (error.code === 'ECONNREFUSED') {
      errorMessage = `Connection refused to NDC API: ${error.config?.url}`;
    } else if (error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED') {
      errorMessage = 'Request timed out - NDC API took too long to respond';
    }

    // If it's a 401, indicate token expiry clearly
    if (statusCode === 401) {
      errorMessage = 'Session expired - please log in again';
    }

    res.status(statusCode).json({
      success: false,
      error: errorMessage,
      message: errorMessage,
      status: statusCode,
      details: errorDetails,
      requestXml: xmlRequest,  // CRITICAL: Include request XML even when error happens
      responseXml: typeof error.response?.data === 'string' ? error.response.data : undefined,
    });
  }
});
// OfferPrice - accepts JSON and builds XML
router.post("/offer-price", async (req: any, res: any) => {
  try {
    let xmlRequest: string;

    // If body has xml property, use it directly
    if (req.body.xml) {
      xmlRequest = req.body.xml;
    } else if (typeof req.body === "string") {
      xmlRequest = req.body;
    } else {
      // Build XML from JSON payload
      console.log('[NDC] ===== OFFERPRICE REQUEST FROM FRONTEND =====');
      console.log('[NDC] Request body:', JSON.stringify(req.body, null, 2));

      // Log selected services in detail
      if (req.body.selectedServices && Array.isArray(req.body.selectedServices)) {
        const bundleServices = req.body.selectedServices.filter((s: any) => s.serviceType === 'bundle');
        console.log(`[NDC] Found ${bundleServices.length} bundle services in request`);
        bundleServices.forEach((bundle: any, idx: number) => {
          console.log(`[NDC] Bundle #${idx + 1}:`, {
            serviceId: bundle.serviceId,
            serviceCode: bundle.serviceCode,
            serviceName: bundle.serviceName,
            offerItemId: bundle.offerItemId,
            journeyRefs: bundle.journeyRefs,
            direction: bundle.direction,
          });
        });
      }
      console.log('[NDC] ================================================');

      xmlRequest = buildOfferPriceXml(req.body);
    }

    console.log("[NDC] OfferPrice XML Request:\n", xmlRequest);

    const xmlResponse = await callNDC(
      "OfferPrice",
      config.ndc.endpoints.offerPrice,
      xmlRequest,
      req.token,
      req.subscriptionKey,
      req.ndcEnvironment
    );

    // Log first 2000 chars of response for debugging
    console.log("[NDC] OfferPrice XML Response (first 2000 chars):\n", xmlResponse.substring(0, 2000));

    // Parse XML response to JSON for frontend
    const parsed = offerPriceParser.parse(xmlResponse);

    console.log("[NDC] OfferPrice parsed result:", JSON.stringify(parsed, null, 2));

    // Transform to frontend-expected format
    // Frontend expects: { totalAmount, currency, pricing: { baseFare, taxes, fees, ... } }
    let totalAmount = 0;
    let currency = "AUD";
    let baseFare = 0;
    let taxes = 0;
    let fees = 0;
    let services = 0;

    if (parsed.pricedOffers && parsed.pricedOffers.length > 0) {
      // Sum up all offers
      for (const offer of parsed.pricedOffers) {
        totalAmount += offer.totalPrice?.value || 0;
        currency = offer.totalPrice?.currency || currency;

        // Sum up offer items for breakdown
        for (const item of offer.offerItems || []) {
          baseFare += item.baseAmount?.value || 0;
          taxes += item.taxAmount?.value || 0;
          // Total minus base minus tax = fees/surcharges
          const itemTotal = item.totalAmount?.value || 0;
          const itemBase = item.baseAmount?.value || 0;
          const itemTax = item.taxAmount?.value || 0;
          if (itemTotal > 0 && itemBase > 0) {
            fees += Math.max(0, itemTotal - itemBase - itemTax);
          }
        }
      }
    }

    // Fallback: if parser returned 0, try to extract from raw XML using regex
    if (totalAmount === 0) {
      console.log("[NDC] Parser returned 0, trying regex fallback on raw XML...");

      // Try various patterns Jetstar might use
      // Pattern 1: <TotalAmount>123.45</TotalAmount>
      let match = xmlResponse.match(/<TotalAmount[^>]*>(\d+\.?\d*)<\/TotalAmount>/);
      if (match) {
        totalAmount = parseFloat(match[1]);
        console.log("[NDC] Found TotalAmount via regex:", totalAmount);
      }

      // Pattern 2: <Total><Amount>123.45</Amount></Total>
      if (totalAmount === 0) {
        match = xmlResponse.match(/<Total[^>]*>[\s\S]*?<Amount[^>]*>(\d+\.?\d*)<\/Amount>/);
        if (match) {
          totalAmount = parseFloat(match[1]);
          console.log("[NDC] Found Total/Amount via regex:", totalAmount);
        }
      }

      // Pattern 3: <TotalPrice><TotalAmount>123.45</TotalAmount></TotalPrice>
      if (totalAmount === 0) {
        match = xmlResponse.match(/<TotalPrice[^>]*>[\s\S]*?<TotalAmount[^>]*>(\d+\.?\d*)<\/TotalAmount>/);
        if (match) {
          totalAmount = parseFloat(match[1]);
          console.log("[NDC] Found TotalPrice/TotalAmount via regex:", totalAmount);
        }
      }

      // Try to extract currency
      const currMatch = xmlResponse.match(/<CurCode[^>]*>([A-Z]{3})<\/CurCode>/);
      if (currMatch) {
        currency = currMatch[1];
      }

      // Try base/tax extraction
      const baseMatch = xmlResponse.match(/<BaseAmount[^>]*>[\s\S]*?<Amount[^>]*>(\d+\.?\d*)<\/Amount>/);
      if (baseMatch) baseFare = parseFloat(baseMatch[1]);

      const taxMatch = xmlResponse.match(/<TaxAmount[^>]*>[\s\S]*?<Amount[^>]*>(\d+\.?\d*)<\/Amount>/);
      if (taxMatch) taxes = parseFloat(taxMatch[1]);
    }

    // If breakdown not available, estimate from total
    if (baseFare === 0 && totalAmount > 0) {
      // Rough estimate: 70% base, 25% taxes, 5% fees
      baseFare = totalAmount * 0.70;
      taxes = totalAmount * 0.25;
      fees = totalAmount * 0.05;
    }

    // Check if parser found errors in the XML response
    if (!parsed.success && parsed.errors && parsed.errors.length > 0) {
      const errorMessage = parsed.errors.map(e => e.message).join('; ');
      console.log("[NDC] OfferPrice API returned error:", errorMessage);

      // Check if error is bundle-specific SSR error (OF4053) - these should be treated as warnings
      // These errors mean the bundle cannot be sold on this route, but booking can continue without it
      const isBundleSSRError = parsed.errors.some(e =>
        e.code === 'OF4053' ||
        e.message?.toLowerCase().includes('selling ssrs for service bundle') ||
        e.message?.toLowerCase().includes('error encountered selling')
      );

      if (isBundleSSRError) {
        console.warn('[NDC] OfferPrice failed due to bundle SSR error - this is a WARNING, not a fatal error');
        console.warn('[NDC] The selected bundle is not available on this route. Transaction should continue without the bundle.');

        // Return a clear error message telling the user the bundle is not available
        // The frontend should handle this by either:
        // 1. Showing an error and letting user select a different bundle, OR
        // 2. Continuing with base fare only (no bundle)
        const userFriendlyMessage = 'The selected fare bundle is not available on this route. Please select a different bundle or continue with the base fare.';

        return res.status(400).json({
          success: false,
          error: userFriendlyMessage,
          message: userFriendlyMessage,
          errors: parsed.errors,
          isBundleUnavailable: true,  // Flag to frontend that this is a bundle availability issue, not a fatal error
          requestXml: xmlRequest,
          responseXml: xmlResponse,
        });
      }

      // For other errors (authentication, session, etc.), return as fatal error
      return res.status(400).json({
        success: false,
        error: errorMessage,
        message: errorMessage,
        errors: parsed.errors,
        requestXml: xmlRequest,
        responseXml: xmlResponse,
      });
    }

    const transformedData = {
      success: parsed.success,
      offerId: parsed.pricedOffers?.[0]?.offerId || "",
      totalAmount,
      currency,
      pricing: {
        baseFare,
        base: baseFare,
        taxes,
        tax: taxes,
        fees,
        surcharges: fees,
        services,
      },
      priceGuaranteeExpiry: parsed.expirationDateTime,
      warnings: parsed.warnings || [],
      // Include raw data for debugging
      pricedOffers: parsed.pricedOffers,
      // Detailed flight-level breakdown for verification display
      flightBreakdowns: parsed.flightBreakdowns || [],
    };

    console.log("[NDC] OfferPrice transformed for frontend:", JSON.stringify(transformedData, null, 2));

    res.json({
      success: true,
      data: transformedData,
      requestXml: xmlRequest,
      responseXml: xmlResponse,
    });
  } catch (error: any) {
    console.error("[NDC] OfferPrice Error Status:", error.response?.status);
    console.error("[NDC] OfferPrice Error Headers:", error.response?.headers);
    console.error("[NDC] OfferPrice Error Data:", error.response?.data);

    let errorMessage = error.message || 'Unknown error';
    let statusCode = error.response?.status || 500;

    // Check Jetstar custom error headers
    const headerErrorMsg = error.response?.headers?.['error-msg-0'];
    const headerErrorCode = error.response?.headers?.['error-code-0'];

    if (headerErrorMsg) {
      errorMessage = headerErrorCode ? `${headerErrorCode}: ${headerErrorMsg}` : headerErrorMsg;
    } else if (error.response?.data) {
      const data = error.response.data;
      if (typeof data === 'string') {
        const errorMatch = data.match(/<(?:Error|Message|Fault|Description)[^>]*>([^<]+)<\//i);
        errorMessage = errorMatch ? errorMatch[1] : (data.length > 500 ? data.substring(0, 500) + '...' : data);
      } else if (typeof data === 'object') {
        errorMessage = data.message || data.error || data.title || JSON.stringify(data);
      }
    }

    if (statusCode === 401) {
      errorMessage = 'Session expired - please log in again';
    }

    res.status(statusCode).json({
      success: false,
      error: errorMessage,
      message: errorMessage,
      status: statusCode,
      responseXml: typeof error.response?.data === 'string' ? error.response.data : undefined,
    });
  }
});
// ServiceList - accepts JSON and builds XML
router.post("/service-list", async (req: any, res: any) => {
  try {
    let xmlRequest: string;

    // If body has xml property, use it directly
    if (req.body.xml) {
      xmlRequest = req.body.xml;
    } else if (typeof req.body === "string") {
      xmlRequest = req.body;
    } else {
      // Build XML from JSON payload
      xmlRequest = buildServiceListXml(req.body, {
        distributionChain: req.body.distributionChain,
      });
    }

    console.log("[NDC] ServiceList XML Request:\n", xmlRequest);

    const xmlResponse = await callNDC(
      "ServiceList",
      config.ndc.endpoints.serviceList,
      xmlRequest,
      req.token,
      req.subscriptionKey,
      req.ndcEnvironment
    );

    // Parse XML response to JSON for frontend
    const parsed = serviceListParser.parse(xmlResponse);

    console.log("[NDC] Parsed services count:", parsed.services?.length || 0);
    console.log("[NDC] Parsed ancillary offers count:", parsed.ancillaryOffers?.length || 0);

    // Debug: Log bundle ancillary offers with their includedServiceRefIds
    const bundleOffers = parsed.ancillaryOffers?.filter((o: any) => o.serviceType === 'BUNDLE') || [];
    console.log("[NDC] Bundle offers count:", bundleOffers.length);
    bundleOffers.forEach((offer: any, i: number) => {
      console.log(`[NDC] BundleOffer[${i}]: ${offer.serviceCode} (${offer.offerItemId})`, {
        includedServiceRefIds: offer.includedServiceRefIds || 'NONE',
        inclusionCount: offer.includedServiceRefIds?.length || 0,
      });
    });

    if (parsed.ancillaryOffers?.[0]) {
      console.log("[NDC] First ancillary offer:", JSON.stringify(parsed.ancillaryOffers[0], null, 2));
    }

    res.json({
      success: parsed.success,
      data: parsed,
      requestXml: xmlRequest,
      responseXml: xmlResponse,
    });
  } catch (error: any) {
    console.error("[NDC] ServiceList Error Status:", error.response?.status);
    console.error("[NDC] ServiceList Error Headers:", error.response?.headers);
    console.error("[NDC] ServiceList Error Data:", error.response?.data);
    console.error("[NDC] ServiceList Error Message:", error.message);

    let errorMessage = error.message || 'Unknown error';
    let statusCode = error.response?.status || 500;

    // Check Jetstar custom error headers
    const headerErrorMsg = error.response?.headers?.['error-msg-0'];
    const headerErrorCode = error.response?.headers?.['error-code-0'];

    if (headerErrorMsg) {
      errorMessage = headerErrorCode ? `${headerErrorCode}: ${headerErrorMsg}` : headerErrorMsg;
    } else if (error.response?.data) {
      const data = error.response.data;
      if (typeof data === 'string') {
        const errorMatch = data.match(/<(?:Error|Message|Fault|DescText)[^>]*>([^<]+)<\//i);
        errorMessage = errorMatch ? errorMatch[1] : (data.length > 500 ? data.substring(0, 500) + '...' : data);
      } else if (typeof data === 'object') {
        errorMessage = data.message || data.error || data.title || JSON.stringify(data);
      }
    }

    if (statusCode === 401) {
      errorMessage = 'Session expired - please log in again';
    }

    res.status(statusCode).json({
      success: false,
      error: errorMessage,
      message: errorMessage,
      status: statusCode,
      requestXml: error.config?.data,
      responseXml: typeof error.response?.data === 'string' ? error.response.data : undefined,
    });
  }
});
// SeatAvailability - accepts JSON and builds XML
router.post("/seat-availability", async (req: any, res: any) => {
  try {
    console.log("[NDC] ===== SEATAVAILABILITY REQUEST FROM FRONTEND =====");
    console.log("[NDC] Request body:", JSON.stringify(req.body, null, 2));

    let xmlRequest: string;

    // If body has xml property, use it directly
    if (req.body.xml) {
      xmlRequest = req.body.xml;
    } else if (typeof req.body === "string") {
      xmlRequest = req.body;
    } else {
      // Build XML from JSON payload
      xmlRequest = buildSeatAvailabilityXml(req.body, {
        distributionChain: req.body.distributionChain,
      });
    }

    console.log("[NDC] SeatAvailability XML Request:\n", xmlRequest);

    const xmlResponse = await callNDC(
      "SeatAvailability",
      config.ndc.endpoints.seatAvailability,
      xmlRequest,
      req.token,
      req.subscriptionKey,
      req.ndcEnvironment
    );

    // Parse XML response to JSON for frontend
    const parsed = seatAvailabilityParser.parse(xmlResponse);

    console.log("[NDC] Parsed seat maps count:", parsed.seatMaps?.length || 0);
    if (parsed.seatMaps?.[0]) {
      console.log("[NDC] First seat map:", JSON.stringify(parsed.seatMaps[0], null, 2));
      // DEBUG: Log first available seat with offerItemIdsByPaxType
      const firstCabin = parsed.seatMaps[0].cabinCompartments?.[0];
      if (firstCabin) {
        for (const row of firstCabin.seatRows) {
          for (const seat of row.seats) {
            if (seat.offerItemIdsByPaxType && Object.keys(seat.offerItemIdsByPaxType).length > 0) {
              console.log("[NDC] DEBUG - First seat with offerItemIdsByPaxType:", JSON.stringify(seat, null, 2));
              break;
            }
          }
          if (parsed.seatMaps[0].cabinCompartments[0].seatRows.some(r => r.seats.some(s => s.offerItemIdsByPaxType))) break;
        }
      }
    }

    // Log transaction for XML Logs panel
    await xmlTransactionLogger.logTransaction({
      operation: "SeatAvailability",
      requestXml: xmlRequest,
      responseXml: xmlResponse,
      success: parsed.success,
      duration: 0, // Duration not tracked here
      errorCode: parsed.errors?.[0]?.code,
      errorMessage: parsed.errors?.[0]?.message,
      userAction: "User opened seat selection map",
    });

    res.json({
      success: parsed.success,
      data: parsed,
      requestXml: xmlRequest,
      responseXml: xmlResponse,
    });
  } catch (error: any) {
    console.error("[NDC] SeatAvailability Error Status:", error.response?.status);
    console.error("[NDC] SeatAvailability Error Headers:", error.response?.headers);
    console.error("[NDC] SeatAvailability Error Data:", error.response?.data);
    console.error("[NDC] SeatAvailability Error Message:", error.message);

    let errorMessage = error.message || 'Unknown error';
    let statusCode = error.response?.status || 500;

    // Check Jetstar custom error headers
    const headerErrorMsg = error.response?.headers?.['error-msg-0'];
    const headerErrorCode = error.response?.headers?.['error-code-0'];

    if (headerErrorMsg) {
      errorMessage = headerErrorCode ? `${headerErrorCode}: ${headerErrorMsg}` : headerErrorMsg;
    } else if (error.response?.data) {
      const data = error.response.data;
      if (typeof data === 'string') {
        const errorMatch = data.match(/<(?:Error|Message|Fault|Description)[^>]*>([^<]+)<\//i);
        errorMessage = errorMatch ? errorMatch[1] : (data.length > 500 ? data.substring(0, 500) + '...' : data);
      } else if (typeof data === 'object') {
        errorMessage = data.message || data.error || data.title || JSON.stringify(data);
      }
    }

    if (statusCode === 401) {
      errorMessage = 'Session expired - please log in again';
    }

    res.status(statusCode).json({
      success: false,
      error: errorMessage,
      message: errorMessage,
      status: statusCode,
      requestXml: error.config?.data,
      responseXml: typeof error.response?.data === 'string' ? error.response.data : undefined,
    });
  }
});
// OrderCreate - accepts JSON and builds XML
router.post("/order-create", async (req: any, res: any) => {
  let xmlRequest: string | undefined;

  try {
    // If body has xml property, use it directly
    if (req.body.xml) {
      xmlRequest = req.body.xml;
    } else if (typeof req.body === "string") {
      xmlRequest = req.body;
    } else {
      // Build XML from JSON payload
      console.log('[NDC] ===== ORDERCREATE REQUEST FROM FRONTEND =====');
      console.log('[NDC] Request body:', JSON.stringify(req.body, null, 2));
      console.log('[NDC] ================================================');

      xmlRequest = buildOrderCreateXml(req.body);
    }

    console.log("[NDC] OrderCreate XML Request:\n", xmlRequest);

    const xmlResponse = await callNDC(
      "OrderCreate",
      config.ndc.endpoints.orderCreate,
      xmlRequest,
      req.token,
      req.subscriptionKey,
      req.ndcEnvironment
    );

    console.log("[NDC] OrderCreate XML Response (first 2000 chars):\n", xmlResponse.substring(0, 2000));

    // Parse XML response to JSON for frontend
    const parsed = orderParser.parse(xmlResponse);

    console.log('[NDC] OrderCreate parsed result:', JSON.stringify(parsed, null, 2));

    res.json({
      success: parsed.success,
      data: parsed,
      requestXml: xmlRequest,
      responseXml: xmlResponse,
    });
  } catch (error: any) {
    console.error("[NDC] OrderCreate Error:", error.message);
    console.error("[NDC] OrderCreate Error Status:", error.response?.status);
    console.error("[NDC] OrderCreate Error Headers:", error.response?.headers);
    console.error("[NDC] OrderCreate Error Data:", error.response?.data);

    let errorMessage = error.message || 'Unknown error';
    let statusCode = error.response?.status || 500;

    // Check Jetstar custom error headers
    const headerErrorMsg = error.response?.headers?.['error-msg-0'];
    const headerErrorCode = error.response?.headers?.['error-code-0'];

    if (headerErrorMsg) {
      errorMessage = headerErrorCode ? `${headerErrorCode}: ${headerErrorMsg}` : headerErrorMsg;
    } else if (error.response?.data) {
      const data = error.response.data;
      if (typeof data === 'string') {
        const errorMatch = data.match(/<(?:Error|Message|Fault|Description)[^>]*>([^<]+)<\//i);
        errorMessage = errorMatch ? errorMatch[1] : (data.length > 500 ? data.substring(0, 500) + '...' : data);
      } else if (typeof data === 'object') {
        errorMessage = data.message || data.error || data.title || JSON.stringify(data);
      }
    }

    res.status(statusCode).json({
      success: false,
      error: errorMessage,
      message: errorMessage,
      status: statusCode,
      requestXml: xmlRequest,  // FIXED: Use xmlRequest variable instead of error.config?.data
      responseXml: typeof error.response?.data === 'string' ? error.response.data : undefined,
    });
  }
});
// OrderRetrieve - Custom handler to build XML from JSON request
router.post("/order-retrieve", async (req: any, res: any) => {
  let xmlRequest: string | undefined;

  try {
    // Import builder (assuming it exists)
    const { buildOrderRetrieveXml } = await import("../builders/order-retrieve.builder.js");

    // If body has xml property, use it directly
    if (req.body.xml) {
      xmlRequest = req.body.xml;
    } else if (typeof req.body === "string") {
      xmlRequest = req.body;
    } else if (req.body.orderId) {
      // Build XML from JSON payload (orderId, ownerCode)
      console.log("[NDC] OrderRetrieve building XML from JSON:", req.body);
      xmlRequest = buildOrderRetrieveXml(req.body);
    } else {
      return res.status(400).json({
        success: false,
        error: "Missing required field: orderId",
      });
    }

    console.log("[NDC] OrderRetrieve XML Request:\n", xmlRequest);

    const xmlResponse = await callNDC(
      "OrderRetrieve",
      config.ndc.endpoints.orderRetrieve,
      xmlRequest,
      req.token,
      req.subscriptionKey,
      req.ndcEnvironment
    );

    // Parse XML response (assuming parser exists)
    try {
      const { orderParser } = await import("../parsers/order.parser.js");
      const parsed = orderParser.parse(xmlResponse);

      // Check if parsing found errors in the response
      if (!parsed.success) {
        console.log("[NDC] OrderRetrieve returned errors:", parsed.errors);
        return res.status(400).json({
          success: false,
          errors: parsed.errors,
          error: parsed.errors?.[0]?.message || 'Order retrieval failed',
          requestXml: xmlRequest,
          responseXml: xmlResponse,
        });
      }

      console.log("[NDC] OrderRetrieve parsed successfully");
      if (parsed.warnings?.length) {
        console.log("[NDC] OrderRetrieve warnings:", parsed.warnings);
      }

      res.json({
        success: true,
        data: {
          ...parsed.order,
          warnings: parsed.warnings,  // Include warnings in response
        },
        requestXml: xmlRequest,
        responseXml: xmlResponse,
      });
    } catch (parseError) {
      console.warn("[NDC] OrderRetrieve: Parser not available or failed, returning raw XML");
      // If parser fails, return raw XML
      res.json({
        success: true,
        data: { xml: xmlResponse },
        requestXml: xmlRequest,
        responseXml: xmlResponse,
      });
    }
  } catch (error: any) {
    console.error("[NDC] OrderRetrieve Error:", error.message);
    console.error("[NDC] OrderRetrieve Error Response:", error.response?.data);

    const statusCode = error.response?.status || 500;
    const errorMessage = error.response?.headers?.['error-msg-0']
      || error.response?.data?.message
      || error.message
      || 'Order retrieval failed';

    res.status(statusCode).json({
      success: false,
      error: errorMessage,
      requestXml: xmlRequest,
      responseXml: typeof error.response?.data === 'string' ? error.response.data : undefined,
    });
  }
});
router.post(
  "/order-reshop",
  handleNDCRoute("OrderReshop", config.ndc.endpoints.orderReshop)
);
router.post(
  "/order-quote",
  handleNDCRoute("OrderQuote", config.ndc.endpoints.orderQuote)
);
router.post(
  "/order-change",
  handleNDCRoute("OrderChange", config.ndc.endpoints.orderChange)
);

// Payment Processing - Process payment for hold bookings using OrderChange with PaymentFunctions
router.post("/process-payment", async (req: any, res: any) => {
  let xmlRequest = ''; // Declare outside try block to capture in error handler

  try {
    console.log("[NDC] ===== PROCESS PAYMENT REQUEST =====");
    console.log("[NDC] Request body:", JSON.stringify(req.body, null, 2));

    const {
      orderId,
      ownerCode = 'JQ',
      payment,
      distributionChain,
    } = req.body;

    if (!orderId || !payment) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: orderId, payment",
      });
    }

    // Build distribution chain from request
    const chain = distributionChain?.links ? {
      ownerCode: ownerCode,
      links: distributionChain.links.map((link: any) => ({
        ordinal: link.ordinal,
        orgRole: link.orgRole,
        orgId: link.orgId,
        orgName: link.orgName,
      })),
    } : undefined;

    console.log("[NDC] Distribution chain:", JSON.stringify(chain, null, 2));

    // Determine payment type
    let paymentType: 'CC' | 'AGT' | 'CA' = 'CC';
    if (payment.type === 'AGT') {
      paymentType = 'AGT';
    } else if (payment.type === 'CA') {
      paymentType = 'CA';
    }

    console.log("[NDC] Payment type:", paymentType);
    console.log("[NDC] Building payment XML...");

    // Validate distribution chain before building
    if (!chain || !chain.links || chain.links.length === 0) {
      console.error("[NDC] No distribution chain provided!");
      return res.status(400).json({
        success: false,
        error: "Distribution chain is required - please configure seller/distributor in the wizard",
        requestXml: '',
        responseXml: '',
      });
    }

    // Build XML using the Payment builder
    try {
      // Handle both formats: payment.amount (direct number) or payment.amount.value (object)
      const paymentAmount = typeof payment.amount === 'number'
        ? payment.amount
        : (payment.amount?.value || 0);
      const paymentCurrency = typeof payment.amount === 'number'
        ? (payment.currency || 'AUD')
        : (payment.amount?.currency || payment.currency || 'AUD');

      console.log("[NDC] Payment amount extracted:", paymentAmount, paymentCurrency);

      xmlRequest = buildPaymentXml({
      orderId,
      ownerCode,
      amount: paymentAmount,
      currency: paymentCurrency,
      paymentType,
      distributionChain: chain,
      card: payment.card ? {
        brand: payment.card.brand,
        number: payment.card.number,
        expiryDate: payment.card.expiryDate,
        cvv: payment.card.cvv,
        holderName: payment.card.holderName,
      } : undefined,
      agency: payment.agency ? {
        iataNumber: payment.agency.iataNumber,
        accountNumber: payment.agency.accountNumber,
      } : undefined,
      payer: payment.payer,
    });
    } catch (buildError: any) {
      console.error("[NDC] Error building payment XML:", buildError.message);
      return res.status(400).json({
        success: false,
        error: `Failed to build payment request: ${buildError.message}`,
        requestXml: '',
        responseXml: '',
      });
    }

    console.log("[NDC] Payment XML Request:\n", xmlRequest);

    const xmlResponse = await callNDC(
      "OrderChange",
      config.ndc.endpoints.orderChange,
      xmlRequest,
      req.token,
      req.subscriptionKey,
      req.ndcEnvironment
    );

    console.log("[NDC] Payment XML Response (first 2000 chars):\n", xmlResponse.substring(0, 2000));

    // Check for errors in response - Jetstar uses <DescText> not <Description>
    // Also check for <Error> tag with <DescText> or <Description> inside
    const errorDescTextMatch = xmlResponse.match(/<Error[^>]*>[\s\S]*?<DescText[^>]*>([^<]+)<\/DescText>/i);
    const errorDescMatch = xmlResponse.match(/<Error[^>]*>[\s\S]*?<Description[^>]*>([^<]+)<\/Description>/i);
    const errorMatch = errorDescTextMatch || errorDescMatch;

    if (errorMatch) {
      console.log("[NDC] Payment error detected:", errorMatch[1]);
      return res.status(400).json({
        success: false,
        error: errorMatch[1].trim(),
        requestXml: xmlRequest,
        responseXml: xmlResponse,
      });
    }

    // Check for PaymentStatusCode - FAILED means payment was declined
    const paymentStatusMatch = xmlResponse.match(/<PaymentStatusCode[^>]*>([^<]+)<\/PaymentStatusCode>/i);
    if (paymentStatusMatch && paymentStatusMatch[1].toUpperCase() === 'FAILED') {
      console.log("[NDC] Payment status FAILED detected");

      // Extract warning messages for more context
      const warningMessages: string[] = [];
      const warningRegex = /<Warning[^>]*>[\s\S]*?<DescText[^>]*>([^<]+)<\/DescText>[\s\S]*?<\/Warning>/gi;
      let warningMatch;
      while ((warningMatch = warningRegex.exec(xmlResponse)) !== null) {
        warningMessages.push(warningMatch[1].trim());
      }

      const errorMessage = warningMessages.length > 0
        ? warningMessages.join('; ')
        : 'Payment declined';

      return res.status(400).json({
        success: false,
        error: errorMessage,
        paymentStatus: 'FAILED',
        warnings: warningMessages,
        requestXml: xmlRequest,
        responseXml: xmlResponse,
      });
    }

    // Check for warnings that indicate payment issues (even without explicit FAILED status)
    const warningDeclinedMatch = xmlResponse.match(/<Warning[^>]*>[\s\S]*?<DescText[^>]*>(Payment declined|Order is underpaid)[^<]*<\/DescText>/i);
    if (warningDeclinedMatch) {
      console.log("[NDC] Payment warning detected:", warningDeclinedMatch[1]);
      return res.status(400).json({
        success: false,
        error: warningDeclinedMatch[1].trim(),
        paymentStatus: 'FAILED',
        requestXml: xmlRequest,
        responseXml: xmlResponse,
      });
    }

    // Parse success indicators
    const orderIdMatch = xmlResponse.match(/<OrderID[^>]*>([^<]+)<\/OrderID>/i);
    const pnrMatch = xmlResponse.match(/<AirlineOrderID[^>]*>([^<]+)<\/AirlineOrderID>/i);

    // Verify payment actually succeeded - look for successful payment status
    const paymentStatus = paymentStatusMatch ? paymentStatusMatch[1].toUpperCase() : 'UNKNOWN';
    const isPaymentSuccess = paymentStatus === 'COMPLETED' || paymentStatus === 'CONFIRMED' || paymentStatus === 'SUCCESS';

    // If we got here without errors/warnings but payment status is unknown, treat as success
    // (some responses may not include PaymentStatusCode explicitly)

    res.json({
      success: true,
      data: {
        orderId: orderIdMatch ? orderIdMatch[1] : orderId,
        pnr: pnrMatch ? pnrMatch[1] : null,
        status: isPaymentSuccess ? 'PAID' : 'PENDING',
        paymentStatus: paymentStatus,
      },
      requestXml: xmlRequest,
      responseXml: xmlResponse,
    });

  } catch (error: any) {
    console.error("[NDC] Payment processing error:", error.message);
    console.error("[NDC] Payment error response:", error.response?.data);
    console.error("[NDC] Payment error stack:", error.stack);

    // Try to extract meaningful error from Jetstar response
    let errorMessage = error.message || 'Payment processing failed';
    let responseXml = error.response?.data || '';

    // If error.response.data is XML, try to extract error message
    if (typeof responseXml === 'string' && responseXml.includes('<')) {
      const descTextMatch = responseXml.match(/<DescText[^>]*>([^<]+)<\/DescText>/i);
      const descMatch = responseXml.match(/<Description[^>]*>([^<]+)<\/Description>/i);
      if (descTextMatch) {
        errorMessage = descTextMatch[1].trim();
      } else if (descMatch) {
        errorMessage = descMatch[1].trim();
      }
    }

    res.status(error.response?.status || 500).json({
      success: false,
      error: errorMessage,
      details: error.response?.data,
      requestXml: xmlRequest, // Include request XML even on error
      responseXml: responseXml,
    });
  }
});

// Long Sell - CC surcharge fee calculation via OfferPrice with PaymentFunctions
router.post("/long-sell", async (req: any, res: any) => {
  const startTime = Date.now();
  try {
    console.log("[NDC] ===== LONG SELL (CC FEE) REQUEST =====");
    console.log("[NDC] Request body:", JSON.stringify(req.body, null, 2));

    const { segments, journeys, passengers, cardBrand, currency, distributionChain, bundles, ssrs, seats } = req.body;

    if (!segments || !journeys || !passengers || !cardBrand) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: segments, journeys, passengers, cardBrand",
      });
    }

    console.log("[NDC] Long Sell items:", {
      segments: segments?.length || 0,
      journeys: journeys?.length || 0,
      passengers: passengers?.length || 0,
      bundles: bundles?.length || 0,
      ssrs: ssrs?.length || 0,
      seats: seats?.length || 0,
    });

    // Build XML using the Long Sell builder
    const xmlRequest = buildLongSellXml({
      segments,
      journeys,
      passengers,
      cardBrand,
      currency: currency || 'AUD',
      distributionChain,
      bundles,
      ssrs,
      seats,
    });

    console.log("[NDC] Long Sell XML Request:\n", xmlRequest);

    const xmlResponse = await callNDC(
      "LongSell",
      config.ndc.endpoints.offerPrice, // Uses same endpoint as OfferPrice
      xmlRequest,
      req.token,
      req.subscriptionKey,
      req.ndcEnvironment
    );

    const duration = Date.now() - startTime;
    console.log("[NDC] Long Sell XML Response (first 2000 chars):\n", xmlResponse.substring(0, 2000));

    // Parse CC surcharge from response
    // CORRECT PATTERN from Postman: <PaymentSurcharge>...<PreciseAmount>X.XX</PreciseAmount>
    let ccSurcharge = 0;
    let surchargeType: 'fixed' | 'percentage' = 'fixed';

    // Log key parts of response for debugging
    console.log("[NDC] Looking for CC fee patterns in response...");

    // Pattern 1 (PRIMARY - Jetstar format): <PaymentSurcharge><PreciseAmount>X.XX</PreciseAmount></PaymentSurcharge>
    // This is the CORRECT pattern per Postman reference
    let match = xmlResponse.match(/<PaymentSurcharge[^>]*>[\s\S]*?<PreciseAmount[^>]*>(\d+\.?\d*)<\/PreciseAmount>/i);
    if (match) {
      ccSurcharge = parseFloat(match[1]);
      console.log("[NDC] Found PaymentSurcharge with PreciseAmount:", ccSurcharge);
    }

    // Pattern 2: <PaymentSurcharge><Amount> as fallback
    if (ccSurcharge === 0) {
      const amountMatch = xmlResponse.match(/<PaymentSurcharge[^>]*>[\s\S]*?<Amount[^>]*>(\d+\.?\d*)<\/Amount>/i);
      if (amountMatch) {
        ccSurcharge = parseFloat(amountMatch[1]);
        console.log("[NDC] Found PaymentSurcharge with Amount:", ccSurcharge);
      }
    }

    // Log if no surcharge found
    if (ccSurcharge === 0) {
      console.log("[NDC] No CC surcharge found in PaymentSurcharge. Checking response structure...");
      // Log PaymentSurcharge block if exists
      const paymentSurchargeBlock = xmlResponse.match(/<PaymentSurcharge[^>]*>[\s\S]*?<\/PaymentSurcharge>/i);
      if (paymentSurchargeBlock) {
        console.log("[NDC] PaymentSurcharge block found:", paymentSurchargeBlock[0].substring(0, 500));
      } else {
        console.log("[NDC] No PaymentSurcharge block found in response");
      }
    }

    // Log to XML transaction logger for Visa (VI) only to avoid duplicate logs
    // This gives us one representative Long Sell log per booking flow
    if (cardBrand === 'VI') {
      const cardBrandName = 'Visa';
      await xmlTransactionLogger.logTransaction({
        operation: `LongSell_${cardBrand}`,
        requestXml: xmlRequest,
        responseXml: xmlResponse,
        success: true,
        duration,
        userAction: `User requested CC surcharge calculation for ${cardBrandName} (${cardBrand})`,
      });
      console.log(`[NDC] Long Sell transaction logged for ${cardBrandName}`);
    }

    res.json({
      success: true,
      data: {
        cardBrand,
        ccSurcharge,
        surchargeType,
        currency: currency || 'AUD',
      },
      requestXml: xmlRequest,
      responseXml: xmlResponse,
    });
  } catch (error: any) {
    const duration = Date.now() - startTime;
    console.error("[NDC] Long Sell Error:", error.message);
    console.error("[NDC] Long Sell Error Status:", error.response?.status);
    console.error("[NDC] Long Sell Error Data:", error.response?.data);

    let errorMessage = error.message || 'Unknown error';
    let statusCode = error.response?.status || 500;

    const headerErrorMsg = error.response?.headers?.['error-msg-0'];
    const headerErrorCode = error.response?.headers?.['error-code-0'];

    if (headerErrorMsg) {
      errorMessage = headerErrorCode ? `${headerErrorCode}: ${headerErrorMsg}` : headerErrorMsg;
    } else if (error.response?.data) {
      const data = error.response.data;
      if (typeof data === 'string') {
        const errorMatch = data.match(/<(?:Error|Message|Fault|Description)[^>]*>([^<]+)<\//i);
        errorMessage = errorMatch ? errorMatch[1] : (data.length > 500 ? data.substring(0, 500) + '...' : data);
      }
    }

    // Log error for Visa to capture any issues
    const { cardBrand } = req.body || {};
    if (cardBrand === 'VI') {
      await xmlTransactionLogger.logTransaction({
        operation: `LongSell_${cardBrand}`,
        requestXml: req.body?.xmlRequest || 'Request not available',
        responseXml: typeof error.response?.data === 'string' ? error.response.data : JSON.stringify(error.response?.data || {}),
        success: false,
        duration,
        errorCode: headerErrorCode || String(statusCode),
        errorMessage,
        userAction: `User requested CC surcharge calculation for Visa (VI) - FAILED`,
      });
    }

    res.status(statusCode).json({
      success: false,
      error: errorMessage,
      message: errorMessage,
      status: statusCode,
      responseXml: typeof error.response?.data === 'string' ? error.response.data : undefined,
    });
  }
});

// AirlineProfile - fetch origin-destination pairs from airline
router.post("/airline-profile", async (req: any, res: any) => {
  try {
    let xmlRequest: string;

    // If body has xml property, use it directly
    if (req.body.xml) {
      xmlRequest = req.body.xml;
    } else if (typeof req.body === "string") {
      xmlRequest = req.body;
    } else {
      // Build XML from JSON payload
      xmlRequest = buildAirlineProfileXml(req.body);
    }

    console.log("[NDC] AirlineProfile XML Request:\n", xmlRequest);

    const xmlResponse = await callNDC(
      "AirlineProfile",
      config.ndc.endpoints.airlineProfile || "/AirlineProfile",
      xmlRequest,
      req.token,
      req.subscriptionKey,
      req.ndcEnvironment
    );

    console.log("[NDC] AirlineProfile Raw Response (first 500 chars):", xmlResponse.substring(0, 500));

    // Parse XML response to extract OD pairs
    const parsed = await airlineProfileParser.parse(xmlResponse);

    console.log("[NDC] Parsed OD pairs count:", parsed.originDestinationPairs?.length || 0);
    if (parsed.originDestinationPairs?.[0]) {
      console.log("[NDC] First OD pair:", JSON.stringify(parsed.originDestinationPairs[0], null, 2));
    }

    res.json({
      success: true,
      data: parsed,
      requestXml: xmlRequest,
      responseXml: xmlResponse,
    });
  } catch (error: any) {
    console.error("[NDC] AirlineProfile Error:", error.message);
    console.error("[NDC] AirlineProfile Error Stack:", error.stack);
    console.error("[NDC] AirlineProfile Error Status:", error.response?.status);
    console.error("[NDC] AirlineProfile Error Headers:", error.response?.headers);
    console.error("[NDC] AirlineProfile Error Data:", error.response?.data);

    let errorMessage = error.message || 'Unknown error';
    let statusCode = error.response?.status || 500;

    // Check Jetstar custom error headers
    const headerErrorMsg = error.response?.headers?.['error-msg-0'];
    const headerErrorCode = error.response?.headers?.['error-code-0'];

    if (headerErrorMsg) {
      errorMessage = headerErrorCode ? `${headerErrorCode}: ${headerErrorMsg}` : headerErrorMsg;
    } else if (error.response?.data) {
      const data = error.response.data;
      if (typeof data === 'string') {
        const errorMatch = data.match(/<(?:Error|Message|Fault|Description)[^>]*>([^<]+)<\//i);
        errorMessage = errorMatch ? errorMatch[1] : (data.length > 500 ? data.substring(0, 500) + '...' : data);
      } else if (typeof data === 'object') {
        errorMessage = data.message || data.error || data.title || JSON.stringify(data);
      }
    }

    if (statusCode === 401) {
      errorMessage = 'Session expired - please log in again';
    }

    res.status(statusCode).json({
      success: false,
      error: errorMessage,
      message: errorMessage,
      status: statusCode,
      responseXml: typeof error.response?.data === 'string' ? error.response.data : undefined,
    });
  }
});

// ============================================================================
// CC FEES - Get credit card surcharges for an order
// This endpoint does: OrderRetrieve -> Build Long Sell -> Call Long Sell for each card
// Works for both Prime Booking and Servicing flows
// ============================================================================
router.post("/cc-fees", async (req: any, res: any) => {
  const startTime = Date.now();
  try {
    console.log("[NDC] ===== CC FEES REQUEST =====");
    console.log("[NDC] Request body:", JSON.stringify(req.body, null, 2));

    const { orderId, ownerCode, currency, distributionChain } = req.body;

    if (!orderId) {
      return res.status(400).json({
        success: false,
        error: "Missing required field: orderId",
      });
    }

    // Step 1: OrderRetrieve to get order data
    console.log("[NDC] Step 1: Fetching order via OrderRetrieve...");
    const orderRetrieveXml = buildOrderRetrieveXml({
      orderId,
      ownerCode: ownerCode || 'JQ',
      distributionChain,
    });

    console.log("[NDC] OrderRetrieve XML Request:\n", orderRetrieveXml);

    const orderRetrieveResponse = await callNDC(
      "OrderRetrieve",
      config.ndc.endpoints.orderRetrieve || "/OrderRetrieve",
      orderRetrieveXml,
      req.token,
      req.subscriptionKey,
      req.ndcEnvironment
    );

    console.log("[NDC] OrderRetrieve response received, parsing...");

    // Parse order data
    const orderParseResult = await orderParser.parse(orderRetrieveResponse);

    if (!orderParseResult.success || !orderParseResult.order) {
      console.error("[NDC] Failed to parse OrderRetrieve response:", orderParseResult.errors);
      return res.status(400).json({
        success: false,
        error: "Failed to parse order data",
        details: orderParseResult.errors,
      });
    }

    const order = orderParseResult.order;
    console.log("[NDC] Order parsed successfully:", {
      orderId: order.orderId,
      status: order.status,
      totalPrice: order.totalPrice,
      passengersCount: order.passengers?.length || 0,
      segmentsCount: order.marketingSegments?.length || order.segments?.length || 0,
      journeysCount: order.journeys?.length || 0,
      serviceItemsCount: order.serviceItems?.length || 0,
      seatAssignmentsCount: order.seatAssignments?.length || 0,
    });

    // Detailed logging for debugging Long Sell extraction
    // Log segment RBDs to debug fare mismatch issue
    console.log("[NDC] Order detail summary - passengers:", order.passengers?.length, "segments:", order.segments?.length, "journeys:", order.journeys?.length);
    if (order.marketingSegments) {
      console.log("[NDC] Marketing segments with RBD:");
      order.marketingSegments.forEach(seg => {
        console.log(`  - ${seg.segmentId}: ${seg.origin}->${seg.destination} RBD=${seg.classOfService || 'MISSING'}`);
      });
    }

    // Step 2: Build Long Sell request from order
    console.log("[NDC] Step 2: Building Long Sell request from order...");
    const cardBrands = ['VI', 'MC', 'AX'];
    const results: Array<{
      cardBrand: string;
      ccSurcharge: number;
      surchargeType: 'fixed' | 'percentage' | 'unknown';
      error?: string;
      requestXml?: string;
      responseXml?: string;
    }> = [];

    // Step 3: Call Long Sell for each card brand sequentially
    console.log("[NDC] Step 3: Calling Long Sell for each card brand...");
    for (const cardBrand of cardBrands) {
      // Declare xmlRequest outside try-catch so it's available in catch block
      let xmlRequest: string = '';

      try {
        const buildResult = buildLongSellFromOrder({
          order,
          cardBrand,
          currency: currency || order.totalPrice?.currency || 'AUD',
          distributionChain,
        });

        if (!buildResult.success || !buildResult.request) {
          console.error(`[NDC] Failed to build Long Sell for ${cardBrand}:`, buildResult.error);
          results.push({
            cardBrand,
            ccSurcharge: 0,
            surchargeType: 'unknown',
            error: buildResult.error || 'Failed to build Long Sell request',
            requestXml: `<!-- Build failed: ${buildResult.error} -->`,
            responseXml: `<!-- No response - build failed -->`,
          });
          continue;
        }

        console.log(`[NDC] Long Sell debug for ${cardBrand}:`, buildResult.debug);

        // Build XML - assign to outer variable so it's available in catch
        xmlRequest = buildLongSellXml(buildResult.request);
        console.log(`[NDC] Long Sell XML for ${cardBrand}:\n`, xmlRequest.substring(0, 1000) + '...');

        // Call Long Sell
        const xmlResponse = await callNDC(
          `LongSell_${cardBrand}`,
          config.ndc.endpoints.offerPrice,
          xmlRequest,
          req.token,
          req.subscriptionKey,
          req.ndcEnvironment
        );

        // Log response summary (not full XML to avoid Railway rate limit)
        console.log(`[NDC] Long Sell Response for ${cardBrand}: length=${xmlResponse?.length || 0}, hasPaymentSurcharge=${xmlResponse?.includes('PaymentSurcharge')}`);

        // Check for XML-level error in response (HTTP 200 but API error)
        const errorMatch = xmlResponse.match(/<Error[^>]*>[\s\S]*?<DescText[^>]*>([^<]+)<\/DescText>/i);
        if (errorMatch) {
          const errorDesc = errorMatch[1];
          console.log(`[NDC] Long Sell XML error for ${cardBrand}: ${errorDesc}`);
          results.push({
            cardBrand,
            ccSurcharge: 0,
            surchargeType: 'unknown',
            error: errorDesc,
            requestXml: xmlRequest,
            responseXml: xmlResponse,
          });
          continue;
        }

        // Parse CC surcharge from response
        let ccSurcharge = 0;
        let surchargeType: 'fixed' | 'percentage' = 'fixed';

        // Pattern 1: <PaymentSurcharge><PreciseAmount>X.XX</PreciseAmount>
        let match = xmlResponse.match(/<PaymentSurcharge[^>]*>[\s\S]*?<PreciseAmount[^>]*>(\d+\.?\d*)<\/PreciseAmount>/i);
        if (match) {
          ccSurcharge = parseFloat(match[1]);
          console.log(`[NDC] Found PaymentSurcharge for ${cardBrand}:`, ccSurcharge);
        }

        // Pattern 2: <PaymentSurcharge><Amount> as fallback
        if (ccSurcharge === 0) {
          const amountMatch = xmlResponse.match(/<PaymentSurcharge[^>]*>[\s\S]*?<Amount[^>]*>(\d+\.?\d*)<\/Amount>/i);
          if (amountMatch) {
            ccSurcharge = parseFloat(amountMatch[1]);
          }
        }

        results.push({
          cardBrand,
          ccSurcharge,
          surchargeType,
          requestXml: xmlRequest,
          responseXml: xmlResponse,
        });

        // Delay between requests - Jetstar may need time between OfferPrice calls
        // 1 second should be enough for API to reset availability state
        await new Promise(resolve => setTimeout(resolve, 1000));

      } catch (error: any) {
        console.error(`[NDC] Long Sell error for ${cardBrand}:`, error.message);
        console.error(`[NDC] Long Sell error details:`, error.response?.data);
        // Use xmlRequest if it was built, otherwise show error
        results.push({
          cardBrand,
          ccSurcharge: 0,
          surchargeType: 'unknown',
          error: error.message || 'Long Sell request failed',
          requestXml: xmlRequest || `<!-- Request not built - ${error.message} -->`,
          responseXml: typeof error.response?.data === 'string' ? error.response.data : `<Error>${error.message}</Error>`,
        });
      }
    }

    const duration = Date.now() - startTime;
    console.log("[NDC] CC Fees completed in", duration, "ms");
    console.log("[NDC] Results:", results.map(r => ({ cardBrand: r.cardBrand, ccSurcharge: r.ccSurcharge, error: r.error })));

    // Log Visa result to XML transaction logger
    const visaResult = results.find(r => r.cardBrand === 'VI');
    if (visaResult && visaResult.requestXml) {
      await xmlTransactionLogger.logTransaction({
        operation: 'CCFees',
        requestXml: visaResult.requestXml,
        responseXml: visaResult.responseXml || '',
        success: !visaResult.error,
        duration,
        userAction: `CC fees fetched for order ${orderId}: Visa=${visaResult.ccSurcharge}`,
      });
    }

    res.json({
      success: true,
      data: {
        orderId,
        currency: currency || order.totalPrice?.currency || 'AUD',
        fees: results,
      },
      duration,
    });
  } catch (error: any) {
    const duration = Date.now() - startTime;
    console.error("[NDC] CC Fees Error:", error.message);
    console.error("[NDC] CC Fees Error Stack:", error.stack);

    let errorMessage = error.message || 'Unknown error';
    let statusCode = error.response?.status || 500;

    const headerErrorMsg = error.response?.headers?.['error-msg-0'];
    const headerErrorCode = error.response?.headers?.['error-code-0'];

    if (headerErrorMsg) {
      errorMessage = headerErrorCode ? `${headerErrorCode}: ${headerErrorMsg}` : headerErrorMsg;
    }

    res.status(statusCode).json({
      success: false,
      error: errorMessage,
      message: errorMessage,
      status: statusCode,
      duration,
    });
  }
});

export default router;
