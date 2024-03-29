import CachePolicy from "http-cache-semantics";
import { unique } from "shorthash";

import { webToCachePolicyRequest, webToCachePolicyResponse, cachedResponseToWeb, webToCachedResponse, updateHeaders } from './convert.js';
export { isCached } from './convert.js';

export interface AsyncMap<K, V> {
    clear(): Promise<void>;
    delete(key: K): Promise<boolean>;
    get(key: K): Promise<V | undefined>;
    has(key: K): Promise<boolean>;
    set(key: K, value: V): Promise<this>;
    readonly size: number;
}

type Cache = Map<string, string> | AsyncMap<string, string>;

export interface WithCacheOptions {
  cache?: Cache;
}

function normalizeURL(input: URL) {
  if (input.search) {
    input.searchParams.sort();
    input.search = `?${input.searchParams}`
  }
  if (input.pathname === '/') {
    return input.toString().replace(/\/$/, '');
  }
  return input.toString();
}

function getVaryKey(request: Request) {
  const url = new URL(request.url);
  return `VARY:${normalizeURL(url)}`
}

async function getCacheKey(cache: Cache, request: Request, init?: RequestInit) {
  if (init?.cache === 'no-store') return null;

  const url = new URL(request.url);
  const headers = Object.fromEntries(new Headers(init?.headers).entries());
  let key = `${request.method}:${normalizeURL(url)}`;

  if (Object.keys(headers).length !== 0) {
    const cachedVary = await cache.get(getVaryKey(request));
    if (cachedVary) {
      const vary = JSON.parse(cachedVary);
      if (vary === '*') {
        key += `:${unique(JSON.stringify(headers))}`;
      } else {
        let varies: Record<string, string> = {};
        for (const varyKey of vary.split(',').map((v: string) => v.trim().toLowerCase())) {
          if (headers[varyKey]) {
            varies[varyKey] = headers[varyKey];
          }
        }
        if (Object.keys(varies).length > 0) {
          key += `:${unique(JSON.stringify(varies))}`
        }
      }
    } else {
      key += `:${unique(JSON.stringify(headers))}`;
    }
  }
  
  if (['POST', 'PATCH', 'PUT'].includes(request.method)) {
    let body = init?.body;
    
    // If we can't read `body` or `body` is streamable, skip the cache by returning `undefined`.
    if (!body) return;
    if (body instanceof ReadableStream || (typeof body === 'object' && 'on' in (body as any))) return;

    // Convert valid `BodyInit` values to hashable strings
    if (body instanceof Blob) body = await body.text()
    if (body instanceof URLSearchParams) {
      body.sort();
      body = body.toString()
    }
    if (body instanceof FormData) {
      	const obj: Record<string, FormDataEntryValue> = {};
        for (const [key, value] of body) {
          obj[key] = value;
        }
        body = JSON.stringify(obj);
    }
    const hash = unique(body.toString());
    return `${key}:${hash}`;
  }
  return key;
}

export function withCache<Fetch extends (...args: any) => any>(fetch: Fetch, opts?: WithCacheOptions): Fetch {
  const cache = opts?.cache ?? new Map<string, string>();
  return (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    let request: Request;
    if (input instanceof Request) {
      request = input
    } else {
      if (input instanceof URL) {
        input = input.toString();
      }
      request = new Request(input, init);
    }
    const cacheKey = await getCacheKey(cache, request, init)
    // No valid cache key, skip custom logic
    if (!cacheKey) {
      return fetch(request.url, request);
    }
    
    const maybeCachedItem = await cache.get(cacheKey);
    if (typeof maybeCachedItem === "string") {
      // Deserialize cached policy and response
      const { policy: cachedPolicy, response: cachedResponse } = JSON.parse(maybeCachedItem);
      const policy = CachePolicy.fromObject(cachedPolicy);
      const cacheableRequest = webToCachePolicyRequest(request);
      
      // If cached response is still valid, return with updated headers
      if (policy.satisfiesWithoutRevalidation(cacheableRequest)) {
        return updateHeaders(cachedResponseToWeb(cachedResponse), policy.responseHeaders()) as ReturnType<Fetch>;
      }

      // Otherwise, let's revalidate the response
      const revalidationRequest = updateHeaders(request, policy.revalidationHeaders(cacheableRequest));
      const revalidatedResponse = await fetch(revalidationRequest);
      const { policy: revalidatedPolicy, modified } = policy.revalidatedPolicy(
        webToCachePolicyRequest(request),
        webToCachePolicyResponse(revalidatedResponse)
      );
      let response: Response = modified ? revalidatedResponse : cachedResponseToWeb(cachedResponse);
      // We can't store this response! Clear from the cache and return it.
      if (!revalidatedPolicy.storable()) {
        await cache.delete(cacheKey);
        return response;
      }

      response = updateHeaders(response, revalidatedPolicy.responseHeaders())

      // Update the cache with the revalidated response
      await (cache as any).set(
        cacheKey,
        JSON.stringify({ policy: revalidatedPolicy.toObject(), response: await webToCachedResponse(response) }),
        { ttl: revalidatedPolicy.timeToLive() }
      );

      const vary = response.headers.get('vary');
      if (vary) {
        await (cache as any).set(
          getVaryKey(request),
          JSON.stringify(vary),
          { ttl: revalidatedPolicy.timeToLive() }
        );
      }

      // Return the revalidated Response
      return response as ReturnType<Fetch>;
    }

    // node-fetch needs a URL first
    const response = await fetch(request.url, request);
    const policy = new CachePolicy(webToCachePolicyRequest(request), webToCachePolicyResponse(response));

    // We can't store this response! Just return it.
    if (!policy.storable()) {
      return response;
    }
    
    // Store CachePolicy and Response in the cache
    await (cache as any).set(
      cacheKey,
      JSON.stringify({ policy: policy.toObject(), response: await webToCachedResponse(response) }),
      { ttl: policy.timeToLive() }
    );

    const vary = response.headers.get('vary');
    if (vary) {
      await (cache as any).set(
        getVaryKey(request),
        JSON.stringify(vary),
        { ttl: policy.timeToLive() }
      );
    }

    return response as ReturnType<Fetch>;
  }) as Fetch;
}
