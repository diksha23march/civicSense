
const express = require("express");
const cors = require("cors");
const pool = require("./db");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 5000;

const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { authenticateToken, authorizeRoles } = require("./authMiddleware");

app.use(cors());
app.use(express.json());

// Register a new citizen
app.post(
  "/api/auth/register",
  async (req, res) => {
    try {
      const { fullName, email, password } = req.body;

      if (!fullName || !email || !password) {
        return res.status(400).json({
          success: false,
          message: "Full name, email, and password are required.",
        });
      }

      if (password.length < 8) {
        return res.status(400).json({
          success: false,
          message: "Password must be at least 8 characters long.",
        });
      }

      if (!process.env.JWT_SECRET) {
        throw new Error("JWT_SECRET is not configured.");
      }

      const normalizedEmail = email.trim().toLowerCase();

      const existingUser = await pool.query(
        "SELECT id FROM users WHERE email = $1",
        [normalizedEmail]
      );

      if (existingUser.rowCount > 0) {
        return res.status(409).json({
          success: false,
          message: "An account with this email already exists.",
        });
      }

      const passwordHash = await bcrypt.hash(password, 12);

      const result = await pool.query(
        `INSERT INTO users (full_name, email, password_hash, role)
       VALUES ($1, $2, $3, 'citizen')
       RETURNING id, full_name, email, role`,
        [fullName.trim(), normalizedEmail, passwordHash]
      );

      const user = result.rows[0];

      const token = jwt.sign(
        { id: user.id },
        process.env.JWT_SECRET,
        { expiresIn: "1h" }
      );

      return res.status(201).json({
        success: true,
        message: "Registration successful.",
        token,
        user,
      });
    } catch (error) {
      console.error("Registration error:", error.message);

      return res.status(500).json({
        success: false,
        message: "Unable to register your account.",
      });
    }
  });


// Login an existing user
app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required.",
      });
    }

    if (!process.env.JWT_SECRET) {
      throw new Error("JWT_SECRET is not configured.");
    }

    const normalizedEmail = email.trim().toLowerCase();

    const result = await pool.query(
      `SELECT id, full_name, email, password_hash, role, department_id, is_active
       FROM users
       WHERE email = $1`,
      [normalizedEmail]
    );

    if (result.rowCount === 0 || !result.rows[0].is_active) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password.",
      });
    }

    const user = result.rows[0];

    const passwordMatches = await bcrypt.compare(
      password,
      user.password_hash
    );

    if (!passwordMatches) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password.",
      });
    }

    const token = jwt.sign(
      { id: user.id },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );

    return res.status(200).json({
      success: true,
      message: "Login successful.",
      token,
      user: {
        id: user.id,
        full_name: user.full_name,
        email: user.email,
        role: user.role,
        department_id: user.department_id,
      },
    });
  } catch (error) {
    console.error("Login error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to log in.",
    });
  }
});

// Get the currently authenticated user's profile
app.get("/api/auth/me", authenticateToken, (req, res) => {
  return res.status(200).json({
    success: true,
    user: req.user,
  });
});

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "CivicSense backend is running!",
  });
});


app.get("/api/db-health", async (req, res) => {
  try {
    const result = await pool.query("SELECT NOW() AS current_time");

    res.json({
      success: true,
      message: "CivicSense database connected!",
      time: result.rows[0].current_time,
    });
  } catch (error) {
    console.error("Database connection failed:", error.message);
    res.status(500).json({
      success: false,
      message: "Database connection failed.",
    });
  }
});

app.get(
  "/api/issues",
  authenticateToken,
  async (req, res) => {
    try {
      const { status, category } = req.query;

      // Validate query parameters
      if (
        (status !== undefined && typeof status !== "string") ||
        (category !== undefined && typeof category !== "string")
      ) {
        return res.status(400).json({
          success: false,
          message: "Status and category must be single string values.",
        });
      }

      const statusFilter = status?.trim() || null;
      const categoryFilter = category?.trim() || null;

      const result = await pool.query(
        `
        SELECT
          i.id,
          i.title,
          i.description,
          i.category,
          i.address,
          i.latitude,
          i.longitude,
          i.image_url,
          i.priority,
          i.status,
          i.reported_by,
          i.created_at,
          i.updated_at,
          u.full_name AS reporter_name
        FROM issues i
        JOIN users u ON i.reported_by = u.id
        WHERE ($1::text IS NULL OR i.status = $1)
        AND (
        $2::text IS NULL
        OR LOWER(i.category) = LOWER($2)
      )
      AND (
    $3::text <> 'citizen'
    OR i.reported_by = $4
  )
        ORDER BY i.created_at DESC, i.id DESC
      `,
        [statusFilter, categoryFilter, req.user.role, req.user.id]
      );

      return res.status(200).json({
        success: true,
        count: result.rows.length,
        issues: result.rows,
      });
    } catch (error) {
      console.error("Fetching issues failed:", error.message);

      return res.status(500).json({
        success: false,
        message: "Unable to retrieve civic issues.",
      });
    }
  });

app.post(
  "/api/issues",
  authenticateToken,
  authorizeRoles("citizen"),
  async (req, res) => {
    const {
      title,
      description,
      category,
      address,
      latitude,
      longitude,
      imageUrl,
      priority = "medium",
    } = req.body;

    const allowedCategories = [
      "sanitation",
      "roads",
      "water_supply",
      "street_lighting",
      "drainage",
      "waste_management",
      "public_safety",
      "other",
    ];

    const allowedPriorities = ["low", "medium", "high", "urgent"];

    // Validate required fields
    if (
      typeof title !== "string" ||
      !title.trim() ||
      title.trim().length > 200 ||
      typeof description !== "string" ||
      !description.trim() ||
      typeof address !== "string" ||
      !address.trim()
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Valid title, description, and address are required.",
      });
    }

    if (!allowedCategories.includes(category)) {
      return res.status(400).json({
        success: false,
        message: "Invalid issue category.",
      });
    }

    if (!allowedPriorities.includes(priority)) {
      return res.status(400).json({
        success: false,
        message: "Invalid priority.",
      });
    }

    // Validate optional coordinates
    const validCoordinate = (value, min, max) =>
      value === undefined ||
      value === null ||
      (value !== "" &&
        Number.isFinite(Number(value)) &&
        Number(value) >= min &&
        Number(value) <= max);

    if (
      !validCoordinate(latitude, -90, 90) ||
      !validCoordinate(longitude, -180, 180)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid latitude or longitude.",
      });
    }

    try {
      const result = await pool.query(
        `INSERT INTO issues
        (title, description, category, address,
         latitude, longitude, image_url, priority, reported_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
        [
          title.trim(),
          description.trim(),
          category,
          address.trim(),
          latitude ?? null,
          longitude ?? null,
          imageUrl ?? null,
          priority,
          req.user.id,
        ]
      );

      return res.status(201).json({
        success: true,
        message: "Civic issue reported successfully.",
        issue: result.rows[0],
      });
    } catch (error) {
      console.error("Issue creation failed:", error.message);

      if (error.code === "23503") {
        return res.status(400).json({
          success: false,
          message: "The authenticated reporting user could not be found.",
        });
      }

      return res.status(500).json({
        success: false,
        message: "Unable to report the issue.",
      });
    }
  });

app.patch(
  "/api/issues/:id/status",
  authenticateToken,
  authorizeRoles("worker", "department_head", "admin"),
  async (req, res) => {
    const issueId = Number(req.params.id);
    const { status, note } = req.body;

    const allowedStatuses = [
      "submitted",
      "under_review",
      "assigned",
      "in_progress",
      "resolved",
      "rejected",
      "reopened",
    ];

    if (!Number.isSafeInteger(issueId) || issueId <= 0) {
      return res.status(400).json({
        success: false,
        message: "A valid issue ID is required.",
      });
    }

    if (
      typeof status !== "string" ||
      !allowedStatuses.includes(status)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid issue status.",
      });
    }

    if (
      note !== undefined &&
      note !== null &&
      typeof note !== "string"
    ) {
      return res.status(400).json({
        success: false,
        message: "The note must be a string.",
      });
    }

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const issueResult = await client.query(
        "SELECT id, status FROM issues WHERE id = $1 FOR UPDATE",
        [issueId]
      );

      if (issueResult.rowCount === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({
          success: false,
          message: "Issue not found.",
        });
      }

      const oldStatus = issueResult.rows[0].status;

      if (oldStatus === status) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          success: false,
          message: "The issue already has this status.",
        });
      }

      const updatedResult = await client.query(
        `UPDATE issues
       SET status = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
        [status, issueId]
      );

      await client.query(
        `INSERT INTO issue_status_history
         (issue_id, old_status, new_status, changed_by, note)
       VALUES ($1, $2, $3, $4, $5)`,
        [
          issueId,
          oldStatus,
          status,
          req.user.id,
          typeof note === "string" && note.trim()
            ? note.trim()
            : null,
        ]
      );

      await client.query("COMMIT");

      return res.status(200).json({
        success: true,
        message: "Issue status updated successfully.",
        issue: updatedResult.rows[0],
      });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => { });

      console.error("Updating issue status failed:", error.message);

      return res.status(500).json({
        success: false,
        message: "Unable to update issue status.",
      });
    } finally {
      client.release();
    }
  });

app.get(
  "/api/issues/:id/history",
  authenticateToken,
  async (req, res) => {
    const issueId = Number(req.params.id);

    if (!Number.isSafeInteger(issueId) || issueId <= 0) {
      return res.status(400).json({
        success: false,
        message: "A valid issue ID is required.",
      });
    }

    try {
      const issueResult = await pool.query(
        `SELECT id, reported_by
       FROM issues
       WHERE id = $1`,
        [issueId]
      );

      if (issueResult.rowCount === 0) {
        return res.status(404).json({
          success: false,
          message: "Issue not found.",
        });
      }

      if (
        req.user.role === "citizen" &&
        Number(issueResult.rows[0].reported_by) !== Number(req.user.id)
      ) {
        return res.status(403).json({
          success: false,
          message: "You do not have permission to view this issue history.",
        });
      }

      const historyResult = await pool.query(
        `SELECT
         h.id,
         h.issue_id,
         h.old_status,
         h.new_status,
         h.changed_by,
         u.full_name AS changed_by_name,
         h.note,
         h.changed_at
       FROM issue_status_history h
       JOIN users u ON h.changed_by = u.id
       WHERE h.issue_id = $1
       ORDER BY h.changed_at ASC, h.id ASC`,
        [issueId]
      );

      return res.status(200).json({
        success: true,
        count: historyResult.rows.length,
        history: historyResult.rows,
      });
    } catch (error) {
      console.error("Fetching issue history failed:", error.message);

      return res.status(500).json({
        success: false,
        message: "Unable to retrieve issue status history.",
      });
    }
  });

app.listen(PORT, () => {
  console.log(`CivicSense server running at http://localhost:${PORT}`);
});