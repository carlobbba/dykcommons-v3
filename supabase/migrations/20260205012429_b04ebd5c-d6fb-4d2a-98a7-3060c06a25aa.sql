-- 1. Insert admin role for existing admin user
INSERT INTO user_roles (user_id, role)
SELECT id, 'admin'::app_role 
FROM users 
WHERE username = 'admin'
ON CONFLICT DO NOTHING;

-- 2. Add is_sell_order column to orders table
ALTER TABLE orders ADD COLUMN is_sell_order boolean NOT NULL DEFAULT false;