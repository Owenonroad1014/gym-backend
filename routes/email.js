import express from "express";
import db from "../utils/connect-mysql.js";
import fs from "node:fs/promises";
import schedule from "node-schedule";
import nodemailer from "nodemailer";
import dayjs from "dayjs";

const emailRouter = express.Router();

// 設定 email 傳送器
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.SMTP_TO_EMAIL,
    pass: process.env.SMTP_TO_PASSWORD,
  },
});

// 檢查即將到來的課程並發送通知
async function checkUpcomingClasses() {
  const sql = `SELECT 
  c.class_date,
  c.start_time,
  ct.type_name,
  l.branch,
  m.email,
  m.name,
  co.name AS coach_name
FROM reservations r
JOIN classes c ON r.class_id = c.id
JOIN locations l ON c.location_id = l.id
JOIN member m ON r.member_id = m.member_id
LEFT JOIN coaches co ON r.coach_id = co.id
LEFT JOIN class_types ct ON c.type_id = ct.id
WHERE c.class_date = DATE_ADD(CURDATE(), INTERVAL 1 DAY)
AND r.status = 'confirmed'
`;

  try {
    const [rows] = await db.query(sql);

    for (const reservation of rows) {
      const mailOptions = {
        from: `"GYM步空間"<${process.env.EMAIL_USER}>`,
        to: reservation.email,
        subject: "課程提醒通知",
        html: `
          <h2>親愛的 ${reservation.name} 您好</h2>
          <p>提醒您明天有預約的課程即將開始：</p>
          <ul>
            <li>課程名稱：${reservation.type_name}</li>
            <li>教練名稱：${reservation.coach_name}</li>
            <li>上課時間：${dayjs(reservation.class_date).format(
              "YYYY-MM-DD"
            )} ${reservation.start_time}</li>
            <li>上課地點：${reservation.branch}</li>
          </ul>
          <p>請準時到達，謝謝！</p>
        `,
      };

      await transporter.sendMail(mailOptions);
    }
  } catch (error) {
    console.error("發送通知郵件時發生錯誤:", error);
  }
}

// 設定每天晚上 8 點執行通知
// schedule.scheduleJob("0 8 * * *", checkUpcomingClasses);

// 測試用 API 端點
emailRouter.post("/test-email", async (req, res) => {
  try {
    const testMailOptions = {
      from: `"GYM步空間"<${process.env.EMAIL_USER}>`,
      to: "dtes95105@gmail.com", // 測試郵箱
      subject: "測試通知郵件",
      html: `
        <h2>這是測試郵件</h2>
        <p>課程通知測試內容</p>
      `,
    };

    await transporter.sendMail(testMailOptions);
    res.json({ success: true, message: "測試郵件發送成功" });
  } catch (error) {
    console.error("測試郵件發送失敗:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default emailRouter;
