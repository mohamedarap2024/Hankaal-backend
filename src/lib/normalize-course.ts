import type { Course } from "../types/index.js";

export function normalizeCurriculum(curriculum: unknown): Course["curriculum"] {
  if (!Array.isArray(curriculum)) return [];
  return curriculum
    .map((section) => {
      if (!section || typeof section !== "object") return null;
      const s = section as { section?: string; lessons?: unknown };
      const lessons = Array.isArray(s.lessons)
        ? s.lessons
            .filter((l) => l && typeof l === "object" && typeof (l as { title?: string }).title === "string")
            .map((l) => {
              const lesson = l as {
                title: string;
                duration?: string;
                videoUrl?: string;
                quiz?: { questions?: unknown };
              };
              const questions = Array.isArray(lesson.quiz?.questions)
                ? lesson.quiz.questions.filter(
                    (q) =>
                      q &&
                      typeof q === "object" &&
                      typeof (q as { question?: string }).question === "string" &&
                      Array.isArray((q as { options?: unknown }).options),
                  )
                : [];
              return {
                title: lesson.title,
                duration: lesson.duration ?? "5:00",
                ...(lesson.videoUrl ? { videoUrl: lesson.videoUrl } : {}),
                ...(questions.length ? { quiz: { questions } } : {}),
              };
            })
        : [];
      return { section: s.section ?? "Section", lessons };
    })
    .filter((s): s is Course["curriculum"][number] => !!s);
}

export function normalizeCourse(course: Course): Course {
  const curriculum = normalizeCurriculum(course.curriculum);
  const lessonCount = curriculum.reduce((sum, s) => sum + s.lessons.length, 0);
  const thumb = course.thumbnail;
  const safeThumbnail =
    thumb && (thumb.startsWith("linear-gradient") || thumb.startsWith("http") || thumb.startsWith("/uploads"))
      ? thumb
      : course.imageUrl || "linear-gradient(135deg,#1e3a8a,#3b82f6)";

  const isFree = course.isFree ?? course.price === 0;

  return {
    ...course,
    curriculum,
    lessons: lessonCount || course.lessons || 0,
    isFree,
    price: isFree ? 0 : course.price,
    originalPrice: isFree ? undefined : course.originalPrice,
    thumbnail: safeThumbnail,
    objectives: Array.isArray(course.objectives) ? course.objectives : [],
  };
}
