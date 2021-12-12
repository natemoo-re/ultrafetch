import type { RequestInfo, RequestInit } from 'node-fetch';
import type { CachePolicyObject } from 'http-cache-semantics';

import { fileURLToPath, } from 'url';
import { createReadStream, statSync } from 'fs';
import httpFetch, { Request, Response } from 'node-fetch';
import cacache from 'cacache';
import CachePolicy from 'http-cache-semantics';

const CACHE_VERSION = 0;

export interface UltraFetchOptions {
    cacheDir?: URL;
}

interface CacheValue {
    policy: CachePolicy;
    response: Response;
}

interface CacheValueObject {
    policy: CachePolicyObject;
    response: Response;
}

const key = (url: string) => `v${CACHE_VERSION}::${url}`;

class Cache {
    private cachePath: string;
    private initPromise: Promise<any>;
    private state: 'init'|'ready' = 'init';
    private items = new Set<string>();
    
    constructor(cacheDir: URL) {
        this.cachePath = fileURLToPath(cacheDir);
        this.initPromise = cacache.ls(this.cachePath).then(contents => {
            for (const key of Object.keys(contents)) {
                this.items.add(key);
            }
        }).then(() => {
            this.state = 'ready';
        })
    }

    async ready() {
        if (this.state === 'ready') return;
        return this.initPromise;
    }

    async set(url: string, value: CacheValue, ttl: number) {
        await this.ready();
        const data = JSON.stringify({
            policy: value.policy.toObject(),
            response: serialize(value.response)
        })
        await cacache.put(this.cachePath, key(url), data, { metadata: ttl });
        this.items.add(key(url))
    }

    async has(url: string): Promise<boolean> {
        await this.ready();
        return this.items.has(key(url));
    }

    async get(url: string): Promise<CacheValue|undefined> {
        await this.ready();
        if (!(await this.has(url))) {
            return undefined;
        }
        let result: cacache.GetCacheObject|undefined;
        try {
            result = await cacache.get(this.cachePath, key(url));
        } catch (e) {
            return undefined;
        }
        const data = JSON.parse(result.data.toString()) as CacheValueObject;
        const value = {
            policy: CachePolicy.fromObject(data.policy),
            response: new Response(null, {
                headers: data.response.headers,
                status: data.response.status
            })
        }
        return value;
    }
}

function serialize(reqOrRes: Request): CachePolicy.Request;
function serialize(reqOrRes: Response): CachePolicy.Response;
function serialize(reqOrRes: Request|Response): Record<string, any> {
    if (reqOrRes instanceof Request) {
        const { url, method, headers } = reqOrRes;
        const record: Record<string, any> = {};
        headers.forEach((value, key) => {
            record[key] = value;
        })
        return { url, method, headers: record }
    }
    if (reqOrRes instanceof Response) {
        const { headers, status } = reqOrRes;
        const record: Record<string, any> = {};
        headers.forEach((value, key) => {
            record[key] = value;
        })
        return { status, headers: record }
    }
    return JSON.parse(JSON.stringify(reqOrRes));
}

const exists = (path: string): boolean => {
    try {
        return statSync(path).isFile()
    } catch (e) {}
    return false;
}

// Wrap `node-fetch` to also handle `file:` protocol
async function fetch(url: RequestInfo|URL, init?: RequestInit): Promise<Response> {
    if (url instanceof URL) {
        url = url.toString();
    }
    const request = new Request(url, init);
    const { protocol } = new URL(request.url);
    switch (protocol) {
        case 'http:':
        case 'https:':
            return httpFetch(url, init);
        case 'file:': {
            const filePath = fileURLToPath(request.url);
            if (exists(filePath)) {
                const stream = createReadStream(fileURLToPath(request.url), { encoding: 'utf-8' });
                return new Response(stream)
            } else {
                return new Response(null, { status: 404, statusText: "Not Found" })
            }
        }
        default: 
            throw new Error(`Unable to fetch content using the ${protocol} protocol!`)
    }
}

// Creates a version of `fetch` backed by a spec-compliant cache
class UltraFetch {    
    private cache: Cache;
    
    constructor(opts?: UltraFetchOptions) {
        let cacheDir = opts?.cacheDir ?? new URL('../node_modules/.cache/ultrafetch', import.meta.url);
        this.cache = new Cache(cacheDir);
        this.fetch = this.fetch.bind(this);
    }

    async fetch(url: RequestInfo|URL, init?: RequestInit): Promise<Response> {
        if (url instanceof URL) {
            url = url.toString();
        }
        const request = new Request(url, init);
        
        let cached: CacheValue|undefined;
        if (await this.cache.has(request.url)) {
            cached = await this.cache.get(request.url);
        }

        if (cached) {
            const { policy, response } = cached;
            // Ocassionally, we know that the response can be cached
            if (policy && policy.satisfiesWithoutRevalidation(serialize(request))) {
                for (const [key, value] of Object.entries(policy.responseHeaders())) {
                    if (Array.isArray(value)) {
                        value.forEach(val => response.headers.append(key, val))
                    } else if (typeof value !== 'undefined') {
                        response.headers.append(key, value);
                    }
                }

                return response;
            }

            if (policy && !policy.satisfiesWithoutRevalidation(serialize(request))) {
                const revalidationHeaders = policy.revalidationHeaders(serialize(request));
                
                Object.entries(revalidationHeaders).forEach(([key, value]) => {
                    if (Array.isArray(value)) {
                        value.forEach(val => request.headers.append(key, val))
                    } else if (typeof value !== 'undefined') {
                        request.headers.append(key, value);
                    }
                });

                const newResponse = await fetch(request);

                const { policy: newPolicy, modified } = policy.revalidatedPolicy(
                    serialize(request),
                    serialize(newResponse),
                );
                const finalResponse = modified ? newResponse : response;

                // Update the cache with the newer/fresher response
                await this.cache.set(
                    request.url,
                    { policy: newPolicy, response: finalResponse },
                    newPolicy.timeToLive()
                );
 
                // And proceed returning cached response as usual
                const responseHeaders = newPolicy.responseHeaders();
                Object.entries(responseHeaders).forEach(([key, value]) => {
                    if (Array.isArray(value)) {
                        value.forEach(val => finalResponse.headers.append(key, val))
                    } else if (typeof value !== 'undefined') {
                        finalResponse.headers.append(key, value);
                    }
                });

                return finalResponse;
            }
        }
        
        const response = await fetch(request)
        const policy = new CachePolicy(serialize(request), serialize(response), {
            shared: true,
            cacheHeuristic: 0.1,
            immutableMinTimeToLive: 24 * 3600 * 1000,
            ignoreCargoCult: false,
        });
        
        // We can't store this response! Just return it.
        if (!policy.storable()) {
            return response;
        }

        // Cache the data AND the policy object
        await this.cache.set(
            request.url,
            { policy, response },
            policy.timeToLive()
        );

        return response;
    }
}

export default function createUltraFetch(opts?: UltraFetchOptions) {
    const { fetch } = new UltraFetch(opts);
    return fetch;
}
