import { Router } from "express";
import { pool } from "../db/database.js";
import type { Course } from "../types/index.js";
import { normalizeCourse } from "../lib/normalize-course.js";

const router = Router();

function parseCourse(row: { id: string; slug: string; data: Course | string }): Course {
  const raw = typeof row.data === "string" ? (JSON.parse(row.data) as Course) : row.data;
  return normalizeCourse(raw);
}

router.get("/", async (req, res) => {
  const { category, search, sort } = req.query;
  const { rows } = await pool.query(
    "SELECT id, slug, data FROM courses WHERE status = 'published' ORDER BY created_at DESC",
  );
  let courses = rows.map(parseCourse);

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

router.get("/:slug/quizzes", async (req, res) => {
  const { rows: courseRows } = await pool.query(
    "SELECT id FROM courses WHERE slug = $1 AND status = 'published'",
    [req.params.slug],
  );
  if (courseRows.length === 0) return res.status(404).json({ error: "Course not found" });

  const { rows } = await pool.query(
    "SELECT id, title, questions, lesson_key FROM quizzes WHERE course_id = $1",
    [courseRows[0].id],
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

router.get("/:slug", async (req, res) => {
  const { rows } = await pool.query(
    "SELECT id, slug, data FROM courses WHERE slug = $1 AND status = 'published'",
    [req.params.slug],
  );

  if (rows.length === 0) {
    return res.status(404).json({ error: "Course not found" });
  }

  const course = parseCourse(rows[0]);
  const { rows: relatedRows } = await pool.query(
    "SELECT id, slug, data FROM courses WHERE id != $1 AND status = 'published'",
    [course.id],
  );
  const related = relatedRows
    .map(parseCourse)
    .filter((c) => c.category === course.category)
    .slice(0, 3);

  return res.json({ course, related });
});

export default router;
