import { createContext, useContext, forwardRef } from 'react';
import { cn } from '@/lib/cn';

interface RadioGroupContextValue {
  value?: string;
  onChange?: (value: string) => void;
  name?: string;
}

const RadioGroupContext = createContext<RadioGroupContextValue>({});

export interface RadioGroupProps {
  value?: string;
  onChange?: (value: string) => void;
  name?: string;
  label?: string;
  children: React.ReactNode;
  className?: string;
  orientation?: 'horizontal' | 'vertical';
}

export function RadioGroup({
  value,
  onChange,
  name,
  label,
  children,
  className,
  orientation = 'vertical',
}: RadioGroupProps) {
  return (
    <RadioGroupContext.Provider value={{ value, onChange, name }}>
      <div className={className}>
        {label && (
          <div className="text-sm font-medium text-neutral-700 mb-3">{label}</div>
        )}
        <div
          className={cn(
            'flex gap-3',
            orientation === 'vertical' ? 'flex-col' : 'flex-row flex-wrap'
          )}
        >
          {children}
        </div>
      </div>
    </RadioGroupContext.Provider>
  );
}

export interface RadioCardProps {
  value: string;
  title: string;
  description?: string;
  icon?: React.ReactNode;
  badge?: string;
  disabled?: boolean;
  children?: React.ReactNode;
  className?: string;
}

export const RadioCard = forwardRef<HTMLInputElement, RadioCardProps>(
  ({ value, title, description, icon, badge, disabled, children, className }, ref) => {
    const context = useContext(RadioGroupContext);
    const isSelected = context.value === value;

    return (
      <label
        className={cn(
          'relative flex cursor-pointer rounded-xl border-2 p-4 transition-all',
          isSelected
            ? 'border-primary-500 bg-primary-50 shadow-sm'
            : 'border-neutral-200 hover:border-primary-200 hover:bg-neutral-50',
          disabled && 'opacity-50 cursor-not-allowed',
          className
        )}
      >
        <input
          ref={ref}
          type="radio"
          name={context.name}
          value={value}
          checked={isSelected}
          onChange={() => context.onChange?.(value)}
          disabled={disabled}
          className="sr-only"
        />
        <div className="flex items-start gap-3 w-full">
          <div
            className={cn(
              'mt-0.5 h-5 w-5 rounded-full border-2 flex items-center justify-center shrink-0',
              isSelected ? 'border-primary-500' : 'border-neutral-300'
            )}
          >
            {isSelected && <div className="h-2.5 w-2.5 rounded-full bg-primary-500" />}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              {icon && <span className="text-primary-500">{icon}</span>}
              <span className="font-medium text-neutral-900">{title}</span>
              {badge && (
                <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-primary-100 text-primary-700">
                  {badge}
                </span>
              )}
            </div>
            {description && (
              <p className="mt-1 text-sm text-neutral-500">{description}</p>
            )}
            {children && <div className="mt-3">{children}</div>}
          </div>
        </div>
      </label>
    );
  }
);

RadioCard.displayName = 'RadioCard';
