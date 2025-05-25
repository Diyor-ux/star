# POS System API

Complete REST API for Point of Sale system with reservation functionality.

## Features

- **Dual System Support**: Serves both POS system and customer reservation app
- **Authentication**: JWT-based auth for employees and customers
- **Product Management**: Full CRUD operations for products and categories
- **Reservation System**: Create, manage, and track product reservations
- **Inventory Management**: Real-time inventory tracking with automatic updates
- **Sales Management**: Complete sales processing and reporting
- **Security**: Rate limiting, CORS, helmet security headers
- **Database**: PostgreSQL with optimized queries and indexes

## API Endpoints

### Authentication
- `POST /api/auth/employee/login` - Employee login (POS)
- `POST /api/auth/customer/register` - Customer registration
- `POST /api/auth/customer/login` - Customer login
- `GET /api/auth/employee/me` - Get current employee info
- `GET /api/auth/customer/me` - Get current customer info

### Products
- `GET /api/products` - Get all products (with filters)
- `GET /api/products/:id` - Get single product
- `POST /api/products` - Create product (POS only)
- `PUT /api/products/:id` - Update product (POS only)
- `DELETE /api/products/:id` - Delete product (POS only)
- `GET /api/products/alerts/low-stock` - Get low stock alerts (POS only)

### Categories
- `GET /api/categories` - Get all categories
- `POST /api/categories` - Create category (POS only)
- `PUT /api/categories/:id` - Update category (POS only)

### Reservations
- `GET /api/reservations` - Get reservations (filtered by user type)
- `GET /api/reservations/:id` - Get single reservation
- `POST /api/reservations` - Create reservation
- `PUT /api/reservations/:id/status` - Update reservation status (POS only)
- `PUT /api/reservations/:id/cancel` - Cancel reservation

### Customers
- `GET /api/customers` - Get customers (POS only)
- `POST /api/customers` - Create customer (POS only)
- `PUT /api/customers/:id` - Update customer (POS only)

## Setup

1. Install dependencies:
\`\`\`bash
npm install
\`\`\`

2. Set up environment variables:
\`\`\`bash
cp .env.example .env
# Edit .env with your database credentials
\`\`\`

3. Create PostgreSQL database and run the provided SQL schema

4. Start the server:
\`\`\`bash
npm run dev  # Development
npm start    # Production
\`\`\`

## Database Schema

The API works with the provided PostgreSQL schema that includes:
- Products and categories
- Customer management
- Reservation system
- Sales and inventory tracking
- Employee management
- API access control

## Authentication

### Employee Authentication (POS System)
- Use email/password to get JWT token
- Include token in Authorization header: `Bearer <token>`
- Token expires in 8 hours

### Customer Authentication (Reservation App)
- Register with personal details
- Use email/password to get JWT token
- Include token in Authorization header: `Bearer <token>`
- Token expires in 30 days

## Error Handling

All endpoints return consistent error responses:
\`\`\`json
{
  "error": "Error message description"
}
\`\`\`

HTTP status codes:
- 200: Success
- 201: Created
- 400: Bad Request
- 401: Unauthorized
- 403: Forbidden
- 404: Not Found
- 500: Internal Server Error

## Rate Limiting

- 100 requests per 15 minutes per IP
- Applies to all `/api/*` endpoints
- Returns 429 status when limit exceeded
