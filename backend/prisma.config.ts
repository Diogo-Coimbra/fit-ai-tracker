import 'dotenv/config';
import { defineConfig, env } from "@prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    // Usamos o env() do Prisma, que é mais seguro que o process.env
    url: env("DATABASE_URL"),
  },
});