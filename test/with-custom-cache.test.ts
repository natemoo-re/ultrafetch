import withCache from "../src";
import { it, expect } from "vitest";

it("allows custom cache", async () => {
  const cache = new Map();
  let called = 0;
  const set = (key, value) => {
    called++;
    return cache;
  }
  cache.set = set;
  expect(cache.size).toBe(0);
  const fetchWithCache = withCache(fetch, { cache });
  const res1 = await fetchWithCache("https://example.com/");
  expect(res1.status).toBe(200);
  expect(called).toBe(1);
});
