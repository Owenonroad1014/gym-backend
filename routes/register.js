import express from "express";
import { rgSchema, pfSchema } from "../utils/schema/schema.js";
import db from "../utils/connect-mysql.js";
import upload from "../utils/upload-images.js";
import fs from "node:fs/promises";
import bcrypt from "bcrypt";

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

// 以主鍵取得項目資料
const getItemById = async (id) => {
  const output = {
    success: false,
    data: null,
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
  output.data = rows[0];
  output.success = true;
  return output;
};

// ******************** API ****************************
router.post("/api", async (req, res) => {
  const output = {
    success: false,
    error: "",
    data: {
      id: 0,
    },
    bodyData: req.body,
    result: null,
    profileResult: null,
  };

  let { email, password } = req.body;

  const zResult = rgSchema.safeParse(req.body);
  // 如果資料驗證沒過
  if (!zResult.success) {
    return res.json(zResult);
  }
  /* zResult 結果
{
    "success": false,
    "error": {
        "issues": [
            {
                "code": "too_small",
                "minimum": 3,
                "type": "string",
                "inclusive": true,
                "exact": false,
                "message": "請填寫正確的姓名",
                "path": [
                    "name"
                ]
            }
        ],
        "name": "ZodError"
    }
}
  */

  const checkSql = `
    SELECT email from member WHERE email=?;
  `;
  const [rows] = await db.query(checkSql, [email]);
  if (rows.length > 0) {
    output.error = "用戶已註冊";
    return res.json(output);
  }

  const hash = await bcrypt.hash(password, 10);
  const sql = `
  INSERT INTO member (email, password_hash) VALUES (?, ?);
`;

  try {
    const [result] = await db.query(sql, [email, hash]);
    output.result = result;
    output.success = !!result.affectedRows;
    output.data.id = result.insertId;

    if (output.data.id > 0) {
      const insertProfileSql = `
        INSERT INTO member_profile (member_id) VALUES (?);
      `;
      const [profileResult] = await db.query(insertProfileSql, [
        output.data.id,
      ]);
      output.profileResult = profileResult;
    }
  } catch (ex) {
    output.ex = ex;
  }

  res.json(output);
});

router.put("/api/profile", upload.single("avatar"), async (req, res) => {
  const output = {
    success: false,
    bodyData: req.body,
    result: null,
    error: "",
  };

  // 先取到原本的項目資料
  const {
    success,
    error,
    data: originalData,
  } = await getItemById(req.my_jwt?.id);
  if (!success) {
    output.error = error;
    return res.json(output);
  }

  // 處理表單資料

  let { pname: name, sex, mobile, intro, item, goal, status } = req.body;
  const folder = req.body.folder || "avatar";

  // Convert item to array if it's a string
  req.body.item =
    typeof req.body.item === "string"
      ? req.body.item.split(/[\s、,]+/).filter((s) => s.length > 0)
      : Array.isArray(req.body.item)
      ? req.body.item
      : [];

  if (typeof status === "string") {
    req.body.status = status.toLowerCase() === "true";
  }

  // 表單驗證
  const zResult = pfSchema.safeParse(req.body);
  // 如果資料驗證沒過
  if (!zResult.success) {
    if (req.file?.filename) {
      removeUploadedImg(req.file.filename);
    }
    return res.json(zResult);
  }

  // 轉換布林值
  const r_status = req.body.status ? 1 : 0;

  const dataObj = { sex, mobile, status: r_status };

  // 判斷有沒有上傳頭貼
  if (req.file?.filename) {
    dataObj.avatar = req.file.filename;
  }

  if (intro) {
    dataObj.intro = intro;
  }

  // 確保 item 和 goal 被轉為陣列，即使它是字串，，再做 join
  dataObj.item = item
    ? []
        .concat(item)
        .filter(Boolean)
        .join(",")
        .replace(/^[\s、,]+|[\s、,]+$/g, "")
    : "";
  dataObj.goal = goal ? [].concat(goal).filter(Boolean).join(",") : "";

  const sql1 = `
    UPDATE member_profile SET ? WHERE member_profile.member_id=?;
  `;

  const sql2 = `
    UPDATE member SET name=? WHERE member.member_id=?;
  `;
  try {
    const [result1] = await db.query(sql1, [dataObj, originalData.member_id]);
    const [result2] = await db.query(sql2, [name, originalData.member_id]);

    output.result = { result1, result2 };
    output.success = !!(result1.changedRows || result2.changedRows);
    // 判斷有沒有上傳頭貼, 有的話刪掉之前的頭貼
    if (req.file?.filename) {
      removeUploadedImg(originalData.avatar);
    }
  } catch (ex) {
    if (req.file?.filename) {
      removeUploadedImg(req.file.filename);
    }
    output.ex = ex;
  }

  return res.json(output);
});
export default router;
