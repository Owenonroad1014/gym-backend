import express from "express";
import db from "../utils/connect-mysql.js";
import fs from "node:fs/promises";
import upload from "../utils/upload-images.js";
import { z } from "zod";

const profileRouter = express.Router();

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

const editSchema = z
  .object({
    item: z
      .array(z.string())
      .optional() // 可選
      .refine((val) => val.length <= 5, { message: "最多可選五項運動項目" }), // 陣列最多 5 項
    goal: z.array(z.string()).optional(),
    intro: z.string().optional(),
    status: z.boolean(),
  })
  .refine(
    (data) => {
      if (data.status === true) {
        // Correctly check intro length after trimming whitespace
        const trimmedIntro = data.intro ? data.intro.trim() : "";
        if (trimmedIntro.length <= 30) {
          return false;
        }
      }
      return true; // 若 status 為 false，不進行檢查
    },
    {
      message: "檔案狀態為公開時，自我簡介為必填，且至少需要30個字元",
      path: ["intro"],
    }
  );

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
  return output;
};

// 取得個人檔案
profileRouter.get("/get-profile", async (req, res) => {
  const member_id = req.my_jwt?.id;
  const output = await getItemById(member_id);
  output.success = true;
  return res.json(output);
});

// 修改個人檔案
profileRouter.put(
  "/edit-profile",
  upload.single("avatar"),
  async (req, res) => {
    const member_id = req.my_jwt?.id;
    const output = {
      success: false,
      bodyData: req.body,
      result: null,
      error: "",
    };

    // 先取到原本的項目資料
    const { success, error, data: originalData } = await getItemById(member_id);
   

    if (originalData) {
      // 改用這個條件判斷
      output.success = true; // 加入這行
    } else {
      output.error = error;
      return res.json(output);
    }

    // 處理表單資料

    let { intro, item, goal, status } = req.body;

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
    const zResult = editSchema.safeParse(req.body);
    // 如果資料驗證沒過
    if (!zResult.success) {
      if (req.file?.filename) {
        removeUploadedImg(req.file.filename);
      }
      output.error = {
        code: "VALIDATION_ERROR",
        details: zResult.error.issues,
      };
      return res.status(400).json(output);
    }
    console.log("zResult:", zResult);
    console.log("準備轉換資料:", { intro, item, goal, status });

    // 轉換布林值
    const r_status = req.body.status ? 1 : 0;

    const dataObj = { status: r_status };

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

    // 篩選掉 undefined 和空字串的屬性，避免覆蓋原本的資料
    const filteredDataObj = Object.fromEntries(
      Object.entries(dataObj).filter(
        ([_, val]) => val !== undefined && val !== ""
      )
    );

    if (Object.keys(filteredDataObj).length === 0) {
      output.error = "沒有要更新的資料";
      return res.json(output);
    }

    console.log("filteredDataObj:", filteredDataObj);

    const sql = `
    UPDATE member_profile SET ? WHERE member_profile.member_id=?;
  `;

    try {
      const [result] = await db.query(sql, [
        filteredDataObj,
        originalData.member_id,
      ]);
    

      // 確認是否有更新到資料
      if (result.affectedRows > 0) {
        output.success = true;
        output.result = result;
      } else {
        output.success = false;
        output.error = "資料更新失敗";
      }

      // 判斷有沒有上傳頭貼, 有的話刪掉之前的頭貼
      if (req.file?.filename) {
        removeUploadedImg(originalData.avatar);
      }
    } catch (ex) {
      if (req.file?.filename) {
        removeUploadedImg(req.file.filename);
      }
      output.error = `資料庫操作錯誤: ${ex.message}`;
      console.error(ex);
      return res.json(output);
    }

    return res.json(output);
  }
);

export default profileRouter;
