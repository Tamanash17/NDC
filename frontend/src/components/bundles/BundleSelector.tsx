import { useState } from 'react';
import { cn } from '@/lib/cn';
import { formatCurrency } from '@/lib/format';
import { Card, Button, Badge } from '@/components/ui';
import { 
  Check, X, ChevronDown, ChevronUp, 
  Luggage, Utensils, Armchair, RefreshCw, 
  XCircle, Wifi, Coffee, Star
} from 'lucide-react';

export interface BundleInclusion {
  type: 'baggage' | 'meals' | 'seat' | 'changes' | 'cancellation' | 'priority' | 'wifi' | 'lounge';
  code: string;
  name: string;
  description: string;
  included: boolean;
  feeApplies?: boolean;
  value?: string;
}

export interface Bundle {
  bundleId: string;
  bundleCode: string;
  bundleName: string;
  tier: 1 | 2 | 3;
  price: number;
  currency: string;
  inclusions: BundleInclusion[];
  isRecommended?: boolean;
  isBestValue?: boolean;
}

export interface BundleSelectorProps {
  bundles: Bundle[];
  selectedBundleId?: string;
  onSelect: (bundleId: string) => void;
  passengerCount?: number;
  showComparison?: boolean;
  className?: string;
}

const inclusionIcons: Record<string, typeof Luggage> = {
  baggage: Luggage,
  meals: Utensils,
  seat: Armchair,
  changes: RefreshCw,
  cancellation: XCircle,
  wifi: Wifi,
  lounge: Coffee,
  priority: Star,
};

const tierStyles = {
  1: {
    name: 'Starter',
    bg: 'bg-white',
    border: 'border-neutral-200',
    selectedBorder: 'border-neutral-500',
    header: 'bg-neutral-100',
    accent: 'text-neutral-700',
  },
  2: {
    name: 'Plus',
    bg: 'bg-white',
    border: 'border-primary-200',
    selectedBorder: 'border-primary-500',
    header: 'bg-primary-50',
    accent: 'text-primary-600',
  },
  3: {
    name: 'Max',
    bg: 'bg-white',
    border: 'border-accent-200',
    selectedBorder: 'border-accent-500',
    header: 'bg-accent-50',
    accent: 'text-accent-600',
  },
};

export function BundleSelector({
  bundles,
  selectedBundleId,
  onSelect,
  passengerCount = 1,
  showComparison = true,
  className,
}: BundleSelectorProps) {
  const [expandedBundleId, setExpandedBundleId] = useState<string | null>(null);
  
  const sortedBundles = [...bundles].sort((a, b) => a.tier - b.tier);

  return (
    <div className={cn('space-y-4', className)}>
      {/* Bundle Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {sortedBundles.map((bundle) => {
          const isSelected = selectedBundleId === bundle.bundleId;
          const isExpanded = expandedBundleId === bundle.bundleId;
          const style = tierStyles[bundle.tier];
          
          return (
            <div
              key={bundle.bundleId}
              className={cn(
                'relative rounded-xl border-2 overflow-hidden transition-all duration-200',
                style.bg,
                isSelected ? style.selectedBorder : style.border,
                isSelected && 'shadow-lg ring-2 ring-offset-2',
                isSelected && bundle.tier === 1 && 'ring-neutral-500',
                isSelected && bundle.tier === 2 && 'ring-primary-500',
                isSelected && bundle.tier === 3 && 'ring-accent-500',
              )}
            >
              {/* Recommended/Best Value Badge */}
              {(bundle.isRecommended || bundle.isBestValue) && (
                <div className="absolute -top-px left-1/2 -translate-x-1/2">
                  <Badge 
                    variant={bundle.isRecommended ? 'primary' : 'secondary'}
                    className="rounded-t-none"
                  >
                    {bundle.isRecommended ? 'Recommended' : 'Best Value'}
                  </Badge>
                </div>
              )}
              
              {/* Header */}
              <div className={cn('p-4 text-center', style.header, (bundle.isRecommended || bundle.isBestValue) && 'pt-6')}>
                <h3 className={cn('text-lg font-bold', style.accent)}>
                  {bundle.bundleName}{bundle.bundleCode ? ` (${bundle.bundleCode})` : ''}
                </h3>
                <div className="mt-2">
                  <span className="text-3xl font-bold text-neutral-900">
                    {formatCurrency(bundle.price, bundle.currency)}
                  </span>
                  <span className="text-neutral-500 text-sm"> /person</span>
                </div>
                {passengerCount > 1 && (
                  <p className="text-sm text-neutral-500 mt-1">
                    Total: {formatCurrency(bundle.price * passengerCount, bundle.currency)}
                  </p>
                )}
              </div>
              
              {/* Inclusions Preview */}
              <div className="p-4 space-y-2">
                {bundle.inclusions.slice(0, 4).map((inclusion) => {
                  const Icon = inclusionIcons[inclusion.type] || Check;
                  return (
                    <div 
                      key={inclusion.code}
                      className={cn(
                        'flex items-center gap-2 text-sm',
                        inclusion.included ? 'text-neutral-700' : 'text-neutral-400'
                      )}
                    >
                      {inclusion.included ? (
                        <Check className="w-4 h-4 text-green-500 flex-shrink-0" />
                      ) : (
                        <X className="w-4 h-4 text-neutral-300 flex-shrink-0" />
                      )}
                      <Icon className="w-4 h-4 flex-shrink-0" />
                      <span className="truncate">{inclusion.name}</span>
                      {inclusion.feeApplies && (
                        <span className="text-xs text-neutral-400">(fee)</span>
                      )}
                    </div>
                  );
                })}
                
                {bundle.inclusions.length > 4 && (
                  <button
                    onClick={() => setExpandedBundleId(isExpanded ? null : bundle.bundleId)}
                    className="flex items-center gap-1 text-sm text-primary-600 hover:underline"
                  >
                    {isExpanded ? (
                      <>Show less <ChevronUp className="w-4 h-4" /></>
                    ) : (
                      <>+{bundle.inclusions.length - 4} more <ChevronDown className="w-4 h-4" /></>
                    )}
                  </button>
                )}
                
                {/* Expanded Inclusions */}
                {isExpanded && bundle.inclusions.slice(4).map((inclusion) => {
                  const Icon = inclusionIcons[inclusion.type] || Check;
                  return (
                    <div 
                      key={inclusion.code}
                      className={cn(
                        'flex items-center gap-2 text-sm',
                        inclusion.included ? 'text-neutral-700' : 'text-neutral-400'
                      )}
                    >
                      {inclusion.included ? (
                        <Check className="w-4 h-4 text-green-500 flex-shrink-0" />
                      ) : (
                        <X className="w-4 h-4 text-neutral-300 flex-shrink-0" />
                      )}
                      <Icon className="w-4 h-4 flex-shrink-0" />
                      <span>{inclusion.name}</span>
                    </div>
                  );
                })}
              </div>
              
              {/* Select Button */}
              <div className="p-4 pt-0">
                <Button
                  variant={isSelected ? 'primary' : 'outline'}
                  className="w-full"
                  onClick={() => onSelect(bundle.bundleId)}
                >
                  {isSelected ? 'Selected' : 'Select'}
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
