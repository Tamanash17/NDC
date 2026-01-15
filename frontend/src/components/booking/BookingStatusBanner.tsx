// ============================================================================
// BOOKING STATUS BANNER - Visual Status Display
// Shows overall booking health with animated indicators
// ============================================================================

import { cn } from '@/lib/cn';
import {
  CheckCircle, Clock, AlertCircle, XCircle, CreditCard, Plane,
  Ticket, Info, ChevronRight, Timer
} from 'lucide-react';

export type OverallHealth = 'success' | 'warning' | 'error' | 'info';

export interface BookingStatusBannerProps {
  health: OverallHealth;
  headline: string;
  subheadline: string;
  actionRequired?: string;
  urgentDeadline?: {
    type: 'payment' | 'ticketing' | 'check-in';
    datetime: string;
    message: string;
  };
  paymentStatus?: {
    code: string;
    label: string;
  };
  orderStatus?: {
    code: string;
    label: string;
  };
  deliveryStatus?: {
    code: string;
    label: string;
  };
  pnr: string;
  onActionClick?: () => void;
}

const healthConfig = {
  success: {
    bg: 'from-emerald-500 to-emerald-600',
    accent: 'bg-emerald-400/20',
    icon: CheckCircle,
    pulse: false,
  },
  warning: {
    bg: 'from-amber-500 to-orange-500',
    accent: 'bg-amber-400/20',
    icon: Clock,
    pulse: true,
  },
  error: {
    bg: 'from-red-500 to-red-600',
    accent: 'bg-red-400/20',
    icon: XCircle,
    pulse: true,
  },
  info: {
    bg: 'from-blue-500 to-blue-600',
    accent: 'bg-blue-400/20',
    icon: Info,
    pulse: false,
  },
};

const statusIcons = {
  payment: CreditCard,
  order: Ticket,
  delivery: Plane,
};

export function BookingStatusBanner({
  health,
  headline,
  subheadline,
  actionRequired,
  urgentDeadline,
  paymentStatus,
  orderStatus,
  deliveryStatus,
  pnr,
  onActionClick,
}: BookingStatusBannerProps) {
  const config = healthConfig[health];
  const IconComponent = config.icon;

  return (
    <div className={cn(
      'relative overflow-hidden rounded-2xl shadow-xl',
      'bg-gradient-to-r',
      config.bg
    )}>
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-10">
        <svg className="absolute right-0 top-0 h-full w-1/2" viewBox="0 0 400 400">
          <circle cx="300" cy="100" r="200" fill="white" opacity="0.1" />
          <circle cx="350" cy="300" r="150" fill="white" opacity="0.05" />
        </svg>
      </div>

      <div className="relative px-6 py-8 md:px-8">
        {/* Top Section: PNR and Status Pills */}
        <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
          {/* PNR Display */}
          <div>
            <p className="text-white/70 text-sm font-medium mb-1">Booking Reference</p>
            <p className="text-4xl md:text-5xl font-bold text-white font-mono tracking-widest">
              {pnr}
            </p>
          </div>

          {/* Status Pills */}
          <div className="flex flex-wrap gap-2">
            {paymentStatus && (
              <StatusPill
                icon={statusIcons.payment}
                label="Payment"
                value={paymentStatus.label}
                health={paymentStatus.code === 'SUCCESSFUL' ? 'success' :
                       paymentStatus.code === 'FAILED' ? 'error' : 'warning'}
              />
            )}
            {orderStatus && (
              <StatusPill
                icon={statusIcons.order}
                label="Order"
                value={orderStatus.label}
                health={orderStatus.code === 'TICKETED' || orderStatus.code === 'CONFIRMED' ? 'success' :
                       orderStatus.code === 'CANCELLED' ? 'error' : 'info'}
              />
            )}
            {deliveryStatus && (
              <StatusPill
                icon={statusIcons.delivery}
                label="Tickets"
                value={deliveryStatus.label}
                health={deliveryStatus.code === 'CONFIRMED' || deliveryStatus.code === 'DELIVERED' ? 'success' : 'info'}
              />
            )}
          </div>
        </div>

        {/* Main Status Message */}
        <div className="flex items-start gap-4">
          <div className={cn(
            'flex-shrink-0 p-3 rounded-xl',
            config.accent,
            config.pulse && 'animate-pulse'
          )}>
            <IconComponent className="w-8 h-8 text-white" />
          </div>

          <div className="flex-1 min-w-0">
            <h2 className="text-2xl md:text-3xl font-bold text-white mb-1">
              {headline}
            </h2>
            <p className="text-white/80 text-lg">
              {subheadline}
            </p>
          </div>
        </div>

        {/* Urgent Deadline Alert */}
        {urgentDeadline && (
          <div className="mt-6 flex items-center gap-3 bg-white/10 backdrop-blur-sm rounded-xl px-4 py-3 border border-white/20">
            <Timer className="w-5 h-5 text-white animate-pulse" />
            <span className="text-white font-semibold">{urgentDeadline.message}</span>
          </div>
        )}

        {/* Action Required */}
        {actionRequired && (
          <button
            onClick={onActionClick}
            className={cn(
              'mt-6 w-full md:w-auto',
              'flex items-center justify-center gap-2',
              'bg-white text-gray-900 font-semibold',
              'px-6 py-3 rounded-xl',
              'hover:bg-white/90 transition-colors',
              'shadow-lg'
            )}
          >
            {actionRequired}
            <ChevronRight className="w-5 h-5" />
          </button>
        )}
      </div>
    </div>
  );
}

// Status Pill Component
interface StatusPillProps {
  icon: React.ElementType;
  label: string;
  value: string;
  health: 'success' | 'warning' | 'error' | 'info';
}

function StatusPill({ icon: Icon, label, value, health }: StatusPillProps) {
  const pillColors = {
    success: 'bg-emerald-400/20 border-emerald-300/30',
    warning: 'bg-amber-400/20 border-amber-300/30',
    error: 'bg-red-400/20 border-red-300/30',
    info: 'bg-white/10 border-white/20',
  };

  return (
    <div className={cn(
      'flex items-center gap-2 px-3 py-2 rounded-full border backdrop-blur-sm',
      pillColors[health]
    )}>
      <Icon className="w-4 h-4 text-white/80" />
      <div className="text-sm">
        <span className="text-white/60">{label}:</span>
        <span className="text-white font-semibold ml-1">{value}</span>
      </div>
    </div>
  );
}
