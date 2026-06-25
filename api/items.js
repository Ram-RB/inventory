const { addAudit, initDb, requireMethod, sendJson, sql } = require("./_db");
const crypto = require("crypto");

module.exports = async function handler(req, res) {
  if (!requireMethod(req, res, "POST")) return;

  try {
    await initDb();
    const { sku, name, quantity, photo, location, updatedById } = req.body || {};

    if (!sku || !name || quantity === undefined || !photo || !location || !updatedById) {
      sendJson(res, 400, { error: "All inventory fields are required." });
      return;
    }

    const userResult = await sql`SELECT * FROM users WHERE id = ${updatedById} AND approved = TRUE LIMIT 1`;
    const user = userResult.rows[0];
    if (!user) {
      sendJson(res, 403, { error: "Approved user is required." });
      return;
    }

    await sql`
      INSERT INTO inventory_items (id, sku, name, quantity, photo, location, updated_by_id)
      VALUES (${crypto.randomUUID()}, ${sku}, ${name}, ${Number(quantity)}, ${photo}, ${location}, ${updatedById})
    `;

    await addAudit("Inventory item added", `${name} (${sku}), quantity ${quantity}, location ${location}`, user);
    sendJson(res, 201, { ok: true });
  } catch (error) {
    sendJson(res, 500, { error: error.message || "Could not save inventory item." });
  }
};
