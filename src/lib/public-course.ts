import type { Course } from "../types/index.js";

/** Safe fields for course cards / listing — no curriculum, videos, or quizzes. */
export function toCourseSummary(course: Course): Course {
  return {
    id: course.id,
    slug: course.slug,
    title: course.title,
    description: course.description,
    longDescription: course.longDescription,
    instructor: course.instructor,
    category: course.category,
    level: course.level,
    rating: course.rating,
    reviews: course.reviews,
    students: course.students,
    duration: course.duration,
    lessons: course.lessons,
    isFree: course.isFree,
    price: course.price,
    originalPrice: course.originalPrice,
    thumbnail: course.thumbnail,
    imageUrl: course.imageUrl,
    badge: course.badge,
    objectives: course.objectives,
    curriculum: [],
  };
}

/** Marketing page — outline only, promo video allowed, no lesson videos or quiz answers. */
export function toCoursePreview(course: Course): Course {
  return {
    ...toCourseSummary(course),
    videoUrl: course.videoUrl,
    curriculum: course.curriculum.map((section) => ({
      section: section.section,
      lessons: section.lessons.map((lesson) => ({
        title: lesson.title,
        duration: lesson.duration,
      })),
    })),
  };
}
