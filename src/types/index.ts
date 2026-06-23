export type Course = {
  id: string;
  title: string;
  slug: string;
  description: string;
  longDescription: string;
  instructor: { name: string; avatar: string; title: string; bio: string };
  category: string;
  level: "Beginner" | "Intermediate" | "Advanced";
  rating: number;
  reviews: number;
  students: number;
  duration: string;
  lessons: number;
  isFree?: boolean;
  price: number;
  originalPrice?: number;
  thumbnail: string;
  imageUrl?: string;
  videoUrl?: string;
  badge?: string;
  /** Instructor revenue share percentage (0-100). Private — never sent to public listings. */
  instructorPercentage?: number;
  objectives: string[];
  curriculum: {
    section: string;
    lessons: {
      title: string;
      duration: string;
      videoUrl?: string;
      quiz?: { questions: { question: string; options: string[]; correctIndex: number }[] };
    }[];
  }[];
  status?: string;
};

export type User = {
  id: string;
  name: string;
  email: string;
  role: "student" | "instructor" | "admin";
  avatarUrl?: string;
  createdAt: string;
};

export type AuthResponse = {
  token: string;
  user: User;
};
