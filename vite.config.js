import { defineConfig } from 'vite'
import topLevelAwait from 'vite-plugin-top-level-await'
import glsl from 'vite-plugin-glsl'

export default defineConfig({
  plugins: [
    topLevelAwait(),
    glsl({
      include: ['**/*.glsl', '**/*.wgsl', '**/*.vert', '**/*.frag'],
      exclude: 'node_modules/**',
      warnDuplicatedImports: true,
      defaultExtension: 'glsl',
      compress: false,
      watch: true
    })
  ],
  base: './',
})