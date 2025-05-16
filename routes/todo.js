import express from "express";
import fs from "node:fs/promises";
import db from "../utils/connect-mysql.js";

const router = express.Router();

// GET /api/todo
router.get("/api", async (req, res) => {
  const output = {
    success: false,
    perPage: 30,
    totalRows: 0,
    totalPages: 0,
    page: 0,
    rows: [],
    keyword: "",
    error: "",
  };
  try {
    const [rows] = await db.query("SELECT * FROM todos");
    if (rows.length > 0) {
      output.success = true;
      output.totalRows = rows.length;
      output.rows = rows;
    } else {
      output.error = "目前沒有資料";
    }
    res.json(output);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "伺服器錯誤" });
  }
});

export default router;
