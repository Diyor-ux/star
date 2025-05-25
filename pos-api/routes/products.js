const express = require("express")
const pool = require("../config/database")
const { authenticateEmployee, authenticateCustomer, authenticateApiKey } = require("../middleware/auth")

const router = express.Router()

// Get all products (public for reservation system, authenticated for POS)
router.get("/", async (req, res) => {
  try {
    const { category_id, status, featured, search, page = 1, limit = 50 } = req.query

    let query = `
      SELECT 
        p.product_id,
        p.name,
        p.description,
        p.barcode,
        p.sku,
        p.price,
        p.quantity_in_stock,
        p.status,
        p.image_url,
        p.is_featured,
        c.name AS category_name,
        c.category_id
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.category_id
      WHERE p.is_active = true
    `

    const params = []
    let paramCount = 0

    if (category_id) {
      paramCount++
      query += ` AND p.category_id = $${paramCount}`
      params.push(category_id)
    }

    if (status) {
      paramCount++
      query += ` AND p.status = $${paramCount}`
      params.push(status)
    }

    if (featured === "true") {
      query += ` AND p.is_featured = true`
    }

    if (search) {
      paramCount++
      query += ` AND (p.name ILIKE $${paramCount} OR p.description ILIKE $${paramCount})`
      params.push(`%${search}%`)
    }

    query += ` ORDER BY p.name`

    // Add pagination
    const offset = (page - 1) * limit
    paramCount++
    query += ` LIMIT $${paramCount}`
    params.push(limit)

    paramCount++
    query += ` OFFSET $${paramCount}`
    params.push(offset)

    const result = await pool.query(query, params)

    // Get total count for pagination
    let countQuery = `
      SELECT COUNT(*) as total
      FROM products p
      WHERE p.is_active = true
    `
    const countParams = []
    let countParamCount = 0

    if (category_id) {
      countParamCount++
      countQuery += ` AND p.category_id = $${countParamCount}`
      countParams.push(category_id)
    }

    if (status) {
      countParamCount++
      countQuery += ` AND p.status = $${countParamCount}`
      countParams.push(status)
    }

    if (featured === "true") {
      countQuery += ` AND p.is_featured = true`
    }

    if (search) {
      countParamCount++
      countQuery += ` AND (p.name ILIKE $${countParamCount} OR p.description ILIKE $${countParamCount})`
      countParams.push(`%${search}%`)
    }

    const countResult = await pool.query(countQuery, countParams)
    const total = Number.parseInt(countResult.rows[0].total)

    res.json({
      products: result.rows,
      pagination: {
        page: Number.parseInt(page),
        limit: Number.parseInt(limit),
        total,
        pages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error("Get products error:", error)
    res.status(500).json({ error: "Failed to fetch products" })
  }
})

// Get single product
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params

    const result = await pool.query(
      `
      SELECT 
        p.*,
        c.name AS category_name,
        COALESCE(
          json_agg(
            json_build_object(
              'image_id', pi.image_id,
              'image_url', pi.image_url,
              'is_primary', pi.is_primary,
              'display_order', pi.display_order
            )
          ) FILTER (WHERE pi.image_id IS NOT NULL), 
          '[]'
        ) AS images
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.category_id
      LEFT JOIN product_images pi ON p.product_id = pi.product_id
      WHERE p.product_id = $1 AND p.is_active = true
      GROUP BY p.product_id, c.name
    `,
      [id],
    )

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Product not found" })
    }

    res.json({ product: result.rows[0] })
  } catch (error) {
    console.error("Get product error:", error)
    res.status(500).json({ error: "Failed to fetch product" })
  }
})

// Create new product (POS only)
router.post("/", authenticateEmployee, async (req, res) => {
  try {
    const {
      category_id,
      name,
      description,
      barcode,
      sku,
      price,
      cost_price,
      tax_rate,
      quantity_in_stock,
      reorder_level,
      image_url,
      is_featured,
    } = req.body

    if (!name || !price || !category_id) {
      return res.status(400).json({ error: "Name, price, and category are required" })
    }

    const result = await pool.query(
      `
      INSERT INTO products (
        category_id, name, description, barcode, sku, price, cost_price,
        tax_rate, quantity_in_stock, reorder_level, image_url, is_featured
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *
    `,
      [
        category_id,
        name,
        description,
        barcode,
        sku,
        price,
        cost_price,
        tax_rate || 0,
        quantity_in_stock || 0,
        reorder_level || 5,
        image_url,
        is_featured || false,
      ],
    )

    res.status(201).json({ product: result.rows[0] })
  } catch (error) {
    console.error("Create product error:", error)
    if (error.code === "23505") {
      // Unique violation
      res.status(400).json({ error: "Product with this barcode or SKU already exists" })
    } else {
      res.status(500).json({ error: "Failed to create product" })
    }
  }
})

// Update product (POS only)
router.put("/:id", authenticateEmployee, async (req, res) => {
  try {
    const { id } = req.params
    const {
      category_id,
      name,
      description,
      barcode,
      sku,
      price,
      cost_price,
      tax_rate,
      quantity_in_stock,
      reorder_level,
      image_url,
      is_featured,
      is_active,
    } = req.body

    const result = await pool.query(
      `
      UPDATE products SET
        category_id = COALESCE($1, category_id),
        name = COALESCE($2, name),
        description = COALESCE($3, description),
        barcode = COALESCE($4, barcode),
        sku = COALESCE($5, sku),
        price = COALESCE($6, price),
        cost_price = COALESCE($7, cost_price),
        tax_rate = COALESCE($8, tax_rate),
        quantity_in_stock = COALESCE($9, quantity_in_stock),
        reorder_level = COALESCE($10, reorder_level),
        image_url = COALESCE($11, image_url),
        is_featured = COALESCE($12, is_featured),
        is_active = COALESCE($13, is_active),
        updated_at = CURRENT_TIMESTAMP
      WHERE product_id = $14 AND is_active = true
      RETURNING *
    `,
      [
        category_id,
        name,
        description,
        barcode,
        sku,
        price,
        cost_price,
        tax_rate,
        quantity_in_stock,
        reorder_level,
        image_url,
        is_featured,
        is_active,
        id,
      ],
    )

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Product not found" })
    }

    res.json({ product: result.rows[0] })
  } catch (error) {
    console.error("Update product error:", error)
    res.status(500).json({ error: "Failed to update product" })
  }
})

// Delete product (POS only)
router.delete("/:id", authenticateEmployee, async (req, res) => {
  try {
    const { id } = req.params

    const result = await pool.query(
      "UPDATE products SET is_active = false, updated_at = CURRENT_TIMESTAMP WHERE product_id = $1 AND is_active = true RETURNING product_id",
      [id],
    )

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Product not found" })
    }

    res.json({ message: "Product deleted successfully" })
  } catch (error) {
    console.error("Delete product error:", error)
    res.status(500).json({ error: "Failed to delete product" })
  }
})

// Get low stock products (POS only)
router.get("/alerts/low-stock", authenticateEmployee, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        p.product_id,
        p.name,
        p.quantity_in_stock,
        p.reorder_level,
        c.name AS category_name
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.category_id
      WHERE p.is_active = true 
        AND p.quantity_in_stock <= p.reorder_level
      ORDER BY p.quantity_in_stock ASC
    `)

    res.json({ products: result.rows })
  } catch (error) {
    console.error("Get low stock products error:", error)
    res.status(500).json({ error: "Failed to fetch low stock products" })
  }
})

module.exports = router
