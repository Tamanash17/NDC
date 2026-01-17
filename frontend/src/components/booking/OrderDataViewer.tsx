// ============================================================================
// ORDER DATA VIEWER - Comprehensive NDC Order Display for API Debugging
// Shows ALL IDs, references, and data for API team review
// ============================================================================

import { cn } from '@/lib/cn';
import { useState } from 'react';
import {
  ChevronDown, ChevronUp, Copy, Check, Database, Plane, User, CreditCard,
  Package, Tag, Receipt, Clock, MapPin, Calendar, FileText, Luggage,
  Utensils, Armchair, Star, Shield, AlertTriangle, Info, Hash, Link
} from 'lucide-react';

// ============================================================================
// TYPES
// ============================================================================

export interface OrderDataViewerProps {
  rawData: any;
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function OrderDataViewer({ rawData }: OrderDataViewerProps) {
  const dataLists = rawData?.DataLists || rawData?.Response?.DataLists || {};
  const order = rawData?.Response?.Order || rawData?.Order || rawData?.order || {};
  const paymentFunctions = rawData?.Response?.PaymentFunctions || rawData?.PaymentFunctions || {};
  const payloadAttributes = rawData?.PayloadAttributes || rawData?.Response?.PayloadAttributes || {};

  return (
    <div className="space-y-4">
      {/* Order Header with Key IDs */}
      <OrderHeaderSection order={order} payloadAttributes={payloadAttributes} />

      {/* Payment Processing Summary */}
      <PaymentProcessingSection paymentFunctions={paymentFunctions} />

      {/* Order Items - The core booking data */}
      <OrderItemsSection orderItems={normalizeToArray(order?.OrderItem)} dataLists={dataLists} />

      {/* DataLists Reference - For API debugging */}
      <DataListsSection dataLists={dataLists} />

      {/* Raw JSON Viewer - Collapsible */}
      <RawDataSection rawData={rawData} />
    </div>
  );
}

// ============================================================================
// ORDER HEADER SECTION
// ============================================================================

interface OrderHeaderSectionProps {
  order: any;
  payloadAttributes: any;
}

function OrderHeaderSection({ order, payloadAttributes }: OrderHeaderSectionProps) {
  const orderId = order?.OrderID || order?.orderId || 'N/A';
  const ownerCode = order?.OwnerCode || order?.ownerCode || 'JQ';
  const statusCode = order?.StatusCode || order?.status || 'UNKNOWN';
  const creationDateTime = order?.CreationDateTime || order?.creationDateTime;
  const totalPrice = order?.TotalPrice?.TotalAmount || order?.totalPrice;
  const correlationId = payloadAttributes?.CorrelationID;
  const timestamp = payloadAttributes?.Timestamp;
  const versionNumber = payloadAttributes?.VersionNumber;

  const totalValue = totalPrice?.value ?? parseFloat(totalPrice?.['#text'] || totalPrice || 0);
  const currency = totalPrice?.currency || totalPrice?.['@CurCode'] || totalPrice?.CurCode || 'AUD';

  return (
    <div className="bg-gradient-to-r from-slate-800 to-slate-900 rounded-2xl overflow-hidden shadow-xl">
      {/* Main Header */}
      <div className="px-6 py-5">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-orange-500 rounded-xl shadow-lg">
              <Database className="w-7 h-7 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-3xl font-bold text-white font-mono tracking-wider">{orderId}</h2>
                <StatusBadge status={statusCode} />
              </div>
              <div className="flex items-center gap-4 mt-1">
                <span className="text-slate-400 text-sm">Owner: <span className="text-white font-semibold">{ownerCode}</span></span>
                {creationDateTime && (
                  <span className="text-slate-400 text-sm">Created: <span className="text-white">{formatDateTime(creationDateTime)}</span></span>
                )}
              </div>
            </div>
          </div>

          {/* Total Amount */}
          <div className="text-right">
            <p className="text-slate-400 text-sm">Order Total</p>
            <p className="text-3xl font-bold text-emerald-400">{formatCurrency(totalValue, currency)}</p>
          </div>
        </div>
      </div>

      {/* Technical IDs Bar */}
      <div className="bg-slate-700/50 px-6 py-3 border-t border-slate-700">
        <div className="flex flex-wrap items-center gap-6 text-xs">
          {correlationId && (
            <IdBadge label="CorrelationID" value={correlationId} />
          )}
          {timestamp && (
            <IdBadge label="Timestamp" value={timestamp} />
          )}
          {versionNumber && (
            <IdBadge label="NDC Version" value={versionNumber} />
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// PAYMENT PROCESSING SECTION
// ============================================================================

interface PaymentProcessingSectionProps {
  paymentFunctions: any;
}

function PaymentProcessingSection({ paymentFunctions }: PaymentProcessingSectionProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const payments = normalizeToArray(paymentFunctions?.PaymentProcessingSummary);

  if (payments.length === 0) return null;

  return (
    <CollapsibleSection
      icon={CreditCard}
      title="Payment Processing"
      subtitle={`${payments.length} payment${payments.length > 1 ? 's' : ''}`}
      isExpanded={isExpanded}
      onToggle={() => setIsExpanded(!isExpanded)}
      headerColor="bg-emerald-600"
    >
      <div className="space-y-3">
        {payments.map((payment: any, idx: number) => (
          <PaymentCard key={idx} payment={payment} index={idx} />
        ))}
      </div>
    </CollapsibleSection>
  );
}

function PaymentCard({ payment, index }: { payment: any; index: number }) {
  const paymentId = payment?.PaymentID || 'N/A';
  const status = payment?.PaymentStatusCode || 'UNKNOWN';
  const amount = payment?.Amount;
  const amountValue = parseFloat(amount?.['#text'] || amount || 0);
  const currency = amount?.['@CurCode'] || amount?.CurCode || 'AUD';

  // Extract payment method details
  const methodData = payment?.PaymentProcessingSummaryPaymentMethod;
  const settlementPlan = methodData?.SettlementPlan;
  const paymentTypeCode = settlementPlan?.PaymentTypeCode || 'Unknown';

  // Card details if CC
  const cardCode = methodData?.PaymentCard?.CardBrandCode;
  const cardNumber = methodData?.PaymentCard?.MaskedCardNumber;

  const statusColors: Record<string, string> = {
    SUCCESSFUL: 'bg-emerald-100 text-emerald-700 border-emerald-300',
    PENDING: 'bg-amber-100 text-amber-700 border-amber-300',
    FAILED: 'bg-red-100 text-red-700 border-red-300',
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Payment Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-200">
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-gray-600">Payment #{index + 1}</span>
          <span className={cn('px-2 py-0.5 rounded text-xs font-bold border', statusColors[status] || 'bg-gray-100 text-gray-700')}>
            {status}
          </span>
        </div>
        <span className="text-xl font-bold text-gray-900">{formatCurrency(amountValue, currency)}</span>
      </div>

      {/* Payment Details Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4">
        <DataField label="PaymentID" value={paymentId} mono copyable />
        <DataField label="PaymentTypeCode" value={paymentTypeCode} mono />
        <DataField label="PaymentStatusCode" value={status} mono />
        <DataField label="Amount" value={`${currency} ${amountValue.toFixed(2)}`} />
        {cardCode && <DataField label="CardBrandCode" value={cardCode} mono />}
        {cardNumber && <DataField label="MaskedCardNumber" value={cardNumber} mono />}
      </div>
    </div>
  );
}

// ============================================================================
// ORDER ITEMS SECTION
// ============================================================================

interface OrderItemsSectionProps {
  orderItems: any[];
  dataLists: any;
}

function OrderItemsSection({ orderItems, dataLists }: OrderItemsSectionProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  if (orderItems.length === 0) return null;

  // Group order items by type (flights vs services)
  const flightItems = orderItems.filter(item => (item.OrderItemID || '').includes('FLIGHT'));
  const serviceItems = orderItems.filter(item => !(item.OrderItemID || '').includes('FLIGHT'));

  return (
    <CollapsibleSection
      icon={Package}
      title="Order Items"
      subtitle={`${orderItems.length} item${orderItems.length > 1 ? 's' : ''} (${flightItems.length} flight, ${serviceItems.length} service)`}
      isExpanded={isExpanded}
      onToggle={() => setIsExpanded(!isExpanded)}
      headerColor="bg-blue-600"
    >
      <div className="space-y-4">
        {/* Flight Order Items */}
        {flightItems.length > 0 && (
          <div>
            <h4 className="text-sm font-bold text-gray-700 mb-2 flex items-center gap-2">
              <Plane className="w-4 h-4 text-blue-600" />
              Flight Items
            </h4>
            <div className="space-y-3">
              {flightItems.map((item: any, idx: number) => (
                <FlightOrderItemCard key={idx} item={item} dataLists={dataLists} />
              ))}
            </div>
          </div>
        )}

        {/* Service Order Items */}
        {serviceItems.length > 0 && (
          <div>
            <h4 className="text-sm font-bold text-gray-700 mb-2 flex items-center gap-2">
              <Package className="w-4 h-4 text-purple-600" />
              Service Items
            </h4>
            <div className="space-y-3">
              {serviceItems.map((item: any, idx: number) => (
                <ServiceOrderItemCard key={idx} item={item} dataLists={dataLists} />
              ))}
            </div>
          </div>
        )}
      </div>
    </CollapsibleSection>
  );
}

function FlightOrderItemCard({ item, dataLists }: { item: any; dataLists: any }) {
  const [showFareDetails, setShowFareDetails] = useState(false);
  const [showPriceDetails, setShowPriceDetails] = useState(false);

  const orderItemId = item.OrderItemID || '';
  const statusCode = item.StatusCode || 'UNKNOWN';
  const ownerCode = item.OwnerCode || 'JQ';

  // Extract fare details
  const fareDetail = item.FareDetail || {};
  const fareComponent = fareDetail.FareComponent || {};
  const fareBasisCode = fareComponent.FareBasisCode || '';
  const cabinType = fareComponent.CabinType || {};
  const rbd = fareComponent.RBD?.RBD_Code || '';
  const priceClassRefId = fareComponent.PriceClassRefID || '';

  // Get price class details from DataLists
  const priceClasses = normalizeToArray(dataLists?.PriceClassList?.PriceClass);
  const priceClass = priceClasses.find((pc: any) => pc.PriceClassID === priceClassRefId);

  // Extract price
  const price = item.Price || fareDetail.Price || {};
  const baseAmount = parseFloat(price.BaseAmount?.['#text'] || price.BaseAmount || 0);
  const baseCurrency = price.BaseAmount?.['@CurCode'] || 'AUD';
  const totalAmount = parseFloat(price.TotalAmount?.['#text'] || price.TotalAmount || 0);
  const totalCurrency = price.TotalAmount?.['@CurCode'] || 'AUD';
  const fees = normalizeToArray(price.Fee);

  // Extract services (segments)
  const services = normalizeToArray(item.Service);
  const segmentRefs = services
    .filter((s: any) => (s.ServiceID || '').includes('-FLT'))
    .map((s: any) => ({
      serviceId: s.ServiceID,
      segmentRefId: s.OrderServiceAssociation?.PaxSegmentRef?.PaxSegmentRefID,
      paxRefId: s.PaxRefID,
      statusCode: s.StatusCode,
      deliveryStatusCode: s.DeliveryStatusCode,
    }));

  // Get segment details from DataLists
  const paxSegments = normalizeToArray(dataLists?.PaxSegmentList?.PaxSegment);
  const marketingSegments = normalizeToArray(dataLists?.DatedMarketingSegmentList?.DatedMarketingSegment);

  return (
    <div className="bg-white rounded-xl border border-blue-200 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-blue-50 border-b border-blue-200">
        <div className="flex items-center gap-3">
          <Plane className="w-5 h-5 text-blue-600" />
          <div>
            <p className="text-xs text-gray-500 font-mono">{orderItemId}</p>
            <div className="flex items-center gap-2">
              <StatusBadge status={statusCode} small />
              <span className="text-xs text-gray-500">Owner: {ownerCode}</span>
            </div>
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs text-gray-500">Total</p>
          <p className="text-lg font-bold text-blue-700">{formatCurrency(totalAmount, totalCurrency)}</p>
        </div>
      </div>

      {/* Fare Info Bar */}
      <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 flex flex-wrap items-center gap-4 text-xs">
        {fareBasisCode && <IdBadge label="FareBasisCode" value={fareBasisCode} color="amber" />}
        {rbd && <IdBadge label="RBD" value={rbd} color="purple" />}
        {cabinType.CabinTypeName && <IdBadge label="Cabin" value={`${cabinType.CabinTypeName} (${cabinType.CabinTypeCode})`} color="green" />}
        {priceClass && <IdBadge label="PriceClass" value={`${priceClass.Name} (${priceClass.Code})`} color="blue" />}
        {priceClassRefId && <IdBadge label="PriceClassID" value={priceClassRefId} color="gray" />}
      </div>

      {/* Segments List */}
      <div className="p-4">
        <h5 className="text-xs font-bold text-gray-600 uppercase tracking-wide mb-2">Flight Segments</h5>
        <div className="space-y-2">
          {segmentRefs.map((ref: any, idx: number) => {
            const paxSeg = paxSegments.find((ps: any) => ps.PaxSegmentID === ref.segmentRefId);
            const mktSegRef = paxSeg?.DatedMarketingSegmentRefId;
            const mktSeg = marketingSegments.find((ms: any) => ms.DatedMarketingSegmentId === mktSegRef);

            return (
              <div key={idx} className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {/* Flight Number */}
                    <span className="bg-orange-100 text-orange-700 px-2 py-1 rounded font-mono font-bold text-sm">
                      {mktSeg?.CarrierDesigCode} {mktSeg?.MarketingCarrierFlightNumberText}
                    </span>
                    {/* Route */}
                    <span className="font-semibold text-gray-900">
                      {mktSeg?.Dep?.IATA_LocationCode} → {mktSeg?.Arrival?.IATA_LocationCode}
                    </span>
                    {/* Time */}
                    <span className="text-sm text-gray-600">
                      {formatTime(mktSeg?.Dep?.AircraftScheduledDateTime)} - {formatTime(mktSeg?.Arrival?.AircraftScheduledDateTime)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={ref.deliveryStatusCode || ref.statusCode} small />
                  </div>
                </div>
                {/* IDs Row */}
                <div className="mt-2 flex flex-wrap items-center gap-3 text-[10px]">
                  <IdBadge label="ServiceID" value={ref.serviceId} color="gray" small />
                  <IdBadge label="PaxSegmentID" value={ref.segmentRefId} color="gray" small />
                  <IdBadge label="MktSegmentID" value={mktSegRef} color="gray" small />
                  <IdBadge label="PaxRefID" value={ref.paxRefId} color="gray" small />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Price Details Toggle */}
      <div className="border-t border-gray-200">
        <button
          onClick={() => setShowPriceDetails(!showPriceDetails)}
          className="w-full px-4 py-2 flex items-center justify-between text-sm text-gray-600 hover:bg-gray-50"
        >
          <span className="flex items-center gap-2">
            <Receipt className="w-4 h-4" />
            Price Breakdown ({fees.length} fees)
          </span>
          {showPriceDetails ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
        {showPriceDetails && (
          <div className="px-4 pb-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Base Amount</span>
              <span className="font-mono">{formatCurrency(baseAmount, baseCurrency)}</span>
            </div>
            {fees.map((fee: any, idx: number) => (
              <div key={idx} className="flex justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-gray-600">{fee.DescText || 'Fee'}</span>
                  <span className="text-[10px] font-mono bg-gray-200 px-1 rounded">{fee.DesigText}</span>
                </div>
                <span className="font-mono text-gray-700">
                  {formatCurrency(parseFloat(fee.Amount?.['#text'] || fee.Amount || 0), fee.Amount?.['@CurCode'] || 'AUD')}
                </span>
              </div>
            ))}
            <div className="flex justify-between text-sm font-bold border-t border-gray-200 pt-2">
              <span>Total</span>
              <span className="text-blue-700">{formatCurrency(totalAmount, totalCurrency)}</span>
            </div>
          </div>
        )}
      </div>

      {/* Fare Rules Toggle */}
      {fareComponent.FareRule?.Remark?.RemarkText && (
        <div className="border-t border-gray-200">
          <button
            onClick={() => setShowFareDetails(!showFareDetails)}
            className="w-full px-4 py-2 flex items-center justify-between text-sm text-gray-600 hover:bg-gray-50"
          >
            <span className="flex items-center gap-2">
              <FileText className="w-4 h-4" />
              Fare Rules
            </span>
            {showFareDetails ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          {showFareDetails && (
            <div className="px-4 pb-4">
              <pre className="text-xs text-gray-600 whitespace-pre-wrap bg-gray-50 p-3 rounded border max-h-60 overflow-auto">
                {fareComponent.FareRule.Remark.RemarkText}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ServiceOrderItemCard({ item, dataLists }: { item: any; dataLists: any }) {
  const [showDetails, setShowDetails] = useState(false);

  const orderItemId = item.OrderItemID || '';
  const statusCode = item.StatusCode || 'UNKNOWN';
  const ownerCode = item.OwnerCode || 'JQ';

  // Extract price
  const price = item.Price || {};
  const baseAmount = parseFloat(price.BaseAmount?.['#text'] || price.BaseAmount || 0);
  const totalAmount = parseFloat(price.TotalAmount?.['#text'] || price.TotalAmount || 0);
  const currency = price.TotalAmount?.['@CurCode'] || price.BaseAmount?.['@CurCode'] || 'AUD';

  // Extract services
  const services = normalizeToArray(item.Service);

  // Get service definitions from DataLists
  const serviceDefinitions = normalizeToArray(dataLists?.ServiceDefinitionList?.ServiceDefinition);

  // Determine service type from OrderItemID
  const serviceType = getServiceTypeFromId(orderItemId);
  const ServiceIcon = getServiceIcon(serviceType);

  return (
    <div className="bg-white rounded-xl border border-purple-200 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-purple-50 border-b border-purple-200">
        <div className="flex items-center gap-3">
          <ServiceIcon className="w-5 h-5 text-purple-600" />
          <div>
            <p className="text-xs text-gray-500 font-mono">{orderItemId}</p>
            <div className="flex items-center gap-2">
              <StatusBadge status={statusCode} small />
              <span className="text-xs text-purple-600 font-semibold">{serviceType}</span>
            </div>
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs text-gray-500">Total</p>
          <p className="text-lg font-bold text-purple-700">{formatCurrency(totalAmount, currency)}</p>
        </div>
      </div>

      {/* Service Details */}
      <div className="p-4">
        <div className="space-y-2">
          {services.map((svc: any, idx: number) => {
            const serviceDefRefId = svc.OrderServiceAssociation?.ServiceDefinitionRef?.ServiceDefinitionRefID;
            const serviceDef = serviceDefinitions.find((sd: any) => sd.ServiceDefinitionID === serviceDefRefId);
            const segmentRefIds = normalizeToArray(
              svc.OrderServiceAssociation?.ServiceDefinitionRef?.OrderFlightAssociations?.PaxSegmentRef
            ).map((ref: any) => ref.PaxSegmentRefID);

            return (
              <div key={idx} className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-gray-900">{serviceDef?.Name || 'Service'}</p>
                    <p className="text-xs text-gray-500">{serviceDef?.Desc?.[0]?.DescText || ''}</p>
                  </div>
                  <StatusBadge status={svc.DeliveryStatusCode || svc.StatusCode} small />
                </div>
                {/* IDs Row */}
                <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px]">
                  <IdBadge label="ServiceID" value={svc.ServiceID} color="gray" small />
                  {serviceDefRefId && <IdBadge label="ServiceDefID" value={serviceDefRefId} color="gray" small />}
                  {serviceDef?.ServiceCode && <IdBadge label="Code" value={serviceDef.ServiceCode} color="purple" small />}
                  <IdBadge label="PaxRefID" value={svc.PaxRefID} color="gray" small />
                  {segmentRefIds.length > 0 && segmentRefIds.map((segId: string, i: number) => (
                    <IdBadge key={i} label={`Seg${i+1}`} value={segId} color="gray" small />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// DATA LISTS SECTION
// ============================================================================

interface DataListsSectionProps {
  dataLists: any;
}

function DataListsSection({ dataLists }: DataListsSectionProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<string>('segments');

  const tabs = [
    { id: 'segments', label: 'Segments', icon: Plane },
    { id: 'passengers', label: 'Passengers', icon: User },
    { id: 'services', label: 'Service Defs', icon: Package },
    { id: 'prices', label: 'Price Classes', icon: Tag },
    { id: 'journeys', label: 'Journeys', icon: MapPin },
    { id: 'baggage', label: 'Baggage', icon: Luggage },
  ];

  return (
    <CollapsibleSection
      icon={Database}
      title="DataLists Reference"
      subtitle="Lookup tables for segments, services, price classes, etc."
      isExpanded={isExpanded}
      onToggle={() => setIsExpanded(!isExpanded)}
      headerColor="bg-slate-600"
    >
      {/* Tabs */}
      <div className="flex flex-wrap gap-2 mb-4">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
              activeTab === tab.id
                ? 'bg-slate-700 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            )}
          >
            <tab.icon className="w-3.5 h-3.5" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
        {activeTab === 'segments' && <SegmentsTab dataLists={dataLists} />}
        {activeTab === 'passengers' && <PassengersTab dataLists={dataLists} />}
        {activeTab === 'services' && <ServiceDefsTab dataLists={dataLists} />}
        {activeTab === 'prices' && <PriceClassesTab dataLists={dataLists} />}
        {activeTab === 'journeys' && <JourneysTab dataLists={dataLists} />}
        {activeTab === 'baggage' && <BaggageTab dataLists={dataLists} />}
      </div>
    </CollapsibleSection>
  );
}

function SegmentsTab({ dataLists }: { dataLists: any }) {
  const paxSegments = normalizeToArray(dataLists?.PaxSegmentList?.PaxSegment);
  const marketingSegments = normalizeToArray(dataLists?.DatedMarketingSegmentList?.DatedMarketingSegment);
  const operatingSegments = normalizeToArray(dataLists?.DatedOperatingSegmentList?.DatedOperatingSegment);

  // Build lookup maps
  const mktMap = new Map<string, any>();
  marketingSegments.forEach((ms: any) => mktMap.set(ms.DatedMarketingSegmentId, ms));
  const oprMap = new Map<string, any>();
  operatingSegments.forEach((os: any) => oprMap.set(os.DatedOperatingSegmentId, os));

  return (
    <div className="space-y-4">
      <div className="text-xs text-gray-500 mb-2">
        {paxSegments.length} PaxSegments, {marketingSegments.length} MarketingSegments, {operatingSegments.length} OperatingSegments
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-slate-200 text-slate-700">
              <th className="px-2 py-1.5 text-left font-semibold">PaxSegmentID</th>
              <th className="px-2 py-1.5 text-left font-semibold">MktSegmentID</th>
              <th className="px-2 py-1.5 text-left font-semibold">Flight</th>
              <th className="px-2 py-1.5 text-left font-semibold">Route</th>
              <th className="px-2 py-1.5 text-left font-semibold">Departure</th>
              <th className="px-2 py-1.5 text-left font-semibold">Arrival</th>
              <th className="px-2 py-1.5 text-left font-semibold">Duration</th>
              <th className="px-2 py-1.5 text-left font-semibold">Cabin</th>
            </tr>
          </thead>
          <tbody>
            {paxSegments.map((paxSeg: any, idx: number) => {
              const mktSeg = mktMap.get(paxSeg.DatedMarketingSegmentRefId);
              const oprSeg = oprMap.get(mktSeg?.DatedOperatingSegmentRefId);
              const cabin = paxSeg.CabinTypeAssociationChoice?.SegmentCabinType;

              return (
                <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  <td className="px-2 py-1.5 font-mono text-blue-600">{paxSeg.PaxSegmentID}</td>
                  <td className="px-2 py-1.5 font-mono text-gray-500">{paxSeg.DatedMarketingSegmentRefId}</td>
                  <td className="px-2 py-1.5 font-bold">{mktSeg?.CarrierDesigCode} {mktSeg?.MarketingCarrierFlightNumberText}</td>
                  <td className="px-2 py-1.5">{mktSeg?.Dep?.IATA_LocationCode} → {mktSeg?.Arrival?.IATA_LocationCode}</td>
                  <td className="px-2 py-1.5">{formatDateTime(mktSeg?.Dep?.AircraftScheduledDateTime)}</td>
                  <td className="px-2 py-1.5">{formatDateTime(mktSeg?.Arrival?.AircraftScheduledDateTime)}</td>
                  <td className="px-2 py-1.5">{oprSeg?.Duration || '-'}</td>
                  <td className="px-2 py-1.5">{cabin?.CabinTypeName} ({cabin?.CabinTypeCode})</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PassengersTab({ dataLists }: { dataLists: any }) {
  const paxList = normalizeToArray(dataLists?.PaxList?.Pax);
  const contactList = normalizeToArray(dataLists?.ContactInfoList?.ContactInfo);

  // Build contact lookup
  const contactMap = new Map<string, any>();
  contactList.forEach((c: any) => contactMap.set(c.ContactInfoID, c));

  return (
    <div className="space-y-3">
      <div className="text-xs text-gray-500 mb-2">{paxList.length} Passenger(s)</div>
      {paxList.map((pax: any, idx: number) => {
        const individual = pax.Individual || {};
        const identityDoc = pax.IdentityDoc || {};
        const loyalty = pax.LoyaltyProgramAccount;
        const contact = contactMap.get(pax.ContactInfoRefID);

        return (
          <div key={idx} className="bg-white rounded-lg border border-gray-200 p-3">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-bold text-gray-900">{individual.GivenName} {individual.Surname}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">{pax.PTC}</span>
                  <span className="text-xs text-gray-500">DOB: {individual.Birthdate}</span>
                  <span className="text-xs text-gray-500">{individual.GenderCode === 'M' ? 'Male' : 'Female'}</span>
                </div>
              </div>
              <IdBadge label="PaxID" value={pax.PaxID} color="blue" />
            </div>

            {/* Document */}
            {identityDoc.IdentityDocID && (
              <div className="mt-2 pt-2 border-t border-gray-100">
                <p className="text-xs text-gray-500 mb-1">Identity Document</p>
                <div className="flex flex-wrap gap-2 text-xs">
                  <IdBadge label="Type" value={identityDoc.IdentityDocTypeCode} color="gray" small />
                  <IdBadge label="DocID" value={identityDoc.IdentityDocID} color="gray" small />
                  <IdBadge label="Issuing" value={identityDoc.IssuingCountryCode} color="gray" small />
                  <IdBadge label="Expiry" value={identityDoc.ExpiryDate} color="gray" small />
                </div>
              </div>
            )}

            {/* Loyalty */}
            {loyalty && (
              <div className="mt-2 pt-2 border-t border-gray-100">
                <p className="text-xs text-gray-500 mb-1">Loyalty Program</p>
                <div className="flex items-center gap-2">
                  <Star className="w-4 h-4 text-amber-500" />
                  <span className="text-sm font-semibold">{loyalty.LoyaltyProgram?.Carrier?.AirlineDesigCode} #{loyalty.AccountNumber}</span>
                </div>
              </div>
            )}

            {/* Contact */}
            {contact && (
              <div className="mt-2 pt-2 border-t border-gray-100">
                <p className="text-xs text-gray-500 mb-1">Contact (ID: {pax.ContactInfoRefID})</p>
                <div className="flex flex-wrap gap-3 text-xs">
                  {contact.EmailAddress?.EmailAddressText && (
                    <span className="text-gray-700">{contact.EmailAddress.EmailAddressText}</span>
                  )}
                  {contact.Phone?.PhoneNumber && (
                    <span className="text-gray-700">{contact.Phone.PhoneNumber}</span>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ServiceDefsTab({ dataLists }: { dataLists: any }) {
  const serviceDefs = normalizeToArray(dataLists?.ServiceDefinitionList?.ServiceDefinition);

  return (
    <div className="space-y-2">
      <div className="text-xs text-gray-500 mb-2">{serviceDefs.length} Service Definition(s)</div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-slate-200 text-slate-700">
              <th className="px-2 py-1.5 text-left font-semibold">ServiceDefinitionID</th>
              <th className="px-2 py-1.5 text-left font-semibold">ServiceCode</th>
              <th className="px-2 py-1.5 text-left font-semibold">Name</th>
              <th className="px-2 py-1.5 text-left font-semibold">RFIC/RFISC</th>
              <th className="px-2 py-1.5 text-left font-semibold">Owner</th>
              <th className="px-2 py-1.5 text-left font-semibold">Description</th>
            </tr>
          </thead>
          <tbody>
            {serviceDefs.map((def: any, idx: number) => (
              <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                <td className="px-2 py-1.5 font-mono text-purple-600">{def.ServiceDefinitionID}</td>
                <td className="px-2 py-1.5 font-bold text-purple-800">{def.ServiceCode}</td>
                <td className="px-2 py-1.5">{def.Name}</td>
                <td className="px-2 py-1.5 font-mono">{def.RFIC}/{def.RFISC}</td>
                <td className="px-2 py-1.5">{def.OwnerCode}</td>
                <td className="px-2 py-1.5 text-gray-500 max-w-xs truncate">{def.Desc?.[0]?.DescText}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PriceClassesTab({ dataLists }: { dataLists: any }) {
  const priceClasses = normalizeToArray(dataLists?.PriceClassList?.PriceClass);

  return (
    <div className="space-y-2">
      <div className="text-xs text-gray-500 mb-2">{priceClasses.length} Price Class(es)</div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {priceClasses.map((pc: any, idx: number) => (
          <div key={idx} className="bg-white rounded-lg border border-gray-200 p-3">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-bold text-gray-900">{pc.Name}</p>
                <p className="text-xs text-gray-500 mt-0.5">{pc.Desc?.DescText}</p>
              </div>
              <span className="bg-amber-100 text-amber-800 px-2 py-0.5 rounded text-xs font-bold">{pc.Code}</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-2 text-[10px]">
              <IdBadge label="PriceClassID" value={pc.PriceClassID} color="gray" small />
              <IdBadge label="FareBasisCode" value={pc.FareBasisCode} color="amber" small />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function JourneysTab({ dataLists }: { dataLists: any }) {
  const journeys = normalizeToArray(dataLists?.PaxJourneyList?.PaxJourney);

  return (
    <div className="space-y-3">
      <div className="text-xs text-gray-500 mb-2">{journeys.length} Journey(s)</div>
      {journeys.map((j: any, idx: number) => {
        const segmentRefs = normalizeToArray(j.PaxSegmentRefID);
        return (
          <div key={idx} className="bg-white rounded-lg border border-gray-200 p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className={cn(
                  'px-2 py-0.5 rounded text-xs font-bold',
                  idx === 0 ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'
                )}>
                  {idx === 0 ? 'Outbound' : 'Return'}
                </span>
                <span className="text-sm text-gray-600">Duration: {j.Duration}</span>
              </div>
              <IdBadge label="PaxJourneyID" value={j.PaxJourneyID} color="green" />
            </div>
            <div className="mt-2">
              <p className="text-xs text-gray-500 mb-1">Segment References ({segmentRefs.length})</p>
              <div className="flex flex-wrap gap-1">
                {segmentRefs.map((ref: string, i: number) => (
                  <span key={i} className="text-[10px] font-mono bg-gray-200 px-1.5 py-0.5 rounded">{ref}</span>
                ))}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function BaggageTab({ dataLists }: { dataLists: any }) {
  const baggageAllowances = normalizeToArray(dataLists?.BaggageAllowanceList?.BaggageAllowance);

  return (
    <div className="space-y-2">
      <div className="text-xs text-gray-500 mb-2">{baggageAllowances.length} Baggage Allowance(s)</div>
      {baggageAllowances.map((ba: any, idx: number) => (
        <div key={idx} className="bg-white rounded-lg border border-gray-200 p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Luggage className="w-5 h-5 text-orange-500" />
              <div>
                <p className="font-semibold text-gray-900">{ba.TypeCode} Baggage</p>
                <p className="text-sm text-gray-600">
                  {ba.WeightAllowance?.MaximumWeightMeasure} {ba.WeightAllowance?.WeightUnitOfMeasurement}
                </p>
              </div>
            </div>
            <IdBadge label="BaggageAllowanceID" value={ba.BaggageAllowanceID} color="orange" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ============================================================================
// RAW DATA SECTION
// ============================================================================

interface RawDataSectionProps {
  rawData: any;
}

function RawDataSection({ rawData }: RawDataSectionProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <CollapsibleSection
      icon={FileText}
      title="Raw JSON Data"
      subtitle="Complete API response for debugging"
      isExpanded={isExpanded}
      onToggle={() => setIsExpanded(!isExpanded)}
      headerColor="bg-gray-600"
    >
      <pre className="text-xs text-gray-700 bg-gray-900 text-green-400 p-4 rounded-lg overflow-auto max-h-96 font-mono">
        {JSON.stringify(rawData, null, 2)}
      </pre>
    </CollapsibleSection>
  );
}

// ============================================================================
// SHARED COMPONENTS
// ============================================================================

interface CollapsibleSectionProps {
  icon: React.ElementType;
  title: string;
  subtitle?: string;
  isExpanded: boolean;
  onToggle: () => void;
  headerColor: string;
  children: React.ReactNode;
}

function CollapsibleSection({ icon: Icon, title, subtitle, isExpanded, onToggle, headerColor, children }: CollapsibleSectionProps) {
  return (
    <div className="bg-white rounded-xl shadow-lg overflow-hidden border border-gray-200">
      <button
        onClick={onToggle}
        className={cn(
          'w-full flex items-center justify-between px-5 py-4 text-white transition-colors',
          headerColor,
          'hover:opacity-90'
        )}
      >
        <div className="flex items-center gap-3">
          <Icon className="w-5 h-5" />
          <div className="text-left">
            <h3 className="font-bold">{title}</h3>
            {subtitle && <p className="text-xs opacity-80">{subtitle}</p>}
          </div>
        </div>
        {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
      </button>
      {isExpanded && (
        <div className="p-5">
          {children}
        </div>
      )}
    </div>
  );
}

interface IdBadgeProps {
  label: string;
  value: string;
  color?: 'blue' | 'green' | 'amber' | 'purple' | 'orange' | 'gray' | 'red';
  small?: boolean;
}

function IdBadge({ label, value, color = 'gray', small = false }: IdBadgeProps) {
  const [copied, setCopied] = useState(false);

  const colorClasses = {
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
    green: 'bg-green-50 text-green-700 border-green-200',
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
    purple: 'bg-purple-50 text-purple-700 border-purple-200',
    orange: 'bg-orange-50 text-orange-700 border-orange-200',
    gray: 'bg-gray-100 text-gray-600 border-gray-200',
    red: 'bg-red-50 text-red-700 border-red-200',
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <button
      onClick={handleCopy}
      className={cn(
        'inline-flex items-center gap-1 border rounded font-mono transition-colors hover:opacity-80',
        colorClasses[color],
        small ? 'px-1 py-0.5 text-[9px]' : 'px-1.5 py-0.5 text-[10px]'
      )}
      title={`Click to copy: ${value}`}
    >
      <span className="opacity-60">{label}:</span>
      <span className="font-semibold">{value || 'N/A'}</span>
      {copied ? <Check className="w-2.5 h-2.5 text-green-600" /> : <Copy className="w-2.5 h-2.5 opacity-40" />}
    </button>
  );
}

interface DataFieldProps {
  label: string;
  value: string;
  mono?: boolean;
  copyable?: boolean;
}

function DataField({ label, value, mono, copyable }: DataFieldProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (!copyable) return;
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div
      className={cn(copyable && 'cursor-pointer hover:bg-gray-50 rounded p-1 -m-1 transition-colors')}
      onClick={handleCopy}
      title={copyable ? `Click to copy: ${value}` : undefined}
    >
      <p className="text-xs text-gray-500">{label}</p>
      <div className="flex items-center gap-1">
        <p className={cn('text-sm font-medium text-gray-900', mono && 'font-mono')}>{value}</p>
        {copyable && (copied ? <Check className="w-3 h-3 text-green-600" /> : <Copy className="w-3 h-3 text-gray-400" />)}
      </div>
    </div>
  );
}

function StatusBadge({ status, small = false }: { status: string; small?: boolean }) {
  const statusConfig: Record<string, { bg: string; text: string; label: string }> = {
    SUCCESSFUL: { bg: 'bg-emerald-100', text: 'text-emerald-700', label: 'Successful' },
    SUCCESS: { bg: 'bg-emerald-100', text: 'text-emerald-700', label: 'Success' },
    ACTIVE: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Active' },
    CONFIRMED: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Confirmed' },
    'READY TO PROCEED': { bg: 'bg-emerald-100', text: 'text-emerald-700', label: 'Ready' },
    OPENED: { bg: 'bg-amber-100', text: 'text-amber-700', label: 'On Hold' },
    PENDING: { bg: 'bg-amber-100', text: 'text-amber-700', label: 'Pending' },
    FAILED: { bg: 'bg-red-100', text: 'text-red-700', label: 'Failed' },
    CANCELLED: { bg: 'bg-red-100', text: 'text-red-700', label: 'Cancelled' },
  };

  const config = statusConfig[status] || { bg: 'bg-gray-100', text: 'text-gray-700', label: status };

  return (
    <span className={cn(
      'inline-flex items-center rounded font-semibold',
      config.bg, config.text,
      small ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-1 text-xs'
    )}>
      {config.label}
    </span>
  );
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function normalizeToArray<T>(value: T | T[] | undefined): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function formatCurrency(value: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(value);
}

function formatDateTime(dateStr: string | undefined): string {
  if (!dateStr) return '-';
  try {
    const date = new Date(dateStr);
    return date.toLocaleString('en-AU', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
}

function formatTime(dateStr: string | undefined): string {
  if (!dateStr) return '-';
  try {
    const date = new Date(dateStr);
    return date.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', hour12: false });
  } catch {
    return dateStr;
  }
}

function getServiceTypeFromId(orderItemId: string): string {
  if (orderItemId.includes('P200') || orderItemId.includes('STPL') || orderItemId.includes('BNDL')) return 'BUNDLE';
  if (orderItemId.includes('BAG') || orderItemId.includes('BG')) return 'BAGGAGE';
  if (orderItemId.includes('SEAT') || orderItemId.includes('ST')) return 'SEAT';
  if (orderItemId.includes('MEAL') || orderItemId.includes('ML')) return 'MEAL';
  return 'SERVICE';
}

function getServiceIcon(type: string) {
  const icons: Record<string, React.ElementType> = {
    BUNDLE: Package,
    BAGGAGE: Luggage,
    SEAT: Armchair,
    MEAL: Utensils,
    SERVICE: Shield,
  };
  return icons[type] || Package;
}
