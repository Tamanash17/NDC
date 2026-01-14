import { cn } from '@/lib/cn';
import { formatCurrency } from '@/lib/format';
import { Card } from '@/components/ui';
import { TrendingUp, TrendingDown, Minus, AlertCircle } from 'lucide-react';

export interface PriceSnapshot {
  label: string;
  amount: number;
  currency: string;
  timestamp?: Date;
  breakdown?: {
    base: number;
    taxes: number;
    fees: number;
    services?: number;
    seats?: number;
  };
}

export interface PriceComparisonPanelProps {
  snapshots: PriceSnapshot[];
  currentIndex?: number;
  showBreakdown?: boolean;
  className?: string;
}

export function PriceComparisonPanel({
  snapshots,
  currentIndex,
  showBreakdown = false,
  className,
}: PriceComparisonPanelProps) {
  if (snapshots.length === 0) return null;

  const current = currentIndex !== undefined ? snapshots[currentIndex] : snapshots[snapshots.length - 1];
  const previous = currentIndex !== undefined && currentIndex > 0 
    ? snapshots[currentIndex - 1] 
    : snapshots.length > 1 ? snapshots[snapshots.length - 2] : null;

  const difference = previous ? current.amount - previous.amount : 0;
  const percentChange = previous ? ((difference / previous.amount) * 100) : 0;

  return (
    <Card className={cn('p-4', className)}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-neutral-500">{current.label}</p>
          <p className="text-2xl font-bold text-neutral-900 mt-1">
            {formatCurrency(current.amount, current.currency)}
          </p>
        </div>
        
        {previous && difference !== 0 && (
          <div className={cn(
            'flex items-center gap-1 px-2 py-1 rounded-full text-sm font-medium',
            difference > 0 ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
          )}>
            {difference > 0 ? (
              <TrendingUp className="w-4 h-4" />
            ) : (
              <TrendingDown className="w-4 h-4" />
            )}
            {difference > 0 ? '+' : ''}{formatCurrency(difference, current.currency)}
            <span className="text-xs">({percentChange.toFixed(1)}%)</span>
          </div>
        )}
      </div>

      {/* Price Progression */}
      {snapshots.length > 1 && (
        <div className="mt-4">
          <div className="flex items-center gap-2 overflow-x-auto pb-2">
            {snapshots.map((snapshot, index) => {
              const isActive = currentIndex !== undefined 
                ? index === currentIndex 
                : index === snapshots.length - 1;
              const prevSnapshot = index > 0 ? snapshots[index - 1] : null;
              const diff = prevSnapshot ? snapshot.amount - prevSnapshot.amount : 0;
              
              return (
                <div 
                  key={index}
                  className={cn(
                    'flex-shrink-0 p-2 rounded-lg border text-center min-w-[100px]',
                    isActive 
                      ? 'border-primary-500 bg-primary-50' 
                      : 'border-neutral-200 bg-white'
                  )}
                >
                  <p className="text-xs text-neutral-500 truncate">{snapshot.label}</p>
                  <p className={cn(
                    'text-sm font-semibold',
                    isActive ? 'text-primary-700' : 'text-neutral-700'
                  )}>
                    {formatCurrency(snapshot.amount, snapshot.currency)}
                  </p>
                  {diff !== 0 && (
                    <p className={cn(
                      'text-xs',
                      diff > 0 ? 'text-red-600' : 'text-green-600'
                    )}>
                      {diff > 0 ? '+' : ''}{formatCurrency(diff, snapshot.currency)}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Breakdown */}
      {showBreakdown && current.breakdown && (
        <div className="mt-4 pt-4 border-t border-neutral-200 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-neutral-600">Base fare</span>
            <span className="font-medium">{formatCurrency(current.breakdown.base, current.currency)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-neutral-600">Taxes</span>
            <span className="font-medium">{formatCurrency(current.breakdown.taxes, current.currency)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-neutral-600">Fees</span>
            <span className="font-medium">{formatCurrency(current.breakdown.fees, current.currency)}</span>
          </div>
          {current.breakdown.services !== undefined && current.breakdown.services > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-neutral-600">Services</span>
              <span className="font-medium">{formatCurrency(current.breakdown.services, current.currency)}</span>
            </div>
          )}
          {current.breakdown.seats !== undefined && current.breakdown.seats > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-neutral-600">Seats</span>
              <span className="font-medium">{formatCurrency(current.breakdown.seats, current.currency)}</span>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
