import express from "express";
import db from "../utils/connect-mysql.js";

const router = express.Router();

const getGYMFriendList = async (req) => {
    const member_id = req.my_jwt?.id;
    const output = {
        success: false,
        redirect: undefined, 
        perPage: 12,
        totalRows: 0,
        totalPages: 0,
        page: 0,
        rows: [],
        gender: "",
        category: "",
    };

    const perPage = output.perPage;
    let page = +req.query.page || 1;
    let gender = req.query.gender;
    let category = req.query.category;
    let where = ` WHERE status = 1 `;
    if (!member_id) {
        output.error = "需要登入會員";
        return output;
    }
    if (category) {
        output.category = category;
        let category_ = db.escape(category);
        where += ` AND  FIND_IN_SET(${category_}, goal)`;
    }
    if (gender) {
        output.gender = gender;
        let gender_ = db.escape(gender);
        where += ` AND member_profile.sex = ${gender_} `;
    }

    if (page < 1) {
        output.redirect = `?page=1`;
        return output;
    }
    try {
        // 獲取總筆數
        const t_sql = `SELECT count(*) AS totalRows FROM member LEFT JOIN member_profile ON member.member_id = member_profile.member_id  ${where}; `;
        const [[{ totalRows }]] = await db.query(t_sql); // 取得總筆數

        // 計算總頁數
        const totalPages = Math.ceil(totalRows / perPage);

        if (page > totalPages) {
            output.redirect = `?page=${totalPages}`;
            return output;
        }

        let rows = [];
        if (totalRows > 0) {
            // 確保頁碼不超過總頁數
            if (page > totalPages) {
                output.redirect = `?page=${totalPages}`;
                return output;
            }
            let sql = `SELECT member.name, member_profile.*  FROM member LEFT JOIN member_profile ON member.member_id = member_profile.member_id  ${where}; `;
            [rows] = await db.query(sql);
        }
        return { ...output, totalRows, totalPages, page, rows, success: true };
    } catch (err) {
        console.error("Error occurred while fetching article list:", err);
        output.error = "資料加載失敗，請稍後再試。";
        return output;
    }
};

// 取得GYM友列表
router.get("/api", async (req, res) => {
    const data = await getGYMFriendList(req);
    res.json(data);
});

export default router;
