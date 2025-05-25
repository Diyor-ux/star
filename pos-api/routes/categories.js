const express = require("express")
const pool = require("../config/database")
const { authenticateEmployee } = require("../middleware/auth")

const router = express.Router()

// Get all categories (public)
router.get("/", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        c.*,
        COUNT(p.product_id) AS product_count
      FROM categories c
      LEFT JOIN products p ON c.category_id = p.category_id AND p.is_active = true
      WHERE c.is_active = true
      GROUP BY c.category_id
      ORDER BY c.display_order, c.name
    `)

    res.json({ categories: result.rows })
  } catch (error) {
    console.error("Get categories error:", error)
    res.status(500).json({ error: "Failed to fetch categories" })
  }
})

// Create new category (POS only)
router.post("/", authenticateEmployee, async (req, res) => {
  try {
    const { name, description, image_url, display_order } = req.body

    if (!name) {
      return res.status(400).json({ error: "Category name is required" })
    }

    const result = await pool.query(
      `
      INSERT INTO categories (name, description, image_url, display_order)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `,
      [name, description, image_url, display_order || 0],
    )

    res.status(201).json({ category: result.rows[0] })
  } catch (error) {
    console.error("Create category error:", error)
    res.status(500).json({ error: "Failed to create category" })
  }
})

// Update category (POS only)
router.put("/:id", authenticateEmployee, async (req, res) => {
  try {
    const { id } = req.params
    const { name, description, image_url, display_order, is_active } = req.body

    const result = await pool.query(
      `
      UPDATE categories SET
        name = COALESCE($1, name),
        description = COALESCE($2, description),
        image_url = COALESCE($3, image_url),
        display_order = COALESCE($4, display_order),
        is_active = COALESCE($5, is_active),
        updated_at = CURRENT_TIMESTAMP
      WHERE category_id = $6
      RETURNING *
    `,
      [name, description, image_url, display_order, is_active, id],
    )

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Category not found" })
    }

    res.json({ category: result.rows[0] })
  } catch (error) {
    console.error("Update category error:", error)
    res.status(500).json({ error: "Failed to update category" })
  }
})

module.exports = router
