const express = require("express")
const pool = require("../config/database")
const { authenticateEmployee, authenticateCustomer } = require("../middleware/auth")
const { v4: uuidv4 } = require("uuid")

const router = express.Router()

// Get reservations (different access for POS vs Customer)
router.get("/", async (req, res) => {
  try {
    const isEmployee = req.employee
    const isCustomer = req.customer

    let query = `
      SELECT 
        r.reservation_id,
        r.reservation_code,
        r.customer_id,
        CONCAT(c.first_name, ' ', c.last_name) AS customer_name,
        c.phone AS customer_phone,
        r.reservation_date,
        r.expiration_date,
        r.status,
        r.total_amount,
        r.source,
        r.notes,
        COUNT(ri.item_id) AS total_items,
        SUM(ri.quantity) AS total_quantity
      FROM reservations r
      JOIN customers c ON r.customer_id = c.customer_id
      LEFT JOIN reservation_items ri ON r.reservation_id = ri.reservation_id
    `

    const params = []
    let paramCount = 0

    // If customer is authenticated, only show their reservations
    if (isCustomer) {
      paramCount++
      query += ` WHERE r.customer_id = $${paramCount}`
      params.push(req.customer.customer_id)
    }

    // Add filters for employees
    if (isEmployee) {
      const { status, date_from, date_to, customer_id } = req.query

      let whereAdded = false

      if (status) {
        paramCount++
        query += whereAdded ? ` AND` : ` WHERE`
        query += ` r.status = $${paramCount}`
        params.push(status)
        whereAdded = true
      }

      if (date_from) {
        paramCount++
        query += whereAdded ? ` AND` : ` WHERE`
        query += ` r.reservation_date >= $${paramCount}`
        params.push(date_from)
        whereAdded = true
      }

      if (date_to) {
        paramCount++
        query += whereAdded ? ` AND` : ` WHERE`
        query += ` r.reservation_date <= $${paramCount}`
        params.push(date_to)
        whereAdded = true
      }

      if (customer_id) {
        paramCount++
        query += whereAdded ? ` AND` : ` WHERE`
        query += ` r.customer_id = $${paramCount}`
        params.push(customer_id)
        whereAdded = true
      }
    }

    query += `
      GROUP BY r.reservation_id, c.customer_id, c.first_name, c.last_name, c.phone
      ORDER BY r.reservation_date DESC
    `

    const result = await pool.query(query, params)
    res.json({ reservations: result.rows })
  } catch (error) {
    console.error("Get reservations error:", error)
    res.status(500).json({ error: "Failed to fetch reservations" })
  }
})

// Get single reservation with items
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params
    const isCustomer = req.customer

    let reservationQuery = `
      SELECT 
        r.*,
        CONCAT(c.first_name, ' ', c.last_name) AS customer_name,
        c.phone AS customer_phone,
        c.email AS customer_email
      FROM reservations r
      JOIN customers c ON r.customer_id = c.customer_id
      WHERE r.reservation_id = $1
    `

    const params = [id]

    // If customer is authenticated, ensure they can only see their own reservations
    if (isCustomer) {
      reservationQuery += ` AND r.customer_id = $2`
      params.push(req.customer.customer_id)
    }

    const reservationResult = await pool.query(reservationQuery, params)

    if (reservationResult.rows.length === 0) {
      return res.status(404).json({ error: "Reservation not found" })
    }

    // Get reservation items
    const itemsResult = await pool.query(
      `
      SELECT 
        ri.*,
        p.name AS product_name,
        p.image_url AS product_image,
        p.status AS product_status
      FROM reservation_items ri
      JOIN products p ON ri.product_id = p.product_id
      WHERE ri.reservation_id = $1
      ORDER BY ri.item_id
    `,
      [id],
    )

    const reservation = reservationResult.rows[0]
    reservation.items = itemsResult.rows

    res.json({ reservation })
  } catch (error) {
    console.error("Get reservation error:", error)
    res.status(500).json({ error: "Failed to fetch reservation" })
  }
})

// Create new reservation (Customer or POS)
router.post("/", async (req, res) => {
  try {
    const { customer_id, items, expiration_hours = 24, notes } = req.body
    const isEmployee = req.employee
    const isCustomer = req.customer

    if (!items || items.length === 0) {
      return res.status(400).json({ error: "At least one item is required" })
    }

    // Determine customer ID and source
    let finalCustomerId = customer_id
    let source = "POS"
    let createdBy = "Employee"

    if (isCustomer) {
      finalCustomerId = req.customer.customer_id
      source = "Online"
      createdBy = "Customer"
    } else if (isEmployee) {
      createdBy = `Employee-${req.employee.employee_id}`
    }

    if (!finalCustomerId) {
      return res.status(400).json({ error: "Customer ID is required" })
    }

    const client = await pool.connect()
    try {
      await client.query("BEGIN")

      // Check product availability
      for (const item of items) {
        const productResult = await client.query(
          "SELECT quantity_in_stock, status, name FROM products WHERE product_id = $1 AND is_active = true",
          [item.product_id],
        )

        if (productResult.rows.length === 0) {
          throw new Error(`Product with ID ${item.product_id} not found`)
        }

        const product = productResult.rows[0]
        if (product.quantity_in_stock < item.quantity) {
          throw new Error(
            `Insufficient stock for ${product.name}. Available: ${product.quantity_in_stock}, Requested: ${item.quantity}`,
          )
        }
      }

      // Calculate total amount
      let totalAmount = 0
      for (const item of items) {
        const productResult = await client.query("SELECT price FROM products WHERE product_id = $1", [item.product_id])
        totalAmount += productResult.rows[0].price * item.quantity
      }

      // Generate reservation code
      const reservationCode = `RES-${Date.now()}-${Math.random().toString(36).substr(2, 4).toUpperCase()}`

      // Calculate expiration date
      const expirationDate = new Date()
      expirationDate.setHours(expirationDate.getHours() + expiration_hours)

      // Create reservation
      const reservationResult = await client.query(
        `
        INSERT INTO reservations (
          customer_id, reservation_code, expiration_date, total_amount,
          notes, source, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
      `,
        [finalCustomerId, reservationCode, expirationDate, totalAmount, notes, source, createdBy],
      )

      const reservationId = reservationResult.rows[0].reservation_id

      // Create reservation items
      for (const item of items) {
        const productResult = await client.query("SELECT price FROM products WHERE product_id = $1", [item.product_id])

        const unitPrice = productResult.rows[0].price
        const subtotal = unitPrice * item.quantity

        await client.query(
          `
          INSERT INTO reservation_items (
            reservation_id, product_id, quantity, unit_price, subtotal
          ) VALUES ($1, $2, $3, $4, $5)
        `,
          [reservationId, item.product_id, item.quantity, unitPrice, subtotal],
        )
      }

      await client.query("COMMIT")

      // Fetch the complete reservation
      const completeReservation = await pool.query(
        `
        SELECT 
          r.*,
          CONCAT(c.first_name, ' ', c.last_name) AS customer_name,
          c.phone AS customer_phone
        FROM reservations r
        JOIN customers c ON r.customer_id = c.customer_id
        WHERE r.reservation_id = $1
      `,
        [reservationId],
      )

      res.status(201).json({
        reservation: completeReservation.rows[0],
        message: "Reservation created successfully",
      })
    } catch (error) {
      await client.query("ROLLBACK")
      throw error
    } finally {
      client.release()
    }
  } catch (error) {
    console.error("Create reservation error:", error)
    res.status(500).json({ error: error.message || "Failed to create reservation" })
  }
})

// Update reservation status (POS only)
router.put("/:id/status", authenticateEmployee, async (req, res) => {
  try {
    const { id } = req.params
    const { status, notes } = req.body

    if (!status) {
      return res.status(400).json({ error: "Status is required" })
    }

    const validStatuses = ["Pending", "Confirmed", "Completed", "Cancelled", "Expired"]
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: "Invalid status" })
    }

    const result = await pool.query(
      `
      UPDATE reservations SET
        status = $1,
        notes = COALESCE($2, notes),
        updated_at = CURRENT_TIMESTAMP
      WHERE reservation_id = $3
      RETURNING *
    `,
      [status, notes, id],
    )

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Reservation not found" })
    }

    res.json({
      reservation: result.rows[0],
      message: "Reservation status updated successfully",
    })
  } catch (error) {
    console.error("Update reservation status error:", error)
    res.status(500).json({ error: "Failed to update reservation status" })
  }
})

// Cancel reservation (Customer or POS)
router.put("/:id/cancel", async (req, res) => {
  try {
    const { id } = req.params
    const isCustomer = req.customer

    let query = `
      UPDATE reservations SET
        status = 'Cancelled',
        updated_at = CURRENT_TIMESTAMP
      WHERE reservation_id = $1 AND status IN ('Pending', 'Confirmed')
    `

    const params = [id]

    // If customer is authenticated, ensure they can only cancel their own reservations
    if (isCustomer) {
      query += ` AND customer_id = $2`
      params.push(req.customer.customer_id)
    }

    query += ` RETURNING *`

    const result = await pool.query(query, params)

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Reservation not found or cannot be cancelled" })
    }

    res.json({
      reservation: result.rows[0],
      message: "Reservation cancelled successfully",
    })
  } catch (error) {
    console.error("Cancel reservation error:", error)
    res.status(500).json({ error: "Failed to cancel reservation" })
  }
})

module.exports = router
