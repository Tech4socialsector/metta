// Compile-checks every .vue file and every "@/..." import without building
// or writing anything: `node scripts/check.cjs` from frontend/.
const { parse, compileScript, compileTemplate } = require('@vue/compiler-sfc')
const fs = require('fs')
const path = require('path')

const SRC = path.join(__dirname, '..', 'src')
const files = []
;(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p)
    else if (/\.(vue|js)$/.test(e.name)) files.push(p)
  }
})(SRC)

let bad = 0
for (const f of files) {
  const text = fs.readFileSync(f, 'utf8')
  if (f.endsWith('.vue')) {
    const { descriptor, errors } = parse(text, { filename: f })
    if (errors.length) {
      bad++
      console.log('PARSE', path.relative(SRC, f), errors[0].message)
      continue
    }
    try {
      const s = compileScript(descriptor, { id: f })
      if (descriptor.template) {
        const t = compileTemplate({ source: descriptor.template.content, filename: f, id: f, compilerOptions: { bindingMetadata: s.bindings } })
        if (t.errors.length) {
          bad++
          console.log('TEMPLATE', path.relative(SRC, f), t.errors[0].message || t.errors[0])
        }
      }
    } catch (e) {
      bad++
      console.log('SCRIPT', path.relative(SRC, f), e.message.split('\n')[0])
    }
  }
  for (const m of text.matchAll(/from '@\/([^']+)'/g)) {
    const target = path.join(SRC, m[1])
    if (!fs.existsSync(target) && !fs.existsSync(`${target}.js`)) {
      bad++
      console.log('IMPORT', path.relative(SRC, f), `@/${m[1]} not found`)
    }
  }
}
console.log(`${files.length} files checked, ${bad} problem(s)`)
process.exit(bad ? 1 : 0)
