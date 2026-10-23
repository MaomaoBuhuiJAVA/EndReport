import postgres from "postgres";
import { createGameRepository, type GameDatabase, type GameQuery } from "./server-repository";

type GameSql = ReturnType<typeof postgres>;
let client: GameSql | null = null;

export function postgresDriverUrl(value: string) {
  const url = new URL(value);
  url.searchParams.delete("schema");
  url.searchParams.delete("connection_limit");
  return url.toString();
}

/** A lazy adapter: importing routes/building never connects or applies schema. */
export function getGameDatabase(): GameDatabase {
  const url = process.env.DATABASE_URL;
  if (!url || !/^postgres(?:ql)?:\/\//u.test(url)) throw new Error("Science game database configuration unavailable");
  if (!client) client = postgres(postgresDriverUrl(url), { max: 5, connect_timeout: 5, idle_timeout: 20, prepare: false });
  const sql = client;
  const query: GameQuery = async (text, values = []) => await sql.unsafe(text, values as postgres.ParameterOrJSON<never>[]) as never;
  return {
    query,
    transaction<T>(work: (query: GameQuery) => Promise<T>): Promise<T> {
      return sql.begin(async transaction => {
        const transactionQuery: GameQuery = async (text, values = []) => await transaction.unsafe(text, values as postgres.ParameterOrJSON<never>[]) as never;
        return work(transactionQuery);
      }) as Promise<T>;
    },
  };
}

export function getGameRepository() { return createGameRepository(getGameDatabase()); }
