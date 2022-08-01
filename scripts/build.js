import fs, { mkdirSync } from 'node:fs'
import { build } from 'esbuild'
import { Project } from 'ts-morph'

const project = new Project({
  compilerOptions: {
    emitDeclarationOnly: true,
    declarationDir: 'dist/dts',
  },
  tsConfigFilePath: './tsconfig.json',
})

function emitToSingleFile() {
    const result = project.emitToMemory()
    const contents = []
    // output the emitted files to the console
    for (const file of result.getFiles()) {
        if (file.filePath.endsWith('with-cache.d.ts')) {
            contents.push(`declare type ResponseLike = Omit<Response, 'body' | 'clone'>;
export declare function isCached(response: ResponseLike): boolean;`)
            contents.push(file.text.replace(`export { isCached } from './convert.js';`, ''));
        }
    }
    mkdirSync(new URL('../dist', import.meta.url), { recursive: true })
    fs.writeFileSync(new URL('../dist/index.d.ts', import.meta.url), contents.join(''))
}
emitToSingleFile()

await build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  outfile: 'dist/index.js',
  format: 'esm',
  platform: 'node',
  target: 'node14',
  minify: true,
  sourcemap: 'linked',
  watch: process.argv.includes('--watch')
    ? {
        onRebuild: async (error) => {
          if (error) {
            console.error('watch build failed:', error)
          } else {
            await Promise.all(
              project
                .getSourceFiles()
                .map((sourceFile) => sourceFile.refreshFromFileSystem())
            )
            emitToSingleFile()
          }
        },
      }
    : undefined,
})

