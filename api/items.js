const { addAudit, initDb, publicAudit, requireMethod, sendJson, sql } = require("./_db");
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

    const inserted = await sql`
      INSERT INTO inventory_items (id, sku, name, quantity, photo, location, updated_by_id)
      VALUES (${crypto.randomUUID()}, ${sku}, ${name}, ${Number(quantity)}, ${photo}, ${location}, ${updatedById})
      RETURNING *
    `;

    const audit = await addAudit("Inventory item added", `${name} (${sku}), quantity ${quantity}, location ${location}`, user);
    const item = inserted.rows[0];
    sendJson(res, 201, {
      ok: true,
      item: {
        id: item.id,
        sku: item.sku,
        name: item.name,
        quantity: item.quantity,
        photo: item.photo,
        location: item.location,
        updatedById: item.updated_by_id,
        updatedByName: user.name,
        updatedAt: item.updated_at,
        createdAt: item.created_at,
      },
      audit: publicAudit(audit),
    });
  } catch (error) {
    sendJson(res, 500, { error: error.message || "Could not save inventory item." });
  }
};
