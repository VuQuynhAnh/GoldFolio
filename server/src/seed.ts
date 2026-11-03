// Đồng bộ danh mục thương hiệu/sản phẩm vào DB (thêm hoặc cập nhật, không xoá dữ liệu).
import { openDb } from "./db";
import { seedCatalog } from "./catalog";

const db = openDb(process.env.DB_PATH ?? "data/goldfolio.sqlite");
seedCatalog(db);
const n = db.prepare("SELECT COUNT(*) AS n FROM products").get() as { n: number };
console.log(`Đã đồng bộ danh mục: ${n.n} sản phẩm`);
