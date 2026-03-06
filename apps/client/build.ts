/* eslint-disable no-console */
import tailwindcss from 'bun-plugin-tailwind';

import pkg from './package.json' with { type: 'json' };

const result = await Bun.build({
  define: {
    __API_URL__: 'window.__backend_api_url',
    __APP_VERSION__: JSON.stringify(pkg.version)
  },
  entrypoints: ['./index.html'],
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
