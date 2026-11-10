import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts', 'src/themeAugmentation.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
});
