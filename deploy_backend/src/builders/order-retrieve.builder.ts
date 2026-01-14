// ============================================================================
// ORDER RETRIEVE XML BUILDER
// ============================================================================

import {
  NDC_NAMESPACES,
  escapeXml,
  buildPointOfSale,
  buildParty,
} from "./base.builder.js";
import type { OrderRetrieveRequest } from "../types/api.types.js";
import type { DistributionChain } from "../types/ndc.types.js";
import { config } from "../config/index.js";

export interface OrderRetrieveBuildOptions {
  distributionChain?: DistributionChain;
}

export function buildOrderRetrieveXml(
  input: OrderRetrieveRequest,
  options?: OrderRetrieveBuildOptions
): string {
  const chain = options?.distributionChain || input.distributionChain;
  const ownerCode = input.ownerCode || config.distributionChain.ownerCode;

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<IATA_OrderRetrieveRQ xmlns="${NDC_NAMESPACES.orderRetrieve}">
  ${buildPointOfSale()}
  ${buildParty(chain)}
  <Request>
    <OrderID Owner="${escapeXml(ownerCode)}">${escapeXml(input.orderId)}</OrderID>
  </Request>
</IATA_OrderRetrieveRQ>`;

  return xml.trim();
}

export const orderRetrieveBuilder = {
  build: buildOrderRetrieveXml,
};