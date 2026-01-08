import Phaser from 'phaser'
import type { Zombie } from '../entities/Zombie'

/**
 * 特效管理器
 * 负责管理游戏中的各种视觉特效
 */
export class EffectManager {
  private damageNumbers: Array<{
    text: Phaser.GameObjects.Text
    x: number
    y: number
    vy: number
    ttl: number
    alpha: number
  }> = []

  constructor(private scene: Phaser.Scene) {}

  /**
   * 显示伤害数字
   */
  showDamageNumber(x: number, y: number, damage: number, isCrit: boolean = false) {
    const damageText = Math.round(damage).toString()
    const text = this.scene.add.text(x, y, damageText, {
      fontSize: isCrit ? '20px' : '16px',
      color: isCrit ? '#ffd700' : '#ff6b6b',  // 暴击显示金色
      fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: isCrit ? 3 : 2,
      resolution: 2,  // 高清渲染
    }).setOrigin(0.5).setDepth(1000)  // 最高层级，确保显示在最上层
    
    // 添加随机偏移，避免多个伤害数字重叠
    const offsetX = (Math.random() - 0.5) * 20
    const offsetY = (Math.random() - 0.5) * 10
    text.x += offsetX
    text.y += offsetY
    
    // 添加到伤害数字数组
    this.damageNumbers.push({
      text,
      x: text.x,
      y: text.y,
      vy: -30,  // 向上飘动的速度（像素/秒）
      ttl: 1.0,  // 显示时间（秒）
      alpha: 1.0,
    })
  }

  /**
   * 更新伤害数字UI（每帧调用）
   */
  updateDamageNumbers(dtSec: number) {
    const keep: typeof this.damageNumbers = []
    
    for (const dn of this.damageNumbers) {
      // 更新位置（向上飘动）
      dn.y += dn.vy * dtSec
      dn.text.y = dn.y
      
      // 更新透明度（逐渐淡出）
      dn.ttl -= dtSec
      if (dn.ttl > 0) {
        // 前半段时间保持不透明，后半段逐渐淡出
        if (dn.ttl < 0.5) {
          dn.alpha = dn.ttl / 0.5
        }
        dn.text.setAlpha(dn.alpha)
        keep.push(dn)
      } else {
        // 时间到了，销毁文本
        dn.text.destroy()
      }
    }
    
    this.damageNumbers = keep
  }

  /**
   * 生成爆炸特效
   */
  spawnExplosion(x: number, y: number, r: number, color: number) {
    // 内层爆炸（核心，高亮度）
    const coreGfx = this.scene.add.graphics()
    coreGfx.fillStyle(color, 0.3)
    coreGfx.fillCircle(x, y, r * 0.5)
    coreGfx.lineStyle(3, color, 0.9)
    coreGfx.strokeCircle(x, y, r * 0.5)
    
    // 外层冲击波（扩散效果）
    const shockGfx = this.scene.add.graphics()
    shockGfx.lineStyle(3, color, 0.7)
    shockGfx.strokeCircle(x, y, r * 0.6)
    this.scene.tweens.add({
      targets: shockGfx,
      scaleX: r / (r * 0.6),
      scaleY: r / (r * 0.6),
      alpha: 0,
      duration: 250,
      onComplete: () => shockGfx.destroy(),
    })
    
    // 基础爆炸标记
    const g = this.scene.add.graphics()
    g.fillStyle(color, 0.14)
    g.fillCircle(x, y, r)
    g.lineStyle(2, color, 0.55)
    g.strokeCircle(x, y, r)
    
    // 0.22秒后销毁
    this.scene.time.delayedCall(220, () => {
      coreGfx.destroy()
      g.destroy()
    })
  }

  /**
   * 绘制闪电路径（锯齿状）
   */
  drawLightningPath(g: Phaser.GameObjects.Graphics, startX: number, startY: number, points: { x: number; y: number }[]) {
    if (points.length === 0) return
    
    g.beginPath()
    let lastX = startX
    let lastY = startY
    
    for (const p of points) {
      // 在两点之间添加锯齿状路径
      const dx = p.x - lastX
      const dy = p.y - lastY
      const dist = Math.hypot(dx, dy)
      const steps = Math.max(2, Math.floor(dist / 8))
      
      for (let i = 0; i <= steps; i++) {
        const t = i / steps
        const x = lastX + dx * t
        const y = lastY + dy * t
        // 添加随机偏移，形成锯齿效果
        const offsetX = (Math.random() - 0.5) * 4
        const offsetY = (Math.random() - 0.5) * 4
        if (i === 0) {
          g.moveTo(x + offsetX, y + offsetY)
        } else {
          g.lineTo(x + offsetX, y + offsetY)
        }
      }
      
      lastX = p.x
      lastY = p.y
    }
    g.strokePath()
  }

  /**
   * 生成感电特效
   */
  spawnShockEffect(x: number, y: number) {
    const gfx = this.scene.add.graphics()
    // 电光闪烁
    for (let i = 0; i < 3; i++) {
      const angle = (Math.PI * 2 / 3) * i
      const len = 6 + Math.random() * 4
      const endX = x + Math.cos(angle) * len
      const endY = y + Math.sin(angle) * len
      gfx.lineStyle(2, 0xffff00, 0.9)
      gfx.lineBetween(x, y, endX, endY)
    }
    
    this.scene.tweens.add({
      targets: gfx,
      alpha: 0,
      duration: 150,
      onComplete: () => gfx.destroy(),
    })
  }

  /**
   * 生成冻结特效
   */
  spawnFreezeEffect(x: number, y: number) {
    const gfx = this.scene.add.graphics()
    gfx.lineStyle(2, 0x6bffea, 0.9)
    gfx.strokeCircle(x, y, 8)
    gfx.fillStyle(0xffffff, 0.6)
    gfx.fillCircle(x, y, 3)
    
    this.scene.tweens.add({
      targets: gfx,
      scaleX: 1.5,
      scaleY: 1.5,
      alpha: 0,
      duration: 400,
      onComplete: () => gfx.destroy(),
    })
  }

  /**
   * 生成火焰粒子
   */
  spawnFireParticles(x: number, y: number, radius: number, count: number) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2
      const dist = Math.random() * radius
      const px = x + Math.cos(angle) * dist
      const py = y + Math.sin(angle) * dist
      
      const particle = this.scene.add.circle(px, py, 2, 0xff6b00, 0.8)
      
      this.scene.tweens.add({
        targets: particle,
        y: py - 20 - Math.random() * 30,
        x: px + (Math.random() - 0.5) * 20,
        alpha: 0,
        scale: 0.3,
        duration: 500 + Math.random() * 300,
        onComplete: () => particle.destroy(),
      })
    }
  }

  /**
   * 生成冰晶粒子
   */
  spawnIceParticles(centerX: number, width: number, height: number, count: number) {
    for (let i = 0; i < count; i++) {
      const x = centerX + (Math.random() - 0.5) * width * 1.5
      const y = Math.random() * height
      const particle = this.scene.add.circle(x, y, 1.5, 0x6bffea, 0.7)
      
      this.scene.tweens.add({
        targets: particle,
        x: x + Math.cos(Math.random() * Math.PI * 2) * 10,
        y: y + Math.sin(Math.random() * Math.PI * 2) * 10,
        alpha: 0,
        scale: 0.5,
        duration: 600,
        onComplete: () => particle.destroy(),
      })
    }
  }
}

