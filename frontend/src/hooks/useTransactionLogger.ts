/**
 * React Hook for Transaction Logger
 *
 * Provides easy integration of the transaction logging system into React components.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  TransactionLogger,
  type TransactionLog,
  type StepLog,
  type StepType,
  type SelectionSnapshot,
  type ApiCallLog,
  type PriceBreakdownRow,
} from '@/lib/transaction-logger';

export interface UseTransactionLoggerResult {
  // Transaction management
  startTransaction: (sessionId?: string) => string;
  completeTransaction: (
    status?: 'completed' | 'failed' | 'abandoned',
    outcome?: TransactionLog['outcome']
  ) => void;

  // Search criteria
  setSearchCriteria: (criteria: TransactionLog['searchCriteria']) => void;

  // Step management
  startStep: (stepType: StepType, stepName: string, stepNumber: number) => void;
  completeStep: (status?: 'completed' | 'failed' | 'skipped') => void;

  // Logging actions
  logUserAction: (action: string, details?: Record<string, unknown>) => void;
  logSelection: (selection: SelectionSnapshot) => void;
  logPriceSnapshot: (
    label: string,
    total: number,
    currency: string,
    breakdown: PriceBreakdownRow[]
  ) => void;
  logApiCall: (call: Omit<ApiCallLog, 'timestamp'>) => void;
  logWarning: (message: string, details?: Record<string, unknown>) => void;
  logError: (message: string, details?: Record<string, unknown>) => void;
  logDebug: (label: string, data: unknown) => void;

  // Convenience loggers for common selections
  logFlightSelection: (direction: 'outbound' | 'inbound', data: {
    offerId: string;
    flightNumber?: string;
    origin: string;
    destination: string;
    departureTime?: string;
    arrivalTime?: string;
    duration?: string;
    stops?: number;
    cabinClass?: string;
    baseFare?: number;
    currency?: string;
  }) => void;

  logBundleSelection: (direction: 'outbound' | 'inbound', data: {
    bundleId: string;
    bundleName: string;
    bundleCode?: string;
    tier?: number;
    price: number;
    currency: string;
    journeyRefId?: string;
    isSwap?: boolean;
  }) => void;

  logServiceSelection: (data: {
    serviceId: string;
    serviceName: string;
    serviceCode: string;
    serviceType: string;
    quantity: number;
    price: number;
    currency: string;
    direction?: 'outbound' | 'inbound' | 'both';
  }) => void;

  logSeatSelection: (data: {
    segmentId: string;
    seatNumber: string;
    paxId: string;
    seatType?: string;
    price?: number;
    currency?: string;
  }) => void;

  logPassengerEntry: (data: {
    paxId: string;
    paxType: string;
    firstName?: string;
    lastName?: string;
    dateOfBirth?: string;
  }) => void;

  // Export functions
  exportAsJson: () => string;
  exportAsText: () => string;
  downloadLog: (format?: 'json' | 'text' | 'full') => void;

  // Current state
  currentTransaction: TransactionLog | null;
  currentStep: StepLog | null;
  transactionHistory: TransactionLog[];
}

/**
 * Hook to use the transaction logger in React components
 */
export function useTransactionLogger(): UseTransactionLoggerResult {
  const [currentTransaction, setCurrentTransaction] = useState<TransactionLog | null>(
    TransactionLogger.getCurrentTransaction()
  );
  const [currentStep, setCurrentStep] = useState<StepLog | null>(
    TransactionLogger.getCurrentStep()
  );

  // Subscribe to updates
  useEffect(() => {
    const unsubscribe = TransactionLogger.subscribe((log) => {
      setCurrentTransaction({ ...log });
      setCurrentStep(TransactionLogger.getCurrentStep());
    });

    return unsubscribe;
  }, []);

  // Transaction management
  const startTransaction = useCallback((sessionId?: string) => {
    const id = TransactionLogger.startTransaction(sessionId || `session-${Date.now()}`);
    setCurrentTransaction(TransactionLogger.getCurrentTransaction());
    return id;
  }, []);

  const completeTransaction = useCallback((
    status?: 'completed' | 'failed' | 'abandoned',
    outcome?: TransactionLog['outcome']
  ) => {
    TransactionLogger.completeTransaction(status, outcome);
    setCurrentTransaction(TransactionLogger.getCurrentTransaction());
  }, []);

  // Search criteria
  const setSearchCriteria = useCallback((criteria: TransactionLog['searchCriteria']) => {
    TransactionLogger.setSearchCriteria(criteria);
    setCurrentTransaction(TransactionLogger.getCurrentTransaction());
  }, []);

  // Step management
  const startStep = useCallback((stepType: StepType, stepName: string, stepNumber: number) => {
    TransactionLogger.startStep(stepType, stepName, stepNumber);
    setCurrentStep(TransactionLogger.getCurrentStep());
  }, []);

  const completeStep = useCallback((status?: 'completed' | 'failed' | 'skipped') => {
    TransactionLogger.completeStep(status);
    setCurrentStep(TransactionLogger.getCurrentStep());
  }, []);

  // Basic logging
  const logUserAction = useCallback((action: string, details?: Record<string, unknown>) => {
    TransactionLogger.logUserAction(action, details);
  }, []);

  const logSelection = useCallback((selection: SelectionSnapshot) => {
    TransactionLogger.logSelection(selection);
  }, []);

  const logPriceSnapshot = useCallback((
    label: string,
    total: number,
    currency: string,
    breakdown: PriceBreakdownRow[]
  ) => {
    TransactionLogger.logPriceSnapshot(label, total, currency, breakdown);
  }, []);

  const logApiCall = useCallback((call: Omit<ApiCallLog, 'timestamp'>) => {
    TransactionLogger.logApiCall(call);
  }, []);

  const logWarning = useCallback((message: string, details?: Record<string, unknown>) => {
    TransactionLogger.logWarning(message, details);
  }, []);

  const logError = useCallback((message: string, details?: Record<string, unknown>) => {
    TransactionLogger.logError(message, details);
  }, []);

  const logDebug = useCallback((label: string, data: unknown) => {
    TransactionLogger.logDebug(label, data);
  }, []);

  // Convenience loggers for common selections

  const logFlightSelection = useCallback((
    direction: 'outbound' | 'inbound',
    data: {
      offerId: string;
      flightNumber?: string;
      origin: string;
      destination: string;
      departureTime?: string;
      arrivalTime?: string;
      duration?: string;
      stops?: number;
      cabinClass?: string;
      baseFare?: number;
      currency?: string;
    }
  ) => {
    TransactionLogger.logSelection({
      type: 'flight',
      direction,
      data,
      summary: `${data.flightNumber || 'Flight'} ${data.origin}-${data.destination}${data.baseFare ? ` @ ${data.currency} ${data.baseFare}` : ''}`,
    });
  }, []);

  const logBundleSelection = useCallback((
    direction: 'outbound' | 'inbound',
    data: {
      bundleId: string;
      bundleName: string;
      bundleCode?: string;
      tier?: number;
      price: number;
      currency: string;
      journeyRefId?: string;
      isSwap?: boolean;
    }
  ) => {
    const swapLabel = data.isSwap ? ' [SWAP]' : '';
    TransactionLogger.logSelection({
      type: 'bundle',
      direction,
      data,
      summary: `${data.bundleName}${data.bundleCode ? ` (${data.bundleCode})` : ''} @ ${data.currency} ${data.price}/pax${swapLabel}`,
    });
  }, []);

  const logServiceSelection = useCallback((data: {
    serviceId: string;
    serviceName: string;
    serviceCode: string;
    serviceType: string;
    quantity: number;
    price: number;
    currency: string;
    direction?: 'outbound' | 'inbound' | 'both';
  }) => {
    TransactionLogger.logSelection({
      type: 'service',
      direction: data.direction,
      data,
      summary: `${data.serviceName} x${data.quantity} @ ${data.currency} ${data.price}`,
    });
  }, []);

  const logSeatSelection = useCallback((data: {
    segmentId: string;
    seatNumber: string;
    paxId: string;
    seatType?: string;
    price?: number;
    currency?: string;
  }) => {
    TransactionLogger.logSelection({
      type: 'seat',
      data,
      summary: `Seat ${data.seatNumber} for ${data.paxId}${data.price ? ` @ ${data.currency} ${data.price}` : ''}`,
    });
  }, []);

  const logPassengerEntry = useCallback((data: {
    paxId: string;
    paxType: string;
    firstName?: string;
    lastName?: string;
    dateOfBirth?: string;
  }) => {
    TransactionLogger.logSelection({
      type: 'passenger',
      data,
      summary: `${data.firstName || ''} ${data.lastName || ''} (${data.paxType})`.trim(),
    });
  }, []);

  // Export functions
  const exportAsJson = useCallback(() => {
    return TransactionLogger.exportAsJson();
  }, []);

  const exportAsText = useCallback(() => {
    return TransactionLogger.exportAsText();
  }, []);

  const downloadLog = useCallback((format?: 'json' | 'text' | 'full') => {
    TransactionLogger.downloadLog(format);
  }, []);

  return {
    startTransaction,
    completeTransaction,
    setSearchCriteria,
    startStep,
    completeStep,
    logUserAction,
    logSelection,
    logPriceSnapshot,
    logApiCall,
    logWarning,
    logError,
    logDebug,
    logFlightSelection,
    logBundleSelection,
    logServiceSelection,
    logSeatSelection,
    logPassengerEntry,
    exportAsJson,
    exportAsText,
    downloadLog,
    currentTransaction,
    currentStep,
    transactionHistory: TransactionLogger.getTransactionHistory(),
  };
}

export default useTransactionLogger;
