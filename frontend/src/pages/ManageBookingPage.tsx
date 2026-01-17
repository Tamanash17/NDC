import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useToast } from '@/core/context/ToastContext';
import { useXmlViewer } from '@/core/context/XmlViewerContext';
import { useSessionStore } from '@/core/context/SessionStore';
import { orderRetrieve } from '@/lib/ndc-api';
import { cn } from '@/lib/cn';
import { Card, Button, Alert } from '@/components/ui';
import { AppLayout } from '@/components/layout';
import {
  Search, RefreshCw, XCircle, Luggage, Armchair, Plane, Clock, Calendar,
  Mail, Phone, MapPin, CreditCard, ChevronDown, ChevronUp, Copy, Check,
  User, Users, Baby, Star, FileText, Package, Tag, Database, Eye, Code,
  AlertTriangle, CheckCircle, Info, Timer, Receipt, Hash, Utensils, Shield,
  Building2, Banknote, Wallet, Globe, Award
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
  direction: 'outbound' | 'return';
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
  const toast = useToast();
  const { startNewSession, addCapture } = useXmlViewer();
  const { getDistributionContext } = useSessionStore();
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

      {/* Flight Timeline */}
      <FlightTimeline journeys={booking.journeys} />

      {/* Passengers */}
      <PassengersCard passengers={booking.passengers} services={booking.services} />

      {/* Payment Summary */}
      <PaymentCard booking={booking} navigate={navigate} />

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

      {/* Flight Timeline with IDs */}
      <FlightTimelineDev journeys={booking.journeys} />

      {/* Passengers with IDs */}
      <PassengersCardDev passengers={booking.passengers} />

      {/* Services/OrderItems */}
      <ServicesCard services={booking.services} />

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
// FLIGHT TIMELINE (Simple)
// ============================================================================

function FlightTimeline({ journeys }: { journeys: JourneyInfo[] }) {
  return (
    <div className="space-y-4">
      {journeys.map((journey, idx) => (
        <JourneyCard key={journey.journeyId} journey={journey} index={idx} />
      ))}
    </div>
  );
}

function JourneyCard({ journey, index }: { journey: JourneyInfo; index: number }) {
  const [isExpanded, setIsExpanded] = useState(true);
  const isOutbound = journey.direction === 'outbound';

  return (
    <div className="bg-white rounded-2xl shadow-lg overflow-hidden border border-gray-100">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={cn(
          'w-full flex items-center justify-between px-6 py-4',
          isOutbound ? 'bg-orange-500' : 'bg-blue-500',
          'text-white'
        )}
      >
        <div className="flex items-center gap-4">
          <div className="p-2 bg-white/20 rounded-lg">
            <Plane className={cn('w-5 h-5', !isOutbound && 'rotate-180')} />
          </div>
          <div className="text-left">
            <p className="text-sm font-medium opacity-80">{isOutbound ? 'Outbound' : 'Return'}</p>
            <p className="text-xl font-bold">{journey.origin} → {journey.destination}</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-sm opacity-80">
              {formatDateFull(journey.segments[0]?.departureTime)}
            </p>
            <p className="font-semibold">{journey.duration} • {journey.segments.length} flight{journey.segments.length > 1 ? 's' : ''}</p>
          </div>
          {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
        </div>
      </button>

      {/* Segments */}
      {isExpanded && (
        <div className="p-6 space-y-4">
          {journey.segments.map((segment, segIdx) => (
            <div key={segment.segmentId}>
              <SegmentRow segment={segment} />
              {segIdx < journey.segments.length - 1 && (
                <LayoverIndicator
                  arrivalTime={segment.arrivalTime}
                  departureTime={journey.segments[segIdx + 1].departureTime}
                  city={segment.destination}
                />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SegmentRow({ segment }: { segment: SegmentInfo }) {
  return (
    <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-xl">
      {/* Flight Number */}
      <div className="bg-orange-100 text-orange-700 px-3 py-2 rounded-lg font-mono font-bold text-center min-w-[70px]">
        {segment.carrierCode} {segment.flightNumber}
      </div>

      {/* Departure */}
      <div className="text-center">
        <p className="text-2xl font-bold text-gray-900">{formatTime(segment.departureTime)}</p>
        <p className="text-sm font-semibold text-gray-600">{segment.origin}</p>
      </div>

      {/* Flight Path */}
      <div className="flex-1 flex items-center px-4">
        <div className="flex-1 h-0.5 bg-gray-300" />
        <div className="mx-2 flex flex-col items-center">
          <Plane className="w-4 h-4 text-gray-400" />
          {segment.duration && (
            <span className="text-xs text-gray-500 mt-1">{segment.duration}</span>
          )}
        </div>
        <div className="flex-1 h-0.5 bg-gray-300" />
      </div>

      {/* Arrival */}
      <div className="text-center">
        <p className="text-2xl font-bold text-gray-900">{formatTime(segment.arrivalTime)}</p>
        <p className="text-sm font-semibold text-gray-600">{segment.destination}</p>
      </div>

      {/* Info */}
      <div className="text-right text-xs text-gray-500 space-y-1">
        <p>{formatDateShort(segment.departureTime)}</p>
        {segment.cabinClass && <p>{segment.cabinClass}</p>}
        {segment.aircraft && <p>{segment.aircraft}</p>}
      </div>
    </div>
  );
}

function LayoverIndicator({ arrivalTime, departureTime, city }: { arrivalTime: string; departureTime: string; city: string }) {
  const layover = calculateLayover(arrivalTime, departureTime);
  return (
    <div className="flex justify-center my-3">
      <div className="bg-amber-50 border border-amber-200 rounded-full px-4 py-1.5 flex items-center gap-2">
        <Clock className="w-4 h-4 text-amber-600" />
        <span className="text-sm text-amber-800 font-medium">{layover} layover in {city}</span>
      </div>
    </div>
  );
}

// ============================================================================
// PASSENGERS CARD (Simple)
// ============================================================================

function PassengersCard({ passengers, services }: { passengers: PassengerInfo[]; services: ServiceInfo[] }) {
  return (
    <div className="bg-white rounded-2xl shadow-lg overflow-hidden border border-gray-100">
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-700 to-slate-800 px-6 py-4 text-white">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-white/20 rounded-lg">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-lg">Passengers</h3>
            <p className="text-sm text-white/70">{passengers.length} traveler{passengers.length > 1 ? 's' : ''}</p>
          </div>
        </div>
      </div>

      {/* Passenger List */}
      <div className="p-6 space-y-4">
        {passengers.map((pax, idx) => (
          <PassengerRow key={pax.paxId} passenger={pax} index={idx + 1} />
        ))}
      </div>
    </div>
  );
}

function PassengerRow({ passenger, index }: { passenger: PassengerInfo; index: number }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const PtcIcon = passenger.ptc === 'CHD' ? Baby : User;

  return (
    <div className="bg-gray-50 rounded-xl border border-gray-100 overflow-hidden">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-100 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className={cn(
            'p-2 rounded-lg',
            passenger.ptc === 'ADT' ? 'bg-blue-100' : passenger.ptc === 'CHD' ? 'bg-purple-100' : 'bg-pink-100'
          )}>
            <PtcIcon className={cn(
              'w-5 h-5',
              passenger.ptc === 'ADT' ? 'text-blue-600' : passenger.ptc === 'CHD' ? 'text-purple-600' : 'text-pink-600'
            )} />
          </div>
          <div className="text-left">
            <p className="font-bold text-gray-900">{passenger.name}</p>
            <p className="text-xs text-gray-500">Pax {index} • {passenger.ptc === 'ADT' ? 'Adult' : passenger.ptc === 'CHD' ? 'Child' : 'Infant'}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {passenger.loyalty && (
            <span className="bg-amber-100 text-amber-700 px-2 py-0.5 rounded text-xs font-medium flex items-center gap-1">
              <Star className="w-3 h-3" /> {passenger.loyalty.program}
            </span>
          )}
          {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
        </div>
      </button>

      {isExpanded && (
        <div className="px-4 pb-4 space-y-3">
          {/* Basic Info */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {passenger.birthdate && (
              <div>
                <p className="text-xs text-gray-500">Date of Birth</p>
                <p className="text-sm font-medium">{formatDateFull(passenger.birthdate)}</p>
              </div>
            )}
            {passenger.gender && (
              <div>
                <p className="text-xs text-gray-500">Gender</p>
                <p className="text-sm font-medium">{passenger.gender === 'M' ? 'Male' : 'Female'}</p>
              </div>
            )}
            {passenger.email && (
              <div>
                <p className="text-xs text-gray-500">Email</p>
                <p className="text-sm font-medium">{passenger.email}</p>
              </div>
            )}
            {passenger.phone && (
              <div>
                <p className="text-xs text-gray-500">Phone</p>
                <p className="text-sm font-medium">{passenger.phone}</p>
              </div>
            )}
          </div>

          {/* Document */}
          {passenger.document && (
            <div className="pt-3 border-t border-gray-200">
              <p className="text-xs font-semibold text-gray-500 mb-2 flex items-center gap-1">
                <FileText className="w-3 h-3" /> Travel Document
              </p>
              <div className="grid grid-cols-4 gap-3 text-sm">
                <div>
                  <p className="text-xs text-gray-500">Type</p>
                  <p className="font-medium">Passport</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Number</p>
                  <p className="font-medium font-mono">***{passenger.document.number.slice(-4)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Country</p>
                  <p className="font-medium">{passenger.document.country}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Expiry</p>
                  <p className="font-medium">{formatDateFull(passenger.document.expiry)}</p>
                </div>
              </div>
            </div>
          )}

          {/* Loyalty */}
          {passenger.loyalty && (
            <div className="pt-3 border-t border-gray-200">
              <div className="flex items-center gap-3 bg-amber-50 rounded-lg p-3 border border-amber-200">
                <Star className="w-6 h-6 text-amber-500" />
                <div>
                  <p className="font-semibold text-gray-900">{passenger.loyalty.program} Frequent Flyer</p>
                  <p className="text-sm text-gray-600">Member #{passenger.loyalty.number}</p>
                </div>
              </div>
            </div>
          )}

          {/* Services */}
          {passenger.services.length > 0 && (
            <div className="pt-3 border-t border-gray-200">
              <p className="text-xs font-semibold text-gray-500 mb-2">Booked Services</p>
              <div className="flex flex-wrap gap-2">
                {passenger.services.map((svc, idx) => (
                  <span key={idx} className={cn(
                    'px-2 py-1 rounded text-xs font-medium',
                    svc.type === 'BAGGAGE' ? 'bg-blue-100 text-blue-700' :
                    svc.type === 'SEAT' ? 'bg-purple-100 text-purple-700' :
                    svc.type === 'MEAL' ? 'bg-green-100 text-green-700' :
                    'bg-gray-100 text-gray-700'
                  )}>
                    {svc.name}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// PAYMENT CARD (Simple)
// ============================================================================

function PaymentCard({ booking, navigate }: { booking: ParsedBooking; navigate: (path: string) => void }) {
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

function FlightTimelineDev({ journeys }: { journeys: JourneyInfo[] }) {
  return (
    <div className="bg-white rounded-2xl shadow-lg overflow-hidden border border-gray-100">
      <div className="bg-blue-600 px-6 py-4 text-white">
        <div className="flex items-center gap-3">
          <Plane className="w-5 h-5" />
          <h3 className="font-bold">Flight Segments (PaxJourney / PaxSegment)</h3>
        </div>
      </div>
      <div className="p-6 space-y-6">
        {journeys.map((journey, idx) => (
          <div key={journey.journeyId} className="space-y-3">
            <div className="flex items-center gap-3">
              <span className={cn(
                'px-2 py-1 rounded text-xs font-bold',
                idx === 0 ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'
              )}>
                {journey.direction === 'outbound' ? 'Outbound' : 'Return'}
              </span>
              <span className="font-bold">{journey.origin} → {journey.destination}</span>
              <span className="text-sm text-gray-500">{journey.duration}</span>
              <CopyableBadge label="PaxJourneyID" value={journey.journeyId} small />
            </div>

            <div className="space-y-2 ml-4 border-l-2 border-gray-200 pl-4">
              {journey.segments.map(seg => (
                <div key={seg.segmentId} className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="bg-orange-100 text-orange-700 px-2 py-1 rounded font-mono font-bold text-sm">
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
                      seg.status === 'CONFIRMED' || seg.status === 'READY TO PROCEED' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-700'
                    )}>{seg.status || 'CONFIRMED'}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <CopyableBadge label="PaxSegmentID" value={seg.segmentId} small />
                    {seg.marketingSegmentId && <CopyableBadge label="MktSegmentID" value={seg.marketingSegmentId} small />}
                    {seg.cabinClass && <CopyableBadge label="Cabin" value={`${seg.cabinClass} (${seg.cabinCode})`} small />}
                    {seg.rbd && <CopyableBadge label="RBD" value={seg.rbd} small />}
                    {seg.duration && <CopyableBadge label="Duration" value={seg.duration} small />}
                    {seg.aircraft && <CopyableBadge label="Aircraft" value={seg.aircraft} small />}
                  </div>
                </div>
              ))}
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

function ServicesCard({ services }: { services: ServiceInfo[] }) {
  const flightServices = services.filter(s => s.type === 'FLIGHT');
  const otherServices = services.filter(s => s.type !== 'FLIGHT');

  return (
    <div className="bg-white rounded-2xl shadow-lg overflow-hidden border border-gray-100">
      <div className="bg-purple-600 px-6 py-4 text-white">
        <div className="flex items-center gap-3">
          <Package className="w-5 h-5" />
          <h3 className="font-bold">Order Items ({services.length})</h3>
        </div>
      </div>
      <div className="p-6 space-y-4">
        {services.map(svc => (
          <div key={svc.orderItemId} className={cn(
            'rounded-xl p-4 border',
            svc.type === 'FLIGHT' ? 'bg-blue-50 border-blue-200' : 'bg-purple-50 border-purple-200'
          )}>
            <div className="flex items-start justify-between">
              <div>
                <p className="font-bold text-gray-900">{svc.name}</p>
                <p className="text-xs text-gray-500 font-mono mt-1">{svc.orderItemId}</p>
              </div>
              <div className="text-right">
                <p className="font-bold text-lg">{formatCurrency(svc.price.value, svc.price.currency)}</p>
                <span className={cn(
                  'px-1.5 py-0.5 rounded text-xs font-semibold',
                  svc.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-700'
                )}>{svc.status}</span>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <CopyableBadge label="OrderItemID" value={svc.orderItemId} small />
              {svc.code && <CopyableBadge label="ServiceCode" value={svc.code} small />}
              <CopyableBadge label="Type" value={svc.type} small />
              {svc.paxIds.map((id, i) => (
                <CopyableBadge key={i} label={`Pax${i+1}`} value={id} small />
              ))}
            </div>
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
  const dataLists = raw?.DataLists || raw?.Response?.DataLists || {};
  const order = raw?.Response?.Order || raw?.Order || raw?.order || {};
  const paymentFunctions = raw?.Response?.PaymentFunctions || raw?.PaymentFunctions || {};
  const payloadAttributes = raw?.PayloadAttributes || raw?.Response?.PayloadAttributes || {};

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
      };
    });

    const firstSeg = segments[0];
    const lastSeg = segments[segments.length - 1];

    return {
      journeyId: j.PaxJourneyID || `journey-${idx + 1}`,
      direction: idx === 0 ? 'outbound' : 'return',
      origin: firstSeg?.origin || '',
      destination: lastSeg?.destination || '',
      duration: j.Duration || '',
      segments,
    };
  });

  // Parse payments
  const paymentSummaries = normalizeToArray(paymentFunctions?.PaymentProcessingSummary);
  const payments: PaymentInfo[] = paymentSummaries.map((p: any) => {
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
  });

  // Parse order items
  const orderItems = normalizeToArray(order?.OrderItem);
  const serviceDefs = normalizeToArray(dataLists?.ServiceDefinitionList?.ServiceDefinition);
  const serviceDefMap = new Map(serviceDefs.map((sd: any) => [sd.ServiceDefinitionID, sd]));

  const services: ServiceInfo[] = orderItems.map((item: any) => {
    const itemId = item.OrderItemID || '';
    const price = item.Price || {};
    const isFlight = itemId.includes('FLIGHT');

    // Determine type and name
    let type = 'OTHER';
    let name = itemId;
    let code = '';

    if (itemId.includes('FLIGHT')) {
      type = 'FLIGHT';
      const fareComp = item.FareDetail?.FareComponent;
      name = `Flight - ${fareComp?.FareBasisCode || 'Base Fare'}`;
      code = fareComp?.FareBasisCode;
    } else if (itemId.includes('P200') || itemId.includes('BNDL')) {
      type = 'BUNDLE';
      name = 'Starter Plus Bundle';
      code = 'P200';
    } else if (itemId.includes('BAG') || itemId.includes('BG')) {
      type = 'BAGGAGE';
      name = 'Checked Baggage';
    } else if (itemId.includes('SEAT')) {
      type = 'SEAT';
      name = 'Seat Selection';
    } else if (itemId.includes('MEAL')) {
      type = 'MEAL';
      name = 'Meal';
    }

    // Get service info from nested Service elements
    const itemServices = normalizeToArray(item.Service);
    const paxIds = [...new Set(itemServices.map((s: any) => s.PaxRefID).filter(Boolean))];
    const segmentIds = [...new Set(itemServices.flatMap((s: any) => {
      const segRef = s.OrderServiceAssociation?.PaxSegmentRef?.PaxSegmentRefID ||
                     s.OrderServiceAssociation?.ServiceDefinitionRef?.OrderFlightAssociations?.PaxSegmentRef?.PaxSegmentRefID;
      return segRef ? [segRef] : [];
    }))];

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
      paxIds,
      segmentIds,
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

  // Get total price
  const totalPrice = order?.TotalPrice?.TotalAmount || order?.totalPrice;

  // Get payment status
  let paymentStatus = 'UNKNOWN';
  if (payments.some(p => p.status === 'SUCCESSFUL')) {
    paymentStatus = 'SUCCESSFUL';
  } else if (payments.some(p => p.status === 'PENDING')) {
    paymentStatus = 'PENDING';
  } else if (order?.StatusCode === 'OPENED' || order?.status === 'OPENED') {
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

  return {
    pnr: order?.OrderID || order?.orderId || '',
    ownerCode: order?.OwnerCode || order?.ownerCode || 'JQ',
    status: order?.StatusCode || order?.status || 'UNKNOWN',
    creationDate: order?.CreationDateTime,
    totalPrice: {
      value: parseFloat(totalPrice?.['#text'] || totalPrice?.value || totalPrice || 0),
      currency: totalPrice?.['@CurCode'] || totalPrice?.currency || totalPrice?.CurCode || 'AUD',
    },
    paymentStatus,
    payments,
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

function formatCurrency(value: number, currency: string): string {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(value);
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

function calculateLayover(arrivalTime: string, departureTime: string): string {
  try {
    const arrival = new Date(arrivalTime);
    const departure = new Date(departureTime);
    const diffMs = departure.getTime() - arrival.getTime();
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${mins}m`;
  } catch {
    return 'N/A';
  }
}
