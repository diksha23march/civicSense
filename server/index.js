
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
    const result = await pool.query(`
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
      ORDER BY i.created_at DESC, i.id DESC
    `);

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

app.listen(PORT, () => {
  console.log(`CivicSense server running at http://localhost:${PORT}`);
});