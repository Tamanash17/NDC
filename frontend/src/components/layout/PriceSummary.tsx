import { useState } from 'react';
import { cn } from '@/lib/cn';
import { formatCurrency } from '@/lib/format';
import { Card } from '@/components/ui';
import { 
  ChevronDown, 
  ChevronUp, 
  Plane, 
  Package, 
  Luggage, 
  Armchair,
  CreditCard,
  Tag
} from 'lucide-react';
import type { PriceBreakdown } from '@/core/types';

export interface PriceSummaryProps {
  breakdown: PriceBreakdown;
  passengerCount: number;
  onContinue?: () => void;
  continueLabel?: string;
  continueDisabled?: boolean;
  showDetails?: boolean;
}

export function PriceSummary({
  breakdown,
  passengerCount,
  onContinue,
  continueLabel = 'Continue',
  continueDisabled = false,
  showDetails = true,
}: PriceSummaryProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const bundleTotal = breakdown.bundles.reduce((sum, b) => sum + b.price, 0);
  const ancillaryTotal = breakdown.ancillaries.reduce((sum, a) => sum + a.price, 0);
  const seatTotal = breakdown.seats.reduce((sum, s) => sum + s.price, 0);
  const discountTotal = breakdown.discounts.reduce((sum, d) => sum + d.amount, 0);
  const paymentFee = breakdown.paymentSurcharge?.amount || 0;

  return (
    <Card className="sticky top-20" padding="none">
      {/* Header */}
      <div className="p-4 border-b border-neutral-100">
        <h3 className="font-semibold text-neutral-900">Price Summary</h3>
        <p className="text-sm text-neutral-500">
          {passengerCount} passenger{passengerCount !== 1 ? 's' : ''}
        </p>
      </div>

      {/* Breakdown */}
      <div className="p-4 space-y-3">
        {/* Flights */}
        {breakdown.flights.total > 0 && (
          <SummaryRow
            icon={<Plane className="h-4 w-4" />}
            label="Flights"
            amount={breakdown.flights.total}
            currency={breakdown.currency}
          />
        )}

        {/* Bundles */}
        {bundleTotal > 0 && (
          <SummaryRow
            icon={<Package className="h-4 w-4" />}
            label="Bundles"
            amount={bundleTotal}
            currency={breakdown.currency}
          />
        )}

        {/* Extras */}
        {ancillaryTotal > 0 && (
          <SummaryRow
            icon={<Luggage className="h-4 w-4" />}
            label="Extras"
            amount={ancillaryTotal}
            currency={breakdown.currency}
          />
        )}

        {/* Seats */}
        {seatTotal > 0 && (
          <SummaryRow
            icon={<Armchair className="h-4 w-4" />}
            label="Seats"
            amount={seatTotal}
            currency={breakdown.currency}
          />
        )}

        {/* Expandable details */}
        {showDetails && (
          <>
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="flex items-center justify-between w-full text-sm text-primary-600 hover:text-primary-700 py-1"
            >
              <span>View details</span>
              {isExpanded ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </button>

            {isExpanded && (
              <div className="pt-2 space-y-2 text-sm border-t border-neutral-100">
                {/* Taxes */}
                {breakdown.taxes.map((tax) => (
                  <div key={tax.taxCode} className="flex justify-between text-neutral-600">
                    <span>{tax.taxName}</span>
                    <span>{formatCurrency(tax.amount, breakdown.currency)}</span>
                  </div>
                ))}
                
                {/* Fees */}
                {breakdown.fees.map((fee) => (
                  <div key={fee.feeCode} className="flex justify-between text-neutral-600">
                    <span>{fee.feeName}</span>
                    <span>{formatCurrency(fee.amount, breakdown.currency)}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* Discounts */}
        {discountTotal > 0 && (
          <div className="pt-2 border-t border-neutral-100">
            <SummaryRow
              icon={<Tag className="h-4 w-4" />}
              label="Discounts"
              amount={-discountTotal}
              currency={breakdown.currency}
              variant="discount"
            />
          </div>
        )}

        {/* Payment fee */}
        {paymentFee > 0 && (
          <SummaryRow
            icon={<CreditCard className="h-4 w-4" />}
            label={`Card Fee (${breakdown.paymentSurcharge?.cardType})`}
            amount={paymentFee}
            currency={breakdown.currency}
          />
        )}
      </div>

      {/* Total */}
      <div className="p-4 bg-neutral-50 border-t border-neutral-200">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-sm text-neutral-500">Total</p>
            <p className="text-2xl font-bold text-neutral-900">
              {formatCurrency(breakdown.grandTotal, breakdown.currency)}
            </p>
          </div>
          <p className="text-sm text-neutral-500">
            {formatCurrency(breakdown.grandTotal / passengerCount, breakdown.currency)}/person
          </p>
        </div>
      </div>

      {/* Continue button */}
      {onContinue && (
        <div className="p-4 border-t border-neutral-200">
          <button
            onClick={onContinue}
            disabled={continueDisabled}
            className={cn(
              'w-full py-3 px-4 rounded-lg font-medium text-white transition-colors',
              continueDisabled
                ? 'bg-neutral-300 cursor-not-allowed'
                : 'bg-primary-500 hover:bg-primary-600'
            )}
          >
            {continueLabel}
          </button>
        </div>
      )}
    </Card>
  );
}

// ============================================================================
// SUMMARY ROW
// ============================================================================

interface SummaryRowProps {
  icon: React.ReactNode;
  label: string;
  amount: number;
  currency: string;
  variant?: 'default' | 'discount';
}

function SummaryRow({ icon, label, amount, currency, variant = 'default' }: SummaryRowProps) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span className={cn(
          variant === 'discount' ? 'text-success-500' : 'text-neutral-400'
        )}>
          {icon}
        </span>
        <span className="text-sm text-neutral-700">{label}</span>
      </div>
      <span className={cn(
        'text-sm font-medium',
        variant === 'discount' ? 'text-success-600' : 'text-neutral-900'
      )}>
        {variant === 'discount' && '-'}
        {formatCurrency(Math.abs(amount), currency)}
      </span>
    </div>
  );
}
