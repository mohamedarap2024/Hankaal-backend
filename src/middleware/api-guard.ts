import type { Request, Response, NextFunction } from "express";

/** Blocks direct browser/curl access unless the client sends the shared API key. */
export function requireApiKey(req: Request, res: Response, next: NextFunction) {
  const secret = process.env.API_SECRET?.trim();

  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      return res.status(404).json({ error: "Not found" });
    }
    return next();
  }

  const key = req.headers["x-api-key"];
  if (typeof key !== "string" || key !== secret) {
    return res.status(404).json({ error: "Not found" });
  }

  next();
}
