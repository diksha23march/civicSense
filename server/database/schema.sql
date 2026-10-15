
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


-- 3. Issues reported by citizens
CREATE TABLE IF NOT EXISTS issues (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    title VARCHAR(200) NOT NULL,
    description TEXT NOT NULL,
    category VARCHAR(40) NOT NULL
        CHECK (category IN (
            'sanitation',
            'roads',
            'water_supply',
            'street_lighting',
            'drainage',
            'waste_management',
            'public_safety',
            'other'
        )),
    address TEXT NOT NULL,
    latitude NUMERIC(10, 7),
    longitude NUMERIC(10, 7),
    image_url TEXT,
    priority VARCHAR(10) NOT NULL DEFAULT 'medium'
        CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
    status VARCHAR(20) NOT NULL DEFAULT 'submitted'
        CHECK (status IN (
            'submitted',
            'under_review',
            'assigned',
            'in_progress',
            'resolved',
            'rejected',
            'reopened'
        )),
    reported_by BIGINT NOT NULL REFERENCES users(id)
        ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
    CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180)
);

CREATE INDEX IF NOT EXISTS idx_issues_reported_by
    ON issues(reported_by);

CREATE INDEX IF NOT EXISTS idx_issues_status
    ON issues(status);

CREATE INDEX IF NOT EXISTS idx_issues_category
    ON issues(category);

CREATE INDEX IF NOT EXISTS idx_issues_created_at
    ON issues(created_at DESC);


-- 4. Worker assignments for issues
CREATE TABLE IF NOT EXISTS issue_assignments (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    issue_id BIGINT NOT NULL REFERENCES issues(id)
        ON DELETE RESTRICT,
    worker_id BIGINT NOT NULL REFERENCES users(id)
        ON DELETE RESTRICT,
    assigned_by BIGINT NOT NULL REFERENCES users(id)
        ON DELETE RESTRICT,
    assignment_status VARCHAR(15) NOT NULL DEFAULT 'active'
        CHECK (assignment_status IN (
            'active',
            'completed',
            'cancelled'
        )),
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    notes TEXT,

    CHECK (
        completed_at IS NULL
        OR completed_at >= assigned_at
    )
);

CREATE INDEX IF NOT EXISTS idx_assignments_worker
    ON issue_assignments(worker_id);

CREATE INDEX IF NOT EXISTS idx_assignments_issue
    ON issue_assignments(issue_id);

-- An issue can have only one active assignment at a time.
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_assignment_per_issue
    ON issue_assignments(issue_id)
    WHERE assignment_status = 'active';


-- 5. History of changes to issue status
CREATE TABLE IF NOT EXISTS issue_status_history (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    issue_id BIGINT NOT NULL REFERENCES issues(id)
        ON DELETE RESTRICT,
    old_status VARCHAR(20)
        CHECK (old_status IS NULL OR old_status IN (
            'submitted',
            'under_review',
            'assigned',
            'in_progress',
            'resolved',
            'rejected',
            'reopened'
        )),
    new_status VARCHAR(20) NOT NULL
        CHECK (new_status IN (
            'submitted',
            'under_review',
            'assigned',
            'in_progress',
            'resolved',
            'rejected',
            'reopened'
        )),
    changed_by BIGINT NOT NULL REFERENCES users(id)
        ON DELETE RESTRICT,
    note TEXT,
    changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_status_history_issue
    ON issue_status_history(issue_id, changed_at DESC);

-- 6. Worker rewards and proposed penalties
CREATE TABLE IF NOT EXISTS worker_performance_records (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    worker_id BIGINT NOT NULL REFERENCES users(id)
        ON DELETE RESTRICT,
    issue_id BIGINT REFERENCES issues(id)
        ON DELETE RESTRICT,

    record_type VARCHAR(10) NOT NULL
        CHECK (record_type IN ('reward', 'penalty')),

    reason TEXT NOT NULL,
    points INTEGER NOT NULL
        CHECK (points > 0),

    evidence_url TEXT,

    status VARCHAR(15) NOT NULL DEFAULT 'proposed'
        CHECK (status IN (
            'proposed',
            'approved',
            'rejected',
            'reversed'
        )),

    created_by BIGINT NOT NULL REFERENCES users(id)
        ON DELETE RESTRICT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_performance_worker
    ON worker_performance_records(worker_id);

CREATE INDEX IF NOT EXISTS idx_performance_status
    ON worker_performance_records(status);

CREATE INDEX IF NOT EXISTS idx_performance_issue
    ON worker_performance_records(issue_id);


-- 7. Reviews of worker performance records
CREATE TABLE IF NOT EXISTS performance_reviews (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    performance_record_id BIGINT NOT NULL
        REFERENCES worker_performance_records(id)
        ON DELETE RESTRICT,

    reviewer_id BIGINT NOT NULL REFERENCES users(id)
        ON DELETE RESTRICT,

    decision VARCHAR(20) NOT NULL
        CHECK (decision IN (
            'approved',
            'rejected',
            'reversed',
            'more_information'
        )),

    comments TEXT NOT NULL,
    reviewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_performance_reviews_record
    ON performance_reviews(performance_record_id);


-- 8. Worker appeals against performance decisions
CREATE TABLE IF NOT EXISTS performance_appeals (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    performance_record_id BIGINT NOT NULL
        REFERENCES worker_performance_records(id)
        ON DELETE RESTRICT,

    worker_id BIGINT NOT NULL REFERENCES users(id)
        ON DELETE RESTRICT,

    appeal_reason TEXT NOT NULL,
    evidence_url TEXT,

    status VARCHAR(15) NOT NULL DEFAULT 'pending'
        CHECK (status IN (
            'pending',
            'accepted',
            'rejected'
        )),

    reviewed_by BIGINT REFERENCES users(id)
        ON DELETE RESTRICT,

    review_comments TEXT,
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reviewed_at TIMESTAMPTZ,

    CHECK (
        (status = 'pending' AND reviewed_by IS NULL
            AND reviewed_at IS NULL)
        OR
        (status <> 'pending' AND reviewed_by IS NOT NULL
            AND reviewed_at IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_performance_appeals_record
    ON performance_appeals(performance_record_id);

CREATE INDEX IF NOT EXISTS idx_performance_appeals_status
    ON performance_appeals(status);
