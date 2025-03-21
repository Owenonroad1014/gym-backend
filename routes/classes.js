import express from "express";
import db from "./../utils/connect-mysql.js";
import moment from "moment-timezone";

const classesRouter = express.Router();
const dateFormat = "YYYY-MM-DD";

const getCalendarData = async (req) => {
  const output = {
    success: false,
    perPage: 30,
    totalRows: 0,
    totalPages: 0,
    page: 0,
    rows: [],
  };

  try {
    const { location, branch, page = 1 } = req.query;
    let sql = `
      SELECT COUNT(1) totalRows 
      FROM classes c
      JOIN locations l ON c.location_id = l.id
      WHERE 1=1
    `;
    const values = [];

    if (location) {
      sql += ' AND l.location = ?';
      values.push(location);
    }
    if (branch) {
      sql += ' AND l.branch = ?';
      values.push(branch);
    }

    const [[{ totalRows }]] = await db.query(sql, values);

    if (totalRows > 0) {
      const totalPages = Math.ceil(totalRows / output.perPage);
      const limitStart = (page - 1) * output.perPage;

      const query = `
        SELECT 
          c.*,
          co.name as coach_name,
          ct.type_name as title,
          l.location,
          l.branch,
          DATE_FORMAT(c.class_date, '%Y-%m-%d') as class_date,
          TIME_FORMAT(c.start_time, '%H:%i') as start_time,
          TIME_FORMAT(c.end_time, '%H:%i') as end_time
        FROM classes c
        JOIN locations l ON c.location_id = l.id
        LEFT JOIN coaches co ON c.coach_id = co.id
        LEFT JOIN class_types ct ON c.type_id = ct.id
        WHERE 1=1
        ${location ? ' AND l.location = ?' : ''}
        ${branch ? ' AND l.branch = ?' : ''}
        ORDER BY c.class_date ASC, c.start_time ASC
        LIMIT ?, ?
      `;

      const queryValues = [
        ...(location ? [location] : []),
        ...(branch ? [branch] : []),
        limitStart,
        output.perPage
      ];

      const [rows] = await db.query(query, queryValues);

      output.success = true;
      output.totalRows = totalRows;
      output.totalPages = totalPages;
      output.page = parseInt(page);
      output.rows = rows;
    }

    return output;

  } catch (error) {
    console.error('Error in getCalendarData:', error);
    return output;
  }
};



classesRouter.post("/api/reservations", async (req, res) => {
  try {
    let { member_id, class_id, coach_id, reservation_date, reservation_time } = req.body;
    const output = {
      success: false,
      code: 0,
      data: "",
      error: "",
    }
    
    // 先檢查課程是否存在
    const [classData] = await db.query(
      'SELECT current_capacity, max_capacity FROM classes WHERE id = ?',
      [class_id]
    );
    
    if (!classData || classData.length === 0) {
      output.error = "課程不存在";
      output.code = 401;
      return res.json(output);
    }
    const classInfo = classData[0];
    // 檢查課程容量
    if (classInfo.current_capacity >= classInfo.max_capacity) {
      output.error = "課程已滿";
      output.code = 402;
      return res.json(output);
    }
    
    // 檢查重複預約
    const [existingReservation] = await db.query(
      'SELECT * FROM reservations WHERE member_id = ? AND class_id = ? AND status != "cancelled"',
      [member_id, class_id]
    );
    
    if (existingReservation.length > 0) {
      output.error = "已預約過此課程";
      output.code = 400;
      return res.status(400).json(output);
    }
  
    // reservation_date format 格式轉換
    reservation_date = moment(reservation_date, dateFormat, true).isValid()
  ? moment(reservation_date).format(dateFormat)
  : null;

    
    // 新增預約
     const [result] = await db.query(
      'INSERT INTO reservations (member_id, class_id, coach_id, reservation_date, reservation_time) VALUES (?, ?, ?, ?, ?)',
      [member_id, class_id, coach_id, reservation_date, reservation_time]
    );
        output.success = !!result.affectedRows;
        output.data = { member_id, class_id, coach_id, reservation_date, reservation_time };
        res.json(output);

    // 更新課程人數
    await db.query(
      'UPDATE classes SET current_capacity = current_capacity + 1 WHERE id =?',
      [class_id]
    );
    
   
  } catch (err) {
    console.error("API 發生錯誤:", err);
    res.status(500).json({ success: false, error: "伺服器錯誤", details: err.message });
  }
  
  });

// GET / classes / api / : class_id
classesRouter.get("/api/:id", async (req, res) => {
  try {
    const classId = req.params.id;
    const [classData] = await db.query(
      'SELECT current_capacity, max_capacity FROM classes WHERE id = ?',
      [classId]
    );
    
    res.json(classData[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// // GET / classes / api
classesRouter.get("/api", async (req, res) => {
  const data = await getCalendarData(req);
  res.json(data);
});










export default classesRouter;
