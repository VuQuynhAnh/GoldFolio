import type { ErrorRequestHandler, NextFunction, Request, RequestHandler, Response } from "express";

/** Lỗi trả về cho người dùng: thông báo tiếng Việt, `fields` = lỗi theo từng ô của form. */
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public fields?: Record<string, string>,
  ) {
    super(message);
  }
}

/** Express 4 không tự bắt lỗi của handler async. */
export const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    fn(req, res, next).catch(next);
  };

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message, fields: err.fields });
    return;
  }
  console.error(err);
  res.status(500).json({ error: "Có lỗi xảy ra, vui lòng thử lại" });
};

/** Id người dùng đã đăng nhập (requireUser đã kiểm). */
export function currentUserId(res: Response): number {
  return res.locals.userId as number;
}
