
const express = require("express");
const cors = require("cors");
const pool = require("./db");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

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


app.get("/api/issues", async (req, res) => {
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
        ORDER BY i.created_at DESC, i.id DESC
      `,
      [statusFilter, categoryFilter]
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

app.post("/api/issues", async (req, res) => {
  const {
    title,
    description,
    category,
    address,
    reportedBy,
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
    !address.trim() ||
    !Number.isSafeInteger(Number(reportedBy)) ||
    Number(reportedBy) <= 0
  ) {
    return res.status(400).json({
      success: false,
      message:
        "Valid title, description, address, and reportedBy are required.",
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
        Number(reportedBy),
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
        message: "The specified reporting user does not exist.",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Unable to report the issue.",
    });
  }
});

app.patch("/api/issues/:id/status", async (req, res) => {
  const issueId = Number(req.params.id);
  const { status, changedBy, note } = req.body;

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

  if (!Number.isSafeInteger(Number(changedBy)) || Number(changedBy) <= 0) {
    return res.status(400).json({
      success: false,
      message: "A valid changedBy user ID is required.",
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

    const userResult = await client.query(
      "SELECT id FROM users WHERE id = $1",
      [Number(changedBy)]
    );

    if (userResult.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        message: "The specified user does not exist.",
      });
    }

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
        Number(changedBy),
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
    await client.query("ROLLBACK").catch(() => {});

    console.error("Updating issue status failed:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to update issue status.",
    });
  } finally {
    client.release();
  }
});

app.get("/api/issues/:id/history", async (req, res) => {
  const issueId = Number(req.params.id);

  if (!Number.isSafeInteger(issueId) || issueId <= 0) {
    return res.status(400).json({
      success: false,
      message: "A valid issue ID is required.",
    });
  }

  try {
    const issueResult = await pool.query(
      "SELECT id FROM issues WHERE id = $1",
      [issueId]
    );

    if (issueResult.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Issue not found.",
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