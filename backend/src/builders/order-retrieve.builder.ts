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

  // Build DistributionChainLinks - support multiple links (for BOB)
  let distributionChainLinks = '';

  if (chain?.links && chain.links.length > 0) {
    // Use provided distribution chain links
    distributionChainLinks = chain.links.map(link => `
    <DistributionChainLink xmlns="http://www.iata.org/IATA/2015/EASD/00/IATA_OffersAndOrdersCommonTypes">
      <Ordinal>${link.ordinal}</Ordinal>
      <OrgRole>${escapeXml(link.orgRole)}</OrgRole>
      <ParticipatingOrg>
        <Name>${escapeXml(link.orgName)}</Name>
        <OrgID>${escapeXml(link.orgId)}</OrgID>
      </ParticipatingOrg>
    </DistributionChainLink>`).join('');
  } else {
    // Fallback to single default link
    const orgId = config.distributionChain.orgCode || '55778878';
    const orgName = config.distributionChain.orgName || 'Travel Agency';

    distributionChainLinks = `
    <DistributionChainLink xmlns="http://www.iata.org/IATA/2015/EASD/00/IATA_OffersAndOrdersCommonTypes">
      <Ordinal>1</Ordinal>
      <OrgRole>Seller</OrgRole>
      <ParticipatingOrg>
        <Name>${escapeXml(orgName)}</Name>
        <OrgID>${escapeXml(orgId)}</OrgID>
      </ParticipatingOrg>
    </DistributionChainLink>`;
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<IATA_OrderRetrieveRQ xmlns="http://www.iata.org/IATA/2015/EASD/00/IATA_OffersAndOrdersMessage">
  <DistributionChain>${distributionChainLinks}
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