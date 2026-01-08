/**
 * 玩家子弹实体：玩家发射的子弹
 * 
 * 功能：
 * - 按固定速度直线飞行
 * - 有最大射程限制（超过射程自动消失）
 * - 命中敌人造成伤害
 */
import Phaser from 'phaser'

/**
 * 子弹创建配置
 */
export type BulletConfig = Readonly<{
  x: number          // 初始X坐标
  y: number          // 初始Y坐标
  vx: number         // X方向速度（像素/秒）
  vy: number         // Y方向速度（像素/秒）
  damage: number     // 伤害值
  maxDistance?: number // 最大射程（像素，可选，默认无限制）
  pierce?: number    // 穿透数量（默认1，表示命中即消失）
}>

export class Bullet {
  /** Phaser图形对象（用于渲染） */
  readonly go: Phaser.GameObjects.Rectangle
  /** X方向速度（像素/秒） */
  vx: number
  /** Y方向速度（像素/秒） */
  vy: number
  /** 伤害值 */
  damage: number
  /** 最大射程（像素，可选，默认无限制） */
  readonly maxDistance?: number
  /** 穿透数量（默认1，表示命中即消失） */
  pierce: number
  /** 已穿透的敌人ID集合（用于避免重复命中同一敌人） */
  piercedZombies: Set<number>
  /** 起始X坐标（用于计算飞行距离） */
  private readonly startX: number
  /** 起始Y坐标（用于计算飞行距离） */
  private readonly startY: number
  /** 上一帧的X坐标（用于连续碰撞检测） */
  private prevX: number
  /** 上一帧的Y坐标（用于连续碰撞检测） */
  private prevY: number

  constructor(scene: Phaser.Scene, cfg: BulletConfig) {
    this.vx = cfg.vx
    this.vy = cfg.vy
    this.damage = cfg.damage
    this.maxDistance = cfg.maxDistance
    this.pierce = cfg.pierce ?? 1  // 默认穿透1（命中即消失）
    this.piercedZombies = new Set()
    // 创建Phaser矩形图形（3x3像素，黄色）
    this.go = scene.add.rectangle(cfg.x, cfg.y, 3, 3, 0xffe66b, 1)
    this.startX = cfg.x
    this.startY = cfg.y
    this.prevX = cfg.x
    this.prevY = cfg.y
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
   * 更新子弹位置（每帧调用）
   * @param dtSec 帧间隔（秒）
   */
  update(dtSec: number) {
    // 保存上一帧位置（用于连续碰撞检测）
    this.prevX = this.go.x
    this.prevY = this.go.y
    // 更新当前位置
    this.go.x += this.vx * dtSec
    this.go.y += this.vy * dtSec
  }

  /**
   * 获取上一帧的位置（用于连续碰撞检测）
   */
  get prevPosition() {
    return { x: this.prevX, y: this.prevY }
  }

  /**
   * 检查是否超出射程
   * @returns 如果飞行距离超过最大射程，返回true（如果没有设置最大射程，返回false）
   */
  isOutOfRange() {
    if (this.maxDistance === undefined) {
      return false  // 无最大射程限制
    }
    const d = Math.hypot(this.go.x - this.startX, this.go.y - this.startY)
    return d >= this.maxDistance
  }

  /**
   * 销毁子弹（清理图形对象）
   */
  destroy() {
    this.go.destroy()
  }
}


