const express = require("express")
const cors = require("cors")
const helmet = require("helmet")
const rateLimit = require("express-rate-limit")
require("dotenv").config()

const authRoutes = require("./routes/auth")
const productsRoutes = require("./routes/products")
const categoriesRoutes = require("./routes/categories")
const customersRoutes = require("./routes/customers")
const reservationsRoutes = require("./routes/reservations")
const salesRoutes = require("./routes/sales")
const employeesRoutes = require("./routes/employees")
const inventoryRoutes = require("./routes/inventory")
const reportsRoutes = require("./routes/reports")

const app = express()
const PORT = process.env.PORT || 3000

// Security middleware
app.use(helmet())
app.use(
  cors({
    origin: process.env.ALLOWED_ORIGINS?.split(",") || ["http://localhost:3000"],
    credentials: true,
  }),
)

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: "Too many requests from this IP, please try again later.",
})
app.use("/api/", limiter)

// Body parsing middleware
app.use(express.json({ limit: "10mb" }))
app.use(express.urlencoded({ extended: true }))

// API Routes
app.use("/api/auth", authRoutes)
app.use("/api/products", productsRoutes)
app.use("/api/categories", categoriesRoutes)
app.use("/api/customers", customersRoutes)
app.use("/api/reservations", reservationsRoutes)
app.use("/api/sales", salesRoutes)
app.use("/api/employees", employeesRoutes)
app.use("/api/inventory", inventoryRoutes)
app.use("/api/reports", reportsRoutes)

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.json({
    status: "OK",
    timestamp: new Date().toISOString(),
    version: "1.0.0",
  })
})

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack)
  res.status(500).json({
    error: "Something went wrong!",
    message: process.env.NODE_ENV === "development" ? err.message : "Internal server error",
  })
})

// 404 handler
app.use("*", (req, res) => {
  res.status(404).json({ error: "Route not found" })
})

app.listen(PORT, () => {
  console.log(`POS API Server running on port ${PORT}`)
  console.log(`Environment: ${process.env.NODE_ENV || "development"}`)
})

module.exports = app
