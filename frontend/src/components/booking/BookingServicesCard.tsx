// ============================================================================
// BOOKING SERVICES CARD - Hierarchical Tree Display
// Journey > Segment > Passenger (with info) > Services
// Shows passport, loyalty, seats, bags, meals, SSRs
// ============================================================================

import { cn } from '@/lib/cn';
import { Card } from '@/components/ui';
import {
  Luggage, Armchair, Utensils, Package, Star, Plane,
  User, ChevronDown, ChevronRight, FileText, Award,
  ArrowRight, Calendar, Clock, Baby, Users
} from 'lucide-react';
import { useState } from 'react';

// Types matching backend parser
export interface ServiceItem {
  orderItemId: string;
  serviceDefinitionRefId?: string;
  serviceName?: string;
  serviceCode?: string;
  serviceType: 'BAGGAGE' | 'SEAT' | 'MEAL' | 'BUNDLE' | 'SSR' | 'OTHER';
  paxRefIds: string[];
  segmentRefIds: string[];
  quantity?: number;
  price?: { value: number; currency: string };
  seatAssignment?: {
    paxRefId: string;
    segmentRefId: string;
    row: string;
    column: string;
    seatCharacteristics?: string[];
  };
}

export interface PassengerIdentityDoc {
  type: 'PP' | 'NI' | 'DL';
  number: string;
  expiryDate: string;
  issuingCountry?: string;
  nationality?: string;
}

export interface PassengerLoyalty {
  programOwner: string;
  accountNumber: string;
  tierLevel?: string;
}

export interface PassengerInfo {
  paxId: string;
  name: string;
  ptc: string;
  title?: string;
  givenName?: string;
  surname?: string;
  birthdate?: string;
  gender?: string;
  email?: string;
  phone?: string;
  identityDoc?: PassengerIdentityDoc;
  loyalty?: PassengerLoyalty;
}

export interface SegmentInfo {
  segmentId: string;
  origin: string;
  destination: string;
  flightNumber: string;
  carrierCode: string;
  departureDateTime: string;
  arrivalDateTime?: string;
  duration?: string;
  cabinCode?: string;
}

export interface JourneyInfo {
  journeyId: string;
  direction: 'outbound' | 'return' | 'multi';
  origin: string;
  destination: string;
  segmentIds: string[];
}

interface BookingServicesCardProps {
  services: ServiceItem[];
  passengers: PassengerInfo[];
  segments: SegmentInfo[];
  journeys: JourneyInfo[];
  className?: string;
}

// Service type config
const serviceConfig = {
  BAGGAGE: { icon: Luggage, label: 'Baggage', color: 'text-blue-600', bgColor: 'bg-blue-100' },
  SEAT: { icon: Armchair, label: 'Seat', color: 'text-purple-600', bgColor: 'bg-purple-100' },
  MEAL: { icon: Utensils, label: 'Meal', color: 'text-orange-600', bgColor: 'bg-orange-100' },
  BUNDLE: { icon: Package, label: 'Bundle', color: 'text-emerald-600', bgColor: 'bg-emerald-100' },
  SSR: { icon: Star, label: 'SSR', color: 'text-amber-600', bgColor: 'bg-amber-100' },
  OTHER: { icon: Star, label: 'Service', color: 'text-gray-600', bgColor: 'bg-gray-100' },
};

function getCurrencySymbol(currency: string): string {
  const symbols: Record<string, string> = {
    AUD: 'A$', USD: '$', EUR: '€', GBP: '£', NZD: 'NZ$', SGD: 'S$', JPY: '¥',
  };
  return symbols[currency] || currency + ' ';
}

function formatDateTime(dateTimeStr: string): { date: string; time: string } {
  if (!dateTimeStr) return { date: '', time: '' };
  const dt = new Date(dateTimeStr);
  return {
    date: dt.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' }),
    time: dt.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', hour12: false }),
  };
}

function getDirectionLabel(direction: string): string {
  return direction === 'outbound' ? 'Outbound' : direction === 'return' ? 'Return' : 'Flight';
}

function getPtcIcon(ptc: string) {
  if (ptc === 'CHD') return Baby;
  if (ptc === 'INF') return Baby;
  return User;
}

function getPtcLabel(ptc: string): string {
  return { ADT: 'Adult', CHD: 'Child', INF: 'Infant' }[ptc] || ptc;
}

function getDocTypeLabel(type: string): string {
  return { PP: 'Passport', NI: 'National ID', DL: 'Driving License' }[type] || type;
}

export function BookingServicesCard({
  services,
  passengers,
  segments,
  journeys,
  className,
}: BookingServicesCardProps) {
  const [expandedJourneys, setExpandedJourneys] = useState<Set<string>>(
    new Set(journeys.map(j => j.journeyId))
  );
  const [expandedSegments, setExpandedSegments] = useState<Set<string>>(
    new Set(segments.map(s => s.segmentId))
  );
  const [expandedPax, setExpandedPax] = useState<Set<string>>(new Set());

  if ((!services || services.length === 0) && journeys.length === 0) {
    return null;
  }

  const toggleJourney = (id: string) => {
    setExpandedJourneys(prev => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      return s;
    });
  };

  const toggleSegment = (id: string) => {
    setExpandedSegments(prev => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      return s;
    });
  };

  const togglePax = (key: string) => {
    setExpandedPax(prev => {
      const s = new Set(prev);
      s.has(key) ? s.delete(key) : s.add(key);
      return s;
    });
  };

  const getSegment = (id: string) => segments.find(s => s.segmentId === id);

  const getServicesForPaxSegment = (paxId: string, segmentId: string): ServiceItem[] => {
    return services.filter(s =>
      s.paxRefIds.includes(paxId) && s.segmentRefIds.includes(segmentId)
    );
  };

  return (
    <Card className={cn('p-6 bg-white shadow-lg border border-gray-100', className)}>
      <h3 className="text-lg font-bold text-gray-900 mb-6 flex items-center gap-2">
        <Users className="w-5 h-5 text-emerald-600" />
        Complete Booking Details
      </h3>

      <div className="space-y-4">
        {journeys.map((journey) => {
          const isJourneyExpanded = expandedJourneys.has(journey.journeyId);

          return (
            <div key={journey.journeyId} className="border border-gray-200 rounded-xl overflow-hidden">
              {/* Journey Header */}
              <button
                onClick={() => toggleJourney(journey.journeyId)}
                className="w-full flex items-center justify-between p-4 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white hover:from-emerald-600 hover:to-emerald-700 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-white/20 rounded-lg">
                    <Plane className="w-5 h-5" />
                  </div>
                  <div className="text-left">
                    <p className="font-semibold text-lg flex items-center gap-2">
                      {journey.origin} <ArrowRight className="w-4 h-4" /> {journey.destination}
                    </p>
                    <p className="text-emerald-100 text-sm">{getDirectionLabel(journey.direction)}</p>
                  </div>
                </div>
                {isJourneyExpanded ? <ChevronDown className="w-6 h-6" /> : <ChevronRight className="w-6 h-6" />}
              </button>

              {/* Journey Content */}
              {isJourneyExpanded && (
                <div className="bg-gray-50">
                  {journey.segmentIds.map((segmentId) => {
                    const segment = getSegment(segmentId);
                    if (!segment) return null;

                    const isSegmentExpanded = expandedSegments.has(segmentId);
                    const { date, time: depTime } = formatDateTime(segment.departureDateTime);
                    const { time: arrTime } = formatDateTime(segment.arrivalDateTime || '');

                    return (
                      <div key={segmentId} className="border-t border-gray-200">
                        {/* Segment Header */}
                        <button
                          onClick={() => toggleSegment(segmentId)}
                          className="w-full flex items-center justify-between p-4 bg-white hover:bg-gray-50 transition-colors"
                        >
                          <div className="flex items-center gap-4 flex-wrap">
                            <div className="bg-orange-100 text-orange-700 px-3 py-1.5 rounded-lg font-mono font-bold text-sm">
                              {segment.carrierCode} {segment.flightNumber}
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="text-left">
                                <p className="font-semibold text-gray-900">{segment.origin}</p>
                                <p className="text-xs text-gray-500">{depTime}</p>
                              </div>
                              <div className="flex flex-col items-center px-2">
                                <div className="w-12 h-px bg-gray-300 relative">
                                  <Plane className="w-3 h-3 text-gray-400 absolute -top-1.5 left-1/2 -translate-x-1/2" />
                                </div>
                                {segment.duration && (
                                  <span className="text-xs text-gray-400">{segment.duration}</span>
                                )}
                              </div>
                              <div className="text-left">
                                <p className="font-semibold text-gray-900">{segment.destination}</p>
                                <p className="text-xs text-gray-500">{arrTime}</p>
                              </div>
                            </div>
                            <div className="text-sm text-gray-600 bg-gray-100 px-3 py-1 rounded-lg flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              {date}
                            </div>
                          </div>
                          {isSegmentExpanded ? <ChevronDown className="w-5 h-5 text-gray-400" /> : <ChevronRight className="w-5 h-5 text-gray-400" />}
                        </button>

                        {/* Passengers for this segment */}
                        {isSegmentExpanded && (
                          <div className="px-4 pb-4 bg-white">
                            <div className="bg-gray-50 rounded-xl p-3 space-y-3">
                              {passengers.map((pax) => {
                                const paxKey = `${segmentId}-${pax.paxId}`;
                                const paxServices = getServicesForPaxSegment(pax.paxId, segmentId);
                                const isPaxExpanded = expandedPax.has(paxKey);
                                const PtcIcon = getPtcIcon(pax.ptc);

                                // Group services by type
                                const servicesByType = paxServices.reduce((acc, s) => {
                                  if (!acc[s.serviceType]) acc[s.serviceType] = [];
                                  acc[s.serviceType].push(s);
                                  return acc;
                                }, {} as Record<string, ServiceItem[]>);

                                return (
                                  <div key={paxKey} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                                    {/* Passenger Header */}
                                    <button
                                      onClick={() => togglePax(paxKey)}
                                      className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
                                    >
                                      <div className="flex items-center gap-3">
                                        <div className="p-2 bg-slate-100 rounded-full">
                                          <PtcIcon className="w-5 h-5 text-slate-600" />
                                        </div>
                                        <div className="text-left">
                                          <p className="font-semibold text-gray-900">
                                            {pax.title && `${pax.title} `}{pax.name}
                                          </p>
                                          <p className="text-xs text-gray-500">{getPtcLabel(pax.ptc)}</p>
                                        </div>
                                      </div>

                                      <div className="flex items-center gap-2">
                                        {/* Quick Info Badges */}
                                        {pax.identityDoc && (
                                          <div className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium bg-slate-100 text-slate-600">
                                            <FileText className="w-3 h-3" />
                                            <span>{getDocTypeLabel(pax.identityDoc.type)}</span>
                                          </div>
                                        )}
                                        {pax.loyalty && (
                                          <div className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium bg-amber-100 text-amber-700">
                                            <Award className="w-3 h-3" />
                                            <span>{pax.loyalty.programOwner}</span>
                                          </div>
                                        )}
                                        {/* Service Summary Icons */}
                                        {Object.entries(servicesByType).map(([type, items]) => {
                                          const config = serviceConfig[type as keyof typeof serviceConfig];
                                          const Icon = config.icon;
                                          return (
                                            <div
                                              key={type}
                                              className={cn('flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium', config.bgColor, config.color)}
                                            >
                                              <Icon className="w-3 h-3" />
                                              {items.length > 1 && <span>x{items.length}</span>}
                                            </div>
                                          );
                                        })}
                                        {isPaxExpanded ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                                      </div>
                                    </button>

                                    {/* Expanded Passenger Details */}
                                    {isPaxExpanded && (
                                      <div className="px-4 pb-4 space-y-4 border-t border-gray-100 bg-gray-50">
                                        {/* Personal Info */}
                                        <div className="pt-4">
                                          <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Passenger Information</p>
                                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                            {pax.birthdate && (
                                              <InfoItem label="Date of Birth" value={new Date(pax.birthdate).toLocaleDateString('en-AU')} />
                                            )}
                                            {pax.gender && (
                                              <InfoItem label="Gender" value={pax.gender === 'M' ? 'Male' : pax.gender === 'F' ? 'Female' : pax.gender} />
                                            )}
                                            {pax.email && <InfoItem label="Email" value={pax.email} />}
                                            {pax.phone && <InfoItem label="Phone" value={pax.phone} />}
                                          </div>
                                        </div>

                                        {/* Identity Document */}
                                        {pax.identityDoc && (
                                          <div>
                                            <p className="text-xs font-semibold text-gray-500 uppercase mb-2 flex items-center gap-1">
                                              <FileText className="w-3 h-3" />
                                              {getDocTypeLabel(pax.identityDoc.type)}
                                            </p>
                                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 bg-white p-3 rounded-lg border border-gray-100">
                                              <InfoItem label="Document Number" value={pax.identityDoc.number} />
                                              <InfoItem label="Expiry Date" value={new Date(pax.identityDoc.expiryDate).toLocaleDateString('en-AU')} />
                                              {pax.identityDoc.issuingCountry && (
                                                <InfoItem label="Issuing Country" value={pax.identityDoc.issuingCountry} />
                                              )}
                                              {pax.identityDoc.nationality && (
                                                <InfoItem label="Nationality" value={pax.identityDoc.nationality} />
                                              )}
                                            </div>
                                          </div>
                                        )}

                                        {/* Loyalty Program */}
                                        {pax.loyalty && (
                                          <div>
                                            <p className="text-xs font-semibold text-gray-500 uppercase mb-2 flex items-center gap-1">
                                              <Award className="w-3 h-3" />
                                              Loyalty Program
                                            </p>
                                            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 bg-amber-50 p-3 rounded-lg border border-amber-100">
                                              <InfoItem label="Program" value={pax.loyalty.programOwner} />
                                              <InfoItem label="Member Number" value={pax.loyalty.accountNumber} />
                                              {pax.loyalty.tierLevel && (
                                                <InfoItem label="Tier" value={pax.loyalty.tierLevel} />
                                              )}
                                            </div>
                                          </div>
                                        )}

                                        {/* Services */}
                                        {paxServices.length > 0 && (
                                          <div>
                                            <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Booked Services</p>
                                            <div className="grid gap-2">
                                              {paxServices.map((service, idx) => (
                                                <ServiceItemRow key={`${service.orderItemId}-${idx}`} service={service} />
                                              ))}
                                            </div>
                                          </div>
                                        )}
                                      </div>
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
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// Info item component
function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-sm font-medium text-gray-900 truncate">{value}</p>
    </div>
  );
}

// Service item row
function ServiceItemRow({ service }: { service: ServiceItem }) {
  const config = serviceConfig[service.serviceType];
  const Icon = config.icon;

  let displayName = service.serviceName || service.serviceCode || 'Service';
  if (service.seatAssignment) {
    displayName = `Seat ${service.seatAssignment.row}${service.seatAssignment.column}`;
    if (service.seatAssignment.seatCharacteristics?.length) {
      const chars = service.seatAssignment.seatCharacteristics.slice(0, 2).map(c => c.replace(/_/g, ' ')).join(', ');
      displayName += ` - ${chars}`;
    }
  }

  return (
    <div className="flex items-center justify-between p-3 bg-white rounded-lg border border-gray-100">
      <div className="flex items-center gap-3">
        <div className={cn('p-2 rounded-lg', config.bgColor)}>
          <Icon className={cn('w-4 h-4', config.color)} />
        </div>
        <div>
          <p className="text-sm font-medium text-gray-900">{displayName}</p>
          {service.quantity && service.quantity > 1 && (
            <p className="text-xs text-gray-500">Quantity: {service.quantity}</p>
          )}
        </div>
      </div>
      {service.price && service.price.value > 0 && (
        <span className={cn('text-sm font-bold', config.color)}>
          {getCurrencySymbol(service.price.currency)}{service.price.value.toFixed(2)}
        </span>
      )}
    </div>
  );
}
