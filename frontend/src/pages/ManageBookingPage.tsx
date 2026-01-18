import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useXmlViewer } from '@/core/context/XmlViewerContext';
import { useSessionStore } from '@/core/context/SessionStore';
import { useServicingStore, type ServicingBookingData } from '@/core/context/ServicingStore';
import { orderRetrieve } from '@/lib/ndc-api';
import { cn } from '@/lib/cn';
import { Card, Button, Alert } from '@/components/ui';
import { AppLayout } from '@/components/layout';
import {
  Search, RefreshCw, XCircle, Luggage, Armchair, Plane, Clock,
  CreditCard, ChevronDown, ChevronUp, Copy, Check,
  User, Users, Baby, Star, FileText, Package, Tag, Database, Eye, Code,
  AlertTriangle, CheckCircle, Info, Timer, Utensils,
  Building2, Wallet, Award
} from 'lucide-react';

// ============================================================================
// TYPES
// ============================================================================

type ViewMode = 'simple' | 'developer';

interface ParsedBooking {
  pnr: string;
  ownerCode: string;
  status: string;
  creationDate?: string;
  totalPrice: { value: number; currency: string };
  paymentStatus: string;
  payments: PaymentInfo[];
  journeys: JourneyInfo[];
  passengers: PassengerInfo[];
  services: ServiceInfo[];
  contactInfo?: ContactInfo;
  correlationId?: string;
  warnings?: { code?: string; message: string }[];
  rawData: any;
}

interface PaymentInfo {
  paymentId: string;
  status: string;
  amount: { value: number; currency: string };
  method: { type: string; cardBrand?: string; maskedNumber?: string };
}

interface JourneyInfo {
  journeyId: string;
  direction: 'outbound' | 'inbound' | 'multi-city';
  directionLabel: string; // e.g., "Outbound", "Return", "Journey 2", etc.
  origin: string;
  destination: string;
  duration: string;
  segments: SegmentInfo[];
}

interface SegmentInfo {
  segmentId: string;
  marketingSegmentId?: string;
  flightNumber: string;
  carrierCode: string;
  origin: string;
  destination: string;
  departureTime: string;
  arrivalTime: string;
  duration?: string;
  aircraft?: string;
  cabinClass?: string;
  cabinCode?: string;
  rbd?: string;
  status?: string;
  isPassive?: boolean; // SegmentTypeCode = 2 indicates passive segment
  segmentTypeCode?: string;
}

interface PassengerInfo {
  paxId: string;
  ptc: string;
  name: string;
  givenName: string;
  surname: string;
  birthdate?: string;
  gender?: string;
  email?: string;
  phone?: string;
  document?: {
    type: string;
    number: string;
    expiry: string;
    country: string;
  };
  loyalty?: {
    program: string;
    number: string;
  };
  services: PassengerServiceInfo[];
}

interface PassengerServiceInfo {
  type: string;
  name: string;
  code?: string;
  segmentId?: string;
  price?: { value: number; currency: string };
}

interface ServiceInfo {
  orderItemId: string;
  type: string;
  name: string;
  code?: string;
  price: { value: number; currency: string };
  status: string;
  paxIds: string[];
  segmentIds: string[];
}

interface ContactInfo {
  email?: string;
  phone?: string;
  city?: string;
  country?: string;
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function ManageBookingPage() {
  const navigate = useNavigate();
  const { startNewSession, addCapture } = useXmlViewer();
  const { getDistributionContext } = useSessionStore();
  const { setBookingData, clearBookingData } = useServicingStore();
  const [searchParams] = useSearchParams();

  const pnrFromUrl = searchParams.get('pnr') || '';
  const [pnr, setPnr] = useState(pnrFromUrl);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [booking, setBooking] = useState<any>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('simple');

  // Parse booking data
  const parsedBooking = useMemo<ParsedBooking | null>(() => {
    if (!booking) return null;
    try {
      return parseBookingData(booking);
    } catch (err) {
      console.error('[ManageBooking] Parse error:', err);
      return null;
    }
  }, [booking]);

  // Save parsed booking to ServicingStore for servicing operations
  useEffect(() => {
    if (parsedBooking && booking) {
      const servicingData = transformToServicingData(parsedBooking, booking);
      setBookingData(servicingData);
      console.log('[ManageBooking] Saved booking to ServicingStore:', servicingData.orderId);
    } else if (!booking) {
      // Clear servicing store when booking is cleared
      clearBookingData();
    }
  }, [parsedBooking, booking, setBookingData, clearBookingData]);

  useEffect(() => {
    startNewSession();
  }, [startNewSession]);

  useEffect(() => {
    const urlPnr = searchParams.get('pnr');
    if (urlPnr) {
      setPnr(urlPnr.toUpperCase());
      const autoSearch = searchParams.get('auto') !== 'false';
      if (autoSearch && urlPnr.trim().length > 0) {
        setTimeout(() => {
          document.getElementById('pnr-search-btn')?.click();
        }, 100);
      }
    }
  }, [searchParams]);

  const handleSearch = async () => {
    if (!pnr || pnr.trim().length === 0) {
      setError('Please enter a booking reference (PNR)');
      return;
    }

    setIsLoading(true);
    setError(null);
    const startTime = Date.now();

    try {
      const distributionContext = getDistributionContext();
      const response = await orderRetrieve({
        orderId: pnr.trim(),
        ownerCode: 'JQ',
        distributionChain: distributionContext ? { links: distributionContext.links } : undefined
      });

      if (response.success === false) {
        addCapture({
          operation: 'OrderRetrieve',
          request: response.requestXml || '',
          response: response.responseXml || '',
          duration: Date.now() - startTime,
          status: 'error',
          userAction: `Failed to retrieve booking ${pnr.trim()}`,
        });
        setError(response.error || response.errors?.[0]?.message || 'Booking retrieval failed');
        return;
      }

      addCapture({
        operation: 'OrderRetrieve',
        request: response.requestXml || '',
        response: response.responseXml || '',
        duration: Date.now() - startTime,
        status: 'success',
        userAction: `Retrieved booking ${pnr.trim()}`,
      });

      const bookingData = response.data || response.parsed || response.Response || response;
      if (!bookingData) throw new Error('No booking data received');
      setBooking(bookingData);
    } catch (err: any) {
      console.error('[ManageBooking] Search error:', err);
      addCapture({
        operation: 'OrderRetrieve',
        request: err.response?.data?.requestXml || '',
        response: err.response?.data?.responseXml || `<error>${err.message}</error>`,
        duration: Date.now() - startTime,
        status: 'error',
        userAction: `Failed to retrieve booking ${pnr.trim()}`,
      });
      setError(err.response?.data?.error || err.message || 'Booking not found');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAction = (action: 'change' | 'cancel' | 'services' | 'seats') => {
    sessionStorage.setItem('currentBooking', JSON.stringify(booking));
    const routes: Record<string, string> = {
      change: '/booking/manage/change',
      cancel: '/booking/manage/cancel',
      services: '/booking/manage/services',
      seats: '/booking/manage/seats',
    };
    navigate(routes[action]);
  };

  return (
    <AppLayout title="Manage Booking" backTo="/wizard?mode=servicing">
      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Search Form */}
        {!booking && (
          <SearchForm
            pnr={pnr}
            setPnr={setPnr}
            isLoading={isLoading}
            error={error}
            onSearch={handleSearch}
          />
        )}

        {/* Booking Display */}
        {booking && parsedBooking && (
          <div className="space-y-6">
            {/* Top Bar: New Search + View Toggle */}
            <div className="flex items-center justify-between">
              <Button
                variant="outline"
                onClick={() => setBooking(null)}
                className="bg-white hover:bg-gray-50 border-gray-300 text-gray-700 shadow-sm"
              >
                <Search className="w-4 h-4 mr-2" />
                New Search
              </Button>

              <ViewModeToggle viewMode={viewMode} setViewMode={setViewMode} />
            </div>

            {/* Main Content based on View Mode */}
            {viewMode === 'simple' ? (
              <SimpleView
                booking={parsedBooking}
                onAction={handleAction}
                navigate={navigate}
              />
            ) : (
              <DeveloperView
                booking={parsedBooking}
                onAction={handleAction}
                navigate={navigate}
              />
            )}
          </div>
        )}

        {/* Fallback for parse failure */}
        {booking && !parsedBooking && (
          <div className="space-y-6">
            <Alert variant="warning">Unable to parse booking. Showing raw data.</Alert>
            <Button variant="outline" onClick={() => setBooking(null)}>
              <Search className="w-4 h-4 mr-2" /> New Search
            </Button>
            <Card className="p-6">
              <pre className="text-xs overflow-auto max-h-96 bg-gray-50 p-4 rounded-lg">
                {JSON.stringify(booking, null, 2)}
              </pre>
            </Card>
          </div>
        )}
      </div>
    </AppLayout>
  );
}

// ============================================================================
// SEARCH FORM
// ============================================================================

interface SearchFormProps {
  pnr: string;
  setPnr: (pnr: string) => void;
  isLoading: boolean;
  error: string | null;
  onSearch: () => void;
}

function SearchForm({ pnr, setPnr, isLoading, error, onSearch }: SearchFormProps) {
  return (
    <>
      <div className="bg-gradient-to-r from-orange-500 to-orange-600 rounded-2xl p-8 mb-8 text-white shadow-lg">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-3 bg-white/20 rounded-xl backdrop-blur-sm">
            <Search className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-4xl font-bold">Manage Booking</h1>
            <p className="text-orange-100 mt-1">Retrieve and manage your Jetstar booking</p>
          </div>
        </div>
      </div>

      <Card className="p-8 shadow-xl border-0 bg-white">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-orange-100 rounded-full mb-4">
              <Search className="w-8 h-8 text-orange-600" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900 mb-2">Find Your Booking</h2>
            <p className="text-slate-600">Enter your booking reference to view and manage your flight</p>
          </div>

          <div className="space-y-6">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Booking Reference (PNR) *
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={pnr}
                  onChange={(e) => setPnr(e.target.value.toUpperCase())}
                  placeholder="e.g., WKQGQC"
                  onKeyPress={(e) => e.key === 'Enter' && onSearch()}
                  className="w-full px-4 py-4 text-lg font-mono uppercase border-2 border-slate-200 rounded-xl focus:border-orange-500 focus:ring-4 focus:ring-orange-100 transition-all outline-none"
                  maxLength={6}
                />
                <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400">
                  <Plane className="w-5 h-5" />
                </div>
              </div>
              <p className="text-xs text-slate-500 mt-2">
                Your booking reference is a 6-character code (e.g., ABC123)
              </p>
            </div>

            <Button
              id="pnr-search-btn"
              variant="primary"
              onClick={onSearch}
              isLoading={isLoading}
              className="w-full py-4 text-lg font-semibold bg-orange-600 hover:bg-orange-700 shadow-lg hover:shadow-xl transition-all"
            >
              {isLoading ? (
                <><RefreshCw className="w-5 h-5 animate-spin mr-2" />Searching...</>
              ) : (
                <><Search className="w-5 h-5 mr-2" />Find Booking</>
              )}
            </Button>

            {error && (
              <Alert variant="error" className="mt-4 border-l-4 border-red-500">
                <div className="flex items-start gap-3">
                  <XCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold">Booking Not Found</p>
                    <p className="text-sm mt-1">{error}</p>
                  </div>
                </div>
              </Alert>
            )}
          </div>
        </div>
      </Card>
    </>
  );
}

// ============================================================================
// VIEW MODE TOGGLE
// ============================================================================

function ViewModeToggle({ viewMode, setViewMode }: { viewMode: ViewMode; setViewMode: (mode: ViewMode) => void }) {
  return (
    <div className="flex items-center gap-2 bg-white rounded-xl border border-gray-200 p-1 shadow-sm">
      <button
        onClick={() => setViewMode('simple')}
        className={cn(
          'flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-all',
          viewMode === 'simple'
            ? 'bg-orange-500 text-white shadow'
            : 'text-gray-600 hover:bg-gray-100'
        )}
      >
        <Eye className="w-4 h-4" />
        Simple View
      </button>
      <button
        onClick={() => setViewMode('developer')}
        className={cn(
          'flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-all',
          viewMode === 'developer'
            ? 'bg-slate-700 text-white shadow'
            : 'text-gray-600 hover:bg-gray-100'
        )}
      >
        <Code className="w-4 h-4" />
        Developer View
      </button>
    </div>
  );
}

// ============================================================================
// SIMPLE VIEW - User Friendly
// ============================================================================

interface ViewProps {
  booking: ParsedBooking;
  onAction: (action: 'change' | 'cancel' | 'services' | 'seats') => void;
  navigate: (path: string) => void;
}

function SimpleView({ booking, onAction, navigate }: ViewProps) {
  return (
    <div className="space-y-6">
      {/* Status Banner */}
      <BookingStatusBanner booking={booking} />

      {/* Flight Timeline with Services per Segment */}
      <FlightTimeline journeys={booking.journeys} />

      {/* Passengers & Contact Details */}
      <PassengersCardSimple passengers={booking.passengers} contactInfo={booking.contactInfo} />

      {/* Payment Summary */}
      <PaymentCard booking={booking} />

      {/* Quick Actions */}
      <QuickActionsCard booking={booking} onAction={onAction} navigate={navigate} />
    </div>
  );
}

// ============================================================================
// DEVELOPER VIEW - API Team Friendly
// ============================================================================

function DeveloperView({ booking, onAction, navigate }: ViewProps) {
  return (
    <div className="space-y-6">
      {/* Order Header with IDs */}
      <OrderHeaderCard booking={booking} />

      {/* Warnings */}
      {booking.warnings && booking.warnings.length > 0 && (
        <WarningsCard warnings={booking.warnings} />
      )}

      {/* Flight Timeline with IDs and Services per Segment */}
      <FlightTimelineDev journeys={booking.journeys} services={booking.services} passengers={booking.passengers} />

      {/* Passengers with IDs - Compact Section */}
      <PassengersCardDev passengers={booking.passengers} />

      {/* Payment Details with IDs */}
      <PaymentCardDev payments={booking.payments} totalPrice={booking.totalPrice} />

      {/* Quick Actions */}
      <QuickActionsCard booking={booking} onAction={onAction} navigate={navigate} />

      {/* Raw Data */}
      <RawDataCard rawData={booking.rawData} />
    </div>
  );
}

// ============================================================================
// BOOKING STATUS BANNER
// ============================================================================

function BookingStatusBanner({ booking }: { booking: ParsedBooking }) {
  const getStatusConfig = () => {
    if (booking.paymentStatus === 'SUCCESSFUL') {
      return {
        bg: 'from-emerald-500 to-emerald-600',
        icon: CheckCircle,
        headline: 'Booking Confirmed',
        subheadline: 'Your payment has been processed successfully.',
      };
    }
    if (booking.paymentStatus === 'PENDING' || booking.status === 'OPENED') {
      return {
        bg: 'from-amber-500 to-orange-500',
        icon: Timer,
        headline: 'Payment Required',
        subheadline: 'Complete payment to secure your booking.',
      };
    }
    if (booking.paymentStatus === 'FAILED' || booking.status === 'CANCELLED') {
      return {
        bg: 'from-red-500 to-red-600',
        icon: XCircle,
        headline: 'Booking Issue',
        subheadline: 'There is a problem with your booking.',
      };
    }
    return {
      bg: 'from-blue-500 to-blue-600',
      icon: Info,
      headline: 'Booking Details',
      subheadline: 'View your complete itinerary.',
    };
  };

  const config = getStatusConfig();
  const Icon = config.icon;

  return (
    <div className={cn('rounded-2xl overflow-hidden shadow-xl bg-gradient-to-r', config.bg)}>
      <div className="px-6 py-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          {/* Left: PNR and Status */}
          <div>
            <p className="text-white/70 text-sm mb-1">Booking Reference</p>
            <p className="text-5xl font-bold text-white font-mono tracking-widest">{booking.pnr}</p>
            <div className="flex items-center gap-3 mt-3">
              <Icon className="w-6 h-6 text-white" />
              <div>
                <p className="text-xl font-bold text-white">{config.headline}</p>
                <p className="text-white/80 text-sm">{config.subheadline}</p>
              </div>
            </div>
          </div>

          {/* Right: Amount and Status Pills */}
          <div className="text-right">
            <p className="text-white/70 text-sm">Total Paid</p>
            <p className="text-4xl font-bold text-white">
              {formatCurrency(
                booking.payments.reduce((sum, p) => p.status === 'SUCCESSFUL' ? sum + p.amount.value : sum, 0) || booking.totalPrice.value,
                booking.totalPrice.currency
              )}
            </p>
            <div className="flex flex-wrap justify-end gap-2 mt-3">
              <StatusPill label="Payment" value={booking.paymentStatus} />
              <StatusPill label="Order" value={booking.status} />
            </div>
          </div>
        </div>
      </div>

      {/* Warnings */}
      {booking.warnings && booking.warnings.length > 0 && (
        <div className="px-6 py-3 bg-white/10 border-t border-white/20">
          {booking.warnings.map((w, idx) => (
            <div key={idx} className="flex items-center gap-2 text-white">
              <AlertTriangle className="w-4 h-4" />
              <span className="text-sm">{w.message}</span>
              {w.code && <span className="text-xs opacity-70">({w.code})</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatusPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white/20 backdrop-blur-sm rounded-full px-3 py-1">
      <span className="text-white/70 text-xs">{label}:</span>
      <span className="text-white font-semibold text-xs ml-1">{value}</span>
    </div>
  );
}

// ============================================================================
// FLIGHT TIMELINE (Simple) - Compact journeys display
// ============================================================================

function FlightTimeline({ journeys }: { journeys: JourneyInfo[] }) {
  return (
    <div className="space-y-2">
      {journeys.map((journey) => (
        <JourneyCard key={journey.journeyId} journey={journey} />
      ))}
    </div>
  );
}

// Clean journey card with visual hierarchy
function JourneyCard({ journey }: { journey: JourneyInfo }) {
  const isOutbound = journey.direction === 'outbound';
  const isInbound = journey.direction === 'inbound';
  const hasPassiveSegment = journey.segments.some(s => s.isPassive);

  return (
    <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
      {/* Header */}
      <div className={cn(
        'px-6 py-4 flex items-center justify-between',
        isOutbound ? 'bg-gradient-to-r from-orange-500 to-orange-400' :
        isInbound ? 'bg-gradient-to-r from-blue-600 to-blue-500' :
        'bg-gradient-to-r from-emerald-600 to-emerald-500'
      )}>
        <div className="flex items-center gap-4 text-white">
          <div className="bg-white/20 p-2.5 rounded-xl">
            <Plane className={cn('w-5 h-5', isInbound && 'rotate-180')} />
          </div>
          <div>
            <div className="text-white/80 text-sm font-medium">{journey.directionLabel}</div>
            <div className="text-2xl font-bold">{journey.origin} → {journey.destination}</div>
          </div>
          {hasPassiveSegment && (
            <span className="bg-amber-400 text-amber-900 px-3 py-1 rounded-full text-xs font-bold">
              PASSIVE
            </span>
          )}
        </div>
        <div className="text-white text-right">
          <div className="text-white/80 text-sm">{formatDateFull(journey.segments[0]?.departureTime)}</div>
          <div className="text-xl font-bold">{formatDuration(journey.duration)}</div>
        </div>
      </div>

      {/* Segments */}
      <div className="p-5 space-y-4">
        {journey.segments.map((seg, idx) => (
          <div key={seg.segmentId}>
            {/* Segment */}
            <div className={cn(
              "flex items-center justify-between p-4 rounded-xl",
              seg.isPassive ? "bg-amber-50 border-2 border-amber-300" : "bg-gray-50"
            )}>
              {/* Left: Flight number */}
              <div className="flex items-center gap-3">
                <div className={cn(
                  "px-3 py-2 rounded-lg font-mono text-sm font-bold",
                  seg.isPassive ? "bg-amber-300 text-amber-900" : "bg-blue-600 text-white"
                )}>
                  {seg.carrierCode} {seg.flightNumber}
                </div>
                {seg.isPassive && (
                  <span className="text-amber-700 text-xs font-bold bg-amber-200 px-2 py-1 rounded">PASSIVE</span>
                )}
              </div>

              {/* Center: Times */}
              <div className="flex items-center gap-8">
                <div className="text-center">
                  <div className="text-3xl font-bold text-gray-900">{formatTime(seg.departureTime)}</div>
                  <div className="text-sm text-gray-500 font-medium">{seg.origin}</div>
                </div>

                <div className="flex flex-col items-center gap-1">
                  <div className="text-xs text-gray-400">{formatDuration(seg.duration)}</div>
                  <div className="flex items-center">
                    <div className="w-16 h-0.5 bg-gray-300"></div>
                    <Plane className="w-4 h-4 text-gray-400 mx-2" />
                    <div className="w-16 h-0.5 bg-gray-300"></div>
                  </div>
                  <div className="text-xs text-gray-400">Direct</div>
                </div>

                <div className="text-center">
                  <div className="text-3xl font-bold text-gray-900">{formatTime(seg.arrivalTime)}</div>
                  <div className="text-sm text-gray-500 font-medium">{seg.destination}</div>
                </div>
              </div>

              {/* Right: Cabin */}
              <div className="text-right min-w-[80px]">
                {seg.cabinClass ? (
                  <span className="bg-emerald-100 text-emerald-700 px-3 py-1.5 rounded-lg text-sm font-medium">
                    {seg.cabinClass}
                  </span>
                ) : seg.rbd ? (
                  <span className="text-gray-500 text-sm bg-gray-100 px-3 py-1.5 rounded-lg">RBD: {seg.rbd}</span>
                ) : null}
              </div>
            </div>

            {/* Layover */}
            {idx < journey.segments.length - 1 && (
              <div className="flex justify-center py-3">
                <div className="inline-flex items-center gap-2 bg-orange-100 text-orange-700 px-4 py-2 rounded-full text-sm font-medium">
                  <Clock className="w-4 h-4" />
                  {calculateLayover(seg.arrivalTime, journey.segments[idx + 1].departureTime)} layover in {seg.destination}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// Calculate layover duration between two times
function calculateLayover(arrivalTime: string, departureTime: string): string {
  try {
    const arrival = new Date(arrivalTime);
    const departure = new Date(departureTime);
    const diffMs = departure.getTime() - arrival.getTime();
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    if (hours > 0 && mins > 0) return `${hours}h ${mins}m`;
    if (hours > 0) return `${hours}h`;
    return `${mins}m`;
  } catch {
    return '--';
  }
}

function LayoverIndicator({ arrivalTime, departureTime, city }: { arrivalTime: string; departureTime: string; city: string }) {
  const layover = calculateLayover(arrivalTime, departureTime);
  return (
    <div className="flex justify-center py-3 bg-amber-50 border-y border-amber-200">
      <div className="flex items-center gap-2">
        <Clock className="w-4 h-4 text-amber-600" />
        <span className="text-sm text-amber-800 font-medium">{layover} layover in {city}</span>
      </div>
    </div>
  );
}

// ============================================================================
// PASSENGERS & CONTACT DETAILS - Full passenger information
// ============================================================================

function PassengersCardSimple({ passengers, contactInfo }: { passengers: PassengerInfo[]; contactInfo?: ContactInfo }) {
  return (
    <div className="bg-white rounded-2xl shadow-lg overflow-hidden border border-gray-100">
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-700 to-slate-800 px-6 py-4 text-white">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-white/20 rounded-lg">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-lg">Passengers & Contact Details</h3>
            <p className="text-sm text-white/70">{passengers.length} traveler{passengers.length > 1 ? 's' : ''}</p>
          </div>
        </div>
      </div>

      {/* Passenger List with Full Details */}
      <div className="p-4 space-y-4">
        {passengers.map((pax, idx) => {
          const PtcIcon = pax.ptc === 'CHD' ? Baby : pax.ptc === 'INF' ? Baby : User;
          const ptcColors = {
            ADT: { bg: '#dbeafe', text: '#2563eb', label: 'Adult' },
            CHD: { bg: '#f3e8ff', text: '#9333ea', label: 'Child' },
            INF: { bg: '#fce7f3', text: '#db2777', label: 'Infant' },
          };
          const colors = ptcColors[pax.ptc as keyof typeof ptcColors] || ptcColors.ADT;

          return (
            <div key={pax.paxId} className="bg-gray-50 rounded-xl border border-gray-200 overflow-hidden">
              {/* Passenger Header */}
              <div className="p-4 flex items-start justify-between border-b border-gray-200">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl" style={{ backgroundColor: colors.bg }}>
                    <PtcIcon className="w-6 h-6" style={{ color: colors.text }} />
                  </div>
                  <div>
                    <p className="text-lg font-bold text-gray-900">{pax.name}</p>
                    <div className="flex items-center gap-2 text-sm text-gray-500">
                      <span className="font-medium" style={{ color: colors.text }}>{colors.label}</span>
                      {pax.birthdate && (
                        <>
                          <span>•</span>
                          <span>DOB: {formatDateFull(pax.birthdate)}</span>
                        </>
                      )}
                      {pax.gender && (
                        <>
                          <span>•</span>
                          <span>{pax.gender === 'M' ? 'Male' : 'Female'}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Badges */}
                <div className="flex items-center gap-2">
                  {pax.loyalty && (
                    <div className="bg-amber-100 text-amber-700 px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5">
                      <Star className="w-4 h-4" />
                      <span>{pax.loyalty.program} - {pax.loyalty.number}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Passenger Details Grid */}
              <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Travel Document */}
                {pax.document && (
                  <div className="bg-white rounded-lg border border-gray-200 p-3">
                    <p className="text-xs font-semibold text-gray-500 mb-2 flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5" /> Travel Document
                    </p>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <p className="text-xs text-gray-400">Type</p>
                        <p className="font-medium text-gray-700">
                          {pax.document.type === 'PT' ? 'Passport' : pax.document.type}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400">Number</p>
                        <p className="font-medium font-mono text-gray-700">{pax.document.number}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400">Country</p>
                        <p className="font-medium text-gray-700">{pax.document.country}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400">Expiry</p>
                        <p className="font-medium text-gray-700">{formatDateFull(pax.document.expiry)}</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Contact Info (from booking, shown for first passenger) */}
                {idx === 0 && (pax.email || pax.phone || contactInfo) && (
                  <div className="bg-white rounded-lg border border-gray-200 p-3">
                    <p className="text-xs font-semibold text-gray-500 mb-2 flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5" /> Contact Information
                    </p>
                    <div className="space-y-2 text-sm">
                      {(pax.email || contactInfo?.email) && (
                        <div className="flex items-center gap-2">
                          <span className="text-gray-400 text-xs w-12">Email:</span>
                          <span className="font-medium text-gray-700">{pax.email || contactInfo?.email}</span>
                        </div>
                      )}
                      {(pax.phone || contactInfo?.phone) && (
                        <div className="flex items-center gap-2">
                          <span className="text-gray-400 text-xs w-12">Phone:</span>
                          <span className="font-medium text-gray-700">{pax.phone || contactInfo?.phone}</span>
                        </div>
                      )}
                      {contactInfo?.city && (
                        <div className="flex items-center gap-2">
                          <span className="text-gray-400 text-xs w-12">City:</span>
                          <span className="font-medium text-gray-700">{contactInfo.city}, {contactInfo.country}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Loyalty Program */}
                {pax.loyalty && (
                  <div className="bg-amber-50 rounded-lg border border-amber-200 p-3">
                    <p className="text-xs font-semibold text-amber-700 mb-2 flex items-center gap-1.5">
                      <Award className="w-3.5 h-3.5" /> Frequent Flyer
                    </p>
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-amber-100 rounded-lg">
                        <Star className="w-5 h-5 text-amber-600" />
                      </div>
                      <div>
                        <p className="font-bold text-gray-900">{pax.loyalty.program} Frequent Flyer</p>
                        <p className="text-sm text-gray-600 font-mono">{pax.loyalty.number}</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================================
// PAYMENT CARD (Simple)
// ============================================================================

function PaymentCard({ booking }: { booking: ParsedBooking }) {
  const totalPaid = booking.payments
    .filter(p => p.status === 'SUCCESSFUL')
    .reduce((sum, p) => sum + p.amount.value, 0);
  const isPaid = booking.paymentStatus === 'SUCCESSFUL';

  return (
    <div className="bg-white rounded-2xl shadow-lg overflow-hidden border border-gray-100">
      {/* Header */}
      <div className={cn(
        'px-6 py-5',
        isPaid ? 'bg-gradient-to-r from-emerald-500 to-emerald-600' : 'bg-gradient-to-r from-amber-400 to-orange-500'
      )}>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-white/20 rounded-xl">
              <CreditCard className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-white">
                {isPaid ? 'Payment Successful' : 'Payment Required'}
              </h3>
              <p className="text-white/80 text-sm">
                {isPaid ? 'Your payment has been confirmed' : 'Complete payment to secure booking'}
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-white/80 text-sm">Total Paid</p>
            <p className="text-3xl font-bold text-white">
              {formatCurrency(totalPaid || booking.totalPrice.value, booking.totalPrice.currency)}
            </p>
          </div>
        </div>
      </div>

      {/* Payment Details */}
      <div className="p-6">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
          <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
            <p className="text-xs text-gray-500">Booking Total</p>
            <p className="text-xl font-bold text-gray-900">{formatCurrency(booking.totalPrice.value, booking.totalPrice.currency)}</p>
          </div>
          <div className={cn(
            'rounded-xl p-4 border',
            isPaid ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'
          )}>
            <p className="text-xs text-gray-500">Total Paid</p>
            <p className={cn('text-xl font-bold', isPaid ? 'text-emerald-700' : 'text-amber-700')}>
              {formatCurrency(totalPaid, booking.totalPrice.currency)}
            </p>
          </div>
          {!isPaid && (
            <div className="bg-red-50 rounded-xl p-4 border border-red-200">
              <p className="text-xs text-gray-500">Amount Due</p>
              <p className="text-xl font-bold text-red-700">
                {formatCurrency(booking.totalPrice.value - totalPaid, booking.totalPrice.currency)}
              </p>
            </div>
          )}
        </div>

        {/* Payment Transactions */}
        {booking.payments.length > 0 && (
          <div className="border-t border-gray-200 pt-4">
            <h4 className="text-sm font-semibold text-gray-600 mb-3">Payment Details</h4>
            <div className="space-y-2">
              {booking.payments.map((payment, idx) => (
                <div key={idx} className={cn(
                  'flex items-center justify-between p-3 rounded-lg border',
                  payment.status === 'SUCCESSFUL' ? 'bg-emerald-50 border-emerald-200' : 'bg-gray-50 border-gray-200'
                )}>
                  <div className="flex items-center gap-3">
                    {payment.method.type === 'CC' ? <CreditCard className="w-5 h-5 text-gray-500" /> :
                     payment.method.type === 'AGT' ? <Building2 className="w-5 h-5 text-gray-500" /> :
                     <Wallet className="w-5 h-5 text-gray-500" />}
                    <div>
                      <p className="font-medium text-gray-900">
                        {payment.method.type === 'CC' ? (payment.method.cardBrand || 'Card') :
                         payment.method.type === 'AGT' ? 'Agency Payment' : 'Cash'}
                        {payment.method.maskedNumber && ` •••• ${payment.method.maskedNumber.slice(-4)}`}
                      </p>
                      <p className="text-xs text-gray-500">ID: {payment.paymentId}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={cn(
                      'font-bold',
                      payment.status === 'SUCCESSFUL' ? 'text-emerald-700' : 'text-gray-700'
                    )}>
                      {formatCurrency(payment.amount.value, payment.amount.currency)}
                    </p>
                    <span className={cn(
                      'text-xs px-1.5 py-0.5 rounded',
                      payment.status === 'SUCCESSFUL' ? 'bg-emerald-200 text-emerald-800' : 'bg-gray-200 text-gray-700'
                    )}>
                      {payment.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// QUICK ACTIONS CARD
// ============================================================================

function QuickActionsCard({ booking, onAction, navigate }: ViewProps) {
  const isPending = booking.paymentStatus === 'PENDING' || booking.status === 'OPENED';

  return (
    <div className="bg-white rounded-2xl shadow-lg p-6 border border-gray-100">
      <h3 className="text-lg font-bold text-gray-900 mb-6">Manage Your Booking</h3>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {isPending && (
          <ActionButton
            onClick={() => {
              const params = new URLSearchParams({
                pnr: booking.pnr,
                orderId: booking.pnr,
                amount: String(booking.totalPrice.value),
                currency: booking.totalPrice.currency,
              });
              navigate(`/service-payment?${params.toString()}`);
            }}
            icon={CreditCard}
            title="Complete Payment"
            description="Pay now"
            variant="primary"
          />
        )}
        {!isPending && (
          <ActionButton
            onClick={() => {
              const params = new URLSearchParams({
                pnr: booking.pnr,
                orderId: booking.pnr,
                amount: '0',
                currency: booking.totalPrice.currency,
                mode: 'add',
              });
              navigate(`/service-payment?${params.toString()}`);
            }}
            icon={CreditCard}
            title="Add Payment"
            description="Extra payment"
            variant="default"
          />
        )}
        <ActionButton onClick={() => onAction('change')} icon={RefreshCw} title="Change Flight" description="Modify date/time" variant="default" />
        <ActionButton onClick={() => onAction('services')} icon={Luggage} title="Add Services" description="Baggage, meals" variant="default" />
        <ActionButton onClick={() => onAction('seats')} icon={Armchair} title="Select Seats" description="Choose seats" variant="default" />
        <ActionButton onClick={() => onAction('cancel')} icon={XCircle} title="Cancel Booking" description="Request cancel" variant="danger" />
      </div>
    </div>
  );
}

function ActionButton({ onClick, icon: Icon, title, description, variant }: {
  onClick: () => void;
  icon: React.ElementType;
  title: string;
  description: string;
  variant: 'default' | 'danger' | 'primary';
}) {
  const styles = {
    primary: 'border-orange-500 bg-orange-50 hover:bg-orange-100 text-orange-600',
    danger: 'border-gray-200 hover:border-red-500 hover:bg-red-50 text-red-500',
    default: 'border-gray-200 hover:border-orange-500 hover:bg-orange-50 text-orange-600',
  };

  return (
    <button
      onClick={onClick}
      className={cn('p-5 rounded-xl border-2 transition-all text-center group', styles[variant])}
    >
      <Icon className="w-8 h-8 mx-auto mb-2 group-hover:scale-110 transition-transform" />
      <p className="font-semibold text-gray-900">{title}</p>
      <p className="text-xs text-gray-500 mt-1">{description}</p>
    </button>
  );
}

// ============================================================================
// DEVELOPER VIEW COMPONENTS
// ============================================================================

function OrderHeaderCard({ booking }: { booking: ParsedBooking }) {
  return (
    <div className="bg-gradient-to-r from-slate-800 to-slate-900 rounded-2xl overflow-hidden shadow-xl">
      <div className="px-6 py-5">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-orange-500 rounded-xl shadow-lg">
              <Database className="w-7 h-7 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-3xl font-bold text-white font-mono tracking-wider">{booking.pnr}</h2>
                <span className={cn(
                  'px-2 py-1 rounded text-xs font-bold',
                  booking.status === 'OPENED' ? 'bg-amber-400 text-amber-900' :
                  booking.status === 'CANCELLED' ? 'bg-red-400 text-red-900' :
                  'bg-emerald-400 text-emerald-900'
                )}>{booking.status}</span>
              </div>
              <p className="text-slate-400 text-sm mt-1">
                Owner: <span className="text-white font-semibold">{booking.ownerCode}</span>
                {booking.creationDate && <> • Created: {formatDateTime(booking.creationDate)}</>}
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-slate-400 text-sm">Order Total</p>
            <p className="text-3xl font-bold text-emerald-400">{formatCurrency(booking.totalPrice.value, booking.totalPrice.currency)}</p>
          </div>
        </div>
      </div>
      <div className="bg-slate-700/50 px-6 py-3 border-t border-slate-700 flex flex-wrap gap-4 text-xs">
        <CopyableBadge label="OrderID" value={booking.pnr} />
        <CopyableBadge label="OwnerCode" value={booking.ownerCode} />
        <CopyableBadge label="StatusCode" value={booking.status} />
        <CopyableBadge label="PaymentStatus" value={booking.paymentStatus} />
        {booking.correlationId && <CopyableBadge label="CorrelationID" value={booking.correlationId} />}
      </div>
    </div>
  );
}

function WarningsCard({ warnings }: { warnings: { code?: string; message: string }[] }) {
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
      <h4 className="font-bold text-amber-800 flex items-center gap-2 mb-2">
        <AlertTriangle className="w-5 h-5" /> API Warnings
      </h4>
      <div className="space-y-2">
        {warnings.map((w, idx) => (
          <div key={idx} className="flex items-start gap-2 text-sm">
            <span className="text-amber-600">•</span>
            <span className="text-amber-900">{w.message}</span>
            {w.code && <span className="text-amber-600 font-mono text-xs">({w.code})</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

function FlightTimelineDev({ journeys, services, passengers }: { journeys: JourneyInfo[]; services: ServiceInfo[]; passengers: PassengerInfo[] }) {
  return (
    <div className="bg-white rounded-2xl shadow-lg overflow-hidden border border-gray-100">
      <div className="bg-blue-600 px-6 py-4 text-white">
        <div className="flex items-center gap-3">
          <Plane className="w-5 h-5" />
          <h3 className="font-bold">Journeys & Segments (PaxJourney / PaxSegment / OrderItems)</h3>
        </div>
      </div>
      <div className="p-6 space-y-6">
        {journeys.map((journey, idx) => (
          <div key={journey.journeyId} className="space-y-3">
            {/* Journey Header */}
            <div className="flex items-center gap-3 flex-wrap">
              <span className={cn(
                'px-2 py-1 rounded text-xs font-bold',
                journey.direction === 'outbound' ? 'bg-orange-100 text-orange-700' :
                journey.direction === 'inbound' ? 'bg-blue-100 text-blue-700' :
                'bg-emerald-100 text-emerald-700'
              )}>
                {journey.directionLabel}
              </span>
              <span className="font-bold">{journey.origin} → {journey.destination}</span>
              <span className="text-sm text-gray-500">{formatDuration(journey.duration)}</span>
              <CopyableBadge label="PaxJourneyID" value={journey.journeyId} small />
            </div>

            {/* Segments with Services */}
            <div className="space-y-3 ml-4 border-l-2 border-blue-200 pl-4">
              {journey.segments.map(seg => {
                // Get services for this segment
                const segmentServices = services.filter(svc =>
                  svc.segmentIds.includes(seg.segmentId) ||
                  svc.segmentIds.includes(seg.marketingSegmentId || '')
                );

                return (
                  <div key={seg.segmentId} className={cn(
                    "rounded-lg border overflow-hidden",
                    seg.isPassive
                      ? "bg-amber-50 border-amber-300"
                      : "bg-gray-50 border-gray-200"
                  )}>
                    {/* Passive Segment Banner */}
                    {seg.isPassive && (
                      <div className="bg-amber-200 px-3 py-1.5 flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-amber-700" />
                        <span className="text-xs font-bold text-amber-800">PASSIVE SEGMENT</span>
                        <span className="text-xs text-amber-700">- Interline/External carrier, not ticketed by JQ</span>
                      </div>
                    )}
                    {/* Segment Header */}
                    <div className="p-3">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-3">
                          <span className={cn(
                            "px-2 py-1 rounded font-mono font-bold text-sm",
                            seg.isPassive
                              ? "bg-amber-200 text-amber-800"
                              : "bg-orange-100 text-orange-700"
                          )}>
                            {seg.carrierCode} {seg.flightNumber}
                          </span>
                          <span className="font-semibold">{seg.origin} → {seg.destination}</span>
                          <span className="text-sm text-gray-600">
                            {formatTime(seg.departureTime)} - {formatTime(seg.arrivalTime)}
                          </span>
                          <span className="text-sm text-gray-500">{formatDateShort(seg.departureTime)}</span>
                        </div>
                        <span className={cn(
                          'px-2 py-0.5 rounded text-xs font-semibold',
                          seg.isPassive
                            ? 'bg-amber-200 text-amber-800'
                            : seg.status === 'CONFIRMED' || seg.status === 'READY TO PROCEED'
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-gray-100 text-gray-700'
                        )}>{seg.isPassive ? 'PASSIVE' : (seg.status || 'CONFIRMED')}</span>
                      </div>

                      {/* Segment IDs */}
                      <div className="mt-2 flex flex-wrap gap-2">
                        <CopyableBadge label="PaxSegmentID" value={seg.segmentId} small />
                        {seg.marketingSegmentId && <CopyableBadge label="MktSegmentID" value={seg.marketingSegmentId} small />}
                        {seg.cabinClass && <CopyableBadge label="Cabin" value={`${seg.cabinClass} (${seg.cabinCode})`} small />}
                        {seg.rbd && <CopyableBadge label="RBD" value={seg.rbd} small />}
                        {seg.isPassive && <CopyableBadge label="SegmentType" value="PASSIVE (2)" small />}
                        {seg.duration && <CopyableBadge label="Duration" value={seg.duration} small />}
                        {seg.aircraft && <CopyableBadge label="Aircraft" value={seg.aircraft} small />}
                      </div>
                    </div>

                    {/* Services for this segment */}
                    {segmentServices.length > 0 && (
                      <div className="border-t border-gray-200 bg-purple-50/50 p-3">
                        <p className="text-xs font-semibold text-purple-700 mb-2 flex items-center gap-1">
                          <Package className="w-3 h-3" /> OrderItems for this segment
                        </p>
                        <div className="space-y-2">
                          {segmentServices.map((svc, idx) => {
                            const paxNames = svc.paxIds.map(id => {
                              const pax = passengers.find(p => p.paxId === id);
                              return pax?.name || id;
                            });

                            return (
                              <div key={idx} className="bg-white rounded-lg p-2 border border-purple-200">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    {svc.type === 'FLIGHT' && <Plane className="w-4 h-4 text-blue-500" />}
                                    {svc.type === 'BAGGAGE' && <Luggage className="w-4 h-4 text-blue-500" />}
                                    {svc.type === 'SEAT' && <Armchair className="w-4 h-4 text-purple-500" />}
                                    {svc.type === 'MEAL' && <Utensils className="w-4 h-4 text-green-500" />}
                                    {svc.type === 'BUNDLE' && <Package className="w-4 h-4 text-orange-500" />}
                                    {!['FLIGHT', 'BAGGAGE', 'SEAT', 'MEAL', 'BUNDLE'].includes(svc.type) && <Tag className="w-4 h-4 text-gray-500" />}
                                    <span className="font-medium text-sm">{svc.name}</span>
                                    <span className={cn(
                                      'px-1.5 py-0.5 rounded text-[10px] font-semibold',
                                      svc.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-700'
                                    )}>{svc.status}</span>
                                  </div>
                                  <span className="font-bold text-sm">{formatCurrency(svc.price.value, svc.price.currency)}</span>
                                </div>
                                <div className="mt-1.5 flex flex-wrap gap-1.5">
                                  <CopyableBadge label="OrderItemID" value={svc.orderItemId} small />
                                  {svc.code && <CopyableBadge label="ServiceCode" value={svc.code} small />}
                                  <CopyableBadge label="Type" value={svc.type} small />
                                  {svc.paxIds.map((id, i) => (
                                    <CopyableBadge key={i} label={`PaxRefID`} value={id} small />
                                  ))}
                                </div>
                                {paxNames.length > 0 && (
                                  <p className="text-[10px] text-gray-500 mt-1">Passengers: {paxNames.join(', ')}</p>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PassengersCardDev({ passengers }: { passengers: PassengerInfo[] }) {
  return (
    <div className="bg-white rounded-2xl shadow-lg overflow-hidden border border-gray-100">
      <div className="bg-slate-700 px-6 py-4 text-white">
        <div className="flex items-center gap-3">
          <Users className="w-5 h-5" />
          <h3 className="font-bold">Passengers (PaxList)</h3>
        </div>
      </div>
      <div className="p-6 space-y-4">
        {passengers.map(pax => (
          <div key={pax.paxId} className="bg-gray-50 rounded-xl p-4 border border-gray-200">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-bold text-lg text-gray-900">{pax.name}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded text-xs font-semibold">{pax.ptc}</span>
                  {pax.birthdate && <span className="text-xs text-gray-500">DOB: {pax.birthdate}</span>}
                  {pax.gender && <span className="text-xs text-gray-500">{pax.gender === 'M' ? 'Male' : 'Female'}</span>}
                </div>
              </div>
              <CopyableBadge label="PaxID" value={pax.paxId} />
            </div>

            {/* Document */}
            {pax.document && (
              <div className="mt-3 pt-3 border-t border-gray-200">
                <p className="text-xs font-semibold text-gray-500 mb-2 flex items-center gap-1">
                  <FileText className="w-3 h-3" /> IdentityDoc
                </p>
                <div className="flex flex-wrap gap-2">
                  <CopyableBadge label="DocType" value={pax.document.type} small />
                  <CopyableBadge label="DocID" value={pax.document.number} small />
                  <CopyableBadge label="IssuingCountry" value={pax.document.country} small />
                  <CopyableBadge label="ExpiryDate" value={pax.document.expiry} small />
                </div>
              </div>
            )}

            {/* Loyalty */}
            {pax.loyalty && (
              <div className="mt-3 pt-3 border-t border-gray-200">
                <p className="text-xs font-semibold text-gray-500 mb-2 flex items-center gap-1">
                  <Award className="w-3 h-3" /> LoyaltyProgramAccount
                </p>
                <div className="flex flex-wrap gap-2">
                  <CopyableBadge label="AirlineDesigCode" value={pax.loyalty.program} small />
                  <CopyableBadge label="AccountNumber" value={pax.loyalty.number} small />
                </div>
              </div>
            )}

            {/* Contact */}
            {(pax.email || pax.phone) && (
              <div className="mt-3 pt-3 border-t border-gray-200">
                <p className="text-xs font-semibold text-gray-500 mb-2">ContactInfo</p>
                <div className="flex flex-wrap gap-2">
                  {pax.email && <CopyableBadge label="Email" value={pax.email} small />}
                  {pax.phone && <CopyableBadge label="Phone" value={pax.phone} small />}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function PaymentCardDev({ payments, totalPrice }: { payments: PaymentInfo[]; totalPrice: { value: number; currency: string } }) {
  return (
    <div className="bg-white rounded-2xl shadow-lg overflow-hidden border border-gray-100">
      <div className="bg-emerald-600 px-6 py-4 text-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CreditCard className="w-5 h-5" />
            <h3 className="font-bold">PaymentProcessingSummary ({payments.length})</h3>
          </div>
          <p className="text-xl font-bold">{formatCurrency(totalPrice.value, totalPrice.currency)}</p>
        </div>
      </div>
      <div className="p-6 space-y-3">
        {payments.map((payment, idx) => (
          <div key={idx} className={cn(
            'rounded-xl p-4 border',
            payment.status === 'SUCCESSFUL' ? 'bg-emerald-50 border-emerald-200' : 'bg-gray-50 border-gray-200'
          )}>
            <div className="flex items-start justify-between">
              <div>
                <p className="font-bold text-gray-900">
                  {payment.method.type === 'CC' ? 'Credit Card' :
                   payment.method.type === 'AGT' ? 'Agency' : payment.method.type}
                </p>
                <div className="flex flex-wrap gap-2 mt-2">
                  <CopyableBadge label="PaymentID" value={payment.paymentId} />
                  <CopyableBadge label="PaymentStatusCode" value={payment.status} />
                  <CopyableBadge label="PaymentTypeCode" value={payment.method.type} />
                  {payment.method.cardBrand && <CopyableBadge label="CardBrandCode" value={payment.method.cardBrand} />}
                </div>
              </div>
              <p className="text-2xl font-bold text-emerald-700">
                {formatCurrency(payment.amount.value, payment.amount.currency)}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function RawDataCard({ rawData }: { rawData: any }) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="bg-white rounded-2xl shadow-lg overflow-hidden border border-gray-100">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-6 py-4 bg-gray-700 text-white hover:bg-gray-600 transition-colors"
      >
        <div className="flex items-center gap-3">
          <FileText className="w-5 h-5" />
          <span className="font-bold">Raw JSON Response</span>
        </div>
        {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
      </button>
      {isExpanded && (
        <div className="p-4">
          <pre className="text-xs bg-gray-900 text-green-400 p-4 rounded-lg overflow-auto max-h-96 font-mono">
            {JSON.stringify(rawData, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// SHARED COMPONENTS
// ============================================================================

function CopyableBadge({ label, value, small = false }: { label: string; value: string; small?: boolean }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <button
      onClick={handleCopy}
      className={cn(
        'inline-flex items-center gap-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded font-mono transition-colors',
        small ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-1 text-xs'
      )}
      title={`Click to copy: ${value}`}
    >
      <span className="opacity-60">{label}:</span>
      <span className="font-semibold">{value || 'N/A'}</span>
      {copied ? <Check className="w-3 h-3 text-green-600" /> : <Copy className="w-3 h-3 opacity-40" />}
    </button>
  );
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function parseBookingData(raw: any): ParsedBooking {
  const rawKeys = Object.keys(raw || {});
  console.log('[parseBookingData] Raw input keys:', rawKeys);
  console.log('[parseBookingData] Raw input sample:', JSON.stringify(raw).slice(0, 500));

  // Check various possible structures
  // 1. Backend parser: { order: {...}, warnings: [...] }
  // 2. Direct XML: { Response: { Order: {...} } }
  // 3. Direct Order: { OrderID, TotalPrice, ... }
  const orderObj = raw?.order;
  const responseOrder = raw?.Response?.Order;
  const directOrder = raw?.OrderID ? raw : null;

  const hasBackendFormat = orderObj && typeof orderObj === 'object';
  const hasResponseFormat = responseOrder && typeof responseOrder === 'object';
  const hasDirectFormat = directOrder && typeof directOrder === 'object';

  console.log('[parseBookingData] hasBackendFormat:', hasBackendFormat, 'hasResponseFormat:', hasResponseFormat, 'hasDirectFormat:', hasDirectFormat);

  // Extract DataLists from multiple possible paths
  const dataLists = orderObj?.DataLists ||
                    raw?.DataLists ||
                    raw?.Response?.DataLists ||
                    raw?.IATA_OrderViewRS?.Response?.DataLists || {};

  console.log('[parseBookingData] DataLists keys:', Object.keys(dataLists || {}));

  // Build unified order object from backend format OR XML paths
  let pnr: string;
  let ownerCode: string;
  let status: string;
  let creationDate: string | undefined;
  let totalPriceValue: number;
  let totalPriceCurrency: string;
  let payments: any[];
  let orderItems: any[];

  if (hasBackendFormat) {
    // Backend parsed format (camelCase properties)
    console.log('[parseBookingData] Using backend format');
    console.log('[parseBookingData] orderObj keys:', Object.keys(orderObj));
    console.log('[parseBookingData] orderObj.orderId:', orderObj.orderId);
    console.log('[parseBookingData] orderObj.totalPrice:', orderObj.totalPrice);
    console.log('[parseBookingData] orderObj.payments:', orderObj.payments);

    pnr = orderObj.orderId || '';
    ownerCode = orderObj.ownerCode || 'JQ';
    status = orderObj.status || 'UNKNOWN';
    creationDate = orderObj.creationDateTime;
    totalPriceValue = orderObj.totalPrice?.value || 0;
    totalPriceCurrency = orderObj.totalPrice?.currency || 'AUD';
    payments = orderObj.payments || [];
    orderItems = orderObj.orderItems || [];
  } else {
    // Fallback: Raw XML-to-JSON format or direct properties
    console.log('[parseBookingData] Using XML fallback format');

    // Try multiple paths for Order
    const xmlOrder = raw?.Response?.Order || raw?.Order || raw?.order ||
                     raw?.IATA_OrderViewRS?.Response?.Order || {};

    // PaymentFunctions might be at various levels
    const paymentFunctions = raw?.Response?.PaymentFunctions || raw?.PaymentFunctions ||
                             raw?.IATA_OrderViewRS?.PaymentFunctions || {};

    console.log('[parseBookingData] xmlOrder keys:', Object.keys(xmlOrder || {}));
    console.log('[parseBookingData] paymentFunctions keys:', Object.keys(paymentFunctions || {}));

    // Check if Order properties are directly on raw (flat structure)
    const orderSource = Object.keys(xmlOrder).length > 0 ? xmlOrder : raw;
    console.log('[parseBookingData] Using orderSource with keys:', Object.keys(orderSource || {}).slice(0, 10));

    pnr = orderSource?.OrderID || orderSource?.orderId || xmlOrder?.OrderID || '';
    ownerCode = orderSource?.OwnerCode || orderSource?.ownerCode || 'JQ';
    status = orderSource?.StatusCode || orderSource?.status || 'UNKNOWN';
    creationDate = orderSource?.CreationDateTime;

    // Try multiple paths for total price
    const totalPrice = orderSource?.TotalPrice?.TotalAmount ||
                       orderSource?.TotalPrice ||
                       orderSource?.totalPrice ||
                       xmlOrder?.TotalPrice?.TotalAmount;

    console.log('[parseBookingData] totalPrice object:', totalPrice);

    totalPriceValue = parseFloat(totalPrice?.['#text'] || totalPrice?.value ||
                                  (typeof totalPrice === 'number' ? totalPrice : 0));
    totalPriceCurrency = totalPrice?.['@CurCode'] || totalPrice?.CurCode ||
                         totalPrice?.currency || 'AUD';

    // Try multiple paths for payments
    const paymentSummaries = paymentFunctions?.PaymentProcessingSummary ||
                             raw?.PaymentProcessingSummary ||
                             raw?.Response?.PaymentProcessingSummary;
    payments = normalizeToArray(paymentSummaries);

    // Try multiple paths for order items
    orderItems = normalizeToArray(orderSource?.OrderItem || xmlOrder?.OrderItem || raw?.OrderItem);

    console.log('[parseBookingData] Found payments:', payments.length, 'orderItems:', orderItems.length);
  }

  console.log('[parseBookingData] Final - pnr:', pnr);
  console.log('[parseBookingData] Final - status:', status);
  console.log('[parseBookingData] Final - totalPrice:', totalPriceValue, totalPriceCurrency);
  console.log('[parseBookingData] Final - payments count:', payments.length);

  const payloadAttributes = raw?.payloadAttributes || raw?.PayloadAttributes ||
                            raw?.Response?.PayloadAttributes || {};

  // Parse passengers
  const paxList = normalizeToArray(dataLists?.PaxList?.Pax);
  const contactList = normalizeToArray(dataLists?.ContactInfoList?.ContactInfo);
  const contactMap = new Map(contactList.map((c: any) => [c.ContactInfoID, c]));

  const passengers: PassengerInfo[] = paxList.map((pax: any) => {
    const individual = pax.Individual || {};
    const contact = contactMap.get(pax.ContactInfoRefID);
    const identityDoc = pax.IdentityDoc;
    const loyalty = pax.LoyaltyProgramAccount;

    return {
      paxId: pax.PaxID || '',
      ptc: pax.PTC || 'ADT',
      name: `${individual.GivenName || ''} ${individual.Surname || ''}`.trim(),
      givenName: individual.GivenName || '',
      surname: individual.Surname || '',
      birthdate: individual.Birthdate,
      gender: individual.GenderCode,
      email: contact?.EmailAddress?.EmailAddressText,
      phone: contact?.Phone?.PhoneNumber,
      document: identityDoc ? {
        type: identityDoc.IdentityDocTypeCode || 'PT',
        number: identityDoc.IdentityDocID || '',
        expiry: identityDoc.ExpiryDate || '',
        country: identityDoc.IssuingCountryCode || '',
      } : undefined,
      loyalty: loyalty ? {
        program: loyalty.LoyaltyProgram?.Carrier?.AirlineDesigCode || '',
        number: loyalty.AccountNumber || '',
      } : undefined,
      services: [],
    };
  });

  // Parse segments
  const paxSegments = normalizeToArray(dataLists?.PaxSegmentList?.PaxSegment);
  const marketingSegments = normalizeToArray(dataLists?.DatedMarketingSegmentList?.DatedMarketingSegment);
  const operatingSegments = normalizeToArray(dataLists?.DatedOperatingSegmentList?.DatedOperatingSegment);
  const operatingLegs = normalizeToArray(dataLists?.DatedOperatingLegList?.DatedOperatingLeg);

  const mktMap = new Map(marketingSegments.map((m: any) => [m.DatedMarketingSegmentId, m]));
  const oprMap = new Map(operatingSegments.map((o: any) => [o.DatedOperatingSegmentId, o]));
  const legMap = new Map(operatingLegs.map((l: any) => [l.DatedOperatingLegID, l]));

  // Parse journeys
  const paxJourneys = normalizeToArray(dataLists?.PaxJourneyList?.PaxJourney);
  const journeys: JourneyInfo[] = paxJourneys.map((j: any, idx: number) => {
    const segmentRefIds = normalizeToArray(j.PaxSegmentRefID);
    const segments: SegmentInfo[] = segmentRefIds.map((refId: string) => {
      const paxSeg = paxSegments.find((ps: any) => ps.PaxSegmentID === refId);
      const mktSeg = mktMap.get(paxSeg?.DatedMarketingSegmentRefId);
      const oprSeg = oprMap.get(mktSeg?.DatedOperatingSegmentRefId);
      const leg = legMap.get(oprSeg?.DatedOperatingLegRefID);
      const cabin = paxSeg?.CabinTypeAssociationChoice?.SegmentCabinType;

      // Detect passive segment: SegmentTypeCode = 2 means passive
      const segmentTypeCode = oprSeg?.SegmentTypeCode;
      const isPassive = segmentTypeCode === '2' || segmentTypeCode === 2;

      return {
        segmentId: refId,
        marketingSegmentId: paxSeg?.DatedMarketingSegmentRefId,
        flightNumber: mktSeg?.MarketingCarrierFlightNumberText || '',
        carrierCode: mktSeg?.CarrierDesigCode || '',
        origin: mktSeg?.Dep?.IATA_LocationCode || '',
        destination: mktSeg?.Arrival?.IATA_LocationCode || '',
        departureTime: mktSeg?.Dep?.AircraftScheduledDateTime || '',
        arrivalTime: mktSeg?.Arrival?.AircraftScheduledDateTime || '',
        duration: oprSeg?.Duration,
        aircraft: leg?.CarrierAircraftType?.CarrierAircraftTypeCode,
        cabinClass: cabin?.CabinTypeName,
        cabinCode: cabin?.CabinTypeCode,
        rbd: paxSeg?.MarketingCarrierRBD_Code,
        isPassive,
        segmentTypeCode: segmentTypeCode?.toString(),
      };
    });

    const firstSeg = segments[0];
    const lastSeg = segments[segments.length - 1];

    return {
      journeyId: j.PaxJourneyID || `journey-${idx + 1}`,
      direction: 'outbound' as const, // Will be determined after all journeys parsed
      directionLabel: `Journey ${idx + 1}`, // Placeholder
      origin: firstSeg?.origin || '',
      destination: lastSeg?.destination || '',
      duration: j.Duration || '',
      segments,
    };
  });

  // Determine journey directions based on city pairs
  // Logic: If only 2 journeys and J2's destination matches J1's origin area -> round trip
  // Otherwise -> multi-city
  console.log('[parseBookingData] Journey direction logic - journeys.length:', journeys.length, 'journeys:', journeys.map(j => `${j.origin}→${j.destination}`));
  if (journeys.length === 2) {
    const j1 = journeys[0];
    const j2 = journeys[1];
    // Simple round trip: J1 origin matches J2 destination (or nearby airports)
    const isRoundTrip = isSameCity(j1.origin, j2.destination) || isSameCity(j1.destination, j2.origin);
    if (isRoundTrip) {
      journeys[0].direction = 'outbound';
      journeys[0].directionLabel = 'Outbound';
      journeys[1].direction = 'inbound';
      journeys[1].directionLabel = 'Return';
    } else {
      journeys[0].direction = 'multi-city';
      journeys[0].directionLabel = 'Journey 1';
      journeys[1].direction = 'multi-city';
      journeys[1].directionLabel = 'Journey 2';
    }
  } else if (journeys.length === 1) {
    journeys[0].direction = 'outbound';
    journeys[0].directionLabel = 'One-way';
  } else if (journeys.length > 2) {
    // Multi-city with potential return leg
    // Logic:
    // - First journey is always "Outbound"
    // - If last journey returns to the same city as any earlier journey's origin, it's "Return"
    // - Middle journeys are "Onward" or labeled by route
    console.log('[parseBookingData] Multi-city detected, journeys:', journeys.length);
    const firstJourney = journeys[0];
    const lastJourney = journeys[journeys.length - 1];

    // Check if last journey returns to the first journey's origin city
    // OR to any intermediate journey's origin (for complex multi-city)
    const originCities = journeys.slice(0, -1).map(j => j.origin);
    const returnsToOrigin = originCities.some(origin =>
      isSameCity(lastJourney.destination, origin)
    );

    console.log('[parseBookingData] Multi-city origins:', originCities, 'lastJourney.destination:', lastJourney.destination, 'returnsToOrigin:', returnsToOrigin);

    journeys.forEach((j, idx) => {
      if (idx === 0) {
        // First journey is outbound
        j.direction = 'outbound';
        j.directionLabel = 'Outbound';
        console.log(`[parseBookingData] Journey ${idx}: Outbound`);
      } else if (idx === journeys.length - 1 && returnsToOrigin) {
        // Last journey returns to an origin city
        j.direction = 'inbound';
        j.directionLabel = 'Return';
        console.log(`[parseBookingData] Journey ${idx}: Return`);
      } else {
        // Middle journeys are onward flights
        j.direction = 'multi-city';
        j.directionLabel = 'Onward';
        console.log(`[parseBookingData] Journey ${idx}: Onward`);
      }
    });
  }

  // Parse payments - handle both backend parsed format and raw XML format
  const parsedPayments: PaymentInfo[] = payments.map((p: any) => {
    // Backend format: { paymentId, status, amount: { value, currency }, method: { type, cardBrand, maskedCardNumber } }
    // XML format: { PaymentID, PaymentStatusCode, Amount: { '#text', '@CurCode' }, PaymentProcessingSummaryPaymentMethod }

    if (p.amount && typeof p.amount === 'object' && 'value' in p.amount) {
      // Backend parsed format
      return {
        paymentId: p.paymentId || '',
        status: p.status || 'UNKNOWN',
        amount: {
          value: p.amount.value || 0,
          currency: p.amount.currency || 'AUD',
        },
        method: {
          type: p.method?.type || 'OTHER',
          cardBrand: p.method?.cardBrand,
          maskedNumber: p.method?.maskedCardNumber,
        },
      };
    } else {
      // XML format
      const amount = p.Amount;
      const method = p.PaymentProcessingSummaryPaymentMethod;
      return {
        paymentId: p.PaymentID || '',
        status: p.PaymentStatusCode || 'UNKNOWN',
        amount: {
          value: parseFloat(amount?.['#text'] || amount || 0),
          currency: amount?.['@CurCode'] || amount?.CurCode || 'AUD',
        },
        method: {
          type: method?.SettlementPlan?.PaymentTypeCode || method?.PaymentCard?.CardBrandCode ? 'CC' : 'OTHER',
          cardBrand: method?.PaymentCard?.CardBrandCode,
          maskedNumber: method?.PaymentCard?.MaskedCardNumber,
        },
      };
    }
  });

  // Parse service definitions for better name/code mapping
  const serviceDefList = normalizeToArray(dataLists?.ServiceDefinitionList?.ServiceDefinition);
  const serviceDefMap = new Map<string, { code: string; name: string; description?: string }>();
  serviceDefList.forEach((sd: any) => {
    const descriptions = normalizeToArray(sd.Desc);
    const descText = descriptions.find((d: any) => d.DescText && !d.MarkupStyleText)?.DescText || '';
    serviceDefMap.set(sd.ServiceDefinitionID, {
      code: sd.ServiceCode || sd.ServiceDefinitionID,
      name: sd.Name || descText || sd.ServiceDefinitionID,
      description: descText,
    });
  });

  console.log('[parseBookingData] ServiceDefinitions:', serviceDefMap);

  // Parse order items (already extracted at top as orderItems array)
  const normalizedOrderItems = normalizeToArray(orderItems);
  console.log('[parseBookingData] Found OrderItems:', normalizedOrderItems.length);

  const services: ServiceInfo[] = normalizedOrderItems.map((item: any) => {
    const itemId = item.OrderItemID || '';
    const price = item.Price || {};

    // Get service info from nested Service elements
    const itemServices = normalizeToArray(item.Service);

    // Extract paxIds and segmentIds from all possible paths
    const paxIds: string[] = [];
    const segmentIds: string[] = [];
    let serviceDefId: string | null = null;

    itemServices.forEach((svc: any) => {
      // Get PaxRefID
      if (svc.PaxRefID) paxIds.push(svc.PaxRefID);

      // Get segment refs from multiple possible paths
      const assoc = svc.OrderServiceAssociation;
      if (assoc) {
        // Direct PaxSegmentRef (for FLIGHT items)
        const directSegRef = assoc.PaxSegmentRef?.PaxSegmentRefID;
        if (directSegRef) segmentIds.push(directSegRef);

        // Through ServiceDefinitionRef -> OrderFlightAssociations (for ancillary services)
        const svcDefRef = assoc.ServiceDefinitionRef;
        if (svcDefRef) {
          // Get segment from OrderFlightAssociations
          const flightAssoc = svcDefRef.OrderFlightAssociations;
          if (flightAssoc) {
            const segRef = flightAssoc.PaxSegmentRef?.PaxSegmentRefID;
            if (segRef) segmentIds.push(segRef);
          }
          // Get ServiceDefinitionRefID
          if (svcDefRef.ServiceDefinitionRefID) {
            serviceDefId = svcDefRef.ServiceDefinitionRefID;
          }
        }
      }
    });

    // Determine type and name from service definition or itemId
    let type = 'OTHER';
    let name = '';
    let code = '';

    // Get info from service definition if available
    if (serviceDefId && serviceDefMap.has(serviceDefId)) {
      const svcDef = serviceDefMap.get(serviceDefId)!;
      code = svcDef.code;
      name = svcDef.name;
    }

    // Determine type from itemId, code, or FareDetail presence
    const typeKey = (itemId + code).toUpperCase();

    if (item.FareDetail) {
      // This is a FLIGHT item
      type = 'FLIGHT';
      const fareComp = item.FareDetail?.FareComponent;
      const fareBasis = fareComp?.FareBasisCode || '';
      const priceClass = fareComp?.PriceClassRefID;
      name = `Flight - ${fareBasis}`;
      code = fareBasis;
    } else if (typeKey.includes('P200') || typeKey.includes('STARTER PLUS') || typeKey.includes('STPL')) {
      type = 'BUNDLE';
      if (!name) name = 'Starter Plus Bundle';
      if (!code) code = 'P200';
    } else if (typeKey.includes('S050') || typeKey.includes('STARTER')) {
      type = 'BUNDLE';
      if (!name) name = 'Starter Bundle';
      if (!code) code = 'S050';
    } else if (typeKey.includes('M202') || typeKey.includes('MAX')) {
      type = 'BUNDLE';
      if (!name) name = 'Max Bundle';
      if (!code) code = 'M202';
    } else if (typeKey.includes('BG') || typeKey.includes('BAG')) {
      type = 'BAGGAGE';
      if (!name) name = 'Checked Baggage';
    } else if (typeKey.includes('SEAT') || typeKey.includes('STD') || typeKey.includes('UPF') || typeKey.includes('EXS') || typeKey.includes('FXS')) {
      type = 'SEAT';
      if (!name) name = 'Seat Selection';
    } else if (typeKey.includes('MEAL') || typeKey.includes('ML0') || typeKey.includes('FOOD')) {
      type = 'MEAL';
      if (!name) name = 'Meal';
    } else if (typeKey.includes('V10') || typeKey.includes('VOUCHER')) {
      type = 'ANCILLARY';
      if (!name) name = 'Inflight Voucher';
    } else if (typeKey.includes('FS2') || typeKey.includes('FIRST SERVICE')) {
      type = 'ANCILLARY';
      if (!name) name = 'First Service';
    }

    // Fallback name
    if (!name) name = itemId;

    const uniquePaxIds = [...new Set(paxIds.filter(Boolean))];
    const uniqueSegmentIds = [...new Set(segmentIds.filter(Boolean))];

    console.log('[parseBookingData] OrderItem:', itemId, '| Type:', type, '| Name:', name, '| Code:', code, '| Pax:', uniquePaxIds, '| Segments:', uniqueSegmentIds);

    return {
      orderItemId: itemId,
      type,
      name,
      code,
      price: {
        value: parseFloat(price.TotalAmount?.['#text'] || price.TotalAmount || 0),
        currency: price.TotalAmount?.['@CurCode'] || 'AUD',
      },
      status: item.StatusCode || 'ACTIVE',
      paxIds: uniquePaxIds,
      segmentIds: uniqueSegmentIds,
    };
  });

  // Map services to passengers
  services.forEach(svc => {
    if (svc.type !== 'FLIGHT') {
      svc.paxIds.forEach(paxId => {
        const pax = passengers.find(p => p.paxId === paxId);
        if (pax) {
          pax.services.push({
            type: svc.type,
            name: svc.name,
            code: svc.code,
            price: svc.price,
          });
        }
      });
    }
  });

  // Get payment status (using already extracted values)
  let paymentStatus = 'UNKNOWN';
  if (parsedPayments.some(p => p.status === 'SUCCESSFUL')) {
    paymentStatus = 'SUCCESSFUL';
  } else if (parsedPayments.some(p => p.status === 'PENDING')) {
    paymentStatus = 'PENDING';
  } else if (status === 'OPENED') {
    paymentStatus = 'PENDING';
  }

  // Extract warnings
  const warnings = normalizeToArray(raw?.warnings || raw?.Response?.Warning).map((w: any) => ({
    code: w.code || w.TypeCode,
    message: w.message || w.DescText || '',
  })).filter((w: any) => w.message);

  // Contact info
  const firstContact = contactList[0];
  const contactInfo = firstContact ? {
    email: firstContact.EmailAddress?.EmailAddressText,
    phone: firstContact.Phone?.PhoneNumber,
    city: firstContact.PostalAddress?.CityName,
    country: firstContact.PostalAddress?.CountryCode,
  } : undefined;

  console.log('[parseBookingData] Returning - pnr:', pnr, 'status:', status, 'totalPrice:', totalPriceValue);

  return {
    pnr,
    ownerCode,
    status,
    creationDate,
    totalPrice: {
      value: totalPriceValue,
      currency: totalPriceCurrency,
    },
    paymentStatus,
    payments: parsedPayments,
    journeys,
    passengers,
    services,
    contactInfo,
    correlationId: payloadAttributes?.CorrelationID,
    warnings: warnings.length > 0 ? warnings : undefined,
    rawData: raw,
  };
}

function normalizeToArray<T>(value: T | T[] | undefined): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

/**
 * Check if two airport codes belong to the same city/metro area.
 * This handles cases like Melbourne (MEL, AVV), London (LHR, LGW, STN), etc.
 */
function isSameCity(airport1: string, airport2: string): boolean {
  if (!airport1 || !airport2) return false;
  if (airport1 === airport2) return true;

  // Define city groups - airports that serve the same metropolitan area
  const cityGroups: Record<string, string[]> = {
    'MELBOURNE': ['MEL', 'AVV'],  // Melbourne Tullamarine, Avalon
    'SYDNEY': ['SYD', 'WSA'],      // Sydney Kingsford Smith, Western Sydney (when operational)
    'LONDON': ['LHR', 'LGW', 'STN', 'LTN', 'LCY'],  // Heathrow, Gatwick, Stansted, Luton, City
    'NEW_YORK': ['JFK', 'LGA', 'EWR'],  // JFK, LaGuardia, Newark
    'TOKYO': ['NRT', 'HND'],  // Narita, Haneda
    'PARIS': ['CDG', 'ORY'],  // Charles de Gaulle, Orly
    'OSAKA': ['KIX', 'ITM'],  // Kansai, Itami
    'SEOUL': ['ICN', 'GMP'],  // Incheon, Gimpo
    'SHANGHAI': ['PVG', 'SHA'],  // Pudong, Hongqiao
    'BEIJING': ['PEK', 'PKX'],  // Capital, Daxing
    'BANGKOK': ['BKK', 'DMK'],  // Suvarnabhumi, Don Mueang
    'JAKARTA': ['CGK', 'HLP'],  // Soekarno-Hatta, Halim
  };

  // Find if both airports are in the same city group
  for (const airports of Object.values(cityGroups)) {
    if (airports.includes(airport1) && airports.includes(airport2)) {
      return true;
    }
  }

  return false;
}

function formatCurrency(value: number, currency: string): string {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(value);
}

// Convert ISO 8601 duration (PT2H40M) to readable format (2h 40m)
function formatDuration(duration: string | undefined): string {
  if (!duration) return '';
  // Handle ISO 8601 duration format: PT1H25M, PT6H20M, etc.
  const match = duration.match(/PT(?:(\d+)D)?(?:(\d+)H)?(?:(\d+)M)?/);
  if (!match) return duration; // Return as-is if not ISO format
  const days = match[1] ? parseInt(match[1]) : 0;
  const hours = match[2] ? parseInt(match[2]) : 0;
  const mins = match[3] ? parseInt(match[3]) : 0;
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (mins > 0) parts.push(`${mins}m`);
  return parts.join(' ') || '0m';
}

function formatTime(dateStr: string | undefined): string {
  if (!dateStr) return '--:--';
  try {
    return new Date(dateStr).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', hour12: false });
  } catch {
    return '--:--';
  }
}

function formatDateShort(dateStr: string | undefined): string {
  if (!dateStr) return '-';
  try {
    return new Date(dateStr).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
  } catch {
    return '-';
  }
}

function formatDateFull(dateStr: string | undefined): string {
  if (!dateStr) return '-';
  try {
    return new Date(dateStr).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return '-';
  }
}

function formatDateTime(dateStr: string | undefined): string {
  if (!dateStr) return '-';
  try {
    return new Date(dateStr).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  } catch {
    return '-';
  }
}

// ============================================================================
// TRANSFORM TO SERVICING STORE DATA
// ============================================================================

function transformToServicingData(parsed: ParsedBooking, rawBooking: any): ServicingBookingData {
  const dataLists = rawBooking?.DataLists || rawBooking?.Response?.DataLists || {};
  const order = rawBooking?.Response?.Order || rawBooking?.Order || rawBooking?.order || {};

  // Transform segments with full details including legs
  const allSegments = parsed.journeys.flatMap(j => j.segments.map(seg => ({
    segmentId: seg.segmentId,
    marketingSegmentId: seg.marketingSegmentId,
    departure: {
      airportCode: seg.origin,
      date: seg.departureTime?.split('T')[0] || '',
      time: formatTime(seg.departureTime),
    },
    arrival: {
      airportCode: seg.destination,
      date: seg.arrivalTime?.split('T')[0] || '',
      time: formatTime(seg.arrivalTime),
    },
    marketingCarrier: {
      code: seg.carrierCode,
      flightNumber: seg.flightNumber,
    },
    duration: seg.duration,
    cabinType: seg.cabinClass,
    cabinCode: seg.cabinCode,
    aircraftCode: seg.aircraft,
    legs: [], // Would be populated from DatedOperatingLegList if needed
    status: seg.status || 'CONFIRMED',
  })));

  // Transform journeys
  const journeys = parsed.journeys.map(j => ({
    journeyId: j.journeyId,
    direction: j.direction === 'outbound' ? 'OUTBOUND' : 'INBOUND' as 'OUTBOUND' | 'INBOUND' | 'UNKNOWN',
    origin: j.origin,
    destination: j.destination,
    departureDate: j.segments[0]?.departureTime?.split('T')[0] || '',
    arrivalDate: j.segments[j.segments.length - 1]?.arrivalTime?.split('T')[0],
    duration: j.duration,
    segments: j.segments.map(seg => ({
      segmentId: seg.segmentId,
      marketingSegmentId: seg.marketingSegmentId,
      departure: {
        airportCode: seg.origin,
        date: seg.departureTime?.split('T')[0] || '',
        time: formatTime(seg.departureTime),
      },
      arrival: {
        airportCode: seg.destination,
        date: seg.arrivalTime?.split('T')[0] || '',
        time: formatTime(seg.arrivalTime),
      },
      marketingCarrier: {
        code: seg.carrierCode,
        flightNumber: seg.flightNumber,
      },
      duration: seg.duration,
      cabinType: seg.cabinClass,
      cabinCode: seg.cabinCode,
      aircraftCode: seg.aircraft,
      legs: [],
      status: seg.status || 'CONFIRMED',
    })),
  }));

  // Transform passengers
  const passengers = parsed.passengers.map(pax => ({
    paxId: pax.paxId,
    firstName: pax.givenName,
    lastName: pax.surname,
    gender: pax.gender,
    dateOfBirth: pax.birthdate,
    passengerType: pax.ptc,
    travelDocuments: pax.document ? [{
      documentType: pax.document.type,
      documentNumber: pax.document.number,
      issuingCountry: pax.document.country,
      expiryDate: pax.document.expiry,
    }] : [],
    loyaltyPrograms: pax.loyalty ? [{
      programCode: pax.loyalty.program,
      accountNumber: pax.loyalty.number,
    }] : [],
    contactInfo: pax.email || pax.phone ? {
      emailAddress: pax.email,
      phoneNumber: pax.phone,
    } : undefined,
  }));

  // Transform services
  const services = parsed.services.map(svc => ({
    orderItemId: svc.orderItemId,
    serviceCode: svc.code || '',
    serviceName: svc.name,
    serviceType: svc.type as 'FLIGHT' | 'BAGGAGE' | 'SEAT' | 'MEAL' | 'BUNDLE' | 'SSR' | 'ANCILLARY' | 'OTHER',
    status: svc.status,
    price: {
      amount: svc.price.value,
      currency: svc.price.currency,
    },
    paxIds: svc.paxIds,
    segmentIds: svc.segmentIds,
  }));

  // Transform payments
  const payments = parsed.payments.map(p => ({
    paymentId: p.paymentId,
    paymentMethod: p.method.type,
    amount: p.amount.value,
    currency: p.amount.currency,
    status: p.status,
    cardDetails: p.method.cardBrand ? {
      cardType: p.method.cardBrand,
      maskedNumber: p.method.maskedNumber,
    } : undefined,
  }));

  // Calculate pricing summary
  const totalPaid = parsed.payments
    .filter(p => p.status === 'SUCCESSFUL')
    .reduce((sum, p) => sum + p.amount.value, 0);

  return {
    orderId: parsed.pnr,
    pnrLocator: parsed.pnr,
    ownerCode: parsed.ownerCode,
    orderStatus: parsed.status,
    creationDate: parsed.creationDate,
    journeys,
    allSegments,
    passengers,
    primaryContact: parsed.contactInfo ? {
      emailAddress: parsed.contactInfo.email,
      phoneNumber: parsed.contactInfo.phone,
      address: parsed.contactInfo.city ? {
        city: parsed.contactInfo.city,
        countryCode: parsed.contactInfo.country,
      } : undefined,
    } : undefined,
    services,
    payments,
    tickets: [], // Would be extracted from TicketDocInfo if present
    remarks: [], // Would be extracted from Remark elements if present
    pricingSummary: {
      baseFare: 0, // Would need to calculate from fare breakdown
      taxes: 0,
      fees: 0,
      totalAmount: parsed.totalPrice.value,
      currency: parsed.totalPrice.currency,
      paidAmount: totalPaid,
      dueAmount: parsed.totalPrice.value - totalPaid,
    },
    rawResponse: JSON.stringify(rawBooking),
    loadedAt: new Date().toISOString(),
  };
}
