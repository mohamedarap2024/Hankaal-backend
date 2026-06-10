import { Router } from "express";
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { pool } from "../db/database.js";
import { requireAuth, requireAdmin, type AuthRequest } from "../middleware/auth.js";
import type { Course } from "../types/index.js";
import { buildCourse, createCourseSchema, extractQuizzesFromInput, insertQuizzes, replaceQuizzes, updateCourseData } from "../lib/course-builder.js";
import { normalizeCourse } from "../lib/normalize-course.js";

const router = Router();

router.use(requireAuth, requireAdmin);

function parseCourse(data: Course | string): Course {
  const raw = typeof data === "string" ? (JSON.parse(data) as Course) : data;
  return normalizeCourse(raw);
}

router.get("/stats", async (_req, res) => {
  const [users, courses, enrollments, messages, subscribers, pendingCourses, paidOrders] = await Promise.all([
    pool.query("SELECT COUNT(*)::int AS count FROM users"),
    pool.query("SELECT COUNT(*)::int AS count FROM courses"),
    pool.query("SELECT COUNT(*)::int AS count FROM enrollments"),
    pool.query("SELECT COUNT(*)::int AS count FROM contact_messages"),
    pool.query("SELECT COUNT(*)::int AS count FROM newsletter_subscribers"),
    pool.query("SELECT COUNT(*)::int AS count FROM courses WHERE status = 'pending'"),
    pool.query("SELECT COUNT(*)::int AS count FROM orders WHERE status = 'paid'"),
  ]);

  return res.json({
    users: users.rows[0].count,
    courses: courses.rows[0].count,
    enrollments: enrollments.rows[0].count,
    messages: messages.rows[0].count,
    subscribers: subscribers.rows[0].count,
    pendingCourses: pendingCourses.rows[0].count,
    paidOrders: paidOrders.rows[0].count,
  });
});

const createUserSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
  role: z.enum(["student", "instructor", "admin"]),
});

router.get("/users", async (_req, res) => {
  const { rows } = await pool.query(
    "SELECT id, name, email, role, created_at FROM users ORDER BY created_at DESC",
  );
  return res.json({
    users: rows.map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      role: r.role,
      createdAt: r.created_at,
    })),
  });
});

router.post("/users", async (req, res) => {
  const parsed = createUserSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.errors[0]?.message ?? "Invalid input" });
  }

  const { name, email, password, role } = parsed.data;
  const { rows: existing } = await pool.query("SELECT id FROM users WHERE email = $1", [email]);
  if (existing.length > 0) {
    return res.status(409).json({ error: "Email already registered" });
  }

  const id = randomUUID();
  const passwordHash = bcrypt.hashSync(password, 10);
  await pool.query(
    "INSERT INTO users (id, name, email, password_hash, role) VALUES ($1, $2, $3, $4, $5)",
    [id, name, email, passwordHash, role],
  );

  const { rows } = await pool.query(
    "SELECT id, name, email, role, created_at FROM users WHERE id = $1",
    [id],
  );

  return res.status(201).json({
    message: `${role} account created`,
    user: {
      id: rows[0].id,
      name: rows[0].name,
      email: rows[0].email,
      role: rows[0].role,
      createdAt: rows[0].created_at,
    },
  });
});

router.patch("/users/:id/role", async (req, res) => {
  const role = req.body.role;
  if (!["student", "instructor", "admin"].includes(role)) {
    return res.status(400).json({ error: "Invalid role" });
  }
  const { rowCount } = await pool.query("UPDATE users SET role = $1 WHERE id = $2", [role, req.params.id]);
  if (rowCount === 0) return res.status(404).json({ error: "User not found" });
  return res.json({ message: "Role updated" });
});

router.delete("/users/:id", async (req: AuthRequest, res) => {
  if (req.params.id === req.user!.id) {
    return res.status(400).json({ error: "Cannot delete your own account" });
  }
  const { rowCount } = await pool.query("DELETE FROM users WHERE id = $1", [req.params.id]);
  if (rowCount === 0) return res.status(404).json({ error: "User not found" });
  return res.json({ message: "User deleted" });
});

router.get("/courses", async (_req, res) => {
  const { rows } = await pool.query(
    "SELECT id, slug, data, status, instructor_id FROM courses ORDER BY created_at DESC",
  );
  return res.json({
    courses: rows.map((r) => ({ ...parseCourse(r.data), status: r.status, instructorId: r.instructor_id })),
  });
});

router.post("/courses", async (req: AuthRequest, res) => {
  const parsed = createCourseSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.errors[0]?.message ?? "Invalid course data" });
  }

  const course = buildCourse(parsed.data, req.user!);

  await pool.query(
    "INSERT INTO courses (id, slug, data, status, instructor_id) VALUES ($1,$2,$3,'published',$4)",
    [course.id, course.slug, JSON.stringify(course), req.user!.id],
  );

  await insertQuizzes(pool, course.id, extractQuizzesFromInput(parsed.data));

  return res.status(201).json({ course, status: "published", message: "Course published successfully" });
});

router.put("/courses/:id", async (req: AuthRequest, res) => {
  const parsed = createCourseSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.errors[0]?.message ?? "Invalid course data" });
  }

  const { rows } = await pool.query("SELECT id, slug, data, status FROM courses WHERE id = $1", [req.params.id]);
  if (rows.length === 0) return res.status(404).json({ error: "Course not found" });

  const existing = parseCourse(rows[0].data);
  const updated = updateCourseData(existing, parsed.data);

  await pool.query("UPDATE courses SET slug = $1, data = $2 WHERE id = $3", [
    updated.slug,
    JSON.stringify(updated),
    req.params.id,
  ]);

  await replaceQuizzes(pool, req.params.id, parsed.data);

  return res.json({ course: updated, status: rows[0].status, message: "Course updated successfully" });
});

router.patch("/courses/:id/status", async (req, res) => {
  const status = req.body.status;
  if (!["published", "pending", "rejected", "draft"].includes(status)) {
    return res.status(400).json({ error: "Invalid status" });
  }
  const { rowCount } = await pool.query("UPDATE courses SET status = $1 WHERE id = $2", [status, req.params.id]);
  if (rowCount === 0) return res.status(404).json({ error: "Course not found" });
  return res.json({ message: `Course ${status}` });
});

router.delete("/courses/:id", async (req, res) => {
  const { rowCount } = await pool.query("DELETE FROM courses WHERE id = $1", [req.params.id]);
  if (rowCount === 0) return res.status(404).json({ error: "Course not found" });
  return res.json({ message: "Course deleted" });
});

router.get("/orders", async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT o.*, u.name AS user_name, u.email AS user_email, c.data AS course_data
     FROM orders o JOIN users u ON u.id = o.user_id JOIN courses c ON c.id = o.course_id
     ORDER BY o.created_at DESC`,
  );
  return res.json({
    orders: rows.map((r) => ({
      id: r.id,
      userName: r.user_name,
      userEmail: r.user_email,
      amount: Number(r.amount),
      status: r.status,
      ussdCode: r.ussd_code,
      paymentPhone: r.payment_phone,
      createdAt: r.created_at,
      paidAt: r.paid_at,
      courseTitle: parseCourse(r.course_data).title,
      courseId: r.course_id,
      userId: r.user_id,
    })),
  });
});

router.post("/orders/:id/approve", async (req: AuthRequest, res) => {
  const { rows } = await pool.query("SELECT * FROM orders WHERE id = $1", [req.params.id]);
  if (rows.length === 0) return res.status(404).json({ error: "Order not found" });

  const order = rows[0];
  if (!["paid", "pending_payment"].includes(order.status)) {
    return res.status(400).json({ error: "Order cannot be approved" });
  }

  const { rows: existing } = await pool.query(
    "SELECT id FROM enrollments WHERE user_id = $1 AND course_id = $2",
    [order.user_id, order.course_id],
  );

  if (existing.length === 0) {
    await pool.query(
      "INSERT INTO enrollments (id, user_id, course_id) VALUES ($1,$2,$3)",
      [randomUUID(), order.user_id, order.course_id],
    );
  }

  await pool.query(
    "UPDATE orders SET status = 'approved', approved_at = NOW() WHERE id = $1",
    [req.params.id],
  );

  await pool.query(
    "INSERT INTO chat_messages (id, order_id, sender_id, message) VALUES ($1,$2,$3,$4)",
    [
      randomUUID(),
      req.params.id,
      req.user!.id,
      "Your payment has been verified and course access is now unlocked. Welcome to Hankaal College!",
    ],
  );

  return res.json({ message: "Order approved and course access granted" });
});

router.post("/orders/:id/unapprove", async (req: AuthRequest, res) => {
  const { rows } = await pool.query("SELECT * FROM orders WHERE id = $1", [req.params.id]);
  if (rows.length === 0) return res.status(404).json({ error: "Order not found" });

  const order = rows[0];
  if (order.status !== "approved") {
    return res.status(400).json({ error: "Only approved orders can be unapproved" });
  }

  await pool.query("DELETE FROM enrollments WHERE user_id = $1 AND course_id = $2", [
    order.user_id,
    order.course_id,
  ]);

  await pool.query(
    "UPDATE orders SET status = 'paid', approved_at = NULL WHERE id = $1",
    [req.params.id],
  );

  await pool.query(
    "INSERT INTO chat_messages (id, order_id, sender_id, message) VALUES ($1,$2,$3,$4)",
    [
      randomUUID(),
      req.params.id,
      req.user!.id,
      "Course access has been revoked by admin. Contact us here if you need help.",
    ],
  );

  return res.json({ message: "Order unapproved — student access removed" });
});

router.get("/messages", async (_req, res) => {
  const { rows } = await pool.query(
    "SELECT id, first_name, last_name, email, subject, message, created_at FROM contact_messages ORDER BY created_at DESC LIMIT 50",
  );
  return res.json({
    messages: rows.map((r) => ({
      id: r.id,
      firstName: r.first_name,
      lastName: r.last_name,
      email: r.email,
      subject: r.subject,
      message: r.message,
      createdAt: r.created_at,
    })),
  });
});

router.get("/enrollments", async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT e.id, e.progress, e.enrolled_at, u.name AS user_name, u.email AS user_email, c.data
     FROM enrollments e JOIN users u ON u.id = e.user_id JOIN courses c ON c.id = e.course_id
     ORDER BY e.enrolled_at DESC`,
  );
  return res.json({
    enrollments: rows.map((r) => ({
      id: r.id,
      progress: r.progress,
      enrolledAt: r.enrolled_at,
      userName: r.user_name,
      userEmail: r.user_email,
      courseTitle: parseCourse(r.data).title,
    })),
  });
});

// CMS: testimonials
const testimonialSchema = z.object({
  name: z.string().min(1),
  role: z.string().min(1),
  avatar: z.string().url(),
  quote: z.string().min(10),
});

router.get("/testimonials", async (_req, res) => {
  const { rows } = await pool.query("SELECT * FROM testimonials ORDER BY sort_order");
  return res.json({ testimonials: rows });
});

router.post("/testimonials", async (req, res) => {
  const parsed = testimonialSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid data" });
  const id = randomUUID();
  await pool.query(
    "INSERT INTO testimonials (id, name, role, avatar, quote, sort_order) VALUES ($1,$2,$3,$4,$5,$6)",
    [id, parsed.data.name, parsed.data.role, parsed.data.avatar, parsed.data.quote, 99],
  );
  return res.status(201).json({ id });
});

router.put("/testimonials/:id", async (req, res) => {
  const parsed = testimonialSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid data" });
  await pool.query(
    "UPDATE testimonials SET name=$1, role=$2, avatar=$3, quote=$4 WHERE id=$5",
    [parsed.data.name, parsed.data.role, parsed.data.avatar, parsed.data.quote, req.params.id],
  );
  return res.json({ message: "Updated" });
});

router.delete("/testimonials/:id", async (req, res) => {
  await pool.query("DELETE FROM testimonials WHERE id = $1", [req.params.id]);
  return res.json({ message: "Deleted" });
});

// CMS: team
const teamSchema = z.object({
  name: z.string().min(1),
  role: z.string().min(1),
  avatar: z.string().url(),
});

router.get("/team", async (_req, res) => {
  const { rows } = await pool.query("SELECT * FROM team_members ORDER BY sort_order");
  return res.json({ team: rows });
});

router.post("/team", async (req, res) => {
  const parsed = teamSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid data" });
  const id = randomUUID();
  await pool.query(
    "INSERT INTO team_members (id, name, role, avatar, sort_order) VALUES ($1,$2,$3,$4,$5)",
    [id, parsed.data.name, parsed.data.role, parsed.data.avatar, 99],
  );
  return res.status(201).json({ id });
});

router.put("/team/:id", async (req, res) => {
  const parsed = teamSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid data" });
  await pool.query(
    "UPDATE team_members SET name=$1, role=$2, avatar=$3 WHERE id=$4",
    [parsed.data.name, parsed.data.role, parsed.data.avatar, req.params.id],
  );
  return res.json({ message: "Updated" });
});

router.delete("/team/:id", async (req, res) => {
  await pool.query("DELETE FROM team_members WHERE id = $1", [req.params.id]);
  return res.json({ message: "Deleted" });
});

// CMS: site settings
router.get("/settings", async (_req, res) => {
  const { rows } = await pool.query("SELECT key, value FROM site_settings");
  return res.json({ settings: Object.fromEntries(rows.map((r) => [r.key, r.value])) });
});

router.put("/settings", async (req, res) => {
  const settings = req.body as Record<string, string>;
  for (const [key, value] of Object.entries(settings)) {
    await pool.query(
      "INSERT INTO site_settings (key, value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value = $2",
      [key, value],
    );
  }
  return res.json({ message: "Settings updated" });
});

export default router;
