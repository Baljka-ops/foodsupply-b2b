# FoodSupply B2B - Deploy Checklist

## 1. Server prerequisites
- Node.js LTS
- MongoDB service
- Reverse proxy (Nginx/IIS) with HTTPS

## 2. Environment
Create `.env`:
```env
NODE_ENV=production
PORT=5000
MONGO_URI=mongodb://127.0.0.1:27017/foodsupply_b2b
AUTH_SECRET=replace-with-long-random-secret
ALLOW_LEGACY_ROLE_HEADERS=false
API_RATE_LIMIT_WINDOW_MS=60000
API_RATE_LIMIT_MAX=240
AUTH_RATE_LIMIT_WINDOW_MS=60000
AUTH_RATE_LIMIT_MAX=20
```

## 3. Install and verify
```bash
npm install --omit=dev
npm run check:frontend
npm run check:api
```

## 4. Start with PM2
```bash
pm2 start ecosystem.config.cjs --env production
pm2 save
pm2 startup
```

## 5. Health checks
- `GET /api/health` must return `{ "ok": true }`
- Login/register flow must succeed
- `POST /api/state` without token must return `401`

## 6. Reverse proxy
Proxy HTTPS traffic to `http://127.0.0.1:5000`.
Set strong TLS and HSTS at proxy level.

## 7. Backup and monitoring
- Enable MongoDB backups (daily)
- Monitor app logs (`pm2 logs foodsupply-api`)
- Track 5xx and 429 frequency

