import express from "express";
import db from "../utils/connect-mysql.js";
const router = express.Router();

const getChatsList = async (req) => {
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
        const t_sql = `SELECT count(*)  AS totalRows FROM chats WHERE user1_id=? OR user2_id=?`;
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
            // 獲取聊天室
            const sql = `SELECT chats.*,m1.name user1_name ,m2.name user2_name FROM chats  left join members m1 on user1_id =  m1.id  left join members m2 on user2_id =  m2.id WHERE user1_id=? OR user2_id=? ;`;
            [rows] = await db.query(sql, [member_id, member_id]);
        }

        return { ...output, totalRows, totalPages, page, rows, success: true };
    } catch (err) {
        console.error("Error occurred while fetching chats list:", err);
        output.error = "資料加載失敗，請稍後再試。";
        return output;
    }
};

// 獲取聊天室
router.get("/api", async (req, res) => {
    const data = await getChatsList(req);
    res.json(data);
});
// 獲取聊天室單一數據
router.get("/api/:chatroomid", async (req, res) => {
    const chatroomid = req.params.chatroomid;
    const output = {
        success: false,
        data: [],
        error: "",
    };
    try {
        const sql = `SELECT chats.*, m1.name user1_name ,m2.name user2_name  FROM chats LEFT JOIN members m1 ON user1_id =m1.id LEFT JOIN members m2 ON user2_id =m2.id WHERE chats.id = ?;`;
        const [result] = await db.query(sql, [chatroomid]);
        output.data = result;
        output.success = true;
        return res.json(output);
    } catch (err) {
        console.error("Error occurred:", err);
        return res.json(output);
    }
});

// 創建聊天室

// 獲取聊天內容
router.get("/api/chatroom/:chatroomid", async (req, res) => {
    
    const chatroomid = req.params.chatroomid;
    const output = {
        success: false,
        data: [],
        error: "",
    };
    try {
        const sql = `SELECT * FROM chats WHERE id = ?`;
        const [chatroom] = await db.query(sql, [chatroomid]);

        if (chatroom.length <= 0) {
            output.error("聊天室不存在");
            return res.json(output);
        }
        const msgsql = `SELECT messages.*, members.name sender_name FROM messages LEFT JOIN members ON sender_id = members.id  WHERE chat_id = ? ORDER BY created_at ;`;
        const [result] = await db.query(msgsql, [chatroomid]);
        output.data = result;
        output.success = true;
        return res.json(output);
    } catch (err) {
        console.error("Error occurred:", err);
        return res.json(output);
    }
});

export default router;
