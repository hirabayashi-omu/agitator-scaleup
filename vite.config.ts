import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), viteSingleFile()],
  resolve: {
    alias: {
      canvg: path.resolve(__dirname, 'src/stub.js'),
      'core-js': path.resolve(__dirname, 'src/stub.js')
    }
  }
})
