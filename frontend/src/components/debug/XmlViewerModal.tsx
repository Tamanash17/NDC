import { useState, useEffect, useMemo } from 'react';
import { X, Copy, Check, Download, Trash2, Code, Clock, AlertCircle, CheckCircle, Archive, RefreshCw, FileText, ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useXmlViewer } from '@/core/context/XmlViewerContext';
import { Button } from '@/components/ui';

// Max size for formatting (50KB) - larger XMLs shown raw
const MAX_FORMAT_SIZE = 50 * 1024;
// Max size for syntax highlighting (20KB) - very expensive operation
const MAX_HIGHLIGHT_SIZE = 20 * 1024;

function formatXml(xml: string): string {
  if (!xml) return '';

  // Skip formatting for large XMLs - just return raw
  if (xml.length > MAX_FORMAT_SIZE) {
    return `<!-- XML too large for formatting (${Math.round(xml.length / 1024)}KB) - showing raw -->\n\n${xml}`;
  }

  try {
    let formatted = '';
    let indent = 0;
    const parts = xml.replace(/>\s*</g, '><').split(/(<[^>]+>)/g).filter(Boolean);

    for (const part of parts) {
      if (part.startsWith('</')) {
        indent = Math.max(0, indent - 1);
        formatted += '  '.repeat(indent) + part + '\n';
      } else if (part.startsWith('<?') || part.endsWith('/>')) {
        formatted += '  '.repeat(indent) + part + '\n';
      } else if (part.startsWith('<')) {
        formatted += '  '.repeat(indent) + part + '\n';
        if (!part.includes('</')) indent++;
      } else {
        formatted += '  '.repeat(indent) + part.trim() + '\n';
      }
    }
    return formatted.trim();
  } catch {
    return xml;
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function highlightXml(xml: string): string {
  // For large XMLs - just escape HTML, no syntax highlighting
  if (xml.length > MAX_HIGHLIGHT_SIZE) {
    return escapeHtml(xml);
  }

  // Simple and fast highlighting - escape first, then add spans
  const escaped = escapeHtml(xml);

  return escaped
    .replace(/(&lt;\/?[\w:-]+)/g, '<span class="text-blue-600">$1</span>')
    .replace(/(\s[\w:-]+)(=)/g, '<span class="text-purple-600">$1</span>$2')
    .replace(/(=&quot;[^&]*&quot;|=&#39;[^&]*&#39;|="[^"]*"|='[^']*')/g, '<span class="text-green-600">$1</span>');
}

export function XmlViewerModal() {
  const {
    isOpen,
    correlationGroups,
    currentCorrelationId,
    selectedCapture,
    closeViewer,
    selectCapture,
    clearCaptures,
    startNewSession,
    downloadCorrelationZip,
  } = useXmlViewer();
  const [activeTab, setActiveTab] = useState<'request' | 'response'>('response');
  const [copied, setCopied] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [downloadingZip, setDownloadingZip] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setActiveTab('response');
      setCopied(false);
      setSearchTerm('');
    } else {
      // Auto-expand current session group
      setExpandedGroups(new Set([currentCorrelationId]));
    }
  }, [isOpen, currentCorrelationId]);

  // Toggle group expansion
  const toggleGroup = (correlationId: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(correlationId)) {
        next.delete(correlationId);
      } else {
        next.add(correlationId);
      }
      return next;
    });
  };

  // Handle ZIP download
  const handleDownloadZip = async (correlationId: string) => {
    setDownloadingZip(correlationId);
    try {
      await downloadCorrelationZip(correlationId);
    } catch (error) {
      console.error('Failed to download ZIP:', error);
    } finally {
      setDownloadingZip(null);
    }
  };

  // Get raw XML content
  const currentXml = selectedCapture
    ? (activeTab === 'request' ? selectedCapture.request : selectedCapture.response)
    : '';

  // Memoize formatted XML to avoid reprocessing on every render
  const formattedXml = useMemo(() => {
    if (!currentXml) return '';
    return formatXml(currentXml);
  }, [currentXml]);

  // Memoize highlighted XML
  const highlightedXml = useMemo(() => {
    if (!formattedXml) return '';
    return highlightXml(formattedXml);
  }, [formattedXml]);

  // Check if content is large (for UI indicator)
  const isLargeContent = currentXml.length > MAX_FORMAT_SIZE;

  // Filter groups by search term
  const filteredGroups = useMemo(() => {
    if (!searchTerm) return correlationGroups;
    return correlationGroups
      .map(group => ({
        ...group,
        captures: group.captures.filter(c =>
          c.operation.toLowerCase().includes(searchTerm.toLowerCase()) ||
          c.userAction?.toLowerCase().includes(searchTerm.toLowerCase())
        ),
      }))
      .filter(group => group.captures.length > 0);
  }, [correlationGroups, searchTerm]);

  if (!isOpen) return null;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(formattedXml);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Download individual XML file with proper naming
  const handleDownload = () => {
    if (!selectedCapture) return;
    const seqStr = String(selectedCapture.sequenceNumber).padStart(3, '0');
    const typeStr = activeTab === 'request' ? 'RQ' : 'RS';
    const filename = `${seqStr}_${selectedCapture.operation}_${typeStr}.xml`;

    const blob = new Blob([formattedXml], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Download request XML only
  const handleDownloadRequest = () => {
    if (!selectedCapture) return;
    const seqStr = String(selectedCapture.sequenceNumber).padStart(3, '0');
    const filename = `${seqStr}_${selectedCapture.operation}_RQ.xml`;

    const blob = new Blob([formatXml(selectedCapture.request)], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Download response XML only
  const handleDownloadResponse = () => {
    if (!selectedCapture) return;
    const seqStr = String(selectedCapture.sequenceNumber).padStart(3, '0');
    const filename = `${seqStr}_${selectedCapture.operation}_RS.xml`;

    const blob = new Blob([formatXml(selectedCapture.response)], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={closeViewer} />

      {/* Modal */}
      <div className="relative flex w-full max-w-7xl mx-auto my-4 bg-white rounded-lg shadow-2xl overflow-hidden">
        {/* Sidebar - Capture List with Grouped View */}
        <div className="w-80 border-r border-neutral-200 flex flex-col bg-neutral-50">
          {/* Header */}
          <div className="p-3 border-b border-neutral-200">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold text-neutral-900 flex items-center gap-2">
                <Code className="w-4 h-4" />
                XML Transaction Log
              </h3>
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" onClick={startNewSession} title="Start new session">
                  <RefreshCw className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="sm" onClick={clearCaptures} title="Clear all">
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
            <input
              type="text"
              placeholder="Filter by operation or action..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-2 py-1.5 text-sm border border-neutral-300 rounded focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
          </div>

          {/* Grouped Transaction List */}
          <div className="flex-1 overflow-y-auto">
            {filteredGroups.length === 0 ? (
              <div className="p-4 text-center text-neutral-500 text-sm">
                No XML captures yet.<br />
                Make an API call to see requests/responses.
              </div>
            ) : (
              filteredGroups.map((group) => {
                const isExpanded = expandedGroups.has(group.correlationId);
                const isCurrentSession = group.correlationId === currentCorrelationId;

                return (
                  <div key={group.correlationId} className="border-b border-neutral-200">
                    {/* Group Header */}
                    <div className={cn(
                      'flex items-center justify-between p-2 cursor-pointer hover:bg-white',
                      isCurrentSession && 'bg-primary-50'
                    )}>
                      <button
                        onClick={() => toggleGroup(group.correlationId)}
                        className="flex items-center gap-2 flex-1 text-left"
                      >
                        {isExpanded ? (
                          <ChevronDown className="w-4 h-4 text-neutral-400" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-neutral-400" />
                        )}
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm text-neutral-900">
                              {isCurrentSession ? 'Current Session' : 'Session'}
                            </span>
                            <span className="text-xs px-1.5 py-0.5 bg-neutral-200 text-neutral-600 rounded">
                              {group.captures.length} calls
                            </span>
                          </div>
                          <div className="text-xs text-neutral-500">
                            {group.firstTimestamp.toLocaleTimeString()} - {group.lastTimestamp.toLocaleTimeString()}
                          </div>
                        </div>
                      </button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDownloadZip(group.correlationId);
                        }}
                        disabled={downloadingZip === group.correlationId}
                        title="Download all as ZIP"
                      >
                        {downloadingZip === group.correlationId ? (
                          <RefreshCw className="w-4 h-4 animate-spin" />
                        ) : (
                          <Archive className="w-4 h-4" />
                        )}
                      </Button>
                    </div>

                    {/* Group Items */}
                    {isExpanded && (
                      <div className="bg-white">
                        {group.captures.map((capture) => (
                          <button
                            key={capture.id}
                            onClick={() => selectCapture(capture)}
                            className={cn(
                              'w-full p-2 pl-8 text-left border-b border-neutral-50 hover:bg-neutral-50 transition-colors',
                              selectedCapture?.id === capture.id && 'bg-primary-50 border-l-2 border-l-primary-500'
                            )}
                          >
                            <div className="flex items-center justify-between mb-0.5">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-mono text-neutral-400">
                                  #{String(capture.sequenceNumber).padStart(2, '0')}
                                </span>
                                <span className="font-medium text-sm text-neutral-900">
                                  {capture.operation}
                                </span>
                              </div>
                              {capture.status === 'success' ? (
                                <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                              ) : (
                                <AlertCircle className="w-3.5 h-3.5 text-red-500" />
                              )}
                            </div>
                            {capture.userAction && (
                              <div className="text-xs text-neutral-500 mb-0.5 truncate">
                                {capture.userAction}
                              </div>
                            )}
                            <div className="flex items-center gap-2 text-xs text-neutral-400">
                              <Clock className="w-3 h-3" />
                              {capture.timestamp.toLocaleTimeString()}
                              <span>•</span>
                              {capture.duration}ms
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-3 border-b border-neutral-200">
            <div className="flex items-center gap-4">
              {selectedCapture && (
                <>
                  <div>
                    <h2 className="font-semibold text-neutral-900 flex items-center gap-2">
                      <span className="text-xs font-mono text-neutral-400">
                        #{String(selectedCapture.sequenceNumber).padStart(2, '0')}
                      </span>
                      {selectedCapture.operation}
                    </h2>
                    {selectedCapture.userAction && (
                      <p className="text-xs text-neutral-500">{selectedCapture.userAction}</p>
                    )}
                  </div>
                  <div className="flex rounded-lg border border-neutral-200 overflow-hidden">
                    <button
                      onClick={() => setActiveTab('request')}
                      className={cn(
                        'px-3 py-1.5 text-sm font-medium transition-colors',
                        activeTab === 'request'
                          ? 'bg-primary-500 text-white'
                          : 'bg-white text-neutral-600 hover:bg-neutral-50'
                      )}
                    >
                      Request (RQ)
                    </button>
                    <button
                      onClick={() => setActiveTab('response')}
                      className={cn(
                        'px-3 py-1.5 text-sm font-medium transition-colors',
                        activeTab === 'response'
                          ? 'bg-primary-500 text-white'
                          : 'bg-white text-neutral-600 hover:bg-neutral-50'
                      )}
                    >
                      Response (RS)
                    </button>
                  </div>
                </>
              )}
            </div>

            <div className="flex items-center gap-2">
              {selectedCapture && (
                <>
                  <Button variant="outline" size="sm" onClick={handleCopy}>
                    {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    {copied ? 'Copied!' : 'Copy'}
                  </Button>
                  <div className="flex border border-neutral-200 rounded-lg overflow-hidden">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleDownloadRequest}
                      title="Download Request XML"
                      className="rounded-none border-r border-neutral-200"
                    >
                      <FileText className="w-4 h-4" />
                      RQ
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleDownloadResponse}
                      title="Download Response XML"
                      className="rounded-none"
                    >
                      <FileText className="w-4 h-4" />
                      RS
                    </Button>
                  </div>
                  <Button variant="outline" size="sm" onClick={handleDownload}>
                    <Download className="w-4 h-4" />
                    Download
                  </Button>
                </>
              )}
              <Button variant="ghost" size="sm" onClick={closeViewer}>
                <X className="w-5 h-5" />
              </Button>
            </div>
          </div>

          {/* XML Content */}
          <div className="flex-1 overflow-auto p-4 bg-neutral-900">
            {selectedCapture ? (
              <>
                {isLargeContent && (
                  <div className="mb-2 px-2 py-1 bg-amber-900/50 text-amber-200 text-xs rounded">
                    Large XML ({Math.round(currentXml.length / 1024)}KB) - formatting/highlighting disabled for performance
                  </div>
                )}
                <pre
                  className="text-sm font-mono text-neutral-100 whitespace-pre-wrap"
                  dangerouslySetInnerHTML={{ __html: highlightedXml }}
                />
              </>
            ) : (
              <div className="flex items-center justify-center h-full text-neutral-500">
                <div className="text-center">
                  <FileText className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p>Select a capture from the sidebar to view XML</p>
                  <p className="text-xs mt-1">Transactions are grouped by session for easy navigation</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
