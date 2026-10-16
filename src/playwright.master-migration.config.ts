import { defineConfig } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const data = (process.env.CAD_MASTER_MIGRATION_DIR ??= mkdtempSync(
  path.join(tmpdir(), "cad-master-migration-"),
));
const port = process.env.CAD_MASTER_MIGRATION_PORT ?? "3104";
const environment = {
  CAD_MASTER_MIGRATION_DIR: data,
  CAD_STORAGE_BACKEND: "local",
  DATABASE_URL: `file:${data}/db.sqlite`,
  CAD_STORAGE_PATH: `${data}/cad`,
  MAX_UPLOAD_SIZE_MB: "100",
};

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "master-migration.spec.ts",
  workers: 1,
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    viewport: { width: 1440, height: 1000 },
    trace: "retain-on-failure",
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
      args: [
        "--no-sandbox",
        "--use-angle=swiftshader",
        "--enable-unsafe-swiftshader",
      ],
    },
  },
  webServer: {
    command: `tsx tests/e2e/master-migration.setup.ts && npm run db:deploy && npm run start -- --port ${port}`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
    env: environment,
  },
});
