/**
 * XmlLogPanel - Right slide-out panel for XML logging
 *
 * Features:
 * - Right slide panel (drawer style)
 * - Sidebar list of API calls with status indicators
 * - Main content area with summary card + raw XML
 * - Individual download + ZIP export
 * - Copy to clipboard functionality
 */

import { useState, useCallback, useMemo } from 'react';
import {
  X, ChevronLeft, ChevronRight, Download, Archive, Trash2,
  Copy, Check, AlertCircle, Clock, CheckCircle2, Loader2,
  Plane, Users, Briefcase, Tag, CreditCard, Package,
  Code2
} from 'lucide-react';
import { useXmlViewer, type XmlCapture } from '../../core/context/XmlViewerContext';
// cn utility - inline to avoid import issues
function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(' ');
}
import JSZip from 'jszip';

/**
 * Beautify XML string with proper indentation
 */
function formatXml(xml: string): string {
  // Remove existing whitespace between tags
  let formatted = xml.replace(/>\s*</g, '><');

  // Add newlines and indentation
  let indent = 0;
  const parts = formatted.split(/(<[^>]+>)/g).filter(Boolean);
  const lines: string[] = [];

  for (const part of parts) {
    if (!part.startsWith('<')) {
      // Text content - add to current line
      const trimmed = part.trim();
      if (trimmed) {
        if (lines.length > 0) {
          lines[lines.length - 1] += trimmed;
        } else {
          lines.push(trimmed);
        }
      }
      continue;
    }

    const isClosingTag = part.startsWith('</');
    const isSelfClosing = part.endsWith('/>');
    const isDeclaration = part.startsWith('<?') || part.startsWith('<!');

    if (isClosingTag) {
      indent = Math.max(0, indent - 1);
    }

    lines.push('  '.repeat(indent) + part);

    if (!isClosingTag && !isSelfClosing && !isDeclaration) {
      indent++;
    }
  }

  return lines.join('\n');
}

/**
 * Parse XML request to extract meaningful details for display
 */
interface ParsedXmlInfo {
  operation: string;
  title: string;
  subtitle: string;
  routes: string[];
  passengers: string;
  hasServices: boolean;
  serviceTypes: string[];
}

function parseXmlRequest(xml: string, operation: string): ParsedXmlInfo {
  const info: ParsedXmlInfo = {
    operation,
    title: operation,
    subtitle: '',
    routes: [],
    passengers: '',
    hasServices: false,
    serviceTypes: [],
  };

  try {
    // Extract origin-destination pairs
    const originMatches = xml.match(/<OriginDepCriteria>[\s\S]*?<IATA_LocationCode>(\w{3})<\/IATA_LocationCode>/g);
    const destMatches = xml.match(/<DestArrivalCriteria>[\s\S]*?<IATA_LocationCode>(\w{3})<\/IATA_LocationCode>/g);

    if (originMatches && destMatches) {
      const origins: string[] = [];
      const destinations: string[] = [];

      originMatches.forEach(match => {
        const code = match.match(/<IATA_LocationCode>(\w{3})<\/IATA_LocationCode>/);
        if (code) origins.push(code[1]);
      });

      destMatches.forEach(match => {
        const code = match.match(/<IATA_LocationCode>(\w{3})<\/IATA_LocationCode>/);
        if (code) destinations.push(code[1]);
      });

      // Build route strings
      for (let i = 0; i < Math.min(origins.length, destinations.length); i++) {
        info.routes.push(`${origins[i]}-${destinations[i]}`);
      }
    }

    // Alternative: Check for OrderID (for retrieve/cancel operations)
    const orderIdMatch = xml.match(/<OrderID[^>]*>([^<]+)<\/OrderID>/);
    if (orderIdMatch) {
      info.subtitle = `Order: ${orderIdMatch[1]}`;
    }

    // Extract passenger counts
    const paxIds = xml.match(/<PaxID>(\w+)<\/PaxID>/g);
    if (paxIds) {
      const adtCount = paxIds.filter(p => p.includes('ADT')).length;
      const chdCount = paxIds.filter(p => p.includes('CHD')).length;
      const infCount = paxIds.filter(p => p.includes('INF')).length;

      const parts = [];
      if (adtCount > 0) parts.push(`${adtCount} ADT`);
      if (chdCount > 0) parts.push(`${chdCount} CHD`);
      if (infCount > 0) parts.push(`${infCount} INF`);
      info.passengers = parts.join(', ');
    }

    // Check for cabin type
    const cabinMatch = xml.match(/<CabinTypeCode>(\d)<\/CabinTypeCode>/);
    const cabinType = cabinMatch ? (cabinMatch[1] === '4' ? 'Business' : 'Economy') : '';

    // Check for services (SSRs)
    if (xml.includes('<ServiceCriteria>') || xml.includes('<ALaCarteOfferItem>') || xml.includes('<ServiceID>')) {
      info.hasServices = true;

      // Detect service types
      if (xml.includes('RFIC>G<') || xml.includes('BaggageAllowance')) info.serviceTypes.push('Bags');
      if (xml.includes('RFIC>F<') || xml.includes('RFISC>0B5')) info.serviceTypes.push('Meals');
      if (xml.includes('SeatAssignment') || xml.includes('RFISC>050')) info.serviceTypes.push('Seats');
    }

    // Build title based on operation and parsed data
    if (operation === 'AirShopping') {
      const routeStr = info.routes.length > 0 ? info.routes.join(' + ') : '';
      info.title = `AirShopping${routeStr ? ` (${routeStr})` : ''}`;
      if (cabinType) info.subtitle = cabinType;
    } else if (operation === 'OfferPrice') {
      const routeStr = info.routes.length > 0 ? info.routes.join(' + ') : '';
      const servicesStr = info.hasServices ? ' + SSRs' : '';
      info.title = `OfferPrice${routeStr ? ` (${routeStr}${servicesStr})` : ''}`;
      if (info.serviceTypes.length > 0) {
        info.subtitle = `Services: ${info.serviceTypes.join(', ')}`;
      }
    } else if (operation === 'ServiceList') {
      const routeStr = info.routes.length > 0 ? info.routes.join(' + ') : '';
      info.title = `ServiceList${routeStr ? ` (${routeStr})` : ''}`;
    } else if (operation === 'SeatAvailability') {
      info.title = 'SeatAvailability';
    } else if (operation === 'OrderCreate') {
      const routeStr = info.routes.length > 0 ? info.routes.join(' + ') : '';
      info.title = `OrderCreate${routeStr ? ` (${routeStr})` : ''}`;
    } else if (operation === 'OrderRetrieve') {
      info.title = 'OrderRetrieve';
    } else if (operation === 'OrderCancel') {
      info.title = 'OrderCancel';
    }

  } catch (e) {
    console.error('Error parsing XML:', e);
  }

  return info;
}

// Operation icons
const OPERATION_ICONS: Record<string, typeof Plane> = {
  'AirShopping': Plane,
  'OfferPrice': Tag,
  'ServiceList': Package,
  'SeatAvailability': Users,
  'OrderCreate': CreditCard,
  'OrderRetrieve': Briefcase,
  'OrderCancel': X,
};


interface XmlLogPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onToggle: () => void;
}

export function XmlLogPanel({ isOpen, onClose, onToggle }: XmlLogPanelProps) {
  const {
    clearCaptures,
    getCurrentSessionCaptures,
    currentCorrelationId
  } = useXmlViewer();

  const [expandedCaptures, setExpandedCaptures] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<Record<string, 'request' | 'response'>>({});
  const [copied, setCopied] = useState<string | null>(null);

  // Get current session captures sorted by sequence
  const sessionCaptures = getCurrentSessionCaptures().sort(
    (a, b) => a.sequenceNumber - b.sequenceNumber
  );

  // Toggle capture expansion
  const toggleCapture = (captureId: string) => {
    setExpandedCaptures(prev => {
      const next = new Set(prev);
      if (next.has(captureId)) {
        next.delete(captureId);
      } else {
        next.add(captureId);
      }
      return next;
    });
  };

  // Copy XML to clipboard
  const handleCopy = useCallback(async (captureId: string, type: 'request' | 'response', xml: string) => {
    await navigator.clipboard.writeText(xml);
    setCopied(`${captureId}-${type}`);
    setTimeout(() => setCopied(null), 2000);
  }, []);

  // Download individual XML
  const handleDownloadXml = useCallback((capture: XmlCapture, type: 'request' | 'response') => {
    const xml = type === 'request' ? capture.request : capture.response;
    const suffix = type === 'request' ? 'RQ' : 'RS';
    const timestamp = capture.timestamp.toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `${String(capture.sequenceNumber).padStart(2, '0')}_${capture.operation}_${suffix}_${timestamp}.xml`;

    const blob = new Blob([xml], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  // Download all as ZIP
  const handleDownloadZip = useCallback(async () => {
    if (sessionCaptures.length === 0) return;

    const zip = new JSZip();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

    // Add README
    const readme = generateReadme(sessionCaptures, currentCorrelationId);
    zip.file('README.txt', readme);

    // Add each XML
    for (const capture of sessionCaptures) {
      const seqNum = String(capture.sequenceNumber).padStart(2, '0');
      const captureTime = capture.timestamp.toISOString().replace(/[:.]/g, '-').slice(0, 19);

      // Request
      zip.file(
        `${seqNum}_${capture.operation}_RQ_${captureTime}.xml`,
        capture.request
      );

      // Response
      zip.file(
        `${seqNum}_${capture.operation}_RS_${captureTime}.xml`,
        capture.response
      );
    }

    const content = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(content);
    const a = document.createElement('a');
    a.href = url;
    a.download = `NDC_Session_${timestamp}.zip`;
    a.click();
    URL.revokeObjectURL(url);
  }, [sessionCaptures, currentCorrelationId]);

  // Generate README for ZIP
  const generateReadme = (caps: XmlCapture[], correlationId: string): string => {
    const lines = [
      '═'.repeat(80),
      'NDC API Transaction Log',
      '═'.repeat(80),
      '',
      `Session ID: ${correlationId}`,
      `Generated: ${new Date().toISOString()}`,
      `Total API Calls: ${caps.length}`,
      '',
      '─'.repeat(80),
      'API Call Sequence:',
      '─'.repeat(80),
      '',
    ];

    for (const cap of caps) {
      const status = cap.status === 'success' ? '✓' : '✗';
      lines.push(
        `${String(cap.sequenceNumber).padStart(2, '0')}. [${status}] ${cap.operation}`,
        `    Time: ${cap.timestamp.toISOString()}`,
        `    Duration: ${cap.duration}ms`,
        `    Status: ${cap.status}`,
        ''
      );
    }

    lines.push(
      '─'.repeat(80),
      'File Naming Convention:',
      '─'.repeat(80),
      '',
      'Files are named: {sequence}_{operation}_{type}_{timestamp}.xml',
      '  - sequence: 2-digit sequence number (01, 02, ...)',
      '  - operation: NDC operation name (AirShopping, OfferPrice, etc.)',
      '  - type: RQ (Request) or RS (Response)',
      '  - timestamp: ISO timestamp',
      '',
      '═'.repeat(80),
    );

    return lines.join('\n');
  };

  // Get operation icon
  const getOperationIcon = (operation: string) => {
    const Icon = OPERATION_ICONS[operation] || Briefcase;
    return Icon;
  };

  // Floating toggle button when closed (only show if there are captures)
  if (!isOpen) {
    if (sessionCaptures.length === 0) {
      return null;
    }

    return (
      <button
        onClick={onToggle}
        className="fixed right-0 top-1/2 -translate-y-1/2 z-40 bg-slate-800 text-white px-2 py-4 rounded-l-lg shadow-lg hover:bg-slate-700 transition-colors flex flex-col items-center gap-2"
        title="Open XML Logs"
      >
        <Code2 className="h-5 w-5" />
        <span className="text-xs font-medium writing-mode-vertical" style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' }}>
          XML Logs
        </span>
        <span className="bg-orange-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
          {sessionCaptures.length}
        </span>
        <ChevronLeft className="h-4 w-4" />
      </button>
    );
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/20 z-40 transition-opacity"
        onClick={onClose}
      />

      {/* Slide panel - Half screen width for better XML readability */}
      <div className="fixed right-0 top-0 bottom-0 w-1/2 min-w-[600px] max-w-[90vw] bg-white shadow-2xl z-50 flex flex-col animate-slide-in-right">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-slate-800 text-white">
          <div className="flex items-center gap-3">
            <button onClick={onClose} className="hover:bg-slate-700 p-1.5 rounded">
              <ChevronRight className="h-5 w-5" />
            </button>
            <Code2 className="h-5 w-5 text-orange-400" />
            <div>
              <span className="font-semibold">XML Logs</span>
              <span className="text-xs text-slate-400 ml-2">
                {sessionCaptures.length} calls
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={clearCaptures}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs bg-slate-700 hover:bg-slate-600 rounded transition-colors"
              title="Clear all logs"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Clear
            </button>
            <button
              onClick={handleDownloadZip}
              disabled={sessionCaptures.length === 0}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs bg-orange-500 hover:bg-orange-600 rounded disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              title="Download all as ZIP"
            >
              <Archive className="h-3.5 w-3.5" />
              Export ZIP
            </button>
            <button onClick={onClose} className="hover:bg-slate-700 p-1.5 rounded ml-1">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto">
          {sessionCaptures.length === 0 ? (
            <div className="flex h-full items-center justify-center text-slate-500">
              <div className="text-center">
                <Clock className="h-12 w-12 mx-auto mb-3 opacity-40" />
                <p className="font-medium">No API calls yet</p>
                <p className="text-sm text-slate-400 mt-1">Start a search to capture XML logs</p>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-slate-200">
              {sessionCaptures.map((capture) => {
                const Icon = getOperationIcon(capture.operation);
                const isExpanded = expandedCaptures.has(capture.id);
                const captureTab = activeTab[capture.id] || 'request';
                const parsedInfo = parseXmlRequest(capture.request, capture.operation);

                return (
                  <div key={capture.id} className="bg-white">
                    {/* Header - Always visible */}
                    <button
                      onClick={() => toggleCapture(capture.id)}
                      className="w-full px-3 py-1.5 flex items-center gap-2 hover:bg-slate-50 transition-colors text-left"
                    >
                      <span className="text-[10px] text-slate-400 font-mono w-5">
                        #{capture.sequenceNumber}
                      </span>

                      <div className={cn(
                        "p-1 rounded",
                        capture.status === 'success' ? "bg-emerald-100" : "bg-red-100"
                      )}>
                        <Icon className={cn(
                          "h-3 w-3",
                          capture.status === 'success' ? "text-emerald-600" : "text-red-600"
                        )} />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-medium text-slate-900 truncate">
                            {parsedInfo.title}
                          </span>
                          {capture.status === 'success' ? (
                            <CheckCircle2 className="h-3 w-3 text-emerald-500 flex-shrink-0" />
                          ) : capture.status === 'error' ? (
                            <AlertCircle className="h-3 w-3 text-red-500 flex-shrink-0" />
                          ) : (
                            <Loader2 className="h-3 w-3 text-amber-500 animate-spin flex-shrink-0" />
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
                          <span>{capture.timestamp.toLocaleTimeString()}</span>
                          <span>•</span>
                          <span>{capture.duration}ms</span>
                          {parsedInfo.passengers && (
                            <>
                              <span>•</span>
                              <span>{parsedInfo.passengers}</span>
                            </>
                          )}
                        </div>
                      </div>

                      <ChevronRight className={cn(
                        "h-4 w-4 text-slate-400 transition-transform flex-shrink-0",
                        isExpanded && "rotate-90"
                      )} />
                    </button>

                    {/* Expanded content - XML Request/Response */}
                    {isExpanded && (
                      <div className="border-t border-slate-200 bg-slate-50">
                        {/* Tab selector and actions */}
                        <div className="flex items-center justify-between px-3 py-1 bg-white border-b border-slate-100">
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => setActiveTab(prev => ({ ...prev, [capture.id]: 'request' }))}
                              className={cn(
                                "px-2 py-1 text-[11px] rounded transition-colors",
                                captureTab === 'request'
                                  ? "bg-slate-900 text-white font-medium"
                                  : "text-slate-600 hover:bg-slate-100"
                              )}
                            >
                              Request
                            </button>
                            <button
                              onClick={() => setActiveTab(prev => ({ ...prev, [capture.id]: 'response' }))}
                              className={cn(
                                "px-2 py-1 text-[11px] rounded transition-colors",
                                captureTab === 'response'
                                  ? "bg-slate-900 text-white font-medium"
                                  : "text-slate-600 hover:bg-slate-100"
                              )}
                            >
                              Response
                            </button>
                          </div>

                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleCopy(capture.id, captureTab, captureTab === 'request' ? capture.request : capture.response)}
                              className="p-1 text-slate-600 hover:bg-slate-100 rounded transition-colors"
                              title="Copy to clipboard"
                            >
                              {copied === `${capture.id}-${captureTab}` ? (
                                <Check className="h-3 w-3 text-emerald-500" />
                              ) : (
                                <Copy className="h-3 w-3" />
                              )}
                            </button>
                            <button
                              onClick={() => handleDownloadXml(capture, captureTab)}
                              className="p-1 text-slate-600 hover:bg-slate-100 rounded transition-colors"
                              title="Download XML"
                            >
                              <Download className="h-3 w-3" />
                            </button>
                          </div>
                        </div>

                        {/* XML content - Larger height for better readability */}
                        <div className="max-h-[60vh] overflow-auto">
                          <XmlContent
                            xml={captureTab === 'request' ? capture.request : capture.response}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// Beautified and syntax-highlighted XML content display with line numbers
function XmlContent({ xml }: { xml: string }) {
  // Memoize the formatted XML
  const formattedXml = useMemo(() => formatXml(xml), [xml]);
  const lines = useMemo(() => formattedXml.split('\n'), [formattedXml]);

  return (
    <div className="flex-1 overflow-auto bg-slate-900">
      <div className="flex min-h-full">
        {/* Line numbers column */}
        <div className="flex-shrink-0 bg-slate-800/50 text-slate-500 text-right select-none border-r border-slate-700 sticky left-0">
          {lines.map((_, idx) => (
            <div key={idx} className="px-3 py-0.5 text-xs font-mono leading-6">
              {idx + 1}
            </div>
          ))}
        </div>

        {/* XML content column */}
        <div className="flex-1 overflow-x-auto">
          <pre className="p-3 text-xs font-mono leading-6">
            {lines.map((line, lineIndex) => (
              <XmlLine key={lineIndex} line={line} lineIndex={lineIndex} />
            ))}
          </pre>
        </div>
      </div>
    </div>
  );
}

// Individual XML line with syntax highlighting
function XmlLine({ line, lineIndex }: { line: string; lineIndex: number }) {
  const elements: JSX.Element[] = [];
  let remaining = line;
  let keyIndex = 0;

  while (remaining.length > 0) {
    // Leading whitespace
    const leadingMatch = remaining.match(/^(\s+)/);
    if (leadingMatch) {
      elements.push(<span key={`${lineIndex}-${keyIndex++}`}>{leadingMatch[1]}</span>);
      remaining = remaining.slice(leadingMatch[1].length);
      continue;
    }

    // XML declaration <?...?>
    const declMatch = remaining.match(/^(<\?[\s\S]*?\?>)/);
    if (declMatch) {
      elements.push(
        <span key={`${lineIndex}-${keyIndex++}`} className="text-slate-500">{declMatch[1]}</span>
      );
      remaining = remaining.slice(declMatch[1].length);
      continue;
    }

    // Comment <!--...-->
    const commentMatch = remaining.match(/^(<!--[\s\S]*?-->)/);
    if (commentMatch) {
      elements.push(
        <span key={`${lineIndex}-${keyIndex++}`} className="text-slate-500 italic">{commentMatch[1]}</span>
      );
      remaining = remaining.slice(commentMatch[1].length);
      continue;
    }

    // Closing tag </...>
    const closingMatch = remaining.match(/^(<\/)([\w:.-]+)(>)/);
    if (closingMatch) {
      elements.push(
        <span key={`${lineIndex}-${keyIndex++}`} className="text-slate-500">{closingMatch[1]}</span>,
        <span key={`${lineIndex}-${keyIndex++}`} className="text-sky-400">{closingMatch[2]}</span>,
        <span key={`${lineIndex}-${keyIndex++}`} className="text-slate-500">{closingMatch[3]}</span>
      );
      remaining = remaining.slice(closingMatch[0].length);
      continue;
    }

    // Opening tag with attributes
    const openMatch = remaining.match(/^(<)([\w:.-]+)/);
    if (openMatch) {
      elements.push(
        <span key={`${lineIndex}-${keyIndex++}`} className="text-slate-500">{openMatch[1]}</span>,
        <span key={`${lineIndex}-${keyIndex++}`} className="text-sky-400">{openMatch[2]}</span>
      );
      remaining = remaining.slice(openMatch[0].length);

      // Parse attributes
      while (remaining.length > 0 && !remaining.startsWith('>') && !remaining.startsWith('/>')) {
        const wsMatch = remaining.match(/^(\s+)/);
        if (wsMatch) {
          elements.push(<span key={`${lineIndex}-${keyIndex++}`}>{wsMatch[1]}</span>);
          remaining = remaining.slice(wsMatch[1].length);
          continue;
        }

        const attrMatch = remaining.match(/^([\w:.-]+)(=)("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/);
        if (attrMatch) {
          elements.push(
            <span key={`${lineIndex}-${keyIndex++}`} className="text-amber-400">{attrMatch[1]}</span>,
            <span key={`${lineIndex}-${keyIndex++}`} className="text-slate-500">{attrMatch[2]}</span>,
            <span key={`${lineIndex}-${keyIndex++}`} className="text-emerald-400">{attrMatch[3]}</span>
          );
          remaining = remaining.slice(attrMatch[0].length);
          continue;
        }

        elements.push(<span key={`${lineIndex}-${keyIndex++}`}>{remaining[0]}</span>);
        remaining = remaining.slice(1);
      }

      if (remaining.startsWith('/>')) {
        elements.push(<span key={`${lineIndex}-${keyIndex++}`} className="text-slate-500">/&gt;</span>);
        remaining = remaining.slice(2);
      } else if (remaining.startsWith('>')) {
        elements.push(<span key={`${lineIndex}-${keyIndex++}`} className="text-slate-500">&gt;</span>);
        remaining = remaining.slice(1);
      }
      continue;
    }

    // Text content
    const textMatch = remaining.match(/^([^<]+)/);
    if (textMatch) {
      elements.push(
        <span key={`${lineIndex}-${keyIndex++}`} className="text-orange-300">{textMatch[1]}</span>
      );
      remaining = remaining.slice(textMatch[1].length);
      continue;
    }

    elements.push(<span key={`${lineIndex}-${keyIndex++}`}>{remaining[0]}</span>);
    remaining = remaining.slice(1);
  }

  return (
    <div className="whitespace-pre hover:bg-slate-800/50 px-1 -mx-1 rounded">
      {elements.length > 0 ? elements : '\u00A0'}
    </div>
  );
}
