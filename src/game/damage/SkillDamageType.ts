/**
 * 技能属性映射：定义每个技能的伤害属性
 */
import type { MainSkillId } from '../skills/skillDefs'
import type { DamageType } from './DamageType'

/**
 * 技能属性映射表
 */
export const SKILL_DAMAGE_TYPES: Record<MainSkillId, DamageType> = {
  // 武器强化技能（物理属性）
  bullet_spread: 'physical',
  weapon_rapid_fire: 'physical',
  weapon_fire_rate: 'physical',
  weapon_damage: 'physical',
  weapon_pierce: 'physical',
  weapon_split_2: 'physical',
  weapon_split_4: 'physical',
  
  // 能量系技能
  aurora: 'energy',
  high_energy_ray: 'energy',
  guided_laser: 'energy',
  
  // 风系技能
  tornado: 'wind',
  mini_vortex: 'wind',
  air_blast: 'wind',
  
  // 火系技能
  thermobaric: 'fire',
  napalm: 'fire',
  carpet_bomb: 'fire',
  
  // 冰系技能
  ice_pierce: 'ice',
  ice_storm: 'ice',
  
  // 电系技能
  emp_pierce: 'electric',
  chain_electron: 'electric',
  
  // 物理系技能
  armored_car: 'physical',
  
  // 天赋技能（物理属性，因为它们作用于所有技能）
  talent_teleport: 'physical',
  talent_instakill: 'physical',
  talent_crit_enhance: 'physical',
}

/**
 * 获取技能的伤害属性
 */
export function getSkillDamageType(skillId: MainSkillId): DamageType {
  return SKILL_DAMAGE_TYPES[skillId] ?? 'physical'
}

