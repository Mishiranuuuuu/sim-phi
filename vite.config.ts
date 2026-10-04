/* eslint-disable */
import { defineConfig } from 'vite';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import terser from '@rollup/plugin-terser';
import { getBabelOutputPlugin } from '@rollup/plugin-babel';
import pkg = require('./package.json');
export default defineConfig({
  base: './',
  plugins: [
    {
      name: 'serve-public-index-in-development',
      configureServer(server) {
        server.middlewares.use(async(req, res, next) => {
          if (req.url?.split('?')[0] !== '/') return next();

          try {
            const html = await readFile(resolve(__dirname, 'public/index.html'), 'utf8');
            res.statusCode = 200;
            res.setHeader('Content-Type', 'text/html');
            res.end(await server.transformIndexHtml('/', html));
          } catch (error) {
            next(error);
          }
        });
      }
    }
  ],
  resolve: {
    alias: {
      '@': '/src'
    }
  },
  build: {
    lib: {
      entry: 'src/index.ts',
      name: 'SimPhiVite',
      formats: ['es'],
      fileName: `script-${pkg.version}`
    },
    sourcemap: true,
    cssTarget: 'chrome61',
    rollupOptions: {
      external: [/^\/utils\//],
      output: {
        plugins: [
          getBabelOutputPlugin({
            plugins: [['@babel/plugin-transform-nullish-coalescing-operator']]
          }),
          terser({ compress: { passes: 3 } })
        ]
      }
    }
  },
  preview: {
    host: true,
    port: 4173
  }
});
