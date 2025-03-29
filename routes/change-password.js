import express from "express";
import db from "../utils/connect-mysql.js";
import bcrypt from "bcryptjs";
import { z } from "zod";

const router = express.Router();

// 比對舊密碼
router.post("/confirm-password", async (req, res) => {
  const output = {
    success: false,
    bodyData: req.body,
    result: "",
    error: "",
  };
  const member_id = req.my_jwt?.id;
  const email = req.my_jwt?.account;
  const { password } = req.body;

  if (!member_id || member_id < 1) {
    return res.json({ ...output, error: "錯誤的編號" });
  }
  if (!password) {
    return res.json({ ...output, error: "請輸入舊密碼" });
  }
  try {
    const r_sql = `SELECT * FROM member WHERE member_id = ? AND email = ?`;
    const [rows] = await db.query(r_sql, [member_id, email]); 



    if (!rows || rows.length === 0) {
      return res.json({ ...output, error: "沒有找到符合的會員資料" });
    }

    const row = rows[0];

    if (!row.password_hash) {
      return res.json({ ...output, error: "密碼資料錯誤，請聯絡管理員" });
    }

    console.log("password_hash 欄位:", row.password_hash);

    const match = await bcrypt.compare(password, row.password_hash);
    if (!match) {
      return res.json({ ...output, error: "輸入的舊密碼錯誤" });
    }

    return res.json({ ...output, success: true });

  } catch (error) {
    console.error("比對舊密碼時發生錯誤:", error);
    return res.json({ ...output, error: "伺服器錯誤，請稍後再試", sqlError: error.message });
  }
});


// 更新密碼
router.put("/reset", async (req, res) => {
  const output = {
    success: false,
    result: null,
    error: "",
  };

  const member_id = req.my_jwt?.id;
  const email = req.my_jwt?.account;
  const { newPassword } = req.body;

  if (!member_id || member_id < 1) {
    output.error = "錯誤的編號";
    return res.json(output);
  }

  if (!email) {
    output.error = "缺少使用者信箱資訊";
    return res.json(output);
  }

  const resetSchema = z.object({
    newPassword: z
      .string()
      .min(1, { message: "密碼為必填" })
      .min(8, {
        message:
          "密碼至少8個字元且需包含大小寫英文字母、數字、及特殊字元 @$!%*?&#",
      })
      .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#])/, {
        message:
          "密碼至少8個字元且需包含大小寫英文字母、數字、及特殊字元 @$!%*?&#",
      }),
  });
  const zResult = resetSchema.safeParse(req.body);
  if (!zResult.success) {
    output.error = zResult.error.issues
      .map((issue) => issue.message)
      .join(", ");
    return res.json(output);
  }
  try {
    // 加密新密碼
    const hashedPassword = await bcrypt.hash(newPassword, 12);

    // 確認使用者存在
    const t_sql = `SELECT * FROM member WHERE member_id=? AND email=?`;
    const [rows] = await db.query(t_sql, [member_id, email]);

    if (!rows.length) {
      output.error = "沒有該筆資料";
      return res.json(output);
    }

    // 更新密碼
    const r_sql = `UPDATE member SET password_hash=? WHERE member_id=? AND email=?`;
    const [result] = await db.query(r_sql, [hashedPassword, member_id,email]);

    if (result.affectedRows > 0) {
      return res.json({ ...output, success: true, result });
    } else {
      output.error = "密碼更新失敗，請稍後再試";
      return res.json(output);
    }
  } catch (error) {
    console.error("密碼更新錯誤:", error);
    return res.json({
      ...output,
      error: "伺服器錯誤，請稍後再試",
      sqlError: error.message, // **回傳 SQL 錯誤訊息**
    });
  }
});

export default router;
