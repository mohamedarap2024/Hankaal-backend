import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Course } from "../types/index.js";
import type { AuthRequest } from "../middleware/auth.js";

export const quizQuestionSchema = z.object({
  question: z.string().min(1),
  options: z.array(z.string().min(1)).min(2),
  correctIndex: z.number().min(0),
});

export const lessonQuizSchema = z.object({
  questions: z.array(quizQuestionSchema).min(1),
});

export const lessonSchema = z.object({
  title: z.string().min(1),
  duration: z.string().min(1),
  videoUrl: z.string().optional().or(z.literal("")),
  quiz: lessonQuizSchema.optional(),
});

export const curriculumSectionSchema = z.object({
  section: z.string().min(1),
  lessons: z.array(lessonSchema).min(1),
});

export const quizSchema = z.object({
  title: z.string().min(2),
  questions: z.array(quizQuestionSchema).min(1),
});

export const createCourseSchema = z.object({
  title: z.string().min(3),
  description: z.string().min(10),
  longDescription: z.string().min(10),
  category: z.string().min(2),
  level: z.enum(["Beginner", "Intermediate", "Advanced"]),
  isFree: z.boolean().optional().default(false),
  price: z.number().min(0),
  originalPrice: z.number().min(0).optional(),
  duration: z.string().min(2),
  imageUrl: z.string().optional().or(z.literal("")),
  videoUrl: z.string().optional().or(z.literal("")),
  thumbnail: z.string().optional().or(z.literal("")),
  badge: z.string().optional().or(z.literal("")),
  objectives: z.array(z.string().min(1)).min(1),
  curriculum: z.array(curriculumSectionSchema).min(1),
  quizzes: z.array(quizSchema).optional(),
});

export type CreateCourseInput = z.infer<typeof createCourseSchema>;

export function buildCourse(data: CreateCourseInput, user: NonNullable<AuthRequest["user"]>): Course {
  const id = randomUUID();
  const slug = data.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

  const lessonCount = data.curriculum.reduce((sum, s) => sum + s.lessons.length, 0);
  const isFree = data.isFree ?? false;

  return {
    id,
    slug,
    title: data.title,
    description: data.description,
    longDescription: data.longDescription,
    instructor: {
      name: user.name,
      avatar: user.avatarUrl ?? "https://i.pravatar.cc/150?img=68",
      title: user.role === "admin" ? "Hankaal College" : "Course Instructor",
      bio: `${user.name} — instructor at Hankaal College.`,
    },
    category: data.category,
    level: data.level,
    rating: 4.5,
    reviews: 0,
    students: 0,
    duration: data.duration,
    lessons: lessonCount,
    isFree,
    price: isFree ? 0 : data.price,
    originalPrice: isFree ? undefined : data.originalPrice,
    thumbnail: data.thumbnail || data.imageUrl || "linear-gradient(135deg,#1e3a8a,#3b82f6)",
    imageUrl: data.imageUrl ?? "",
    videoUrl: data.videoUrl ?? "",
    badge: data.badge || undefined,
    objectives: data.objectives,
    curriculum: data.curriculum.map((s) => ({
      section: s.section,
      lessons: s.lessons.map((l) => ({
        title: l.title,
        duration: l.duration,
        ...(l.videoUrl ? { videoUrl: l.videoUrl } : {}),
        ...(l.quiz?.questions?.length ? { quiz: { questions: l.quiz.questions } } : {}),
      })),
    })),
  };
}

export type QuizRecord = {
  title: string;
  questions: z.infer<typeof quizQuestionSchema>[];
  lessonKey?: string;
};

export function extractQuizzesFromInput(data: CreateCourseInput): QuizRecord[] {
  const records: QuizRecord[] = [];
  data.curriculum.forEach((section, si) => {
    section.lessons.forEach((lesson, li) => {
      if (lesson.quiz?.questions?.length) {
        records.push({
          title: `${lesson.title} Quiz`,
          questions: lesson.quiz.questions,
          lessonKey: `${si}-${li}`,
        });
      }
    });
  });
  if (data.quizzes?.length) {
    for (const quiz of data.quizzes) {
      records.push({ title: quiz.title, questions: quiz.questions });
    }
  }
  return records;
}

export async function insertQuizzes(
  pool: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
  courseId: string,
  quizzes: QuizRecord[],
) {
  if (!quizzes.length) return;
  for (const quiz of quizzes) {
    await pool.query(
      "INSERT INTO quizzes (id, course_id, title, questions, lesson_key) VALUES ($1,$2,$3,$4,$5)",
      [randomUUID(), courseId, quiz.title, JSON.stringify(quiz.questions), quiz.lessonKey ?? null],
    );
  }
}

export async function replaceQuizzes(
  pool: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
  courseId: string,
  data: CreateCourseInput,
) {
  await pool.query("DELETE FROM quizzes WHERE course_id = $1", [courseId]);
  await insertQuizzes(pool, courseId, extractQuizzesFromInput(data));
}

function slugify(title: string) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

export function updateCourseData(existing: Course, data: CreateCourseInput): Course {
  const lessonCount = data.curriculum.reduce((sum, s) => sum + s.lessons.length, 0);
  const newSlug = data.title !== existing.title ? slugify(data.title) : existing.slug;
  const isFree = data.isFree ?? false;

  return {
    ...existing,
    slug: newSlug,
    title: data.title,
    description: data.description,
    longDescription: data.longDescription,
    category: data.category,
    level: data.level,
    duration: data.duration,
    lessons: lessonCount,
    isFree,
    price: isFree ? 0 : data.price,
    originalPrice: isFree ? undefined : data.originalPrice,
    thumbnail: data.thumbnail || data.imageUrl || existing.thumbnail,
    imageUrl: data.imageUrl ?? existing.imageUrl ?? "",
    videoUrl: data.videoUrl ?? existing.videoUrl ?? "",
    badge: data.badge || undefined,
    objectives: data.objectives,
    curriculum: data.curriculum.map((s) => ({
      section: s.section,
      lessons: s.lessons.map((l) => ({
        title: l.title,
        duration: l.duration,
        ...(l.videoUrl ? { videoUrl: l.videoUrl } : {}),
        ...(l.quiz?.questions?.length ? { quiz: { questions: l.quiz.questions } } : {}),
      })),
    })),
  };
}
