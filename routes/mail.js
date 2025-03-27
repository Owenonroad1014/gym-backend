import express from 'express'
import transporter from '../utils/mail.js'
import 'dotenv/config.js'

const router = express.Router()

/* 寄送email的路由 */
router.get('/try-send', function (req, res, next) {
  // email內容
  const mailOptions = {
    from: `"GYMBOO"<${process.env.SMTP_TO_EMAIL}>`,
    to: `mwz236268@gmail.com`,
    subject: '這是一封測試電子郵件',
    text: `你好， \r\n通知你有關第一封郵件的事。\r\n\r\n敬上\r\n開發團隊`,
  }

  // 寄送
  transporter.sendMail(mailOptions, (err, response) => {
    if (err) {
      // 失敗處理
      return res.status(400).json({ message: 'Failure', detail: err })
    } else {
      // 成功回覆的json
      return res.json({ message: 'Success' })
    }
  })
})

export default router