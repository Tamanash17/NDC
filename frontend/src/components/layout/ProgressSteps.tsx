import { cn } from '@/lib/cn';
import { Check } from 'lucide-react';

export interface ProgressStep {
  id: string;
  label: string;
  description?: string;
}

export interface ProgressStepsProps {
  steps: ProgressStep[];
  currentStepIndex: number;
  completedSteps: string[];
  onStepClick?: (index: number) => void;
  allowNavigation?: boolean;
}

export function ProgressSteps({
  steps,
  currentStepIndex,
  completedSteps,
  onStepClick,
  allowNavigation = false,
}: ProgressStepsProps) {
  return (
    <nav className="py-4">
      <ol className="flex items-center">
        {steps.map((step, index) => {
          const isCompleted = completedSteps.includes(step.id);
          const isCurrent = index === currentStepIndex;
          const isClickable = allowNavigation && (isCompleted || index <= currentStepIndex);

          return (
            <li
              key={step.id}
              className={cn('flex items-center', index !== steps.length - 1 && 'flex-1')}
            >
              {/* Step indicator */}
              <button
                onClick={() => isClickable && onStepClick?.(index)}
                disabled={!isClickable}
                className={cn(
                  'flex items-center gap-2 group',
                  isClickable && 'cursor-pointer'
                )}
              >
                <span
                  className={cn(
                    'flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium transition-colors',
                    isCompleted
                      ? 'bg-success-500 text-white'
                      : isCurrent
                      ? 'bg-primary-500 text-white'
                      : 'bg-neutral-200 text-neutral-500'
                  )}
                >
                  {isCompleted ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    index + 1
                  )}
                </span>
                <span
                  className={cn(
                    'hidden md:block text-sm font-medium',
                    isCurrent
                      ? 'text-primary-600'
                      : isCompleted
                      ? 'text-neutral-900'
                      : 'text-neutral-500'
                  )}
                >
                  {step.label}
                </span>
              </button>

              {/* Connector line */}
              {index !== steps.length - 1 && (
                <div className="flex-1 mx-4">
                  <div
                    className={cn(
                      'h-0.5 transition-colors',
                      isCompleted ? 'bg-success-500' : 'bg-neutral-200'
                    )}
                  />
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
