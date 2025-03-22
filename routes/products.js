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

  const member_id = req.my_jwt?.id;

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

    let favoriteSelect = "";
    let favoriteJoin = "";
    let queryParams = [];

    if (member_id) {
        // **如果有登入，才查詢收藏狀態**
        favoriteSelect = ", IF(f.id IS NOT NULL, 1, 0) AS is_favorite"; // 判斷是否收藏
        favoriteJoin = "LEFT JOIN favorites f ON p.id = f.product_id AND f.member_id = ?";
    } else {
        // **如果未登入，預設愛心為空心**
        favoriteSelect = ", 0 AS is_favorite";
    }

    const sql = `
        SELECT p.id, p.product_code, p.name AS product_name, p.description, 
               c.category_name, p.price, p.image_url, p.average_rating, 
               p.created_at
               ${favoriteSelect}  -- 是否已收藏
        FROM Products p
        JOIN Categories c ON p.category_id = c.id
        ${favoriteJoin}
        ${where} 
        ORDER BY p.id 
        LIMIT ${(page - 1) * perPage}, ${perPage}
    `;

    [rows] = await db.query(sql, queryParams);
}

  return { ...output, totalRows, totalPages, page, rows, success: true };
};

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
router.post("/toggle-favorite", async (req, res) => {
  const { member_id, product_id } = req.body;
  
  if (!member_id) {
      return res.status(401).json({ success: false, message: "請先登入" });
  }

  try {
      // 檢查是否已收藏
      const checkSql = "SELECT id FROM favorites WHERE member_id = ? AND product_id = ?";
      const [rows] = await db.query(checkSql, [member_id, product_id]);

      if (rows.length > 0) {
          // **已收藏，則取消收藏**
          const deleteSql = "DELETE FROM favorites WHERE member_id = ? AND product_id = ?";
          await db.query(deleteSql, [member_id, product_id]);
          return res.json({ success: true, action: "removed" });
      } else {
          // **未收藏，則加入收藏**
          const insertSql = "INSERT INTO favorites (member_id, product_id) VALUES (?, ?)";
          await db.query(insertSql, [member_id, product_id]);
          return res.json({ success: true, action: "added" });
      }
  } catch (error) {
      console.error("Error toggling favorite:", error);
      res.status(500).json({ success: false, message: "伺服器錯誤" });
  }
});

export default router;
