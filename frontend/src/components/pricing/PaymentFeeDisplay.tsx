import { cn } from '@/lib/cn';
import { formatCurrency } from '@/lib/format';
import { Card, Badge } from '@/components/ui';
import { CreditCard, AlertCircle, CheckCircle } from 'lucide-react';

export interface PaymentFee {
  paymentType: string;
  paymentCode: string;
  feeType: 'fixed' | 'percentage' | 'none';
  feeAmount?: number;
  feePercentage?: number;
  calculatedFee: number;
  totalWithFee: number;
  currency: string;
  isLowestFee?: boolean;
}

export interface PaymentFeeDisplayProps {
  baseAmount: number;
  currency: string;
  paymentFees: PaymentFee[];
  selectedPaymentCode?: string;
  onSelectPayment?: (paymentCode: string) => void;
  className?: string;
}

export function PaymentFeeDisplay({
  baseAmount,
  currency,
  paymentFees,
  selectedPaymentCode,
  onSelectPayment,
  className,
}: PaymentFeeDisplayProps) {
  // Find lowest fee option
  const lowestFee = Math.min(...paymentFees.map(p => p.calculatedFee));
  const feesWithLowest = paymentFees.map(fee => ({
    ...fee,
    isLowestFee: fee.calculatedFee === lowestFee,
  }));

  return (
    <Card className={cn('p-4', className)}>
      <h3 className="font-semibold text-neutral-900 mb-3 flex items-center gap-2">
        <CreditCard className="w-5 h-5" />
        Payment Options
      </h3>
      
      <div className="space-y-2">
        {feesWithLowest.map((fee) => {
          const isSelected = selectedPaymentCode === fee.paymentCode;
          
          return (
            <button
              key={fee.paymentCode}
              onClick={() => onSelectPayment?.(fee.paymentCode)}
              className={cn(
                'w-full flex items-center justify-between p-3 rounded-lg border-2 transition-all',
                isSelected 
                  ? 'border-primary-500 bg-primary-50' 
                  : 'border-neutral-200 bg-white hover:border-neutral-300',
                onSelectPayment && 'cursor-pointer'
              )}
            >
              <div className="flex items-center gap-3">
                <div className={cn(
                  'w-10 h-6 rounded flex items-center justify-center text-xs font-bold',
                  fee.paymentCode === 'VI' && 'bg-blue-600 text-white',
                  fee.paymentCode === 'MC' && 'bg-red-500 text-white',
                  fee.paymentCode === 'AX' && 'bg-blue-400 text-white',
                  !['VI', 'MC', 'AX'].includes(fee.paymentCode) && 'bg-neutral-200 text-neutral-700'
                )}>
                  {fee.paymentCode}
                </div>
                <div className="text-left">
                  <p className="font-medium text-neutral-900">{fee.paymentType}</p>
                  <p className="text-xs text-neutral-500">
                    {fee.feeType === 'none' && 'No fee'}
                    {fee.feeType === 'fixed' && `${formatCurrency(fee.feeAmount || 0, currency)} fee`}
                    {fee.feeType === 'percentage' && `${fee.feePercentage}% fee`}
                  </p>
                </div>
              </div>
              
              <div className="text-right flex items-center gap-2">
                {fee.isLowestFee && fee.feeType !== 'none' && (
                  <Badge variant="success" size="sm">Lowest</Badge>
                )}
                <div>
                  {fee.calculatedFee > 0 && (
                    <p className="text-xs text-neutral-500">
                      +{formatCurrency(fee.calculatedFee, currency)}
                    </p>
                  )}
                  <p className="font-bold text-neutral-900">
                    {formatCurrency(fee.totalWithFee, currency)}
                  </p>
                </div>
                {isSelected && (
                  <CheckCircle className="w-5 h-5 text-primary-500" />
                )}
              </div>
            </button>
          );
        })}
      </div>
      
      {/* Fee Notice */}
      <div className="mt-3 flex items-start gap-2 text-xs text-neutral-500">
        <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
        <p>
          Payment fees are charged by the card issuer and vary by payment method.
          Select your preferred payment option above.
        </p>
      </div>
    </Card>
  );
}
