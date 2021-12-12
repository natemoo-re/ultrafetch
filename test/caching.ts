import createFetch from '../dist/index.js';
import { test } from 'uvu';
import * as assert from 'uvu/assert';
import * as utils from './utils';

const fetch = createFetch();

test.before(async () => {
    await utils.cleanup()
})

test('github', async () => {
    assert.not(utils.cacheExists())
    
    const uncached = await fetch('https://api.github.com/repos/withastro/astro');
    assert.equal(uncached.status, 200);

    assert.ok(utils.cacheExists())

    const cached = await fetch('https://api.github.com/repos/withastro/astro');
    assert.equal(cached.status, 200);
});

test.run()
