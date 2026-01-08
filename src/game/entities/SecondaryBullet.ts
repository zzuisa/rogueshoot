/**
 * 次级子弹实体：由主子弹分裂产生的次级子弹
 * 
 * 功能：
 * - 继承主子弹的属性（伤害、速度等）
 * - 可以进一步分裂（支持多级分裂）
 * - 有独立的生命周期和碰撞检测
 */
import Phaser from 'phaser'
import { Bullet, type BulletConfig } from './Bullet'

/**
 * 次级子弹创建配置
 */
export type SecondaryBulletConfig = Readonly<{
  x: number          // 初始X坐标
  y: number          // 初始Y坐标
  vx: number         // X方向速度（像素/秒）
  vy: number         // Y方向速度（像素/秒）
  damage: number     // 伤害值
  maxDistance: number // 最大射程（像素）
  parent?: SecondaryBullet | Bullet  // 父子弹（用于追踪分裂层级）
  splitLevel?: number  // 分裂层级（0=主子弹分裂，1=次级子弹分裂，以此类推）
  excludedTargetId?: number  // 要避开的目标ID（体型<=3时不会命中同一目标）
}>

export class SecondaryBullet {
  /** Phaser图形对象（用于渲染） */
  readonly go: Phaser.GameObjects.Rectangle
  /** X方向速度（像素/秒） */
  vx: number
  /** Y方向速度（像素/秒） */
  vy: number
  /** 伤害值 */
  damage: number
  /** 最大射程（像素） */
  readonly maxDistance: number
  /** 起始X坐标（用于计算飞行距离） */
  private readonly startX: number
  /** 起始Y坐标（用于计算飞行距离） */
  private readonly startY: number
  /** 上一帧的X坐标（用于连续碰撞检测） */
  private prevX: number
  /** 上一帧的Y坐标（用于连续碰撞检测） */
  private prevY: number
  /** 父子弹（可选） */
  readonly parent?: SecondaryBullet | Bullet
  /** 分裂层级 */
  readonly splitLevel: number
  /** 要避开的目标ID（体型<=3时不会命中同一目标） */
  readonly excludedTargetId?: number

  constructor(scene: Phaser.Scene, cfg: SecondaryBulletConfig) {
    this.vx = cfg.vx
    this.vy = cfg.vy
    this.damage = cfg.damage
    this.maxDistance = cfg.maxDistance
    this.parent = cfg.parent
    this.splitLevel = cfg.splitLevel ?? 0
    this.excludedTargetId = cfg.excludedTargetId
    // 创建Phaser矩形图形（3x3像素，浅黄色，与主子弹区分）
    this.go = scene.add.rectangle(cfg.x, cfg.y, 3, 3, 0xffd700, 1)
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
   * @returns 如果飞行距离超过最大射程，返回true
   */
  isOutOfRange() {
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

