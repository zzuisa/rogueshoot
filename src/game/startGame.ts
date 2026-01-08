/**
 * 游戏启动入口：创建并配置Phaser游戏实例
 * 
 * 配置说明：
 * - 像素风格渲染（pixelArt模式）
 * - 垂直战场布局（360x640，适合"幸存者"玩法）
 * - 60FPS目标帧率
 */
import Phaser from 'phaser'
import { BootScene } from './scenes/BootScene'
import { BattleScene } from './scenes/BattleScene'

/**
 * 启动游戏
 * @param parentId HTML容器元素ID（游戏将渲染到该元素内）
 * @returns Phaser游戏实例
 */
export function startGame(parentId: string) {
  const config: Phaser.Types.Core.GameConfig = {
    type: Phaser.AUTO,  // 自动选择WebGL或Canvas渲染
    parent: parentId,   // 父容器ID
    backgroundColor: '#0c0f14',  // 深色背景
    render: {
      pixelArt: false,     // 正常渲染（启用平滑）
      antialias: true,     // 启用抗锯齿
      roundPixels: false,  // 不强制像素对齐
    },
    scale: {
      mode: Phaser.Scale.FIT,              // 自适应缩放（保持宽高比）
      autoCenter: Phaser.Scale.CENTER_BOTH, // 居中显示
      // 垂直战场（更接近"幸存者/下方防线"视野）
      width: 360,
      height: 640,
    },
    fps: {
      target: 60,              // 目标帧率60FPS
      forceSetTimeOut: true,   // 使用setTimeout而非requestAnimationFrame（更稳定）
    },
    scene: [BootScene, BattleScene],  // 场景列表（按顺序加载）
  }

  return new Phaser.Game(config)
}


