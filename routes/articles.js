import express from "express";
import db from "../untils/connect-mysql.js";

const router = express.Router();
const getListData = async (req) => {
    const output = {
        success: false,
        redirect: undefined, // 提示頁面要做跳轉
        perPage: 12,
        totalRows: 0,
        totalPages: 0,
        page: 0,
        rows: [],
        keyword: "",
        category: "",
    };
    const member_id = req.my_jwt?.id;

    const perPage = output.perPage;
    let page = +req.query.page || 1;
    let keyword = req.query.keyword ? req.query.keyword.trim() : "";
    let category = req.query.category;
    let where = ` WHERE 1 `;
    if (category) {
        output.category = category;
        let category_ = db.escape(category);
        where += ` AND article_categories.name = ${category_} `;
    }
    if (keyword) {
        output.keyword = keyword;
        let keyword_ = db.escape(`%${keyword}%`);
        where += ` AND (articles.title LIKE ${keyword_} OR articles.intro LIKE ${keyword_}) `;
    }

    if (page < 1) {
        output.redirect = `?page=1`;
        return output;
    }
    try {
        // 獲取總筆數
        const t_sql = `SELECT COUNT(*) AS totalRows FROM articles  left join article_categories on category_id = article_categories.id ${where} `;
        const [[{ totalRows }]] = await db.query(t_sql); // 取得總筆數

        // 計算總頁數
        const totalPages = Math.ceil(totalRows / perPage);

        if (page > totalPages) {
            output.redirect = `?page=${totalPages}`;
            return output;
        }

        let rows = [];
        if (totalRows > 0) {
            // 確保頁碼不超過總頁數
            if (page > totalPages) {
                output.redirect = `?page=${totalPages}`;
                return output;
            }
            // 獲取文章列表並檢查是否有收藏的資訊
            if (member_id) {
                const sql = `
              SELECT articles.*, l.like_id,article_categories.name
              FROM articles
              LEFT JOIN (
                  SELECT * FROM article_favorites WHERE member_id = ${member_id}
              ) l ON articles.id = l.article_id left join article_categories on category_id = article_categories.id  ${where} 
              LIMIT ${(page - 1) * perPage}, ${perPage};`;
                [rows] = await db.query(sql);
            } else {
                let sql = `
                SELECT articles.*, article_categories.name
                FROM articles left join article_categories on category_id = article_categories.id
                ${where}
                LIMIT ${(page - 1) * perPage}, ${perPage};
              `;
                [rows] = await db.query(sql);
            }
        }

        return { ...output, totalRows, totalPages, page, rows, success: true };
    } catch (err) {
        console.error("Error occurred while fetching article list:", err);
        output.error = "資料加載失敗，請稍後再試。";
        return output;
    }
};
/* 獲取所有文章. */
router.get("/api", async function (req, res) {
    const data = await getListData(req);
    res.json(data);
});

/* 獲取文章top5. */
router.get("/api/top-five", async (req, res) => {
    const output = {
        success: false, //有沒有完成操作
        data: "",
        error: "",
    };
    const sql = `
  select * from articles order by views desc limit 5;
  `;
    const [data] = await db.query(sql);
    output.data = data;
    if (data.length > 0) {
        output.success = true;
        output.data = data;
    } else {
        output.success = false;
        output.error = "沒有文章";
    }
    res.json(output);
});
/* 獲取文章我的最愛. */
router.get("/api/toggle-likes/:articleid", async (req, res) => {
    const output = {
        success: false, //有沒有完成操作
        action: "", //add,remove  // 5. 回應時， "加入"或 "移除",哪一個項目
        article_id: 0, //操作哪個項目
        error: "",
    };
    // 1. 先判斷有沒有登入
    const member_id = req.my_jwt?.id;

    if (!member_id) {
        output.error = "需要登入會員";
        return res.json(output);
    }
    const article_id = +req.params.articleid || 0;
    if (!article_id) {
        output.error = "項目編號必須是整數";
        return res.json(output);
    }
    // 2. 有沒有這個項目
    const sql = `
      select  memberlike.like_id from articles left join (SELECT * FROM article_favorites WHERE member_id=?) memberlike on articles.id = memberlike.article_id WHERE articles.id =?;
      `;
    const [rows] = await db.query(sql, [member_id, article_id]);
    if (!rows.length) {
        output.error = "沒有該項目";
        return res.json(output);
    }
    output.article_id = article_id;
    const like_id = rows[0].like_id;
    if (like_id) {
        // 3. 有就移除
        output.action = "remove";
        const sql = `DELETE FROM article_favorites WHERE like_id=?`;
        const [result] = await db.query(sql, [like_id]);
        output.result = result;
        output.success = !!result.affectedRows;
    } else {
        // 4. 沒有就加入
        output.action = "add";
        const sql = `INSERT INTO article_favorites (member_id, article_id) VALUES (?, ?) `;
        const [result] = await db.query(sql, [member_id, article_id]);
        output.result = result;
        output.success = !!result.affectedRows;
        //output.like_id = result.insertId
    }
    res.json(output);
});
/* 獲取單一文章. */
router.get("/api/:articleid", async function (req, res) {
    // const output = await getItemById(req.params.articleid);
    // return res.json(output);
    const articleid = Number(req.params.articleid);
    const [articles] = await db.query(
        `SELECT * FROM articles WHERE id =${articleid}`
    );

    const article = articles[0];
    if (article) {
        await db.query("UPDATE articles SET views = views + 1 WHERE id = ?", [
            articleid,
        ]);
    }
    res.status(200).json({
        status: "success",
        data: article,
    });
});

/* 獲取分類推薦. */
router.get("/api/recommand/:articleid", async function (req, res) {
    // const output = await getItemById(req.params.articleid);
    // return res.json(output);
    const articleid = Number(req.params.articleid);
    const member_id = req.my_jwt?.id;
    let articles = [];
    if (member_id) {
        [articles] = await db.query(`SELECT * 
        FROM articles
        LEFT JOIN article_categories 
            ON articles.category_id = article_categories.id
        LEFT JOIN article_favorites ON articles.id = article_favorites.article_id
        WHERE parent_id = (
            SELECT parent_id 
            FROM articles 
            LEFT JOIN article_categories 
                ON articles.category_id = article_categories.id
            WHERE articles.category_id = (
                SELECT category_id 
                FROM articles 
                WHERE id = ${articleid}
            )
            LIMIT 1
        );`);
    } else {
        [articles] = await db.query(
            `SELECT * 
            FROM articles
            LEFT JOIN article_categories 
                ON articles.category_id = article_categories.id
            WHERE parent_id = (
                SELECT parent_id 
                FROM articles 
                LEFT JOIN article_categories 
                    ON articles.category_id = article_categories.id
                WHERE articles.category_id = (
                    SELECT category_id 
                    FROM articles 
                    WHERE id = ${articleid}
                )
                LIMIT 1
            );`
        );
    }
    res.status(200).json({
        status: "success",
        data: articles,
    });
});

export default router;
