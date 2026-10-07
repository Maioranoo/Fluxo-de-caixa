import test from "node:test";
import assert from "node:assert/strict";
import { assertSafeImageRequest } from "../app/lib/server/image-security.ts";

test("image optimizer rejects cache-fragmenting deployment parameters", () => {
  assert.throws(() => assertSafeImageRequest(new Request("https://app.example/_vinext/image?url=%2Fog.png&w=640&q=75&dpl=attacker")), { status: 400 });
  assert.doesNotThrow(() => assertSafeImageRequest(new Request("https://app.example/_vinext/image?url=%2Fog.png&w=640&q=75")));
});
