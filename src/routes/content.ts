import { Router } from "express";
import { pool } from "../db/database.js";
import { getSettings } from "../lib/settings.js";

const router = Router();

const defaultStats = [
  { value: "50K+", label: "Active Students" },
  { value: "200+", label: "Expert Instructors" },
  { value: "350+", label: "Online Courses" },
  { value: "98%", label: "Satisfaction Rate" },
];

const defaultFaqs = [
  { q: "Do I get a certificate after completing a course?", a: "Yes, every Hankaal College course awards a verified certificate of completion you can share on LinkedIn or with employers." },
  { q: "Can I access courses on mobile?", a: "Absolutely. Our platform is fully responsive and works beautifully on phones, tablets, and desktops." },
  { q: "Is there a refund policy?", a: "We offer a 30-day money-back guarantee on all paid courses, no questions asked." },
  { q: "How long do I have access to a course?", a: "Once enrolled, you get lifetime access including all future updates to the course material." },
  { q: "Do you offer student discounts?", a: "Yes — verified students receive 30% off any paid course. Contact our support to learn more." },
];

router.get("/settings", async (_req, res) => {
  const settings = await getSettings();
  return res.json({ settings });
});

router.get("/stats", (_req, res) => res.json({ stats: defaultStats }));

router.get("/testimonials", async (_req, res) => {
  const { rows } = await pool.query(
    "SELECT id, name, role, avatar, quote FROM testimonials ORDER BY sort_order ASC",
  );
  return res.json({ testimonials: rows });
});

router.get("/team", async (_req, res) => {
  const { rows } = await pool.query(
    "SELECT id, name, role, avatar FROM team_members ORDER BY sort_order ASC",
  );
  return res.json({ team: rows });
});

router.get("/faqs", (_req, res) => res.json({ faqs: defaultFaqs }));

export default router;
