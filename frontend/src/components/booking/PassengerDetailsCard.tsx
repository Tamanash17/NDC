// ============================================================================
// PASSENGER DETAILS CARD - Visual Passenger Display with Services
// Shows passenger info, identity docs, loyalty, and assigned services
// ============================================================================

import { cn } from '@/lib/cn';
import {
  User, Users, Baby, Mail, Phone, CreditCard, Award, FileText,
  Armchair, Luggage, Utensils, Shield, Star, Calendar
} from 'lucide-react';

export interface PassengerIdentityDoc {
  type: 'PP' | 'NI' | 'DL';
  number: string;
  expiryDate: string;
  issuingCountry: string;
  nationality?: string;
}

export interface PassengerLoyalty {
  programOwner: string;
  programName?: string;
  accountNumber: string;
  tierLevel?: string;
}

export interface PassengerService {
  type: 'seat' | 'baggage' | 'meal' | 'other';
  segmentId?: string;
  segmentLabel?: string;
  description: string;
  code?: string;
  price?: { value: number; currency: string };
}

export interface PassengerData {
  paxId: string;
  ptc: 'ADT' | 'CHD' | 'INF';
  title?: string;
  givenName: string;
  middleName?: string;
  surname: string;
  birthdate: string;
  gender: 'M' | 'F' | 'U';
  email?: string;
  phone?: string;
  identityDoc?: PassengerIdentityDoc;
  loyalty?: PassengerLoyalty;
  services?: PassengerService[];
  infantAssocPaxId?: string;
}

export interface PassengerDetailsCardProps {
  passengers: PassengerData[];
  showServices?: boolean;
  compact?: boolean;
}

export function PassengerDetailsCard({
  passengers,
  showServices = true,
  compact = false,
}: PassengerDetailsCardProps) {
  // Group adults with their infants
  const adultsWithInfants = passengers.filter(p => p.ptc === 'ADT').map(adult => {
    const infant = passengers.find(p => p.infantAssocPaxId === adult.paxId);
    return { adult, infant };
  });
  const children = passengers.filter(p => p.ptc === 'CHD');
  const standaloneInfants = passengers.filter(
    p => p.ptc === 'INF' && !passengers.some(a => a.paxId === p.infantAssocPaxId)
  );

  return (
    <div className="bg-white rounded-2xl shadow-lg overflow-hidden border border-gray-100">
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-700 to-slate-800 px-6 py-4 text-white">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-white/20 rounded-xl backdrop-blur-sm">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-xl font-bold">Passengers</h3>
            <p className="text-white/70 text-sm">
              {passengers.length} traveler{passengers.length !== 1 ? 's' : ''}
              {' '}
              ({passengers.filter(p => p.ptc === 'ADT').length} adult{passengers.filter(p => p.ptc === 'ADT').length !== 1 ? 's' : ''}
              {children.length > 0 && `, ${children.length} child${children.length !== 1 ? 'ren' : ''}`}
              {passengers.filter(p => p.ptc === 'INF').length > 0 && `, ${passengers.filter(p => p.ptc === 'INF').length} infant${passengers.filter(p => p.ptc === 'INF').length !== 1 ? 's' : ''}`})
            </p>
          </div>
        </div>
      </div>

      {/* Passenger List */}
      <div className="p-6 space-y-4">
        {/* Adults (possibly with infants) */}
        {adultsWithInfants.map(({ adult, infant }, idx) => (
          <div key={adult.paxId}>
            <PassengerRow
              passenger={adult}
              passengerNumber={idx + 1}
              showServices={showServices}
              compact={compact}
            />
            {infant && (
              <div className="ml-8 mt-2 border-l-2 border-pink-200 pl-4">
                <InfantRow infant={infant} parentName={`${adult.givenName}`} />
              </div>
            )}
          </div>
        ))}

        {/* Children */}
        {children.map((child, idx) => (
          <PassengerRow
            key={child.paxId}
            passenger={child}
            passengerNumber={adultsWithInfants.length + idx + 1}
            showServices={showServices}
            compact={compact}
          />
        ))}

        {/* Standalone Infants (shouldn't happen normally) */}
        {standaloneInfants.map((infant) => (
          <PassengerRow
            key={infant.paxId}
            passenger={infant}
            passengerNumber={0}
            showServices={showServices}
            compact={compact}
          />
        ))}
      </div>
    </div>
  );
}

// Individual Passenger Row
interface PassengerRowProps {
  passenger: PassengerData;
  passengerNumber: number;
  showServices: boolean;
  compact: boolean;
}

function PassengerRow({ passenger, passengerNumber, showServices, compact }: PassengerRowProps) {
  const ptcConfig = {
    ADT: { label: 'Adult', icon: User, color: 'bg-blue-100 text-blue-700 border-blue-200' },
    CHD: { label: 'Child', icon: User, color: 'bg-purple-100 text-purple-700 border-purple-200' },
    INF: { label: 'Infant', icon: Baby, color: 'bg-pink-100 text-pink-700 border-pink-200' },
  };

  const config = ptcConfig[passenger.ptc];
  const IconComponent = config.icon;

  const fullName = [
    passenger.title,
    passenger.givenName,
    passenger.middleName,
    passenger.surname
  ].filter(Boolean).join(' ');

  return (
    <div className={cn(
      'bg-gray-50 rounded-xl border border-gray-100 overflow-hidden',
      compact ? 'p-4' : 'p-5'
    )}>
      {/* Header Row */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={cn(
            'p-2.5 rounded-xl',
            passenger.ptc === 'ADT' ? 'bg-blue-100' :
            passenger.ptc === 'CHD' ? 'bg-purple-100' : 'bg-pink-100'
          )}>
            <IconComponent className={cn(
              'w-5 h-5',
              passenger.ptc === 'ADT' ? 'text-blue-600' :
              passenger.ptc === 'CHD' ? 'text-purple-600' : 'text-pink-600'
            )} />
          </div>
          <div>
            <h4 className="text-lg font-bold text-gray-900">{fullName}</h4>
            <p className="text-sm text-gray-500">
              Passenger {passengerNumber}
            </p>
          </div>
        </div>

        <div className={cn(
          'px-3 py-1 rounded-full text-sm font-semibold border',
          config.color
        )}>
          {config.label}
        </div>
      </div>

      {/* Details Grid */}
      <div className={cn(
        'grid gap-4',
        compact ? 'grid-cols-2' : 'grid-cols-2 md:grid-cols-4'
      )}>
        {/* Birthdate */}
        <DetailItem
          icon={Calendar}
          label="Date of Birth"
          value={formatDate(passenger.birthdate)}
        />

        {/* Gender */}
        <DetailItem
          icon={User}
          label="Gender"
          value={passenger.gender === 'M' ? 'Male' : passenger.gender === 'F' ? 'Female' : 'Not Specified'}
        />

        {/* Email */}
        {passenger.email && (
          <DetailItem
            icon={Mail}
            label="Email"
            value={passenger.email}
          />
        )}

        {/* Phone */}
        {passenger.phone && (
          <DetailItem
            icon={Phone}
            label="Phone"
            value={passenger.phone}
          />
        )}
      </div>

      {/* Identity Document */}
      {passenger.identityDoc && !compact && (
        <div className="mt-4 pt-4 border-t border-gray-200">
          <IdentityDocSection doc={passenger.identityDoc} />
        </div>
      )}

      {/* Loyalty Program */}
      {passenger.loyalty && !compact && (
        <div className="mt-4 pt-4 border-t border-gray-200">
          <LoyaltySection loyalty={passenger.loyalty} />
        </div>
      )}

      {/* Services */}
      {showServices && passenger.services && passenger.services.length > 0 && (
        <div className="mt-4 pt-4 border-t border-gray-200">
          <ServicesSection services={passenger.services} />
        </div>
      )}
    </div>
  );
}

// Infant Row (simpler display)
interface InfantRowProps {
  infant: PassengerData;
  parentName: string;
}

function InfantRow({ infant, parentName }: InfantRowProps) {
  return (
    <div className="bg-pink-50 rounded-lg p-3 border border-pink-100">
      <div className="flex items-center gap-3">
        <Baby className="w-5 h-5 text-pink-500" />
        <div>
          <p className="font-semibold text-gray-900">
            {infant.givenName} {infant.surname}
          </p>
          <p className="text-xs text-gray-500">
            Infant traveling with {parentName} • Born {formatDate(infant.birthdate)}
          </p>
        </div>
      </div>
    </div>
  );
}

// Detail Item Component
interface DetailItemProps {
  icon: React.ElementType;
  label: string;
  value: string;
}

function DetailItem({ icon: Icon, label, value }: DetailItemProps) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="w-4 h-4 text-gray-400 mt-0.5" />
      <div>
        <p className="text-xs text-gray-500">{label}</p>
        <p className="text-sm font-medium text-gray-900">{value}</p>
      </div>
    </div>
  );
}

// Identity Document Section
interface IdentityDocSectionProps {
  doc: PassengerIdentityDoc;
}

function IdentityDocSection({ doc }: IdentityDocSectionProps) {
  const docTypes = {
    PP: 'Passport',
    NI: 'National ID',
    DL: 'Driver License',
  };

  return (
    <div>
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-2">
        <FileText className="w-4 h-4" />
        Travel Document
      </p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white rounded-lg p-2.5 border border-gray-200">
          <p className="text-xs text-gray-500">Type</p>
          <p className="text-sm font-semibold text-gray-900">{docTypes[doc.type]}</p>
        </div>
        <div className="bg-white rounded-lg p-2.5 border border-gray-200">
          <p className="text-xs text-gray-500">Number</p>
          <p className="text-sm font-mono font-semibold text-gray-900">{maskDocNumber(doc.number)}</p>
        </div>
        <div className="bg-white rounded-lg p-2.5 border border-gray-200">
          <p className="text-xs text-gray-500">Issuing Country</p>
          <p className="text-sm font-semibold text-gray-900">{doc.issuingCountry}</p>
        </div>
        <div className="bg-white rounded-lg p-2.5 border border-gray-200">
          <p className="text-xs text-gray-500">Expiry Date</p>
          <p className="text-sm font-semibold text-gray-900">{formatDate(doc.expiryDate)}</p>
        </div>
      </div>
    </div>
  );
}

// Loyalty Section
interface LoyaltySectionProps {
  loyalty: PassengerLoyalty;
}

function LoyaltySection({ loyalty }: LoyaltySectionProps) {
  return (
    <div>
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-2">
        <Award className="w-4 h-4" />
        Frequent Flyer
      </p>
      <div className="flex items-center gap-4 bg-gradient-to-r from-amber-50 to-orange-50 rounded-lg p-3 border border-amber-200">
        <Star className="w-8 h-8 text-amber-500" />
        <div>
          <p className="font-semibold text-gray-900">
            {loyalty.programOwner} {loyalty.programName || 'Frequent Flyer'}
          </p>
          <p className="text-sm text-gray-600">
            Member #{loyalty.accountNumber}
            {loyalty.tierLevel && (
              <span className="ml-2 px-2 py-0.5 bg-amber-200 text-amber-800 rounded text-xs font-semibold">
                {loyalty.tierLevel}
              </span>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}

// Services Section
interface ServicesSectionProps {
  services: PassengerService[];
}

function ServicesSection({ services }: ServicesSectionProps) {
  const serviceIcons = {
    seat: Armchair,
    baggage: Luggage,
    meal: Utensils,
    other: Shield,
  };

  const serviceColors = {
    seat: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    baggage: 'bg-orange-50 text-orange-700 border-orange-200',
    meal: 'bg-green-50 text-green-700 border-green-200',
    other: 'bg-gray-50 text-gray-700 border-gray-200',
  };

  // Group by segment
  const bySegment = services.reduce((acc, svc) => {
    const key = svc.segmentLabel || svc.segmentId || 'All Flights';
    if (!acc[key]) acc[key] = [];
    acc[key].push(svc);
    return acc;
  }, {} as Record<string, PassengerService[]>);

  return (
    <div>
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
        Booked Services
      </p>
      <div className="space-y-3">
        {Object.entries(bySegment).map(([segment, svcs]) => (
          <div key={segment}>
            <p className="text-xs text-gray-500 mb-2">{segment}</p>
            <div className="flex flex-wrap gap-2">
              {svcs.map((svc, idx) => {
                const Icon = serviceIcons[svc.type];
                return (
                  <div
                    key={idx}
                    className={cn(
                      'flex items-center gap-2 px-3 py-1.5 rounded-lg border',
                      serviceColors[svc.type]
                    )}
                  >
                    <Icon className="w-4 h-4" />
                    <span className="text-sm font-medium">{svc.description}</span>
                    {svc.price && svc.price.value > 0 && (
                      <span className="text-xs opacity-75">
                        ({svc.price.currency} {svc.price.value.toFixed(2)})
                      </span>
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

// Helper Functions
function formatDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

function maskDocNumber(num: string): string {
  if (num.length <= 4) return num;
  return '***' + num.slice(-4);
}
