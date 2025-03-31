import multer from "multer";
import { v4 } from "uuid";
import path from "path";

// 篩選檔案和決定副檔名
const extMap = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

const fileFilter = (req, file, callback) => {
  callback(null, !!extMap[file.mimetype]);
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    let uploadPath = "public/img";

    const folder = req.query.folder || "avatar"; 
    uploadPath = path.join(uploadPath, folder);
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const f = v4() + extMap[file.mimetype];
    cb(null, f);
  },
});

export default multer({ fileFilter, storage });
