import { withCache, isCached } from "../src/";
import { it, expect } from "vitest";

it("handles github api", async () => {
  const fetchWithCache = withCache(fetch);
  let previousRemaining: number = -1;
  for (let i = 0; i < 3; i++) {
    const res = await fetchWithCache("https://api.github.com/repos/withastro/astro");
    const remaining = Number.parseInt(res.headers.get('x-ratelimit-remaining')!);
    if (isCached(res)) {
        expect(remaining).toEqual(previousRemaining);
    }
    previousRemaining = remaining;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
});
