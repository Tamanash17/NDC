import { useMemo } from 'react';
import { cn } from '@/lib/cn';
import { Code2, Copy, Check } from 'lucide-react';
import { useState } from 'react';

interface DistributionChainLink {
  ordinal: number;
  orgRole: string;
  orgId: string;
  orgName: string;
}

interface DistributionChainPreviewProps {
  bookingType: 'DIRECT' | 'BOB' | null;
  sellerCode: string;
  sellerName: string;
  distributorCode?: string;
  distributorName?: string;
  className?: string;
  showXml?: boolean;
}

const COMMON_TYPES_NS = 'http://www.iata.org/IATA/2015/EASD/00/IATA_OffersAndOrdersCommonTypes';

// Generate the distribution chain XML snippet
function generateDistributionChainXml(links: DistributionChainLink[]): string {
  if (links.length === 0) return '';

  const linksXml = links.map(link => `    <DistributionChainLink xmlns="${COMMON_TYPES_NS}">
      <Ordinal>${link.ordinal}</Ordinal>
      <OrgRole>${link.orgRole}</OrgRole>
      <ParticipatingOrg>
        <Name>${escapeXml(link.orgName)}</Name>
        <OrgID>${escapeXml(link.orgId)}</OrgID>
      </ParticipatingOrg>
    </DistributionChainLink>`).join('\n');

  return `  <DistributionChain>
${linksXml}
  </DistributionChain>`;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Syntax highlight XML - returns React elements safely with muted professional colors
function highlightXml(xml: string): JSX.Element[] {
  const lines = xml.split('\n');

  return lines.map((line, lineIdx) => {
    const elements: JSX.Element[] = [];
    let remaining = line;
    let keyIdx = 0;

    while (remaining.length > 0) {
      // Match opening/closing tags: <TagName or </TagName or />
      const tagMatch = remaining.match(/^(<\/?[\w:]+|\/?>)/);
      if (tagMatch) {
        elements.push(<span key={keyIdx++} className="text-slate-400">{tagMatch[0]}</span>);
        remaining = remaining.slice(tagMatch[0].length);
        continue;
      }

      // Match attribute name and value: xmlns="value"
      const attrMatch = remaining.match(/^(\w+)(=")([^"]*)(")/)
      if (attrMatch) {
        elements.push(<span key={keyIdx++} className="text-slate-500">{attrMatch[1]}</span>);
        elements.push(<span key={keyIdx++} className="text-slate-600">=&quot;</span>);
        elements.push(<span key={keyIdx++} className="text-sky-400/80">{attrMatch[3]}</span>);
        elements.push(<span key={keyIdx++} className="text-slate-600">&quot;</span>);
        remaining = remaining.slice(attrMatch[0].length);
        continue;
      }

      // Match closing bracket >
      const closeBracket = remaining.match(/^>/);
      if (closeBracket) {
        elements.push(<span key={keyIdx++} className="text-slate-400">&gt;</span>);
        remaining = remaining.slice(1);
        continue;
      }

      // Match text content (anything that's not a tag start)
      const textMatch = remaining.match(/^([^<]+)/);
      if (textMatch) {
        const text = textMatch[0];
        // Check if it's just whitespace
        if (text.trim()) {
          elements.push(<span key={keyIdx++} className="text-slate-200">{text}</span>);
        } else {
          elements.push(<span key={keyIdx++}>{text}</span>);
        }
        remaining = remaining.slice(text.length);
        continue;
      }

      // Fallback - just add the character
      elements.push(<span key={keyIdx++}>{remaining[0]}</span>);
      remaining = remaining.slice(1);
    }

    return <div key={lineIdx} className="leading-relaxed">{elements}</div>;
  });
}

export function DistributionChainPreview({
  bookingType,
  sellerCode,
  sellerName,
  distributorCode,
  distributorName,
  className,
  showXml = true,
}: DistributionChainPreviewProps) {
  const [copied, setCopied] = useState(false);

  const links = useMemo<DistributionChainLink[]>(() => {
    if (!bookingType || !sellerCode) return [];

    const result: DistributionChainLink[] = [];

    result.push({
      ordinal: 1,
      orgRole: 'Seller',
      orgId: sellerCode,
      orgName: sellerName || sellerCode,
    });

    if (bookingType === 'BOB' && distributorCode) {
      result.push({
        ordinal: 2,
        orgRole: 'Distributor',
        orgId: distributorCode,
        orgName: distributorName || distributorCode,
      });
    }

    return result;
  }, [bookingType, sellerCode, sellerName, distributorCode, distributorName]);

  const xmlSnippet = useMemo(() => generateDistributionChainXml(links), [links]);

  const handleCopy = async () => {
    if (!xmlSnippet) return;
    await navigator.clipboard.writeText(xmlSnippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!bookingType || !sellerCode) {
    return (
      <div className={cn('bg-slate-900 rounded-2xl p-6', className)}>
        <div className="flex items-center gap-2 text-slate-500 mb-4">
          <Code2 className="w-4 h-4" />
          <span className="text-xs font-semibold uppercase tracking-wider">XML Preview</span>
        </div>
        <p className="text-slate-500 text-sm italic">
          Configure distribution type and organization details to see the XML snippet
        </p>
      </div>
    );
  }

  return (
    <div className={cn('bg-slate-900 rounded-2xl overflow-hidden', className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 bg-slate-800/50 border-b border-slate-700/50">
        <div className="flex items-center gap-2 text-slate-400">
          <Code2 className="w-4 h-4" />
          <span className="text-xs font-semibold uppercase tracking-wider">Distribution Chain XML</span>
        </div>
        <button
          onClick={handleCopy}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
            copied
              ? 'bg-emerald-500/20 text-emerald-400'
              : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
          )}
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5" />
              Copied!
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" />
              Copy
            </>
          )}
        </button>
      </div>

      {/* XML Content */}
      {showXml && (
        <div className="p-5 overflow-x-auto">
          <pre className="text-sm font-mono text-slate-300 whitespace-pre">
            {highlightXml(xmlSnippet)}
          </pre>
        </div>
      )}

      {/* Visual representation */}
      <div className="px-5 pb-5 pt-2 border-t border-slate-700/50">
        <p className="text-xs text-slate-500 mb-3 uppercase tracking-wider font-semibold">Chain Flow</p>
        <div className="flex items-center gap-3">
          {links.map((link, idx) => (
            <div key={link.ordinal} className="flex items-center gap-3">
              <div className={cn(
                'px-4 py-2.5 rounded-xl border-2',
                link.orgRole === 'Seller'
                  ? 'bg-blue-500/10 border-blue-500/30'
                  : 'bg-purple-500/10 border-purple-500/30'
              )}>
                <p className={cn(
                  'text-[10px] uppercase tracking-wider font-semibold mb-0.5',
                  link.orgRole === 'Seller' ? 'text-blue-400' : 'text-purple-400'
                )}>
                  {link.orgRole}
                </p>
                <p className="text-white font-bold text-sm">{link.orgId}</p>
              </div>
              {idx < links.length - 1 && (
                <div className="flex items-center gap-1">
                  <div className="w-6 h-0.5 bg-gradient-to-r from-blue-500 to-purple-500" />
                  <div className="w-0 h-0 border-t-4 border-b-4 border-l-6 border-transparent border-l-purple-500" />
                </div>
              )}
            </div>
          ))}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1">
              <div className="w-6 h-0.5 bg-gradient-to-r from-purple-500 to-orange-500" />
              <div className="w-0 h-0 border-t-4 border-b-4 border-l-6 border-transparent border-l-orange-500" />
            </div>
            <div className="px-4 py-2.5 rounded-xl bg-orange-500/10 border-2 border-orange-500/30">
              <p className="text-[10px] text-orange-400 uppercase tracking-wider font-semibold mb-0.5">Airline</p>
              <p className="text-white font-bold text-sm">JQ</p>
            </div>
          </div>
        </div>
      </div>

      {/* Footer info */}
      <div className="px-5 py-3 bg-slate-800/30 border-t border-slate-700/50">
        <p className="text-xs text-slate-500">
          This XML snippet will be included in all NDC API requests during this session
        </p>
      </div>
    </div>
  );
}
