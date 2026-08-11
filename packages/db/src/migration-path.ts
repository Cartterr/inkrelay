import path from "node:path";
import { fileURLToPath } from "node:url";

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));

export const databaseMigrationsPath = path.resolve(moduleDirectory, "../migrations");
