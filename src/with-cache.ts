import CachePolicy from "http-cache-semantics";
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

export function withCache<Fetch extends (...args: any) => any>(fetch: Fetch, opts?: WithCacheOptions): Fetch {
  const cache = opts?.cache ?? new Map();
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
    const maybeCachedItem = await cache.get(request.url);
    if (maybeCachedItem) {
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
      const response = modified ? revalidatedResponse : cachedResponseToWeb(cachedResponse);
      
      // Update the cache with the revalidated response
      await (cache as any).set(
        request.url,
        JSON.stringify({ policy: revalidatedPolicy.toObject(), response: webToCachedResponse(response) }),
        { ttl: revalidatedPolicy.timeToLive() }
      );
      // Return the revalidated Response
      return updateHeaders(revalidatedResponse, revalidatedPolicy.responseHeaders()) as ReturnType<Fetch>;
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
      request.url,
      JSON.stringify({ policy: policy.toObject(), response: await webToCachedResponse(response) }),
      { ttl: policy.timeToLive() }
    );

    return response as ReturnType<Fetch>;
  }) as Fetch;
}
