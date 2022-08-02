import type { OutgoingMessage } from 'node:http';
import type CachePolicy from "http-cache-semantics";

interface CachedResponse extends CachePolicy.Response {
    ok: boolean;
    redirected: boolean;
    statusText: string;
    url: string;
    body?: number[];
}

export function webToCachePolicyRequest({ url, method, headers: _headers }: Request): CachePolicy.Request {
    const headers: CachePolicy.Headers = {};
    for (const [key, value] of _headers) {
        headers[key] = value;
    }
    return {
        method,
        url,
        headers,
    };
}

export function webToCachePolicyResponse({ status, headers: _headers }: Response): CachePolicy.Response {
    const headers: CachePolicy.Headers = {};
    for (const [key, value] of _headers) {
        headers[key] = value;
    }
    return {
        status,
        headers,
    };
}

async function readResponseBody(response: OutgoingMessage | Response): Promise<number[]|undefined> {
    if ('on' in response) {
        let body = Buffer.from([]);
        let resBodyComplete = new Promise<Buffer>((resolve, reject) => {
            response.on('data', (d) => {
                body = Buffer.concat([body, d]);
            });
            response.on('end', () => {
                resolve(body);
            });
            response.on('error', (err) => {
                reject(err);
            });
        });
        return resBodyComplete.then(buf => Array.from(Uint8Array.from(buf)));
    }
    if (!response.body) return;
    return Array.from(Buffer.from(await response.clone().arrayBuffer()));
}

export async function webToCachedResponse(response: Response): Promise<CachedResponse> {
    const { url, ok, redirected, status, statusText, headers: _headers } = response;
    const body = await readResponseBody(response);
    const headers: CachePolicy.Headers = {};
    for (const [key, value] of _headers) {
        headers[key] = value;
    }
    return { url, ok, redirected, status, statusText, headers, body };
}

export function cachedResponseToWeb(cachedResponse: CachedResponse): Response {
    const { body, headers: _headers = {}, ...init } = cachedResponse;
    const headers = new Headers();
    for (const [key, value] of Object.entries(_headers)) {
        if (Array.isArray(value)) {
            headers.set(key, value.join(' '));
        } else if (typeof value !== 'undefined') {
            headers.set(key, value);
        }
    }
    if (body) {
        return new Response(Buffer.from(body), { ...init, headers });
    } else {
        return new Response(body, { ...init, headers });
    }
}

const IS_CACHED = Symbol('cached');

export function updateHeaders(reqOrRes: Request, headers: CachePolicy.Headers): Request;
export function updateHeaders(reqOrRes: Response, headers: CachePolicy.Headers): Response;
export function updateHeaders(reqOrRes: Request | Response, _headers: CachePolicy.Headers) {
    const headers = new Headers(reqOrRes.headers);
    for (const [key, value] of Object.entries(_headers)) {
        if (headers.has(key) && headers.get(key) === value) continue;
        if (Array.isArray(value)) {
            value.forEach((val) => headers.append(key, val));
        } else if (typeof value !== "undefined") {
            headers.append(key, value);
        }
    }
    if (reqOrRes instanceof Request) {
        const request = new Request(reqOrRes.url, { ...reqOrRes, headers });
        Object.defineProperty(request, IS_CACHED, { value: true, enumerable: false, writable: false });
        return request;
    } else if (reqOrRes instanceof Response) {
        const response = new Response(reqOrRes.body, { ...reqOrRes, headers });
        Object.defineProperty(response, IS_CACHED, { value: true, enumerable: false, writable: false });
        return response;
    }
}

export type ResponseLike = Omit<Response, 'body'|'clone'>
export function isCached(response: ResponseLike): boolean {
  return IS_CACHED in response;
} 
