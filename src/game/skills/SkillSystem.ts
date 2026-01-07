/**
 * 技能系统：管理所有技能的等级、解锁状态和数值派生
 * 
 * 核心功能：
 * - 技能等级管理（主技能 + 分支升级）
 * - 分支升级数值派生（伤害/冷却/数量/范围/持续）
 * - 判断技能是否可出现在升级选项中
 */
import { SKILL_DEFS, type MainSkillId, type SkillDef, type SkillId, type UpgradeKind } from './skillDefs'

/**
 * 升级时展示给玩家的技能选择项
 */
export type SkillChoice = Readonly<{
  id: SkillId
  name: string
  desc: string
}>

export class SkillSystem {
  /** 技能ID -> 当前等级 */
  private levels = new Map<SkillId, number>()

  /**
   * 获取指定技能的当前等级（未解锁返回0）
   */
  getLevel(id: SkillId) {
    return this.levels.get(id) ?? 0
  }

  /**
   * 判断技能是否还能继续升级
   */
  canLevelUp(id: SkillId) {
    const def = SKILL_DEFS[id]
    return this.getLevel(id) < def.maxLevel
  }

  /**
   * 升级指定技能（达到最大等级后不再升级）
   */
  levelUp(id: SkillId) {
    const def = SKILL_DEFS[id]
    const current = this.getLevel(id)
    if (current >= def.maxLevel) return
    this.levels.set(id, current + 1)
  }

  /**
   * 判断主技能是否已解锁（等级>0）
   */
  isUnlocked(mainId: MainSkillId) {
    return this.getLevel(mainId) > 0
  }

  // ===== 分支升级数值派生（按主技能） =====
  // 数值约定：
  // - 伤害增强：每级 +20%（乘算，如1级=1.2倍，2级=1.4倍）
  // - 冷却缩减：每级 -10%（乘算，下限40%，如1级=0.9倍，2级=0.8倍，最多到0.4倍）
  // - 数量/次数：每级 +1（直接加算，如1级=+1，2级=+2）
  // - 范围：每级 +12%（乘算，如1级=1.12倍，2级=1.24倍）
  // - 持续：每级 +15%（乘算，如1级=1.15倍，2级=1.30倍）

  /**
   * 获取指定主技能的某个分支升级等级
   */
  private getUpgradeLevel(mainId: MainSkillId, kind: UpgradeKind) {
    return this.getLevel(`${mainId}_${kind}` as SkillId)
  }

  /**
   * 获取伤害倍率（每级+20%）
   */
  getDamageMult(mainId: MainSkillId) {
    const lv = this.getUpgradeLevel(mainId, 'damage')
    return 1 + lv * 0.2
  }

  /**
   * 获取冷却倍率（每级-10%，下限40%）
   */
  getCooldownMult(mainId: MainSkillId) {
    const lv = this.getUpgradeLevel(mainId, 'cooldown')
    return Math.max(0.4, 1 - lv * 0.1)
  }

  /**
   * 获取数量/次数加成（每级+1）
   */
  getCountBonus(mainId: MainSkillId) {
    return this.getUpgradeLevel(mainId, 'count')
  }

  /**
   * 获取范围倍率（每级+12%）
   */
  getRadiusMult(mainId: MainSkillId) {
    const lv = this.getUpgradeLevel(mainId, 'radius')
    return 1 + lv * 0.12
  }

  /**
   * 获取持续时间倍率（每级+15%）
   */
  getDurationMult(mainId: MainSkillId) {
    const lv = this.getUpgradeLevel(mainId, 'duration')
    return 1 + lv * 0.15
  }

  // ===== 武器派生属性（用于子弹散射） =====
  
  /**
   * 子弹散射数量：每次增加1个弹道（而不是1->3->5）
   * 0级=1发，1级=2发，2级=3发，以此类推
   */
  get bulletCount() {
    const lv = this.getLevel('bullet_spread')
    return 1 + lv  // 每次增加1个
  }

  /**
   * 扇形散射角度（弧度）：随散射等级增加
   * 0级=0（单发），1级=0.14弧度（约8度），每级+0.07弧度（约4度）
   */
  get spreadRad() {
    const lv = this.getLevel('bullet_spread')
    if (lv <= 0) return 0
    return 0.07 * lv  // 每级+0.07弧度
  }

  // ===== 武器强化属性 =====
  
  /**
   * 子弹连发数量：每次射击射出多发子弹
   * 每级+1发
   */
  get rapidFireCount() {
    return this.getLevel('weapon_rapid_fire')
  }

  /**
   * 射速倍率：每级+10%
   */
  get fireRateMult() {
    return 1 + this.getLevel('weapon_fire_rate') * 0.1
  }

  /**
   * 子弹伤害倍率：每级+60%
   */
  get weaponDamageMult() {
    return 1 + this.getLevel('weapon_damage') * 0.6
  }

  /**
   * 子弹分裂数量（1->2）：每级+1次分裂机会
   */
  get split2Count() {
    return this.getLevel('weapon_split_2')
  }

  /**
   * 子弹分裂数量（1->4）：每级+1次分裂机会
   */
  get split4Count() {
    return this.getLevel('weapon_split_4')
  }

  /**
   * 判断技能是否可出现在升级选项中
   * - 必须还能继续升级（未达最大等级）
   * - 如果是分支技能，必须先解锁对应的主技能
   */
  isEligible(def: SkillDef) {
    if (!this.canLevelUp(def.id)) return false
    if (def.type === 'upgrade') {
      if (!def.requires) return false
      if (!this.isUnlocked(def.requires)) return false
    }
    return true
  }

  /**
   * 获取已解锁的主技能数量（不包括bullet_spread）
   */
  getMainSkillCount(): number {
    const mainSkills: MainSkillId[] = [
      'aurora', 'tornado', 'thermobaric', 'napalm', 'ice_pierce',
      'high_energy_ray', 'guided_laser', 'armored_car', 'mini_vortex',
      'air_blast', 'carpet_bomb', 'ice_storm', 'emp_pierce', 'chain_electron'
    ]
    return mainSkills.filter(id => this.isUnlocked(id)).length
  }

  /**
   * 获取所有已解锁的主技能ID列表
   */
  getUnlockedMainSkills(): MainSkillId[] {
    const allMainSkills: MainSkillId[] = [
      'bullet_spread', 'aurora', 'tornado', 'thermobaric', 'napalm', 'ice_pierce',
      'high_energy_ray', 'guided_laser', 'armored_car', 'mini_vortex',
      'air_blast', 'carpet_bomb', 'ice_storm', 'emp_pierce', 'chain_electron'
    ]
    return allMainSkills.filter(id => this.isUnlocked(id))
  }
}


