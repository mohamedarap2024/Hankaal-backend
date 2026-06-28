import { Router } from "express";
import { pool } from "../db/database.js";
import type { Course } from "../types/index.js";
import { userCanAccessFullCourse } from "../lib/course-access.js";
import { normalizeCourse } from "../lib/normalize-course.js";
import { toCoursePreview, toCourseSummary } from "../lib/public-course.js";
import { optionalAuth, requireAuth, type AuthRequest } from "../middleware/auth.js";

const router = Router();

function parseCourse(row: { id: string; slug: string; data: Course | string }): Course {
  const raw = typeof row.data === "string" ? (JSON.parse(row.data) as Course) : row.data;
  return normalizeCourse(raw);
}

router.get("/", async (_req, res) => {
  const { category, search, sort } = _req.query;
  const { rows } = await pool.query(
    "SELECT id, slug, data FROM courses WHERE status = 'published' ORDER BY created_at DESC",
  );
  let courses = rows.map(parseCourse).map(toCourseSummary);

  if (typeof category === "string" && category !== "All") {
    courses = courses.filter((c) => c.category === category);
  }

  if (typeof search === "string" && search.trim()) {
    const q = search.toLowerCase();
    courses = courses.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        c.instructor.name.toLowerCase().includes(q) ||
        c.category.toLowerCase().includes(q),
    );
  }

  if (sort === "rating") courses.sort((a, b) => b.rating - a.rating);
  else if (sort === "students") courses.sort((a, b) => b.students - a.students);
  else if (sort === "price-asc") courses.sort((a, b) => a.price - b.price);
  else if (sort === "price-desc") courses.sort((a, b) => b.price - a.price);

  return res.json({ courses, total: courses.length });
});

router.get("/:slug/quizzes", requireAuth, async (req: AuthRequest, res) => {
  const { rows: courseRows } = await pool.query<{ id: string }>(
    "SELECT id FROM courses WHERE slug = $1 AND status = 'published'",
    [req.params.slug],
  );
  if (courseRows.length === 0) return res.status(404).json({ error: "Course not found" });

  const courseId = courseRows[0].id;
  const allowed = await userCanAccessFullCourse(req.user, courseId);
  if (!allowed) {
    return res.status(403).json({ error: "Enroll in this course to access quizzes" });
  }

  const { rows } = await pool.query(
    "SELECT id, title, questions, lesson_key FROM quizzes WHERE course_id = $1",
    [courseId],
  );
  return res.json({
    quizzes: rows.map((q) => ({
      id: q.id,
      title: q.title,
      questions: q.questions,
      lessonKey: q.lesson_key ?? undefined,
    })),
  });
});

router.get("/:slug", optionalAuth, async (req: AuthRequest, res) => {
  const { rows } = await pool.query(
    "SELECT id, slug, data, instructor_id FROM courses WHERE slug = $1 AND status = 'published'",
    [req.params.slug],
  );

  if (rows.length === 0) {
    return res.status(404).json({ error: "Course not found" });
  }

  const course = parseCourse(rows[0]);

  // Reflect the instructor's current profile photo/name on the course page.
  if (rows[0].instructor_id) {
    const { rows: who } = await pool.query(
      "SELECT name, avatar_url FROM users WHERE id = $1",
      [rows[0].instructor_id],
    );
    if (who[0]?.avatar_url) {
      course.instructor = { ...course.instructor, avatar: who[0].avatar_url };
    }
  }

  const fullAccess = await userCanAccessFullCourse(req.user, course.id);

  const { rows: relatedRows } = await pool.query(
    `SELECT id, slug, data FROM courses
     WHERE id != $1 AND status = 'published' AND data->>'category' = $2
     LIMIT 3`,
    [course.id, course.category],
  );
  const related = relatedRows.map(parseCourse).map(toCourseSummary);

  return res.json({
    course: fullAccess ? course : toCoursePreview(course),
    related,
  });
});

export default router;
