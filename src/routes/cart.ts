import { Router } from "express";
import { randomUUID } from "node:crypto";
import { pool } from "../db/database.js";
import { requireAuth, type AuthRequest } from "../middleware/auth.js";
import type { Course } from "../types/index.js";

const router = Router();

function parseCourse(data: Course | string): Course {
  return typeof data === "string" ? (JSON.parse(data) as Course) : data;
}

router.use(requireAuth);

router.get("/", async (req: AuthRequest, res) => {
  const { rows } = await pool.query(
    `SELECT ci.id, ci.course_id, c.data
     FROM cart_items ci
     JOIN courses c ON c.id = ci.course_id
     WHERE ci.user_id = $1
     ORDER BY ci.created_at DESC`,
    [req.user!.id],
  );

  const items = rows.map((r) => ({
    id: r.id,
    courseId: r.course_id,
    course: parseCourse(r.data),
  }));

  const total = items.reduce((sum, i) => sum + i.course.price, 0);
  return res.json({ items, total });
});

router.post("/:courseId", async (req: AuthRequest, res) => {
  const { rows: courseRows } = await pool.query(
    "SELECT id, status, data FROM courses WHERE id = $1",
    [req.params.courseId],
  );
  if (courseRows.length === 0 || courseRows[0].status !== "published") {
    return res.status(404).json({ error: "Course not found" });
  }

  const course = parseCourse(courseRows[0].data);
  if (course.isFree || course.price === 0) {
    return res.status(400).json({ error: "This is a free course. Use Enroll Free on the course page." });
  }

  const { rows: enrolled } = await pool.query(
    "SELECT id FROM enrollments WHERE user_id = $1 AND course_id = $2",
    [req.user!.id, req.params.courseId],
  );
  if (enrolled.length > 0) {
    return res.status(409).json({ error: "Already enrolled in this course" });
  }

  const { rows: existing } = await pool.query(
    "SELECT id FROM cart_items WHERE user_id = $1 AND course_id = $2",
    [req.user!.id, req.params.courseId],
  );
  if (existing.length > 0) {
    return res.status(409).json({ error: "Course already in cart" });
  }

  const id = randomUUID();
  await pool.query("INSERT INTO cart_items (id, user_id, course_id) VALUES ($1,$2,$3)", [
    id,
    req.user!.id,
    req.params.courseId,
  ]);

  return res.status(201).json({ id, message: "Added to cart" });
});

router.delete("/:courseId", async (req: AuthRequest, res) => {
  await pool.query("DELETE FROM cart_items WHERE user_id = $1 AND course_id = $2", [
    req.user!.id,
    req.params.courseId,
  ]);
  return res.json({ message: "Removed from cart" });
});

export default router;
