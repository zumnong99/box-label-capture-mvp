import { readFile } from 'node:fs/promises'
import { createSourceFile, isExportDeclaration, isImportDeclaration, isStringLiteral, ScriptKind, ScriptTarget, transpileModule } from 'typescript'

const moduleUrls = new Map()

async function moduleUrl(name) {
  if (!moduleUrls.has(name)) moduleUrls.set(name, compileModule(name))
  return moduleUrls.get(name)
}

async function compileModule(name) {
  const source = await readFile(new URL(`../src/${name}.ts`, import.meta.url), 'utf8')
  const { outputText } = transpileModule(source, {
    compilerOptions: { target: 10, module: 99 },
  })
  const parsed = createSourceFile(`${name}.js`, outputText, ScriptTarget.ESNext, true, ScriptKind.JS)
  const replacements = []
  for (const statement of parsed.statements) {
    if (!isImportDeclaration(statement) && !isExportDeclaration(statement)) continue
    const specifier = statement.moduleSpecifier
    if (!specifier || !isStringLiteral(specifier) || !specifier.text.startsWith('./')) continue
    replacements.push({
      start: specifier.getStart(parsed), end: specifier.getEnd(),
      text: JSON.stringify(await moduleUrl(specifier.text.slice(2))),
    })
  }
  let linked = outputText
  for (const replacement of replacements.reverse()) {
    linked = linked.slice(0, replacement.start) + replacement.text + linked.slice(replacement.end)
  }
  return `data:text/javascript;base64,${Buffer.from(linked).toString('base64')}`
}

export async function loadModule(name) {
  return import(await moduleUrl(name))
}

export function setGlobal(t, name, value) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, name)
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value })
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, name, previous)
    else delete globalThis[name]
  })
}
