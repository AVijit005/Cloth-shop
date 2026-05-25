-- Performance indexes for shibani_store
-- Run after initial schema creation

USE shibani_store;

-- Orders: filter by user, sort by date
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);

-- Order items: lookup by order
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);

-- Products: filter by category, sort by rating
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_rating ON products(rating DESC);
CREATE INDEX IF NOT EXISTS idx_products_created_at ON products(created_at DESC);

-- Reviews: filter by product, filter by status
CREATE INDEX IF NOT EXISTS idx_reviews_product_id ON reviews(product_id);
CREATE INDEX IF NOT EXISTS idx_reviews_status ON reviews(status);

-- Coupons: lookup by code
CREATE INDEX IF NOT EXISTS idx_coupons_code ON coupons(code);

-- Users: lookup by email
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
