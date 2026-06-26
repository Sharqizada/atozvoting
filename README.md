# A To Z Voting

Full-stack voting system built with Vue 3, Vite, Tailwind CSS, Express, and MySQL.

## Stack

- Vue 3
- Vite
- Tailwind CSS
- Node.js
- Express
- MySQL
- Google Material Symbols
- Roboto

## Main Features

- Public associate voting home
- Admin authentication with badge ID and password
- Database-backed admin management
- Voting round management with live, extend, end, and publish-winner actions
- Associate management with photo support
- Category management
- One-vote-per-round enforcement
- Published top-3 winner display on the Home page

## Admin Storage

- Admin accounts are stored in the MySQL `admins` table.
- Admin login validates against database records in `server.js`.
- Admin create, update, list, and delete operations also use the database.
- A protected super admin is seeded automatically from environment variables on startup.

## Local Development

### Requirements

- Node.js 20+
- MySQL 8+ or XAMPP MySQL

### Install

```bash
npm install
```

### Environment

Create a `.env` file from `.env.example` and update the values:

```bash
copy .env.example .env
```

Important:

- Change `SUPER_ADMIN_PASSWORD` before any live deployment.
- For local frontend development, you can set `VITE_API_URL=http://localhost:5000`.

### Run Backend

```bash
npm run dev:api
```

### Run Frontend

```bash
npm run dev
```

## Docker Deployment

This project is prepared for Docker-based live deployment.

### Files Added

- `Dockerfile`
- `docker-compose.yml`
- `.env.example`
- `.dockerignore`
- `.gitignore`

### Start With Docker

1. Create a real environment file:

```bash
copy .env.example .env
```

2. Update at least these values in `.env`:

- `DB_PASSWORD`
- `MYSQL_ROOT_PASSWORD`
- `SUPER_ADMIN_PASSWORD`

3. Build and start the containers:

```bash
docker compose up --build -d
```

4. Open the app:

```text
http://localhost:5000
```

### Stop Docker

```bash
docker compose down
```

### Stop Docker And Remove DB Volume

```bash
docker compose down -v
```

## Production Notes

- The Express server serves the built Vue frontend in production.
- In production, the frontend uses same-origin API requests by default.
- MySQL data is persisted in the Docker volume `mysql_data`.
- The MySQL container is intentionally kept internal to Docker and is not exposed on the VPS host port.
- Do not commit your real `.env` file.

## GitHub Publish Checklist

Before pushing to GitHub:

- Keep `.env` out of the repository
- Keep `node_modules` out of the repository
- Keep `dist` out of the repository unless you intentionally want built assets committed
- Verify `SUPER_ADMIN_PASSWORD` in `.env.example` is only a placeholder

## Repository

- Target repository: `https://github.com/Sharqizada/atozvoting`
