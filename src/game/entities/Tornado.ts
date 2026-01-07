/**
 * 龙卷风实体：技能"龙卷风"产生的持续伤害区域
 * 
 * 功能：
 * - 向上移动（从防线向敌人方向）
 * - 对范围内敌人造成持续伤害（每秒伤害值）
 * - 有持续时间限制
 */
import Phaser from 'phaser'
import type { Zombie } from './Zombie'

/**
 * 龙卷风创建配置
 */
export type TornadoConfig = Readonly<{
  x: number          // 初始X坐标
  y: number          // 初始Y坐标
  vy: number         // Y方向速度（像素/秒，负值向上）
  radius: number     // 伤害范围半径（像素）
  durationSec: number // 持续时间（秒）
  dps: number       // 每秒伤害值
}>

export class Tornado {
  /** Phaser圆形图形对象（用于渲染） */
  readonly go: Phaser.GameObjects.Arc
  /** Y方向速度（像素/秒，负值向上） */
  vy: number
  /** 伤害范围半径（像素） */
  radius: number
  /** 剩余持续时间（秒） */
  remainingSec: number
  /** 每秒伤害值 */
  dps: number

  constructor(scene: Phaser.Scene, cfg: TornadoConfig) {
    this.vy = cfg.vy
    this.radius = cfg.radius
    this.remainingSec = cfg.durationSec
    this.dps = cfg.dps
    // 创建Phaser圆形图形（紫色，半透明）
    this.go = scene.add.circle(cfg.x, cfg.y, cfg.radius, 0x9b6bff, 0.18)
    this.go.setStrokeStyle(2, 0x9b6bff, 0.6)
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
   * 更新龙卷风状态（每帧调用）
   * @param dtSec 帧间隔（秒）
   */
  update(dtSec: number) {
    this.remainingSec -= dtSec
    this.go.y += this.vy * dtSec
  }

  /**
   * 对范围内的僵尸造成伤害
   * @param dtSec 帧间隔（秒）
   * @param zombies 所有僵尸列表
   */
  applyDamage(dtSec: number, zombies: Zombie[]) {
    const dmg = this.dps * dtSec  // 本帧应造成的伤害
    for (const z of zombies) {
      const d = Math.hypot(z.x - this.x, z.y - this.y)
      if (d <= this.radius) z.takeDamage(dmg)
    }
  }

  /**
   * 检查是否已结束（持续时间用完）
   */
  isDone() {
    return this.remainingSec <= 0
  }

  /**
   * 销毁龙卷风（清理图形对象）
   */
  destroy() {
    this.go.destroy()
  }
}


