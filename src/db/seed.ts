import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { pool } from "./database.js";

const covers = [
  "linear-gradient(135deg,#1e3a8a,#3b82f6)",
  "linear-gradient(135deg,#7c2d12,#ea580c)",
  "linear-gradient(135deg,#064e3b,#10b981)",
  "linear-gradient(135deg,#581c87,#a855f7)",
  "linear-gradient(135deg,#0c4a6e,#0ea5e9)",
  "linear-gradient(135deg,#831843,#ec4899)",
  "linear-gradient(135deg,#365314,#84cc16)",
  "linear-gradient(135deg,#1f2937,#f59e0b)",
];

const instructors = [
  { name: "Dr. Amina Yusuf", title: "Senior Software Engineer", avatar: "https://i.pravatar.cc/150?img=47", bio: "15+ years building scalable web platforms." },
  { name: "Prof. Mahad Ali", title: "Data Scientist", avatar: "https://i.pravatar.cc/150?img=12", bio: "PhD in Machine Learning." },
  { name: "Fatima Hassan", title: "UX Design Lead", avatar: "https://i.pravatar.cc/150?img=45", bio: "Award-winning designer." },
  { name: "Omar Abdi", title: "Business Strategist", avatar: "https://i.pravatar.cc/150?img=33", bio: "MBA. Helped 200+ startups scale." },
];

const categories = ["Programming", "Design", "Business", "Data Science", "Marketing", "Languages"];

const titles = [
  "Complete Web Development Bootcamp",
  "Mastering UI/UX Design Principles",
  "Python for Data Science & ML",
  "Digital Marketing Mastery 2026",
  "Modern React & TypeScript",
  "Financial Accounting Fundamentals",
  "Graphic Design with Figma",
  "Business English for Professionals",
  "Mobile App Design Essentials",
  "Cloud Computing with AWS",
  "Data Visualization with D3.js",
  "Entrepreneurship & Startup Strategy",
];

const defaultTestimonials = [
  { name: "Hodan A.", role: "Software Developer", avatar: "https://i.pravatar.cc/150?img=20", quote: "Hankaal College transformed my career. The instructors are world-class and the projects feel like real work." },
  { name: "Yusuf M.", role: "Product Designer", avatar: "https://i.pravatar.cc/150?img=15", quote: "I went from zero to landing my first design job in 6 months. The community support is unmatched." },
  { name: "Layla K.", role: "Data Analyst", avatar: "https://i.pravatar.cc/150?img=49", quote: "Practical, patient, progressive — exactly what their motto promises. Best investment I've made." },
];

const defaultTeam = [
  { name: "Dr. Abdullahi Hankaal", role: "Founder & President", avatar: "https://i.pravatar.cc/300?img=68" },
  { name: "Sahra Mohamed", role: "Academic Director", avatar: "https://i.pravatar.cc/300?img=44" },
  { name: "Ibrahim Noor", role: "Head of Engineering", avatar: "https://i.pravatar.cc/300?img=60" },
  { name: "Maryan Farah", role: "Student Success Lead", avatar: "https://i.pravatar.cc/300?img=23" },
];

const defaultSettings: Record<string, string> = {
  logo_url: "/hankaal-logo.png",
  whatsapp_url: "https://wa.me/252614554731",
  payment_ussd_prefix: "*712*614554731*",
  payment_ussd_suffix: "#",
  site_name: "Hankaal College",
  site_tagline: "Practice · Patience · Progress",
};

export async function seedDb() {
  const { rows: countRows } = await pool.query<{ count: string }>("SELECT COUNT(*)::text AS count FROM courses");
  const courseCount = Number(countRows[0]?.count ?? 0);

  if (courseCount === 0) {
    const courses = titles.map((title, i) => {
      const inst = instructors[i % instructors.length];
      return {
        id: String(i + 1),
        slug: title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""),
        title,
        description: "A comprehensive program designed to take you from beginner to professional with hands-on projects and real-world skills.",
        longDescription: "This course is carefully crafted by industry experts at Hankaal College to deliver practical, in-demand skills.",
        instructor: inst,
        category: categories[i % categories.length],
        level: (["Beginner", "Intermediate", "Advanced"] as const)[i % 3],
        rating: 4.5 + ((i * 0.07) % 0.5),
        reviews: 200 + i * 87,
        students: 1200 + i * 540,
        duration: `${8 + (i % 12)}h ${15 + (i % 45)}m`,
        lessons: 32 + (i % 40),
        price: [29, 39, 49, 59, 69, 79][i % 6],
        originalPrice: [99, 129, 149, 159, 179, 199][i % 6],
        thumbnail: covers[i % covers.length],
        imageUrl: "",
        videoUrl: "",
        badge: i % 4 === 0 ? "Bestseller" : i % 5 === 0 ? "New" : undefined,
        objectives: ["Build production-grade projects", "Master industry best practices", "Earn a verified certificate"],
        curriculum: [
          { section: "Getting Started", lessons: [{ title: "Welcome & overview", duration: "5:20" }, { title: "Setup environment", duration: "12:40" }] },
          { section: "Core Foundations", lessons: [{ title: "Fundamentals", duration: "18:30" }, { title: "Hands-on lab", duration: "24:10" }] },
        ],
      };
    });

    for (const course of courses) {
      await pool.query("INSERT INTO courses (id, slug, data, status) VALUES ($1, $2, $3, 'published')", [
        course.id,
        course.slug,
        JSON.stringify(course),
      ]);
    }
    console.log(`Seeded ${courses.length} courses.`);
  }

  for (const [key, value] of Object.entries(defaultSettings)) {
    await pool.query(
      "INSERT INTO site_settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING",
      [key, value],
    );
  }

  const { rows: tCount } = await pool.query("SELECT COUNT(*)::int AS count FROM testimonials");
  if (tCount[0].count === 0) {
    for (let i = 0; i < defaultTestimonials.length; i++) {
      const t = defaultTestimonials[i];
      await pool.query(
        "INSERT INTO testimonials (id, name, role, avatar, quote, sort_order) VALUES ($1,$2,$3,$4,$5,$6)",
        [randomUUID(), t.name, t.role, t.avatar, t.quote, i],
      );
    }
    console.log("Seeded testimonials.");
  }

  const { rows: teamCount } = await pool.query("SELECT COUNT(*)::int AS count FROM team_members");
  if (teamCount[0].count === 0) {
    for (let i = 0; i < defaultTeam.length; i++) {
      const m = defaultTeam[i];
      await pool.query(
        "INSERT INTO team_members (id, name, role, avatar, sort_order) VALUES ($1,$2,$3,$4,$5)",
        [randomUUID(), m.name, m.role, m.avatar, i],
      );
    }
    console.log("Seeded team members.");
  }

  const users = [
    { email: "student@hankaal.edu", name: "Demo Student", password: "password123", role: "student" },
    { email: "admin@hankaal.edu", name: "Admin User", password: "admin123", role: "admin" },
    { email: "instructor@hankaal.edu", name: "Demo Instructor", password: "instructor123", role: "instructor" },
  ];

  for (const u of users) {
    const { rows } = await pool.query("SELECT id FROM users WHERE email = $1", [u.email]);
    if (rows.length === 0) {
      const hash = bcrypt.hashSync(u.password, 10);
      await pool.query(
        "INSERT INTO users (id, name, email, password_hash, role) VALUES ($1,$2,$3,$4,$5)",
        [randomUUID(), u.name, u.email, hash, u.role],
      );
      console.log(`Demo ${u.role}: ${u.email} / ${u.password}`);
    }
  }
}
