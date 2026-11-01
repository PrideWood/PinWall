import pg from "pg";
import { required } from "./config.js";
let pool: pg.Pool | undefined;
export function db() {
  return (pool ??= new pg.Pool({
    connectionString: required("DATABASE_URL"),
    max: 3,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 15000,
  }));
}
