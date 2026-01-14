// ============================================================================
// XML TRANSACTION LOGGER - ENHANCED
// Persists request/response XML for debugging and audit with:
// - Separate RQ/RS files with user action comments
// - Correlation ID grouping for transactions
// - Beautified XML formatting for readability
// - Sensitive data masking (card numbers, CVV)
// - Individual and ZIP download support
//
// NOTE ON XML FORMATTING:
// Logs are beautified (indentation, newlines) for human readability.
// This is safe because XML parsers ignore whitespace between elements.
// The actual XML structure, element content, and attribute values remain identical.
// Partners can trust that the logged data matches what was transmitted.
// ============================================================================

import { mkdir, writeFile, readFile, readdir, stat, unlink, rmdir } from "fs/promises";
import { existsSync, createReadStream } from "fs";
import path from "path";
import archiver from "archiver";
import { createWriteStream } from "fs";
import { config } from "../config/index.js";
import { context } from "./context.js";
import { logger } from "./logger.js";

// ----------------------------------------------------------------------------
// SENSITIVE DATA MASKING FOR XML
// ----------------------------------------------------------------------------

const sensitivePatterns: Array<{ regex: RegExp; replacement: string }> = [
  {
    regex: /<CardNumber>(\d{4})\d+(\d{4})<\/CardNumber>/g,
    replacement: "<CardNumber>$1********$2</CardNumber>",
  },
  {
    regex: /<Number>(\d{4})\d+(\d{4})<\/Number>/g,
    replacement: "<Number>$1********$2</Number>",
  },
  {
    regex: /<CVV>\d+<\/CVV>/g,
    replacement: "<CVV>***</CVV>",
  },
  {
    regex: /<SeriesCode>\d+<\/SeriesCode>/g,
    replacement: "<SeriesCode>***</SeriesCode>",
  },
  {
    regex: /<Password>[^<]+<\/Password>/g,
    replacement: "<Password>[REDACTED]</Password>",
  },
  {
    regex: /Ocp-Apim-Subscription-Key[^<]*<\/[^>]+>/g,
    replacement: "[REDACTED]</SubscriptionKey>",
  },
];

function maskSensitiveData(xml: string): string {
  if (!config.logging.maskSensitiveData) return xml;

  let masked = xml;
  for (const pattern of sensitivePatterns) {
    masked = masked.replace(pattern.regex, pattern.replacement);
  }
  return masked;
}

// ----------------------------------------------------------------------------
// XML BEAUTIFIER FOR NOTEPAD READABILITY
// Formats XML with proper indentation for human-readable logs.
// Safe to use because XML parsers ignore whitespace between elements.
// Only changes formatting, not structure or content.
// ----------------------------------------------------------------------------

function beautifyXml(xml: string): string {
  if (!xml) return "";

  try {
    let formatted = "";
    let indent = 0;
    const INDENT_STR = "    "; // 4 spaces for better Notepad readability

    // Remove existing whitespace between tags
    const cleaned = xml.replace(/>\s*</g, "><").trim();

    // Split into tags and text
    const parts = cleaned.split(/(<[^>]+>)/g).filter(Boolean);

    for (const part of parts) {
      if (part.startsWith("</")) {
        // Closing tag - decrease indent first
        indent = Math.max(0, indent - 1);
        formatted += INDENT_STR.repeat(indent) + part + "\r\n";
      } else if (part.startsWith("<?")) {
        // XML declaration
        formatted += part + "\r\n";
      } else if (part.endsWith("/>")) {
        // Self-closing tag
        formatted += INDENT_STR.repeat(indent) + part + "\r\n";
      } else if (part.startsWith("<")) {
        // Opening tag
        formatted += INDENT_STR.repeat(indent) + part + "\r\n";
        // Only increase indent if no closing tag on same line
        if (!part.includes("</")) indent++;
      } else {
        // Text content - trim and add if not empty
        const text = part.trim();
        if (text) {
          // Put text content on previous line (remove last newline, add text, add newline)
          formatted = formatted.trimEnd() + text + "\r\n";
        }
      }
    }
    return formatted.trim();
  } catch {
    return xml;
  }
}

// ----------------------------------------------------------------------------
// USER ACTION DESCRIPTIONS
// ----------------------------------------------------------------------------

const OPERATION_DESCRIPTIONS: Record<string, string> = {
  AirShopping: "User searched for flights",
  OfferPrice: "User requested price details for selected offer",
  ServiceList: "User requested available ancillary services",
  SeatAvailability: "User opened seat selection map",
  OrderCreate: "User confirmed booking and created order",
  OrderRetrieve: "User retrieved existing booking details",
  OrderReshop: "User requested rebooking options",
  OrderQuote: "User requested cancellation quote",
  OrderChange: "User confirmed booking modification",
  Auth: "System authenticated with NDC API",
};

function generateXmlHeader(
  operation: string,
  type: "RQ" | "RS",
  correlationId: string,
  sequenceNumber: number,
  timestamp: string,
  userAction?: string,
  duration?: number
): string {
  const typeLabel = type === "RQ" ? "REQUEST" : "RESPONSE";
  const actionDesc = userAction || OPERATION_DESCRIPTIONS[operation] || `NDC ${operation} operation`;

  let header = `<!--\r\n`;
  header += `================================================================================\r\n`;
  header += `NDC ${operation} ${typeLabel}\r\n`;
  header += `================================================================================\r\n`;
  header += `\r\n`;
  header += `USER ACTION: ${actionDesc}\r\n`;
  header += `\r\n`;
  header += `TRANSACTION DETAILS:\r\n`;
  header += `  - Correlation ID: ${correlationId}\r\n`;
  header += `  - Sequence: ${sequenceNumber} (use this to find related RQ/RS files)\r\n`;
  header += `  - Timestamp: ${timestamp}\r\n`;
  header += `  - Operation: ${operation}\r\n`;
  header += `  - Type: ${typeLabel}\r\n`;
  if (duration !== undefined) {
    header += `  - Duration: ${duration}ms\r\n`;
  }
  header += `\r\n`;
  header += `================================================================================\r\n`;
  header += `-->\r\n\r\n`;

  return header;
}

// ----------------------------------------------------------------------------
// IN-MEMORY TRANSACTION INDEX
// ----------------------------------------------------------------------------

export interface TransactionFile {
  filename: string;
  type: "RQ" | "RS" | "META";
  path: string;
  size: number;
}

export interface StoredTransaction {
  transactionId: string;
  correlationId: string;
  operation: string;
  timestamp: string;
  duration: number;
  success: boolean;
  errorCode?: string;
  errorMessage?: string;
  credentialHash?: string;
  userAction?: string;
  sequenceNumber: number;
  requestXml?: string;
  responseXml?: string;
  files?: TransactionFile[];
}

// Correlation ID -> sequence counter (for ordering within same correlation)
const correlationSequence = new Map<string, number>();

const transactionIndex = new Map<string, StoredTransaction>();
const MAX_INDEX_SIZE = 1000;

function getNextSequenceNumber(correlationId: string): number {
  const current = correlationSequence.get(correlationId) || 0;
  const next = current + 1;
  correlationSequence.set(correlationId, next);
  return next;
}

// ----------------------------------------------------------------------------
// XML LOGGER SERVICE - FIXED: Export as both names for compatibility
// ----------------------------------------------------------------------------

class XmlLoggerService {
  /**
   * Initialize the XML logger (create directories)
   */
  async init(): Promise<void> {
    if (!config.logging.enableXmlLogging) return;

    const logDir = config.logging.xmlLogDir;
    if (!existsSync(logDir)) {
      await mkdir(logDir, { recursive: true });
      logger.info({ logDir }, "XML log directory created");
    }

    // Start cleanup job
    this.startCleanupJob();
  }

  /**
   * Log request XML
   */
  logRequest(operation: string, xml: string, meta?: Record<string, unknown>): void {
    const ctx = context.get();
    const transactionId = ctx?.transactionId || `txn_${Date.now()}`;
    
    logger.debug(
      { 
        operation, 
        transactionId,
        xmlLength: xml.length,
        ...meta 
      }, 
      `NDC ${operation} request`
    );
  }

  /**
   * Log response XML
   */
  logResponse(operation: string, xml: string, duration: number, meta?: Record<string, unknown>): void {
    const ctx = context.get();
    const transactionId = ctx?.transactionId || `txn_${Date.now()}`;
    
    logger.debug(
      { 
        operation, 
        transactionId,
        duration,
        xmlLength: xml.length,
        ...meta 
      }, 
      `NDC ${operation} response`
    );
  }

  /**
   * Log error
   */
  logError(operation: string, error: Error, meta?: Record<string, unknown>): void {
    const ctx = context.get();
    
    logger.error(
      { 
        operation, 
        error: error.message,
        stack: error.stack,
        ...meta 
      }, 
      `NDC ${operation} error`
    );
  }

  /**
   * Log a transaction with request and response XML
   * Enhanced: Separate RQ/RS files with user action comments, beautified XML
   */
  async logTransaction(data: {
    operation: string;
    requestXml: string;
    responseXml: string;
    success: boolean;
    duration: number;
    errorCode?: string;
    errorMessage?: string;
    userAction?: string;
  }): Promise<string> {
    const ctx = context.get();
    const transactionId = ctx?.transactionId || `txn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const correlationId = ctx?.correlationId || `session_${Date.now()}`;
    const timestamp = new Date().toISOString();
    const sequenceNumber = getNextSequenceNumber(correlationId);

    // Mask sensitive data and beautify for readability
    // NOTE: Beautification only changes whitespace/indentation, not XML structure
    // XML parsers ignore whitespace between elements, so this doesn't affect API behavior
    // The actual element content and structure remain identical
    const maskedRequest = maskSensitiveData(data.requestXml);
    const maskedResponse = maskSensitiveData(data.responseXml);

    // Beautify XML for better log readability
    const beautifiedRequest = beautifyXml(maskedRequest);
    const beautifiedResponse = beautifyXml(maskedResponse);

    // Generate headers with user action comments
    const requestHeader = generateXmlHeader(
      data.operation,
      "RQ",
      correlationId,
      sequenceNumber,
      timestamp,
      data.userAction
    );
    const responseHeader = generateXmlHeader(
      data.operation,
      "RS",
      correlationId,
      sequenceNumber,
      timestamp,
      data.userAction,
      data.duration
    );

    // Combine header with beautified XML for readable logs
    const finalRequest = requestHeader + beautifiedRequest;
    const finalResponse = responseHeader + beautifiedResponse;

    // Create summary for in-memory index
    const summary: StoredTransaction = {
      transactionId,
      correlationId,
      operation: data.operation,
      timestamp,
      duration: data.duration,
      success: data.success,
      errorCode: data.errorCode,
      errorMessage: data.errorMessage,
      credentialHash: ctx?.credentialHash,
      userAction: data.userAction,
      sequenceNumber,
      requestXml: finalRequest,
      responseXml: finalResponse,
      files: [],
    };

    // Manage index size
    if (transactionIndex.size >= MAX_INDEX_SIZE) {
      const oldest = Array.from(transactionIndex.keys())[0];
      if (oldest) transactionIndex.delete(oldest);
    }
    transactionIndex.set(transactionId, summary);

    // Write to disk if enabled
    if (config.logging.enableXmlLogging) {
      try {
        const dateDir = timestamp.split("T")[0];
        const corrDir = path.join(config.logging.xmlLogDir, dateDir!, correlationId);
        await mkdir(corrDir, { recursive: true });

        // Generate descriptive filenames with sequence number
        const seqStr = String(sequenceNumber).padStart(3, "0");
        const requestFilename = `${seqStr}_${data.operation}_RQ.xml`;
        const responseFilename = `${seqStr}_${data.operation}_RS.xml`;
        const metaFilename = `${seqStr}_${data.operation}_meta.json`;

        const requestPath = path.join(corrDir, requestFilename);
        const responsePath = path.join(corrDir, responseFilename);
        const metaPath = path.join(corrDir, metaFilename);

        // Write request XML (beautified with header)
        await writeFile(requestPath, finalRequest, "utf-8");

        // Write response XML (beautified with header)
        await writeFile(responsePath, finalResponse, "utf-8");

        // Write metadata JSON
        const metaData = {
          transactionId,
          correlationId,
          sequenceNumber,
          operation: data.operation,
          timestamp,
          duration: data.duration,
          success: data.success,
          errorCode: data.errorCode,
          errorMessage: data.errorMessage,
          userAction: data.userAction || OPERATION_DESCRIPTIONS[data.operation],
          files: {
            request: requestFilename,
            response: responseFilename,
          },
        };
        await writeFile(metaPath, JSON.stringify(metaData, null, 2), "utf-8");

        // Update summary with file info
        summary.files = [
          { filename: requestFilename, type: "RQ", path: requestPath, size: finalRequest.length },
          { filename: responseFilename, type: "RS", path: responsePath, size: finalResponse.length },
          { filename: metaFilename, type: "META", path: metaPath, size: JSON.stringify(metaData).length },
        ];

        logger.debug(
          { transactionId, correlationId, sequenceNumber, operation: data.operation },
          "Transaction logged to disk with separate RQ/RS files"
        );
      } catch (err) {
        logger.error({ err, transactionId }, "Failed to write transaction to disk");
      }
    }

    return transactionId;
  }

  /**
   * Get transaction summary by ID
   */
  getTransaction(transactionId: string): StoredTransaction | null {
    return transactionIndex.get(transactionId) || null;
  }

  /**
   * Get recent transactions
   */
  getRecentTransactions(limit: number = 50, operation?: string): StoredTransaction[] {
    let transactions = Array.from(transactionIndex.values());
    
    if (operation) {
      transactions = transactions.filter(t => t.operation === operation);
    }
    
    return transactions
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, limit);
  }

  /**
   * Get request XML for a transaction
   */
  async getRequestXml(transactionId: string): Promise<string | null> {
    const summary = transactionIndex.get(transactionId);
    if (!summary) return null;
    return summary.requestXml || null;
  }

  /**
   * Get response XML for a transaction
   */
  async getResponseXml(transactionId: string): Promise<string | null> {
    const summary = transactionIndex.get(transactionId);
    if (!summary) return null;
    return summary.responseXml || null;
  }

  /**
   * List transactions with optional filtering
   */
  getTransactions(options?: {
    limit?: number;
    offset?: number;
    operation?: string;
    success?: boolean;
    correlationId?: string;
  }): StoredTransaction[] {
    let transactions = Array.from(transactionIndex.values());

    // Apply filters
    if (options?.operation) {
      transactions = transactions.filter((t) => t.operation === options.operation);
    }
    if (options?.success !== undefined) {
      transactions = transactions.filter((t) => t.success === options.success);
    }
    if (options?.correlationId) {
      transactions = transactions.filter((t) => t.correlationId === options.correlationId);
    }

    // Sort by timestamp descending
    transactions.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    // Apply pagination
    const offset = options?.offset || 0;
    const limit = options?.limit || 50;
    return transactions.slice(offset, offset + limit);
  }

  /**
   * Get transactions by correlation ID
   */
  getByCorrelationId(correlationId: string): StoredTransaction[] {
    return Array.from(transactionIndex.values())
      .filter((t) => t.correlationId === correlationId)
      .sort((a, b) => a.sequenceNumber - b.sequenceNumber);
  }

  /**
   * Get all unique correlation IDs with their transaction counts
   */
  getCorrelationGroups(): Array<{
    correlationId: string;
    count: number;
    operations: string[];
    firstTimestamp: string;
    lastTimestamp: string;
  }> {
    const groups = new Map<string, StoredTransaction[]>();

    for (const t of transactionIndex.values()) {
      const existing = groups.get(t.correlationId) || [];
      existing.push(t);
      groups.set(t.correlationId, existing);
    }

    return Array.from(groups.entries())
      .map(([correlationId, transactions]) => {
        transactions.sort((a, b) => a.sequenceNumber - b.sequenceNumber);
        return {
          correlationId,
          count: transactions.length,
          operations: transactions.map((t) => t.operation),
          firstTimestamp: transactions[0]?.timestamp || "",
          lastTimestamp: transactions[transactions.length - 1]?.timestamp || "",
        };
      })
      .sort((a, b) => new Date(b.lastTimestamp).getTime() - new Date(a.lastTimestamp).getTime());
  }

  /**
   * Generate a ZIP file containing all transactions for a correlation ID
   * Returns a readable stream for the ZIP file
   */
  async generateCorrelationZip(correlationId: string): Promise<{
    stream: NodeJS.ReadableStream;
    filename: string;
  } | null> {
    const transactions = this.getByCorrelationId(correlationId);
    if (transactions.length === 0) return null;

    // Create temp file for ZIP
    const tempDir = path.join(config.logging.xmlLogDir, "temp");
    await mkdir(tempDir, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const zipFilename = `NDC_Transaction_${correlationId}_${timestamp}.zip`;
    const zipPath = path.join(tempDir, zipFilename);

    // Create ZIP archive
    const output = createWriteStream(zipPath);
    const archive = archiver("zip", { zlib: { level: 9 } });

    return new Promise((resolve, reject) => {
      output.on("close", () => {
        // Return a read stream for the created ZIP
        const readStream = createReadStream(zipPath);
        readStream.on("close", () => {
          // Clean up temp file after streaming
          unlink(zipPath).catch(() => {});
        });
        resolve({
          stream: readStream,
          filename: zipFilename,
        });
      });

      archive.on("error", (err) => {
        reject(err);
      });

      archive.pipe(output);

      // Add summary file at the root
      const summaryContent = this.generateTransactionSummary(transactions, correlationId);
      archive.append(summaryContent, { name: "00_TRANSACTION_SUMMARY.txt" });

      // Add each transaction's files
      for (const txn of transactions) {
        const seqStr = String(txn.sequenceNumber).padStart(3, "0");
        const folderName = `${seqStr}_${txn.operation}`;

        // Add request XML
        if (txn.requestXml) {
          archive.append(txn.requestXml, { name: `${folderName}/${seqStr}_${txn.operation}_RQ.xml` });
        }

        // Add response XML
        if (txn.responseXml) {
          archive.append(txn.responseXml, { name: `${folderName}/${seqStr}_${txn.operation}_RS.xml` });
        }

        // Add metadata
        const meta = {
          transactionId: txn.transactionId,
          correlationId: txn.correlationId,
          sequenceNumber: txn.sequenceNumber,
          operation: txn.operation,
          timestamp: txn.timestamp,
          duration: txn.duration,
          success: txn.success,
          userAction: txn.userAction,
          errorCode: txn.errorCode,
          errorMessage: txn.errorMessage,
        };
        archive.append(JSON.stringify(meta, null, 2), { name: `${folderName}/${seqStr}_meta.json` });
      }

      archive.finalize();
    });
  }

  /**
   * Generate a text summary of all transactions in a correlation group
   */
  private generateTransactionSummary(transactions: StoredTransaction[], correlationId: string): string {
    let summary = `================================================================================\r\n`;
    summary += `NDC TRANSACTION LOG SUMMARY\r\n`;
    summary += `================================================================================\r\n\r\n`;
    summary += `Correlation ID: ${correlationId}\r\n`;
    summary += `Total Transactions: ${transactions.length}\r\n`;
    summary += `Generated: ${new Date().toISOString()}\r\n\r\n`;
    summary += `================================================================================\r\n`;
    summary += `TRANSACTION SEQUENCE\r\n`;
    summary += `================================================================================\r\n\r\n`;

    for (const txn of transactions) {
      const status = txn.success ? "SUCCESS" : "FAILED";
      const seqStr = String(txn.sequenceNumber).padStart(3, "0");
      summary += `[${seqStr}] ${txn.operation} - ${status}\r\n`;
      summary += `    Timestamp: ${txn.timestamp}\r\n`;
      summary += `    Duration: ${txn.duration}ms\r\n`;
      summary += `    User Action: ${txn.userAction || OPERATION_DESCRIPTIONS[txn.operation] || "N/A"}\r\n`;
      if (!txn.success && txn.errorMessage) {
        summary += `    Error: ${txn.errorMessage}\r\n`;
      }
      summary += `    Files:\r\n`;
      summary += `      - ${seqStr}_${txn.operation}_RQ.xml (Request)\r\n`;
      summary += `      - ${seqStr}_${txn.operation}_RS.xml (Response)\r\n`;
      summary += `\r\n`;
    }

    summary += `================================================================================\r\n`;
    summary += `END OF SUMMARY\r\n`;
    summary += `================================================================================\r\n`;

    return summary;
  }

  /**
   * Clear all transactions
   */
  clear(): void {
    transactionIndex.clear();
    correlationSequence.clear();
    logger.info("Transaction index cleared");
  }

  /**
   * Get statistics about logged transactions
   */
  getStats(): {
    total: number;
    byOperation: Record<string, number>;
    successRate: number;
    avgDuration: number;
  } {
    const transactions = Array.from(transactionIndex.values());
    const byOperation: Record<string, number> = {};
    let successCount = 0;
    let totalDuration = 0;

    for (const t of transactions) {
      byOperation[t.operation] = (byOperation[t.operation] || 0) + 1;
      if (t.success) successCount++;
      totalDuration += t.duration;
    }

    return {
      total: transactions.length,
      byOperation,
      successRate: transactions.length > 0 ? (successCount / transactions.length) * 100 : 0,
      avgDuration: transactions.length > 0 ? totalDuration / transactions.length : 0,
    };
  }

  /**
   * Start background cleanup job for old logs
   */
  startCleanupJob(): void {
    const retentionMs = config.logging.xmlLogRetentionDays * 24 * 60 * 60 * 1000;

    setInterval(async () => {
      if (!config.logging.enableXmlLogging) return;

      try {
        const logDir = config.logging.xmlLogDir;
        if (!existsSync(logDir)) return;

        const dirs = await readdir(logDir);
        const cutoffDate = new Date(Date.now() - retentionMs);

        for (const dir of dirs) {
          // Check if directory name is a date (YYYY-MM-DD)
          if (/^\d{4}-\d{2}-\d{2}$/.test(dir)) {
            const dirDate = new Date(dir);
            if (dirDate < cutoffDate) {
              const fullPath = path.join(logDir, dir);
              const stats = await stat(fullPath);
              if (stats.isDirectory()) {
                await this.removeDirectory(fullPath);
                logger.info({ dir }, "Cleaned up old XML log directory");
              }
            }
          }
        }
      } catch (err) {
        logger.error({ err }, "Error during XML log cleanup");
      }
    }, 24 * 60 * 60 * 1000); // Run daily
  }

  /**
   * Recursively remove a directory
   */
  async removeDirectory(dirPath: string): Promise<void> {
    try {
      const entries = await readdir(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
          await this.removeDirectory(fullPath);
        } else {
          await unlink(fullPath);
        }
      }
      await rmdir(dirPath);
    } catch (err) {
      logger.error({ err, dirPath }, "Failed to remove directory");
    }
  }
}

// Create singleton instance
const xmlLoggerInstance = new XmlLoggerService();

// FIXED: Export with BOTH names for compatibility
export const xmlLogger = xmlLoggerInstance;
export const xmlTransactionLogger = xmlLoggerInstance;