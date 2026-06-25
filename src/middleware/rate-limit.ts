import type { Request, Response, NextFunction } from "express";

type Bucket = { count: number; reset: number };

/**
 * Lightweight in-memory rate limiter — no external dependency.
 * Suitable for a single-instance deployment (Render). Each client IP gets
 * `max` requests per `windowMs`; excess requests get a 429.
 */
export function rateLimit({ windowMs, max, name }: { windowMs: number; max: number; name?: string }) {
  const buckets = new Map<string, Bucket>();

  return function rateLimiter(req: Request, res: Response, next: NextFunction) {
    const now = Date.now();

    // Opportunistic cleanup so the map can't grow unbounded.
    if (buckets.size > 5000) {
      for (const [k, b] of buckets) if (now > b.reset) buckets.delete(k);
    }

    const fwd = req.headers["x-forwarded-for"];
    const ip = (Array.isArray(fwd) ? fwd[0] : fwd?.split(",")[0]?.trim()) || req.ip || "unknown";
    const key = `${name ?? "g"}:${ip}`;

    let bucket = buckets.get(key);
    if (!bucket || now > bucket.reset) {
      bucket = { count: 0, reset: now + windowMs };
      buckets.set(key, bucket);
    }
    bucket.count++;

    if (bucket.count > max) {
      const retry = Math.ceil((bucket.reset - now) / 1000);
      res.setHeader("Retry-After", String(retry));
      return res.status(429).json({ error: "Too many requests. Please slow down and try again shortly." });
    }

    next();
  };
}
