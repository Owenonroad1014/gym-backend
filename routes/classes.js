import express from "express";
import db from "./../utils/connect-mysql.js";

const classesRouter = express.Router();

const getCalendarData = async (req) => {
  const output = {
    success: false,
    perPage: 30,
    totalRows: 0,
    totalPages: 0,
    page: 0,
    rows: [],
  };

  const { location, branch } = req.query;

  let where = " WHERE 1 ";
  if (location) {
    where += ` AND classes.location = ${db.escape(location)}`;
  }
  if (branch) {
    where += ` AND classes.branch = ${db.escape(branch)}`;
  }
  const [[{ totalRows }]] = await db.query(
    `SELECT COUNT(1) totalRows FROM classes ${where}`
  );
  if (totalRows > 0) {
    // 有資料時，取得分頁資料
    const totalPages = Math.ceil(totalRows / output.perPage);
    const page = parseInt(req.query.page) || 1;
    const limitStart = (page - 1) * output.perPage;

    const [rows] = await db.query(
      `SELECT 
    classes.*,
    coaches.name as coach_name,
    class_types.type_name as title,
    DATE_FORMAT(class_date, '%Y-%m-%d') as class_date,
    TIME_FORMAT(start_time, '%H:%i') as start_time,
    TIME_FORMAT(end_time, '%H:%i') as end_time
    FROM classes 
    LEFT JOIN coaches ON classes.coach_id = coaches.id
    LEFT JOIN class_types ON classes.type_id = class_types.id
    ${where}
    LIMIT ${limitStart}, ${output.perPage}`
    );

    output.success = true;
    output.totalRows = totalRows;
    output.totalPages = totalPages;
    output.page = page;
    output.rows = rows;
  }
  return output;
};

// GET / classes / api
classesRouter.get("/api", async (req, res) => {
  const data = await getCalendarData(req);
  res.json(data);
});

export default classesRouter;
