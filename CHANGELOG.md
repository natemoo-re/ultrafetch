# ultrafetch

## 0.2.1

### Patch Changes

- 48b691a: Cleaner build output, bundled declaration file

## 0.2.0

### Minor Changes

- 7c3e04b: New, modular structure allows extension of existing `fetch` implementations with a custom cache.

  ```js
  import { withCache } from "ultrafetch";

  const enhancedFetch = withCache(fetch, { cache: new Map() });
  ```

## 0.1.2

### Patch Changes

- Fix issue with NPM distribution
- Fix issue with default cache location

## 0.1.1

### Patch Changes

- Add documentation
