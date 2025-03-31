import express from "express";
import db from "../utils/connect-mysql.js";



const router = express.Router();



router.post("/api", async (req, res) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const { items, paymentMethod, pickupMethod, customerInfo } = req.body;

    // 驗證購物車
    if (!items || items.length === 0) {
      return res.status(400).json({ message: "購物車是空的，無法提交訂單。" });
    }

    // 插入 orders 表
    const orderSql = `
      INSERT INTO orders 
        (member_id, customer_name, customer_phone, customer_email, 
         status, payment_status, pickup_method, payment_method)  
      VALUES (?, ?, ?, ?, '已下單', '未付款', ?, ?)
    `;
    const orderValues = [
      customerInfo.memberId, 
      customerInfo.name, 
      customerInfo.phone,
      customerInfo.email,
      pickupMethod,
      paymentMethod
    ];

    const [orderResult] = await connection.query(orderSql, orderValues);
    const orderId = orderResult.insertId;

    if (!orderId) {
      throw new Error('無法獲取 orderId');
    }

    // 插入 order_items 表，根據實際表結構調整
    const itemSql = `
      INSERT INTO order_items 
        (order_id, product_id, product_variant_id, 
         rental_start_date, rental_end_date, quantity, price)  
      VALUES ?
    `;
    const itemValues = items.map(item => [
      orderId,
      item.id,
      item.productVariantId || null, // 處理可能為空的 product_variant_id
      item.rentalStartDate,
      item.rentalEndDate,
      item.quantity,
      parseFloat(item.price)
    ]);

    await connection.query(itemSql, [itemValues]);

    await connection.commit();
    res.json({ 
      orderId, 
      message: "訂單提交成功",
      customerInfo: {
        name: customerInfo.name,
        phone: customerInfo.phone,
        email: customerInfo.email
      }
    });

  } catch (error) {
    await connection.rollback();
    console.error("訂單提交失敗：", error);
    res.status(500).json({ 
      message: "伺服器錯誤，請稍後再試",
      error: error.message 
    });
  } finally {
    if (connection) connection.release();
  }
});

// SELECT 
//     m.member_id, 
//     m.name, 
//     m.email, 
//     mp.mobile
// FROM members AS m
// JOIN member_profile AS mp ON m.member_id = mp.member_id;







export default router;
