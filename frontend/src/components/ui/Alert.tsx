import { cn } from '@/lib/cn';
import { AlertCircle, CheckCircle, Info, AlertTriangle, X } from 'lucide-react';

export interface AlertProps {
  variant?: 'info' | 'success' | 'warning' | 'error';
  title?: string;
  children: React.ReactNode;
  onClose?: () => void;
  className?: string;
}

export function Alert({
  variant = 'info',
  title,
  children,
  onClose,
  className,
}: AlertProps) {
  const variants = {
    info: {
      container: 'bg-primary-50 border-primary-200 text-primary-800',
      icon: <Info className="h-5 w-5 text-primary-500" />,
    },
    success: {
      container: 'bg-success-50 border-success-200 text-success-800',
      icon: <CheckCircle className="h-5 w-5 text-success-500" />,
    },
    warning: {
      container: 'bg-warning-50 border-warning-200 text-warning-800',
      icon: <AlertTriangle className="h-5 w-5 text-warning-500" />,
    },
    error: {
      container: 'bg-error-50 border-error-200 text-error-800',
      icon: <AlertCircle className="h-5 w-5 text-error-500" />,
    },
  };

  const { container, icon } = variants[variant];

  return (
    <div className={cn('rounded-lg border p-4', container, className)}>
      <div className="flex gap-3">
        <div className="shrink-0">{icon}</div>
        <div className="flex-1">
          {title && <h4 className="font-medium mb-1">{title}</h4>}
          <div className="text-sm">{children}</div>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="shrink-0 opacity-70 hover:opacity-100 transition-opacity"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}
