import type { NextFunction, Request, RequestHandler, Response } from "express";

/** Express 4 doesn't route rejected promises to the error handler — this does. */
export function h(
  fn: (req: Request, res: Response, next: NextFunction) => unknown | Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
