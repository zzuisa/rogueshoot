import { defineConfig } from 'vite'
import { versionPlugin } from './vite-plugin-version'

export default defineConfig({
  plugins: [versionPlugin()],
  server: {
    host: '0.0.0.0', // 允许外网访问
    port: 5173, // 默认端口
    strictPort: false, // 如果端口被占用，尝试下一个可用端口
    hmr: {
      host: '0.0.0.0', // HMR 也允许外网访问
    },
  },
  preview: {
    host: '0.0.0.0', // 预览模式也允许外网访问
    port: 4173, // 预览模式默认端口
    strictPort: false,
  },
})

