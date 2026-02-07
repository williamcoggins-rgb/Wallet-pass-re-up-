//
// Simple API key authentication middleware for admin endpoints.
// Set ADMIN_API_KEY environment variable to protect your admin routes.
// Requests must include: Authorization: Bearer <your-api-key>
//
import { Request, Response, NextFunction } from "express";

const ADMIN_API_KEY = process.env.ADMIN_API_KEY ?? "";

export function requireAdminAuth(req: Request, res: Response, next: NextFunction) {
  // If no API key is configured, warn but allow (dev mode).
  if (!ADMIN_API_KEY) {
    console.warn("WARNING: ADMIN_API_KEY not set — admin routes are unprotected!");
    return next();
  }

  const auth = req.headers["authorization"];
  if (!auth) {
    return res.status(401).json({ error: "Authorization header required" });
  }

  const parts = auth.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer" || parts[1] !== ADMIN_API_KEY) {
    return res.status(403).json({ error: "Invalid API key" });
  }

  return next();
}
