import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Playwright writes HTML trace/report files; they must not trigger an app reload.
  server: { watch: { ignored: ['**/.qa/**'] } },
  build: {
    // Three.js is deferred until the scene mounts; keep the vendor runtime cached separately.
    chunkSizeWarningLimit: 600,
    rolldownOptions: {
      output: {
        manualChunks: (id) => id.includes('/node_modules/three/examples/')
          ? 'three-effects'
          : id.includes('/node_modules/three/') ? 'three' : undefined,
      },
    },
  },
})
