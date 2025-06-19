import path from "path";
import express from "express";

const app = express();
const PORT = process.env.PORT || 8080;

// public 폴더의 정적 파일 제공
app.use(express.static(path.join(__dirname, "..", "public")));

app.listen(PORT, () => {
  console.log(`▶ Server running at http://localhost:${PORT}`);
});
