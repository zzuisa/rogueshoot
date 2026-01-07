/**
 * 玩家实体：代表游戏中的主角
 * 
 * 功能：
 * - 固定在底部中央，不可移动
 * - 自动瞄准最近敌人并开火
 * - 武器有射程限制（默认220像素）和80%圆弧射程
 */
import Phaser from 'phaser'

/**
 * 玩家创建配置
 */
export type PlayerConfig = Readonly<{
  x: number  // 初始X坐标（通常为屏幕中央）
  y: number  // 初始Y坐标（通常为底部）
}>

export class Player {
  /** Phaser图形对象（用于渲染） */
  readonly go: Phaser.GameObjects.Rectangle
  
  // ===== 射击属性 =====
  /** 射击间隔（秒） */
  fireIntervalSec = 0.5
  /** 子弹伤害 */
  damage = 5
  /** 武器射程（像素）- 调整此值可改变射程，例如：180（短）、220（默认）、280（长）、320（超长） */
  range = 520

  /** 射击冷却时间（秒） */
  private fireCooldown = 0

  constructor(scene: Phaser.Scene, cfg: PlayerConfig) {
    // 创建Phaser矩形图形（12x12像素，青色，带边框）
    this.go = scene.add.rectangle(cfg.x, cfg.y, 12, 12, 0x4ad1ff, 1)
    this.go.setStrokeStyle(2, 0x0c0f14, 0.7)
  }

  /** 获取当前X坐标 */
  get x() {
    return this.go.x
  }
  /** 获取当前Y坐标 */
  get y() {
    return this.go.y
  }

  /**
   * 更新玩家状态（每帧调用）
   * @param dtSec 帧间隔（秒）
   */
  update(dtSec: number) {
    this.fireCooldown = Math.max(0, this.fireCooldown - dtSec)
  }

  /**
   * 是否可以开火（冷却时间已到）
   */
  canFire() {
    return this.fireCooldown <= 0
  }

  /**
   * 消耗一次开火机会（进入冷却）
   */
  consumeFire() {
    this.fireCooldown = this.fireIntervalSec
  }

  /**
   * 销毁玩家（清理图形对象）
   */
  destroy() {
    this.go.destroy()
  }
}


