import fs from "node:fs/promises";

const file = "public/imgs/9fe3f817-31bc-42f7-8a89-9079a03074fe.jpg";

try {
  await fs.access(file, fs.constants.W_OK);
  console.log("可以變更檔案: " + file);
  await fs.unlink(file);
} catch (ex) {
  console.log("無法變更檔案或者無法刪除檔案!: " + file);
}
