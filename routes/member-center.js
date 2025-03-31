import express from "express";
import db from "../utils/connect-mysql.js";

const router = express.Router();

// 取得會員名字
router.get("/membername", async (req, res) => {
    const member_id = req.my_jwt?.id;
    const output = {
        success: false,
        data: [],
        error: "",
    };
    if (!member_id || isNaN(member_id)) {
        output.error = "請登入會員";
        return res.json(output);
    }
    try {
        const sql = `SELECT name FROM member WHERE member_id =?  ;`;
        const [result] = await db.query(sql, [member_id]);
        if (result.length <= 0) {
            output.error = "找不到此人";
        }
        output.data = result[0].name;
        output.success = true;
        return res.json(output);
    } catch (err) {
        console.error("Error occurred:", err);
        return res.json(output);
    }
});


export default router;
