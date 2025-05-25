const express = require("express")
const bcrypt = require("bcryptjs")
const jwt = require("jsonwebtoken")
const pool = require("../config/database")
const { authenticateEmployee, authenticateCustomer } = require("../middleware/auth")

const router = express.Router()
const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key"

// Employee login (POS system)
router.post("/employee/login", async (req, res) => {
  try {
    const { email, password } = req.body

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" })
    }

    const result = await pool.query(
      "SELECT employee_id, first_name, last_name, email, password_hash, position, is_admin, is_active FROM employees WHERE email = $1",
      [email],
    )

    if (result.rows.length === 0) {
      return res.status(401).json({ error: "Invalid credentials" })
    }

    const employee = result.rows[0]

    if (!employee.is_active) {
      return res.status(401).json({ error: "Account is inactive" })
    }

    const isValidPassword = await bcrypt.compare(password, employee.password_hash)
    if (!isValidPassword) {
      return res.status(401).json({ error: "Invalid credentials" })
    }

    const token = jwt.sign(
      {
        id: employee.employee_id,
        type: "employee",
        isAdmin: employee.is_admin,
      },
      JWT_SECRET,
      { expiresIn: "8h" },
    )

    res.json({
      token,
      employee: {
        id: employee.employee_id,
        firstName: employee.first_name,
        lastName: employee.last_name,
        email: employee.email,
        position: employee.position,
        isAdmin: employee.is_admin,
      },
    })
  } catch (error) {
    console.error("Employee login error:", error)
    res.status(500).json({ error: "Login failed" })
  }
})

// Customer registration (Reservation system)
router.post("/customer/register", async (req, res) => {
  try {
    const { firstName, lastName, phone, email, password } = req.body

    if (!firstName || !lastName || !phone || !email || !password) {
      return res.status(400).json({ error: "All fields are required" })
    }

    // Check if customer already exists
    const existingCustomer = await pool.query("SELECT customer_id FROM customers WHERE phone = $1 OR email = $2", [
      phone,
      email,
    ])

    if (existingCustomer.rows.length > 0) {
      return res.status(400).json({ error: "Customer with this phone or email already exists" })
    }

    const hashedPassword = await bcrypt.hash(password, 10)

    // Start transaction
    const client = await pool.connect()
    try {
      await client.query("BEGIN")

      // Insert customer
      const customerResult = await client.query(
        "INSERT INTO customers (first_name, last_name, phone, email, password_hash) VALUES ($1, $2, $3, $4, $5) RETURNING customer_id",
        [firstName, lastName, phone, email, hashedPassword],
      )

      const customerId = customerResult.rows[0].customer_id

      // Insert app user
      const appUserResult = await client.query(
        "INSERT INTO app_users (customer_id, username, email, password_hash) VALUES ($1, $2, $3, $4) RETURNING user_id",
        [customerId, email, email, hashedPassword],
      )

      await client.query("COMMIT")

      const token = jwt.sign(
        {
          id: appUserResult.rows[0].user_id,
          customerId: customerId,
          type: "customer",
        },
        JWT_SECRET,
        { expiresIn: "30d" },
      )

      res.status(201).json({
        token,
        customer: {
          id: customerId,
          firstName,
          lastName,
          phone,
          email,
        },
      })
    } catch (error) {
      await client.query("ROLLBACK")
      throw error
    } finally {
      client.release()
    }
  } catch (error) {
    console.error("Customer registration error:", error)
    res.status(500).json({ error: "Registration failed" })
  }
})

// Customer login (Reservation system)
router.post("/customer/login", async (req, res) => {
  try {
    const { email, password } = req.body

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" })
    }

    const result = await pool.query(
      "SELECT au.user_id, au.password_hash, c.customer_id, c.first_name, c.last_name, c.phone, c.email, c.is_active FROM app_users au JOIN customers c ON au.customer_id = c.customer_id WHERE au.email = $1",
      [email],
    )

    if (result.rows.length === 0) {
      return res.status(401).json({ error: "Invalid credentials" })
    }

    const user = result.rows[0]

    if (!user.is_active) {
      return res.status(401).json({ error: "Account is inactive" })
    }

    const isValidPassword = await bcrypt.compare(password, user.password_hash)
    if (!isValidPassword) {
      return res.status(401).json({ error: "Invalid credentials" })
    }

    const token = jwt.sign(
      {
        id: user.user_id,
        customerId: user.customer_id,
        type: "customer",
      },
      JWT_SECRET,
      { expiresIn: "30d" },
    )

    // Update last login
    await pool.query("UPDATE customers SET last_login = CURRENT_TIMESTAMP WHERE customer_id = $1", [user.customer_id])

    res.json({
      token,
      customer: {
        id: user.customer_id,
        firstName: user.first_name,
        lastName: user.last_name,
        phone: user.phone,
        email: user.email,
      },
    })
  } catch (error) {
    console.error("Customer login error:", error)
    res.status(500).json({ error: "Login failed" })
  }
})

// Get current employee info
router.get("/employee/me", authenticateEmployee, (req, res) => {
  res.json({ employee: req.employee })
})

// Get current customer info
router.get("/customer/me", authenticateCustomer, (req, res) => {
  res.json({ customer: req.customer })
})

module.exports = router
