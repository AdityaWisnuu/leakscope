// Builds dist/: one self-contained ESM bundle (browser + Node), a CJS copy, and .d.ts files.
import { readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dir, '..');
const dist = join(root, 'dist');
rmSync(dist, { recursive: true, force: true });

for (const [format, naming] of [['esm', 'index.js'], ['cjs', 'index.cjs']] as const) {
  const r = await Bun.build({
    entrypoints: [join(root, 'src/index.ts')],
    outdir: dist,
    naming,
    format,
    target: 'browser',
    sourcemap: 'linked',
  });
  if (!r.success) {
    for (const l of r.logs) console.error(l);
    process.exit(1);
  }
}

const tsc = Bun.spawnSync(['bunx', 'tsc', '-p', 'tsconfig.build.json'], { cwd: root, stdout: 'inherit', stderr: 'inherit' });
if (tsc.exitCode !== 0) process.exit(tsc.exitCode ?? 1);

// Sources use extensionless relative imports (fine for bundlers); Node16 type resolution needs ".js".
for (const f of readdirSync(dist).filter((f) => f.endsWith('.d.ts'))) {
  const p = join(dist, f);
  writeFileSync(p, readFileSync(p, 'utf8').replace(/(from\s+['"])(\.\.?\/[^'"]+?)(['"])/g, (m, a, spec, b) =>
    spec.endsWith('.js') ? m : `${a}${spec}.js${b}`));
}
// Same declarations for require() consumers, as CommonJS-flavoured .d.cts files.
for (const f of readdirSync(dist).filter((f) => f.endsWith('.d.ts'))) {
  const src = readFileSync(join(dist, f), 'utf8').replace(/(from\s+['"]\.\.?\/[^'"]+?)\.js(['"])/g, '$1.cjs$2');
  writeFileSync(join(dist, f.replace(/\.d\.ts$/, '.d.cts')), src);
}

const bundle = readFileSync(join(dist, 'index.js'), 'utf8');
if (/from\s*["']node:|require\(["']node:/.test(bundle)) throw new Error('node: import leaked into the browser bundle');
console.log(`dist/index.js ${(bundle.length / 1024).toFixed(1)} KiB`);
