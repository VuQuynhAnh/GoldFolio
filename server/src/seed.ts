// Đồng bộ danh mục thương hiệu/sản phẩm vào DB (thêm hoặc cập nhật, không xoá dữ liệu).
import { initSchema, poolDb } from "./db";
import { seedCatalog } from "./catalog";

try {
  const db = poolDb(process.env.DATABASE_URL, process.env.DB_SSL_CA);
  await initSchema(db);
  await seedCatalog(db);
  const row = await db.one<{ n: number }>("SELECT COUNT(*) AS n FROM products");
  console.log(`Đã đồng bộ danh mục: ${row?.n ?? 0} sản phẩm`);
  await db.close();
} catch (err) {
  // ECONNREFUSED là AggregateError có message rỗng: lấy thêm mã lỗi
  console.error(`Không kết nối được PostgreSQL: ${(err as Error).message || (err as { code?: string }).code || String(err)}`);
  process.exit(1);
}
