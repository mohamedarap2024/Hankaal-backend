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
      return {
        ...parseCourse(r.data),
        status: r.status,
        instructorId: r.instructor_id,
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
