export type ZombieKind = 'walker' | 'brute' | 'spitter' | 'boss' | 'final_boss'

export type AttackMode = 'melee' | 'ranged'

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
  exp: number
}>

export const ZOMBIE_TYPES: Record<ZombieKind, ZombieTypeDef> = {
  walker: {
    kind: 'walker',
    name: '步行者',
    color: 0x86ff7a,
    baseHp: 10,
    baseSpeed: 28,
    attackMode: 'melee',
    attackDamage: 6,
    attackIntervalSec: 0.7,
    exp: 3,
  },
  brute: {
    kind: 'brute',
    name: '巨尸',
    color: 0x6bffea,
    baseHp: 32,
    baseSpeed: 12,
    attackMode: 'melee',
    attackDamage: 18,
    attackIntervalSec: 1.2,
    exp: 7,
  },
  spitter: {
    kind: 'spitter',
    name: '喷吐者',
    color: 0xffe66b,
    baseHp: 14,
    baseSpeed: 20,
    attackMode: 'ranged',
    attackDamage: 10,
    attackIntervalSec: 1.0,
    rangedStopDistance: 90,
    shotSpeed: 140,
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
    exp: 50,
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
    exp: 100,
  },
}


