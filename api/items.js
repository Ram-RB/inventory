const { addAudit, initDb, publicAudit, requireMethod, sendJson, sql } = require("./_db");
const crypto = require("crypto");

module.exports = async function handler(req, res) {
  try {
    await initDb();

    if (req.method === "PUT") {
      await updateItem(req, res);
      return;
    }

    if (req.method === "DELETE") {
      await deleteItem(req, res);
      return;
    }

    if (!requireMethod(req, res, "POST")) return;
    const { sku, name, quantity, photo, location, notes = "", updatedById } = req.body || {};

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
      INSERT INTO inventory_items (id, sku, name, quantity, photo, location, notes, updated_by_id)
      VALUES (${crypto.randomUUID()}, ${sku}, ${name}, ${Number(quantity)}, ${photo}, ${location}, ${String(notes)}, ${updatedById})
      RETURNING *
    `;

    const audit = await addAudit(
      "Inventory item added",
      `${name} (${sku}), quantity ${quantity}, location ${location}${notes ? ", notes added" : ""}`,
      user,
    );
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
        notes: item.notes || "",
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

async function requireAdmin(adminId) {
  const adminResult = await sql`SELECT * FROM users WHERE id = ${adminId} AND role = 'admin' AND approved = TRUE LIMIT 1`;
  return adminResult.rows[0];
}

function publicItem(item, updatedByName) {
  return {
    id: item.id,
    sku: item.sku,
    name: item.name,
    quantity: item.quantity,
    photo: item.photo,
    location: item.location,
    notes: item.notes || "",
    updatedById: item.updated_by_id,
    updatedByName,
    updatedAt: item.updated_at,
    createdAt: item.created_at,
  };
}

async function updateItem(req, res) {
  const { itemId, adminId, sku, name, quantity, location, notes = "" } = req.body || {};

  if (!itemId || !adminId || !sku || !name || quantity === undefined || !location) {
    sendJson(res, 400, { error: "Item, admin, SKU, name, quantity, and location are required." });
    return;
  }

  const admin = await requireAdmin(adminId);
  if (!admin) {
    sendJson(res, 403, { error: "Admin permission is required." });
    return;
  }

  const existing = await sql`SELECT * FROM inventory_items WHERE id = ${itemId} LIMIT 1`;
  const oldItem = existing.rows[0];
  if (!oldItem) {
    sendJson(res, 404, { error: "Inventory item was not found." });
    return;
  }

  const updated = await sql`
    UPDATE inventory_items
    SET sku = ${sku},
        name = ${name},
        quantity = ${Number(quantity)},
        location = ${location},
        notes = ${String(notes)},
        updated_by_id = ${adminId},
        updated_at = NOW()
    WHERE id = ${itemId}
    RETURNING *
  `;

  const audit = await addAudit(
    "Inventory item updated",
    `${name} (${sku}), quantity ${quantity}, location ${location}${notes ? ", notes updated" : ""}`,
    admin,
  );
  sendJson(res, 200, {
    ok: true,
    item: publicItem(updated.rows[0], admin.name),
    audit: publicAudit(audit),
  });
}

async function deleteItem(req, res) {
  const { itemId, adminId } = req.body || {};

  if (!itemId || !adminId) {
    sendJson(res, 400, { error: "Item and admin are required." });
    return;
  }

  const admin = await requireAdmin(adminId);
  if (!admin) {
    sendJson(res, 403, { error: "Admin permission is required." });
    return;
  }

  const deleted = await sql`DELETE FROM inventory_items WHERE id = ${itemId} RETURNING *`;
  const item = deleted.rows[0];
  if (!item) {
    sendJson(res, 404, { error: "Inventory item was not found." });
    return;
  }

  const audit = await addAudit("Inventory item removed", `${item.name} (${item.sku})`, admin);
  sendJson(res, 200, { ok: true, itemId, audit: publicAudit(audit) });
}
