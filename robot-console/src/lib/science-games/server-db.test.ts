import { describe, expect, it } from "vitest";
import { postgresDriverUrl } from "./server-db";

describe("science game database URL", () => {
  it("removes Prisma-only schema and pool parameters for postgres.js", () => {
    const value = "postgresql://reader:secret@example.test:5432/guoke?schema=public&connection_limit=12&sslmode=require";

    expect(postgresDriverUrl(value)).toBe("postgresql://reader:secret@example.test:5432/guoke?sslmode=require");
  });
});
