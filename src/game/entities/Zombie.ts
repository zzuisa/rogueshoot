/**
 * 僵尸实体：代表游戏中的敌人单位
 * 
 * 功能：
 * - 从上方向下移动，到达防线后开始攻击
 * - 支持近战和远程两种攻击模式
 * - 支持多种状态效果：冻结、感电、点燃、击退
 */
import Phaser from 'phaser'
import type { AttackMode, ZombieKind } from './zombieTypes'

/**
 * 僵尸创建配置
 */
export type ZombieConfig = Readonly<{
  x: number                    // 初始X坐标
  y: number                    // 初始Y坐标
  hp: number                   // 初始生命值
  speed: number                // 移动速度（像素/秒）
  kind: ZombieKind             // 僵尸类型（walker/brute/spitter）
  color: number                // 显示颜色（十六进制）
  attackMode: AttackMode       // 攻击模式（melee/ranged）
  attackDamage: number         // 攻击伤害
  attackIntervalSec: number    // 攻击间隔（秒）
  rangedStopDistance: number   // 远程怪停止距离（距离防线多远停下）
  shotSpeed: number            // 远程怪子弹速度（像素/秒）
}>

export class Zombie {
  /** 全局ID计数器（用于唯一标识每个僵尸） */
  private static _nextId = 1
  /** 唯一ID */
  readonly id: number
  /** Phaser图形对象（用于渲染） */
  readonly go: Phaser.GameObjects.Rectangle
  /** 血条图形对象（显示在僵尸上方） */
  private hpBarGfx!: Phaser.GameObjects.Graphics
  /** 当前生命值 */
  hp: number
  /** 最大生命值（用于百分比伤害计算） */
  readonly maxHp: number
  /** 移动速度（像素/秒） */
  readonly speed: number
  /** 僵尸类型 */
  readonly kind: ZombieKind
  /** 攻击模式：近战或远程 */
  readonly attackMode: AttackMode
  /** 攻击伤害 */
  readonly attackDamage: number
  /** 攻击间隔（秒） */
  readonly attackIntervalSec: number
  /** 远程怪停止距离（距离防线多远停下） */
  readonly rangedStopDistance: number
  /** 远程怪子弹速度（像素/秒） */
  readonly shotSpeed: number

  // ===== 状态效果 =====
  /** 冻结状态：冻结直到该时间戳（0表示未冻结） */
  private frozenUntil = 0
  /** 感电状态：感电直到该时间戳（0表示未感电） */
  private shockedUntil = 0
  /** 感电增伤倍率（默认1.0，感电时>1.0） */
  private shockMult = 1
  /** 点燃状态：燃烧直到该时间戳（0表示未点燃） */
  private burningUntil = 0
  /** 燃烧百分比伤害（每秒扣除最大生命值的百分比） */
  private burnPctPerSec = 0

  // ===== 物理效果 =====
  /** 额外垂直速度（负值表示向上击退/击飞） */
  private extraVy = 0

  // ===== 攻击相关 =====
  /** 攻击冷却时间（秒） */
  private attackCooldown = 0
  /** 是否正在攻击防线（已到达停止位置） */
  private attacking = false

  constructor(scene: Phaser.Scene, cfg: ZombieConfig) {
    this.id = Zombie._nextId++
    this.hp = cfg.hp
    this.maxHp = cfg.hp  // 记录最大生命值（用于百分比伤害）
    this.speed = cfg.speed
    this.kind = cfg.kind
    this.attackMode = cfg.attackMode
    this.attackDamage = cfg.attackDamage
    this.attackIntervalSec = cfg.attackIntervalSec
    this.rangedStopDistance = cfg.rangedStopDistance
    this.shotSpeed = cfg.shotSpeed

    // 创建Phaser矩形图形（12x12像素，带边框）
    this.go = scene.add.rectangle(cfg.x, cfg.y, 12, 12, cfg.color, 1)
    this.go.setStrokeStyle(2, 0x0c0f14, 0.7)
    
    // 创建血条图形（初始满血）
    this.hpBarGfx = scene.add.graphics()
    this.updateHpBar()
  }

  /** 获取当前X坐标 */
  get x() {
    return this.go.x
  }
  /** 获取当前Y坐标 */
  get y() {
    return this.go.y
  }

  /**
   * 更新僵尸状态（每帧调用）
   * 
   * @param dtSec 帧间隔（秒）
   * @param nowSec 当前游戏时间（秒，用于状态效果）
   * @param defenseLineY 防线Y坐标
   */
  update(dtSec: number, nowSec: number, defenseLineY: number) {
    // 冻结状态：无法移动和攻击
    if (nowSec < this.frozenUntil) {
      this.updateHpBar()  // 即使冻结也要更新血条位置
      return
    }
    
    // 正在攻击：只更新攻击冷却
    if (this.attacking) {
      this.attackCooldown = Math.max(0, this.attackCooldown - dtSec)
      this.updateHpBar()  // 更新血条位置
      return
    }

    // 击退效果衰减（线性插值回0）
    this.extraVy = Phaser.Math.Linear(this.extraVy, 0, 0.12)
    
    // 向下移动（基础速度 + 击退效果）
    this.go.y += (this.speed + this.extraVy) * dtSec
    
    // 计算停止位置（远程怪在防线前停下，近战怪到达防线）
    const stopY =
      this.attackMode === 'ranged'
        ? defenseLineY - Math.max(0, this.rangedStopDistance)
        : defenseLineY

    // 到达停止位置：开始攻击
    if (this.go.y >= stopY) {
      this.go.y = stopY
      this.attacking = true
      this.attackCooldown = 0
    }
    
    // 更新血条位置（跟随僵尸移动）
    this.updateHpBar()
  }

  /**
   * 受到伤害
   * @param amount 伤害值
   * @returns 是否死亡
   */
  takeDamage(amount: number) {
    this.hp -= amount
    this.updateHpBar()
    return this.hp <= 0
  }

  /**
   * 更新血条显示（在僵尸上方绘制）
   */
  private updateHpBar() {
    if (!this.hpBarGfx || !this.go.active) return
    
    const barWidth = 16
    const barHeight = 3
    const offsetY = -10  // 血条在僵尸上方的偏移
    
    this.hpBarGfx.clear()
    
    // 背景（红色）
    this.hpBarGfx.fillStyle(0x440000, 0.8)
    this.hpBarGfx.fillRect(
      this.go.x - barWidth / 2,
      this.go.y + offsetY,
      barWidth,
      barHeight
    )
    
    // 当前血量（绿色，根据血量百分比）
    const hpPercent = Math.max(0, Math.min(1, this.hp / this.maxHp))
    const fillColor = hpPercent > 0.5 ? 0x00ff00 : hpPercent > 0.25 ? 0xffff00 : 0xff0000
    this.hpBarGfx.fillStyle(fillColor, 0.9)
    this.hpBarGfx.fillRect(
      this.go.x - barWidth / 2,
      this.go.y + offsetY,
      barWidth * hpPercent,
      barHeight
    )
    
    // 边框
    this.hpBarGfx.lineStyle(1, 0xffffff, 0.6)
    this.hpBarGfx.strokeRect(
      this.go.x - barWidth / 2,
      this.go.y + offsetY,
      barWidth,
      barHeight
    )
  }

  /**
   * 是否存活（图形激活且生命值>0）
   */
  isAlive() {
    return this.go.active && this.hp > 0
  }

  /**
   * 是否正在攻击防线
   */
  isAttacking() {
    return this.attacking
  }

  /**
   * 获取冻结状态结束时间（用于预测移动）
   * @returns 冻结状态结束的时间戳（秒），0表示未冻结
   */
  getFrozenUntil() {
    return this.frozenUntil
  }

  /**
   * 获取当前受到的伤害倍率（感电状态会增加受伤）
   * @param nowSec 当前游戏时间（秒）
   * @returns 伤害倍率（默认1.0，感电时>1.0）
   */
  getDamageTakenMult(nowSec: number) {
    if (nowSec < this.shockedUntil) return this.shockMult
    return 1
  }

  /**
   * 应用点燃效果（按最大生命百分比持续扣血）
   * @param nowSec 当前游戏时间（秒）
   * @param durationSec 持续时间（秒）
   * @param pctPerSec 每秒扣除最大生命值的百分比（如0.05表示每秒5%）
   */
  applyBurn(nowSec: number, durationSec: number, pctPerSec: number) {
    this.burningUntil = Math.max(this.burningUntil, nowSec + durationSec)
    this.burnPctPerSec = Math.max(this.burnPctPerSec, pctPerSec)
  }

  /**
   * 应用冻结效果（无法移动和攻击）
   * @param nowSec 当前游戏时间（秒）
   * @param durationSec 持续时间（秒）
   */
  applyFreeze(nowSec: number, durationSec: number) {
    this.frozenUntil = Math.max(this.frozenUntil, nowSec + durationSec)
  }

  /**
   * 应用感电效果（增加受到的伤害）
   * @param nowSec 当前游戏时间（秒）
   * @param durationSec 持续时间（秒）
   * @param mult 伤害倍率（如1.5表示受到1.5倍伤害）
   */
  applyShock(nowSec: number, durationSec: number, mult: number) {
    this.shockedUntil = Math.max(this.shockedUntil, nowSec + durationSec)
    this.shockMult = Math.max(this.shockMult, mult)
  }

  /**
   * 获取本帧的燃烧伤害（由外部每帧调用）
   * @param dtSec 帧间隔（秒）
   * @param nowSec 当前游戏时间（秒）
   * @returns 本帧应扣除的伤害值
   */
  getBurnDamage(dtSec: number, nowSec: number) {
    if (nowSec >= this.burningUntil) return 0
    return this.maxHp * this.burnPctPerSec * dtSec
  }

  /**
   * 击退效果（向上击飞）
   * @param strength 击退强度（像素/秒，负值表示向上）
   */
  knockUp(strength: number) {
    // 取负值确保是向上击退，并取最小值（保留更强的击退效果）
    this.extraVy = Math.min(this.extraVy, -Math.abs(strength))
  }

  /**
   * 尝试攻击防线（由外部每帧调用）
   * @param dtSec 帧间隔（秒）
   * @returns 本帧是否进行了攻击（true表示可以进行攻击，伤害由外部处理）
   */
  tryAttack(dtSec: number) {
    if (!this.attacking) return false
    this.attackCooldown = Math.max(0, this.attackCooldown - dtSec)
    if (this.attackCooldown > 0) return false  // 冷却未到
    this.attackCooldown = this.attackIntervalSec  // 重置冷却
    return true  // 可以攻击
  }

  /**
   * 销毁僵尸（清理图形对象）
   */
  destroy() {
    if (this.hpBarGfx) this.hpBarGfx.destroy()
    this.go.destroy()
  }
}


