# FoodSupply B2B - Setup Guide

## Stack
- Frontend: HTML/CSS/Vanilla JS
- API: Node.js + Express + MongoDB
- Optional legacy fallback: PHP (`api/state.php`) + MySQL

## Requirements
- Node.js LTS
- MongoDB Community Server (service running)
- Optional XAMPP only if you explicitly need PHP fallback

## Install
```bash
npm.cmd install
```

## Run API + Frontend (recommended)
```bash
npm.cmd run start:api
```

Then open:
- `http://localhost:5000/`

## Development mode
```bash
npm.cmd run dev:api
```

## Validation commands
```bash
npm.cmd run check:frontend
npm.cmd run check:api
```

Smoke test (server must already be running):
```bash
npm.cmd run smoke:api
```

## Environment
Copy `.env.example` to `.env` and set:
- `AUTH_SECRET` to a strong value
- `ALLOW_LEGACY_ROLE_HEADERS=false` (keep this off in production)
- rate limit values if needed

## Frontend API mode
By default frontend uses Node API only.

To enable PHP fallback manually in browser runtime:
```html
<script>
  window.B2B_ENABLE_PHP_FALLBACK = true;
</script>
```

## Notes
- Browser session is saved in `localStorage`.
- MongoDB collections used: `app_states`, `users`.
- In production (`NODE_ENV=production`), server will refuse to start if `AUTH_SECRET` is left as dev default.

