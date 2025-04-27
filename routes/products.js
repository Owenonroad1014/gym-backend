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
  JOIN categories c ON p.category_id = c.id 
  ${where} `;
  const [[{ totalRows }]] = await db.query(t_sql); 

  // 計算總頁數
  const totalPages = Math.ceil(totalRows / perPage);

  let rows = [];

  if (totalRows === 0) {
    return { ...output, success: true, rows: [] };
  }
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
        FROM products p LEFT JOIN (
        SELECT * FROM favorites WHERE member_id = ${memberId}
        )l ON p.id = l.product_id left
        JOIN categories c ON p.category_id = c.id
        ${where} 
        ORDER BY p.id 
        LIMIT ${(page - 1) * perPage}, ${perPage}
  `;[rows] = await db.query(sql);}
      else{let sql = `
        SELECT p.id, p.product_code, p.name AS product_name, p.description, 
        c.category_name, p.price, p.image_url, p.average_rating, 
        p.created_at
        FROM products p
        JOIN categories c ON p.category_id = c.id
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

router.get("/api/favorites", async (req, res) => {
  const member_id = req.my_jwt?.id;
  
  if (!member_id) {
    return res.status(401).json({ success: false, error: "未登入" });
  }

  try {
    const sql = `
      SELECT 
        p.id AS product_id, 
        p.name, 
        p.price, 
        p.image_url, 
        p.description, 
        p.average_rating, 
        c.category_name, 
        p.created_at
      FROM favorites f
      JOIN products p ON f.product_id = p.id
      JOIN categories c ON p.category_id = c.id
      WHERE f.member_id = ? 
      ORDER BY f.created_at DESC
    `;

    const [favorites] = await db.query(sql, [member_id]);

    res.json({ success: true, favorites });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});





// router.get("/add", async(req, res) => {
//   res.locals.title = "新增通訊錄 - " + res.locals.title;
//   res.locals.pageName = "products-add";
//   res.render("products/add");
// })

router.get("/api", async (req, res) => {
  const data = await getListData(req);
  res.json(data);
  console.log("Request body:", req.body);
});

//商品評價(讀取訂購資料)
router.get("/api/review", async (req, res) => {
  const memberId = req.my_jwt?.id;
  if (!memberId) {
    return res.json({ success: false, error: "需要登入會員" });
  }

  const sql = `
SELECT 
    o.order_id, oi.product_id, p.name, p.image_url, 
    oi.product_variant_id, o.added_at, pv.weight, o.status, oi.order_item_id,
    r.rating, r.review_text, r.created_at  -- 加入評論的時間
FROM orders o
JOIN order_items oi ON o.order_id = oi.order_id  -- 訂單主表與詳情表連接
JOIN products p ON oi.product_id = p.id  -- 取得產品資訊
LEFT JOIN productvariants pv ON oi.product_variant_id = pv.id  -- 取得變體資訊
LEFT JOIN product_reviews r 
    ON oi.order_item_id = r.order_item_id  -- 根據 order_item_id 確保同一訂單中的商品只被評論一次
    AND r.member_id = ?  -- 確保查詢的是當前會員的評論
WHERE o.member_id = ? 
  AND o.status = '已歸還'  -- 只查詢已歸還的訂單
ORDER BY 
    r.created_at DESC,   -- 依評論時間由新到舊排序
    o.added_at DESC;     -- 若無評論，則依訂單時間由新到舊排序

  `;

  try {
    const [rows] = await db.query(sql, [memberId, memberId]);
    return res.json({ success: true, products: rows });
  } catch (error) {
    return res.json({ success: false, error: error.message });
  }
});

//商品評價(讀取尚未評價資料)
router.get("/api/review/pending", async (req, res) => {
  
  const memberId = req.my_jwt?.id;
  console.log(memberId)
  if (!memberId) {
    return res.json({ success: false, error: "需要登入會員" });
  }

  const sql = `
SELECT 
    o.order_id, oi.product_id, p.name, p.image_url, 
    oi.product_variant_id, o.added_at, pv.weight, o.status, oi.order_item_id
FROM orders o
JOIN order_items oi ON o.order_id = oi.order_id  -- 訂單主表與詳情表連接
JOIN products p ON oi.product_id = p.id  -- 取得產品資訊
LEFT JOIN productvariants pv ON oi.product_variant_id = pv.id  -- 取得變體資訊
LEFT JOIN product_reviews r 
    ON oi.order_item_id = r.order_item_id  -- 用 order_item_id 確保同一訂單商品不重複評論
    AND r.member_id = ?  -- 限定當前會員的評論
WHERE o.member_id = ? 
  AND o.status = '已歸還'  
  AND r.order_item_id IS NULL  -- 只顯示該商品未評論的情況
ORDER BY o.added_at DESC;

  `;

  try {
    const [rows] = await db.query(sql, [memberId, memberId]);
    return res.json({ success: true, products: rows });
  } catch (error) {
    return res.json({ success: false, error: error.message });
  }
});




//商品評價(新增商品評價)
router.post("/api/add-review", async (req, res) => {
  const { product_id, rating, review_text, order_item_id } = req.body;
  const member_id = req.my_jwt?.id;

  if (!member_id) return res.status(401).json({ success: false, error: "未登入" });
  if (!product_id || !rating || !order_item_id) return res.status(400).json({ success: false, error: "缺少必要參數" });

  try {
      // 確保該會員真的租過這個商品並且該商品來自正確的訂單
      const [orderCheck] = await db.query(
        `SELECT 1 FROM orders o 
         JOIN order_items oi ON o.order_id = oi.order_id
         WHERE o.member_id = ? AND oi.product_id = ? AND oi.order_item_id = ? AND o.status = '已歸還'
         LIMIT 1`, 
        [member_id, product_id, order_item_id]
      );

      if (orderCheck.length === 0) {
        return res.status(403).json({ success: false, error: "無法評論未租借過的商品或該商品已經被評論過" });
      }

      // 插入新的評價
      await db.query(
        `INSERT INTO product_reviews (member_id, product_id, rating, review_text, created_at, order_item_id) 
         VALUES (?, ?, ?, ?, NOW(), ?)`, 
        [member_id, product_id, rating, review_text, order_item_id]
      );

      // 重新計算該商品的平均星等
      await db.query(
        `UPDATE products p 
         SET p.average_rating = (SELECT AVG(rating) FROM product_reviews WHERE product_id = ?) 
         WHERE p.id = ?`, 
        [product_id, product_id]
      );

      res.json({ success: true });
  } catch (error) {
      res.status(500).json({ success: false, error: error.message });
  }
});



//商品評價(編輯商品評價)
router.post("/api/edit-review", async (req, res) => {
  const { product_id, rating, review_text, order_item_id } = req.body;
  const memberId = req.my_jwt?.id;

  if (!memberId) return res.status(401).json({ success: false, error: "未登入" });
  if (!product_id || !rating || !order_item_id) return res.status(400).json({ success: false, error: "缺少必要參數" });

  try {
    // 檢查用戶是否有這筆商品租借且訂單已歸還
    const checkSql = `
      SELECT oi.product_id
      FROM orders o
      JOIN order_items oi ON o.order_id = oi.order_id
      WHERE o.member_id = ? AND oi.product_id = ? AND oi.order_item_id = ? AND o.status = '已歸還'
    `;
    const [rentedItems] = await db.query(checkSql, [memberId, product_id, order_item_id]);

    if (rentedItems.length === 0) {
      return res.status(400).json({ success: false, error: "該商品尚未租借或未歸還，無法編輯評論" });
    }

    // 確保該評論存在（要根據 order_item_id 查詢）
    const [existingReviews] = await db.query(
      "SELECT id FROM product_reviews WHERE member_id = ? AND product_id = ? AND order_item_id = ?",
      [memberId, product_id, order_item_id]
    );

    if (existingReviews.length === 0) {
      return res.status(400).json({ success: false, error: "評論不存在，無法編輯" });
    }

    // 更新評論
    await db.query(
      "UPDATE product_reviews SET rating = ?, review_text = ? WHERE member_id = ? AND product_id = ? AND order_item_id = ?",
      [rating, review_text, memberId, product_id, order_item_id]
    );

    // 重新計算該商品的平均星等
    await db.query(
      "UPDATE products SET average_rating = (SELECT AVG(rating) FROM product_reviews WHERE product_id = ?) WHERE id = ?",
      [product_id, product_id]
    );

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});




router.get("/api/:productId", async (req, res) => {
  const productId = req.params.productId;
  if (!/^\d+$/.test(productId)) {
    return res.json({ success: false, error: "無效的商品 ID" });
  }
  const memberId = req.my_jwt?.id; 
  const output = { success: false, data: null, relatedproducts: [] ,like_id : null, memberId : memberId};



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
      FROM products p
      JOIN categories c ON p.category_id = c.id
      LEFT JOIN productvariants pv ON p.id = pv.product_id
      WHERE p.id = ?
      GROUP BY p.id, p.product_code, p.name, p.description, c.category_name, 
         p.price, p.image_url, p.average_rating, p.created_at;
    `;

    const [rows] = await db.query(sql, [productId]);

    if (rows.length > 0) {
      let productData = rows[0];
      console.log();
      

      // 檢查所有 variants 是否 weight 為 null
      let hasValidvariants = productData.variants.some(variant => variant.weight !== null);

      // 如果所有 weight 都是 null，就設為 null
      productData.variants = hasValidvariants ? productData.variants : null;

      output.success = true;
      output.data = productData;

      // 取得相關產品
      const relatedSql = `
        SELECT p.id, p.name AS product_name, p.price, p.image_url, p.description, p.average_rating
        FROM products p
        JOIN categories c ON p.category_id = c.id
        WHERE c.category_name = ? AND p.id != ?
        LIMIT 4;
      `;

      const [relatedRows] = await db.query(relatedSql, [productData.category_name, productId]);
      output.relatedproducts = relatedRows;

      if (memberId) {
        const likeSql = `SELECT like_id FROM favorites WHERE member_id = ? AND product_id = ?`;
        const [likeRows] = await db.query(likeSql, [memberId, productId]);
        console.log(likeRows);
        output.like_id = likeRows.length > 0 ? likeRows[0].like_id : false;
      }
    }
  } catch (error) {
    output.error = error.message;
  }
  
  res.json(output);
});

router.get("/api/:productId/reviews", async (req, res) => {
  const productId = req.params.productId;
  const page = parseInt(req.query.page) || 1; // 預設為第 1 頁
  const limit = parseInt(req.query.limit) || 10; // 預設每次取 10 筆
  const offset = (page - 1) * limit; // 計算偏移量
  
  console.log(`Fetching reviews for product ${productId}, page ${page}, limit ${limit}`);

  if (!/^\d+$/.test(productId)) {
    return res.json({ success: false, error: "無效的商品 ID" });
  }

  try {
    const sql = `
      SELECT pr.id AS review_id, pr.rating, pr.review_text, pr.created_at, 
             m.member_id, m.name AS member_name
      FROM product_reviews pr
      JOIN member m ON pr.member_id = m.member_id
      WHERE pr.product_id = ?
      ORDER BY pr.created_at DESC
      LIMIT ? OFFSET ?;
    `;

    const [reviews] = await db.query(sql, [productId, limit, offset]);

    res.json({ success: true, reviews });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
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
console.log("product ID:", product_id);

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


router.delete("/api/favorites/:productId", async (req, res) => {
  const member_id = req.my_jwt?.id;
  const { productId } = req.params;

  if (!member_id) {
    return res.status(401).json({ success: false, error: "未登入" });
  }

  try {
    // 檢查該商品是否在用戶的收藏列表中
    const [existingFavorite] = await db.query(
      "SELECT * FROM favorites WHERE member_id = ? AND product_id = ?",
      [member_id, productId]
    );

    if (existingFavorite.length === 0) {
      return res.status(404).json({ success: false, error: "該商品不在收藏列表中" });
    }

    // 刪除收藏記錄
    const [result] = await db.query(
      "DELETE FROM favorites WHERE member_id = ? AND product_id = ?",
      [member_id, productId]
    );

    if (result.affectedRows > 0) {
      return res.json({ success: true, message: "商品已取消收藏" });
    } else {
      return res.status(400).json({ success: false, error: "刪除失敗，請稍後再試" });
    }
  } catch (error) {
    console.error("取消收藏錯誤:", error);
    return res.status(500).json({ success: false, error: "伺服器錯誤" });
  }
});




router.get("/api/review", async (req, res) => {
  const memberId = req.my_jwt?.id;
  if (!memberId) {
      return res.json({ success: false, error: "需要登入會員" });
  }

  const sql = `
      SELECT o.product_id, p.name, p.image_url
      FROM shop_orders o
      JOIN products p ON o.product_id = p.id
      WHERE o.member_id = ? AND o.status = '已歸還'
      ORDER BY added_at DESC;
  `;

  try {
    const [rows] = await db.query(sql, [memberId]);
    if (rows.length === 0) {
      return res.json({ success: true, products: [] });}
    res.json({ success: true, products: rows });
} catch (error) {
    res.json({ success: false, error: error.message });
}});

export default router;