import type { DamageType } from '../damage/DamageType'

export type ZombieKind = 'walker' | 'brute' | 'spitter' | 'boss' | 'final_boss'
  | 'wind_resistant' | 'fire_resistant' | 'electric_resistant' | 'energy_resistant' | 'ice_resistant' | 'physical_resistant'

export type AttackMode = 'melee' | 'ranged'

/**
 * 属性抗性和弱点配置
 */
export type ElementResistance = Readonly<{
  /** 抗性属性 -> 减伤百分比（0-1，如0.4表示40%减伤，即只受到60%伤害） */
  resistances: Partial<Record<DamageType, number>>
  /** 弱点属性 -> 增伤百分比（0-1，如0.4表示40%增伤，即受到140%伤害） */
  weaknesses: Partial<Record<DamageType, number>>
}>

export type ZombieTypeDef = Readonly<{
  kind: ZombieKind
  name: string
  color: number
  baseHp: number
  baseSpeed: number
  attackMode: AttackMode
  attackDamage: number
  attackIntervalSec: number
  /** 远程怪：在距离防线该距离处开始停下并攻击 */
  rangedStopDistance?: number
  /** 远程怪子弹速度 */
  shotSpeed?: number
  /** 体型大小（用于分裂子弹逻辑） */
  size: number
  exp: number
  /** 属性抗性和弱点（可选） */
  elementResistance?: ElementResistance
}>

export const ZOMBIE_TYPES: Record<ZombieKind, ZombieTypeDef> = {
  walker: {
    kind: 'walker',
    name: '步行者',
    color: 0x86ff7a,
    baseHp: 110,
    baseSpeed: 28,
    attackMode: 'melee',
    attackDamage: 6,
    attackIntervalSec: 0.7,
    size: 2,  // 普通僵尸体型为2
    exp: 3,
  },
  brute: {
    kind: 'brute',
    name: '巨尸',
    color: 0x6bffea,
    baseHp: 1132,
    baseSpeed: 12,
    attackMode: 'melee',
    attackDamage: 18,
    attackIntervalSec: 1.2,
    size: 3,  // 巨尸体型为3
    exp: 7,
  },
  spitter: {
    kind: 'spitter',
    name: '喷吐者',
    color: 0xffe66b,
    baseHp: 114,
    baseSpeed: 20,
    attackMode: 'ranged',
    attackDamage: 10,
    attackIntervalSec: 1.0,
    rangedStopDistance: 90,
    shotSpeed: 140,
    size: 1.5,  // 远程怪体型为1.5
    exp: 5,
  },
  boss: {
    kind: 'boss',
    name: 'Boss',
    color: 0xff6b6b,
    baseHp: 1200,
    baseSpeed: 15,
    attackMode: 'melee',
    attackDamage: 30,
    attackIntervalSec: 2,
    size: 5,  // Boss体型为5
    exp: 50,
    // Boss有2-3种减伤和1种增伤
    elementResistance: {
      resistances: {
        wind: 0.5,   // 50%风抗
        ice: 0.6,    // 60%冰抗
        physical: 0.4,  // 40%物抗
      },
      weaknesses: {
        fire: 0.5,  // 50%火弱
      },
    },
  },
  final_boss: {
    kind: 'final_boss',
    name: '最终Boss',
    color: 0xff0000,
    baseHp: 2000,
    baseSpeed: 12,
    attackMode: 'melee',
    attackDamage: 50,
    attackIntervalSec: 3,
    size: 8,  // 最终Boss体型为8
    exp: 100,
    // Boss有2-3种减伤和1种增伤
    elementResistance: {
      resistances: {
        fire: 0.5,      // 50%火抗
        electric: 0.6,  // 60%电抗
        physical: 0.4,  // 40%物抗
      },
      weaknesses: {
        ice: 0.5,  // 50%冰弱
      },
    },
  },
  
  // ===== 属性抗性僵尸（每种对应一种属性的抗性）=====
  wind_resistant: {
    kind: 'wind_resistant',
    name: '风抗僵尸',
    color: 0x4ade80,  // 绿色
    baseHp: 150,
    baseSpeed: 25,
    attackMode: 'melee',
    attackDamage: 8,
    attackIntervalSec: 0.8,
    size: 2,
    exp: 4,
    elementResistance: {
      resistances: {
        wind: 0.55,  // 55%风抗（40-70%随机）
      },
      weaknesses: {
        fire: 0.55,  // 55%火弱（随机属性）
      },
    },
  },
  fire_resistant: {
    kind: 'fire_resistant',
    name: '火抗僵尸',
    color: 0xf97316,  // 橙色
    baseHp: 140,
    baseSpeed: 22,
    attackMode: 'melee',
    attackDamage: 9,
    attackIntervalSec: 0.75,
    size: 2,
    exp: 4,
    elementResistance: {
      resistances: {
        fire: 0.60,  // 60%火抗
      },
      weaknesses: {
        ice: 0.50,  // 50%冰弱
      },
    },
  },
  electric_resistant: {
    kind: 'electric_resistant',
    name: '电抗僵尸',
    color: 0xfbbf24,  // 黄色
    baseHp: 130,
    baseSpeed: 24,
    attackMode: 'melee',
    attackDamage: 7,
    attackIntervalSec: 0.85,
    size: 2,
    exp: 4,
    elementResistance: {
      resistances: {
        electric: 0.65,  // 65%电抗
      },
      weaknesses: {
        physical: 0.45,  // 45%物弱
      },
    },
  },
  energy_resistant: {
    kind: 'energy_resistant',
    name: '能量抗僵尸',
    color: 0x3b82f6,  // 蓝色
    baseHp: 145,
    baseSpeed: 23,
    attackMode: 'melee',
    attackDamage: 8,
    attackIntervalSec: 0.8,
    size: 2,
    exp: 4,
    elementResistance: {
      resistances: {
        energy: 0.50,  // 50%能量抗
      },
      weaknesses: {
        electric: 0.60,  // 60%电弱
      },
    },
  },
  ice_resistant: {
    kind: 'ice_resistant',
    name: '冰抗僵尸',
    color: 0x60a5fa,  // 浅蓝色
    baseHp: 135,
    baseSpeed: 26,
    attackMode: 'melee',
    attackDamage: 7,
    attackIntervalSec: 0.9,
    size: 2,
    exp: 4,
    elementResistance: {
      resistances: {
        ice: 0.70,  // 70%冰抗
      },
      weaknesses: {
        fire: 0.55,  // 55%火弱
      },
    },
  },
  physical_resistant: {
    kind: 'physical_resistant',
    name: '物抗僵尸',
    color: 0x9ca3af,  // 灰色
    baseHp: 160,
    baseSpeed: 20,
    attackMode: 'melee',
    attackDamage: 10,
    attackIntervalSec: 0.7,
    size: 2,
    exp: 4,
    elementResistance: {
      resistances: {
        physical: 0.45,  // 45%物抗
      },
      weaknesses: {
        energy: 0.65,  // 65%能量弱
      },
    },
  },
}


