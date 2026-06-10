import { Router } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { pool } from "../db/database.js";

const router = Router();

const contactSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email(),
  subject: z.string().min(1),
  message: z.string().min(10),
});

const newsletterSchema = z.object({
  email: z.string().email(),
});

router.post("/", async (req, res) => {
  const parsed = contactSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.errors[0]?.message ?? "Invalid input" });
  }

  const { firstName, lastName, email, subject, message } = parsed.data;
  await pool.query(
    "INSERT INTO contact_messages (id, first_name, last_name, email, subject, message) VALUES ($1, $2, $3, $4, $5, $6)",
    [randomUUID(), firstName, lastName, email, subject, message],
  );

  return res.status(201).json({ message: "Message sent successfully" });
});

router.post("/newsletter", async (req, res) => {
  const parsed = newsletterSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.errors[0]?.message ?? "Invalid email" });
  }

  try {
    await pool.query("INSERT INTO newsletter_subscribers (id, email) VALUES ($1, $2)", [
      randomUUID(),
      parsed.data.email,
    ]);
    return res.status(201).json({ message: "Subscribed successfully" });
  } catch {
    return res.status(409).json({ error: "Email already subscribed" });
  }
});

export default router;
