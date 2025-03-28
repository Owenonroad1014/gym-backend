import express from "express";
import db from "../utils/connect-mysql.js";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import "dotenv/config.js";
import transporter from "../utils/mail.js";

const router = express.Router();

// 重置密碼token
function generateResetToken() {
  return crypto.randomBytes(32).toString("hex");
}

// 發送密碼重置郵件
router.post("/", async (req, res) => {
  const output = {
    success: false,
    bodyData: req.body,
    result: null,
    error: "",
  };

  const { email } = req.body;
  if (!email) {
    output.error = "請提供電子信箱";
    return res.json(output);
  }
  try {
    const token = generateResetToken();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    // Token 有效 15 分鐘

    const sql = `SELECT * FROM member WHERE email=?`;
    const [user] = await db.query(sql, [email]);

    if (user.length === 0) {
      output.error = "此電子信箱尚未註冊";
      return res.json(output);
    }

    const o_sql = `DELETE FROM password_reset WHERE email=?`;
    await db.query(o_sql, [email]);

    const n_sql = `INSERT INTO password_reset (email, token, expires_at) VALUES (?, ?, ?)`;
    await db.query(n_sql, [email, token, expiresAt]);

    const resetLink = `${process.env.CLIENT_URL}/reset-password?token=${token}`;
    const mailOptions = {
      from: `"GYMBOO"<${process.env.SMTP_TO_EMAIL}>`,
      to: email,
      subject: "重設密碼請求",
      html: `<p>請點擊以下連結來重設您的密碼：</p>
    <a href="${resetLink}">重設密碼</a>
    <p>該連結將在 15 分鐘後過期。</p>`,
    };
    try {
      await transporter.sendMail(mailOptions);
      output.success = true;
      return res.json(output);
    } catch (err) {
      output.error = err;
      return res.json(output);
    }
  } catch (err) {
    console.log(err);
    output.error = err;
    return res.json(output);
  }
});

// 驗證 Token（前端頁面應該先調用這個 API 確保 Token 有效）
router.get("/verify-token", async (req, res) => {
  const output = {
    success: false,
    result: null,
    error: "",
  };

  const { token } = req.query;
  if (!token) {
    output.error = "缺少Token";
    return res.json(output);
  }

  try {
    const tk_sql = `SELECT * FROM password_reset WHERE token = ? AND expires_at > NOW()`;
    const [rows] = await db.query(tk_sql, [token]);

    if (rows.length === 0) {
      output.error = "Token 無效或已過期";
      return res.json(output);
    }
    output.success = true;
    res.json(output);
  } catch (error) {
    console.log(err);
    output.error = err;
    return res.json(output);
  }
});

// 重置密碼
router.post("/reset-password", async (req, res) => {
  const output = {
    success: false,
    result: null,
    error: "",
  };

  const { token, newPassword } = req.body;
  if (!token || !newPassword) {
    output.error = "缺少必要參數";
    return res.json(output);
  }

  try {
    const tk_sql = `SELECT * FROM password_reset WHERE token = ? AND expires_at > NOW()`;
    const [rows] = await db.query(tk_sql, [token]);

    if (rows.length === 0) {
      output.error = "Token 無效或已過期";
      return res.json(output);
    }

    const email = rows[0].email;
    const resetSchema = z.object({
      newPassword: z
        .string()
        .min(1, { message: "密碼為必填" })
        .min(8, { message: "密碼至少8個字元且需包含大小寫英文字母、數字、及特殊字元 @$!%*?&#" })
        .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#])/, {
          message: "密碼至少8個字元且需包含大小寫英文字母、數字、及特殊字元 @$!%*?&#",
        }),
    });
    const zResult = resetSchema.safeParse(req.body);
    if (!zResult.success) {
      output.error = zResult.error.issues.map(issue => issue.message).join(', ');
      return res.json(output);
    }

    // 加密密碼
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // 更新用戶密碼
    const r_sql = `UPDATE member SET password_hash = ? WHERE email = ?`;
    await db.query(r_sql, [hashedPassword, email]);

    // 刪除已使用的 Token
    const dl_sql = `DELETE FROM password_reset WHERE email = ?`;
    await db.query(dl_sql, [email]);
    output.success = true;
    res.json(output);
  } catch (err) {
    console.error(err);
    output.error = err;
    return res.json(output);
  }
});

/* 寄送email的路由 */
router.get("/try-send", function (req, res, next) {
  // email內容
  const mailOptions = {
    from: `"GYMBOO"<${process.env.SMTP_TO_EMAIL}>`,
    to: `mwz236268@gmail.com`,
    subject: "這是一封測試電子郵件",
    text: `你好， \r\n通知你有關第一封郵件的事。\r\n\r\n敬上\r\n開發團隊`,
  };

  // 寄送
  transporter.sendMail(mailOptions, (err, response) => {
    if (err) {
      // 失敗處理
      return res.status(400).json({ message: "Failure", detail: err });
    } else {
      // 成功回覆的json
      return res.json({ message: "Success" });
    }
  });
});

export default router;
