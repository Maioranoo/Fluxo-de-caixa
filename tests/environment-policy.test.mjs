import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { assertPrivateEnvironment } from "../build/environment-policy.ts";

test("public environment prefixes fail without printing their values", () => {
  for (const name of ["VITE_API_KEY", "NEXT_PUBLIC_TOKEN"]) {
    assert.throws(() => assertPrivateEnvironment({ [name]: "sensitive-example-value" }), error => error.message.includes(name) && !error.message.includes("sensitive-example-value"));
  }
  assert.doesNotThrow(() => assertPrivateEnvironment({ ADMIN_EMAIL: "admin@example.com", API_KEY: "private-value" }));
});

test("build explicitly separates local and production authentication modes", async () => {
  const source = await readFile(new URL("../vite.config.ts", import.meta.url), "utf8");
  assert.match(source, /NODE_ENV: command === "serve" \? "development" : "production"/);
});
