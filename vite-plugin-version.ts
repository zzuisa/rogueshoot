/**
 * Vite 插件：在构建时生成版本信息文件
 */
import { writeFileSync, existsSync, mkdirSync, readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import type { Plugin } from 'vite'

// 获取当前文件的目录（ESM 模块）
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

export function versionPlugin(): Plugin {
  return {
    name: 'version-plugin',
    buildStart() {
      // 读取 package.json
      const packageJsonPath = resolve(__dirname, 'package.json')
      const packageJson = JSON.parse(
        readFileSync(packageJsonPath, 'utf-8')
      )
      
      // 生成版本信息
      const now = new Date()
      const versionInfo = {
        version: packageJson.version,
        buildTime: now.toISOString(),
        buildTimeLocal: now.toLocaleString('zh-CN', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        }),
      }
      
      // 写入到 public 目录（会被复制到 dist）
      const publicDir = resolve(__dirname, 'public')
      if (!existsSync(publicDir)) {
        mkdirSync(publicDir, { recursive: true })
      }
      
      writeFileSync(
        resolve(publicDir, 'version.json'),
        JSON.stringify(versionInfo, null, 2),
        'utf-8'
      )
    },
  }
}

