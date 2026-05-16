import type { Request, Response, NextFunction, RequestHandler } from 'express';

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export class BadRequest extends HttpError {
  constructor(message = 'Bad request') { super(400, message); }
}
export class Unauthorized extends HttpError {
  constructor(message = 'Unauthorized') { super(401, message); }
}
export class Forbidden extends HttpError {
  constructor(message = 'Forbidden') { super(403, message); }
}
export class NotFound extends HttpError {
  constructor(message = 'Not found') { super(404, message); }
}
export class Conflict extends HttpError {
  constructor(message = 'Conflict') { super(409, message); }
}

export function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<any>): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
}
