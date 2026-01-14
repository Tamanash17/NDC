// ============================================================================
// NDC CONTROLLER - All NDC Operations
// ============================================================================

import type { Request, Response, NextFunction } from "express";
import { ndcClient } from "../services/ndc-client.service.js";
import { getCredentialsOrThrow, setTokenInfoHeaders } from "../middleware/credentials.middleware.js";
import { logger } from "../utils/logger.js";
import { context } from "../utils/context.js";

import { buildAirShoppingXml } from "../builders/air-shopping.builder.js";
import { buildOfferPriceXml } from "../builders/offer-price.builder.js";
import { buildServiceListXml } from "../builders/service-list.builder.js";
import { buildSeatAvailabilityXml } from "../builders/seat-availability.builder.js";
import { buildOrderCreateXml } from "../builders/order-create.builder.js";
import { buildOrderRetrieveXml } from "../builders/order-retrieve.builder.js";
import { buildOrderReshopXml } from "../builders/order-reshop.builder.js";
import { buildOrderQuoteXml } from "../builders/order-quote.builder.js";
import { buildOrderChangeXml } from "../builders/order-change.builder.js";

import { airShoppingParser } from "../parsers/air-shopping.parser.js";
import { offerPriceParser } from "../parsers/offer-price.parser.js";
import { serviceListParser } from "../parsers/service-list.parser.js";
import { seatAvailabilityParser } from "../parsers/seat-availability.parser.js";
import { orderParser } from "../parsers/order.parser.js";
import { genericParser } from "../parsers/generic.parser.js";

import type { NDCOperation } from "../types/ndc.types.js";
import type { ApiResponse, ResponseMeta } from "../types/api.types.js";

function buildMeta(req: Request, operation: string, duration: number): ResponseMeta {
  const ctx = context.get();
  return {
    transactionId: ctx?.transactionId || "unknown",
    correlationId: ctx?.correlationId || "unknown",
    timestamp: new Date().toISOString(),
    duration,
    operation,
  };
}

async function executeNdcOperation(
  req: Request,
  res: Response,
  next: NextFunction,
  operation: NDCOperation,
  buildXml: (input: any) => string,
  parseResponse: (xml: string) => any
): Promise<void> {
  const startTime = Date.now();
  
  try {
    const credentials = getCredentialsOrThrow(req);
    const xmlRequest = buildXml(req.body);
    
    logger.info({ operation }, `Starting ${operation} request`);
    
    const result = await ndcClient.call({
      credentials,
      operation,
      xmlRequest,
    });
    
    const parsed = parseResponse(result.xmlResponse);
    setTokenInfoHeaders(res, result.tokenInfo);
    
    const duration = Date.now() - startTime;
    const { success, errors, ...responseData } = parsed;
    
    const response: ApiResponse = {
      success: parsed.success,
      data: responseData,
      meta: {
        ...buildMeta(req, operation, duration),
        tokenInfo: result.tokenInfo,
      },
    };
    
    if (!parsed.success && parsed.errors) {
      response.error = {
        code: "NDC_ERROR",
        message: parsed.errors[0]?.message || "NDC operation failed",
        retryable: false,
        ndcErrors: parsed.errors.map(e => ({ code: e.code, message: e.message })),
      };
    }
    
    res.json(response);
  } catch (error) {
    next(error);
  }
}

class NDCController {
  airShopping = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    await executeNdcOperation(req, res, next, "AirShopping", buildAirShoppingXml, (xml) => airShoppingParser.parse(xml));
  };
  
  offerPrice = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    await executeNdcOperation(req, res, next, "OfferPrice", buildOfferPriceXml, (xml) => offerPriceParser.parse(xml));
  };
  
  serviceList = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    await executeNdcOperation(req, res, next, "ServiceList", buildServiceListXml, (xml) => serviceListParser.parse(xml));
  };
  
  seatAvailability = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    await executeNdcOperation(req, res, next, "SeatAvailability", buildSeatAvailabilityXml, (xml) => seatAvailabilityParser.parse(xml));
  };
  
  orderCreate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    await executeNdcOperation(req, res, next, "OrderCreate", buildOrderCreateXml, (xml) => orderParser.parse(xml));
  };
  
  orderRetrieve = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    await executeNdcOperation(req, res, next, "OrderRetrieve", buildOrderRetrieveXml, (xml) => orderParser.parse(xml));
  };
  
  orderReshop = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    await executeNdcOperation(req, res, next, "OrderReshop", buildOrderReshopXml, (xml) => genericParser.parse(xml));
  };
  
  orderQuote = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    await executeNdcOperation(req, res, next, "OrderQuote", buildOrderQuoteXml, (xml) => orderParser.parse(xml));
  };
  
  orderChange = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    await executeNdcOperation(req, res, next, "OrderChange", buildOrderChangeXml, (xml) => orderParser.parse(xml));
  };
}

export const ndcController = new NDCController();