const jwt = require("jsonwebtoken")
const pool = require("../config/database")

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key"

// Middleware for employee authentication (POS system)
const authenticateEmployee = async (req, res, next) => {
  try {
    const token = req.header("Authorization")?.replace("Bearer ", "")

    if (!token) {
      return res.status(401).json({ error: "Access denied. No token provided." })
    }

    const decoded = jwt.verify(token, JWT_SECRET)

    if (decoded.type !== "employee") {
      return res.status(403).json({ error: "Access denied. Employee access required." })
    }

    const result = await pool.query(
      "SELECT employee_id, first_name, last_name, position, is_admin, is_active FROM employees WHERE employee_id = $1 AND is_active = true",
      [decoded.id],
    )

    if (result.rows.length === 0) {
      return res.status(401).json({ error: "Invalid token or inactive employee." })
    }

    req.employee = result.rows[0]
    next()
  } catch (error) {
    res.status(401).json({ error: "Invalid token." })
  }
}

// Middleware for customer authentication (Reservation system)
const authenticateCustomer = async (req, res, next) => {
  try {
    const token = req.header("Authorization")?.replace("Bearer ", "")

    if (!token) {
      return res.status(401).json({ error: "Access denied. No token provided." })
    }

    const decoded = jwt.verify(token, JWT_SECRET)

    if (decoded.type !== "customer") {
      return res.status(403).json({ error: "Access denied. Customer access required." })
    }

    const result = await pool.query(
      "SELECT c.customer_id, c.first_name, c.last_name, c.phone, c.email, c.is_active FROM customers c JOIN app_users au ON c.customer_id = au.customer_id WHERE au.user_id = $1 AND c.is_active = true",
      [decoded.id],
    )

    if (result.rows.length === 0) {
      return res.status(401).json({ error: "Invalid token or inactive customer." })
    }

    req.customer = result.rows[0]
    next()
  } catch (error) {
    res.status(401).json({ error: "Invalid token." })
  }
}

// Middleware for admin access
const requireAdmin = (req, res, next) => {
  if (!req.employee || !req.employee.is_admin) {
    return res.status(403).json({ error: "Access denied. Admin privileges required." })
  }
  next()
}

// API Key authentication for external systems
const authenticateApiKey = async (req, res, next) => {
  try {
    const apiKey = req.header("X-API-Key")

    if (!apiKey) {
      return res.status(401).json({ error: "API key required." })
    }

    const result = await pool.query(
      "SELECT key_id, app_name, permissions FROM api_keys WHERE api_key = $1 AND is_active = true",
      [apiKey],
    )

    if (result.rows.length === 0) {
      return res.status(401).json({ error: "Invalid API key." })
    }

    // Update last used timestamp
    await pool.query("UPDATE api_keys SET last_used_at = CURRENT_TIMESTAMP WHERE key_id = $1", [result.rows[0].key_id])

    req.apiKey = result.rows[0]
    next()
  } catch (error) {
    res.status(401).json({ error: "API key authentication failed." })
  }
}

module.exports = {
  authenticateEmployee,
  authenticateCustomer,
  requireAdmin,
  authenticateApiKey,
}
