import express from "express";
import moment from "moment-timezone";
import fs from "node:fs/promises";
import { z } from "zod";
import db from "./../utils/connect-mysql.js";
import upload from "./../utils/upload-images.js";

const coachesRouter = express.Router();
const dateFormat = "YYYY-MM-DD";

// 取得教練列表資料
const getListData = async (req) => {
  const output = {
    success: false,
    redirect: undefined,
    perPage: 30,
    totalRows: 0,
    totalPages: 0,
    page: 0,
    rows: [],
    keyword: "",
    error: "",
  };

  try {
    // 取得查詢參數
    const { location, branch, keyword, page = 1 } = req.query;
    let sql = `
      SELECT c.*, l.location, l.branch,
        COUNT(*) OVER() as total_count 
      FROM coaches c
      JOIN locations l ON c.location_id = l.id
      WHERE 1=1
    `;
    const values = [];

    // 動態加入查詢條件
    if (location) {
      sql += ' AND l.location = ?';
      values.push(location);
    }
    if (branch) {
      sql += ' AND l.branch = ?';
      values.push(branch);
    }
    if (keyword) {
      sql += ' AND (c.name LIKE ? OR c.skill LIKE ?)';
      values.push(`%${keyword}%`, `%${keyword}%`);
    }

    // 加入分頁
    const limitStart = (page - 1) * output.perPage;
    sql += ` ORDER BY c.created_at DESC LIMIT ? OFFSET ?`;
    values.push(output.perPage, limitStart);

    // 執行查詢
    const [rows] = await db.query(sql, values);

    if (rows.length > 0) {
      const totalRows = parseInt(rows[0].total_count);
      output.success = true;
      output.totalRows = totalRows;
      output.totalPages = Math.ceil(totalRows / output.perPage);
      output.page = parseInt(page);
      output.rows = rows.map(({total_count, ...row}) => row);
      output.keyword = keyword || "";
    }
    // 檢查是否有符合查詢條件的教練
    if (output.totalRows === 0) {
      output.error = "沒有教練資料";
    }

    return output;

  } catch (error) {
    console.error('Error in getListData:', error);
    output.success = false;
    return output;
  }
};



const getCoachDetail = async (id) => {
  // 先取得基本資料和社交媒體
  const [rows] = await db.query(
    `
        SELECT c.*, 
            GROUP_CONCAT(DISTINCT JSON_OBJECT(
                'platform', sm.platform,
                'url', sm.url
            )) as socialMedia,
            GROUP_CONCAT(DISTINCT JSON_OBJECT(
                'certification', ce.certification
            )) as certifications
        FROM coaches c
        LEFT JOIN coach_social_media sm ON c.id = sm.coach_id
        LEFT JOIN coach_certifications ce ON c.id = ce.coach_id
        WHERE c.id = ?
        GROUP BY c.id
    `,
    [id]
  );

  if (!rows || rows.length === 0) {
    return null;
  }

  // 解析 GROUP_CONCAT 的結果
  const socialMedia = JSON.parse(`[${rows[0].socialMedia}]`);
  const certifications = JSON.parse(`[${rows[0].certifications}]`);

  return {
    success: true,
    data: {
      ...rows[0],
      socialMedia,
      certifications,
    },
  };
};

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
    const coachId = req.params.id;

    // 查詢總筆數
    const [[{ totalRows }]] = await db.query(
      `SELECT COUNT(1) totalRows 
         FROM classes 
         WHERE coach_id = ?`,
      [coachId]
    );

    if (totalRows > 0) {
      const totalPages = Math.ceil(totalRows / output.perPage);
      const page = parseInt(req.query.page) || 1;
      const limitStart = (page - 1) * output.perPage;

      const [rows] = await db.query(
        `SELECT 
            classes.*,
            coaches.name as coach_name,
            locations.location,
            locations.branch,
            class_types.type_name as title,
            DATE_FORMAT(class_date, '%Y-%m-%d') as class_date,
            TIME_FORMAT(start_time, '%H:%i') as start_time,
            TIME_FORMAT(end_time, '%H:%i') as end_time
            FROM classes 
            LEFT JOIN coaches ON classes.coach_id = coaches.id
            LEFT JOIN class_types ON classes.type_id = class_types.id
            LEFT JOIN locations ON classes.location_id = locations.id
            WHERE classes.coach_id = ?
            GROUP BY classes.id
            ORDER BY classes.class_date ASC, classes.start_time ASC
            LIMIT ?, ?`,
        [coachId, limitStart, output.perPage]
      );

      output.success = true;
      output.totalRows = totalRows;
      output.totalPages = totalPages;
      output.page = page;
      output.rows = rows;
    }

    return output;
  } catch (error) {
    console.error("取得課程資料失敗:", error);
    return {
      ...output,
      error: "取得課程資料失敗",
    };
  }
};

// // GET / coaches
coachesRouter.get("/api", async (req, res) => {
  const data = await getListData(req);
  res.json(data);
});

// GET /coaches/:id
coachesRouter.get("/api/:id", async (req, res) => {
  const data = await getCoachDetail(req.params.id);
  res.json(data);
});

// GET /coaches/:id/classes
coachesRouter.get("/api/:id/classes", async (req, res) => {
    if(!req.params?.id){
        return res.json({
            success:false,
            error:"未提供教練ID",
        })
    }
  const data = await getCalendarData(req);
  res.json(data);
});

export default coachesRouter;
