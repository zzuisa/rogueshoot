import type { Zombie } from '../entities/Zombie'
import type { Player } from '../entities/Player'
import type { SkillSystem } from '../skills/SkillSystem'
import type { DamageType } from './DamageType'

export interface DamageResult {
  finalDamage: number
  isCrit: boolean
}

/**
 * 伤害计算器
 * 负责计算伤害、暴击、天赋效果等
 */
export class DamageCalculator {
  private timeAliveSec = 0
  private scene: Phaser.Scene
  private player: Player
  private skills: SkillSystem
  
  constructor(
    scene: Phaser.Scene,
    player: Player,
    skills: SkillSystem
  ) {
    this.scene = scene
    this.player = player
    this.skills = skills
  }
  
  setTimeAliveSec(timeAliveSec: number) {
    this.timeAliveSec = timeAliveSec
  }

  /**
   * 计算伤害（包含暴击和天赋效果）
   */
  calculateDamageWithCritAndTalents(
    baseDamage: number,
    target: Zombie,
    source: string,
    damageType?: DamageType
  ): DamageResult {
    // 先应用属性抗性和弱点（在getDamageTakenMult中处理）
    const damageWithResistance = baseDamage * target.getDamageTakenMult(this.timeAliveSec, damageType)
    
    // 计算暴击
    const isCrit = Math.random() < this.player.critChance
    let finalDamage = damageWithResistance
    
    if (isCrit) {
      // 基础暴击伤害
      finalDamage = damageWithResistance * this.player.critDamageMult
      
      // 天赋3：暴击增强（暴击造成200%基础伤害 + 额外(2.5*x)%最大生命值）
      const talent3Level = this.skills.getLevel('talent_crit_enhance')
      if (talent3Level > 0) {
        const x = talent3Level
        finalDamage = damageWithResistance * 2.0 + target.maxHp * (0.025 * x)
      }
    }
    
    return { finalDamage, isCrit }
  }
}

