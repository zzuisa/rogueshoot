import Phaser from 'phaser'
import type { Zombie } from './Zombie'
import { Projectile } from './Projectile'

export type TowerConfig = Readonly<{
  x: number
  y: number
  range: number
  fireIntervalSec: number
  projectileSpeed: number
  damage: number
}>

export class Tower {
  readonly go: Phaser.GameObjects.Graphics
  readonly range: number
  readonly fireIntervalSec: number
  readonly projectileSpeed: number
  readonly damage: number

  private fireCooldown = 0
  private readonly scene: Phaser.Scene

  constructor(scene: Phaser.Scene, cfg: TowerConfig) {
    this.scene = scene
    this.range = cfg.range
    this.fireIntervalSec = cfg.fireIntervalSec
    this.projectileSpeed = cfg.projectileSpeed
    this.damage = cfg.damage

    // 像素风占位塔（后续替换 sprite/动画）
    const size = 16
    this.go = scene.add.graphics()
    this.go.setPosition(cfg.x, cfg.y)
    this.go.fillStyle(0x4ad1ff, 1)
    this.go.fillRect(Math.floor(-size / 2), Math.floor(-size / 2), size, size)
    this.go.lineStyle(2, 0x0c0f14, 0.7)
    this.go.strokeRect(Math.floor(-size / 2), Math.floor(-size / 2), size, size)
  }

  get x() {
    return this.go.x
  }
  get y() {
    return this.go.y
  }

  update(dtSec: number, zombies: Zombie[], projectiles: Projectile[]) {
    this.fireCooldown = Math.max(0, this.fireCooldown - dtSec)
    if (this.fireCooldown > 0) return

    const target = this.pickTarget(zombies)
    if (!target) return

    this.fireCooldown = this.fireIntervalSec
    const p = new Projectile(this.scene, {
      x: this.go.x,
      y: this.go.y,
      speed: this.projectileSpeed,
      damage: this.damage,
    })
    p.target = () => (target.isAlive() ? { x: target.x, y: target.y } : null)
    projectiles.push(p)
  }

  private pickTarget(zombies: Zombie[]) {
    let best: Zombie | null = null
    let bestDist = Infinity
    for (const z of zombies) {
      const dx = z.x - this.go.x
      const dy = z.y - this.go.y
      const d = Math.hypot(dx, dy)
      if (d > this.range) continue
      if (d < bestDist) {
        bestDist = d
        best = z
      }
    }
    return best
  }

  destroy() {
    this.go.destroy()
  }
}


