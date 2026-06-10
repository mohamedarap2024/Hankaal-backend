# Hankaal College — Backend API

Express + PostgreSQL (Neon) REST API for Hankaal College.

Deploy this folder as its own GitHub repository → **Render** (recommended for Express).

> **Note:** Vercel is best for the frontend. This Express API with file uploads runs better on Render or Railway.

## Local development

```bash
npm install
cp .env.example .env
# Edit .env — set DATABASE_URL (Neon PostgreSQL)
npm run dev
```

API: http://localhost:3001  
Health: http://localhost:3001/api/health

## Deploy to Render

1. Push **only this `Backend/` folder** to a new GitHub repo (e.g. `hankaal-backend`).
2. [Render](https://render.com) → **New +** → **Blueprint** → connect repo (uses `render.yaml`).
   - Or **Web Service** manually: Build `npm install`, Start `npm start`.
3. Environment variables:

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | Neon PostgreSQL connection string |
| `JWT_SECRET` | Yes | Long random secret |
| `CORS_ORIGIN` | Yes | Your Vercel URL, e.g. `https://hankaal.vercel.app` |
| `FRONTEND_URL` | Yes | Same as CORS (or comma-separated list) |
| `GOOGLE_CLIENT_ID` | No | Google OAuth |
| `PORT` | Auto | Set by Render |

4. After deploy, set `VITE_API_URL` on Vercel to your Render URL.

## Demo accounts (after seed)

| Role | Email | Password |
|------|-------|----------|
| Student | student@hankaal.edu | password123 |
| Admin | admin@hankaal.edu | admin123 |
| Instructor | instructor@hankaal.edu | instructor123 |

## API overview

- `GET /api/health` — health check
- `POST /api/auth/register` · `POST /api/auth/login`
- `GET /api/courses` · enrollments · cart · orders · chat
- `GET /api/admin/*` — admin panel (auth required)

## Uploads

Course images/videos are stored in `uploads/`. On Render free tier, disk is ephemeral — for production consider S3/Cloudinary later.
