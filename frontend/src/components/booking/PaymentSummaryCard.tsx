// ============================================================================
// PAYMENT SUMMARY CARD - Visual Payment and Price Breakdown Display
// Shows payment status, method, and detailed price breakdown
// ============================================================================

import { cn } from '@/lib/cn';
import {
  CreditCard, CheckCircle, Clock, XCircle, AlertCircle,
  Receipt, ChevronDown, ChevronUp, Wallet, Building2, Banknote
} from 'lucide-react';
import { useState } from 'react';

export type PaymentStatus = 'SUCCESSFUL' | 'PENDING' | 'FAILED' | 'REFUNDED' | 'PARTIAL' | 'UNKNOWN';

export interface PaymentMethod {
  type: 'CC' | 'AGT' | 'CA' | 'OTHER';
  cardBrand?: string;
  cardLastFour?: string;
  cardHolderName?: string;
  agencyName?: string;
}

export interface PriceBreakdownItem {
  label: string;
  type: 'base' | 'tax' | 'fee' | 'discount' | 'surcharge' | 'service';
  amount: number;
  currency: string;
  description?: string;
  code?: string;
  perPassenger?: boolean;
  passengerCount?: number;
}

export interface PaymentTransaction {
  transactionId?: string;
  status: PaymentStatus;
  amount: { value: number; currency: string };
  timestamp?: string;
  method?: PaymentMethod;
}

export interface PaymentSummaryCardProps {
  paymentStatus: PaymentStatus;
  paymentMethod?: PaymentMethod;
  transactions?: PaymentTransaction[];
  totalAmount: { value: number; currency: string };
  breakdown?: PriceBreakdownItem[];
  amountPaid?: { value: number; currency: string };
  amountDue?: { value: number; currency: string };
  refundAmount?: { value: number; currency: string };
  showBreakdown?: boolean;
}

export function PaymentSummaryCard({
  paymentStatus,
  paymentMethod,
  transactions,
  totalAmount,
  breakdown,
  amountPaid,
  amountDue,
  refundAmount,
  showBreakdown = true,
}: PaymentSummaryCardProps) {
  const [isBreakdownExpanded, setIsBreakdownExpanded] = useState(false);

  const statusConfig = getStatusConfig(paymentStatus);

  return (
    <div className="bg-white rounded-2xl shadow-lg overflow-hidden border border-gray-100">
      {/* Header with Payment Status */}
      <div className={cn(
        'px-6 py-5',
        statusConfig.gradient
      )}>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className={cn(
              'p-3 rounded-xl',
              statusConfig.iconBg
            )}>
              <statusConfig.icon className={cn('w-7 h-7', statusConfig.iconColor)} />
            </div>
            <div>
              <h3 className={cn('text-xl font-bold', statusConfig.textColor)}>
                {statusConfig.title}
              </h3>
              <p className={cn('text-sm', statusConfig.subtextColor)}>
                {statusConfig.description}
              </p>
            </div>
          </div>

          {/* Total Amount */}
          <div className="text-right">
            <p className={cn('text-sm', statusConfig.subtextColor)}>Total</p>
            <p className={cn('text-3xl font-bold', statusConfig.textColor)}>
              {formatCurrency(totalAmount.value, totalAmount.currency)}
            </p>
          </div>
        </div>

        {/* Payment Method */}
        {paymentMethod && (
          <div className="mt-4 pt-4 border-t border-white/20">
            <PaymentMethodDisplay method={paymentMethod} light />
          </div>
        )}
      </div>

      {/* Payment Details */}
      <div className="p-6">
        {/* Amount Summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <AmountCard
            label="Total Fare"
            amount={totalAmount}
            variant="neutral"
          />
          {amountPaid && (
            <AmountCard
              label="Amount Paid"
              amount={amountPaid}
              variant="success"
            />
          )}
          {amountDue && amountDue.value > 0 && (
            <AmountCard
              label="Amount Due"
              amount={amountDue}
              variant="warning"
            />
          )}
          {refundAmount && refundAmount.value > 0 && (
            <AmountCard
              label="Refund Amount"
              amount={refundAmount}
              variant="info"
            />
          )}
        </div>

        {/* Price Breakdown */}
        {showBreakdown && breakdown && breakdown.length > 0 && (
          <div className="border-t border-gray-100 pt-4">
            <button
              onClick={() => setIsBreakdownExpanded(!isBreakdownExpanded)}
              className="w-full flex items-center justify-between py-2 text-gray-700 hover:text-gray-900 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Receipt className="w-5 h-5" />
                <span className="font-semibold">Price Breakdown</span>
              </div>
              {isBreakdownExpanded ? (
                <ChevronUp className="w-5 h-5" />
              ) : (
                <ChevronDown className="w-5 h-5" />
              )}
            </button>

            {isBreakdownExpanded && (
              <div className="mt-4 space-y-2">
                <PriceBreakdown items={breakdown} />
              </div>
            )}
          </div>
        )}

        {/* Transaction History */}
        {transactions && transactions.length > 0 && (
          <div className="border-t border-gray-100 pt-4 mt-4">
            <h4 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Transaction History
            </h4>
            <div className="space-y-2">
              {transactions.map((tx, idx) => (
                <TransactionRow key={idx} transaction={tx} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Status Configuration
function getStatusConfig(status: PaymentStatus) {
  const configs = {
    SUCCESSFUL: {
      gradient: 'bg-gradient-to-r from-emerald-500 to-emerald-600',
      icon: CheckCircle,
      iconBg: 'bg-white/20',
      iconColor: 'text-white',
      textColor: 'text-white',
      subtextColor: 'text-white/80',
      title: 'Payment Successful',
      description: 'Your payment has been confirmed',
    },
    PENDING: {
      gradient: 'bg-gradient-to-r from-amber-400 to-orange-500',
      icon: Clock,
      iconBg: 'bg-white/20',
      iconColor: 'text-white',
      textColor: 'text-white',
      subtextColor: 'text-white/80',
      title: 'Payment Pending',
      description: 'Awaiting payment confirmation',
    },
    FAILED: {
      gradient: 'bg-gradient-to-r from-red-500 to-red-600',
      icon: XCircle,
      iconBg: 'bg-white/20',
      iconColor: 'text-white',
      textColor: 'text-white',
      subtextColor: 'text-white/80',
      title: 'Payment Failed',
      description: 'Your payment could not be processed',
    },
    REFUNDED: {
      gradient: 'bg-gradient-to-r from-blue-500 to-blue-600',
      icon: CreditCard,
      iconBg: 'bg-white/20',
      iconColor: 'text-white',
      textColor: 'text-white',
      subtextColor: 'text-white/80',
      title: 'Payment Refunded',
      description: 'Your refund has been processed',
    },
    PARTIAL: {
      gradient: 'bg-gradient-to-r from-orange-400 to-orange-500',
      icon: AlertCircle,
      iconBg: 'bg-white/20',
      iconColor: 'text-white',
      textColor: 'text-white',
      subtextColor: 'text-white/80',
      title: 'Partial Payment',
      description: 'Additional payment required',
    },
    UNKNOWN: {
      gradient: 'bg-gradient-to-r from-gray-400 to-gray-500',
      icon: CreditCard,
      iconBg: 'bg-white/20',
      iconColor: 'text-white',
      textColor: 'text-white',
      subtextColor: 'text-white/80',
      title: 'Payment Status Unknown',
      description: 'Unable to determine payment status',
    },
  };

  return configs[status] || configs.UNKNOWN;
}

// Payment Method Display
interface PaymentMethodDisplayProps {
  method: PaymentMethod;
  light?: boolean;
}

function PaymentMethodDisplay({ method, light }: PaymentMethodDisplayProps) {
  const methodIcons = {
    CC: CreditCard,
    AGT: Building2,
    CA: Banknote,
    OTHER: Wallet,
  };

  const cardBrandLogos: Record<string, string> = {
    VI: 'Visa',
    MC: 'Mastercard',
    AX: 'Amex',
    DC: 'Diners Club',
    JC: 'JCB',
    UP: 'UnionPay',
  };

  const Icon = methodIcons[method.type] || Wallet;

  return (
    <div className="flex items-center gap-3">
      <Icon className={cn('w-5 h-5', light ? 'text-white/80' : 'text-gray-500')} />
      <div>
        {method.type === 'CC' && method.cardBrand && (
          <p className={cn('font-medium', light ? 'text-white' : 'text-gray-900')}>
            {cardBrandLogos[method.cardBrand] || method.cardBrand}
            {method.cardLastFour && ` •••• ${method.cardLastFour}`}
          </p>
        )}
        {method.type === 'AGT' && (
          <p className={cn('font-medium', light ? 'text-white' : 'text-gray-900')}>
            Agency Payment {method.agencyName && `(${method.agencyName})`}
          </p>
        )}
        {method.type === 'CA' && (
          <p className={cn('font-medium', light ? 'text-white' : 'text-gray-900')}>
            Cash Payment
          </p>
        )}
        {method.cardHolderName && (
          <p className={cn('text-sm', light ? 'text-white/70' : 'text-gray-500')}>
            {method.cardHolderName}
          </p>
        )}
      </div>
    </div>
  );
}

// Amount Card Component
interface AmountCardProps {
  label: string;
  amount: { value: number; currency: string };
  variant: 'neutral' | 'success' | 'warning' | 'info';
}

function AmountCard({ label, amount, variant }: AmountCardProps) {
  const variants = {
    neutral: 'bg-gray-50 border-gray-200',
    success: 'bg-emerald-50 border-emerald-200',
    warning: 'bg-amber-50 border-amber-200',
    info: 'bg-blue-50 border-blue-200',
  };

  const textColors = {
    neutral: 'text-gray-900',
    success: 'text-emerald-700',
    warning: 'text-amber-700',
    info: 'text-blue-700',
  };

  return (
    <div className={cn('rounded-xl p-4 border', variants[variant])}>
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className={cn('text-xl font-bold', textColors[variant])}>
        {formatCurrency(amount.value, amount.currency)}
      </p>
    </div>
  );
}

// Price Breakdown Component
interface PriceBreakdownProps {
  items: PriceBreakdownItem[];
}

function PriceBreakdown({ items }: PriceBreakdownProps) {
  // Group items by type
  const baseFare = items.filter(i => i.type === 'base');
  const taxes = items.filter(i => i.type === 'tax');
  const fees = items.filter(i => i.type === 'fee' || i.type === 'surcharge');
  const services = items.filter(i => i.type === 'service');
  const discounts = items.filter(i => i.type === 'discount');

  const total = items.reduce((sum, item) =>
    item.type === 'discount' ? sum - item.amount : sum + item.amount, 0
  );
  const currency = items[0]?.currency || 'AUD';

  return (
    <div className="bg-gray-50 rounded-xl p-4 space-y-4">
      {/* Base Fare */}
      {baseFare.length > 0 && (
        <BreakdownSection
          title="Base Fare"
          items={baseFare}
          icon="plane"
        />
      )}

      {/* Taxes */}
      {taxes.length > 0 && (
        <BreakdownSection
          title="Taxes"
          items={taxes}
          icon="receipt"
        />
      )}

      {/* Fees & Surcharges */}
      {fees.length > 0 && (
        <BreakdownSection
          title="Fees & Surcharges"
          items={fees}
          icon="receipt"
        />
      )}

      {/* Services */}
      {services.length > 0 && (
        <BreakdownSection
          title="Additional Services"
          items={services}
          icon="services"
        />
      )}

      {/* Discounts */}
      {discounts.length > 0 && (
        <BreakdownSection
          title="Discounts"
          items={discounts}
          icon="discount"
          isDiscount
        />
      )}

      {/* Total */}
      <div className="pt-4 border-t-2 border-gray-200 flex justify-between items-center">
        <span className="text-lg font-bold text-gray-900">Grand Total</span>
        <span className="text-2xl font-bold text-orange-600">
          {formatCurrency(total, currency)}
        </span>
      </div>
    </div>
  );
}

// Breakdown Section
interface BreakdownSectionProps {
  title: string;
  items: PriceBreakdownItem[];
  icon: 'plane' | 'receipt' | 'services' | 'discount';
  isDiscount?: boolean;
}

function BreakdownSection({ title, items, isDiscount }: BreakdownSectionProps) {
  const sectionTotal = items.reduce((sum, item) => sum + item.amount, 0);
  const currency = items[0]?.currency || 'AUD';

  return (
    <div>
      <div className="flex justify-between items-center mb-2">
        <span className="text-sm font-semibold text-gray-600">{title}</span>
        <span className={cn(
          'font-semibold',
          isDiscount ? 'text-green-600' : 'text-gray-900'
        )}>
          {isDiscount && '-'}{formatCurrency(sectionTotal, currency)}
        </span>
      </div>
      <div className="space-y-1 pl-4 border-l-2 border-gray-200">
        {items.map((item, idx) => (
          <div key={idx} className="flex justify-between items-center text-sm">
            <div className="flex items-center gap-2">
              <span className="text-gray-600">{item.label}</span>
              {item.code && (
                <span className="text-xs bg-gray-200 px-1.5 py-0.5 rounded text-gray-500">
                  {item.code}
                </span>
              )}
              {item.perPassenger && item.passengerCount && (
                <span className="text-xs text-gray-400">
                  × {item.passengerCount} pax
                </span>
              )}
            </div>
            <span className={cn(
              'font-medium',
              isDiscount ? 'text-green-600' : 'text-gray-700'
            )}>
              {isDiscount && '-'}{formatCurrency(item.amount, item.currency)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Transaction Row
interface TransactionRowProps {
  transaction: PaymentTransaction;
}

function TransactionRow({ transaction }: TransactionRowProps) {
  const statusColors = {
    SUCCESSFUL: 'bg-emerald-100 text-emerald-700',
    PENDING: 'bg-amber-100 text-amber-700',
    FAILED: 'bg-red-100 text-red-700',
    REFUNDED: 'bg-blue-100 text-blue-700',
    PARTIAL: 'bg-orange-100 text-orange-700',
    UNKNOWN: 'bg-gray-100 text-gray-700',
  };

  return (
    <div className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-lg">
      <div className="flex items-center gap-3">
        <div className={cn(
          'px-2 py-1 rounded text-xs font-semibold',
          statusColors[transaction.status]
        )}>
          {transaction.status}
        </div>
        <div>
          {transaction.transactionId && (
            <p className="text-sm font-mono text-gray-600">
              #{transaction.transactionId}
            </p>
          )}
          {transaction.timestamp && (
            <p className="text-xs text-gray-400">
              {formatDateTime(transaction.timestamp)}
            </p>
          )}
        </div>
      </div>
      <span className="font-semibold text-gray-900">
        {formatCurrency(transaction.amount.value, transaction.amount.currency)}
      </span>
    </div>
  );
}

// Helper Functions
function formatCurrency(value: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(value);
}

function formatDateTime(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
}
