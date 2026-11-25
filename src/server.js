require('dotenv').config();
const express = require('express');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;
const ALLOWED_EXECUTOR = process.env.ALLOWED_EXECUTOR || 'YourExecutorName';
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || '';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const AUTH_SESSION_SECRET = process.env.AUTH_SESSION_SECRET || '';
const SESSION_COOKIE = 'velum_admin_session';
const SESSION_TTL_SECONDS = 8 * 60 * 60;
const secureCookies = process.env.NODE_ENV === 'production';
const authConfigured = Boolean(
  ADMIN_USERNAME &&
  ADMIN_PASSWORD.length >= 12 &&
  Buffer.byteLength(AUTH_SESSION_SECRET, 'utf8') >= 32
);

// In-memory store (replace with Redis/DB in production)
const scripts = new Map();
const activeSessions = new Map();

// ---------- Middleware ----------
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(express.json({ limit: '2mb' }));
app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) res.set('Cache-Control', 'no-store');
  next();
});
app.use(express.static(path.join(__dirname, '../public')));

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests' }
});
app.use('/api/', limiter);

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Try again in 15 minutes.' }
});

// ---------- Authentication ----------
function constantTimeEqual(candidate, expected) {
  const candidateBuffer = Buffer.from(String(candidate ?? ''), 'utf8');
  const expectedBuffer = Buffer.from(String(expected ?? ''), 'utf8');
  return candidateBuffer.length === expectedBuffer.length &&
    crypto.timingSafeEqual(candidateBuffer, expectedBuffer);
}

function createSessionToken(username) {
  const now = Math.floor(Date.now() / 1000);
  for (const [sessionId, expiresAt] of activeSessions) {
    if (expiresAt <= now) activeSessions.delete(sessionId);
  }
  const claims = {
    sub: username,
    exp: now + SESSION_TTL_SECONDS,
    sid: crypto.randomBytes(32).toString('base64url')
  };
  activeSessions.set(claims.sid, claims.exp);
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  const signature = crypto.createHmac('sha256', AUTH_SESSION_SECRET)
    .update(payload)
    .digest('base64url');
  return `${payload}.${signature}`;
}

function readSessionCookie(req) {
  const cookies = (req.headers.cookie || '').split(';');
  for (const cookie of cookies) {
    const separator = cookie.indexOf('=');
    if (separator < 0) continue;
    if (cookie.slice(0, separator).trim() === SESSION_COOKIE) {
      return cookie.slice(separator + 1).trim();
    }
  }
  return '';
}

function getVerifiedSession(token) {
  if (!authConfigured || !token) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;

  const expectedSignature = crypto.createHmac('sha256', AUTH_SESSION_SECRET)
    .update(parts[0])
    .digest('base64url');
  if (!constantTimeEqual(parts[1], expectedSignature)) return null;

  try {
    const claims = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    if (claims.sub !== ADMIN_USERNAME || !Number.isSafeInteger(claims.exp)) return null;
    if (claims.exp <= Math.floor(Date.now() / 1000)) return null;
    if (typeof claims.sid !== 'string' || activeSessions.get(claims.sid) !== claims.exp) return null;
    return claims;
  } catch {
    return null;
  }
}

function verifySessionToken(token) {
  return getVerifiedSession(token)?.sub || null;
}

function setSessionCookie(res, token) {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: secureCookies,
    sameSite: 'strict',
    path: '/',
    maxAge: SESSION_TTL_SECONDS * 1000
  });
}

function clearSessionCookie(res) {
  res.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    secure: secureCookies,
    sameSite: 'strict',
    path: '/'
  });
}

function requireAdmin(req, res, next) {
  if (!authConfigured) {
    return res.status(503).json({
      error: 'Admin login is not configured. Set ADMIN_USERNAME, ADMIN_PASSWORD, and AUTH_SESSION_SECRET.'
    });
  }

  const username = verifySessionToken(readSessionCookie(req));
  if (!username) return res.status(401).json({ error: 'Authentication required' });
  req.adminUsername = username;
  next();
}

// ---------- Crypto helpers ----------
function encrypt(text, keyHex) {
  const key = Buffer.from(keyHex, 'hex');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64');
}

function decrypt(payloadB64, keyHex) {
  const key = Buffer.from(keyHex, 'hex');
  const data = Buffer.from(payloadB64, 'base64');
  const iv = data.subarray(0, 12);
  const tag = data.subarray(12, 28);
  const encrypted = data.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

// ---------- Generate loader ----------
function generateLoader(id, key) {
  return `-- [[ VELUM Protected Loader ]]
-- Do not share this file or the key
local SCRIPT_ID  = "${id}"
local SCRIPT_KEY = "${key}"
local API_BASE   = "http://localhost:${PORT}/api"  -- change to your domain in production

local HttpService = game:GetService("HttpService")

local function getExecutorName()
    local ok, name = pcall(function()
        return identifyexecutor and identifyexecutor() or "Unknown"
    end)
    return ok and name or "Unknown"
end

if getExecutorName() ~= "${ALLOWED_EXECUTOR}" then
    return warn("[VELUM] Unauthorized executor detected")
end

local url = API_BASE .. "/load/" .. SCRIPT_ID
local ok, response = pcall(function()
    return HttpService:GetAsync(url, true, {
        ["X-Executor"]   = "${ALLOWED_EXECUTOR}",
        ["X-Script-Key"] = SCRIPT_KEY
    })
end)

if not ok then
    return warn("[VELUM] Failed to contact protection server")
end

local success, payload = pcall(function()
    return HttpService:JSONDecode(response)
end)

if not success or not payload or not payload.data then
    return warn("[VELUM] Invalid or forbidden response from server")
end

local fn, err = loadstring(payload.data)
if not fn then
    return warn("[VELUM] Load error:", err)
end

fn()
`;
}

// ---------- Routes ----------

// Public session check lets the UI show either the login or the admin panel.
app.get('/api/session', (req, res) => {
  if (!authConfigured) {
    return res.json({ authConfigured: false, authenticated: false });
  }
  const username = verifySessionToken(readSessionCookie(req));
  res.json({ authConfigured: true, authenticated: Boolean(username) });
});

app.post('/api/login', loginLimiter, (req, res) => {
  if (!authConfigured) {
    return res.status(503).json({
      error: 'Admin login is not configured. Set ADMIN_USERNAME, ADMIN_PASSWORD, and AUTH_SESSION_SECRET.'
    });
  }

  const { username, password } = req.body || {};
  const validUsername = constantTimeEqual(username, ADMIN_USERNAME);
  const validPassword = constantTimeEqual(password, ADMIN_PASSWORD);
  if (!validUsername || !validPassword) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }

  setSessionCookie(res, createSessionToken(ADMIN_USERNAME));
  res.json({ authenticated: true });
});

app.post('/api/logout', (req, res) => {
  const session = getVerifiedSession(readSessionCookie(req));
  if (session) activeSessions.delete(session.sid);
  clearSessionCookie(res);
  res.json({ success: true });
});

// Admin-only health details
app.get('/api/status', requireAdmin, (req, res) => {
  res.json({
    status: 'ok',
    scripts: scripts.size,
    allowedExecutor: ALLOWED_EXECUTOR
  });
});

// Admin-only script registration
app.post('/api/register', requireAdmin, (req, res) => {
  const { name, source, expiresInHours = 720 } = req.body; // default 30 days

  if (!source || typeof source !== 'string' || source.trim().length < 5) {
    return res.status(400).json({ error: 'Valid source is required' });
  }

  const id = uuidv4().replace(/-/g, '').slice(0, 16);
  const key = crypto.randomBytes(32).toString('hex');
  const expires = Date.now() + Number(expiresInHours) * 3600 * 1000;

  scripts.set(id, {
    name: name || 'unnamed',
    encrypted: encrypt(source, key),
    key,
    expires,
    created: Date.now(),
    hits: 0
  });

  const loader = generateLoader(id, key);

  res.json({
    id,
    key,
    name: name || 'unnamed',
    expires: new Date(expires).toISOString(),
    loader
  });
});

// Load endpoint keeps its existing per-script key and executor checks.
app.get('/api/load/:id', (req, res) => {
  const script = scripts.get(req.params.id);

  if (!script) {
    return res.status(404).json({ error: 'Script not found' });
  }

  if (Date.now() > script.expires) {
    scripts.delete(req.params.id);
    return res.status(410).json({ error: 'Script expired' });
  }

  const executor = req.headers['x-executor'];
  const providedKey = req.headers['x-script-key'];

  if (executor !== ALLOWED_EXECUTOR || providedKey !== script.key) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  try {
    const source = decrypt(script.encrypted, script.key);
    script.hits += 1;
    res.json({ data: source });
  } catch (err) {
    console.error('Decrypt error:', err.message);
    res.status(500).json({ error: 'Internal error' });
  }
});

// Admin-only list of registered scripts
app.get('/api/scripts', requireAdmin, (req, res) => {
  const list = [];
  for (const [id, s] of scripts.entries()) {
    list.push({
      id,
      name: s.name,
      created: new Date(s.created).toISOString(),
      expires: new Date(s.expires).toISOString(),
      hits: s.hits,
      expired: Date.now() > s.expires
    });
  }
  res.json(list);
});

// Admin-only delete
app.delete('/api/scripts/:id', requireAdmin, (req, res) => {
  if (scripts.delete(req.params.id)) {
    res.json({ success: true });
  } else {
    res.status(404).json({ error: 'Not found' });
  }
});

// Catch-all for SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// ---------- Start ----------
app.listen(PORT, () => {
  console.log(`\n  VELUM Protector running on port ${PORT}`);
  console.log(`  Admin login configured: ${authConfigured ? 'yes' : 'no'}`);
});
