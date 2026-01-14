import dotenv from "dotenv";
import { z } from "zod";
dotenv.config();

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  PORT: z.coerce.number().default(3001),
});

const env = envSchema.parse(process.env);

// Environment-specific URLs
const NDC_URLS = {
  UAT: {
    baseUrl: "https://ndc-api-uat.jetstar.com/ndc",
    authUrl: "https://ndc-api-uat.jetstar.com/jq/ndc/api/Selling/r3.x/Auth",
  },
  PROD: {
    baseUrl: "https://ndc-api.jetstar.com/ndc",
    authUrl: "https://ndc-api.jetstar.com/jq/ndc/api/Selling/r3.x/Auth",
  },
};

export const config = {
  app: {
    port: env.PORT,
    env: env.NODE_ENV,
    isDev: env.NODE_ENV === "development",
  },
  ndc: {
    // Function to get URLs based on environment
    getUrls: (environment: "UAT" | "PROD") => NDC_URLS[environment],

    // HARDCODED - Never changes
    ndcUatHeader: "Jetstar3.12",
    requestTimeout: 60000,

    endpoints: {
      airShopping: "/AirShopping",
      offerPrice: "/OfferPrice",
      serviceList: "/ServiceList",
      seatAvailability: "/SeatAvailability",
      orderCreate: "/OrderCreate",
      orderRetrieve: "/OrderRetrieve",
      orderReshop: "/OrderReshop",
      orderQuote: "/OrderQuote",
      orderChange: "/OrderChange",
    },
  },
};

export type NDCEnvironment = "UAT" | "PROD";
