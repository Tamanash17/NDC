import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';

/**
 * Human-readable summary for display in XML Log Panel
 */
export interface XmlCaptureSummary {
  title: string;
  subtitle: string;
  details: Array<{
    label: string;
    value: string;
    icon?: 'plane' | 'users' | 'calendar' | 'briefcase' | 'tag' | 'credit-card' | 'package';
  }>;
  highlights?: Array<{
    label: string;
    value: string;
    color: 'blue' | 'green' | 'amber' | 'red';
  }>;
}

export interface XmlCapture {
  id: string;
  operation: string;
  timestamp: Date;
  request: string;
  response: string;
  duration: number;
  status: 'success' | 'error';
  correlationId: string;
  sequenceNumber: number;
  userAction?: string;
  /** Human-readable summary for display in log panel */
  summary?: XmlCaptureSummary;
}

// Serializable version for storage
interface StoredXmlCapture {
  id: string;
  operation: string;
  timestamp: string; // ISO string
  request: string;
  response: string;
  duration: number;
  status: 'success' | 'error';
  correlationId: string;
  sequenceNumber: number;
  userAction?: string;
  summary?: XmlCaptureSummary;
}

const STORAGE_KEY = 'ndc-xml-captures';
const CORRELATION_KEY = 'ndc-correlation-id';
const SEQUENCE_KEY = 'ndc-sequence-number';

// Generate a new correlation ID for a user session
function generateCorrelationId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `session_${timestamp}_${random}`;
}

// Get or create correlation ID for current session
function getCorrelationId(): string {
  let correlationId = sessionStorage.getItem(CORRELATION_KEY);
  if (!correlationId) {
    correlationId = generateCorrelationId();
    sessionStorage.setItem(CORRELATION_KEY, correlationId);
  }
  return correlationId;
}

// Get next sequence number for the session
function getNextSequenceNumber(): number {
  const current = parseInt(sessionStorage.getItem(SEQUENCE_KEY) || '0', 10);
  const next = current + 1;
  sessionStorage.setItem(SEQUENCE_KEY, next.toString());
  return next;
}

// Load captures from sessionStorage
function loadCapturesFromStorage(): XmlCapture[] {
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (!stored) return [];

    const parsed: StoredXmlCapture[] = JSON.parse(stored);
    return parsed.map(c => ({
      ...c,
      timestamp: new Date(c.timestamp),
    }));
  } catch {
    return [];
  }
}

// Save captures to sessionStorage
function saveCapturestoStorage(captures: XmlCapture[]) {
  try {
    const toStore: StoredXmlCapture[] = captures.map(c => ({
      ...c,
      timestamp: c.timestamp.toISOString(),
    }));
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(toStore));
  } catch {
    // Storage full or unavailable - ignore
  }
}

// Group captures by correlation ID
export interface CorrelationGroup {
  correlationId: string;
  captures: XmlCapture[];
  firstTimestamp: Date;
  lastTimestamp: Date;
}

interface XmlViewerContextType {
  captures: XmlCapture[];
  correlationGroups: CorrelationGroup[];
  currentCorrelationId: string;
  isOpen: boolean;
  selectedCapture: XmlCapture | null;
  addCapture: (capture: Omit<XmlCapture, 'id' | 'timestamp' | 'correlationId' | 'sequenceNumber'> & { userAction?: string; summary?: XmlCaptureSummary }) => void;
  clearCaptures: () => void;
  startNewSession: () => void;
  openViewer: (capture?: XmlCapture) => void;
  closeViewer: () => void;
  selectCapture: (capture: XmlCapture | null) => void;
  downloadCorrelationZip: (correlationId: string) => Promise<void>;
  /** Get the latest capture for a specific operation (e.g., "OfferPrice", "AirShopping") */
  getLatestCapture: (operationName: string) => XmlCapture | null;
  /** Get all captures for the current session */
  getCurrentSessionCaptures: () => XmlCapture[];
}

const XmlViewerContext = createContext<XmlViewerContextType | null>(null);

export function XmlViewerProvider({ children }: { children: ReactNode }) {
  // Initialize from sessionStorage
  const [captures, setCaptures] = useState<XmlCapture[]>(() => loadCapturesFromStorage());
  const [currentCorrelationId, setCurrentCorrelationId] = useState<string>(() => getCorrelationId());
  const [isOpen, setIsOpen] = useState(false);
  const [selectedCapture, setSelectedCapture] = useState<XmlCapture | null>(null);

  // Persist captures to sessionStorage whenever they change
  useEffect(() => {
    saveCapturestoStorage(captures);
  }, [captures]);

  // Group captures by correlation ID
  const correlationGroups = useCallback((): CorrelationGroup[] => {
    const groups = new Map<string, XmlCapture[]>();

    for (const capture of captures) {
      const existing = groups.get(capture.correlationId) || [];
      existing.push(capture);
      groups.set(capture.correlationId, existing);
    }

    return Array.from(groups.entries())
      .map(([correlationId, groupCaptures]) => {
        // Sort by sequence number
        groupCaptures.sort((a, b) => a.sequenceNumber - b.sequenceNumber);
        return {
          correlationId,
          captures: groupCaptures,
          firstTimestamp: groupCaptures[0]?.timestamp || new Date(),
          lastTimestamp: groupCaptures[groupCaptures.length - 1]?.timestamp || new Date(),
        };
      })
      .sort((a, b) => b.lastTimestamp.getTime() - a.lastTimestamp.getTime());
  }, [captures])();

  const addCapture = useCallback((capture: Omit<XmlCapture, 'id' | 'timestamp' | 'correlationId' | 'sequenceNumber'> & { userAction?: string; summary?: XmlCaptureSummary }) => {
    const correlationId = getCorrelationId();
    const sequenceNumber = getNextSequenceNumber();

    const newCapture: XmlCapture = {
      ...capture,
      id: `xml-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
      correlationId,
      sequenceNumber,
    };
    setCaptures(prev => [newCapture, ...prev].slice(0, 100)); // Keep last 100
  }, []);

  const clearCaptures = useCallback(() => {
    setCaptures([]);
    setSelectedCapture(null);
    sessionStorage.removeItem(STORAGE_KEY);
  }, []);

  // Start a new session with a fresh correlation ID
  const startNewSession = useCallback(() => {
    const newCorrelationId = generateCorrelationId();
    sessionStorage.setItem(CORRELATION_KEY, newCorrelationId);
    sessionStorage.setItem(SEQUENCE_KEY, '0');
    setCurrentCorrelationId(newCorrelationId);
  }, []);

  const openViewer = useCallback((capture?: XmlCapture) => {
    if (capture) setSelectedCapture(capture);
    setIsOpen(true);
  }, []);

  const closeViewer = useCallback(() => {
    setIsOpen(false);
  }, []);

  const selectCapture = useCallback((capture: XmlCapture | null) => {
    setSelectedCapture(capture);
  }, []);

  // Get the latest capture for a specific operation
  const getLatestCapture = useCallback((operationName: string): XmlCapture | null => {
    const correlationId = getCorrelationId();
    const sessionCaptures = captures.filter(c => c.correlationId === correlationId);
    // Find captures that match the operation (partial match for flexibility)
    const matching = sessionCaptures.filter(c =>
      c.operation.toLowerCase().includes(operationName.toLowerCase())
    );
    // Return the most recent one (highest sequence number)
    if (matching.length === 0) return null;
    return matching.sort((a, b) => b.sequenceNumber - a.sequenceNumber)[0];
  }, [captures]);

  // Get all captures for the current session
  const getCurrentSessionCaptures = useCallback((): XmlCapture[] => {
    const correlationId = getCorrelationId();
    return captures
      .filter(c => c.correlationId === correlationId)
      .sort((a, b) => b.sequenceNumber - a.sequenceNumber);
  }, [captures]);

  // Download all captures for a correlation group as ZIP
  const downloadCorrelationZip = useCallback(async (correlationId: string) => {
    try {
      const response = await fetch(`/api/transactions/correlations/${correlationId}/download`);
      if (!response.ok) {
        throw new Error('Failed to download transaction bundle');
      }

      const blob = await response.blob();
      const filename = response.headers.get('Content-Disposition')?.split('filename=')[1]?.replace(/"/g, '')
        || `NDC_Transaction_${correlationId}.zip`;

      // Trigger download
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to download correlation ZIP:', error);
      throw error;
    }
  }, []);

  return (
    <XmlViewerContext.Provider value={{
      captures,
      correlationGroups,
      currentCorrelationId,
      isOpen,
      selectedCapture,
      addCapture,
      clearCaptures,
      startNewSession,
      openViewer,
      closeViewer,
      selectCapture,
      downloadCorrelationZip,
      getLatestCapture,
      getCurrentSessionCaptures,
    }}>
      {children}
    </XmlViewerContext.Provider>
  );
}

export function useXmlViewer() {
  const context = useContext(XmlViewerContext);
  if (!context) {
    throw new Error('useXmlViewer must be used within XmlViewerProvider');
  }
  return context;
}
