import express from "express";
import db from "../utils/connect-mysql.js";
import { name } from "ejs";
// import uploadImages from "../utils/upload-images";
// import { z } from "zod";

const router = express.Router();

// *** 刪除沒用到的已上傳的圖檔
const removeUploadedImg = async (file) => {
  const filePath = `public/img/avatar/${file}`;
  try {
    await fs.unlink(filePath);
    return true;
  } catch (ex) {
    console.log("removeUploadedImg: ", ex);
  }
  return false;
};

// 格式化手機號碼的函式
function formatPhoneNumber(phoneNumber) {
    // 移除所有非數字字符
    phoneNumber = phoneNumber.replace(/\D/g, '');
  
    // 確保手機號碼長度為 10
    if (phoneNumber.length === 10) {
     // 提取前3個和後3個數字
    const prefix = phoneNumber.slice(0, 4); // 取 '09'
    const suffix = phoneNumber.slice(-3);   // 取 '678'
    
    // 隨機生成3個大寫字母
    const middle = 'XXX';  // 可以用隨機字母來替換這裡的 "XXXXX"
  
    // 返回格式化後的號碼
    return phoneNumber = `${prefix}${middle}${suffix}`;
    }
  }
// 以主鍵取得項目資料
const getItemById = async (id) => {
  const output = {
    success: false,
    data: {
      name: "",
      member_id: 0,
      avatar: "",
      sex: "",
      mobile: "",
      intro: "",
      item: "",
      goal: "",
      status: null,
    },
    error: "",
  };

  const member_id = parseInt(id); // 轉換成整數
  if (!member_id || member_id < 1) {
    output.error = "錯誤的編號";
    return output;
  }

  const r_sql = `SELECT member.name, member_profile.* FROM member LEFT JOIN member_profile on member.member_id = member_profile.member_id  WHERE member_profile.member_id=? `;
  const [rows] = await db.query(r_sql, [member_id]);
  if (!rows.length) {
    output.error = "沒有該筆資料";
    return output;
  }
  const row = rows[0];
  const avatarUrl = row.avatar ? `/img/avatar/${row.avatar}` : "";
  const status = Boolean(row.status);
  const goal =
    typeof row.goal === "string"
      ? row.goal.split(/[\s、,]+/).filter((s) => s.length > 0)
      : Array.isArray(row.goal)
      ? row.goal
      : [];
  const mobile = formatPhoneNumber(row.mobile)

  output.data = {
    id: row.member_id,
    name: row.name,
    avatar: avatarUrl,
    sex: row.sex,
    mobile: mobile,
    intro: row.intro || "",
    item: row.item || "",
    goal: goal || "暫無目標",
    status: status,
  };
  output.success = true;
  return output;
};

router.get("/get-profile", async (req, res) => {
  const member_id = req.my_jwt?.id;
  const output = await getItemById(member_id);

  return res.json(output);
});

export default router;
