import express from "express";
import moment from "moment-timezone";
import fs from "node:fs/promises";
import { z } from "zod";
import db from "./../utils/connect-mysql.js";
import upload from "./../utils/upload-images.js";

const router = express.Router();
const dateFormat = "YYYY-MM-DD";

// *** 刪除沒用到的已上傳的圖檔
const removeUploadedImg = async (file) => {
  const filePath = `public/imgs/${file}`;
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
  const ab_id = parseInt(id); // 轉換成整數
  if (!ab_id || ab_id < 1) {
    output.error = "錯誤的編號";
    return output;
  }
  const r_sql = `SELECT * FROM address_book WHERE ab_id=? `;
  const [rows] = await db.query(r_sql, [ab_id]);
  if (!rows.length) {
    output.error = "沒有該筆資料";
    return output;
  }
  // 單筆資料的生日格式轉換
  rows[0].birthday = moment(rows[0].birthday).format(dateFormat);
  output.data = rows[0];
  output.success = true;
  return output;
};

const abSchema = z.object({
  name: z
    .string({ message: "姓名欄為必填" })
    .min(3, { message: "請填寫正確的姓名" }),
  email: z
    .string({ message: "電子郵箱欄為必填" })
    .email({ message: "請填寫正確的電子郵箱" }),
});

const getListData = async (req) => {
  const output = {
    success: false,
    redirect: undefined, // 提示頁面要做跳轉
    perPage: 30,
    totalRows: 0,
    totalPages: 0,
    page: 0,
    rows: [],
    keyword: "",
  };

  // 會員的編號 (換成使用 JWT)
  // const member_id = req.session.admin?.member_id || 0;
  const member_id = req.my_jwt?.id || req.session.admin?.member_id || 0;


  const perPage = output.perPage;
  let page = +req.query.page || 1;
  let keyword = req.query.keyword ? req.query.keyword.trim() : "";
  let birthday_begin = req.query.birthday_begin || "";
  let birthday_end = req.query.birthday_end || "";
  let sortField = req.query.sortField || "ab_id";
  let sortRule = req.query.sortRule || "desc"; // asc, desc

  if (page < 1) {
    output.redirect = `?page=1`;
    return output;
  }

  let orderBy = "";
  switch (sortField + "-" + sortRule) {
    default:
    case "ab_id-desc":
      orderBy = ` ORDER BY ab.ab_id DESC `;
      break;
    case "ab_id-asc":
      orderBy = ` ORDER BY ab.ab_id ASC `;
      break;
    case "birthday-desc":
      orderBy = ` ORDER BY ab.birthday DESC `;
      break;
    case "birthday-asc":
      orderBy = ` ORDER BY ab.birthday ASC `;
      break;
  }

  let where = ` WHERE 1 `;
  if (keyword) {
    output.keyword = keyword; // 要輸出給 EJS
    let keyword_ = db.escape(`%${keyword}%`);
    where += ` AND (ab.name LIKE ${keyword_} OR ab.mobile LIKE ${keyword_}) `;
  }
  if (birthday_begin) {
    const begin = moment(birthday_begin);
    if (begin.isValid()) {
      where += ` AND ab.birthday >= '${begin.format(dateFormat)}' `;
    }
  }
  if (birthday_end) {
    const end = moment(birthday_end);
    if (end.isValid()) {
      where += ` AND ab.birthday <= '${end.format(dateFormat)}' `;
    }
  }

  const t_sql = `SELECT COUNT(1) AS totalRows 
  FROM address_book ab ${where} `;
  const [[{ totalRows }]] = await db.query(t_sql); // 取得總筆數
  const totalPages = Math.ceil(totalRows / perPage);
  let rows = [];
  if (totalRows) {
    if (page > totalPages) {
      output.redirect = `?page=${totalPages}`;
      return output;
    }

    /*
    SELECT l.like_id FROM `address_book` ab 
    LEFT JOIN (
      SELECT * FROM ab_likes WHERE member_id=7
    ) l ON ab.ab_id=l.ab_id
    WHERE ab.ab_id=980 ;
    */
    const sql = `SELECT ab.*, l.like_id FROM address_book ab
      LEFT JOIN (
        SELECT * FROM ab_likes WHERE member_id=${member_id}
      ) l ON ab.ab_id=l.ab_id
     ${where} ${orderBy} LIMIT ${(page - 1) * perPage}, ${perPage}`;
    [rows] = await db.query(sql);
    rows.forEach((r) => {
      const b = moment(r.birthday);
      r.birthday = b.isValid() ? b.format("YYYY-MM-DD") : "";
    });
  }

  return { ...output, totalRows, totalPages, page, rows, success: true };
};

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

router.get("/", async (req, res) => {
  res.locals.title = "通訊錄列表 - " + res.locals.title;
  res.locals.pageName = "ab-list";

  const data = await getListData(req);
  if (data.redirect) {
    // 如果有指示要跳轉, 就跳轉到指示的 URL
    return res.redirect(data.redirect);
  }
  if (data.rows.length) {
    if (req.session.admin) {
      res.render("address-book/list", data);
    } else {
      res.render("address-book/list-no-admin", data);
    }
  } else {
    res.render("address-book/list-no-data", data);
  }
});

router.get("/add", async (req, res) => {
  res.locals.title = "新增通訊錄 - " + res.locals.title;
  res.locals.pageName = "ab-add";
  res.render("address-book/add");
});
router.get("/edit/:ab_id", async (req, res) => {
  res.locals.title = "編輯通訊錄 - " + res.locals.title;
  res.locals.pageName = "ab-edit";

  const ab_id = parseInt(req.params.ab_id); // 轉換成整數
  if (ab_id < 1) {
    return res.redirect("/address-book"); // 跳到列表頁
  }
  const r_sql = `SELECT * FROM address_book WHERE ab_id=? `;
  const [rows] = await db.query(r_sql, [ab_id]);
  if (!rows.length) {
    return res.redirect("/address-book"); // 沒有該筆資料, 跳走
  }
  const item = rows[0];
  if (item.birthday) {
    // 生日轉換成 YYYY-MM-DD
    item.birthday = moment(item.birthday).format(dateFormat);
  }
  res.render("address-book/edit", { ...item, item });
});

// ******************** API ****************************
router.get("/api", async (req, res) => {
  const data = await getListData(req);
  res.json(data);
});

// 取得單筆資料
router.get("/api/:ab_id", async (req, res) => {
  const output = await getItemById(req.params.ab_id);
  return res.json(output);
});

router.post("/api", upload.single("avatar"), async (req, res) => {
  const output = {
    success: false,
    bodyData: req.body,
    result: null,
  };
  let { name, email, mobile, birthday, address } = req.body;

  // TODO: 表單驗證

  // return res.json(abSchema.safeParse(req.body));
  const zResult = abSchema.safeParse(req.body);
  /*
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
  // 如果資料驗證沒過
  if (!zResult.success) {
    if (req.file?.filename) {
      removeUploadedImg(req.file.filename);
    }
    return res.json(zResult);
  }

  // 處理 birthday 沒有填寫的情況
  if (birthday === undefined) {
    birthday = null;
  } else {
    const b = moment(birthday);
    if (b.isValid()) {
      birthday = b.format(dateFormat);
    } else {
      birthday = null;
    }
  }
  /*
  const sql = `
    INSERT INTO address_book(
    name, email, mobile, birthday, address
    ) VALUES (?, ?, ?, ?, ?);
  `;

  const [result] = await db.query(sql, [
    name || "",
    email || "",
    mobile || "",
    birthday,
    address || "",
  ]);
  */

  const dataObj = { name, email, mobile, birthday, address };
  // 判斷有沒有上傳頭貼
  if (req.file?.filename) {
    dataObj.avatar = req.file.filename;
  }

  const sql = `
    INSERT INTO address_book SET ?;
  `;
  try {
    const [result] = await db.query(sql, [dataObj]);

    output.result = result;
    output.success = !!result.affectedRows;
  } catch (ex) {
    if (req.file?.filename) {
      removeUploadedImg(req.file.filename);
    }
    output.ex = ex;
  }

  res.json(output);
});

router.delete("/api/:ab_id", async (req, res) => {
  const output = {
    success: false,
    ab_id: req.params.ab_id,
    error: "",
  };
  const { success, data, error } = await getItemById(req.params.ab_id);
  if (!success) {
    // 沒拿到資料
    output.error = error;
    return res.json(output);
  }

  const { ab_id, avatar } = data; // 欄位裡的檔名
  if (avatar) {
    output.hadRemovedUploaded = await removeUploadedImg(avatar);
  }

  const d_sql = `DELETE FROM address_book WHERE  ab_id=? `;
  const [result] = await db.query(d_sql, [ab_id]);
  output.result = result; // 除錯用意
  output.success = !!result.affectedRows;
  return res.json(output);
});

router.put("/api/:ab_id", upload.single("avatar"), async (req, res) => {
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
  } = await getItemById(req.params.ab_id);
  if (!success) {
    output.error = error;
    return res.json(output);
  }

  // 表單資料
  let { name, email, mobile, birthday, address } = req.body;

  // 表單驗證
  const zResult = abSchema.safeParse(req.body);
  // 如果資料驗證沒過
  if (!zResult.success) {
    if (req.file?.filename) {
      removeUploadedImg(req.file.filename);
    }
    return res.json(zResult);
  }

  // 處理 birthday 沒有填寫的情況
  if (birthday === undefined) {
    birthday = null;
  } else {
    const b = moment(birthday);
    if (b.isValid()) {
      birthday = b.format(dateFormat);
    } else {
      birthday = null;
    }
  }

  const dataObj = { name, email, mobile, birthday, address };
  // 判斷有沒有上傳頭貼
  if (req.file?.filename) {
    dataObj.avatar = req.file.filename;
  }

  const sql = `
    UPDATE address_book SET ? WHERE ab_id=?;
  `;
  try {
    const [result] = await db.query(sql, [dataObj, originalData.ab_id]);
    output.result = result;
    output.success = !!result.changedRows;
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

  res.json(output);
});

// ********** 加入或取消喜愛清單項目 ***************
router.get("/toggle-like/:ab_id", async (req, res) => {
  // 會員 : req.session.admin.member_id

  const output = {
    success: false, // 有沒有成功完成操作
    action: "", // add, remove // 5. 回應時: "加入" 或 "移除", 哪一個項目
    ab_id: 0, // 操作的項目是哪一個
    error: "",
  };

  // 1. 先判斷有沒有登入
  // const member_id = req.session.admin?.member_id;
  const member_id = req.my_jwt?.id || req.session.admin?.member_id; // 使用 JWT 登入功能


  if (!member_id) {
    output.error = "需要登入會員";
    return res.json(output);
  }
  const ab_id = +req.params.ab_id || 0;
  if (!ab_id) {
    output.error = "項目編號必須是整數";
    return res.json(output);
  }

  // 2. 有沒有這個項目
  /*
  SELECT l.like_id FROM `address_book` ab 
    LEFT JOIN (
      SELECT * FROM ab_likes WHERE member_id=7
    ) l ON ab.ab_id=l.ab_id
    WHERE ab.ab_id=980 ;
  */
  const sql = `
    SELECT l.like_id FROM address_book ab 
    LEFT JOIN (
      SELECT * FROM ab_likes WHERE member_id=?
    ) l ON ab.ab_id=l.ab_id
    WHERE ab.ab_id=? ;
  `;
  const [rows] = await db.query(sql, [member_id, ab_id]);
  if (!rows.length) {
    output.error = "沒有該項目";
    return res.json(output);
  }
  output.ab_id = ab_id;
  const like_id = rows[0].like_id;
  if (like_id) {
    // 3. 有, 就移除
    output.action = "remove";
    const sql = `DELETE FROM ab_likes WHERE like_id=?`;
    const [result] = await db.query(sql, [like_id]);
    output.result = result;
    output.success = !!result.affectedRows;
  } else {
    // 4. 沒有, 就加入
    output.action = "add";
    const sql = `INSERT INTO ab_likes (member_id, ab_id) VALUES (?, ?) `;
    const [result] = await db.query(sql, [member_id, ab_id]);
    output.result = result;
    output.success = !!result.affectedRows;
  }
  res.json(output);
});

export default router;
