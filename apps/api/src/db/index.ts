import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

// Workers はリクエストごとに D1 バインディングが渡るため、
// drizzle インスタンスもリクエスト内で生成する。
export function createDb(d1: D1Database) {
  return drizzle(d1, { schema });
}

export type Db = ReturnType<typeof createDb>;
