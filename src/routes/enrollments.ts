import { Router } from "express";
import { randomUUID } from "node:crypto";
import { pool } from "../db/database.js";
import { requireAuth, type AuthRequest } from "../middleware/auth.js";
import type { Course } from "../types/index.js";

const router = Router();

function parseCourse(data: Course | string): Course {
  return typeof data === "string" ? (JSON.parse(data) as Course) : data;
}

router.get("/", requireAuth, async (req: AuthRequest, res) => {
  const { rows } = await pool.query(
    `SELECT e.id, e.course_id, e.enrolled_at, e.progress, c.data
     FROM enrollments e
     JOIN courses c ON c.id = e.course_id
     WHERE e.user_id = $1
     ORDER BY e.enrolled_at DESC`,
    [req.user!.id],
  );

  const enrollments = rows.map((r) => ({
    id: r.id,
    courseId: r.course_id,
    enrolledAt: r.enrolled_at instanceof Date ? r.enrolled_at.toISOString() : r.enrolled_at,
    progress: r.progress,
    course: parseCourse(r.data),
  }));

  return res.json({ enrollments });
});

router.get("/stats", requireAuth, async (req: AuthRequest, res) => {
  const { rows } = await pool.query(
    `SELECT
       COUNT(*)::int AS total,
       COALESCE(AVG(progress), 0)::int AS avg_progress,
       COUNT(*) FILTER (WHERE progress >= 100)::int AS completed
     FROM enrollments WHERE user_id = $1`,
    [req.user!.id],
  );

  return res.json({
    totalEnrolled: rows[0].total,
    avgProgress: rows[0].avg_progress,
    completed: rows[0].completed,
  });
});

router.patch("/:id/progress", requireAuth, async (req: AuthRequest, res) => {
  const progress = Number(req.body.progress);
  if (Number.isNaN(progress) || progress < 0 || progress > 100) {
    return res.status(400).json({ error: "Progress must be between 0 and 100" });
  }

  const { rowCount } = await pool.query(
    "UPDATE enrollments SET progress = $1 WHERE id = $2 AND user_id = $3",
    [progress, req.params.id, req.user!.id],
  );

  if (rowCount === 0) {
    return res.status(404).json({ error: "Enrollment not found" });
  }

  return res.json({ message: "Progress updated", progress });
});

router.get("/check/:courseId", requireAuth, async (req: AuthRequest, res) => {
  const { rows } = await pool.query(
    "SELECT id, progress FROM enrollments WHERE user_id = $1 AND course_id = $2",
    [req.user!.id, req.params.courseId],
  );

  if (rows.length === 0) {
    return res.json({ enrolled: false });
  }

  return res.json({
    enrolled: true,
    enrollmentId: rows[0].id,
    progress: rows[0].progress,
  });
});

router.post("/:courseId", requireAuth, async (req: AuthRequest, res) => {
  const { rows: courseRows } = await pool.query("SELECT id, data FROM courses WHERE id = $1", [req.params.courseId]);
  if (courseRows.length === 0) {
    return res.status(404).json({ error: "Course not found" });
  }

  const course = parseCourse(courseRows[0].data);
  const isFree = course.isFree || course.price === 0;
  if (!isFree) {
    const { rows: approved } = await pool.query(
      "SELECT id FROM orders WHERE user_id = $1 AND course_id = $2 AND status = 'approved'",
      [req.user!.id, req.params.courseId],
    );
    if (approved.length === 0) {
      return res.status(403).json({ error: "This is a paid course. Add to cart and complete payment first." });
    }
  }

  const { rows: existing } = await pool.query(
    "SELECT id FROM enrollments WHERE user_id = $1 AND course_id = $2",
    [req.user!.id, req.params.courseId],
  );

  if (existing.length > 0) {
    return res.status(409).json({ error: "Already enrolled in this course" });
  }

  const id = randomUUID();
  await pool.query("INSERT INTO enrollments (id, user_id, course_id) VALUES ($1, $2, $3)", [
    id,
    req.user!.id,
    req.params.courseId,
  ]);

  return res.status(201).json({ id, message: "Enrolled successfully" });
});

export default router;
