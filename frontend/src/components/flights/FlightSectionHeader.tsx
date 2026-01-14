/**
 * FlightSectionHeader - Premium section header showing direction (OUTBOUND/RETURN)
 *
 * Displays:
 * - Direction badge with gradient background
 * - Route with animated plane icon
 * - Date
 * - Status (Selected / Pending)
 */

import { cn } from '@/lib/cn';
import { Plane, Check, Clock } from 'lucide-react';

export interface FlightSectionHeaderProps {
  direction: 'outbound' | 'return';
  origin: string;
  destination: string;
  date: string;
  isComplete: boolean;
  selectedFlightInfo?: string; // e.g., "JQ 500 Starter"
  className?: string;
}

export function FlightSectionHeader({
  direction,
  origin,
  destination,
  date,
  isComplete,
  selectedFlightInfo,
  className,
}: FlightSectionHeaderProps) {
  const isOutbound = direction === 'outbound';

  return (
    <div className={cn(
      'relative overflow-hidden',
      className
    )}>
      {/* Gradient Background */}
      <div className={cn(
        'absolute inset-0',
        isOutbound
          ? 'bg-gradient-to-r from-orange-600 via-orange-500 to-amber-500'
          : 'bg-gradient-to-r from-blue-600 via-blue-500 to-cyan-500'
      )} />

      {/* Decorative Pattern */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute top-0 right-0 w-64 h-64 transform translate-x-32 -translate-y-32">
          <div className="w-full h-full rounded-full border-[40px] border-white/20" />
        </div>
        <div className="absolute bottom-0 left-0 w-48 h-48 transform -translate-x-24 translate-y-24">
          <div className="w-full h-full rounded-full border-[30px] border-white/10" />
        </div>
      </div>

      {/* Content */}
      <div className="relative flex items-center justify-between px-5 py-4">
        {/* Left side: Direction + Route */}
        <div className="flex items-center gap-5">
          {/* Direction Badge */}
          <div className={cn(
            'px-4 py-1.5 rounded-full font-bold text-xs uppercase tracking-widest',
            'bg-white text-neutral-800 shadow-lg'
          )}>
            {isOutbound ? 'Outbound' : 'Return'}
          </div>

          {/* Route Display */}
          <div className="flex items-center gap-3">
            {/* Origin */}
            <div className="text-white">
              <span className="font-bold text-2xl tracking-tight">{origin}</span>
            </div>

            {/* Animated Flight Path */}
            <div className="flex items-center gap-1 px-3">
              <div className="w-8 h-px bg-white/40" />
              <Plane className={cn(
                'w-5 h-5 text-white',
                !isOutbound && 'rotate-180'
              )} />
              <div className="w-8 h-px bg-white/40" />
            </div>

            {/* Destination */}
            <div className="text-white">
              <span className="font-bold text-2xl tracking-tight">{destination}</span>
            </div>
          </div>

          {/* Date Pill */}
          <div className="px-3 py-1 rounded-full bg-white/20 backdrop-blur-sm">
            <span className="text-white text-sm font-medium">
              {date}
            </span>
          </div>
        </div>

        {/* Right side: Status */}
        <div className="flex items-center">
          {isComplete ? (
            <div className="flex items-center gap-2 px-4 py-2 bg-emerald-500 rounded-full text-white text-sm font-semibold shadow-lg">
              <Check className="w-4 h-4" />
              <span>{selectedFlightInfo || 'Selected'}</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 px-4 py-2 bg-white/20 backdrop-blur-sm rounded-full text-white text-sm font-medium">
              <Clock className="w-4 h-4 animate-pulse" />
              <span>Pending Selection</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
