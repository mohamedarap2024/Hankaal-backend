import type { Request, Response, NextFunction } from "express";

/** Blocks direct browser/curl access unless the client sends the shared API key. */
export function requireApiKey(req: Request, res: Response, next: NextFunction) {
  const secret = process.env.API_SECRET?.trim();

  // No shared secret configured → API is open (relying on the Vercel proxy +
  // CORS). To lock the backend down later, set API_SECRET here and the matching
  // VITE_API_KEY on the frontend.
  if (!secret) return next();

  const key = req.headers["x-api-key"];
  if (typeof key !== "string" || key !== secret) {
    return res.status(404).json({ error: "Not found" });
  }

  next();
}
