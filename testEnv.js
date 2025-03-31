
import dotenv from 'dotenv'
dotenv.config({ path: './dev.env' })

console.log("EMAIL_USER:", process.env.SMTP_TO_EMAIL);
console.log("EMAIL_PASS:", process.env.SMTP_TO_PASSWORD ? "已載入" : "未載入");
console.log("DB_HOST:", process.env.DB_HOST);
console.log("DB_USER:", process.env.DB_USER);
console.log("DB_PASSWORD:", process.env.DB_PASS ? "已載入" : "未載入");
console.log("DB_NAME:", process.env.DB_NAME);
