import Phaser from 'phaser'

export type ProjectileConfig = Readonly<{
  x: number
  y: number
  speed: number // px/s
  damage: number
}>

export class Projectile {
  readonly go: Phaser.GameObjects.Rectangle
  readonly speed: number
  readonly damage: number

  // 简化：子弹持续追踪目标（可替换为真实弹道/碰撞系统）
  target: (() => { x: number; y: number } | null) | null = null

  constructor(scene: Phaser.Scene, cfg: ProjectileConfig) {
    this.speed = cfg.speed
    this.damage = cfg.damage
    this.go = scene.add.rectangle(cfg.x, cfg.y, 4, 4, 0xffe66b, 1)
  }

  update(dtSec: number) {
    if (!this.target) return
    const t = this.target()
    if (!t) return
    const dx = t.x - this.go.x
    const dy = t.y - this.go.y
    const dist = Math.hypot(dx, dy)
    if (dist <= 1) return

    const step = this.speed * dtSec
    const nx = dx / dist
    const ny = dy / dist
    this.go.x += nx * Math.min(step, dist)
    this.go.y += ny * Math.min(step, dist)
  }

  destroy() {
    this.go.destroy()
  }
}


