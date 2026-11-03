import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { Router, type RequestHandler } from "express";
import type { Db } from "../db";
import { HttpError, currentUserId } from "../http";

export const SESSION_COOKIE = "sid";
const SESSION_DAYS = 30;

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  return `${salt.toString("hex")}:${scryptSync(password, salt, 64).toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const expected = Buffer.from(hash, "hex");
  const actual = scryptSync(password, Buffer.from(salt, "hex"), expected.length);
  return timingSafeEqual(expected, actual);
}

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

/** Mọi API dữ liệu đều cần đăng nhập (ACC-BR-001). Gắn id người dùng vào res.locals. */
export function requireUser(db: Db): RequestHandler {
  return (req, res, next) => {
    const token = req.cookies?.[SESSION_COOKIE];
    const session = token
      ? (db.prepare("SELECT user_id, expires_at FROM sessions WHERE token_hash = ?").get(sha256(token)) as
          | { user_id: number; expires_at: string }
          | undefined)
      : undefined;
    if (!session || session.expires_at < new Date().toISOString()) {
      next(new HttpError(401, "Vui lòng đăng nhập"));
      return;
    }
    res.locals.userId = session.user_id;
    next();
  };
}

function readCredentials(body: unknown): { email: string; password: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  const email = typeof b.email === "string" ? b.email.trim().toLowerCase() : "";
  const password = typeof b.password === "string" ? b.password : "";
  return { email, password };
}

export function authRouter(db: Db): Router {
  const router = Router();

  const startSession = (res: import("express").Response, userId: number) => {
    const token = randomBytes(32).toString("base64url");
    const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000);
    db.prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)").run(sha256(token), userId, expires.toISOString());
    res.cookie(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      expires,
    });
  };

  router.post("/register", (req, res) => {
    const { email, password } = readCredentials(req.body);
    const fields: Record<string, string> = {};
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fields.email = "Email không hợp lệ";
    if (password.length < 8) fields.password = "Mật khẩu tối thiểu 8 ký tự";
    if (Object.keys(fields).length) throw new HttpError(400, Object.values(fields)[0]!, fields);
    if (db.prepare("SELECT 1 FROM users WHERE email = ?").get(email)) {
      throw new HttpError(409, "Email đã được đăng ký", { email: "Email đã được đăng ký" });
    }
    const user = db
      .prepare("INSERT INTO users (email, password_hash, created_at) VALUES (?, ?, ?) RETURNING id, email")
      .get(email, hashPassword(password), new Date().toISOString()) as { id: number; email: string };
    startSession(res, user.id);
    res.status(201).json({ user });
  });

  router.post("/login", (req, res) => {
    const { email, password } = readCredentials(req.body);
    const user = db.prepare("SELECT id, email, password_hash FROM users WHERE email = ?").get(email) as
      | { id: number; email: string; password_hash: string }
      | undefined;
    // Cùng một thông báo cho sai email và sai mật khẩu: không lộ email nào đã đăng ký
    if (!user || !verifyPassword(password, user.password_hash)) throw new HttpError(401, "Email hoặc mật khẩu không đúng");
    startSession(res, user.id);
    res.json({ user: { id: user.id, email: user.email } });
  });

  router.post("/logout", (req, res) => {
    const token = req.cookies?.[SESSION_COOKIE];
    if (token) db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(sha256(token));
    res.clearCookie(SESSION_COOKIE);
    res.json({ ok: true });
  });

  router.get("/me", requireUser(db), (_req, res) => {
    const user = db.prepare("SELECT id, email FROM users WHERE id = ?").get(currentUserId(res));
    res.json({ user });
  });

  return router;
}
