import express from "express";
import {  z } from "zod";
import db from "../utils/connect-mysql.js";
import bcrypt from "bcrypt";

const router = express.Router();

const abSchema = z.object({
  email: z
    .string({ message: "電子郵箱為必填" })
    .email({ message: "請填寫正確的電子郵箱" }),
  password: z
    .string()
    .min(8, { message: "密碼至少8個字元" })
    .regex(/[A-Z]/, {
      message: "密碼需包含大小寫英文字母、數字、及特殊字元!@#$%^&*",
    })
    .regex(/[a-z]/, {
      message: "密碼需包含大小寫英文字母、數字、及特殊字元!@#$%^&*",
    })
    .regex(/\d/, {
      message: "密碼需包含大小寫英文字母、數字、及特殊字元!@#$%^&*",
    })
    .regex(/[@$!%*?&#]/, {
      message: "密碼需包含大小寫英文字母、數字、及特殊字元!@#$%^&*",
    }),
});

router.use((req, res, next) => {
  return next();

  // const waitMSec = Math.random() * 2000;
  // setTimeout(() => {
  //   next();
  // }, waitMSec);
  // return;

  const whiteList = ["/", "/api"]; // 可通過的白名單
  let url = req.url.split("?")[0]; // 去掉 query string 參數
  if (whiteList.includes(url)) {
    return next(); // 讓用戶通過
  }

  /*
  // 如果沒有登入管理者
  if(!req.session.admin) {
    return res.status(401).send(`<h1>登入管理者後, 才能訪問</h1>`)
  }
  */
  if (!req.session.admin) {
    const usp = new URLSearchParams();
    usp.set("u", req.originalUrl);
    return res.redirect(`/login?${usp}`); // 提示登入後要前往的頁面
  }
  next();
});

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
  const zResult = abSchema.safeParse(req.body);
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
`

  try {
    const [result] = await db.query(sql, [email, hash]);
    output.result = result;
    output.success = !!result.affectedRows;
    output.data.id = result.insertId;

    if (output.data.id > 0) {
      const insertProfileSql = `
        INSERT INTO member_profile (member_id) VALUES (?);
      `;
      const [profileResult] = await db.query(insertProfileSql, [output.data.id]);
      output.profileResult = profileResult;
    }
  } catch (ex) {
    output.ex = ex;
  }

  res.json(output);
});

// router.put("/api/:member_id", upload.single("avatar"), async (req, res) => {
//   const output = {
//     success: false,
//     bodyData: req.body,
//     result: null,
//     error: "",
//   };

//   // 先取到原本的項目資料
//   const {
//     success,
//     error,
//     data: originalData,
//   } = await getItemById(req.params.ab_id);
//   if (!success) {
//     output.error = error;
//     return res.json(output);
//   }

//   // 表單資料
//   let { name, email, mobile, birthday, address } = req.body;

//   // 表單驗證
//   const zResult = abSchema.safeParse(req.body);
//   // 如果資料驗證沒過
//   if (!zResult.success) {
//     if (req.file?.filename) {
//       removeUploadedImg(req.file.filename);
//     }
//     return res.json(zResult);
//   }

//   // 處理 birthday 沒有填寫的情況
//   if (birthday === undefined) {
//     birthday = null;
//   } else {
//     const b = moment(birthday);
//     if (b.isValid()) {
//       birthday = b.format(dateFormat);
//     } else {
//       birthday = null;
//     }
//   }

//   const dataObj = { name, email, mobile, birthday, address };
//   // 判斷有沒有上傳頭貼
//   if (req.file?.filename) {
//     dataObj.avatar = req.file.filename;
//   }

//   const sql = `
//     UPDATE address_book SET ? WHERE ab_id=?;
//   `;
//   try {
//     const [result] = await db.query(sql, [dataObj, originalData.ab_id]);
//     output.result = result;
//     output.success = !!result.changedRows;
//     // 判斷有沒有上傳頭貼, 有的話刪掉之前的頭貼
//     if (req.file?.filename) {
//       removeUploadedImg(originalData.avatar);
//     }
//   } catch (ex) {
//     if (req.file?.filename) {
//       removeUploadedImg(req.file.filename);
//     }
//     output.ex = ex;
//   }

//   res.json(output);
// });
export default router;
