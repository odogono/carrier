import index from './index.html';

const port = Number(process.env.PORT ?? 5179);
const hostname = process.env.HOSTNAME ?? '0.0.0.0';

Bun.serve({
  development: {
    console: true,
    hmr: true
  },
  hostname,
  port,
  routes: {
    '/*': index
  }
});
