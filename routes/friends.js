import express from "express";
import db from "../utils/connect-mysql.js";

const router = express.Router();


const getFriendList = async (req) => {
    const member_id = req.my_jwt?.id;
    const output = {
        success: false,
        redirect: undefined,
        perPage: 12,
        totalRows: 0,
        totalPages: 0,
        page: 0,
        rows: [],
        keyword: "",
    };
    const perPage = output.perPage;
    let page = +req.query.page || 1;
    let keyword = req.query.keyword ? req.query.keyword.trim() : "";
    try {
        if (!member_id) {
            output.error = "需要登入會員";
            return output;
        }
        // 獲取總筆數
        const t_sql = `SELECT count(*)  AS totalRows FROM friendships WHERE user1_id=? OR user2_id=?`;
        const [[{ totalRows }]] = await db.query(t_sql, [member_id, member_id]); // 取得總筆數

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
            // 獲取文章列表並檢查是否有收藏的資訊
            const sql = `
                SELECT 
                    sub.*, 
                    m1.name AS user1_name, 
                    m2.name AS user2_name
                FROM 
                    (SELECT * 
                    FROM members 
                    LEFT JOIN friendships 
                    ON members.id = friendships.user1_id 
                    OR members.id = friendships.user2_id 
                    WHERE members.id = ?) AS sub
                LEFT JOIN members AS m1 
                ON sub.user1_id = m1.id
                LEFT JOIN members AS m2 
                ON sub.user2_id = m2.id;
            `;
            [rows] = await db.query(sql, [member_id]);
        }

        return { ...output, totalRows, totalPages, page, rows, success: true };
    } catch (err) {
        console.error("Error occurred while fetching article list:", err);
        output.error = "資料加載失敗，請稍後再試。";
        return output;
    }
};

// 取得好友列表
router.get("/api", async (req, res) => {
    const data = await getFriendList(req);
    res.json(data);
});

// 刪除好友列表

// 取得好友邀請列表
router.get("/api/invite", async (req, res) => {
    const member_id = req.my_jwt?.id;
    const output = {
        success: false,
        data: "",
        error: "",
    };
    if (!member_id) {
        output.error = "需要登入會員";
    }
    const sql = `SELECT * FROM friend_requests WHERE receiver_id=? AND status="pending"`;
    const [data] = await db.query(sql, [member_id]);
    if (!data.length) {
        output.error = "沒有好友邀請";
        return res.json(output);
    }
    output.success = true;
    output.data = data;
    res.json(output);
});

// 發送好友邀請api
router.post("/api/request", async (req, res) => {
    const member_id = req.my_jwt?.id;
    const { receiver_id } = req.body;
    const output = {
        success: false,
        data: "",
        error: "",
    };
    //  登入
    if (!member_id) {
        output.error = "需要登入會員";
        return res.json(output);
    }
    // 被邀請者
    if (!receiver_id) {
        output.error = "未提供接收者 ID";
        return res.json(output);
    }
    // 2. 有沒有這個項目
    const sql = `SELECT * FROM  friend_requests WHERE sender_id=? AND receiver_id =?`;
    const [rows] = await db.query(sql, [member_id, receiver_id]);
    if (rows.length) {
        output.error = "已發送過請求";
        return res.json(output);
    }
    const sqlAdd = `INSERT INTO friend_requests (sender_id, receiver_id, status)
    VALUES (?, ?, 'pending');`;
    try {
        const [result] = await db.query(sqlAdd, [member_id, receiver_id]);
        output.success = !!result.affectedRows;
        output.data = { sender_id: member_id, receiver_id, status: "pending" };
        res.json(output);
    } catch (err) {
        output.error = "data錯誤";
        res.json(output);
    }
});

// 接受好友邀請api
router.post("/api/accept", async (req, res) => {
    const member_id = req.my_jwt?.id;
    const { receiver_id } = req.body;
    const output = {
        success: false,
        data: "",
        error: "",
    };
    //  登入
    if (!member_id) {
        output.error = "需要登入會員";
        return res.json(output);
    }
    // 被邀請者
    // if (!receiver_id) {
    //     output.error = "未提供接收者 ID";
    //     return res.json(output);
    // }
    // 2. 有沒有這個項目
    const sql = `SELECT * FROM  friend_requests WHERE receiver_id =?`;
    const [rows] = await db.query(sql, [member_id]);
    if (!rows.length) {
        output.error = "目前沒有邀請";
        return res.json(output);
    }
    const sqlUpdate = `UPDATE friend_requests
                        SET status = 'accepted'
                        WHERE sender_id = ? AND receiver_id = ? AND status = 'pending';
                        `;
    try {
        const [result] = await db.query(sqlUpdate, [member_id, receiver_id]);
        output.success = !!result.affectedRows;
        output.data = { sender_id: member_id, receiver_id, status: "pending" };
        res.json(output);
    } catch (err) {
        output.error = "data錯誤";
        res.json(output);
    }
});

export default router;
