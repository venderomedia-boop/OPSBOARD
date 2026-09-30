import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const { Pool } = pg;
const dataDir = process.env.OPSBOARD_DATA_DIR || (fs.existsSync('/data') ? '/data' : '/tmp');
const workflowFile = path.join(dataDir, 'workflow-store.json');
const databaseUrl = String(process.env.DATABASE_URL || '').trim();
const databaseSsl = String(process.env.DATABASE_SSL || '').toLowerCase() === 'true';

let pool = null;
let pending = Promise.resolve();
let lastError = null;
let lastPersistedAt = null;
let hydrated = false;

function ensureDir() {
  fs.mkdirSync(dataDir, { recursive: true });
}

function getPool() {
  if (!databaseUrl) return null;
  if (!pool) {
    pool = new Pool({
      connectionString: databaseUrl,
      max: Math.max(2, Math.min(10, Number(process.env.DATABASE_POOL_SIZE || 4))),
      ...(databaseSsl ? { ssl: { rejectUnauthorized: false } } : {}),
    });
  }
  return pool;
}

async function ensureSchema() {
  const client = getPool();
  if (!client) return;
  await client.query(`
    CREATE TABLE IF NOT EXISTS vendero_state (
      namespace TEXT PRIMARY KEY,
      payload JSONB NOT NULL,
      version BIGINT NOT NULL DEFAULT 1,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function persistSnapshot(snapshot) {
  const client = getPool();
  if (!client) return;
  await ensureSchema();
  await client.query(
    `INSERT INTO vendero_state(namespace, payload, version, updated_at)
     VALUES ('workflow', $1::jsonb, 1, NOW())
     ON CONFLICT(namespace)
     DO UPDATE SET payload = EXCLUDED.payload,
                   version = vendero_state.version + 1,
                   updated_at = NOW()`,
    [JSON.stringify(snapshot)],
  );
  lastPersistedAt = new Date().toISOString();
  lastError = null;
}

export async function hydrateWorkflowState() {
  if (!databaseUrl) {
    hydrated = true;
    return { configured: false, hydrated: false, source: 'file' };
  }

  ensureDir();
  await ensureSchema();

  const client = getPool();
  const result = await client.query(
    `SELECT payload, version, updated_at FROM vendero_state WHERE namespace = 'workflow' LIMIT 1`,
  );

  if (result.rows.length) {
    const payload = result.rows[0].payload;
    const temp = `${workflowFile}.hydrate.tmp`;
    fs.writeFileSync(temp, JSON.stringify(payload, null, 2));
    fs.renameSync(temp, workflowFile);
    hydrated = true;
    lastPersistedAt = result.rows[0].updated_at?.toISOString?.() || String(result.rows[0].updated_at || '');
    return {
      configured: true,
      hydrated: true,
      source: 'postgres',
      version: Number(result.rows[0].version || 1),
      updatedAt: lastPersistedAt,
    };
  }

  if (fs.existsSync(workflowFile)) {
    const raw = fs.readFileSync(workflowFile, 'utf8');
    const payload = JSON.parse(raw);
    await persistSnapshot(payload);
    hydrated = true;
    return { configured: true, hydrated: true, source: 'file-seeded-to-postgres' };
  }

  hydrated = true;
  return { configured: true, hydrated: false, source: 'empty' };
}

export function queueWorkflowSnapshot(snapshot) {
  if (!databaseUrl) return;
  const cloned = JSON.parse(JSON.stringify(snapshot));
  pending = pending.then(
    () => persistSnapshot(cloned),
    () => persistSnapshot(cloned),
  ).catch((error) => {
    lastError = error;
    throw error;
  });
}

export async function flushWorkflowPersistence() {
  if (!databaseUrl) return;
  try {
    await pending;
  } catch (error) {
    lastError = error;
    throw error;
  }
}

export async function checkDatabaseConnection() {
  const client = getPool();
  if (!client) return { configured: false, ok: true };
  try {
    const result = await client.query('SELECT NOW() AS now');
    return {
      configured: true,
      ok: true,
      now: result.rows[0]?.now?.toISOString?.() || String(result.rows[0]?.now || ''),
    };
  } catch (error) {
    lastError = error;
    return { configured: true, ok: false, error: error?.message || String(error) };
  }
}

export function getDatabasePersistenceInfo() {
  return {
    configured: Boolean(databaseUrl),
    hydrated,
    authoritative: Boolean(databaseUrl),
    lastPersistedAt,
    error: lastError ? (lastError.message || String(lastError)) : null,
  };
}

export async function closeDatabasePool() {
  if (pool) await pool.end();
  pool = null;
}
