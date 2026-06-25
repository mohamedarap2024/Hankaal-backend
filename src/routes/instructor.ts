import { Router } from "express";
import { pool } from "../db/database.js";
import { requireAuth, requireInstructor, type AuthRequest } from "../middleware/auth.js";
import { buildCourse, createCourseSchema, extractQuizzesFromInput, insertQuizzes, replaceQuizzes, updateCourseData } from "../lib/course-builder.js";
import type { Course } from "../types/index.js";
import { normalizeCourse } from "../lib/normalize-course.js";

const router = Router();

router.use(requireAuth, requireInstructor);

function parseCourse(data: Course | string): Course {
  const raw = typeof data === "string" ? (JSON.parse(data) as Course) : data;
  return normalizeCourse(raw);
}

router.get("/courses/preview/:slug", async (req: AuthRequest, res) => {
  const { rows } = await pool.query(
    "SELECT id, slug, data, status, instructor_id FROM courses WHERE slug = $1",
    [req.params.slug],
  );
  if (rows.length === 0) return res.status(404).json({ error: "Course not found" });

  const row = rows[0];
  const isAdmin = req.user!.role === "admin";
  if (!isAdmin && row.instructor_id !== req.user!.id) {
    return res.status(403).json({ error: "You can only preview your own courses" });
  }

  const course = parseCourse(row.data);
  const { rows: quizRows } = await pool.query(
    "SELECT id, title, questions, lesson_key FROM quizzes WHERE course_id = $1",
    [row.id],
  );

  return res.json({
    course,
    status: row.status,
    instructorId: row.instructor_id,
    quizzes: quizRows.map((q) => ({
      id: q.id,
      title: q.title,
      questions: q.questions,
      lessonKey: q.lesson_key ?? undefined,
    })),
    related: [],
  });
});

router.get("/courses", async (req: AuthRequest, res) => {
  const isAdmin = req.user!.role === "admin";
  const { rows } = isAdmin
    ? await pool.query("SELECT id, slug, data, status, instructor_id, created_at FROM courses ORDER BY created_at DESC")
    : await pool.query(
        "SELECT id, slug, data, status, instructor_id, created_at FROM courses WHERE instructor_id = $1 ORDER BY created_at DESC",
        [req.user!.id],
      );

  const courses = await Promise.all(
    rows.map(async (r) => {
      const { rows: quizRows } = await pool.query(
        "SELECT id, title, questions, lesson_key FROM quizzes WHERE course_id = $1",
        [r.id],
      );

      const { rows: statRows } = await pool.query(
        `SELECT
           (SELECT COUNT(*) FROM enrollments e WHERE e.course_id = $1)::int AS enrollments,
           (SELECT COUNT(*) FROM orders o WHERE o.course_id = $1 AND o.status = 'approved')::int AS sales,
           (SELECT COALESCE(SUM(o.amount), 0) FROM orders o WHERE o.course_id = $1 AND o.status = 'approved') AS revenue`,
        [r.id],
      );

      const course = parseCourse(r.data);
      const revenue = Number(statRows[0].revenue) || 0;
      const percentage = course.instructorPercentage ?? 0;

      return {
        ...course,
        status: r.status,
        instructorId: r.instructor_id,
        enrollments: statRows[0].enrollments,
        sales: statRows[0].sales,
        revenue,
        instructorEarnings: Math.round(revenue * (percentage / 100) * 100) / 100,
        quizzes: quizRows.map((q) => ({
          id: q.id,
          title: q.title,
          questions: q.questions,
          lessonKey: q.lesson_key ?? undefined,
        })),
      };
    }),
  );

  return res.json({ courses });
});

router.get("/courses/:id/students", async (req: AuthRequest, res) => {
  const { rows: courseRows } = await pool.query(
    "SELECT id, instructor_id FROM courses WHERE id = $1",
    [req.params.id],
  );
  if (courseRows.length === 0) return res.status(404).json({ error: "Course not found" });

  const isAdmin = req.user!.role === "admin";
  if (!isAdmin && courseRows[0].instructor_id !== req.user!.id) {
    return res.status(403).json({ error: "You can only view students of your own courses" });
  }

  const { rows: enrolled } = await pool.query(
    `SELECT u.name, u.email, e.progress, e.enrolled_at
     FROM enrollments e JOIN users u ON u.id = e.user_id
     WHERE e.course_id = $1
     ORDER BY e.enrolled_at DESC`,
    [req.params.id],
  );

  const { rows: orders } = await pool.query(
    `SELECT u.name, u.email, o.status, o.amount, o.created_at
     FROM orders o JOIN users u ON u.id = o.user_id
     WHERE o.course_id = $1
     ORDER BY o.created_at DESC`,
    [req.params.id],
  );

  const toIso = (d: Date | string) => (d instanceof Date ? d.toISOString() : d);

  return res.json({
    enrolled: enrolled.map((r) => ({
      name: r.name,
      email: r.email,
      progress: r.progress,
      enrolledAt: toIso(r.enrolled_at),
    })),
    orders: orders.map((r) => ({
      name: r.name,
      email: r.email,
      status: r.status,
      amount: Number(r.amount),
      createdAt: toIso(r.created_at),
    })),
  });
});

router.post("/courses", async (req: AuthRequest, res) => {
  const parsed = createCourseSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.errors[0]?.message ?? "Invalid course data" });
  }

  const course = buildCourse(parsed.data, req.user!);
  const isAdmin = req.user!.role === "admin";
  const status = isAdmin ? "published" : "pending";

  await pool.query(
    "INSERT INTO courses (id, slug, data, status, instructor_id) VALUES ($1,$2,$3,$4,$5)",
    [course.id, course.slug, JSON.stringify(course), status, req.user!.id],
  );

  await insertQuizzes(pool, course.id, extractQuizzesFromInput(parsed.data));

  return res.status(201).json({
    course,
    status,
    message: isAdmin
      ? "Course published successfully"
      : "Course submitted for admin approval",
  });
});

router.put("/courses/:id", async (req: AuthRequest, res) => {
  const parsed = createCourseSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.errors[0]?.message ?? "Invalid course data" });
  }

  const { rows } = await pool.query(
    "SELECT id, slug, data, status, instructor_id FROM courses WHERE id = $1",
    [req.params.id],
  );
  if (rows.length === 0) return res.status(404).json({ error: "Course not found" });

  const row = rows[0];
  const isAdmin = req.user!.role === "admin";
  if (!isAdmin && row.instructor_id !== req.user!.id) {
    return res.status(403).json({ error: "You can only edit your own courses" });
  }

  const existing = parseCourse(row.data);
  const updated = updateCourseData(existing, parsed.data);

  await pool.query("UPDATE courses SET slug = $1, data = $2 WHERE id = $3", [
    updated.slug,
    JSON.stringify(updated),
    req.params.id,
  ]);

  await replaceQuizzes(pool, req.params.id, parsed.data);

  return res.json({
    course: updated,
    status: row.status,
    message: "Course updated successfully",
  });
});

router.delete("/courses/:id", async (req: AuthRequest, res) => {
  const { rows } = await pool.query(
    "SELECT id, instructor_id FROM courses WHERE id = $1",
    [req.params.id],
  );
  if (rows.length === 0) return res.status(404).json({ error: "Course not found" });

  const row = rows[0];
  const isAdmin = req.user!.role === "admin";
  if (!isAdmin && row.instructor_id !== req.user!.id) {
    return res.status(403).json({ error: "You can only delete your own courses" });
  }

  await pool.query("DELETE FROM courses WHERE id = $1", [req.params.id]);
  return res.json({ message: "Course deleted" });
});

export default router;
