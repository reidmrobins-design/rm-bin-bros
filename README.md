# RM Bin Bros

Website + online booking system for a local trash/recycling bin cleaning business.

## What's included

- Marketing pages: Home, Services & Pricing, FAQ, About & Contact
- Live booking page (`booking.html`) with a real calendar of open time slots
- Node.js/Express backend with a SQLite database that stores appointments and prevents double-booking
- Simple admin page (`admin.html`) to view and cancel appointments

## Requirements

- [Node.js](https://nodejs.org) 22.5 or newer (includes npm). The backend uses Node's built-in `node:sqlite` module, so no native build tools (Python/Visual Studio) are needed — just Node itself.

  A portable copy of Node.js 24 was already installed on this machine at `%LOCALAPPDATA%\nodejs-portable\node-v24.18.0-win-x64` (no admin rights required, not on your system PATH). Easiest way to run the site: double-click **`start-server.bat`** in this folder — it points at that portable Node install automatically. If you install Node.js normally later (e.g. via nodejs.org or `winget install OpenJS.NodeJS.LTS` as Administrator), `npm install` / `npm start` will work directly too.

## Setup

```bash
cd rm-bin-bros
npm install
npm start
```

Or on Windows, just double-click `start-server.bat` (installs dependencies on first run automatically).

Then open http://localhost:3000 in your browser.

The SQLite database file is created automatically at `data/rmbinbros.db` the first time you run the server, along with the three starter service plans (One-Time Clean, Monthly, Bi-Weekly).

## Admin access

The admin page at `/admin.html` is protected by a key. By default it's `change-me` — **change this before deploying**. Set your own key via an environment variable:

```bash
# Windows PowerShell
$env:ADMIN_KEY = "your-secret-key"
npm start
```

```bash
# macOS/Linux
ADMIN_KEY=your-secret-key npm start
```

Enter the same key on the `/admin.html` page to load and cancel appointments.

## Customizing

- **Business details**: phone/email/address/hours appear in the `<footer>` of every page in `public/*.html` and on `public/about.html` — search-and-replace the placeholder phone number, email, and service area.
- **Services & pricing**: edit the `seed` array in `server/db.js`. Changing prices there only affects newly created databases — if you've already run the server once, edit the `services` table directly or delete `data/rmbinbros.db` to reseed (this also deletes existing appointments).
- **Business hours / time slots**: edit `TIME_SLOTS`, `CLOSED_WEEKDAYS`, `MAX_BOOKINGS_PER_SLOT`, and `MAX_ADVANCE_DAYS` in `server/schedule.js`.
- **Blocking a date** (holiday, fully booked, etc.): insert a row into the `blocked_dates` table (`blocked_date` as `YYYY-MM-DD`).
- **Styling/branding**: colors and fonts are CSS variables at the top of `public/css/style.css`.

## Project structure

```
rm-bin-bros/
  server/
    index.js          Express app entry point
    db.js              SQLite schema + seed data
    schedule.js         Business hours / slot config
    adminAuth.js         Admin key middleware
    routes/
      services.js        GET /api/services
      availability.js     GET /api/availability?date=YYYY-MM-DD
      appointments.js      POST/GET /api/appointments, POST /api/appointments/:id/cancel
  public/
    index.html, services.html, booking.html, faq.html, about.html, admin.html
    css/style.css
    js/main.js, js/booking.js
  data/
    rmbinbros.db        Created automatically on first run
  start-server.bat      Windows convenience launcher (uses the portable Node install)
```

## Deploying

This is a standard Node/Express app, so it runs on most Node hosts (Render, Railway, Fly.io, a VPS, etc.). Notes:

- Set the `ADMIN_KEY` and `PORT` environment variables on your host.
- The SQLite file lives on disk at `data/rmbinbros.db` — make sure your host's filesystem is persistent (not ephemeral) or the database will reset on redeploy. Platforms with ephemeral filesystems (e.g. most serverless hosts) will need a persistent volume or a swap to a hosted database instead.
- There's no email/SMS confirmation wired up yet — the booking form shows an on-screen confirmation, but no real email is sent (the FAQ/booking copy references one for the customer's benefit; you'll want to hook up a transactional email service like Postmark, SendGrid, or Resend if you want that to actually happen).
