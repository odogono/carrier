/* eslint-disable no-console */
import tailwindcss from 'bun-plugin-tailwind';

import pkg from './package.json' with { type: 'json' };

// API URL: use API_URL at build time, or runtime via window.__backend_api_url
const apiUrlDefine =
  typeof process.env.API_URL === 'string' && process.env.API_URL.length > 0
    ? JSON.stringify(process.env.API_URL)
    : 'window.__backend_api_url';

const result = await Bun.build({
  define: {
    __API_URL__: apiUrlDefine,
    __APP_VERSION__: JSON.stringify(pkg.version)
  },
  entrypoints: ['./index.html'],
  env: 'inline',
  minify: true,
  outdir: './dist',
  plugins: [tailwindcss],
  splitting: true
});

if (!result.success) {
  console.error('Build failed:');
  for (const log of result.logs) {
    console.error(log);
  }
  process.exit(1);
} else {
  console.log(
    `Build succeeded: ${result.outputs.length} files written to ./dist`
  );
}
