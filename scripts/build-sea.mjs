import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as esbuild from 'esbuild';

const rootDir = process.cwd();
const buildDir = resolve(rootDir, 'build');
const bundlePath = resolve(buildDir, 'k3access.cjs');
const seaConfigPath = resolve(buildDir, 'sea-config.json');
const binaryName = process.platform === 'win32' ? 'k3access.exe' : 'k3access';
const outputBinary = resolve(buildDir, binaryName);

mkdirSync(buildDir, { recursive: true });

console.log('1/2 Empaquetando bundle con esbuild...');
await esbuild.build({
  entryPoints: [resolve(rootDir, 'src/index.tsx')],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  outfile: bundlePath,
  minify: true,
  define: {
    'process.env.NODE_ENV': '"production"',
  },
  // Evita arrastrar react-devtools-core opcional de Ink en el binario standalone
  plugins: [
    {
      name: 'ignore-react-devtools',
      setup(build) {
        build.onResolve({ filter: /^react-devtools-core$/ }, () => ({
          path: 'react-devtools-core',
          namespace: 'ignore-devtools',
        }));
        build.onLoad({ filter: /.*/, namespace: 'ignore-devtools' }, () => ({
          contents: 'module.exports = { connectToDevTools() {} };',
          loader: 'js',
        }));
      },
    },
  ],
});

const seaConfig = {
  main: bundlePath,
  output: outputBinary,
  disableExperimentalSEAWarning: true,
  useSnapshot: false,
  useCodeCache: true,
};

writeFileSync(seaConfigPath, JSON.stringify(seaConfig, null, 2), 'utf8');

console.log('2/2 Generando binario standalone con node --build-sea...');
try {
  execFileSync(process.execPath, ['--build-sea', seaConfigPath], {
    stdio: 'inherit',
  });
  console.log(`\n✓ Binario standalone generado en: ${outputBinary}`);
} catch (err) {
  console.error(
    '\n✗ Falló "node --build-sea". Verifica que tu versión de Node.js soporte Single Executable Applications (Node 25.5+ para --build-sea directo).',
  );
  process.exitCode = 1;
  throw err;
}
