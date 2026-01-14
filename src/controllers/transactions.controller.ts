// ============================================================================
// TRANSACTIONS CONTROLLER - ENHANCED
// Supports individual file downloads and ZIP bundle for correlation groups
// ============================================================================

import type { Request, Response, NextFunction } from "express";
import { xmlTransactionLogger } from "../utils/xml-logger.js";
import { NotFoundError } from "../errors/index.js";
import { context } from "../utils/context.js";
import type { ApiResponse, ResponseMeta } from "../types/api.types.js";

function buildMeta(req: Request, operation: string, duration: number): ResponseMeta {
  const ctx = context.get();
  return { transactionId: ctx?.transactionId || "unknown", correlationId: ctx?.correlationId || "unknown", timestamp: new Date().toISOString(), duration, operation };
}

class TransactionsController {
  /**
   * List recent transactions with optional filtering
   */
  list = async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    const startTime = Date.now();
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const operation = req.query.operation as string | undefined;
    const transactions = xmlTransactionLogger.getRecentTransactions(limit, operation);
    const response: ApiResponse = { success: true, data: { transactions, count: transactions.length }, meta: buildMeta(req, "ListTransactions", Date.now() - startTime) };
    res.json(response);
  };

  /**
   * Get transaction by ID
   */
  get = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const startTime = Date.now();
    try {
      const { id } = req.params;
      const transaction = xmlTransactionLogger.getTransaction(id!);
      if (!transaction) throw new NotFoundError("Transaction", id);
      const response: ApiResponse = { success: true, data: transaction, meta: buildMeta(req, "GetTransaction", Date.now() - startTime) };
      res.json(response);
    } catch (error) { next(error); }
  };

  /**
   * Get request XML for a transaction (formatted with header)
   */
  getRequestXml = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const xml = await xmlTransactionLogger.getRequestXml(id!);
      if (!xml) throw new NotFoundError("Transaction request XML", id);

      // Set headers for download if requested
      const download = req.query.download === "true";
      if (download) {
        const txn = xmlTransactionLogger.getTransaction(id!);
        const filename = txn
          ? `${String(txn.sequenceNumber).padStart(3, "0")}_${txn.operation}_RQ.xml`
          : `${id}_request.xml`;
        res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      }

      res.type("application/xml").send(xml);
    } catch (error) { next(error); }
  };

  /**
   * Get response XML for a transaction (formatted with header)
   */
  getResponseXml = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const xml = await xmlTransactionLogger.getResponseXml(id!);
      if (!xml) throw new NotFoundError("Transaction response XML", id);

      // Set headers for download if requested
      const download = req.query.download === "true";
      if (download) {
        const txn = xmlTransactionLogger.getTransaction(id!);
        const filename = txn
          ? `${String(txn.sequenceNumber).padStart(3, "0")}_${txn.operation}_RS.xml`
          : `${id}_response.xml`;
        res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      }

      res.type("application/xml").send(xml);
    } catch (error) { next(error); }
  };

  /**
   * Get transaction statistics
   */
  stats = async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    const startTime = Date.now();
    const stats = xmlTransactionLogger.getStats();
    const response: ApiResponse = { success: true, data: stats, meta: buildMeta(req, "TransactionStats", Date.now() - startTime) };
    res.json(response);
  };

  /**
   * Get all correlation groups (sessions/user flows)
   */
  getCorrelationGroups = async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
    const startTime = Date.now();
    const groups = xmlTransactionLogger.getCorrelationGroups();
    const response: ApiResponse = {
      success: true,
      data: { groups, count: groups.length },
      meta: buildMeta(req, "GetCorrelationGroups", Date.now() - startTime),
    };
    res.json(response);
  };

  /**
   * Get all transactions for a specific correlation ID
   */
  getByCorrelation = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const startTime = Date.now();
    try {
      const { correlationId } = req.params;
      const transactions = xmlTransactionLogger.getByCorrelationId(correlationId!);
      if (transactions.length === 0) {
        throw new NotFoundError("Correlation group", correlationId);
      }
      const response: ApiResponse = {
        success: true,
        data: { correlationId, transactions, count: transactions.length },
        meta: buildMeta(req, "GetByCorrelation", Date.now() - startTime),
      };
      res.json(response);
    } catch (error) { next(error); }
  };

  /**
   * Download ZIP bundle for a correlation group
   */
  downloadCorrelationZip = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { correlationId } = req.params;
      const zipData = await xmlTransactionLogger.generateCorrelationZip(correlationId!);

      if (!zipData) {
        throw new NotFoundError("Correlation group", correlationId);
      }

      // Set response headers for ZIP download
      res.setHeader("Content-Type", "application/zip");
      res.setHeader("Content-Disposition", `attachment; filename="${zipData.filename}"`);

      // Stream the ZIP file to the response
      zipData.stream.pipe(res);
    } catch (error) { next(error); }
  };
}

export const transactionsController = new TransactionsController();