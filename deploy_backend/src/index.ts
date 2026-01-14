import express, { Application } from "express";
import { config } from "./config/index.js";
import { logger } from "./utils/logger.js";
import { xmlTransactionLogger } from "./utils/xml-logger.js";
import { contextMiddleware, requestLoggingMiddleware, helmetMiddleware, corsMiddleware, compressionMiddleware, sanitizeMiddleware, timeoutMiddleware, defaultRateLimiter, errorHandlerMiddleware, notFoundHandler } from "./middleware/index.js";
import routes from "./routes/index.js";
import { metrics } from "./utils/metrics.js";

const app: Application = express();

app.use(helmetMiddleware);
app.use(corsMiddleware);
app.use(sanitizeMiddleware());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(compressionMiddleware);
app.use(contextMiddleware());
app.use(requestLoggingMiddleware());
app.use(timeoutMiddleware());
app.use(defaultRateLimiter);

if (config.security.trustProxy) app.set("trust proxy", 1);

app.get(config.metrics.path, async (_req, res) => {
  const metricsText = await metrics.getMetrics();
  res.type(metrics.getContentType()).send(metricsText);
});

app.use("/api", routes);
app.get("/", (_req, res) => res.redirect("/api"));
app.use(notFoundHandler());
app.use(errorHandlerMiddleware());

const startServer = async (): Promise<void> => {
  try {
    await xmlTransactionLogger.init();
    const server = app.listen(config.app.port, () => {
      logger.info("========================================");
      logger.info("  NDC Booking Tool - Enterprise Backend");
      logger.info("  Version: " + config.app.version);
      logger.info("========================================");
      logger.info("  Environment: " + config.app.env);
      logger.info("  Port: " + config.app.port);
      logger.info("  NDC Base URL: " + config.ndc.baseUrl);
      logger.info("  NDC Auth URL: " + config.ndc.authUrl);
      logger.info("========================================");
    });
    
    const shutdown = async (signal: string) => {
      logger.info(signal + " received, shutting down gracefully...");
      server.close(() => { logger.info("HTTP server closed"); process.exit(0); });
      setTimeout(() => { logger.error("Forced shutdown after timeout"); process.exit(1); }, 30000);
    };
    
    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));
  } catch (error) {
    logger.error({ error }, "Failed to start server");
    process.exit(1);
  }
};

startServer();
export { app };