import { readFile } from 'node:fs/promises'
import { transpileModule } from 'typescript'

export async function loadModule(name) {
  const source = await readFile(new URL(`../src/${name}.ts`, import.meta.url), 'utf8')
  const { outputText } = transpileModule(source, {
    compilerOptions: { target: 10, module: 99 },
  })
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`)
}

export function setGlobal(t, name, value) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, name)
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value })
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, name, previous)
    else delete globalThis[name]
  })
}
