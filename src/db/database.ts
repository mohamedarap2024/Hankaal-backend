import pg from "pg";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required. Set it in Backend/.env");
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  keepAlive: true, // keep TCP alive so cloud Postgres is slower to drop idle clients
  idleTimeoutMillis: 30_000, // recycle idle clients before the DB closes them
  connectionTimeoutMillis: 10_000,
  max: 10,
});

// CRITICAL: without this handler, a dropped idle connection (cloud Postgres
// closing idle clients) emits an 'error' event that crashes the whole process.
// Logging it lets the pool quietly discard the bad client and reconnect.
pool.on("error", (err) => {
  console.error("Postgres pool error (idle client dropped, will reconnect):", err.message);
});

export async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT,
      google_id TEXT UNIQUE,
      avatar_url TEXT,
      role TEXT NOT NULL DEFAULT 'student',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS courses (
      id TEXT PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      data JSONB NOT NULL,
      status TEXT NOT NULL DEFAULT 'published',
      instructor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS enrollments (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      enrolled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      progress INTEGER NOT NULL DEFAULT 0,
      UNIQUE(user_id, course_id)
    );

    CREATE TABLE IF NOT EXISTS contact_messages (
      id TEXT PRIMARY KEY,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      email TEXT NOT NULL,
      subject TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS newsletter_subscribers (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS site_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS testimonials (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      avatar TEXT NOT NULL,
      quote TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS team_members (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      avatar TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS cart_items (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(user_id, course_id)
    );

    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      amount NUMERIC NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending_payment',
      payment_phone TEXT,
      ussd_code TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      paid_at TIMESTAMPTZ,
      approved_at TIMESTAMPTZ
    );

    CREATE TABLE IF NOT EXISTS chat_messages (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      sender_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      message TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS quizzes (
      id TEXT PRIMARY KEY,
      course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      questions JSONB NOT NULL DEFAULT '[]',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id TEXT UNIQUE;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;
    ALTER TABLE courses ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'published';
    ALTER TABLE courses ADD COLUMN IF NOT EXISTS instructor_id TEXT REFERENCES users(id) ON DELETE SET NULL;
    ALTER TABLE quizzes ADD COLUMN IF NOT EXISTS lesson_key TEXT;
    ALTER TABLE courses ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
    ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
  `).catch(() => {});

  // Indexes for the hot query paths (course listing, enrollments, orders, quizzes).
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_courses_status_created ON courses (status, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_courses_instructor ON courses (instructor_id);
    CREATE INDEX IF NOT EXISTS idx_courses_category ON courses ((data->>'category'));
    CREATE INDEX IF NOT EXISTS idx_enrollments_course ON enrollments (course_id);
    CREATE INDEX IF NOT EXISTS idx_enrollments_user ON enrollments (user_id);
    CREATE INDEX IF NOT EXISTS idx_orders_course_status ON orders (course_id, status);
    CREATE INDEX IF NOT EXISTS idx_orders_user ON orders (user_id);
    CREATE INDEX IF NOT EXISTS idx_quizzes_course ON quizzes (course_id);
    CREATE INDEX IF NOT EXISTS idx_cart_user ON cart_items (user_id);
    CREATE INDEX IF NOT EXISTS idx_chat_order ON chat_messages (order_id);
  `).catch(() => {});
}
