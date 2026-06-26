import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  build: {
    // Transpile the production bundle to a safer baseline for older mobile browsers.
    target: ['es2018', 'chrome64', 'safari13'],
  },
})
