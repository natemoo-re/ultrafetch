---
"ultrafetch": minor
---

New, modular structure allows extension of existing `fetch` implementations with a custom cache.

```js
import { withCache } from "ultrafetch";

const enhancedFetch = withCache(fetch, { cache: new Map() })
```
