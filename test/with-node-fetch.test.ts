import fetch from "node-fetch";
import { withCache, isCached } from "../src";
import { describe, it, expect } from "vitest";

describe("node-fetch", () => {
  it("works with Node Fetch", async () => {
    const cache = new Map();
    expect(cache.size).toBe(0);
    const fetchWithCache = withCache(fetch, { cache });
    const res1 = await fetchWithCache("https://example.com/");
    expect(isCached(res1)).toBe(false);
    expect(res1.status).toBe(200);
    expect(cache.size).toBe(1);
  });

  it("reads from cache", async () => {
    const cache = new Map();
    const fetchWithCache = withCache(fetch, { cache });
    await fetchWithCache("https://example.com/");
    expect(cache.size).toBe(1);
    const res = await fetchWithCache("https://example.com/");
    expect(isCached(res)).toBe(true);
    expect(cache.size).toBe(1);
  });
});
