const { addAudit, initDb, requireMethod, sendJson, sql } = require("./_db");

module.exports = async function handler(req, res) {
  if (!requireMethod(req, res, "POST")) return;

  try {
    await initDb();
    const { userId, adminId } = req.body || {};

    const adminResult = await sql`SELECT * FROM users WHERE id = ${adminId} AND role = 'admin' AND approved = TRUE LIMIT 1`;
    const admin = adminResult.rows[0];
    if (!admin) {
      sendJson(res, 403, { error: "Admin permission is required." });
      return;
    }

    const userResult = await sql`SELECT * FROM users WHERE id = ${userId} LIMIT 1`;
    const user = userResult.rows[0];
    if (!user) {
      sendJson(res, 404, { error: "User was not found." });
      return;
    }

    await sql`UPDATE users SET approved = TRUE WHERE id = ${userId}`;
    await addAudit("User approved", `${user.name} (${user.email})`, admin);
    sendJson(res, 200, { ok: true });
  } catch (error) {
    sendJson(res, 500, { error: error.message || "Could not approve user." });
  }
};
