import express from "express";
import jwt from "jsonwebtoken";
import session from "express-session";
import bcrypt from "bcrypt";
import mysql_session from "express-mysql-session";
import moment from "moment-timezone";
import cors from "cors";
import db from "./utils/connect-mysql.js";
// import multer from "multer";
// const upload = multer({ dest: "tmp_uploads/" });
import upload from "./utils/upload-images.js";
import admin2Router from "./routes/admin2.js";
import abRouter from "./routes/address-book.js";
import coachesRouter from "./routes/coaches.js";
import productsRouter from "./routes/products.js";
import videosRouter from "./routes/videos.js";
import articlesRouter from "./routes/articles.js";
import friendsRouter from "./routes/friends.js";
import classesRouter from "./routes/classes.js";
import locationsRouter from "./routes/locations.js";
import registerRouter from "./routes/register.js";
// import googleLoginRouter from './routes/google-login.js'
import chatsRouter from "./routes/chats.js";
import gymfriendsRouter from "./routes/gymfriends.js";
import memberCenterRouter from "./routes/member-center.js";
import mailRouter from './routes/mail.js'
import changePassRouter from './routes/change-password.js'
import profileRouter from './routes/profile.js'

const MysqlStore = mysql_session(session);
const sessionStore = new MysqlStore({}, db);

const app = express();

app.set("view engine", "ejs");

// 設定靜態內容資料夾
app.use(express.static("public"));
app.use("/bootstrap", express.static("node_modules/bootstrap/dist"));

// **** top-level middlewares 頂層中介軟體 ****
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
const corsOptions = {
  credentials: true,
  origin: (origin, callback) => {
    // console.log({ origin });
    callback(null, true);
  },
};
app.use(cors(corsOptions));
app.use(
  session({
    saveUninitialized: false,
    resave: false,
    secret: "sdkgh9845793KUKJ87453894",
    // cookie: {
    // maxAge: 1200_000
    // }
    store: sessionStore,
  })
);

// **** 自訂的 top-level middlewares ****
app.use((req, res, next) => {
  res.locals.title = "小新的網站"; // 預設的 "頁面 title"
  res.locals.pageName = "";
  res.locals.query = req.query; // 讓所有的 EJS 頁面取得 query string 參數
  res.locals.session = req.session; // 讓所有的 EJS 頁面可以取得 session 的資料
  res.locals.originalUrl = req.originalUrl;

  const auth = req.get("Authorization");

  if (auth && auth.indexOf("Bearer ") === 0) {
    const token = auth.slice(7); // 去掉 'Bearer '

    try {
      // 如果有成功解開 token, 把資料掛在 req.my_jwt
      req.my_jwt = jwt.verify(token, process.env.JWT_KEY);
    } catch (ex) {}
  }

  next(); // 讓路由判斷往下進行
});

// 定義路由
// app.use('/api/auth',googleLoginRouter)
app.use("/register", registerRouter);
app.use('/forget-password',mailRouter)
app.use("/change-password", changePassRouter)
app.use('/api/member',profileRouter)
app.use("/admin2", admin2Router);
app.use("/address-book", abRouter);
app.use("/coaches", coachesRouter);
app.use("/products", productsRouter);
app.use("/videos", videosRouter);
app.use("/classes", classesRouter);
app.use("/articles", articlesRouter);
app.use("/friends", friendsRouter);
app.use("/locations", locationsRouter);
app.use("/gymfriends", gymfriendsRouter);
app.use("/chats", chatsRouter);
app.use("/memberCenter", memberCenterRouter);


app.get("/", (req, res) => {
  res.locals.title = "首頁 - " + res.locals.title;
  res.locals.pageName = "home";
  res.render("home", { name: "小八" });
});

app.get("/json-sales", (req, res) => {
  res.locals.title = "業務員 - " + res.locals.title;
  res.locals.pageName = "json-sales";
  const sales = [
    { name: "Bill", age: 28, id: "A001" },
    { name: "Peter", age: 32, id: "A002" },
    {
      name: "Carl",
      age: 29,
      id: "A003",
    },
  ];

  res.render("json-sales", { sales });
});

app.get("/try-qs", (req, res) => {
  res.json(req.query);
});

// upload.none(): 解析 multipart/form-data 的格式
app.post("/try-post", upload.none(), (req, res) => {
  res.json(req.body);
});

app.get("/try-post-form", (req, res) => {
  //res.render("try-post-form", {email:"", password:""});
  res.render("try-post-form");
});

app.post("/try-post-form", (req, res) => {
  res.render("try-post-form", { ...req.body });
});

app.post("/try-upload", upload.single("avatar"), (req, res) => {
  res.json(req.file);
});

app.post("/try-uploads", upload.array("photos"), (req, res) => {
  res.json(req.files);
});

app.get("/yahoo", async (req, res) => {
  const r = await fetch("https://tw.yahoo.com/");
  const txt = await r.text();
  res.send(txt);
});

app.get("/my-params1/:action?/:id?", (req, res) => {
  res.json(req.params);
});

app.get(/^\/m\/09\d{2}-?\d{3}-?\d{3}$/i, (req, res) => {
  let u = req.url.slice(3); // 跳過前三個字元 (前三個字元不要)
  u = u.split("?")[0]; // 取 ? 號前的字串
  u = u.split("-").join("");
  res.json({ 資料: u });
});

app.get("/try-sess", (req, res) => {
  req.session.myNumber = req.session.myNumber || 1;
  req.session.myNumber++;

  res.json(req.session);
});

app.get("/try-moment", (req, res) => {
  const fm = "YYYY-MM-DD HH:mm:ss";
  const fm2 = "YYYY-MM-DD";

  const m1 = moment();
  const m2 = moment("2024-02-29");
  const m3 = moment("2023-02-29");

  res.json({
    m1: m1.format(fm),
    m2: m2.format(fm),
    m3: m3.format(fm),
    m1v: m1.isValid(),
    m2v: m2.isValid(),
    m3v: m3.isValid(),
    m1z: m1.tz("Europe/London").format(fm),
    m2z: m2.tz("Europe/London").format(fm),
  });
});

app.get("/try-db", async (req, res) => {
  const sql = "SELECT * FROM address_book LIMIT 3";
  const [results, fields] = await db.query(sql);
  res.json({ results, fields });
});
// 登入的表單頁
app.get("/login", async (req, res) => {
  res.locals.title = "登入 - " + res.locals.title;
  res.locals.pageName = "login";
  res.render("login");
});
// 處理登入的表單
app.post("/login", upload.none(), async (req, res) => {
  const output = {
    success: false,
    bodyData: req.body,
    code: 0,
  };
  let { email, password } = req.body;
  if (!email || !password) {
    output.code = 460; // 兩個欄位是必填的
    return res.json(output);
  }
  email = email.trim().toLowerCase(); // 去掉頭尾空白字元
  password = password.trim();

  const sql = `SELECT * FROM member WHERE email=? `;
  const [rows] = await db.query(sql, [email]);
  if (!rows.length) {
    output.code = 400; // 表示帳號是錯的
    return res.json(output);
  }
  const row = rows[0];
  const compare = await bcrypt.compare(password, row.password_hash);
  if (!compare) {
    output.code = 420; // 表示密碼是錯的
    return res.json(output);
  }

  // 狀態記錄在 session 裡
  req.session.admin = {
    email,
    member_id: row.member_id,
    nickname: row.nickname,
  };
  output.success = true;
  return res.json(output);
});
// 登出
app.get("/logout", async (req, res) => {
  delete req.session.admin;
  if (req.query.u) {
    return res.redirect(req.query.u);
  }
  res.redirect("/");
});

/*
// react project
app.use("/", express.static("build"));
app.get("*", (req, res) => {
  res.send(
    `<!doctype html><html lang="zh"><head><meta charset="utf-8"/><link rel="icon" href="/favicon.ico"/><meta name="viewport" content="width=device-width,initial-scale=1"/><meta name="theme-color" content="#000000"/><meta name="description" content="Shinder react hooks"/><link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.2.3/dist/css/bootstrap.min.css"/><title>Shinder react hooks</title><script defer="defer" src="/static/js/main.6a205622.js"></script></head><body><noscript>You need to enable JavaScript to run this app.</noscript><div id="root"></div></body></html>`
  );
});
*/

// *** 打包成 token
app.get("/try-jwt1", (req, res) => {
  const data = {
    id: 17,
    account: "Shinder",
  };

  const token = jwt.sign(data, process.env.JWT_KEY);
  res.json({ token });
});
// *** 解開 token
app.get("/try-jwt2", (req, res) => {
  const token =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MTcsImFjY291bnQiOiJTaGluZGVyIiwiaWF0IjoxNzQxNzQ3NTc0fQ.gVnhnVzaXRfmPboNy8sN1W39favgrUImlOmyE5COcdk";
  try {
    const payload = jwt.verify(token, process.env.JWT_KEY);
    res.json(payload);
  } catch (ex) {
    res.json({ msg: "發生錯誤", ex });
  }
});

app.post("/login-jwt", async (req, res) => {
  let { account, password } = req.body || {};
  const output = {
    success: false,
    error: "",
    code: 0,
    data: {
      id: 0,
      account: "",
      avatar: "",
      name:"",
      token: "",
    },
  };
  account = account?.trim(); // 去掉頭尾空白
  password = password?.trim();
  if (!account || !password) {
    output.error = "欄位資料不足";
    output.code = 400;
    return res.json(output);
  }

  const sql =
    "SELECT member.*, member_profile.avatar FROM member LEFT JOIN member_profile on member.member_id = member_profile.member_id WHERE email = ?";
  const [rows] = await db.query(sql, [account]);
  if (!rows.length) {
    output.error = "帳號或密碼錯誤";
    output.code = 410; // 帳號是錯的
    return res.json(output);
  }

  const row = rows[0];
  // const avatarUrl = row.avatar
  //   ? `/img/avatar/${row.avatar}`
  //   : "";
  const result = await bcrypt.compare(password, row.password_hash);
  if (!result) {
    output.error = "帳號或密碼錯誤";
    output.code = 420; // 密碼是錯的
    return res.json(output);
  }
  output.success = true; // 登入成功
  const token = jwt.sign(
    {
      id: row.member_id,
      account: row.email,
    },
    process.env.JWT_KEY
  );

  output.data = {
    id: row.member_id,
    account: row.email,
    avatar: row.avatar,
    name:row.name,
    token,
  };
  res.json(output);
});

app.get("/jwt-data", (req, res) => {
  res.json(req.my_jwt);
});

// app.use("/change-password",changePassRouter)
// ************** 404 要在所有的路由之後 ****************
app.use((req, res) => {
  res.status(404).send(`<h1>您走錯路了</h1>
    <p><img src="/imgs/404.webp" width="300" /></p>
    `);
});

// ******************************
const port = process.env.WEB_PORT || 3002;
app.listen(port, () => {
  console.log(`伺服器啟動, 使用的 port: ${port}`);
});
