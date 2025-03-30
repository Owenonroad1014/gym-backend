import express from "express";
import db from "../utils/connect-mysql.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import "dotenv/config.js";
import transporter from "../utils/mail.js";

const router = express.Router();

// 發送密碼重置郵件
router.post("/", async (req, res) => {
  const output = {
    success: false,
    bodyData: req.body,
    result: null,
    error: "",
    token: { token: "", expiresAt: "" },
  };

  const { email } = req.body;

  if (!email) {
    output.error = "請提供電子信箱";
    return res.json(output);
  }
  try {
    const sql = `SELECT * FROM member WHERE email=?`;
    const [user] = await db.query(sql, [email]);

    if (user.length === 0) {
      output.error = "此電子信箱尚未註冊";
      return res.json(output);
    }
    const nToken = jwt.sign({ email }, process.env.JWT_KEY, {
      expiresIn: "15m",
    });
    const nExpiresAt = Date.now() + 15 * 60 * 1000;
    output.token = { token: nToken, expiresAt: nExpiresAt };
    const resetLink = `${process.env.CLIENT_URL}/member/reset-password?token=${nToken}`;
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
      output.error = "郵件發送失敗" + err.message;
      return res.json(output);
    }
  } catch (err) {
    console.log(err);
    output.error = "伺服器錯誤" + err.message;
    return res.json(output);
  }
});

// 重置密碼
router.put("/reset-password", async (req, res) => {
  const output = {
    success: false,
    result: null,
    error: "",
  };

  const { token, newPassword } = req.body;
  if (!token) {
    output.error = "Token不存在";
    return res.json(output);
  }
  if (!newPassword) {
    output.error = "請設定新密碼";
    return res.json(output);
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_KEY);
    const email = decoded.email;

    // Additional check for token expiration
    if (decoded.exp < Math.floor(Date.now() / 1000)) {
      output.error = "重設密碼連結已過期";
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
    const zResult = resetSchema.safeParse({ newPassword });
    if (!zResult.success) {
      output.error = zResult.error.issues
        .map((issue) => issue.message)
        .join(", ");
      return res.json(output);
    }

    // 加密密碼
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // 更新用戶密碼
    const r_sql = `UPDATE member SET password_hash = ? WHERE email = ?`;
    const [result] = await db.query(r_sql, [hashedPassword, email]);

    if (result.affectedRows > 0) {
      output.success = true;
      output.result = "密碼重設成功";
    } else {
      output.error = "找不到該用戶";
    }

    return res.json(output);
  } catch (err) {
    console.error(err);
    output.error = err.message;
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
