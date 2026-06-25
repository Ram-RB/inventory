const { initDb, publicUser, requireMethod, sendJson, sql } = require("./_db");

module.exports = async function handler(req, res) {
  if (!requireMethod(req, res, "GET")) return;

  try {
    await initDb();

    const users = await sql`SELECT id, name, email, role, approved, created_at FROM users ORDER BY created_at DESC`;
    const items = await sql`
      SELECT
        inventory_items.id,
        sku,
        inventory_items.name,
        quantity,
        photo,
        location,
        updated_by_id,
        users.name AS updated_by_name,
        updated_at,
        inventory_items.created_at
      FROM inventory_items
      JOIN users ON users.id = inventory_items.updated_by_id
      ORDER BY updated_at DESC
    `;
    const audit = await sql`SELECT * FROM audit_entries ORDER BY timestamp DESC LIMIT 200`;

    sendJson(res, 200, {
      users: users.rows.map(publicUser),
      items: items.rows.map((item) => ({
        id: item.id,
        sku: item.sku,
        name: item.name,
        quantity: item.quantity,
        photo: item.photo,
        location: item.location,
        updatedById: item.updated_by_id,
        updatedByName: item.updated_by_name,
        updatedAt: item.updated_at,
        createdAt: item.created_at,
      })),
      audit: audit.rows.map((entry) => ({
        id: entry.id,
        action: entry.action,
        details: entry.details,
        userId: entry.user_id,
        userName: entry.user_name,
        timestamp: entry.timestamp,
      })),
    });
  } catch (error) {
    sendJson(res, 500, { error: error.message || "Could not load data." });
  }
};
