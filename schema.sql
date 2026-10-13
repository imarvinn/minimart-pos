-- 1. Categories
CREATE TABLE categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name VARCHAR(50) NOT NULL
);

-- 2. Products / Inventory
CREATE TABLE products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    barcode VARCHAR(64) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    category_id INT REFERENCES categories(id),
    cost_price DECIMAL(10, 2) NOT NULL,
    selling_price DECIMAL(10, 2) NOT NULL,
    stock_quantity INT DEFAULT 0,
    reorder_level INT DEFAULT 10,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. Sales Transactions
CREATE TABLE sales (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    receipt_no VARCHAR(32) UNIQUE NOT NULL,
    subtotal DECIMAL(10, 2) NOT NULL,
    discount DECIMAL(10, 2) DEFAULT 0,
    total DECIMAL(10, 2) NOT NULL,
    amount_paid DECIMAL(10, 2) NOT NULL,
    change_due DECIMAL(10, 2) NOT NULL,
    payment_method VARCHAR(20) DEFAULT 'CASH', -- CASH, GCASH, CARD
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. Sale Items (Deduction Audit)
CREATE TABLE sale_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sale_id INT REFERENCES sales(id) ON DELETE CASCADE,
    product_id INT REFERENCES products(id),
    quantity INT NOT NULL,
    unit_price DECIMAL(10, 2) NOT NULL,
    subtotal DECIMAL(10, 2) NOT NULL
);