/**
 * transom-core 5.x ships no types. This declares only withMeta(), which
 * sequelizeRoutes uses. It is internal: .d.ts files in src/ aren't emitted, and no
 * exported type refers to it. Delete it once transom-core publishes its own types.
 */
declare module "@transomjs/transom-core" {
  import type { NextFunction, Response } from "express";

  type Handler<Req> = (req: Req, res: Response, next: NextFunction) => void;

  const TransomCore: {
    /** Sets res.locals.routeMeta = metadata, then calls the handler. */
    withMeta<Req>(metadata: Record<string, unknown>, handler: Handler<Req>): Handler<Req>;
  };
  export = TransomCore;
}
