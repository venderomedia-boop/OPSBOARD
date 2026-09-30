import crypto from 'node:crypto';
import { databaseQuery } from './postgres-state.mjs';

const TOKEN_TTL_SECONDS = Math.max(3600, Number(process.env.AUTH_TOKEN_TTL_SECONDS || 604800));
const AUTH_REQUIRED = String(process.env.AUTH_REQUIRED || '').toLowerCase() === 'true';
const TOKEN_SECRET = String(
  process.env.AUTH_TOKEN_SECRET ||
  (process.env.NODE_ENV === 'production' ? '' : 'dev-only-change-me')
);

const ROLE_SET = new Set(['admin', 'dispatcher', 'accounts', 'engineer', 'manager']);

function required(value, label) {
  const text = String(value || '').trim();
  if (!text) throw Object.assign(new Error(`${label} is required`), { statusCode: 422 });
  return text;
}

function normalizeEmail(value) {
  const email = required(value, 'email').toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw Object.assign(new Error('email must be valid'), { statusCode: 422 });
  }
  return email;
}

function initials(name) {
  return String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('') || 'US';
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const value = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return { salt, hash: value };
}

function verifyPassword(password, salt, expectedHex) {
  const actual = crypto.scryptSync(String(password), String(salt), 64);
  const expected = Buffer.from(String(expectedHex), 'hex');
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

function base64url(value) {
  return Buffer.from(value).toString('base64url');
}

function signToken(payload) {
  if (!TOKEN_SECRET) {
    throw Object.assign(
      new Error('AUTH_TOKEN_SECRET must be configured in production'),
      { statusCode: 503 }
    );
  }
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = base64url(JSON.stringify(payload));
  const signature = crypto
    .createHmac('sha256', TOKEN_SECRET)
    .update(`${header}.${body}`)
    .digest('base64url');
  return `${header}.${body}.${signature}`;
}

function verifyToken(token) {
  if (!TOKEN_SECRET) throw Object.assign(new Error('Authentication is not configured'), { statusCode: 503 });
  const parts = String(token || '').split('.');
  if (parts.length !== 3) throw Object.assign(new Error('Invalid access token'), { statusCode: 401 });
  const [header, body, signature] = parts;
  const expected = crypto.createHmac('sha256', TOKEN_SECRET).update(`${header}.${body}`).digest();
  const actual = Buffer.from(signature, 'base64url');
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) {
    throw Object.assign(new Error('Invalid access token'), { statusCode: 401 });
  }
  let payload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    throw Object.assign(new Error('Invalid access token'), { statusCode: 401 });
  }
  if (!payload?.sub || !payload?.exp || Number(payload.exp) <= Math.floor(Date.now() / 1000)) {
    throw Object.assign(new Error('Access token expired'), { statusCode: 401 });
  }
  return payload;
}

function publicUser(row) {
  const role = row.role === 'engineer'
    ? 'technician'
    : row.role === 'admin' || row.role === 'manager'
      ? 'owner'
      : row.role === 'accounts'
        ? 'office_admin'
        : 'dispatcher';
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role,
    accessRole: row.role,
    companyName: String(process.env.COMPANY_NAME || 'Field Service'),
    avatarInitials: row.avatar_initials || initials(row.name),
    active: row.active !== false,
  };
}

export function isAuthRequired() {
  return AUTH_REQUIRED;
}

export async function ensureAuthSchema() {
  await databaseQuery(`
    CREATE TABLE IF NOT EXISTS app_users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      avatar_initials TEXT,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await databaseQuery(`
    CREATE INDEX IF NOT EXISTS app_users_active_role_idx
    ON app_users(active, role)
  `);

  const countResult = await databaseQuery('SELECT COUNT(*)::int AS count FROM app_users');
  const count = Number(countResult.rows[0]?.count || 0);
  const email = String(process.env.BOOTSTRAP_ADMIN_EMAIL || '').trim();
  const password = String(process.env.BOOTSTRAP_ADMIN_PASSWORD || '');
  const name = String(process.env.BOOTSTRAP_ADMIN_NAME || 'System Administrator').trim();

  if (count === 0 && email && password) {
    await createUser({
      id: 'admin-1',
      email,
      password,
      name,
      role: 'admin',
    }, { bootstrap: true });
  }

  return { users: count || (email && password ? 1 : 0), bootstrapConfigured: Boolean(email && password) };
}

export async function createUser(input = {}, { bootstrap = false } = {}) {
  const email = normalizeEmail(input.email);
  const name = required(input.name, 'name');
  const password = required(input.password, 'password');
  if (password.length < 10) {
    throw Object.assign(new Error('password must be at least 10 characters'), { statusCode: 422 });
  }
  const role = ROLE_SET.has(input.role) ? input.role : 'engineer';
  const id = String(input.id || crypto.randomUUID());
  const { salt, hash } = hashPassword(password);

  try {
    const result = await databaseQuery(
      `INSERT INTO app_users(id,email,name,role,password_hash,password_salt,avatar_initials,active)
       VALUES($1,$2,$3,$4,$5,$6,$7,TRUE)
       RETURNING id,email,name,role,avatar_initials,active,created_at,updated_at`,
      [id, email, name, role, hash, salt, String(input.avatarInitials || initials(name))],
    );
    return publicUser(result.rows[0]);
  } catch (error) {
    if (String(error?.code) === '23505') {
      throw Object.assign(new Error('A user with this email or ID already exists'), { statusCode: 409 });
    }
    if (bootstrap) throw error;
    throw error;
  }
}

export async function listUsers() {
  const result = await databaseQuery(
    'SELECT id,email,name,role,avatar_initials,active,created_at,updated_at FROM app_users ORDER BY name'
  );
  return result.rows.map(publicUser);
}

export async function updateUser(userId, patch = {}) {
  const current = await databaseQuery('SELECT * FROM app_users WHERE id=$1 LIMIT 1', [userId]);
  if (!current.rows.length) throw Object.assign(new Error('User not found'), { statusCode: 404 });
  const row = current.rows[0];

  const name = 'name' in patch ? required(patch.name, 'name') : row.name;
  const email = 'email' in patch ? normalizeEmail(patch.email) : row.email;
  const role = 'role' in patch && ROLE_SET.has(patch.role) ? patch.role : row.role;
  const active = 'active' in patch ? Boolean(patch.active) : row.active;
  let passwordHash = row.password_hash;
  let passwordSalt = row.password_salt;

  if (patch.password) {
    if (String(patch.password).length < 10) {
      throw Object.assign(new Error('password must be at least 10 characters'), { statusCode: 422 });
    }
    const next = hashPassword(patch.password);
    passwordHash = next.hash;
    passwordSalt = next.salt;
  }

  const result = await databaseQuery(
    `UPDATE app_users
     SET email=$2,name=$3,role=$4,password_hash=$5,password_salt=$6,
         avatar_initials=$7,active=$8,updated_at=NOW()
     WHERE id=$1
     RETURNING id,email,name,role,avatar_initials,active,created_at,updated_at`,
    [
      userId,
      email,
      name,
      role,
      passwordHash,
      passwordSalt,
      String(patch.avatarInitials || row.avatar_initials || initials(name)),
      active,
    ],
  );
  return publicUser(result.rows[0]);
}

export async function login(emailValue, password) {
  const email = normalizeEmail(emailValue);
  const result = await databaseQuery('SELECT * FROM app_users WHERE email=$1 LIMIT 1', [email]);
  const row = result.rows[0];
  if (!row || row.active === false || !verifyPassword(password, row.password_salt, row.password_hash)) {
    throw Object.assign(new Error('Invalid email or password'), { statusCode: 401 });
  }

  const issuedAt = Math.floor(Date.now() / 1000);
  const payload = {
    sub: row.id,
    email: row.email,
    role: row.role,
    iat: issuedAt,
    exp: issuedAt + TOKEN_TTL_SECONDS,
  };
  const accessToken = signToken(payload);

  return {
    accessToken,
    refreshToken: accessToken,
    expiresAt: new Date(payload.exp * 1000).toISOString(),
    user: publicUser(row),
  };
}

export async function authenticateRequest(req) {
  const header = String(req.headers.authorization || '');
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) throw Object.assign(new Error('Authentication required'), { statusCode: 401 });
  const token = verifyToken(match[1]);
  const result = await databaseQuery(
    'SELECT id,email,name,role,avatar_initials,active FROM app_users WHERE id=$1 LIMIT 1',
    [token.sub],
  );
  const row = result.rows[0];
  if (!row || row.active === false) throw Object.assign(new Error('User account is unavailable'), { statusCode: 401 });
  return {
    userId: row.id,
    role: row.role,
    email: row.email,
    user: publicUser(row),
  };
}

export function requireRole(auth, allowed = []) {
  if (!auth || !allowed.includes(auth.role)) {
    throw Object.assign(new Error('You do not have permission to perform this action'), { statusCode: 403 });
  }
}


export function authorizeApiRequest(auth, method, pathname) {
  if (!auth) throw Object.assign(new Error('Authentication required'), { statusCode: 401 });
  if (['admin', 'dispatcher', 'manager'].includes(auth.role)) return;

  const verb = String(method || 'GET').toUpperCase();
  const path = String(pathname || '');

  if (auth.role === 'accounts') {
    const allowed =
      verb === 'GET' ||
      /^\/api\/v1\/invoice-stubs\//.test(path) ||
      /^\/api\/v1\/workflow\/timesheets\//.test(path);
    if (allowed) return;
    throw Object.assign(new Error('Accounts access does not permit this operation'), { statusCode: 403 });
  }

  if (auth.role === 'engineer') {
    const allowed = [
      ['GET', /^\/api\/v1\/me$/],
      ['GET', /^\/api\/v1\/workflow\/me\/assignments$/],
      ['GET', /^\/api\/v1\/workflow\/jobs\/[^/]+$/],
      ['GET', /^\/api\/v1\/workflow\/jobs\/[^/]+\/events$/],
      ['GET', /^\/api\/v1\/workflow\/jobs\/[^/]+\/media$/],
      ['POST', /^\/api\/v1\/workflow\/job-events$/],
      ['POST', /^\/api\/v1\/workflow\/jobs$/],
      ['POST', /^\/api\/v1\/workflow\/jobs\/[^/]+\/media$/],
      ['DELETE', /^\/api\/v1\/workflow\/jobs\/[^/]+\/media\/[^/]+$/],
      ['POST', /^\/api\/v1\/(?:workflow\/)?jobs\/[^/]+\/invoice-stubs$/],
      ['GET', /^\/api\/v1\/invoice-stubs\/[^/]+$/],
      ['GET', /^\/api\/v1\/jobs\/[^/]+\/compliance-forms(?:\/[^/]+)?$/],
      ['POST', /^\/api\/v1\/jobs\/[^/]+\/compliance-forms\/[^/]+\/attach$/],
      ['POST', /^\/api\/v1\/form-instances\/[^/]+$/],
      ['GET', /^\/api\/v1\/form-types$/],
      ['GET', /^\/api\/v1\/sites$/],
      ['GET', /^\/api\/v1\/sites\/[^/]+$/],
      ['GET', /^\/api\/v1\/site-locations$/],
      ['GET', /^\/api\/v1\/sites\/[^/]+\/form-types\/[^/]+\/history$/],
      ['GET', /^\/api\/v1\/workflow\/timesheets(?:\/[^/]+)?$/],
      ['POST', /^\/api\/v1\/workflow\/timesheets$/],
      ['POST', /^\/api\/v1\/workflow\/timesheets\/day(?:\/clock)?$/],
      ['POST', /^\/api\/v1\/workflow\/job-report\/pdf$/],
    ];
    if (allowed.some(([allowedVerb, pattern]) => verb === allowedVerb && pattern.test(path))) return;
    throw Object.assign(new Error('Engineer access does not permit this operation'), { statusCode: 403 });
  }

  throw Object.assign(new Error('This account role is not permitted to access the API'), { statusCode: 403 });
}
