import { Router } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { pool } from "../db/database.js";
import { requireAuth, type AuthRequest } from "../middleware/auth.js";
import { buildUssdCode, getSetting, getSettings } from "../lib/settings.js";
import type { Course } from "../types/index.js";

const router = Router();

function parseCourse(data: Course | string): Course {
  return typeof data === "string" ? (JSON.parse(data) as Course) : data;
}

const checkoutSchema = z.object({
  courseId: z.string().min(1),
  paymentPhone: z.string().min(9),
});

router.use(requireAuth);

router.get("/my", async (req: AuthRequest, res) => {
  const { rows } = await pool.query(
    `SELECT o.*, c.data AS course_data
     FROM orders o
     JOIN courses c ON c.id = o.course_id
     WHERE o.user_id = $1
     ORDER BY o.created_at DESC`,
    [req.user!.id],
  );

  const settings = await getSettings();
  return res.json({
    orders: rows.map((r) => ({
      id: r.id,
      courseId: r.course_id,
      amount: Number(r.amount),
      status: r.status,
      paymentPhone: r.payment_phone,
      ussdCode: r.ussd_code,
      createdAt: r.created_at,
      paidAt: r.paid_at,
      approvedAt: r.approved_at,
      course: parseCourse(r.course_data),
      whatsappUrl: settings.whatsapp_url,
    })),
  });
});

router.post("/checkout", async (req: AuthRequest, res) => {
  const parsed = checkoutSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.errors[0]?.message ?? "Invalid input" });
  }

  const { courseId, paymentPhone } = parsed.data;
  const { rows: courseRows } = await pool.query(
    "SELECT id, data, status FROM courses WHERE id = $1",
    [courseId],
  );
  if (courseRows.length === 0 || courseRows[0].status !== "published") {
    return res.status(404).json({ error: "Course not found" });
  }

  const course = parseCourse(courseRows[0].data);
  if (course.isFree || course.price === 0) {
    return res.status(400).json({ error: "This is a free course. Enroll directly from the course page." });
  }

  const { rows: activeOrders } = await pool.query(
    `SELECT o.*, c.data AS course_data
     FROM orders o
     JOIN courses c ON c.id = o.course_id
     WHERE o.user_id = $1 AND o.course_id = $2 AND o.status IN ('pending_payment', 'paid')
     ORDER BY o.created_at DESC
     LIMIT 1`,
    [req.user!.id, courseId],
  );
  if (activeOrders.length > 0) {
    const existing = activeOrders[0];
    const whatsappUrl = await getSetting("whatsapp_url", "https://wa.me/252614554731");
    return res.json({
      order: {
        id: existing.id,
        courseId: existing.course_id,
        amount: Number(existing.amount),
        status: existing.status,
        ussdCode: existing.ussd_code,
        paymentPhone: existing.payment_phone,
        course: parseCourse(existing.course_data),
        whatsappUrl,
      },
      instructions: `You already have an active order for this course. Complete payment or wait for admin approval.`,
      existing: true,
    });
  }

  const prefix = await getSetting("payment_ussd_prefix", "*712*614554731*");
  const suffix = await getSetting("payment_ussd_suffix", "#");
  const ussdCode = buildUssdCode(course.price, prefix, suffix);

  const id = randomUUID();
  await pool.query(
    `INSERT INTO orders (id, user_id, course_id, amount, payment_phone, ussd_code, status)
     VALUES ($1,$2,$3,$4,$5,$6,'pending_payment')`,
    [id, req.user!.id, courseId, course.price, paymentPhone, ussdCode],
  );

  await pool.query("DELETE FROM cart_items WHERE user_id = $1 AND course_id = $2", [
    req.user!.id,
    courseId,
  ]);

  const whatsappUrl = await getSetting("whatsapp_url", "https://wa.me/252614554731");

  return res.status(201).json({
    order: {
      id,
      courseId,
      amount: course.price,
      status: "pending_payment",
      ussdCode,
      paymentPhone,
      course,
      whatsappUrl,
    },
    instructions: `Dial ${ussdCode} on your phone to pay $${course.price}. After payment, confirm below and chat with us.`,
  });
});

router.post("/:id/confirm-payment", async (req: AuthRequest, res) => {
  const { rows } = await pool.query(
    "SELECT * FROM orders WHERE id = $1 AND user_id = $2",
    [req.params.id, req.user!.id],
  );
  if (rows.length === 0) return res.status(404).json({ error: "Order not found" });

  const order = rows[0];
  if (order.status !== "pending_payment") {
    return res.status(400).json({ error: "Order already processed" });
  }

  await pool.query(
    "UPDATE orders SET status = 'paid', paid_at = NOW() WHERE id = $1",
    [req.params.id],
  );

  await pool.query(
    "INSERT INTO chat_messages (id, order_id, sender_id, message) VALUES ($1,$2,$3,$4)",
    [
      randomUUID(),
      req.params.id,
      req.user!.id,
      `I have completed the payment of $${order.amount} via USSD ${order.ussd_code}. Please approve my course access.`,
    ],
  );

  const whatsappUrl = await getSetting("whatsapp_url", "https://wa.me/252614554731");

  return res.json({
    message: "Payment confirmed. Admin will review and unlock your course. You can chat below or contact us on WhatsApp.",
    whatsappUrl,
    status: "paid",
  });
});

export default router;
