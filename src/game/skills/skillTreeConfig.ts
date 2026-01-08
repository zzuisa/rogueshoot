/**
 * 技能树配置：统一管理所有技能的依赖关系和最大等级
 * 
 * 此文件集中管理：
 * - 技能最大等级
 * - 技能依赖关系（前置技能、优先级）
 */
import type { SkillId, MainSkillId, UpgradeKind } from './skillDefs'
import type { SkillTreeConfig } from './SkillTree'

/**
 * 创建分支升级配置的辅助函数
 */
function upgrade(
  mainId: MainSkillId,
  kind: UpgradeKind,
  maxLevel: number,
  priority?: number
): { maxLevel: number; dependency?: { requires: MainSkillId; priority?: number } } {
  return {
    maxLevel,
    dependency: {
      requires: mainId,
      priority,
    },
  }
}

/**
 * 技能树配置：所有技能的配置信息
 * 
 * 优先级说明：
 * - 1-10: 基础武器强化技能（最高优先级）
 * - 11-20: 核心输出技能
 * - 21-30: 控制类技能
 * - 31-40: 辅助类技能
 * - 分支升级：继承主技能优先级 + 100
 */
export const SKILL_TREE_CONFIG: SkillTreeConfig = {
  // ===== 基础武器强化技能（优先级1-10）=====
  bullet_spread: {
    maxLevel: 10,
    dependency: { priority: 1 },  // 最高优先级
  },
  
  weapon_rapid_fire: {
    maxLevel: 5,
    dependency: { priority: 2 },
  },
  
  weapon_fire_rate: {
    maxLevel: 10,
    dependency: { priority: 3 },
  },
  
  weapon_damage: {
    maxLevel: 5,
    dependency: { priority: 4 },
  },
  
  weapon_pierce: {
    maxLevel: 5,
    dependency: { priority: 5 },
  },
  
  weapon_split_2: {
    maxLevel: 3,
    dependency: { priority: 6 },
  },
  
  weapon_split_4: {
    maxLevel: 3,
    dependency: {
      requires: 'weapon_split_2',  // 必须先解锁 weapon_split_2
      requiresLevel: 1,
      priority: 7,
    },
  },

  // ===== 核心输出技能（优先级11-20）=====
  aurora: {
    maxLevel: 6,
    dependency: { priority: 11 },
  },
  
  tornado: {
    maxLevel: 6,
    dependency: { priority: 12 },
  },
  
  thermobaric: {
    maxLevel: 6,
    dependency: { priority: 13 },
  },
  
  napalm: {
    maxLevel: 6,
    dependency: { priority: 14 },
  },
  
  ice_pierce: {
    maxLevel: 6,
    dependency: { priority: 15 },
  },
  
  high_energy_ray: {
    maxLevel: 6,
    dependency: { priority: 16 },
  },
  
  guided_laser: {
    maxLevel: 6,
    dependency: { priority: 17 },
  },

  // ===== 控制类技能（优先级21-30）=====
  armored_car: {
    maxLevel: 6,
    dependency: { priority: 21 },
  },
  
  mini_vortex: {
    maxLevel: 6,
    dependency: { priority: 22 },
  },
  
  air_blast: {
    maxLevel: 6,
    dependency: { priority: 23 },
  },
  
  carpet_bomb: {
    maxLevel: 6,
    dependency: { priority: 24 },
  },

  // ===== 元素控制类技能（优先级31-40）=====
  ice_storm: {
    maxLevel: 6,
    dependency: { priority: 31 },
  },
  
  emp_pierce: {
    maxLevel: 6,
    dependency: { priority: 32 },
  },
  
  chain_electron: {
    maxLevel: 6,
    dependency: { priority: 33 },
  },

  // ===== 天赋系统（特殊技能，效果作用于任何技能）=====
  talent_teleport: {
    maxLevel: 5,
    dependency: { priority: 40 },  // 较低优先级，作为特殊技能
  },
  talent_instakill: {
    maxLevel: 5,
    dependency: { priority: 40 },
  },
  talent_crit_enhance: {
    maxLevel: 5,
    dependency: { priority: 40 },
  },

  // ===== 分支升级：bullet_spread =====
  bullet_spread_damage: { maxLevel: 0, dependency: { requires: 'bullet_spread', priority: 101 } },
  bullet_spread_cooldown: { maxLevel: 0, dependency: { requires: 'bullet_spread', priority: 101 } },
  bullet_spread_count: { maxLevel: 0, dependency: { requires: 'bullet_spread', priority: 101 } },
  bullet_spread_radius: { maxLevel: 0, dependency: { requires: 'bullet_spread', priority: 101 } },
  bullet_spread_duration: { maxLevel: 0, dependency: { requires: 'bullet_spread', priority: 101 } },

  // ===== 分支升级：weapon_rapid_fire =====
  weapon_rapid_fire_damage: { maxLevel: 0, dependency: { requires: 'weapon_rapid_fire', priority: 102 } },
  weapon_rapid_fire_cooldown: { maxLevel: 0, dependency: { requires: 'weapon_rapid_fire', priority: 102 } },
  weapon_rapid_fire_count: { maxLevel: 0, dependency: { requires: 'weapon_rapid_fire', priority: 102 } },
  weapon_rapid_fire_radius: { maxLevel: 0, dependency: { requires: 'weapon_rapid_fire', priority: 102 } },
  weapon_rapid_fire_duration: { maxLevel: 0, dependency: { requires: 'weapon_rapid_fire', priority: 102 } },

  // ===== 分支升级：weapon_fire_rate =====
  weapon_fire_rate_damage: { maxLevel: 0, dependency: { requires: 'weapon_fire_rate', priority: 103 } },
  weapon_fire_rate_cooldown: { maxLevel: 0, dependency: { requires: 'weapon_fire_rate', priority: 103 } },
  weapon_fire_rate_count: { maxLevel: 0, dependency: { requires: 'weapon_fire_rate', priority: 103 } },
  weapon_fire_rate_radius: { maxLevel: 0, dependency: { requires: 'weapon_fire_rate', priority: 103 } },
  weapon_fire_rate_duration: { maxLevel: 0, dependency: { requires: 'weapon_fire_rate', priority: 103 } },

  // ===== 分支升级：weapon_damage =====
  weapon_damage_damage: { maxLevel: 0, dependency: { requires: 'weapon_damage', priority: 104 } },
  weapon_damage_cooldown: { maxLevel: 0, dependency: { requires: 'weapon_damage', priority: 104 } },
  weapon_damage_count: { maxLevel: 0, dependency: { requires: 'weapon_damage', priority: 104 } },
  weapon_damage_radius: { maxLevel: 0, dependency: { requires: 'weapon_damage', priority: 104 } },
  weapon_damage_duration: { maxLevel: 0, dependency: { requires: 'weapon_damage', priority: 104 } },

  // ===== 分支升级：weapon_pierce =====
  weapon_pierce_damage: { maxLevel: 0, dependency: { requires: 'weapon_pierce', priority: 105 } },
  weapon_pierce_cooldown: { maxLevel: 0, dependency: { requires: 'weapon_pierce', priority: 105 } },
  weapon_pierce_count: { maxLevel: 0, dependency: { requires: 'weapon_pierce', priority: 105 } },
  weapon_pierce_radius: { maxLevel: 0, dependency: { requires: 'weapon_pierce', priority: 105 } },
  weapon_pierce_duration: { maxLevel: 0, dependency: { requires: 'weapon_pierce', priority: 105 } },

  // ===== 分支升级：weapon_split_2 =====
  weapon_split_2_damage: { maxLevel: 0, dependency: { requires: 'weapon_split_2', priority: 105 } },
  weapon_split_2_cooldown: { maxLevel: 0, dependency: { requires: 'weapon_split_2', priority: 105 } },
  weapon_split_2_count: { maxLevel: 0, dependency: { requires: 'weapon_split_2', priority: 105 } },
  weapon_split_2_radius: { maxLevel: 0, dependency: { requires: 'weapon_split_2', priority: 105 } },
  weapon_split_2_duration: { maxLevel: 0, dependency: { requires: 'weapon_split_2', priority: 105 } },

  // ===== 分支升级：weapon_split_4 =====
  weapon_split_4_damage: { maxLevel: 0, dependency: { requires: 'weapon_split_4', priority: 106 } },
  weapon_split_4_cooldown: { maxLevel: 0, dependency: { requires: 'weapon_split_4', priority: 106 } },
  weapon_split_4_count: { maxLevel: 0, dependency: { requires: 'weapon_split_4', priority: 106 } },
  weapon_split_4_radius: { maxLevel: 0, dependency: { requires: 'weapon_split_4', priority: 106 } },
  weapon_split_4_duration: { maxLevel: 0, dependency: { requires: 'weapon_split_4', priority: 106 } },

  // ===== 分支升级：aurora =====
  aurora_damage: upgrade('aurora', 'damage', 5, 111),
  aurora_cooldown: upgrade('aurora', 'cooldown', 5, 111),
  aurora_count: { maxLevel: 0, dependency: { requires: 'aurora', priority: 111 } },
  aurora_radius: upgrade('aurora', 'radius', 5, 111),
  aurora_duration: { maxLevel: 0, dependency: { requires: 'aurora', priority: 111 } },

  // ===== 分支升级：tornado =====
  tornado_damage: upgrade('tornado', 'damage', 5, 112),
  tornado_cooldown: upgrade('tornado', 'cooldown', 5, 112),
  tornado_count: upgrade('tornado', 'count', 5, 112),
  tornado_radius: upgrade('tornado', 'radius', 5, 112),
  tornado_duration: upgrade('tornado', 'duration', 5, 112),

  // ===== 分支升级：thermobaric =====
  thermobaric_damage: upgrade('thermobaric', 'damage', 5, 113),
  thermobaric_cooldown: upgrade('thermobaric', 'cooldown', 5, 113),
  thermobaric_count: { maxLevel: 999, dependency: { requires: 'thermobaric', priority: 113 } },
  thermobaric_radius: upgrade('thermobaric', 'radius', 5, 113),
  thermobaric_duration: { maxLevel: 0, dependency: { requires: 'thermobaric', priority: 113 } },

  // ===== 分支升级：napalm =====
  napalm_damage: upgrade('napalm', 'damage', 5, 114),
  napalm_cooldown: upgrade('napalm', 'cooldown', 5, 114),
  napalm_count: { maxLevel: 0, dependency: { requires: 'napalm', priority: 114 } },
  napalm_radius: upgrade('napalm', 'radius', 5, 114),
  napalm_duration: upgrade('napalm', 'duration', 5, 114),

  // ===== 分支升级：ice_pierce =====
  ice_pierce_damage: upgrade('ice_pierce', 'damage', 5, 115),
  ice_pierce_cooldown: upgrade('ice_pierce', 'cooldown', 5, 115),
  ice_pierce_count: { maxLevel: 999, dependency: { requires: 'ice_pierce', priority: 115 } },
  ice_pierce_radius: upgrade('ice_pierce', 'radius', 5, 115),
  ice_pierce_duration: upgrade('ice_pierce', 'duration', 5, 115),

  // ===== 分支升级：high_energy_ray =====
  high_energy_ray_damage: upgrade('high_energy_ray', 'damage', 5, 116),
  high_energy_ray_cooldown: upgrade('high_energy_ray', 'cooldown', 5, 116),
  high_energy_ray_count: { maxLevel: 0, dependency: { requires: 'high_energy_ray', priority: 116 } },
  high_energy_ray_radius: upgrade('high_energy_ray', 'radius', 5, 116),
  high_energy_ray_duration: upgrade('high_energy_ray', 'duration', 5, 116),

  // ===== 分支升级：guided_laser =====
  guided_laser_damage: upgrade('guided_laser', 'damage', 5, 117),
  guided_laser_cooldown: upgrade('guided_laser', 'cooldown', 5, 117),
  guided_laser_count: upgrade('guided_laser', 'count', 5, 117),
  guided_laser_radius: { maxLevel: 0, dependency: { requires: 'guided_laser', priority: 117 } },
  guided_laser_duration: { maxLevel: 0, dependency: { requires: 'guided_laser', priority: 117 } },

  // ===== 分支升级：armored_car =====
  armored_car_damage: upgrade('armored_car', 'damage', 5, 121),
  armored_car_cooldown: upgrade('armored_car', 'cooldown', 5, 121),
  armored_car_count: { maxLevel: 999, dependency: { requires: 'armored_car', priority: 121 } },
  armored_car_radius: { maxLevel: 0, dependency: { requires: 'armored_car', priority: 121 } },
  armored_car_duration: upgrade('armored_car', 'duration', 5, 121),

  // ===== 分支升级：mini_vortex =====
  mini_vortex_damage: upgrade('mini_vortex', 'damage', 5, 122),
  mini_vortex_cooldown: upgrade('mini_vortex', 'cooldown', 5, 122),
  mini_vortex_count: upgrade('mini_vortex', 'count', 5, 122),
  mini_vortex_radius: upgrade('mini_vortex', 'radius', 5, 122),
  mini_vortex_duration: upgrade('mini_vortex', 'duration', 5, 122),

  // ===== 分支升级：air_blast =====
  air_blast_damage: upgrade('air_blast', 'damage', 5, 123),
  air_blast_cooldown: upgrade('air_blast', 'cooldown', 5, 123),
  air_blast_count: upgrade('air_blast', 'count', 5, 123),
  air_blast_radius: upgrade('air_blast', 'radius', 5, 123),
  air_blast_duration: { maxLevel: 0, dependency: { requires: 'air_blast', priority: 123 } },

  // ===== 分支升级：carpet_bomb =====
  carpet_bomb_damage: upgrade('carpet_bomb', 'damage', 5, 124),
  carpet_bomb_cooldown: upgrade('carpet_bomb', 'cooldown', 5, 124),
  carpet_bomb_count: upgrade('carpet_bomb', 'count', 5, 124),
  carpet_bomb_radius: upgrade('carpet_bomb', 'radius', 5, 124),
  carpet_bomb_duration: { maxLevel: 0, dependency: { requires: 'carpet_bomb', priority: 124 } },

  // ===== 分支升级：ice_storm =====
  ice_storm_damage: upgrade('ice_storm', 'damage', 5, 131),
  ice_storm_cooldown: upgrade('ice_storm', 'cooldown', 5, 131),
  ice_storm_count: { maxLevel: 999, dependency: { requires: 'ice_storm', priority: 131 } },
  ice_storm_radius: upgrade('ice_storm', 'radius', 5, 131),
  ice_storm_duration: upgrade('ice_storm', 'duration', 5, 131),

  // ===== 分支升级：emp_pierce =====
  emp_pierce_damage: upgrade('emp_pierce', 'damage', 5, 132),
  emp_pierce_cooldown: upgrade('emp_pierce', 'cooldown', 5, 132),
  emp_pierce_count: { maxLevel: 0, dependency: { requires: 'emp_pierce', priority: 132 } },
  emp_pierce_radius: upgrade('emp_pierce', 'radius', 5, 132),
  emp_pierce_duration: upgrade('emp_pierce', 'duration', 5, 132),

  // ===== 电磁穿刺特殊强化 =====
  emp_pierce_extra_1: { maxLevel: 1, dependency: { requires: 'emp_pierce', priority: 132 } },
  emp_pierce_extra_2: { maxLevel: 1, dependency: { requires: 'emp_pierce', priority: 132 } },
  emp_pierce_electric_damage: { maxLevel: 1, dependency: { requires: 'emp_pierce', priority: 132 } },
  emp_pierce_explosion: { maxLevel: 1, dependency: { requires: 'emp_pierce', priority: 132 } },
  emp_pierce_chain: { maxLevel: 1, dependency: { requires: 'emp_pierce', priority: 132 } },

  // ===== 分支升级：chain_electron =====
  chain_electron_damage: upgrade('chain_electron', 'damage', 5, 133),
  chain_electron_cooldown: upgrade('chain_electron', 'cooldown', 5, 133),
  chain_electron_count: upgrade('chain_electron', 'count', 5, 133),
  chain_electron_radius: upgrade('chain_electron', 'radius', 5, 133),
  chain_electron_duration: { maxLevel: 0, dependency: { requires: 'chain_electron', priority: 133 } },

  // ===== 分支升级：天赋技能（天赋不支持分支升级）=====
  talent_teleport_damage: { maxLevel: 0, dependency: { requires: 'talent_teleport', priority: 140 } },
  talent_teleport_cooldown: { maxLevel: 0, dependency: { requires: 'talent_teleport', priority: 140 } },
  talent_teleport_count: { maxLevel: 0, dependency: { requires: 'talent_teleport', priority: 140 } },
  talent_teleport_radius: { maxLevel: 0, dependency: { requires: 'talent_teleport', priority: 140 } },
  talent_teleport_duration: { maxLevel: 0, dependency: { requires: 'talent_teleport', priority: 140 } },

  talent_instakill_damage: { maxLevel: 0, dependency: { requires: 'talent_instakill', priority: 140 } },
  talent_instakill_cooldown: { maxLevel: 0, dependency: { requires: 'talent_instakill', priority: 140 } },
  talent_instakill_count: { maxLevel: 0, dependency: { requires: 'talent_instakill', priority: 140 } },
  talent_instakill_radius: { maxLevel: 0, dependency: { requires: 'talent_instakill', priority: 140 } },
  talent_instakill_duration: { maxLevel: 0, dependency: { requires: 'talent_instakill', priority: 140 } },

  talent_crit_enhance_damage: { maxLevel: 0, dependency: { requires: 'talent_crit_enhance', priority: 140 } },
  talent_crit_enhance_cooldown: { maxLevel: 0, dependency: { requires: 'talent_crit_enhance', priority: 140 } },
  talent_crit_enhance_count: { maxLevel: 0, dependency: { requires: 'talent_crit_enhance', priority: 140 } },
  talent_crit_enhance_radius: { maxLevel: 0, dependency: { requires: 'talent_crit_enhance', priority: 140 } },
  talent_crit_enhance_duration: { maxLevel: 0, dependency: { requires: 'talent_crit_enhance', priority: 140 } },
}

