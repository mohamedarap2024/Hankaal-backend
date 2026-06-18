import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { pool } from "../db/database.js";
import type { User } from "../types/index.js";

export type AuthRequest = Request & { user?: User };

const JWT_SECRET = process.env.JWT_SECRET ?? "hankaal-dev-secret-change-in-production";

export function signToken(userId: string): string {
  return jwt.sign({ sub: userId }, JWT_SECRET, { expiresIn: "7d" });
}

export function verifyToken(token: string): { sub: string } {
  return jwt.verify(token, JWT_SECRET) as { sub: string };
}

function toUser(row: {
  id: string;
  name: string;
  email: string;
  role: string;
  avatar_url?: string | null;
  created_at: Date | string;
}): User {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role as User["role"],
    avatarUrl: row.avatar_url ?? undefined,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
  };
}

export async function optionalAuth(req: AuthRequest, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return next();
  }

  try {
    const payload = verifyToken(header.slice(7));
    const { rows } = await pool.query(
      "SELECT id, name, email, role, avatar_url, created_at FROM users WHERE id = $1",
      [payload.sub],
    );
    if (rows.length > 0) req.user = toUser(rows[0]);
  } catch {
    /* ignore invalid token on optional auth */
  }
  next();
}

export async function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Authentication required" });
  }

  try {
    const payload = verifyToken(header.slice(7));
    const { rows } = await pool.query(
      "SELECT id, name, email, role, avatar_url, created_at FROM users WHERE id = $1",
      [payload.sub],
    );

    if (rows.length === 0) {
      return res.status(401).json({ error: "User not found" });
    }

    req.user = toUser(rows[0]);
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

export function requireAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.user || req.user.role !== "admin") {
    return res.status(403).json({ error: "Admin access required" });
  }
  next();
}

export function requireInstructor(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.user || !["instructor", "admin"].includes(req.user.role)) {
    return res.status(403).json({ error: "Instructor access required" });
  }
  next();
}
