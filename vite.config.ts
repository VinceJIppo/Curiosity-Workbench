import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { brandAssets, cspMeta, stripNetwork } from './scripts/vite-plugins.ts';

export default defineConfig({
  plugins: [preact({ devToolsEnabled: false, prefreshEnabled: false }), brandAssets(import.meta.dirname), stripNetwork(), viteSingleFile({ removeViteModuleLoader: true }), cspMeta()],
  build: {
    target: 'es2022',
    outDir: 'dist',
    emptyOutDir: true,
    assetsInlineLimit: 100_000_000,
    cssCodeSplit: false,
    reportCompressedSize: false,
    modulePreload: false,
  },
});
