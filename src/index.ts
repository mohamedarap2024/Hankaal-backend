import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { initDb, pool } from "./db/database.js";
import { seedDb } from "./db/seed.js";
import authRoutes from "./routes/auth.js";
import coursesRoutes from "./routes/courses.js";
import enrollmentsRoutes from "./routes/enrollments.js";
import contactRoutes from "./routes/contact.js";
import contentRoutes from "./routes/content.js";
import adminRoutes from "./routes/admin.js";
import cartRoutes from "./routes/cart.js";
import ordersRoutes from "./routes/orders.js";
import chatRoutes from "./routes/chat.js";
import instructorRoutes from "./routes/instructor.js";
import uploadRoutes from "./routes/uploads.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT) || 3001;
function parseOrigins(...values: (string | undefined)[]) {
  return values
    .filter(Boolean)
    .flatMap((v) => v!.split(","))
    .map((s) => s.trim())
    .filter(Boolean);
}

const allowedOrigins = new Set(
  parseOrigins(
    process.env.CORS_ORIGIN,
    process.env.FRONTEND_URL,
    "http://localhost:8080",
    "http://localhost:8081",
    "http://localhost:5173",
    "http://127.0.0.1:8080",
    "http://127.0.0.1:8081",
  ),
);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`CORS blocked: ${origin}`));
      }
    },
    credentials: true,
  }),
);
app.use(express.json());
app.use("/uploads", express.static(path.join(__dirname, "../uploads")));

app.get("/api/health", async (_req, res) => {
  try {
    const { rows } = await pool.query("SELECT COUNT(*)::int AS count FROM courses");
    res.json({ status: "ok", database: "postgresql", courses: rows[0].count });
  } catch (err) {
    res.status(500).json({ status: "error", message: (err as Error).message });
  }
});

app.use("/api/auth", authRoutes);
app.use("/api/courses", coursesRoutes);
app.use("/api/enrollments", enrollmentsRoutes);
app.use("/api/contact", contactRoutes);
app.use("/api/content", contentRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/cart", cartRoutes);
app.use("/api/orders", ordersRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/instructor", instructorRoutes);
app.use("/api/uploads", uploadRoutes);

app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

async function start() {
  try {
    await initDb();
    await seedDb();
    app.listen(PORT, () => {
      console.log(`Hankaal Backend running at http://localhost:${PORT}`);
      console.log(`Database: PostgreSQL (Neon)`);
    });
  } catch (err) {
    console.error("Failed to start server:", err);
    process.exit(1);
  }
}

start();
