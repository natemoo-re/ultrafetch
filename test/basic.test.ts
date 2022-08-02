import { withCache, isCached } from "../src/";
import { describe, it, expect, beforeEach } from "vitest";

const fetch = async (...args: any) =>
  new Response(null, {
    status: 200,
    headers: { "Cache-Control": `s-maxage=604800` },
  });

describe("sanity", () => {
  it("exports", () => {
    expect(withCache).toBeTypeOf("function");
    expect(isCached).toBeTypeOf("function");
  });

  it("comes with default cache", async () => {
    const fetchWithCache = withCache(fetch);
    await fetchWithCache("https://example.com/");
    const res = await fetchWithCache("https://example.com/");
    expect(isCached(res)).toBe(true);
  });
});

describe("basics", () => {
  let cache: Map<string, string>;
  let fetchWithCache: any;

  beforeEach(() => {
    cache = new Map();
    fetchWithCache = withCache(fetch, { cache });
  });

  it("appends to cache", async () => {
    expect(cache.size).toBe(0);
    const res = await fetchWithCache("https://example.com/");
    expect(isCached(res)).toBe(false);
    expect(res.status).toBe(200);
    expect(cache.size).toBe(1);
  });

  it("reads from cache", async () => {
    expect(cache.size).toBe(0);
    await fetchWithCache("https://example.com/");
    const res = await fetchWithCache("https://example.com/");
    expect(isCached(res)).toBe(true);
    expect(cache.size).toBe(1);
  });
});

describe("custom cache", () => {
  it("allows custom cache", async () => {
    const cache = new Map();
    let called = 0;
    const set = () => {
      called++;
      return cache;
    };
    cache.set = set;
    expect(cache.size).toBe(0);
    const fetchWithCache = withCache(fetch, { cache });
    const res1 = await fetchWithCache("https://example.com/");
    expect(res1.status).toBe(200);
    expect(called).toBe(1);
  });
});
