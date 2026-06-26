const crypto = require("crypto");
const postgres = require("postgres");

const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
let client;

function getClient() {
  if (!process.env.POSTGRES_URL) {
    throw new Error("POSTGRES_URL env var was not found.");
  }

  if (!client) {
    client = postgres(process.env.POSTGRES_URL, {
      max: 1,
      ssl: "require",
    });
  }

  return client;
}

async function sql(strings, ...values) {
  const rows = await getClient()(strings, ...values);
  return { rows };
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, "sha512").toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, storedPassword) {
  if (!storedPassword || !storedPassword.includes(":")) return false;
  const [salt, expectedHash] = storedPassword.split(":");
  const actualHash = hashPassword(password, salt).split(":")[1];
  return crypto.timingSafeEqual(Buffer.from(actualHash, "hex"), Buffer.from(expectedHash, "hex"));
}

async function initDb() {
  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      approved BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS inventory_items (
      id TEXT PRIMARY KEY,
      sku TEXT NOT NULL,
      name TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      photo TEXT NOT NULL,
      location TEXT NOT NULL,
      updated_by_id TEXT NOT NULL REFERENCES users(id),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS audit_entries (
      id TEXT PRIMARY KEY,
      action TEXT NOT NULL,
      details TEXT NOT NULL,
      user_id TEXT NOT NULL,
      user_name TEXT NOT NULL,
      timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) return;

  const admin = await sql`SELECT id FROM users WHERE email = ${ADMIN_EMAIL} LIMIT 1`;
  if (!admin.rows.length) {
    await sql`
      INSERT INTO users (id, name, email, password_hash, role, approved)
      VALUES (${crypto.randomUUID()}, 'Admin User', ${ADMIN_EMAIL}, ${hashPassword(ADMIN_PASSWORD)}, 'admin', TRUE)
    `;
  }
}

async function addAudit(action, details, user) {
  const audit = await sql`
    INSERT INTO audit_entries (id, action, details, user_id, user_name)
    VALUES (${crypto.randomUUID()}, ${action}, ${details}, ${user.id}, ${user.name})
    RETURNING *
  `;
  return audit.rows[0];
}

function publicAudit(entry) {
  return {
    id: entry.id,
    action: entry.action,
    details: entry.details,
    userId: entry.user_id,
    userName: entry.user_name,
    timestamp: entry.timestamp,
  };
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    approved: user.approved,
    createdAt: user.created_at,
  };
}

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
}

function requireMethod(req, res, method) {
  if (req.method === method) return true;
  sendJson(res, 405, { error: `Use ${method} for this endpoint.` });
  return false;
}

module.exports = {
  addAudit,
  initDb,
  publicUser,
  publicAudit,
  requireMethod,
  sendJson,
  sql,
  verifyPassword,
  hashPassword,
};
