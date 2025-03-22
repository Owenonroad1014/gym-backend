import express from "express";
import moment from "moment-timezone";
import fs from "node:fs/promises";
import db from "../utils/connect-mysql.js";
import upload from "../utils/upload-images.js";
import { z } from "zod";
import cors from 'cors';



const router = express.Router();

router.use(cors());
//表單驗證
const abSchema = z.object({
    product_code: z.string()
        .min(1, "此欄為必填")
        .regex(/^P\d{3}$/, "格式錯誤 (須為P加上三位數)"),
    name: z.string().min(1, "此欄為必填"),
    description: z.string().min(1, "此欄為必填"),
    price: z.string().min(1, "此欄為必填")
});

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

const getListData = async (req) => {
  const output = {
    success: false,
    redirect: undefined, // 提示頁面要做跳轉
    perPage: 12,
    totalRows: 0,
    totalPages: 0,
    page: 0,
    rows: [],
    keyword: ""
  };

  const memberId = req.my_jwt?.id; 

  const perPage = output.perPage;
  let page = +req.query.page || 1;
  let keyword = req.query.keyword ? req.query.keyword.trim() : "";
  let category = req.query.category_name || ""; // 從請求中讀取 category

  if (page < 1) {
    output.redirect = `?page=1`;
    return output;
  }

  let where = ` WHERE 1 `;
  if (keyword) {
    output.keyword = keyword; // 要輸出給 EJS
    let keyword_ = db.escape(`%${keyword}%`);
    where += ` AND (name LIKE ${keyword_})`;
  }

  if (category) {
    output.category = category;
    let category_ = db.escape(category); // 確保 category 是安全的
    where += ` AND (c.category_name = ${category_})`;
}
  // 取得總筆數
  const t_sql = `  SELECT COUNT(1) AS totalRows 
  FROM products p 
  JOIN Categories c ON p.category_id = c.id 
  ${where} `;
  const [[{ totalRows }]] = await db.query(t_sql); 

  // 計算總頁數
  const totalPages = Math.ceil(totalRows / perPage);

  let rows = [];
  // 確保頁碼不超過總頁數
  if (totalRows) {
    if (page > totalPages) {
      output.redirect = `?page=${totalPages}`;
      return output;
    }



    if (memberId) {
      const sql = `
      SELECT p.id, p.product_code, p.name AS product_name, p.description, 
      c.category_name, p.price, p.image_url, p.average_rating, 
      p.created_at, l.like_id
        FROM Products p LEFT JOIN (
        SELECT * FROM favorites WHERE member_id = ${memberId}
        )l ON p.id = l.product_id left
        JOIN Categories c ON p.category_id = c.id
        ${where} 
        ORDER BY p.id 
        LIMIT ${(page - 1) * perPage}, ${perPage}
  `;[rows] = await db.query(sql);}
      else{let sql = `
        SELECT p.id, p.product_code, p.name AS product_name, p.description, 
        c.category_name, p.price, p.image_url, p.average_rating, 
        p.created_at
        FROM Products p
        JOIN Categories c ON p.category_id = c.id
        ${where} 
        ORDER BY p.id 
        LIMIT ${(page - 1) * perPage}, ${perPage}
    `;

    [rows] = await db.query(sql);
  }
    
  return { ...output, totalRows, totalPages, page, rows, success: true };
};}

router.use((req, res, next) => {
  return next(); // 先讓 middleware 內容沒有功能
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
  res.locals.pageName = "products-list";

  const data = await getListData(req);
  if (data.redirect) {
    // 如果有指示要跳轉, 就跳轉到指示的 URL
    return res.redirect(data.redirect);
  }
  
});

router.get("/add", async(req, res) => {
  res.locals.title = "新增通訊錄 - " + res.locals.title;
  res.locals.pageName = "products-add";
  res.render("products/add");
})

router.get("/api", async (req, res) => {
  const data = await getListData(req);
  res.json(data);
  console.log("Request body:", req.body);
});

router.get("/api/:productId", async (req, res) => {
  const productId = req.params.productId;
  const output = { success: false, data: null, relatedProducts: [] };

  try {
    const sql = `
      SELECT p.id, 
      p.product_code, 
      p.name AS product_name, 
      p.description, 
      c.category_name, 
      p.price, 
      p.image_url, 
      p.average_rating, 
      p.created_at,
      JSON_ARRAYAGG(
        JSON_OBJECT('variant_id', pv.id, 'weight', pv.weight, 'image_url', pv.image_url)
      ) AS variants
      FROM Products p
      JOIN Categories c ON p.category_id = c.id
      LEFT JOIN ProductVariants pv ON p.id = pv.product_id
      WHERE p.id = ?
      GROUP BY p.id;
    `;

    const [rows] = await db.query(sql, [productId]);

    if (rows.length > 0) {
      let productData = rows[0];

      // 檢查所有 variants 是否 weight 為 null
      let hasValidVariants = productData.variants.some(variant => variant.weight !== null);

      // 如果所有 weight 都是 null，就設為 null
      productData.variants = hasValidVariants ? productData.variants : null;

      output.success = true;
      output.data = productData;

      // 取得相關產品
      const relatedSql = `
        SELECT p.id, p.name AS product_name, p.price, p.image_url, p.description
        FROM Products p
        JOIN Categories c ON p.category_id = c.id
        WHERE c.category_name = ? AND p.id != ?
        LIMIT 4;
      `;

      const [relatedRows] = await db.query(relatedSql, [productData.category_name, productId]);
      output.relatedProducts = relatedRows;
    }
  } catch (error) {
    output.error = error.message;
  }
  
  res.json(output);
});

router.post("/api", upload.single('avatar'), async (req, res) => {
  const output = {
    success: false,
    bodyData: req.body,
    result: null,
  };
  
  let { product_code, name, description, category_name, weight, base_price, img_url } = req.body;
   //表單驗證
  const zResult = abSchema.safeParse(req.body);
   // 如果資料驗證沒過
   if (!zResult.success) {
    if (req.file?.filename) {
      removeUploadedImg(req.file.filename);
    }
    return res.json(zResult);
  }
    //如果資料有驗證過就抓新增的內容存在dataObj變數裡
  const dataObj = { product_code, name, description, category_name, weight, base_price, img_url }
    //其中如果新增的內容有圖片就在dataObj變數裡新增avatar變數
  if( req.file?.filename) {
    dataObj.img_url = req.file.filename;
  }
    //如果重量為空值就顯null
  weight = weight.trim() === '' ? null : weight;
    //資料庫新增
  const sql = `
    INSERT INTO products SET ?;
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

// CORS 設置應該只需要一次
});
//收藏api
router.get("/api/toggle-like/:productId", async (req, res) => {
  // 會員 : req.session.admin.member_id
  const output = {
    success: false, // 有沒有成功完成操作
    action: "", // add, remove // 5. 回應時: "加入" 或 "移除", 哪一個項目
    product_id: 0, // 操作的項目是哪一個
    error: "",
  };

  const member_id = req.my_jwt?.id; // 使用 JWT 登入功能
  if (!member_id) {
    output.error = "需要登入會員";
    return res.json(output);
  }
  const product_id = +req.params.productId || 0;
  if (!product_id) {
    output.error = "項目編號必須是整數";
    return res.json(output);
  }

console.log("Member ID:", member_id);
console.log("Product ID:", product_id);

  const sql = `
    select memberlike.like_id from products left join (SELECT * FROM favorites WHERE member_id=?) memberlike on products.id = memberlike.product_id WHERE products.id =?;
      `;
  const [rows] = await db.query(sql, [member_id, product_id]);
  if (!rows.length) {
    output.error = "沒有該項目";
    return res.json(output);
  }
  output.product_id = product_id;
  const like_id = rows[0].like_id;
  if (like_id) {
    // 3. 有, 就移除
    output.action = "remove";
    const sql = `DELETE FROM favorites WHERE like_id=?`;
    const [result] = await db.query(sql, [like_id]);
    output.result = result;
    output.success = !!result.affectedRows;
  } else {
    // 4. 沒有, 就加入
    output.action = "add";
    const sql = `INSERT INTO favorites (member_id, product_id) VALUES (?, ?) `;
    const [result] = await db.query(sql, [member_id, product_id]);
    output.result = result;
    output.success = !!result.affectedRows;
  }
  res.json(output);
});

export default router;