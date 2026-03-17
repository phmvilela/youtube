import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // Listen on all network interfaces (equivalent to --host)
    port: 5173,
    strictPort: true,
    hmr: {
      clientPort: 5173, // Force HMR to use this port
    },
    watch: {
      usePolling: true, // Often needed in WSL/DevContainers for file changes
    }
  }
})
