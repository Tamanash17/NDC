/**
 * Transaction Logger - World-Class Logging System
 *
 * Captures every step, selection, API call, and user action in a structured,
 * human-readable format for debugging and investigation.
 *
 * Features:
 * - Step-by-step transaction tracking
 * - Formatted price tables and selection dumps
 * - XML request/response capture with timing
 * - User-friendly narrative generation
 * - Export to JSON/Text for review
 */

// =============================================================================
// TYPES
// =============================================================================

export type LogLevel = 'info' | 'debug' | 'warn' | 'error' | 'success';
export type StepType =
  | 'search'
  | 'flight-selection'
  | 'service-list'
  | 'offer-price'
  | 'passengers'
  | 'seat-selection'
  | 'payment'
  | 'confirmation'
  | 'order-retrieve'
  | 'order-change'
  | 'order-cancel';

export interface PriceBreakdownRow {
  label: string;
  description?: string;
  amount: number;
  currency: string;
  paxType?: string;
  quantity?: number;
}

export interface SelectionSnapshot {
  type: 'flight' | 'bundle' | 'service' | 'seat' | 'passenger';
  direction?: 'outbound' | 'inbound' | 'both';
  data: Record<string, unknown>;
  summary: string;
}

export interface ApiCallLog {
  operation: string;
  endpoint?: string;
  method?: string;
  requestXml?: string;
  responseXml?: string;
  requestSummary: string;
  responseSummary: string;
  duration: number;
  success: boolean;
  errorMessage?: string;
  timestamp: Date;
}

export interface StepLog {
  stepId: string;
  stepType: StepType;
  stepName: string;
  stepNumber: number;
  timestamp: Date;
  duration?: number;
  status: 'started' | 'in_progress' | 'completed' | 'failed' | 'skipped';

  // User actions
  userActions: string[];

  // Selections made
  selections: SelectionSnapshot[];

  // Price state at this step
  priceSnapshot?: {
    total: number;
    currency: string;
    breakdown: PriceBreakdownRow[];
  };

  // API calls made during this step
  apiCalls: ApiCallLog[];

  // Narrative description
  narrative: string[];

  // Debug data
  debugData?: Record<string, unknown>;

  // Warnings/errors
  warnings: string[];
  errors: string[];
}

export interface TransactionLog {
  transactionId: string;
  sessionId: string;
  startTime: Date;
  endTime?: Date;
  status: 'in_progress' | 'completed' | 'failed' | 'abandoned';

  // Search criteria
  searchCriteria?: {
    origin: string;
    destination: string;
    departureDate: string;
    returnDate?: string;
    passengers: { adults: number; children: number; infants: number };
    cabinClass?: string;
    tripType: 'oneway' | 'return' | 'openjaw';
  };

  // All steps
  steps: StepLog[];

  // Final outcome
  outcome?: {
    orderId?: string;
    pnr?: string;
    totalPaid?: number;
    currency?: string;
  };

  // Overall narrative
  summary: string[];
}

// =============================================================================
// FORMATTERS
// =============================================================================

/**
 * Format a price table for logging
 */
export function formatPriceTable(
  title: string,
  rows: PriceBreakdownRow[],
  total?: { label: string; amount: number; currency: string }
): string {
  const lines: string[] = [];
  const width = 70;
  const separator = '─'.repeat(width);

  lines.push('');
  lines.push(`┌${separator}┐`);
  lines.push(`│ ${title.padEnd(width - 2)} │`);
  lines.push(`├${'─'.repeat(45)}┬${'─'.repeat(width - 46)}┤`);
  lines.push(`│ ${'Description'.padEnd(43)} │ ${'Amount'.padStart(width - 48)} │`);
  lines.push(`├${'─'.repeat(45)}┼${'─'.repeat(width - 46)}┤`);

  for (const row of rows) {
    const desc = row.description
      ? `${row.label} (${row.description})`
      : row.label;
    const paxInfo = row.paxType && row.quantity
      ? ` [${row.paxType} x${row.quantity}]`
      : '';
    const fullDesc = (desc + paxInfo).substring(0, 43);
    const amount = `${row.currency} ${row.amount.toFixed(2)}`;
    lines.push(`│ ${fullDesc.padEnd(43)} │ ${amount.padStart(width - 48)} │`);
  }

  if (total) {
    lines.push(`├${'─'.repeat(45)}┴${'─'.repeat(width - 46)}┤`);
    const totalAmount = `${total.currency} ${total.amount.toFixed(2)}`;
    lines.push(`│ ${total.label.padEnd(45)} ${totalAmount.padStart(width - 48)} │`);
  }

  lines.push(`└${separator}┘`);
  lines.push('');

  return lines.join('\n');
}

/**
 * Format a selection summary box
 */
export function formatSelectionBox(title: string, items: Record<string, string | number | boolean | undefined>): string {
  const lines: string[] = [];
  const width = 60;
  const separator = '─'.repeat(width);

  lines.push('');
  lines.push(`┌${separator}┐`);
  lines.push(`│ ${title.padEnd(width - 2)} │`);
  lines.push(`├${separator}┤`);

  for (const [key, value] of Object.entries(items)) {
    if (value === undefined) continue;
    const keyStr = key.padEnd(20);
    const valueStr = String(value).substring(0, width - 25);
    lines.push(`│ ${keyStr}: ${valueStr.padEnd(width - 24)} │`);
  }

  lines.push(`└${separator}┘`);
  lines.push('');

  return lines.join('\n');
}

/**
 * Format flight details
 */
export function formatFlightDetails(flight: {
  flightNumber?: string;
  origin?: string;
  destination?: string;
  departureTime?: string;
  arrivalTime?: string;
  duration?: string;
  aircraft?: string;
  cabinClass?: string;
}): string {
  const lines: string[] = [];

  lines.push(`  ✈️  ${flight.flightNumber || 'N/A'}`);
  lines.push(`      ${flight.origin || '???'} → ${flight.destination || '???'}`);
  if (flight.departureTime) lines.push(`      Departs: ${flight.departureTime}`);
  if (flight.arrivalTime) lines.push(`      Arrives: ${flight.arrivalTime}`);
  if (flight.duration) lines.push(`      Duration: ${flight.duration}`);
  if (flight.cabinClass) lines.push(`      Cabin: ${flight.cabinClass}`);

  return lines.join('\n');
}

/**
 * Format timestamp
 */
export function formatTimestamp(date: Date): string {
  return date.toISOString().replace('T', ' ').substring(0, 23);
}

/**
 * Format duration in ms to human readable
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
  const mins = Math.floor(ms / 60000);
  const secs = ((ms % 60000) / 1000).toFixed(0);
  return `${mins}m ${secs}s`;
}

// =============================================================================
// TRANSACTION LOGGER CLASS
// =============================================================================

class TransactionLoggerService {
  private currentTransaction: TransactionLog | null = null;
  private currentStep: StepLog | null = null;
  private transactionHistory: TransactionLog[] = [];
  private listeners: Set<(log: TransactionLog) => void> = new Set();
  private sessionId: string | null = null;
  private sessionStartTime: Date | null = null;

  // Storage keys
  private readonly STORAGE_KEY_SESSION = 'txn_logger_session';
  private readonly STORAGE_KEY_HISTORY = 'txn_logger_history';
  private readonly STORAGE_KEY_CURRENT = 'txn_logger_current';
  private readonly STORAGE_KEY_FULL_LOG = 'txn_logger_full_log';
  private readonly MAX_HISTORY_SIZE = 10; // Keep last 10 transactions

  // Full log text for export/review
  private fullLogText: string[] = [];

  constructor() {
    // Restore from sessionStorage on init
    this.restoreFromStorage();
  }

  /**
   * Restore state from sessionStorage
   */
  private restoreFromStorage(): void {
    try {
      // Restore session info
      const sessionData = sessionStorage.getItem(this.STORAGE_KEY_SESSION);
      if (sessionData) {
        const parsed = JSON.parse(sessionData);
        this.sessionId = parsed.sessionId;
        this.sessionStartTime = new Date(parsed.startTime);
        this.log('debug', `📦 Restored session: ${this.sessionId}`);
      }

      // Restore transaction history
      const historyData = sessionStorage.getItem(this.STORAGE_KEY_HISTORY);
      if (historyData) {
        this.transactionHistory = JSON.parse(historyData).map((t: any) => ({
          ...t,
          startTime: new Date(t.startTime),
          endTime: t.endTime ? new Date(t.endTime) : undefined,
        }));
        this.log('debug', `📦 Restored ${this.transactionHistory.length} transactions from history`);
      }

      // Restore current transaction if it was in progress
      const currentData = sessionStorage.getItem(this.STORAGE_KEY_CURRENT);
      if (currentData) {
        const parsed = JSON.parse(currentData);
        this.currentTransaction = {
          ...parsed,
          startTime: new Date(parsed.startTime),
          endTime: parsed.endTime ? new Date(parsed.endTime) : undefined,
        };
        this.log('debug', `📦 Restored in-progress transaction: ${parsed.transactionId}`);
      }

      // Restore full log text
      const fullLogData = localStorage.getItem(this.STORAGE_KEY_FULL_LOG);
      if (fullLogData) {
        this.fullLogText = JSON.parse(fullLogData);
        this.log('debug', `📦 Restored ${this.fullLogText.length} log lines`);
      }
    } catch (err) {
      console.warn('[TransactionLogger] Failed to restore from storage:', err);
    }
  }

  /**
   * Persist current state to sessionStorage
   */
  private persistToStorage(): void {
    try {
      // Save session info
      if (this.sessionId) {
        sessionStorage.setItem(this.STORAGE_KEY_SESSION, JSON.stringify({
          sessionId: this.sessionId,
          startTime: this.sessionStartTime?.toISOString(),
        }));
      }

      // Save transaction history (limit size)
      const historyToSave = this.transactionHistory.slice(-this.MAX_HISTORY_SIZE);
      sessionStorage.setItem(this.STORAGE_KEY_HISTORY, JSON.stringify(historyToSave));

      // Save current transaction
      if (this.currentTransaction) {
        sessionStorage.setItem(this.STORAGE_KEY_CURRENT, JSON.stringify(this.currentTransaction));
      } else {
        sessionStorage.removeItem(this.STORAGE_KEY_CURRENT);
      }

      // Save full log text to localStorage (persists across sessions until cleared)
      // Keep last 5000 lines to prevent storage overflow
      const logToSave = this.fullLogText.slice(-5000);
      localStorage.setItem(this.STORAGE_KEY_FULL_LOG, JSON.stringify(logToSave));
    } catch (err) {
      console.warn('[TransactionLogger] Failed to persist to storage:', err);
    }
  }

  /**
   * Initialize a new session (call on login)
   * Clears all previous logs and starts fresh
   */
  initSession(userId?: string): string {
    // Clear all previous data
    this.currentTransaction = null;
    this.currentStep = null;
    this.transactionHistory = [];

    // Clear full log and start fresh
    this.fullLogText = [];
    this.fullLogText.push('═'.repeat(80));
    this.fullLogText.push(`BOOKING ENGINE TRANSACTION LOG`);
    this.fullLogText.push(`Session Started: ${new Date().toISOString()}`);
    this.fullLogText.push(`User: ${userId || 'Anonymous'}`);
    this.fullLogText.push('═'.repeat(80));
    this.fullLogText.push('');

    // Generate new session ID
    this.sessionId = `session-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    this.sessionStartTime = new Date();

    // Clear all storage and start fresh
    sessionStorage.removeItem(this.STORAGE_KEY_CURRENT);
    sessionStorage.removeItem(this.STORAGE_KEY_HISTORY);
    localStorage.removeItem(this.STORAGE_KEY_FULL_LOG);

    this.log('info', `🔐 New Session Started: ${this.sessionId}${userId ? ` (User: ${userId})` : ''}`);
    this.persistToStorage();

    return this.sessionId;
  }

  /**
   * End current session (call on logout)
   */
  endSession(): void {
    // Complete any in-progress transaction
    if (this.currentTransaction && this.currentTransaction.status === 'in_progress') {
      this.completeTransaction('abandoned');
    }

    this.log('info', `🔓 Session Ended: ${this.sessionId}`);

    // Clear everything
    this.sessionId = null;
    this.sessionStartTime = null;
    this.currentTransaction = null;
    this.currentStep = null;
    // Keep history for review but clear storage
    sessionStorage.removeItem(this.STORAGE_KEY_SESSION);
    sessionStorage.removeItem(this.STORAGE_KEY_CURRENT);
  }

  /**
   * Get current session ID
   */
  getSessionId(): string | null {
    return this.sessionId;
  }

  /**
   * Get session info
   */
  getSessionInfo(): { sessionId: string; startTime: Date; transactionCount: number } | null {
    if (!this.sessionId || !this.sessionStartTime) return null;
    return {
      sessionId: this.sessionId,
      startTime: this.sessionStartTime,
      transactionCount: this.transactionHistory.length + (this.currentTransaction ? 1 : 0),
    };
  }

  /**
   * Start a new transaction
   */
  startTransaction(sessionIdOverride?: string): string {
    // Use provided sessionId or current session or generate new one
    const effectiveSessionId = sessionIdOverride || this.sessionId || `session-${Date.now()}`;

    // If no session exists, initialize one
    if (!this.sessionId) {
      this.sessionId = effectiveSessionId;
      this.sessionStartTime = new Date();
    }

    // Complete previous transaction if exists and in progress
    if (this.currentTransaction && this.currentTransaction.status === 'in_progress') {
      this.completeTransaction('abandoned');
    }

    const transactionId = `txn-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    const transactionNumber = this.transactionHistory.length + 1;

    this.currentTransaction = {
      transactionId,
      sessionId: this.sessionId,
      startTime: new Date(),
      status: 'in_progress',
      steps: [],
      summary: [],
    };

    this.log('info', `🚀 Transaction #${transactionNumber} Started: ${transactionId}`);
    this.log('info', `   Session: ${this.sessionId}`);
    this.addSummary(`Transaction #${transactionNumber} started at ${formatTimestamp(this.currentTransaction.startTime)}`);

    this.persistToStorage();
    return transactionId;
  }

  /**
   * Set search criteria for the transaction
   */
  setSearchCriteria(criteria: TransactionLog['searchCriteria']): void {
    if (!this.currentTransaction) {
      this.startTransaction(`session-${Date.now()}`);
    }

    this.currentTransaction!.searchCriteria = criteria;

    const tripTypeLabel = criteria?.tripType === 'return' ? 'Return' : criteria?.tripType === 'openjaw' ? 'Open Jaw' : 'One Way';
    const paxSummary = criteria?.passengers
      ? `${criteria.passengers.adults}A ${criteria.passengers.children}C ${criteria.passengers.infants}I`
      : 'N/A';

    this.addSummary(`Search: ${criteria?.origin} → ${criteria?.destination} | ${criteria?.departureDate}${criteria?.returnDate ? ` - ${criteria.returnDate}` : ''} | ${tripTypeLabel} | ${paxSummary}`);

    this.log('info', formatSelectionBox('SEARCH CRITERIA', {
      'Route': `${criteria?.origin} → ${criteria?.destination}`,
      'Departure': criteria?.departureDate,
      'Return': criteria?.returnDate || 'N/A',
      'Trip Type': tripTypeLabel,
      'Adults': criteria?.passengers?.adults,
      'Children': criteria?.passengers?.children,
      'Infants': criteria?.passengers?.infants,
      'Cabin': criteria?.cabinClass || 'Economy',
    }));
  }

  /**
   * Start a new step
   */
  startStep(stepType: StepType, stepName: string, stepNumber: number): void {
    if (!this.currentTransaction) {
      this.startTransaction(`session-${Date.now()}`);
    }

    // Complete previous step if exists
    if (this.currentStep && this.currentStep.status === 'in_progress') {
      this.completeStep('completed');
    }

    const stepId = `step-${stepNumber}-${stepType}-${Date.now()}`;

    this.currentStep = {
      stepId,
      stepType,
      stepName,
      stepNumber,
      timestamp: new Date(),
      status: 'started',
      userActions: [],
      selections: [],
      apiCalls: [],
      narrative: [],
      warnings: [],
      errors: [],
    };

    this.currentTransaction!.steps.push(this.currentStep);

    const header = `
╔══════════════════════════════════════════════════════════════════════════════╗
║  STEP ${stepNumber}: ${stepName.toUpperCase().padEnd(60)} ║
║  Type: ${stepType.padEnd(66)} ║
║  Started: ${formatTimestamp(this.currentStep.timestamp).padEnd(61)} ║
╚══════════════════════════════════════════════════════════════════════════════╝`;

    this.log('info', header);
    this.currentStep.status = 'in_progress';
    this.addNarrative(`Step ${stepNumber} (${stepName}) started`);
  }

  /**
   * Complete current step
   */
  completeStep(status: 'completed' | 'failed' | 'skipped' = 'completed'): void {
    if (!this.currentStep) return;

    this.currentStep.status = status;
    this.currentStep.duration = Date.now() - this.currentStep.timestamp.getTime();

    const statusEmoji = status === 'completed' ? '✅' : status === 'failed' ? '❌' : '⏭️';
    this.log('info', `\n${statusEmoji} Step ${this.currentStep.stepNumber} ${status.toUpperCase()} (${formatDuration(this.currentStep.duration)})\n`);
    this.addNarrative(`Step ${this.currentStep.stepNumber} ${status} in ${formatDuration(this.currentStep.duration)}`);

    // Persist after each step completion
    this.persistToStorage();

    this.notifyListeners();
  }

  /**
   * Log a user action
   */
  logUserAction(action: string, details?: Record<string, unknown>): void {
    const timestamp = formatTimestamp(new Date());
    const message = `[${timestamp}] 👤 USER: ${action}`;

    this.log('info', message);

    if (this.currentStep) {
      this.currentStep.userActions.push(action);
      this.addNarrative(`User: ${action}`);
    }

    if (details) {
      this.log('debug', `    Details: ${JSON.stringify(details, null, 2)}`);
    }
  }

  /**
   * Log a selection (flight, bundle, service, etc.)
   */
  logSelection(selection: SelectionSnapshot): void {
    if (this.currentStep) {
      this.currentStep.selections.push(selection);
    }

    const directionLabel = selection.direction ? ` (${selection.direction})` : '';
    this.log('info', `📌 SELECTION: ${selection.type.toUpperCase()}${directionLabel}`);
    this.log('info', `   Summary: ${selection.summary}`);
    this.addNarrative(`Selected ${selection.type}${directionLabel}: ${selection.summary}`);

    // Log detailed selection data
    if (selection.type === 'flight') {
      this.logFlightSelection(selection.data);
    } else if (selection.type === 'bundle') {
      this.logBundleSelection(selection.data, selection.direction);
    } else if (selection.type === 'service') {
      this.logServiceSelection(selection.data);
    }
  }

  /**
   * Log flight selection details
   */
  private logFlightSelection(data: Record<string, unknown>): void {
    const box = formatSelectionBox('FLIGHT SELECTION', {
      'Offer ID': String(data.offerId || 'N/A').substring(0, 30) + '...',
      'Flight': data.flightNumber as string,
      'Route': `${data.origin} → ${data.destination}`,
      'Departure': data.departureTime as string,
      'Arrival': data.arrivalTime as string,
      'Duration': data.duration as string,
      'Stops': data.stops as number,
      'Aircraft': data.aircraft as string,
      'Cabin': data.cabinClass as string,
    });
    this.log('debug', box);
  }

  /**
   * Log bundle selection details
   */
  private logBundleSelection(data: Record<string, unknown>, direction?: string): void {
    const box = formatSelectionBox(`BUNDLE SELECTION${direction ? ` (${direction.toUpperCase()})` : ''}`, {
      'Bundle ID': String(data.bundleId || 'N/A').substring(0, 30) + '...',
      'Bundle Name': data.bundleName as string,
      'Bundle Code': data.bundleCode as string,
      'Tier': data.tier as number,
      'Price/Person': `${data.currency} ${data.price}`,
      'Journey Ref': data.journeyRefId as string,
    });
    this.log('debug', box);
  }

  /**
   * Log service selection
   */
  private logServiceSelection(data: Record<string, unknown>): void {
    const box = formatSelectionBox('SERVICE SELECTION', {
      'Service': data.serviceName as string,
      'Code': data.serviceCode as string,
      'Type': data.serviceType as string,
      'Quantity': data.quantity as number,
      'Price': `${data.currency} ${data.price}`,
      'Direction': data.direction as string,
    });
    this.log('debug', box);
  }

  /**
   * Log price snapshot
   */
  logPriceSnapshot(
    label: string,
    total: number,
    currency: string,
    breakdown: PriceBreakdownRow[]
  ): void {
    if (this.currentStep) {
      this.currentStep.priceSnapshot = { total, currency, breakdown };
    }

    const table = formatPriceTable(label, breakdown, { label: 'TOTAL', amount: total, currency });
    this.log('info', table);
    this.addNarrative(`Price: ${currency} ${total.toFixed(2)}`);
  }

  /**
   * Log API call
   */
  logApiCall(call: Omit<ApiCallLog, 'timestamp'>): void {
    const apiLog: ApiCallLog = {
      ...call,
      timestamp: new Date(),
    };

    if (this.currentStep) {
      this.currentStep.apiCalls.push(apiLog);
    }

    const statusEmoji = call.success ? '✅' : '❌';
    const header = `
┌────────────────────────────────────────────────────────────────────────────────┐
│  🔄 API CALL: ${call.operation.padEnd(62)} │
├────────────────────────────────────────────────────────────────────────────────┤
│  Status: ${statusEmoji} ${(call.success ? 'SUCCESS' : 'FAILED').padEnd(66)} │
│  Duration: ${formatDuration(call.duration).padEnd(65)} │
│  Request: ${call.requestSummary.substring(0, 65).padEnd(65)} │
│  Response: ${call.responseSummary.substring(0, 64).padEnd(64)} │
└────────────────────────────────────────────────────────────────────────────────┘`;

    this.log(call.success ? 'success' : 'error', header);

    if (!call.success && call.errorMessage) {
      this.logError(`API Error: ${call.errorMessage}`);
    }

    this.addNarrative(`API: ${call.operation} - ${call.success ? 'Success' : 'Failed'} (${formatDuration(call.duration)})`);
  }

  /**
   * Log warning
   */
  logWarning(message: string, details?: Record<string, unknown>): void {
    this.log('warn', `⚠️  WARNING: ${message}`);

    if (this.currentStep) {
      this.currentStep.warnings.push(message);
    }

    if (details) {
      this.log('debug', `    Details: ${JSON.stringify(details, null, 2)}`);
    }
  }

  /**
   * Log error
   */
  logError(message: string, details?: Record<string, unknown>): void {
    this.log('error', `❌ ERROR: ${message}`);

    if (this.currentStep) {
      this.currentStep.errors.push(message);
    }

    if (details) {
      this.log('debug', `    Details: ${JSON.stringify(details, null, 2)}`);
    }
  }

  /**
   * Log debug data
   */
  logDebug(label: string, data: unknown): void {
    this.log('debug', `🔍 DEBUG [${label}]:`);
    this.log('debug', typeof data === 'string' ? data : JSON.stringify(data, null, 2));

    if (this.currentStep && typeof data === 'object') {
      this.currentStep.debugData = {
        ...this.currentStep.debugData,
        [label]: data,
      };
    }
  }

  /**
   * Complete transaction
   */
  completeTransaction(
    status: 'completed' | 'failed' | 'abandoned' = 'completed',
    outcome?: TransactionLog['outcome']
  ): void {
    if (!this.currentTransaction) return;

    // Complete current step if exists
    if (this.currentStep && this.currentStep.status === 'in_progress') {
      this.completeStep(status === 'completed' ? 'completed' : 'failed');
    }

    this.currentTransaction.endTime = new Date();
    this.currentTransaction.status = status;
    this.currentTransaction.outcome = outcome;

    const duration = this.currentTransaction.endTime.getTime() - this.currentTransaction.startTime.getTime();

    const statusEmoji = status === 'completed' ? '🎉' : status === 'failed' ? '💥' : '🚪';
    const footer = `
╔══════════════════════════════════════════════════════════════════════════════╗
║  ${statusEmoji} TRANSACTION ${status.toUpperCase().padEnd(60)} ║
║  ID: ${this.currentTransaction.transactionId.padEnd(67)} ║
║  Duration: ${formatDuration(duration).padEnd(61)} ║
║  Steps Completed: ${String(this.currentTransaction.steps.filter(s => s.status === 'completed').length).padEnd(54)} ║
${outcome?.pnr ? `║  PNR: ${outcome.pnr.padEnd(66)} ║\n` : ''}${outcome?.totalPaid ? `║  Total Paid: ${outcome.currency} ${outcome.totalPaid.toFixed(2).padEnd(55)} ║\n` : ''}╚══════════════════════════════════════════════════════════════════════════════╝`;

    this.log('info', footer);

    // Add to history
    this.transactionHistory.push({ ...this.currentTransaction });

    // Generate summary
    this.generateTransactionSummary();

    // Persist to storage
    this.persistToStorage();

    this.notifyListeners();
  }

  /**
   * Generate transaction summary
   */
  private generateTransactionSummary(): void {
    if (!this.currentTransaction) return;

    const summary: string[] = [
      '',
      '═'.repeat(80),
      ' TRANSACTION SUMMARY',
      '═'.repeat(80),
      '',
    ];

    // Search info
    if (this.currentTransaction.searchCriteria) {
      const sc = this.currentTransaction.searchCriteria;
      summary.push(`📍 Route: ${sc.origin} → ${sc.destination}${sc.returnDate ? ` (Return: ${sc.returnDate})` : ''}`);
      summary.push(`📅 Date: ${sc.departureDate}`);
      summary.push(`👥 Passengers: ${sc.passengers.adults}A ${sc.passengers.children}C ${sc.passengers.infants}I`);
      summary.push('');
    }

    // Steps overview
    summary.push('📋 STEPS:');
    for (const step of this.currentTransaction.steps) {
      const statusIcon = step.status === 'completed' ? '✅' : step.status === 'failed' ? '❌' : '⏭️';
      const duration = step.duration ? ` (${formatDuration(step.duration)})` : '';
      summary.push(`   ${statusIcon} Step ${step.stepNumber}: ${step.stepName}${duration}`);

      // Key selections
      for (const sel of step.selections) {
        summary.push(`      └─ ${sel.type}: ${sel.summary}`);
      }

      // Price at step
      if (step.priceSnapshot) {
        summary.push(`      └─ Price: ${step.priceSnapshot.currency} ${step.priceSnapshot.total.toFixed(2)}`);
      }
    }

    // Outcome
    if (this.currentTransaction.outcome) {
      summary.push('');
      summary.push('🎯 OUTCOME:');
      if (this.currentTransaction.outcome.pnr) {
        summary.push(`   PNR: ${this.currentTransaction.outcome.pnr}`);
      }
      if (this.currentTransaction.outcome.totalPaid) {
        summary.push(`   Total: ${this.currentTransaction.outcome.currency} ${this.currentTransaction.outcome.totalPaid.toFixed(2)}`);
      }
    }

    // Warnings & Errors
    const allWarnings = this.currentTransaction.steps.flatMap(s => s.warnings);
    const allErrors = this.currentTransaction.steps.flatMap(s => s.errors);

    if (allWarnings.length > 0) {
      summary.push('');
      summary.push(`⚠️  WARNINGS (${allWarnings.length}):`);
      allWarnings.slice(0, 5).forEach(w => summary.push(`   - ${w}`));
      if (allWarnings.length > 5) summary.push(`   ... and ${allWarnings.length - 5} more`);
    }

    if (allErrors.length > 0) {
      summary.push('');
      summary.push(`❌ ERRORS (${allErrors.length}):`);
      allErrors.slice(0, 5).forEach(e => summary.push(`   - ${e}`));
      if (allErrors.length > 5) summary.push(`   ... and ${allErrors.length - 5} more`);
    }

    summary.push('');
    summary.push('═'.repeat(80));

    this.currentTransaction.summary = summary;
    console.log(summary.join('\n'));
  }

  /**
   * Add to transaction summary narrative
   */
  private addSummary(text: string): void {
    if (this.currentTransaction) {
      this.currentTransaction.summary.push(text);
    }
  }

  /**
   * Add to current step narrative
   */
  private addNarrative(text: string): void {
    if (this.currentStep) {
      this.currentStep.narrative.push(`[${formatTimestamp(new Date())}] ${text}`);
    }
  }

  /**
   * Core logging function
   */
  private log(level: LogLevel, message: string): void {
    const timestamp = formatTimestamp(new Date());
    const prefix = {
      info: '   ',
      debug: '🔍 ',
      warn: '⚠️  ',
      error: '❌ ',
      success: '✅ ',
    }[level];

    const fullMessage = `[${timestamp}] ${prefix}${message}`;

    // Append to full log text (for file export)
    // Handle multi-line messages
    const lines = fullMessage.split('\n');
    this.fullLogText.push(...lines);

    switch (level) {
      case 'error':
        console.error(fullMessage);
        break;
      case 'warn':
        console.warn(fullMessage);
        break;
      case 'debug':
        console.debug(fullMessage);
        break;
      default:
        console.log(fullMessage);
    }
  }

  /**
   * Get current transaction
   */
  getCurrentTransaction(): TransactionLog | null {
    return this.currentTransaction;
  }

  /**
   * Get current step
   */
  getCurrentStep(): StepLog | null {
    return this.currentStep;
  }

  /**
   * Get transaction history
   */
  getTransactionHistory(): TransactionLog[] {
    return [...this.transactionHistory];
  }

  /**
   * Export current transaction as JSON
   */
  exportAsJson(): string {
    if (!this.currentTransaction) return '{}';
    return JSON.stringify(this.currentTransaction, null, 2);
  }

  /**
   * Export current transaction as text report
   */
  exportAsText(): string {
    if (!this.currentTransaction) return 'No active transaction';

    const lines: string[] = [];

    lines.push('═'.repeat(80));
    lines.push(' TRANSACTION REPORT');
    lines.push('═'.repeat(80));
    lines.push('');
    lines.push(`Transaction ID: ${this.currentTransaction.transactionId}`);
    lines.push(`Session ID: ${this.currentTransaction.sessionId}`);
    lines.push(`Status: ${this.currentTransaction.status}`);
    lines.push(`Started: ${formatTimestamp(this.currentTransaction.startTime)}`);
    if (this.currentTransaction.endTime) {
      lines.push(`Ended: ${formatTimestamp(this.currentTransaction.endTime)}`);
    }
    lines.push('');

    // Search criteria
    if (this.currentTransaction.searchCriteria) {
      lines.push('─'.repeat(80));
      lines.push(' SEARCH CRITERIA');
      lines.push('─'.repeat(80));
      lines.push(JSON.stringify(this.currentTransaction.searchCriteria, null, 2));
      lines.push('');
    }

    // Steps
    for (const step of this.currentTransaction.steps) {
      lines.push('─'.repeat(80));
      lines.push(` STEP ${step.stepNumber}: ${step.stepName}`);
      lines.push('─'.repeat(80));
      lines.push(`Type: ${step.stepType}`);
      lines.push(`Status: ${step.status}`);
      lines.push(`Started: ${formatTimestamp(step.timestamp)}`);
      if (step.duration) {
        lines.push(`Duration: ${formatDuration(step.duration)}`);
      }
      lines.push('');

      // User Actions
      if (step.userActions.length > 0) {
        lines.push('User Actions:');
        step.userActions.forEach(a => lines.push(`  - ${a}`));
        lines.push('');
      }

      // Selections
      if (step.selections.length > 0) {
        lines.push('Selections:');
        step.selections.forEach(s => {
          lines.push(`  [${s.type}${s.direction ? ` - ${s.direction}` : ''}] ${s.summary}`);
        });
        lines.push('');
      }

      // Price
      if (step.priceSnapshot) {
        lines.push(`Price: ${step.priceSnapshot.currency} ${step.priceSnapshot.total.toFixed(2)}`);
        lines.push('');
      }

      // API Calls
      if (step.apiCalls.length > 0) {
        lines.push('API Calls:');
        step.apiCalls.forEach(api => {
          lines.push(`  ${api.success ? '✓' : '✗'} ${api.operation} (${formatDuration(api.duration)})`);
          if (!api.success && api.errorMessage) {
            lines.push(`    Error: ${api.errorMessage}`);
          }
        });
        lines.push('');
      }

      // Narrative
      if (step.narrative.length > 0) {
        lines.push('Narrative:');
        step.narrative.forEach(n => lines.push(`  ${n}`));
        lines.push('');
      }

      // Warnings
      if (step.warnings.length > 0) {
        lines.push('Warnings:');
        step.warnings.forEach(w => lines.push(`  ⚠️  ${w}`));
        lines.push('');
      }

      // Errors
      if (step.errors.length > 0) {
        lines.push('Errors:');
        step.errors.forEach(e => lines.push(`  ❌ ${e}`));
        lines.push('');
      }
    }

    // Outcome
    if (this.currentTransaction.outcome) {
      lines.push('─'.repeat(80));
      lines.push(' OUTCOME');
      lines.push('─'.repeat(80));
      lines.push(JSON.stringify(this.currentTransaction.outcome, null, 2));
      lines.push('');
    }

    // Summary
    if (this.currentTransaction.summary.length > 0) {
      lines.push('─'.repeat(80));
      lines.push(' SUMMARY');
      lines.push('─'.repeat(80));
      this.currentTransaction.summary.forEach(s => lines.push(s));
    }

    lines.push('═'.repeat(80));

    return lines.join('\n');
  }

  /**
   * Get the full session log (all console output since session start)
   * This is the primary log for investigation - contains everything
   */
  getFullLog(): string {
    return this.fullLogText.join('\n');
  }

  /**
   * Get full log as array of lines
   */
  getFullLogLines(): string[] {
    return [...this.fullLogText];
  }

  /**
   * Download transaction log as file
   */
  downloadLog(format: 'json' | 'text' | 'full' = 'text'): void {
    let content: string;
    let filename: string;

    if (format === 'full') {
      // Download the full session log (everything logged since session start)
      content = this.getFullLog();
      filename = `session-log-${this.sessionId || 'unknown'}.txt`;
    } else if (format === 'json') {
      content = this.exportAsJson();
      filename = `transaction-${this.currentTransaction?.transactionId || 'unknown'}.json`;
    } else {
      content = this.exportAsText();
      filename = `transaction-${this.currentTransaction?.transactionId || 'unknown'}.txt`;
    }

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /**
   * Subscribe to log updates
   */
  subscribe(listener: (log: TransactionLog) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Notify all listeners
   */
  private notifyListeners(): void {
    if (this.currentTransaction) {
      this.listeners.forEach(listener => listener(this.currentTransaction!));
    }
  }

  /**
   * Clear current transaction (for testing)
   */
  clear(): void {
    this.currentTransaction = null;
    this.currentStep = null;
  }
}

// =============================================================================
// SINGLETON EXPORT
// =============================================================================

export const TransactionLogger = new TransactionLoggerService();

// Default export for convenience
export default TransactionLogger;
