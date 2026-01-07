/**
 * 敌人远程攻击投射物：远程僵尸发射的子弹
 * 
 * 功能：
 * - 从僵尸位置向下飞行（朝向防线）
 * - 命中防线造成伤害
 */
import Phaser from 'phaser'

/**
 * 敌人子弹创建配置
 */
export type EnemyShotConfig = Readonly<{
  x: number      // 初始X坐标
  y: number      // 初始Y坐标
  vy: number     // Y方向速度（像素/秒，正值向下）
  damage: number // 伤害值
}>

export class EnemyShot {
  /** Phaser图形对象（用于渲染） */
  readonly go: Phaser.GameObjects.Rectangle
  /** Y方向速度（像素/秒，正值向下） */
  vy: number
  /** 伤害值 */
  damage: number

  constructor(scene: Phaser.Scene, cfg: EnemyShotConfig) {
    this.vy = cfg.vy
    this.damage = cfg.damage
    // 创建Phaser矩形图形（4x4像素，红色）
    this.go = scene.add.rectangle(cfg.x, cfg.y, 4, 4, 0xff6b6b, 1)
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
    this.go.y += this.vy * dtSec
  }

  /**
   * 销毁子弹（清理图形对象）
   */
  destroy() {
    this.go.destroy()
  }
}


