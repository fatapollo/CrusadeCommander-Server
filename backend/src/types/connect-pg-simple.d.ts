// Minimal ambient declaration — the npm package ships JS only.
declare module 'connect-pg-simple' {
  import type { Store } from 'express-session';
  interface PGStoreOptions {
    pool?: any;
    tableName?: string;
    schemaName?: string;
    createTableIfMissing?: boolean;
    pruneSessionInterval?: number | false;
    ttl?: number;
    conString?: string;
    conObject?: object;
    errorLog?: (err: Error) => void;
  }
  type StoreCtor = new (options?: PGStoreOptions) => Store;
  function connectPgSimple(session: typeof import('express-session')): StoreCtor;
  export = connectPgSimple;
}
