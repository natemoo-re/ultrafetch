import { statSync } from 'fs'
import del from 'del'
import { fileURLToPath } from 'url'

export const cleanup = () => del(fileURLToPath(new URL('../node_modules/.cache', import.meta.url)));
export const cacheExists = () => {
    try {
        return statSync(fileURLToPath(new URL('../node_modules/.cache', import.meta.url))).isDirectory();
    } catch (e) {}
    return false;
}
export const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
