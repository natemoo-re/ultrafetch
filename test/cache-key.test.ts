import { withCache } from '../src/index';
import { it, expect, describe, beforeEach } from "vitest";
import stream from 'node:stream';

const fetch = async (...args: any) => new Response(null, { headers: { 'Cache-Control': `s-maxage=604800` }});


describe("Normalize URLs", () => {
  let cache: Map<string, string>;
  let fetchWithCache: any;
  const cachedKey = () => Array.from(cache.keys())[0];

  beforeEach(() => {
    cache = new Map();
    fetchWithCache = withCache(fetch, { cache });
  })

  it("strips empty path", async () => {
    await fetchWithCache("https://example.com/");
    expect(cachedKey()).toBe('GET:https://example.com')
  });

  it("sorts search params", async () => {
    await fetchWithCache("https://example.com/?a=1&b=2");
    await fetchWithCache("https://example.com/?b=2&a=1");
    expect(cache.size).toBe(1);
  });

  it("normalizes domain casing", async () => {
    await fetchWithCache("https://EXAMPLE.com/?a=1&b=2");
    await fetchWithCache("https://example.com/?b=2&a=1");
    expect(cache.size).toBe(1);
  });

  it("does not normalize params casing", async () => {
    await fetchWithCache("https://example.com/?a=1&b=2");
    await fetchWithCache("https://example.com/?A=1&B=2");
    expect(cache.size).toBe(2);
  });
});


describe("Cache Key", () => {
  let cache: Map<string, string>;
  let fetchWithCache: any;
  const cachedKey = () => Array.from(cache.keys())[0];

  beforeEach(() => {
    cache = new Map();
    fetchWithCache = withCache(fetch, { cache });
  })

  it('supports default GET', async () => {
    await fetchWithCache("https://example.com/");
    expect(cachedKey()).toBe('GET:https://example.com')
  })

  it('normalizes method casing', async () => {
    await fetchWithCache("https://example.com/", { method: 'get' });
    expect(cachedKey()).toBe('GET:https://example.com')
  })

  it('supports POST with string body', async () => {
    await fetchWithCache("https://example.com/", { method: 'post', body: '{}' });
    expect(cachedKey()).toBe('POST:https://example.com:13y')
  })

  it('supports POST with Blob body', async () => {
    await fetchWithCache("https://example.com/", { method: 'post', body: new Blob(['{}']) });
    expect(cachedKey()).toBe('POST:https://example.com:13y')
  })

  it('supports POST with Buffer body', async () => {
    await fetchWithCache("https://example.com/", { method: 'post', body: Buffer.from([123, 125]) });
    expect(cachedKey()).toBe('POST:https://example.com:13y')
  })

  it('supports POST with URLSearchParams body', async () => {
    await fetchWithCache("https://example.com/", { method: 'post', body: new URLSearchParams([['a', '1']]) });
    expect(cachedKey()).toBe('POST:https://example.com:pyW')
  })

  it('dedupes POST with URLSearchParams body', async () => {
    await fetchWithCache("https://example.com/", { method: 'post', body: new URLSearchParams([['a', '1'], ['b', '2']]) });
    await fetchWithCache("https://example.com/", { method: 'post', body: new URLSearchParams([['b', '2'], ['a', '1']]) });
    expect(cache.size).toBe(1)
    expect(cachedKey()).toBe('POST:https://example.com:2l6edi')
  })

  it('supports POST with FormData body', async () => {
    const body = new FormData();
    body.append('a', '1');
    await fetchWithCache("https://example.com/", { method: 'post', body });
    expect(cachedKey()).toBe('POST:https://example.com:1Bv2hw')
  })

  it('dedupes POSTs with different bodies', async () => {
    await fetchWithCache("https://example.com/", { method: 'post', body: '{"b":2}' });
    await fetchWithCache("https://example.com/", { method: 'post', body: '{"a":1}' });
    expect(cache.size).toBe(2)
  })

  it('does not support POST with web streaming body', async () => {
    await fetchWithCache("https://example.com/", { method: 'post', body: new ReadableStream() });
    expect(cache.size).toBe(0)
  })

  it('does not support POST with node streaming body', async () => {
    await fetchWithCache("https://example.com/", { method: 'post', body: new stream.Readable({}) });
    expect(cache.size).toBe(0)
  })
});

