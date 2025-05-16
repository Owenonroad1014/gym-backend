import express from "express";

import db from "../utils/connect-mysql.js";

const router = express.Router();

// POST /api/todo
router.post("/api", async (req, res) => {
    const output = {
      success: false,
      error: "",
    };
    const { task } = req.body;
    
    if (!task) {
      output.error = "請輸入代辦事項";
      return res.status(400).json(output);
    }
    try {
        const [result] = await db.query("INSERT INTO todos (task) VALUES (?)", [
            task,
        ]);
        if (result.affectedRows) {
            output.success = true;
            output.task = task;
        } else {
            output.error = "新增失敗";
        }

       return res.json(output);
    }catch (error) {
    console.error(error);
    res.status(500).json({ error: "伺服器錯誤" });
  }
});

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
    return res.json(output);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "伺服器錯誤" });
  }
});

// DELETE /api/todo/:id
router.delete("/api/:id", async (req, res) => {
  const output = {
    success: false,
    error: "",
  };
  const { id } = req.params;
  try {
    const [result] = await db.query("DELETE FROM todos WHERE id=?", [id]);
    if (result.affectedRows) {
      output.success = true;
    } else {
      output.error = "刪除失敗";
    }
    return res.json(output);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "伺服器錯誤" });
  }
  
})

// PUT /api/todo/:id
router.put("/api/:id", async (req, res) => {
  const output = {
    success: false,
    error: "",
  };
  const { id } = req.params;
  const { is_completed } = req.body;
  try {
   const [result] = await db.query("UPDATE todos SET is_completed=? WHERE id=?", [
      is_completed,
      id,
    ]);
    if (result.affectedRows) {
      output.success = true;
    } else {
      output.error = "更新失敗";
    }
    return res.json(output);
  }catch (error) {
    console.error(error);
    res.status(500).json({ error: "伺服器錯誤" });
  }
})



export default router;
