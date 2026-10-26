import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Relative base so the build also works from a subfolder or file share.
export default defineConfig({
  plugins: [react()],
  base: './',
  test: { globals: true },
})
