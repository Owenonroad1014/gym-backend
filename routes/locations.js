import express from "express";
import db from "./../utils/connect-mysql.js";


const locationsRouter = express.Router();


const getLocationData = async (req) => {
  const output = {
    success: false,
    rows: [],
  };

  try {
    // 從 locations 資料表查詢
    const [rows] = await db.query(`
      SELECT *
      FROM locations
    `);

    output.success = true;
    output.rows = rows;
    
    return output;

  } catch (error) {
    console.error('獲取位置資料失敗:', error);
    return {
      ...output,
      error: '獲取位置資料失敗'
    };
  }
};



// GET / classes / api / : class_id
// classesRouter.get("/api", async (req, res) => {
//   try {
//     const classId = req.params.id;
//     const [classData] = await db.query(
//       'SELECT current_capacity, max_capacity FROM classes WHERE id = ?',
//       [classId]
//     );
    
//     res.json(classData[0]);
//   } catch (error) {
//     res.status(500).json({ error: error.message });
//   }
// });

// GET / classes / api
locationsRouter.get("/api", async (req, res) => {
  const data = await getLocationData(req);
  res.json(data);
});










export default locationsRouter;
