import createFetch from "../dist/index.js";
import { test } from "uvu";
import * as assert from "uvu/assert";
import * as utils from "./utils";

const fetch = createFetch();

test.before(async () => {
  await utils.cleanup();
  assert.not(utils.cacheExists());
});

test("exports", () => {
  assert.type(createFetch, "function");
  assert.type(fetch, "function");
});

test("example", async () => {
  const res = await fetch("https://example.com");
  assert.equal(res.status, 200);
});

test("file", async () => {
  const res = await fetch(new URL("../package.json", import.meta.url));
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.name, "ultrafetch");
});

test("file 404", async () => {
  const res = await fetch(new URL("../does-not-exist.ts", import.meta.url));
  assert.equal(res.ok, false);
  assert.equal(res.status, 404);
});

test.run();
