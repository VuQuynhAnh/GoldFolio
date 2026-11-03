import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Một luồng: test dùng SQLite in-memory, chạy song song nhiều tiến trình
    // từng làm tràn bộ nhớ trên máy dev ít RAM.
    pool: "threads",
    poolOptions: { threads: { singleThread: true } },
  },
});
