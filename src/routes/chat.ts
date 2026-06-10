import { Router } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { pool } from "../db/database.js";
import { requireAuth, type AuthRequest } from "../middleware/auth.js";
import { getSetting } from "../lib/settings.js";

const router = Router();

const messageSchema = z.object({
  message: z.string().min(1).max(2000),
});

async function canAccessOrder(orderId: string, userId: string, role: string) {
  if (role === "admin") return true;

  const { rows } = await pool.query("SELECT user_id, course_id, status FROM orders WHERE id = $1", [orderId]);
  if (rows.length === 0) return false;

  const order = rows[0];
  if (order.user_id === userId) return true;

  if (role === "instructor") {
    const { rows: courseRows } = await pool.query(
      "SELECT instructor_id FROM courses WHERE id = $1",
      [order.course_id],
    );
    return courseRows[0]?.instructor_id === userId;
  }

  return false;
}

router.get("/:orderId", requireAuth, async (req: AuthRequest, res) => {
  const allowed = await canAccessOrder(req.params.orderId, req.user!.id, req.user!.role);
  if (!allowed) return res.status(403).json({ error: "Access denied" });

  const { rows } = await pool.query(
    `SELECT cm.id, cm.message, cm.created_at, cm.sender_id, u.name AS sender_name, u.role AS sender_role
     FROM chat_messages cm
     JOIN users u ON u.id = cm.sender_id
     WHERE cm.order_id = $1
     ORDER BY cm.created_at ASC`,
    [req.params.orderId],
  );

  const whatsappUrl = await getSetting("whatsapp_url", "https://wa.me/252614554731");

  return res.json({
    messages: rows.map((r) => ({
      id: r.id,
      message: r.message,
      createdAt: r.created_at,
      senderId: r.sender_id,
      senderName: r.sender_name,
      senderRole: r.sender_role,
      isMine: r.sender_id === req.user!.id,
    })),
    whatsappUrl,
  });
});

router.post("/:orderId", requireAuth, async (req: AuthRequest, res) => {
  const parsed = messageSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Message is required" });
  }

  const allowed = await canAccessOrder(req.params.orderId, req.user!.id, req.user!.role);
  if (!allowed) return res.status(403).json({ error: "Access denied" });

  const id = randomUUID();
  await pool.query(
    "INSERT INTO chat_messages (id, order_id, sender_id, message) VALUES ($1,$2,$3,$4)",
    [id, req.params.orderId, req.user!.id, parsed.data.message],
  );

  return res.status(201).json({ id, message: "Message sent" });
});

export default router;
