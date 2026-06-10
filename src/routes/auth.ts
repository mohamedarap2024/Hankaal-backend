import { Router } from "express";
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { OAuth2Client } from "google-auth-library";
import { z } from "zod";
import { pool } from "../db/database.js";
import { requireAuth, signToken, type AuthRequest } from "../middleware/auth.js";
import type { AuthResponse, User } from "../types/index.js";

const router = Router();
const googleClient = process.env.GOOGLE_CLIENT_ID
  ? new OAuth2Client(process.env.GOOGLE_CLIENT_ID)
  : null;

const registerSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const googleSchema = z.object({
  credential: z.string().min(1),
});

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

router.post("/register", async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.errors[0]?.message ?? "Invalid input" });
  }

  const { name, email, password } = parsed.data;
  const { rows: existing } = await pool.query("SELECT id FROM users WHERE email = $1", [email]);
  if (existing.length > 0) {
    return res.status(409).json({ error: "Email already registered" });
  }

  const id = randomUUID();
  const passwordHash = bcrypt.hashSync(password, 10);
  await pool.query("INSERT INTO users (id, name, email, password_hash) VALUES ($1, $2, $3, $4)", [
    id,
    name,
    email,
    passwordHash,
  ]);

  const { rows } = await pool.query(
    "SELECT id, name, email, role, avatar_url, created_at FROM users WHERE id = $1",
    [id],
  );

  const response: AuthResponse = { token: signToken(id), user: toUser(rows[0]) };
  return res.status(201).json(response);
});

router.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.errors[0]?.message ?? "Invalid input" });
  }

  const { email, password } = parsed.data;
  const { rows } = await pool.query(
    "SELECT id, name, email, password_hash, role, avatar_url, created_at FROM users WHERE email = $1",
    [email],
  );

  const row = rows[0];
  if (!row?.password_hash || !bcrypt.compareSync(password, row.password_hash)) {
    return res.status(401).json({ error: "Invalid email or password" });
  }

  const response: AuthResponse = {
    token: signToken(row.id),
    user: toUser(row),
  };
  return res.json(response);
});

router.post("/google", async (req, res) => {
  if (!googleClient || !process.env.GOOGLE_CLIENT_ID) {
    return res.status(503).json({ error: "Google login is not configured. Set GOOGLE_CLIENT_ID in Backend/.env" });
  }

  const parsed = googleSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid Google credential" });
  }

  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: parsed.data.credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    if (!payload?.email) {
      return res.status(400).json({ error: "Google account has no email" });
    }

    const googleId = payload.sub;
    const email = payload.email;
    const name = payload.name ?? email.split("@")[0];
    const avatarUrl = payload.picture ?? null;

    let { rows } = await pool.query(
      "SELECT id, name, email, role, avatar_url, created_at FROM users WHERE google_id = $1 OR email = $2",
      [googleId, email],
    );

    if (rows.length === 0) {
      const id = randomUUID();
      await pool.query(
        "INSERT INTO users (id, name, email, google_id, avatar_url, role) VALUES ($1,$2,$3,$4,$5,'student')",
        [id, name, email, googleId, avatarUrl],
      );
      rows = (await pool.query(
        "SELECT id, name, email, role, avatar_url, created_at FROM users WHERE id = $1",
        [id],
      )).rows;
    } else {
      await pool.query(
        "UPDATE users SET google_id = $1, avatar_url = COALESCE($2, avatar_url), name = $3 WHERE id = $4",
        [googleId, avatarUrl, name, rows[0].id],
      );
    }

    const user = toUser(rows[0]);
    return res.json({ token: signToken(user.id), user } satisfies AuthResponse);
  } catch {
    return res.status(401).json({ error: "Invalid Google token" });
  }
});

router.get("/me", requireAuth, (req: AuthRequest, res) => {
  return res.json({ user: req.user });
});

export default router;
