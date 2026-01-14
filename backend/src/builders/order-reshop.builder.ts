// ============================================================================
// ORDER RESHOP XML BUILDER
// ============================================================================

import {
  NDC_NAMESPACES,
  escapeXml,
  formatDate,
  buildPointOfSale,
  buildParty,
} from "./base.builder.js";
import type { OrderReshopRequest } from "../types/api.types.js";
import type { DistributionChain } from "../types/ndc.types.js";
import { config } from "../config/index.js";

export interface OrderReshopBuildOptions {
  distributionChain?: DistributionChain;
}

export function buildOrderReshopXml(
  input: OrderReshopRequest,
  options?: OrderReshopBuildOptions
): string {
  const chain = options?.distributionChain || input.distributionChain;
  const ownerCode = input.ownerCode || config.distributionChain.ownerCode;

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<IATA_OrderReshopRQ xmlns="${NDC_NAMESPACES.orderReshop}">
  ${buildPointOfSale()}
  ${buildParty(chain)}
  <Request>
    <OrderID Owner="${escapeXml(ownerCode)}">${escapeXml(input.orderId)}</OrderID>
    ${input.cancelOrder ? `<CancelOrder>true</CancelOrder>` : ""}
    ${input.cancelOrderItems?.map(id => `<CancelOrderItem><OrderItemRefID>${escapeXml(id)}</OrderItemRefID></CancelOrderItem>`).join("") || ""}
    ${input.flightCriteria ? `
    <ReshopCriteria>
      <OriginDestCriteria>
        <OriginDepCriteria>
          <IATA_LocationCode>${escapeXml(input.flightCriteria.origin)}</IATA_LocationCode>
          <Date>${formatDate(input.flightCriteria.departureDate)}</Date>
        </OriginDepCriteria>
        <DestArrivalCriteria>
          <IATA_LocationCode>${escapeXml(input.flightCriteria.destination)}</IATA_LocationCode>
        </DestArrivalCriteria>
      </OriginDestCriteria>
    </ReshopCriteria>` : ""}
  </Request>
</IATA_OrderReshopRQ>`;

  return xml.trim();
}

export const orderReshopBuilder = {
  build: buildOrderReshopXml,
};