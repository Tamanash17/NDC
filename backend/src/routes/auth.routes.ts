import axios from "axios";
import { Router } from "express";
import { config, setNdcEnvironment, type NDCEnvironment } from "../config/index.js";

const router = Router();

router.post("/login", async (req, res) => {
  try {
    const { domain, apiId, password, subscriptionKey, environment } = req.body;

    if (!domain || !apiId || !password || !subscriptionKey) {
      return res.status(400).json({
        success: false,
        error: { message: "Missing required fields" },
      });
    }

    // Set environment BEFORE making auth call if provided
    const targetEnv: NDCEnvironment = environment === 'PROD' ? 'PROD' : 'UAT';
    setNdcEnvironment(targetEnv);
    console.log(`[Auth] Environment set to: ${targetEnv}`);

    const authUrl = config.ndc.authUrl + config.ndc.endpoints.auth;
    const credentials = `${domain}\\${apiId}:${password}`;
    const basicAuth = Buffer.from(credentials).toString("base64");

    console.log(`[Auth] Authenticating: ${domain}\\${apiId}`);
    console.log(`[Auth] URL: ${authUrl}`);
    console.log(`[Auth] Header: ${config.ndc.envHeaderName} = ${config.ndc.envHeader}`);

    const response = await axios.post(
      authUrl,
      { grant_type: "client_credentials" },
      {
        headers: {
          "Authorization": `Basic ${basicAuth}`,
          "Ocp-Apim-Subscription-Key": subscriptionKey,
          // Dynamic environment header (X-NDC-UAT or X-NDC-PROD)
          [config.ndc.envHeaderName]: config.ndc.envHeader,
          "Content-Type": "application/json",
        },
        timeout: config.ndc.requestTimeout,
      }
    );

    const token = response.data.access_token || response.data.token;

    // Parse expires_in - handle both numeric (UAT) and string format (PROD: "00:18:59.9589815s")
    let expiresIn = 1800; // Default 30 mins
    const rawExpiresIn = response.data.expires_in;

    if (typeof rawExpiresIn === 'number') {
      expiresIn = rawExpiresIn;
    } else if (typeof rawExpiresIn === 'string') {
      // Parse time string format: "HH:MM:SS.fraction" or "HH:MM:SS.fractions"
      const timeMatch = rawExpiresIn.match(/^(\d+):(\d+):(\d+)/);
      if (timeMatch) {
        const hours = parseInt(timeMatch[1], 10);
        const minutes = parseInt(timeMatch[2], 10);
        const seconds = parseInt(timeMatch[3], 10);
        expiresIn = (hours * 3600) + (minutes * 60) + seconds;
        console.log(`[Auth] Parsed time string "${rawExpiresIn}" to ${expiresIn} seconds`);
      } else {
        // Try parsing as plain number string
        const parsed = parseInt(rawExpiresIn, 10);
        if (!isNaN(parsed)) {
          expiresIn = parsed;
        }
      }
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        error: { message: "No token received" },
      });
    }

    console.log(`[Auth] Success - Token expires in ${expiresIn}s`);

    res.json({
      success: true,
      token,
      expires_in: expiresIn,
      token_type: "Bearer",
      environment: environment || "UAT",
    });
  } catch (error: any) {
    // Log full error details for debugging
    console.error("[Auth] ========== AUTH ERROR ==========");
    console.error("[Auth] Status:", error.response?.status);
    console.error("[Auth] Status Text:", error.response?.statusText);
    console.error("[Auth] Headers:", JSON.stringify(error.response?.headers, null, 2));
    console.error("[Auth] Data:", typeof error.response?.data === 'string'
      ? error.response?.data.substring(0, 500)
      : JSON.stringify(error.response?.data, null, 2));
    console.error("[Auth] Error message:", error.message);
    console.error("[Auth] ================================");

    // Extract error from response headers (Jetstar specific)
    const errorCode = error.response?.headers?.['error-code-0'] || '';
    const headerMsg = error.response?.headers?.['error-msg-0'];

    // Try to get meaningful error message
    let errorMsg = headerMsg
      || error.response?.data?.message
      || error.response?.data?.error_description
      || error.response?.data?.error;

    // If response is HTML (404 page), provide better message
    if (!errorMsg && typeof error.response?.data === 'string' && error.response?.data.includes('<html')) {
      errorMsg = `Jetstar API returned ${error.response?.status} - endpoint may be unavailable or blocked`;
    }

    // Fallback
    if (!errorMsg) {
      errorMsg = error.response?.data?.title || error.message || 'Authentication failed';
    }

    const displayMessage = errorCode
      ? `${errorCode}: ${errorMsg}`
      : errorMsg;

    res.status(error.response?.status || 500).json({
      success: false,
      error: {
        message: displayMessage,
        code: errorCode,
        status: error.response?.status,
        details: `Auth URL: ${config.ndc.authUrl}${config.ndc.endpoints.auth}`,
      },
    });
  }
});

export default router;