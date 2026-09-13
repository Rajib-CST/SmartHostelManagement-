# Staywise Smart Hostel / PG Management System

A full-stack management system built with HTML, CSS, JavaScript, Node.js, Express, and MySQL.

## Setup

1. Install Node.js 18+ and MySQL 8+.
2. Create the database and demo records:
   ```bash
   mysql -u root -p < database/schema.sql
   ```
3. Copy `.env.example` to `.env` and update the MySQL password and JWT secret.
4. Install packages and start the server:
   ```bash
   npm install
   npm start
   ```
5. Open http://localhost:3000.

Demo login: `admin@staywise.local` / `admin123` or `alex@example.com` / `admin123`.

## Structure

- `server.js`: Express API, authentication, validation, and static file server.
- `database/schema.sql`: MySQL schema, constraints, indexes, and seed data.
- `public/`: responsive single-page dashboard UI.

The API uses JWT tokens in local storage for this demo. For production, use secure HTTP-only cookies, HTTPS, rate limiting, and secret management.
