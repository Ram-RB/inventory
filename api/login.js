const { addAudit, initDb, publicUser, requireMethod, sendJson, sql, verifyPassword } = require("./_db");

module.exports = async function handler(req, res) {
  if (!requireMethod(req, res, "POST")) return;

  try {
    await initDb();
    const { email, password } = req.body || {};

    if (!email || !password) {
      sendJson(res, 400, { error: "Email and password are required." });
      return;
    }

    const result = await sql`SELECT * FROM users WHERE email = ${String(email).toLowerCase()} LIMIT 1`;
    const user = result.rows[0];

    if (!user || !verifyPassword(password, user.password_hash)) {
      sendJson(res, 401, { error: "Sign in failed. Check email and password." });
      return;
    }

    if (!user.approved) {
      sendJson(res, 403, { error: "Your account is waiting for admin approval." });
      return;
    }

    await addAudit("User signed in", `${user.name} signed in`, user);
    sendJson(res, 200, { user: publicUser(user) });
  } catch (error) {
    sendJson(res, 500, { error: error.message || "Login failed." });
  }
};
