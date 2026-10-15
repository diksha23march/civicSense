
-- CivicSense: Initial database schema

-- 1. Departments responsible for civic issues
CREATE TABLE IF NOT EXISTS departments (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Users: citizens, workers, department heads, and admins
CREATE TABLE IF NOT EXISTS users (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    full_name VARCHAR(120) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'citizen'
        CHECK (role IN ('citizen', 'worker', 'department_head', 'admin')),
    department_id BIGINT REFERENCES departments(id)
        ON DELETE SET NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Helps retrieve users by role
CREATE INDEX IF NOT EXISTS idx_users_role
    ON users(role);

-- Helps retrieve workers within a department
CREATE INDEX IF NOT EXISTS idx_users_department_id
    ON users(department_id);
