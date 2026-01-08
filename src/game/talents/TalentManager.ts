import Phaser from 'phaser'
import type { Zombie } from '../entities/Zombie'
import type { SkillSystem } from '../skills/SkillSystem'

/**
 * 天赋管理器
 * 负责处理天赋效果（传送、秒杀等）
 */
export class TalentManager {
  private teleportingZombies = new Map<number, {
    zombie: Zombie
    startX: number
    startY: number
    targetX: number
    targetY: number
    progress: number
  }>()

  constructor(
    private scene: Phaser.Scene,
    private skills: SkillSystem,
    private scale: { width: number; height: number }
  ) {}

  /**
   * 应用天赋效果（命中时触发）
   */
  applyTalentEffectsOnHit(target: Zombie, damage: number, isCrit: boolean): boolean {
    // 天赋1：传送敌人到刷怪点 (1.2*x)%概率
    const talent1Level = this.skills.getLevel('talent_teleport')
    if (talent1Level > 0 && !this.teleportingZombies.has(target.id)) {
      const x = talent1Level
      const chance = 0.012 * x  // 1.2% * x
      if (Math.random() < chance) {
        this.teleportZombieToSpawn(target)
      }
    }
    
    // 天赋2：秒杀小怪 (1*x)%概率（除boss外）
    const talent2Level = this.skills.getLevel('talent_instakill')
    if (talent2Level > 0 && target.kind !== 'boss' && target.kind !== 'final_boss') {
      const x = talent2Level
      const chance = 0.01 * x  // 1% * x
      if (Math.random() < chance) {
        this.instakillZombie(target)
        return true  // 秒杀后不再执行其他天赋
      }
    }
    
    return false
  }

  /**
   * 传送僵尸到刷怪点
   */
  private teleportZombieToSpawn(zombie: Zombie) {
    // 刷怪点位置：屏幕顶部中央区域随机
    const spawnX = Phaser.Math.Between(14, this.scale.width - 14)
    const spawnY = -16
    
    // 记录传送动画状态
    this.teleportingZombies.set(zombie.id, {
      zombie,
      startX: zombie.x,
      startY: zombie.y,
      targetX: spawnX,
      targetY: spawnY,
      progress: 0,
    })
  }

  /**
   * 秒杀僵尸（添加秒杀特效）
   */
  private instakillZombie(zombie: Zombie) {
    // 秒杀特效：金色爆炸
    const gfx = this.scene.add.graphics()
    gfx.fillStyle(0xffd700, 1.0)
    gfx.fillCircle(zombie.x, zombie.y, 20)
    gfx.fillStyle(0xffffff, 1.0)
    gfx.fillCircle(zombie.x, zombie.y, 10)
    
    // 0.2秒后销毁特效
    this.scene.time.delayedCall(0.2, () => {
      gfx.destroy()
    })
    
    // 直接秒杀
    const oldHp = zombie.hp
    zombie.takeDamage(zombie.hp + 1)
    return oldHp
  }

  /**
   * 更新传送动画（每帧调用）
   */
  updateTeleportAnimations(dtSec: number) {
    const animationDuration = 0.2  // 0.2秒动画
    const keep = new Map<number, {
      zombie: Zombie
      startX: number
      startY: number
      targetX: number
      targetY: number
      progress: number
    }>()
    
    for (const [id, anim] of this.teleportingZombies.entries()) {
      anim.progress += dtSec / animationDuration
      
      if (anim.progress >= 1.0) {
        // 动画完成，传送僵尸到目标位置
        anim.zombie.go.x = anim.targetX
        anim.zombie.go.y = anim.targetY
        // 不添加到keep，表示动画完成
      } else {
        // 插值计算当前位置
        const t = anim.progress
        anim.zombie.go.x = anim.startX + (anim.targetX - anim.startX) * t
        anim.zombie.go.y = anim.startY + (anim.targetY - anim.startY) * t
        keep.set(id, anim)
      }
    }
    
    this.teleportingZombies = keep
  }
}

