import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../index.js";

describe("Health Endpoints", () => {
  it("GET /api/health returns healthy status", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("healthy");
    expect(res.body.version).toBeDefined();
  });

  it("GET /api/ready returns ready status", async () => {
    const res = await request(app).get("/api/ready");
    expect(res.status).toBe(200);
    expect(res.body.ready).toBe(true);
  });

  it("GET /api returns API info", async () => {
    const res = await request(app).get("/api");
    expect(res.status).toBe(200);
    expect(res.body.name).toBe("NDC Booking Tool API");
    expect(res.body.endpoints).toBeDefined();
  });
});