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

The SQLite database file is created automatically at `data/rmbinbros.db` the first time you run the server, along with the three starter service plans (One-Time Clean, Quarterly, Monthly).

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
- The SQLite file lives on disk — make sure your host's filesystem is persistent (not ephemeral) or the database will reset on every redeploy. Platforms with ephemeral filesystems (e.g. most serverless hosts, and Render's free tier) will need a persistent volume or a swap to a hosted database instead.
- **Completion emails** (via [Resend](https://resend.com)): when you mark an appointment "Completed" in the admin page, the customer automatically gets an email with a link straight to the review form. To turn this on:
  1. Sign up at [resend.com](https://resend.com) and grab an API key from the dashboard.
  2. Verify a domain you own under **Domains** (Resend gives you DNS records to add at your registrar — usually live within a few minutes). You need a domain you control to send to real customers; Resend's shared `onboarding@resend.dev` address only delivers to your own account email, not customers.
  3. On Render, add environment variables:
     - `RESEND_API_KEY` — the API key from Resend
     - `RESEND_FROM_EMAIL` — e.g. `RM Bin Bros <notify@yourdomain.com>` (must use the domain you verified)
     - `SITE_URL` — your live site's base URL, e.g. `https://rm-bin-bros.onrender.com`
  4. Save — Render redeploys automatically and completion emails start sending.

  If these env vars aren't set, marking an appointment complete still works fine — the email step is just silently skipped (a warning is logged).

- There's no SMS confirmation wired up yet — only the completion email above. If you want texts too, you'd need a provider like Twilio (a phone number + ~$0.0079/text) — ask and it can be added the same way.

- **Address suggestions** (via [LocationIQ](https://locationiq.com)): as customers type their service address on the booking form, a dropdown suggests real matching addresses. To turn this on:
  1. Sign up at [locationiq.com](https://locationiq.com) (free tier, 5,000 requests/day, works with a regular email — no business email or domain required).
  2. In the dashboard, grab your **Access Token**.
  3. Optional but recommended: under that token's settings, add your live site's domain (`rm-bin-bros.onrender.com`) to the allowed referrers, so the key only works from your site.
  4. On Render, add an environment variable `LOCATIONIQ_API_KEY` set to that token.
  5. Save — Render redeploys automatically and address suggestions start working.

  If this env var isn't set, the address field just works as a normal text box (no suggestions, no errors).

### Adding a persistent disk on Render

Render's free web service tier has no persistent disk, so every redeploy wipes the SQLite database. To fix it:

1. In the Render dashboard, open your `rm-bin-bros` service.
2. Go to the **Disks** tab → **Add Disk**.
3. Set a **Mount Path** (e.g. `/var/data`) and a size (1 GB is plenty). This is a paid add-on — Render will show you the cost before you confirm.
4. Go to **Environment** → add a variable `DATA_DIR` set to the same path you used as the mount path (e.g. `/var/data`).
5. Save — Render will redeploy automatically. The app reads `DATA_DIR` (see `server/db.js`) and stores the database there instead of the app folder, so it now survives redeploys.

Without this, appointments booked on the live site will disappear the next time you push new code.
