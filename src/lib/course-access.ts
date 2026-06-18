import { pool } from "../db/database.js";
import type { User } from "../types/index.js";

export async function userCanAccessFullCourse(
  user: User | undefined,
  courseId: string,
): Promise<boolean> {
  if (!user) return false;
  if (user.role === "admin") return true;

  if (user.role === "instructor") {
    const { rows } = await pool.query<{ instructor_id: string | null }>(
      "SELECT instructor_id FROM courses WHERE id = $1",
      [courseId],
    );
    return rows[0]?.instructor_id === user.id;
  }

  const { rows } = await pool.query(
    "SELECT id FROM enrollments WHERE user_id = $1 AND course_id = $2",
    [user.id, courseId],
  );
  return rows.length > 0;
}
