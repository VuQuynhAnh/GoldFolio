import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../src/app";
import { PriceService } from "../src/prices/service";
import { FakeSource, testDb } from "./helpers";

// Bản build web giả: chỉ cần index.html và một file tĩnh
const webDist = mkdtempSync(join(tmpdir(), "goldfolio-web-"));
mkdirSync(join(webDist, "assets"));
writeFileSync(join(webDist, "index.html"), "<!doctype html><title>GoldFolio</title>");
writeFileSync(join(webDist, "assets", "app.js"), "console.log('ok')");

let app: ReturnType<typeof createApp>;
beforeAll(async () => {
  const db = await testDb();
  app = createApp({ db, prices: new PriceService(db, [new FakeSource()]), webDist });
});

describe("server phục vụ luôn giao diện web khi deploy một service", () => {
  it("trả file tĩnh của bản build", async () => {
    const res = await request(app).get("/assets/app.js").expect(200);
    expect(res.text).toContain("console.log");
  });

  it("đường dẫn của web (mở thẳng hoặc tải lại trang) trả index.html", async () => {
    for (const path of ["/", "/lan-mua", "/sua/5", "/dang-nhap"]) {
      const res = await request(app).get(path).expect(200);
      expect(res.text).toContain("<title>GoldFolio</title>");
    }
  });

  it("đường dẫn /api không tồn tại vẫn trả lỗi JSON, không trả trang web", async () => {
    const res = await request(app).get("/api/khong-co").expect(404);
    expect(res.body).toEqual({ error: "Không tìm thấy" });
  });

  it("API vẫn chạy như cũ", async () => {
    const res = await request(app).get("/api/portfolio").expect(401);
    expect(res.body.error).toBe("Vui lòng đăng nhập");
  });
});
