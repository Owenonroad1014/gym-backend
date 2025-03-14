import http from "node:http";

const server = http.createServer((req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
  }).end(`<h1>Hello 小吉</h1>
      <h2>${req.url}</h2>
      `);
});

server.listen(3000); // 偵聽哪個 port
