import { useState, useCallback } from 'react';
import {
  Code2,
  Copy,
  Check,
  ChevronDown,
  FileCode,
  Send,
  Download,
  Clock,
  CheckCircle,
  XCircle
} from 'lucide-react';
import { cn } from '@/lib/cn';

interface XmlViewerProps {
  /** Operation name (e.g., "AirShopping", "OfferPrice") */
  operation: string;
  /** Request XML */
  requestXml: string;
  /** Response XML */
  responseXml: string;
  /** API call duration in milliseconds */
  duration?: number;
  /** Whether the call was successful */
  success?: boolean;
  /** Additional context/description */
  description?: string;
  /** Compact mode - starts collapsed */
  compact?: boolean;
  /** Custom class name */
  className?: string;
}

/**
 * XmlViewer - A seamless, integrated XML Request/Response viewer
 *
 * Designed to blend into the page with:
 * - Consistent styling with the app (orange accents, slate colors)
 * - Collapsible sections for RQ and RS
 * - Copy to clipboard functionality
 * - Syntax highlighting effect
 * - Download option
 */
export function XmlViewer({
  operation,
  requestXml,
  responseXml,
  duration,
  success = true,
  description,
  compact = true,
  className
}: XmlViewerProps) {
  const [isExpanded, setIsExpanded] = useState(!compact);
  const [activeTab, setActiveTab] = useState<'request' | 'response'>('response');
  const [copiedRq, setCopiedRq] = useState(false);
  const [copiedRs, setCopiedRs] = useState(false);

  const copyToClipboard = useCallback(async (xml: string, type: 'rq' | 'rs') => {
    try {
      await navigator.clipboard.writeText(xml);
      if (type === 'rq') {
        setCopiedRq(true);
        setTimeout(() => setCopiedRq(false), 2000);
      } else {
        setCopiedRs(true);
        setTimeout(() => setCopiedRs(false), 2000);
      }
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }, []);

  const downloadXml = useCallback((xml: string, type: 'RQ' | 'RS') => {
    const timestamp = new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-');
    const filename = `${operation}_${type}_${timestamp}.xml`;

    const header = `<?xml version="1.0" encoding="UTF-8"?>\n<!-- ${operation} ${type} - ${new Date().toISOString()} -->\n`;
    const content = header + xml;

    const blob = new Blob([content], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }, [operation]);

  // Format XML with basic indentation highlighting
  const formatXml = (xml: string): string => {
    if (!xml) return '';
    try {
      // Basic XML formatting
      let formatted = xml
        .replace(/></g, '>\n<')
        .replace(/(<[^>]+>)([^<]+)(<\/[^>]+>)/g, '$1$2$3');
      return formatted;
    } catch {
      return xml;
    }
  };

  const formattedRequest = formatXml(requestXml);
  const formattedResponse = formatXml(responseXml);
  const activeXml = activeTab === 'request' ? formattedRequest : formattedResponse;

  if (!requestXml && !responseXml) return null;

  return (
    <div className={cn(
      'rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white overflow-hidden transition-all duration-300',
      isExpanded ? 'shadow-lg' : 'shadow-sm hover:shadow-md',
      className
    )}>
      {/* Header - Always visible */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-5 py-4 flex items-center justify-between bg-gradient-to-r from-slate-800 to-slate-900 text-white hover:from-slate-700 hover:to-slate-800 transition-all"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-orange-500/20 flex items-center justify-center">
            <Code2 className="w-5 h-5 text-orange-400" />
          </div>
          <div className="text-left">
            <div className="flex items-center gap-2">
              <span className="font-bold text-lg">{operation}</span>
              <span className={cn(
                'px-2 py-0.5 rounded-full text-xs font-semibold',
                success
                  ? 'bg-emerald-500/20 text-emerald-400'
                  : 'bg-red-500/20 text-red-400'
              )}>
                {success ? 'SUCCESS' : 'ERROR'}
              </span>
            </div>
            <div className="flex items-center gap-3 text-slate-400 text-sm">
              {description && <span>{description}</span>}
              {duration && (
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {duration}ms
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-2 text-slate-400 text-sm">
            <FileCode className="w-4 h-4" />
            <span>XML RQ/RS</span>
          </div>
          <div className={cn(
            'w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center transition-transform',
            isExpanded && 'rotate-180'
          )}>
            <ChevronDown className="w-5 h-5" />
          </div>
        </div>
      </button>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="animate-in slide-in-from-top-2 duration-300">
          {/* Tab Selector */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200 bg-slate-50">
            <div className="flex items-center gap-1 p-1 bg-white rounded-lg border border-slate-200">
              <button
                onClick={() => setActiveTab('request')}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all',
                  activeTab === 'request'
                    ? 'bg-orange-500 text-white shadow-sm'
                    : 'text-slate-600 hover:bg-slate-100'
                )}
              >
                <Send className="w-4 h-4" />
                Request (RQ)
              </button>
              <button
                onClick={() => setActiveTab('response')}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all',
                  activeTab === 'response'
                    ? 'bg-orange-500 text-white shadow-sm'
                    : 'text-slate-600 hover:bg-slate-100'
                )}
              >
                {success ? (
                  <CheckCircle className="w-4 h-4" />
                ) : (
                  <XCircle className="w-4 h-4" />
                )}
                Response (RS)
              </button>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => copyToClipboard(activeXml, activeTab === 'request' ? 'rq' : 'rs')}
                className={cn(
                  'flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all',
                  (activeTab === 'request' ? copiedRq : copiedRs)
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300'
                )}
              >
                {(activeTab === 'request' ? copiedRq : copiedRs) ? (
                  <>
                    <Check className="w-4 h-4" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    Copy
                  </>
                )}
              </button>
              <button
                onClick={() => downloadXml(activeTab === 'request' ? requestXml : responseXml, activeTab === 'request' ? 'RQ' : 'RS')}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-all"
              >
                <Download className="w-4 h-4" />
                Download
              </button>
            </div>
          </div>

          {/* XML Content */}
          <div className="relative">
            <pre className="p-5 text-sm font-mono text-slate-700 bg-slate-50/50 overflow-x-auto max-h-96 overflow-y-auto">
              <code className="whitespace-pre-wrap break-all">
                {activeXml || 'No XML data available'}
              </code>
            </pre>

            {/* Fade overlay at bottom */}
            <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-slate-50 to-transparent pointer-events-none" />
          </div>

          {/* Quick Stats Footer */}
          <div className="px-5 py-3 bg-slate-100 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
            <div className="flex items-center gap-4">
              <span>RQ: {requestXml?.length?.toLocaleString() || 0} chars</span>
              <span>RS: {responseXml?.length?.toLocaleString() || 0} chars</span>
            </div>
            <span className="text-slate-400">
              Click header to collapse
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Compact inline XML viewer for use in cards
 */
export function XmlViewerInline({
  requestXml,
  responseXml,
  operation,
  onViewFull
}: {
  requestXml: string;
  responseXml: string;
  operation: string;
  onViewFull?: () => void;
}) {
  const [copiedRq, setCopiedRq] = useState(false);
  const [copiedRs, setCopiedRs] = useState(false);

  const copyToClipboard = async (xml: string, type: 'rq' | 'rs') => {
    try {
      await navigator.clipboard.writeText(xml);
      if (type === 'rq') {
        setCopiedRq(true);
        setTimeout(() => setCopiedRq(false), 2000);
      } else {
        setCopiedRs(true);
        setTimeout(() => setCopiedRs(false), 2000);
      }
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-lg border border-slate-200">
      <Code2 className="w-4 h-4 text-slate-500" />
      <span className="text-sm font-medium text-slate-700">{operation}</span>

      <div className="flex-1" />

      <button
        onClick={() => copyToClipboard(requestXml, 'rq')}
        className={cn(
          'px-2 py-1 text-xs font-medium rounded transition-all',
          copiedRq
            ? 'bg-emerald-100 text-emerald-700'
            : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
        )}
      >
        {copiedRq ? 'Copied!' : 'Copy RQ'}
      </button>
      <button
        onClick={() => copyToClipboard(responseXml, 'rs')}
        className={cn(
          'px-2 py-1 text-xs font-medium rounded transition-all',
          copiedRs
            ? 'bg-emerald-100 text-emerald-700'
            : 'bg-green-100 text-green-700 hover:bg-green-200'
        )}
      >
        {copiedRs ? 'Copied!' : 'Copy RS'}
      </button>

      {onViewFull && (
        <button
          onClick={onViewFull}
          className="px-2 py-1 text-xs font-medium bg-slate-200 text-slate-700 rounded hover:bg-slate-300 transition-all"
        >
          View
        </button>
      )}
    </div>
  );
}

export default XmlViewer;
