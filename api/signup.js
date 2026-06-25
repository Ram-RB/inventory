const { hashPassword, initDb, requireMethod, sendJson, sql } = require("./_db");
const crypto = require("crypto");

module.exports = async function handler(req, res) {
  if (!requireMethod(req, res, "POST")) return;

  try {
    await initDb();
    const { name, email, password } = req.body || {};

    if (!name || !email || !password) {
      sendJson(res, 400, { error: "Name, email, and password are required." });
      return;
    }

    const normalizedEmail = String(email).toLowerCase();
    const existing = await sql`SELECT id FROM users WHERE email = ${normalizedEmail} LIMIT 1`;
    if (existing.rows.length) {
      sendJson(res, 409, { error: "An account with this email already exists." });
      return;
    }

    await sql`
      INSERT INTO users (id, name, email, password_hash, role, approved)
      VALUES (${crypto.randomUUID()}, ${name}, ${normalizedEmail}, ${hashPassword(password)}, 'user', FALSE)
    `;

    sendJson(res, 201, { ok: true });
  } catch (error) {
    sendJson(res, 500, { error: error.message || "Access request failed." });
  }
};
