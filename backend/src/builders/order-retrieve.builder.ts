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

  // Use distribution chain from request or defaults
  const orgId = chain?.links?.[0]?.orgId || config.distributionChain.orgCode || '55778878';
  const orgName = chain?.links?.[0]?.orgName || config.distributionChain.orgName || 'Travel Agency';

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<IATA_OrderRetrieveRQ xmlns="http://www.iata.org/IATA/2015/EASD/00/IATA_OffersAndOrdersMessage">
  <DistributionChain>
    <DistributionChainLink xmlns="http://www.iata.org/IATA/2015/EASD/00/IATA_OffersAndOrdersCommonTypes">
      <Ordinal>1</Ordinal>
      <OrgRole>Seller</OrgRole>
      <ParticipatingOrg>
        <Name>${escapeXml(orgName)}</Name>
        <OrgID>${escapeXml(orgId)}</OrgID>
      </ParticipatingOrg>
    </DistributionChainLink>
  </DistributionChain>
  <PayloadAttributes>
    <VersionNumber xmlns="http://www.iata.org/IATA/2015/EASD/00/IATA_OffersAndOrdersCommonTypes">21.3</VersionNumber>
  </PayloadAttributes>
  <Request>
    <OrderValidationFilterCriteria xmlns="http://www.iata.org/IATA/2015/EASD/00/IATA_OffersAndOrdersCommonTypes">
      <OrderFilterCriteria>
        <OrderID>${escapeXml(input.orderId)}</OrderID>
        <OwnerCode>${escapeXml(ownerCode)}</OwnerCode>
      </OrderFilterCriteria>
    </OrderValidationFilterCriteria>
  </Request>
</IATA_OrderRetrieveRQ>`;

  return xml.trim();
}

export const orderRetrieveBuilder = {
  build: buildOrderRetrieveXml,
};