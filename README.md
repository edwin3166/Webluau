# VELUM Protector

Protect Luau scripts so they can **only** be executed inside a specific executor.  
The real source code is never visible in the browser and is only delivered when the correct headers are present.

## Features

- AES-256-GCM encryption of scripts at rest
- Executor lock (`identifyexecutor()` must match the name you set)
- Per-script secret key
- Expiration dates
- Simple web panel to protect & manage scripts
- Rate limiting
- Clean loader that the user pastes into the executor

## Quick start

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env → set ALLOWED_EXECUTOR to the exact name returned by identifyexecutor()
# Example values: "Fluxus", "Wave", "Valyse", "Solara", etc.
# Set ADMIN_USERNAME and ADMIN_PASSWORD (12+ characters).
# Generate AUTH_SESSION_SECRET with: openssl rand -hex 32

# 3. Run
npm start
```

Open http://localhost:3000

## How it works

1. You paste the raw Luau source in the panel and click **Protect**.
2. The server encrypts the source and returns a small **loader**.
3. The user pastes **only the loader** into the allowed executor.
4. The loader:
   - Checks `identifyexecutor()` matches the configured name
   - Requests the real script with secret headers (`X-Executor` + `X-Script-Key`)
   - Receives the source and runs it with `loadstring`
5. Any request without the correct headers (browser, curl, other executors) receives `403 Forbidden`.

## Environment variables

| Variable               | Description                                                   |
|------------------------|---------------------------------------------------------------|
| `PORT`                 | Server port (Render supplies this in production)              |
| `ALLOWED_EXECUTOR`     | Exact string returned by `identifyexecutor()`                 |
| `ADMIN_USERNAME`       | Single administrator username                                |
| `ADMIN_PASSWORD`       | Administrator password; at least 12 characters                |
| `AUTH_SESSION_SECRET`  | Random signing secret; at least 32 characters                 |

## Production notes

- Replace the in-memory `Map` with Redis or a database.
- Put the service behind Cloudflare / Nginx + HTTPS.
- In Render, set `ADMIN_USERNAME`, `ADMIN_PASSWORD`, and `AUTH_SESSION_SECRET` in the service's Environment settings; never commit the real values or a `.env` file.
- The admin session uses an `HttpOnly`, `SameSite=Strict` cookie, marked `Secure` in production, and expires after 8 hours. Rotating `AUTH_SESSION_SECRET` or restarting the service invalidates existing sessions; keep one Render instance because active sessions are held in memory.
- Change the `API_BASE` URL inside the generated loader to your real domain.
- Add HWID binding if the executor exposes `gethwid()` or similar.

## API

### `POST /api/login`
Accepts the configured administrator `username` and `password` and sets a signed session cookie. `POST /api/logout` clears it; `GET /api/session` reports whether the browser has a valid session.

The admin cookie is required for `/api/status`, `/api/register`, `/api/scripts`, and `DELETE /api/scripts/:id`.

### `POST /api/register`
```json
{
  "name": "optional name",
  "source": "print('hello')",
  "expiresInHours": 720
}
```

### `GET /api/load/:id`
Headers required:
- `X-Executor: <ALLOWED_EXECUTOR>`
- `X-Script-Key: <key>`

### `GET /api/status`
### `GET /api/scripts`
### `DELETE /api/scripts/:id`

## License

MIT
