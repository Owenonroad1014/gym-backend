import express from "express";
import db from "../utils/connect-mysql.js";



const router = express.Router();

function getRentalDays(startDate, endDate) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const diffTime = end - start;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays > 0 ? diffDays : 1; // 至少一天
}



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

    const orderAmount = items.reduce((total, item) => {
      const rentalDays = getRentalDays(item.rentalStartDate, item.rentalEndDate);
      return total + parseFloat(item.price) * item.quantity * rentalDays;
    }, 0);

    await connection.commit();
    res.json({ 
      orderId, 
      message: "訂單提交成功",
      orderAmount,
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


// 歷史訂單

router.get("/:memberId/api", async (req, res) => {
  const memberId = req.params.memberId;
  //const member_id = req.my_jwt?.id;
  try {
    // 撈出會員所有訂單
    const [orders] = await db.query(
      `SELECT 
         o.order_id,
         o.status,
         o.payment_status,
         o.payment_method,
         o.pickup_method,
         o.customer_name,
         o.customer_email,
         o.customer_phone,
         o.added_at
       FROM orders o
       WHERE o.member_id = ?
       ORDER BY o.added_at DESC
      `,
      [memberId]
    );

    if (orders.length === 0) {
      return res.json([]);
    }

    const orderIds = orders.map(o => o.order_id);

    // 撈出所有相關的 order_items
    const [items] = await db.query(
      `SELECT 
         oi.order_id,
         p.name AS product_name,
         oi.rental_start_date,
         oi.rental_end_date,
         oi.quantity,
         oi.price,
         oi.total_price
       FROM order_items oi
       JOIN products p ON oi.product_id = p.id
       WHERE oi.order_id IN (?)
      `,
      [orderIds]
    );

    // 把 order_items 塞回對應的訂單
    const ordersWithItems = orders.map(order => {
      const orderItems = items.filter(item => item.order_id === order.order_id);
      return {
        ...order,
        items: orderItems
      };
    });

    res.json(ordersWithItems);

  } catch (error) {
    console.error("取得會員訂單失敗：", error);
    res.status(500).json({ message: "伺服器錯誤", error: error.message });
  }
});   


// 取消訂單 API
router.post("/:orderId/cancel", async (req, res) => {
  const orderId = req.params.orderId;

  try {
    // 先查詢訂單是否存在
    const [orders] = await db.query(
      `SELECT status FROM orders WHERE order_id = ?`,
      [orderId]
    );

    if (orders.length === 0) {
      return res.status(404).json({ message: "找不到此訂單" });
    }

    const currentStatus = orders[0].status;

    // 只能取消「已下單」狀態的訂單
    if (currentStatus !== "已下單") {
      return res.status(400).json({ message: "此訂單無法取消" });
    }

    // 更新訂單狀態為「已取消」
    await db.query(
      `UPDATE orders SET status = '已取消' WHERE order_id = ?`,
      [orderId]
    );

    res.json({ message: "訂單已取消成功" });

  } catch (error) {
    console.error("取消訂單失敗：", error);
    res.status(500).json({ message: "伺服器錯誤", error: error.message });
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
