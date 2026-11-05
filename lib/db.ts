import fs from 'node:fs/promises'
import path from 'node:path'
import { Pool } from 'pg'
import {
  SESSION_WINDOW,
  emptyLog,
  isVariant,
  parseLog,
  serializeLog,
  type ExperimentLog,
  type Variant,
} from '@/lib/experiment'

type VisitorRecord = {
  variant: Variant
  lastImpressionAt: number
  converted: boolean
}

type FileStore = {
  logRaw: string
  visitors: Record<string, VisitorRecord>
}

const DATA_DIR = path.join(process.cwd(), '.data')
const STORE_PATH = path.join(DATA_DIR, 'experiment-store.json')

let pool: Pool | null = null
let pgInitialized = false

function getPool(): Pool | null {
  const url = process.env.DATABASE_URL?.trim()
  if (!url) return null
  if (!pool) {
    pool = new Pool({ connectionString: url })
  }
  return pool
}

async function ensurePgTables(db: Pool): Promise<void> {
  if (pgInitialized) return
  await db.query(`
    CREATE TABLE IF NOT EXISTS experiment_state (
      id TEXT PRIMARY KEY,
      log_json TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS experiment_visitors (
      visitor_id TEXT PRIMARY KEY,
      variant TEXT NOT NULL,
      last_impression_at BIGINT NOT NULL DEFAULT 0,
      converted BOOLEAN NOT NULL DEFAULT FALSE
    );
  `)
  pgInitialized = true
}

async function readFileStore(): Promise<FileStore> {
  try {
    const raw = await fs.readFile(STORE_PATH, 'utf-8')
    const parsed = JSON.parse(raw) as Partial<FileStore>
    const validatedLog = parseLog(
      typeof parsed.logRaw === 'string' ? parsed.logRaw : undefined
    )
    return {
      logRaw: serializeLog(validatedLog),
      visitors:
        parsed.visitors && typeof parsed.visitors === 'object'
          ? parsed.visitors
          : {},
    }
  } catch {
    return {
      logRaw: serializeLog(emptyLog()),
      visitors: {},
    }
  }
}

async function writeFileStore(store: FileStore): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true })
  await fs.writeFile(STORE_PATH, JSON.stringify(store, null, 2), 'utf-8')
}

export async function getExperimentLog(): Promise<ExperimentLog> {
  const db = getPool()
  if (db) {
    try {
      await ensurePgTables(db)
      const res = await db.query<{ log_json: string }>(
        'SELECT log_json FROM experiment_state WHERE id = $1',
        ['main']
      )
      return parseLog(res.rows[0]?.log_json)
    } catch {
      // Fallback al almacén local si falla la conexión
    }
  }

  const store = await readFileStore()
  return parseLog(store.logRaw)
}

export async function registerImpressionInDb(
  visitorId: string,
  variant: Variant
): Promise<boolean> {
  if (!visitorId || !isVariant(variant)) return false
  const now = Date.now()
  const windowMs = SESSION_WINDOW * 1000

  const db = getPool()
  if (db) {
    try {
      await ensurePgTables(db)
      const client = await db.connect()
      try {
        await client.query('BEGIN')
        const visitorRes = await client.query<{
          last_impression_at: string | number
        }>(
          'SELECT last_impression_at FROM experiment_visitors WHERE visitor_id = $1 FOR UPDATE',
          [visitorId]
        )

        const lastImpression = visitorRes.rows[0]
          ? Number(visitorRes.rows[0].last_impression_at)
          : 0

        if (lastImpression > 0 && now - lastImpression < windowMs) {
          await client.query('COMMIT')
          return false
        }

        await client.query(
          `INSERT INTO experiment_visitors (visitor_id, variant, last_impression_at, converted)
           VALUES ($1, $2, $3, FALSE)
           ON CONFLICT (visitor_id)
           DO UPDATE SET variant = EXCLUDED.variant, last_impression_at = EXCLUDED.last_impression_at`,
          [visitorId, variant, now]
        )

        const stateRes = await client.query<{ log_json: string }>(
          'SELECT log_json FROM experiment_state WHERE id = $1 FOR UPDATE',
          ['main']
        )
        const currentLog = parseLog(stateRes.rows[0]?.log_json)
        currentLog[variant].impressions += 1

        await client.query(
          `INSERT INTO experiment_state (id, log_json)
           VALUES ('main', $1)
           ON CONFLICT (id) DO UPDATE SET log_json = EXCLUDED.log_json`,
          [serializeLog(currentLog)]
        )

        await client.query('COMMIT')
        return true
      } catch (err) {
        await client.query('ROLLBACK')
        throw err
      } finally {
        client.release()
      }
    } catch {
      // Continúa hacia el almacén en archivo local si Postgres no está disponible
    }
  }

  const store = await readFileStore()
  const existing = store.visitors[visitorId]
  if (existing && now - existing.lastImpressionAt < windowMs) {
    return false
  }

  const log = parseLog(store.logRaw)
  log[variant].impressions += 1
  store.logRaw = serializeLog(log)
  store.visitors[visitorId] = {
    variant,
    lastImpressionAt: now,
    converted: existing?.converted ?? false,
  }
  await writeFileStore(store)
  return true
}

export async function registerConversionInDb(
  visitorId: string,
  variant: Variant
): Promise<'converted' | 'already_converted'> {
  const db = getPool()
  if (db) {
    try {
      await ensurePgTables(db)
      const client = await db.connect()
      try {
        await client.query('BEGIN')
        const visitorRes = await client.query<{ converted: boolean }>(
          'SELECT converted FROM experiment_visitors WHERE visitor_id = $1 FOR UPDATE',
          [visitorId]
        )

        if (visitorRes.rows[0]?.converted) {
          await client.query('COMMIT')
          return 'already_converted'
        }

        await client.query(
          `INSERT INTO experiment_visitors (visitor_id, variant, last_impression_at, converted)
           VALUES ($1, $2, $3, TRUE)
           ON CONFLICT (visitor_id)
           DO UPDATE SET converted = TRUE`,
          [visitorId, variant, Date.now()]
        )

        const stateRes = await client.query<{ log_json: string }>(
          'SELECT log_json FROM experiment_state WHERE id = $1 FOR UPDATE',
          ['main']
        )
        const currentLog = parseLog(stateRes.rows[0]?.log_json)
        currentLog[variant].conversions += 1

        await client.query(
          `INSERT INTO experiment_state (id, log_json)
           VALUES ('main', $1)
           ON CONFLICT (id) DO UPDATE SET log_json = EXCLUDED.log_json`,
          [serializeLog(currentLog)]
        )

        await client.query('COMMIT')
        return 'converted'
      } catch (err) {
        await client.query('ROLLBACK')
        throw err
      } finally {
        client.release()
      }
    } catch {
      // Continúa hacia el almacén en archivo local si Postgres no está disponible
    }
  }

  const store = await readFileStore()
  const existing = store.visitors[visitorId]
  if (existing?.converted) {
    return 'already_converted'
  }

  const log = parseLog(store.logRaw)
  log[variant].conversions += 1
  store.logRaw = serializeLog(log)
  store.visitors[visitorId] = {
    variant,
    lastImpressionAt: existing?.lastImpressionAt ?? Date.now(),
    converted: true,
  }
  await writeFileStore(store)
  return 'converted'
}