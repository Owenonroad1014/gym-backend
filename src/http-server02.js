import http from "node:http";
import fs from "node:fs/promises";

const server = http.createServer(async (req, res) => {
  const jsonStr = JSON.stringify({ ...req.headers, url: req.url }, null, 4);
  // 把文字資料寫入檔案 (執行位置為參考位置)
  await fs.writeFile(`./headers.txt`, jsonStr);

  res.writeHead(200, {
    "Content-Type": "application/json; charset=utf-8",
  });
  res.end(jsonStr);
});

server.listen(3000); // 偵聽哪個 port
