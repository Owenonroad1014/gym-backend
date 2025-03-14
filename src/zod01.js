// 用法: > node zod01.js 測試的字串

import { z } from "zod";

const schema1 = z.string().min(3);

if (process.argv.length < 3) {
  console.log("請給要測試的參數");
  process.exit(); // 結束程式
}

const result = schema1.safeParse(process.argv[2])
// console.log(result);
console.log(JSON.stringify(result, null, 4));
