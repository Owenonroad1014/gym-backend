import express from "express";
import moment from "moment-timezone";
import fs from "node:fs/promises";
import { z } from "zod";
import db from "./../utils/connect-mysql.js";
import upload from "./../utils/upload-images.js";


const coachesRouter = express.Router();
const dateFormat = "YYYY-MM-DD";


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
    };

    // 取得查詢參數
    const {location, branch} = req.query;
    
    let where = ' WHERE 1 ';
    if(location) {
        where += ` AND location = ${db.escape(location)}`;
    }
    if(branch) {
        where += ` AND branch = ${db.escape(branch)}`;
    }

    // 查詢總筆數
    const [[{ totalRows }]] = await db.query(
        `SELECT COUNT(1) totalRows FROM coaches ${where}`
    );
    
    if(totalRows > 0) {
        // 有資料時，取得分頁資料
        const totalPages = Math.ceil(totalRows/output.perPage);
        const page = parseInt(req.query.page) || 1;
        const limitStart = (page - 1) * output.perPage;
        
        const [rows] = await db.query(
            `SELECT * FROM coaches ${where} LIMIT ${limitStart}, ${output.perPage}`
        );
        
        output.success = true;
        output.totalPages = totalPages;
        output.page = page;
        output.rows = rows;
    }
    
    return output;
};


const getCoachDetail = async (id) => {
    // 先取得基本資料和社交媒體
    const [rows] = await db.query(`
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
    `, [id]);

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
            certifications
        }
    };
};



// GET / coaches
coachesRouter.get("/api", async (req, res) => {
 const data = await getListData(req);
  res.json(data);
});

// GET /coaches/:id
coachesRouter.get("/api/:id", async (req, res) => {
  const data = await getCoachDetail(req.params.id);
  res.json(data);
}
);


export default coachesRouter;