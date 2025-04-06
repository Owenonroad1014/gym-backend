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
            const sql = `
                SELECT 
                    sub.member_id, 
                    sub.user1_id, 
                    sub.user2_id, 
                    sub.user1_delete,
                    sub.user2_delete,
                    m1.name AS user1_name, 
                    m2.name AS user2_name
                FROM 
                    (SELECT member_id, user1_id, user2_id,friendships.user1_delete,friendships.user2_delete
                    FROM member
                    LEFT JOIN friendships 
                    ON member.member_id = friendships.user1_id 
                    OR member.member_id = friendships.user2_id 
                    WHERE member.member_id = ?) AS sub
                LEFT JOIN member AS m1 
                ON sub.user1_id = m1.member_id
                LEFT JOIN member AS m2 
                ON sub.user2_id = m2.member_id;
            `;
            [rows] = await db.query(sql, [member_id]);
        }

        return { ...output, totalRows, totalPages, page, rows, success: true };
    } catch (err) {
        console.error("Error occurred while fetching friend list:", err);
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
router.post("/api/delete", async (req, res) => {
    const member_id = req.my_jwt?.id;
    const { user } = req.body;
    const output = {
        success: false,
        data: [],
        error: "",
    };
    //  登入
    if (!member_id) {
        output.error = "需要登入會員";
        return res.json(output);
    }
    // 好友
    if (!user) {
        output.error = "沒有此好友";
        return res.json(output);
    }
    const sqlensure = `SELECT * FROM friendships WHERE (user1_id = ? AND user2_id = ?) OR (user1_id = ? AND user2_id =?);`;
    const [ensure] = await db.query(sqlensure, [
        member_id,
        user,
        user,
        member_id,
    ]);
    if(ensure.length <= 0){
        output.error = "沒有此好友";
        return res.json(output);
    }
    const updateColumn =
            ensure[0].user1_id === member_id ? "user1_delete" : "user2_delete";
    const sqlUpdate = `UPDATE friendships SET  ${updateColumn}=1  WHERE (user1_id = ? AND user2_id = ?) OR (user1_id = ? AND user2_id =?);`
    try {
        const [result] = await db.query(sqlUpdate, [
            member_id,
            user,
            user,
            member_id,
        ]);
        if (result.affectedRows > 0) {
            output.success = true;
            output.data = result;
            output.status = "成功刪除";
            // 確認是否有聊天室
            const sqlensure = `SELECT * FROM chats WHERE (user1_id = ? AND user2_id = ?)OR(user1_id = ? AND user2_id = ?);`;
            const [ensure] = await db.query(sqlensure, [
                member_id,
                user,
                user,
                member_id,
            ]);

            if (ensure.length > 0) {
                const deleteColumn =
                    ensure[0].user1_id === member_id
                        ? "user1_delete"
                        : "user2_delete";
                const sqlDeleteChat = `UPDATE chats SET ${deleteColumn} = 1 WHERE id = ?;`;
                await db.query(sqlDeleteChat, [ensure[0].id]);
            }
        } else {
            output.error = "未找到好友關係，無法刪除";
        }
        res.json(output);
    } catch (err) {
        output.error = "無法刪除";
        res.json(output);
    }
});

// 取得好友邀請列表
router.get("/api/invite", async (req, res) => {
    const member_id = req.my_jwt?.id;
    const output = {
        success: false,
        data: [],
        error: "",
        totalRows: 0,
    };
    if (!member_id) {
        output.error = "需要登入會員";
    }
    const t_sql = `
    SELECT count(*) AS totalRows FROM friend_requests left join member on friend_requests.sender_id = member.member_id WHERE receiver_id=? AND status="pending" `;
    const [[{ totalRows }]] = await db.query(t_sql, [member_id]); // 取得總筆數
    output.totalRows = totalRows;
    const sql = `
    SELECT friend_requests.* , m1.name AS sender_name,m1.avatar AS sender_avatar FROM friend_requests 
    left join (SELECT member.member_id,name,avatar FROM member LEFT JOIN member_profile on member.member_id = member_profile.member_id) m1 
    on friend_requests.sender_id = m1.member_id 
    WHERE receiver_id= ? AND status="pending"; `;
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
        data: [],
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
    if (member_id == receiver_id) {
        output.error = "邀請者與被邀請者相同";
        return res.json(output);
    }
    // 2. 有沒有這個項目
    const sql = `SELECT * FROM  friend_requests WHERE sender_id=? AND receiver_id =? AND (status="pending" OR status ="rejected")`;
    const [rows] = await db.query(sql, [member_id, receiver_id]);
    if (rows.length) {
        output.error = "已發送過請求";
        return res.json(output);
    }
    const sqlaccept = `SELECT * FROM  friend_requests WHERE (sender_id=? AND receiver_id =?) OR (sender_id=? AND receiver_id =?) AND status="accepted" `;
    const [acceptrows] = await db.query(sqlaccept, [member_id, receiver_id,receiver_id,member_id]);
    if (acceptrows.length) {
        output.error = "已是好友";
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
    const { sender_id } = req.body;
    const output = {
        success: false,
        data: [],
        error: "",
    };
    //  登入
    if (!member_id) {
        output.error = "需要登入會員";
        return res.json(output);
    }

    // 2. 有沒有這個項目
    const sql = `SELECT * FROM friend_requests WHERE receiver_id = ? AND sender_id = ? AND status = 'pending'`;
    const [rows] = await db.query(sql, [member_id, sender_id]);
    if (!rows.length) {
        output.error = "目前沒有邀請";
        return res.json(output);
    }

    const sqlUpdate = `UPDATE friend_requests
                        SET status = 'accepted'
                        WHERE sender_id = ? AND receiver_id = ? AND status = 'pending';
                        `;
    try {
        const [result] = await db.query(sqlUpdate, [sender_id, member_id]);
        output.success = !!result.affectedRows;
        if (result.affectedRows) {
            const friendshipUpdateSql = `
                INSERT INTO friendships (user1_id, user2_id)
                VALUES (?, ?)
            `;
            await db.query(friendshipUpdateSql, [member_id, sender_id]);
            const addsql = `INSERT INTO chats (user1_id,user2_id) VALUES (?,?);`;
            await db.query(addsql, [member_id, sender_id]);
            const findchatroomsql = `SELECT id chat_id FROM chats WHERE user1_id = ? AND user2_id = ?`;
            const [ chat_id ] = await db.query(findchatroomsql, [
                member_id,
                sender_id,
            ]);
            const invitesql = `INSERT INTO messages (chat_id,sender_id,message) VALUES (?,?,'邀請你一起運動吧!!');`;
            console.log(chat_id[0].chat_id, sender_id);

            await db.query(invitesql, [chat_id[0].chat_id, sender_id]);
            output.success = true;
            output.updateStatus = "已成為好友";
            output.chatroom = "已創建";
        } else {
            output.error = "更新邀請狀態失敗";
        }
        output.data = { sender_id, receiver_id: member_id, status: "accepted" };
        res.json(output);
    } catch (err) {
        output.error = "data錯誤";
        res.json(output);
    }
});

// 拒絕好友邀請api
router.post("/api/reject", async (req, res) => {
    const member_id = req.my_jwt?.id;
    const { sender_id } = req.body;
    const output = {
        success: false,
        data: [],
        error: "",
    };
    //  登入
    if (!member_id) {
        output.error = "需要登入會員";
        return res.json(output);
    }

    // 2. 有沒有這個項目
    const sql = `SELECT * FROM friend_requests WHERE receiver_id = ? AND sender_id = ? AND status = 'pending'`;
    const [rows] = await db.query(sql, [member_id, sender_id]);
    if (!rows.length) {
        output.error = "目前沒有邀請";
        return res.json(output);
    }

    const sqlUpdate = `UPDATE friend_requests
                        SET status = 'rejected'
                        WHERE sender_id = ? AND receiver_id = ? AND status = 'pending';
                        `;
    try {
        const [result] = await db.query(sqlUpdate, [sender_id, member_id]);
        // output.success = !!result.affectedRows;
        output.success = true;
        output.data = { sender_id, receiver_id: member_id, status: "rejected" };
        res.json(output);
    } catch (err) {
        output.error = "data錯誤";
        res.json(output);
    }
});

export default router;
