# `ultrafetch`

[`node-fetch`](https://github.com/node-fetch/node-fetch) backed with an [RFC-7234](https://httpwg.org/specs/rfc7234.html) compliant filesystem cache.

Supports fetching files using the `file://` protocol.

Supports fetch using Node's built-in `URL` class rather than strings.

## FAQ

### Isn't [`unidici`](https://github.com/nodejs/undici) better than `node-fetch`?

Yes! But `undici` only supports `fetch` in `node@16.5+`. Until it is stable and widely available in an LTS version of node, `node-fetch` is a better choice.
