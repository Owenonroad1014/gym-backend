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
            const sql = ` SELECT 
                    chats.*, 
                    m1.name AS user1_name, 
                    m2.name AS user2_name,
                    (SELECT COUNT(*) FROM messages WHERE chat_id = chats.id AND sender_id != ? AND is_read = FALSE) AS unread_count
                FROM 
                    chats
                LEFT JOIN 
                    member m1 ON user1_id = m1.member_id
                LEFT JOIN 
                    member m2 ON user2_id = m2.member_id
                WHERE 
                    user1_id = ? OR user2_id = ?
                ;`;
            [rows] = await db.query(sql, [member_id, member_id,member_id]);
            
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
    const chatroomid = parseInt(req.params.chatroomid);
    const output = {
        success: false,
        data: [],
        error: "",
    };
    try {
        const sql = `SELECT chats.*, m1.name user1_name ,m2.name user2_name  FROM chats LEFT JOIN member m1 ON user1_id =m1.member_id LEFT JOIN member m2 ON user2_id =m2.member_id WHERE chats.id = ?;`;
        const [result] = await db.query(sql, [chatroomid]);
        output.data = result;
        output.success = true;
        return res.json(output);
    } catch (err) {
        console.error("Error occurred:", err);
        return res.json(output);
    }
});

// 刪除聊天室
router.post("/api/deleteChatroom", async (req, res) => {
    const { chat_id } = req.body;
    const member_id = req.my_jwt?.id;
    const output = {
        success: false,
        data: [],
        error: "",
    };
    if (!member_id) {
        output.error = "用戶未登入";
        return res.json(output);
    }

    try {
        const sqlensure = `SELECT * FROM chats WHERE id = ? AND (user1_id = ? OR user2_id = ?)`;
        const [ensure] = await db.query(sqlensure, [
            chat_id,
            member_id,
            member_id,
        ]);
        if (ensure.length <= 0) {
            output.error = "聊天室不存在或用戶無權操作";
        }
        const deleteColumn =
            ensure[0].user1_id === member_id ? "user1_delete" : "user2_delete";

        const sql = `UPDATE chats SET ${deleteColumn}=1  WHERE id = ?`;
        const [result] = await db.query(sql, [chat_id]);

        if (result.affectedRows > 0) {
            output.success = true;
            output.data = result;
            output.message = "刪除聊天室成功";
            return res.json(output);
        } else {
            output.error = "刪除聊天室失敗";
            return res.json(output);
        }
    } catch (err) {
        console.error(err);
        output.error = "資料加載失敗，請稍後再試。";
        return res.json(output);
    }
});

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
        const msgsql = `SELECT messages.*, member.name sender_name FROM messages LEFT JOIN member ON sender_id = member.member_id  WHERE chat_id = ? ORDER BY created_at LIMIT 30 ;`;
        const [result] = await db.query(msgsql, [chatroomid]);
        output.data = result;
        output.success = true;
        return res.json(output);
    } catch (err) {
        console.error("Error occurred:", err);
        return res.json(output);
    }
});
// 創建聊天內容
router.post("/api/sendMsg", async (req, res) => {
    const output = {
        success: false,
        data: [],
        error: "",
    };
    const { chat_id, message } = req.body;
    const member_id = req.my_jwt?.id;

    if (!member_id) {
        output.error = "用戶未登入";
        return res.json(output);
    }

    if (!chat_id || !message) {
        output.error = "聊天室 ID 和訊息內容是必須的";
        return res.json(output);
    }

    try {
        // 將訊息插入到 messages 表中
        const sql = `INSERT INTO messages (chat_id, sender_id, message) VALUES (?, ?, ?)`;
        const [result] = await db.query(sql, [chat_id, member_id, message]);

        if (result.affectedRows > 0) {
            output.success = true;
            output.data = { chat_id, sender_id: member_id, message };
            output.message = "訊息發送成功";
            return res.json(output);
        } else {
            output.error = "訊息發送失敗";
            return res.json(output);
        }
    } catch (err) {
        output.error = "內部伺服器錯誤";
        return res.json(output);
    }
});

// 已讀訊息
router.post("/api/readMsg", async (req, res) => {
    const output = {
        success: false,
        data: [],
        error: "",
    };
    const { chat_id } = req.body;
    const member_id = req.my_jwt?.id;

    if (!member_id) {
        output.error = "用戶未登入";
        return res.json(output);
    }

    try {
        // 確認聊天訊息和聊天室
        const sqlchat = `SELECT  messages.id FROM messages left join chats on messages.chat_id  = chats.id where chat_id =? AND sender_id != ? AND messages.is_read = FALSE ;`;
        const [messages] = await db.query(sqlchat, [chat_id,member_id]);
        if (messages.length <= 0) {
            output.error = "訊息不存在";
            return res.json(output);
        }
        const messageIds = messages.map(msg => msg.id);
        // 將更新已讀訊息
        const sql = `UPDATE messages SET is_read = TRUE WHERE id IN (?);`;
        const [result] = await db.query(sql,[messageIds]);

        if (result.affectedRows > 0) {
            output.success = true;
            output.data = result;
            output.message = "已讀訊息成功";
            return res.json(output);
        } else {
            output.error = "已讀訊息失敗";
            return res.json(output);
        }
    } catch (err) {
        output.error = "內部伺服器錯誤";
        return res.json(output);
    }
});
export default router;
