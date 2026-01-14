/**
 * Transaction Log Viewer Component
 *
 * A collapsible panel that shows real-time transaction logs for debugging.
 * Can be added to any page to monitor the booking flow.
 */

import { useState, useEffect, useRef } from 'react';
import { cn } from '@/lib/cn';
import {
  TransactionLogger,
  type TransactionLog,
  type StepLog,
  formatDuration,
} from '@/lib/transaction-logger';
import {
  Bug,
  ChevronDown,
  Download,
  Copy,
  Check,
  Trash2,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Clock,
  Play,
  SkipForward,
  FileJson,
  FileText,
  Maximize2,
  Minimize2,
} from 'lucide-react';

interface TransactionLogViewerProps {
  className?: string;
  defaultExpanded?: boolean;
  position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
}

export function TransactionLogViewer({
  className,
  defaultExpanded = false,
  position = 'bottom-right',
}: TransactionLogViewerProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [isMaximized, setIsMaximized] = useState(false);
  const [transaction, setTransaction] = useState<TransactionLog | null>(
    TransactionLogger.getCurrentTransaction()
  );
  const [copiedText, setCopiedText] = useState(false);
  const [selectedStep, setSelectedStep] = useState<string | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);

  // Subscribe to transaction updates
  useEffect(() => {
    const unsubscribe = TransactionLogger.subscribe((log) => {
      setTransaction({ ...log });
    });

    return unsubscribe;
  }, []);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (isExpanded && logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [transaction, isExpanded]);

  const handleCopy = async (format: 'json' | 'text') => {
    const content = format === 'json'
      ? TransactionLogger.exportAsJson()
      : TransactionLogger.exportAsText();

    await navigator.clipboard.writeText(content);
    setCopiedText(true);
    setTimeout(() => setCopiedText(false), 2000);
  };

  const handleDownload = (format: 'json' | 'text' | 'full') => {
    TransactionLogger.downloadLog(format);
  };

  const handleClear = () => {
    TransactionLogger.clear();
    setTransaction(null);
    setSelectedStep(null);
  };

  const positionClasses = {
    'bottom-right': 'bottom-4 right-4',
    'bottom-left': 'bottom-4 left-4',
    'top-right': 'top-4 right-4',
    'top-left': 'top-4 left-4',
  };

  const getStepStatusIcon = (status: StepLog['status']) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'failed':
        return <XCircle className="w-4 h-4 text-red-500" />;
      case 'skipped':
        return <SkipForward className="w-4 h-4 text-gray-400" />;
      case 'in_progress':
        return <Play className="w-4 h-4 text-blue-500 animate-pulse" />;
      default:
        return <Clock className="w-4 h-4 text-gray-400" />;
    }
  };

  const renderStepSummary = (step: StepLog) => {
    const isSelected = selectedStep === step.stepId;

    return (
      <div
        key={step.stepId}
        className={cn(
          'border-l-2 pl-3 py-2 cursor-pointer hover:bg-slate-50 transition-colors',
          step.status === 'completed' && 'border-green-500',
          step.status === 'failed' && 'border-red-500',
          step.status === 'in_progress' && 'border-blue-500 bg-blue-50',
          step.status === 'skipped' && 'border-gray-300',
          step.status === 'started' && 'border-yellow-500',
          isSelected && 'bg-slate-100'
        )}
        onClick={() => setSelectedStep(isSelected ? null : step.stepId)}
      >
        <div className="flex items-center gap-2">
          {getStepStatusIcon(step.status)}
          <span className="font-medium text-sm">
            Step {step.stepNumber}: {step.stepName}
          </span>
          {step.duration && (
            <span className="text-xs text-slate-500">
              ({formatDuration(step.duration)})
            </span>
          )}
        </div>

        {/* Collapsed summary */}
        {!isSelected && (
          <div className="mt-1 text-xs text-slate-500 truncate">
            {step.selections.length > 0 && (
              <span>{step.selections.length} selection(s) • </span>
            )}
            {step.apiCalls.length > 0 && (
              <span>{step.apiCalls.length} API call(s) • </span>
            )}
            {step.warnings.length > 0 && (
              <span className="text-yellow-600">{step.warnings.length} warning(s) • </span>
            )}
            {step.errors.length > 0 && (
              <span className="text-red-600">{step.errors.length} error(s)</span>
            )}
          </div>
        )}

        {/* Expanded details */}
        {isSelected && (
          <div className="mt-3 space-y-3 text-xs">
            {/* User Actions */}
            {step.userActions.length > 0 && (
              <div>
                <div className="font-semibold text-slate-700 mb-1">User Actions:</div>
                {step.userActions.map((action, i) => (
                  <div key={i} className="text-slate-600 pl-2">• {action}</div>
                ))}
              </div>
            )}

            {/* Selections */}
            {step.selections.length > 0 && (
              <div>
                <div className="font-semibold text-slate-700 mb-1">Selections:</div>
                {step.selections.map((sel, i) => (
                  <div key={i} className="text-slate-600 pl-2 mb-1">
                    <span className="font-medium">[{sel.type}]</span>
                    {sel.direction && <span className="text-slate-400"> ({sel.direction})</span>}
                    <span>: {sel.summary}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Price Snapshot */}
            {step.priceSnapshot && (
              <div>
                <div className="font-semibold text-slate-700 mb-1">Price:</div>
                <div className="pl-2 font-mono">
                  {step.priceSnapshot.currency} {step.priceSnapshot.total.toFixed(2)}
                </div>
                {step.priceSnapshot.breakdown.length > 0 && (
                  <div className="pl-2 text-slate-500">
                    {step.priceSnapshot.breakdown.map((row, i) => (
                      <div key={i}>
                        {row.label}: {row.currency} {row.amount.toFixed(2)}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* API Calls */}
            {step.apiCalls.length > 0 && (
              <div>
                <div className="font-semibold text-slate-700 mb-1">API Calls:</div>
                {step.apiCalls.map((api, i) => (
                  <div key={i} className={cn(
                    'pl-2 mb-1 p-2 rounded',
                    api.success ? 'bg-green-50' : 'bg-red-50'
                  )}>
                    <div className="flex items-center gap-2">
                      {api.success ? (
                        <CheckCircle className="w-3 h-3 text-green-500" />
                      ) : (
                        <XCircle className="w-3 h-3 text-red-500" />
                      )}
                      <span className="font-medium">{api.operation}</span>
                      <span className="text-slate-400">({formatDuration(api.duration)})</span>
                    </div>
                    <div className="text-slate-600 mt-1">
                      <div>Request: {api.requestSummary}</div>
                      <div>Response: {api.responseSummary}</div>
                      {api.errorMessage && (
                        <div className="text-red-600 mt-1">Error: {api.errorMessage}</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Warnings */}
            {step.warnings.length > 0 && (
              <div>
                <div className="font-semibold text-yellow-700 mb-1 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" /> Warnings:
                </div>
                {step.warnings.map((warn, i) => (
                  <div key={i} className="text-yellow-700 pl-2">• {warn}</div>
                ))}
              </div>
            )}

            {/* Errors */}
            {step.errors.length > 0 && (
              <div>
                <div className="font-semibold text-red-700 mb-1 flex items-center gap-1">
                  <XCircle className="w-3 h-3" /> Errors:
                </div>
                {step.errors.map((err, i) => (
                  <div key={i} className="text-red-700 pl-2">• {err}</div>
                ))}
              </div>
            )}

            {/* Narrative */}
            {step.narrative.length > 0 && (
              <div>
                <div className="font-semibold text-slate-700 mb-1">Timeline:</div>
                <div className="pl-2 font-mono text-[10px] text-slate-500 max-h-32 overflow-y-auto">
                  {step.narrative.map((line, i) => (
                    <div key={i}>{line}</div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  if (!isExpanded) {
    return (
      <button
        onClick={() => setIsExpanded(true)}
        className={cn(
          'fixed z-50 p-3 bg-slate-800 text-white rounded-full shadow-lg hover:bg-slate-700 transition-colors',
          positionClasses[position],
          className
        )}
        title="Open Transaction Logs"
      >
        <Bug className="w-5 h-5" />
        {transaction && transaction.steps.some(s => s.errors.length > 0) && (
          <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full animate-pulse" />
        )}
      </button>
    );
  }

  return (
    <div
      className={cn(
        'fixed z-50 bg-white border border-slate-200 shadow-2xl rounded-lg overflow-hidden flex flex-col',
        isMaximized
          ? 'inset-4'
          : cn(
              positionClasses[position],
              'w-[450px] max-h-[70vh]'
            ),
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-slate-800 text-white">
        <div className="flex items-center gap-2">
          <Bug className="w-4 h-4" />
          <span className="font-semibold text-sm">Transaction Log</span>
          {transaction && (
            <span className="text-xs text-slate-400">
              ({transaction.steps.length} steps)
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {/* Copy buttons */}
          <button
            onClick={() => handleCopy('text')}
            className="p-1.5 hover:bg-slate-700 rounded transition-colors"
            title="Copy as text"
          >
            {copiedText ? (
              <Check className="w-4 h-4 text-green-400" />
            ) : (
              <Copy className="w-4 h-4" />
            )}
          </button>

          {/* Download dropdown */}
          <div className="relative group">
            <button
              className="p-1.5 hover:bg-slate-700 rounded transition-colors"
              title="Download log"
            >
              <Download className="w-4 h-4" />
            </button>
            <div className="absolute right-0 top-full mt-1 bg-white text-slate-800 rounded shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10 min-w-[180px]">
              <button
                onClick={() => handleDownload('full')}
                className="flex items-center gap-2 px-3 py-2 hover:bg-slate-100 w-full text-left text-sm font-medium text-blue-600"
              >
                <FileText className="w-4 h-4" /> Full Session Log
              </button>
              <div className="border-t border-slate-200 my-1" />
              <button
                onClick={() => handleDownload('text')}
                className="flex items-center gap-2 px-3 py-2 hover:bg-slate-100 w-full text-left text-sm"
              >
                <FileText className="w-4 h-4" /> Transaction (.txt)
              </button>
              <button
                onClick={() => handleDownload('json')}
                className="flex items-center gap-2 px-3 py-2 hover:bg-slate-100 w-full text-left text-sm"
              >
                <FileJson className="w-4 h-4" /> Transaction (.json)
              </button>
            </div>
          </div>

          {/* Clear */}
          <button
            onClick={handleClear}
            className="p-1.5 hover:bg-slate-700 rounded transition-colors"
            title="Clear logs"
          >
            <Trash2 className="w-4 h-4" />
          </button>

          {/* Maximize/Minimize */}
          <button
            onClick={() => setIsMaximized(!isMaximized)}
            className="p-1.5 hover:bg-slate-700 rounded transition-colors"
            title={isMaximized ? 'Minimize' : 'Maximize'}
          >
            {isMaximized ? (
              <Minimize2 className="w-4 h-4" />
            ) : (
              <Maximize2 className="w-4 h-4" />
            )}
          </button>

          {/* Collapse */}
          <button
            onClick={() => setIsExpanded(false)}
            className="p-1.5 hover:bg-slate-700 rounded transition-colors"
            title="Collapse"
          >
            <ChevronDown className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3 bg-slate-50">
        {!transaction ? (
          <div className="text-center text-slate-500 py-8">
            <Bug className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No active transaction</p>
            <p className="text-xs mt-1">Logs will appear here when a booking flow starts</p>
          </div>
        ) : (
          <div className="space-y-1">
            {/* Transaction header */}
            <div className="bg-white p-3 rounded border border-slate-200 mb-3">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-sm">
                  Transaction: {transaction.transactionId.substring(0, 20)}...
                </span>
                <span className={cn(
                  'text-xs px-2 py-0.5 rounded-full',
                  transaction.status === 'completed' && 'bg-green-100 text-green-700',
                  transaction.status === 'failed' && 'bg-red-100 text-red-700',
                  transaction.status === 'in_progress' && 'bg-blue-100 text-blue-700',
                  transaction.status === 'abandoned' && 'bg-gray-100 text-gray-700'
                )}>
                  {transaction.status}
                </span>
              </div>
              {transaction.searchCriteria && (
                <div className="text-xs text-slate-500 mt-2">
                  <span className="font-medium">Search: </span>
                  {transaction.searchCriteria.origin} → {transaction.searchCriteria.destination}
                  {transaction.searchCriteria.returnDate && (
                    <span> (Return: {transaction.searchCriteria.returnDate})</span>
                  )}
                  <span className="ml-2">
                    {transaction.searchCriteria.passengers.adults}A
                    {transaction.searchCriteria.passengers.children > 0 && ` ${transaction.searchCriteria.passengers.children}C`}
                    {transaction.searchCriteria.passengers.infants > 0 && ` ${transaction.searchCriteria.passengers.infants}I`}
                  </span>
                </div>
              )}
            </div>

            {/* Steps */}
            {transaction.steps.map(renderStepSummary)}

            {/* Outcome */}
            {transaction.outcome && (
              <div className="bg-green-50 p-3 rounded border border-green-200 mt-3">
                <div className="font-semibold text-green-800 text-sm mb-1">
                  Booking Complete
                </div>
                {transaction.outcome.pnr && (
                  <div className="text-green-700 text-xs">
                    PNR: <span className="font-mono font-bold">{transaction.outcome.pnr}</span>
                  </div>
                )}
                {transaction.outcome.totalPaid && (
                  <div className="text-green-700 text-xs">
                    Total: {transaction.outcome.currency} {transaction.outcome.totalPaid.toFixed(2)}
                  </div>
                )}
              </div>
            )}

            <div ref={logEndRef} />
          </div>
        )}
      </div>
    </div>
  );
}

export default TransactionLogViewer;
