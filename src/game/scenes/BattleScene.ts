import Phaser from 'phaser'
import { Player } from '../entities/Player'
import { Zombie } from '../entities/Zombie'
import { Bullet } from '../entities/Bullet'
import { Tornado } from '../entities/Tornado'
import { EnemyShot } from '../entities/EnemyShot'
import { ZOMBIE_TYPES, type ZombieKind } from '../entities/zombieTypes'
import { SkillPool } from '../skills/SkillPool'
import { SkillSystem, type SkillChoice } from '../skills/SkillSystem'
import { SKILL_DEFS, type MainSkillId, type SkillId, type SkillDef } from '../skills/skillDefs'

export class BattleScene extends Phaser.Scene {
  private defenseHp = 2000
  private readonly defenseHpMax = 2000

  private exp = 0
  private level = 1
  private expNext = 10

  private player!: Player
  private zombies: Zombie[] = []
  private bullets: Bullet[] = []
  private tornados: Tornado[] = []
  
  /** 手动选择的目标（点击鼠标时设置，优先攻击此目标） */
  private manualTarget: Zombie | null = null
  /** 目标指示器图形（显示当前锁定的目标） */
  private targetIndicatorGfx!: Phaser.GameObjects.Graphics
  private enemyShots: EnemyShot[] = []

  private rangeGfx!: Phaser.GameObjects.Graphics

  private readonly defenseLineY = 520

  private spawnTimer = 0
  private spawnIntervalSec = 0.9
  private timeAliveSec = 0
  
  // 波次系统
  private currentWave = 1
  private readonly maxWaves = 20
  private zombiesInWave = 0
  private zombiesKilledInWave = 0
  private readonly zombiesPerWave = 15 // 每波基础僵尸数量
  private waveCleared = false
  
  // 疯狂模式
  private crazyMode = false
  
  // 无尽模式
  private endlessMode = false

  private pausedForLevelUp = false
  private skillUi: Phaser.GameObjects.Container | null = null

  private skills = new SkillSystem()
  private skillPool = new SkillPool()
  private cds = new Map<MainSkillId, number>()

  // lightweight skill VFX/effects state (keep it simple / easy to swap later)
  private explosions: { x: number; y: number; r: number; ttl: number; gfx: Phaser.GameObjects.Graphics }[] = []
  private burnZones: { x: number; y: number; r: number; ttl: number; pctPerSec: number; gfx: Phaser.GameObjects.Graphics }[] = []
  private beams: { fromX: number; fromY: number; toX: number; toY: number; w: number; ttl: number; dps: number; gfx: Phaser.GameObjects.Graphics }[] = []
  private cars: { x: number; y: number; vx: number; w: number; h: number; ttl: number; dmg: number; kb: number; hit: Set<number>; gfx: Phaser.GameObjects.Graphics }[] =
    []
  private vortexes: { x: number; y: number; r: number; ttl: number; dps: number; pull: number; gfx: Phaser.GameObjects.Graphics }[] = []
  private pendingBombs: { x: number; y: number; delay: number; r: number; dmg: number }[] = []
  private iceFogs: { x: number; y: number; r: number; ttl: number; freezeSec: number; gfx: Phaser.GameObjects.Graphics }[] = []
  private empWaves: { y: number; w: number; ttl: number; dmg: number; shockMult: number; shockSec: number; gfx: Phaser.GameObjects.Graphics }[] = []
  private chainFx: { ttl: number; gfx: Phaser.GameObjects.Graphics }[] = []

  constructor() {
    super({ key: 'BattleScene' })
    // 将实例保存到全局，以便外部访问
    ;(window as any).battleScene = this
  }

  create() {
    // background
    this.add.rectangle(0, 0, this.scale.width, this.scale.height, 0x0c0f14).setOrigin(0)

    // defense line
    const line = this.add.graphics()
    line.lineStyle(2, 0x2a3a58, 1)
    line.lineBetween(0, this.defenseLineY, this.scale.width, this.defenseLineY)

    // 玩家固定在底部中央（不可移动）
    this.player = new Player(this, { x: this.scale.width / 2, y: this.scale.height - 44 })

    // 80% 圆弧射程虚线标记：保留 20% “背后盲区”（朝下）
    this.rangeGfx = this.add.graphics()
    this.drawRangeArc()

    // 目标指示器（显示手动选择的目标）
    this.targetIndicatorGfx = this.add.graphics()

    // 鼠标/触摸点击事件：选择距离点击位置最近的敌人作为目标
    // 移动端和桌面端都支持
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      // 左键点击或触摸（移动端button为0）
      if (pointer.button === 0 || pointer.isDown) {
        this.selectTargetAt(pointer.worldX, pointer.worldY)
      }
    })

    // 初始化第一波
    this.currentWave = 1
    this.zombiesInWave = 0
    this.zombiesKilledInWave = 0
    this.waveCleared = false
    this.crazyMode = false

    this.updateDifficulty() // 初始化难度参数
    this.syncHud()
    this.updateSkillsBar()
  }

  /**
   * 切换疯狂模式
   * @param enabled 是否开启疯狂模式
   */
  setCrazyMode(enabled: boolean) {
    this.crazyMode = enabled
    // 立即更新生成间隔（如果正在生成僵尸）
    this.updateDifficulty()
    // 更新HUD和图鉴（因为疯狂模式会影响怪物属性）
    this.syncHud()
  }

  /**
   * 获取疯狂模式状态
   */
  getCrazyMode(): boolean {
    return this.crazyMode
  }

  update() {
    const dtSec = this.game.loop.delta / 1000
    if (this.pausedForLevelUp) return

    this.stepPlayer(dtSec)
    this.stepCombat(dtSec)
    this.stepSkills(dtSec)
  }

  private stepPlayer(dtSec: number) {
    this.player.update(dtSec)
    this.drawRangeArc()

    // 检查手动目标是否仍然有效（存活且在射程内）
    if (this.manualTarget) {
      if (this.manualTarget.hp <= 0 || !this.manualTarget.isAlive()) {
        this.manualTarget = null
      } else {
        const dx = this.manualTarget.x - this.player.x
        const dy = this.manualTarget.y - this.player.y
        const d = Math.hypot(dx, dy)
        if (d > this.player.range || !this.isAngleAllowed(Math.atan2(dy, dx))) {
          this.manualTarget = null  // 目标超出射程或角度，清除手动目标
        }
      }
    }

    // auto fire：优先使用手动目标，否则自动选择
    if (!this.player.canFire()) {
      this.updateTargetIndicator()
      return
    }
    
    const target = this.manualTarget || this.pickNearestZombieInArc()
    if (!target) {
      this.updateTargetIndicator()
      return // 不空弹：无有效目标则不射击且不进入冷却
    }
    
    this.player.consumeFire()
    this.fireBullets(target.x, target.y)
    this.updateTargetIndicator()
  }

  /**
   * 预测性瞄准：计算子弹到达目标所需时间，预测敌人未来位置
   * @param targetX 目标当前X坐标
   * @param targetY 目标当前Y坐标
   * @param targetVx 目标X方向速度（像素/秒，通常为0，僵尸只向下移动）
   * @param targetVy 目标Y方向速度（像素/秒，僵尸向下移动）
   * @param bulletSpeed 子弹速度（像素/秒）
   * @returns 预测的目标位置 {x, y}
   */
  private predictTargetPosition(targetX: number, targetY: number, targetVx: number, targetVy: number, bulletSpeed: number): { x: number; y: number } {
    // 计算到目标的初始距离
    const dx = targetX - this.player.x
    const dy = targetY - this.player.y
    const initialDist = Math.hypot(dx, dy)
    
    // 如果距离很近，不需要预测
    if (initialDist < 20) {
      return { x: targetX, y: targetY }
    }
    
    // 如果目标不移动，直接返回当前位置
    if (Math.abs(targetVx) < 0.1 && Math.abs(targetVy) < 0.1) {
      return { x: targetX, y: targetY }
    }
    
    // 计算子弹到达目标所需时间（考虑目标移动）
    // 使用迭代法求解：预测目标在子弹飞行时间内的位置
    let predictedX = targetX
    let predictedY = targetY
    let timeToHit = initialDist / bulletSpeed
    
    // 迭代几次以提高精度
    for (let iter = 0; iter < 4; iter++) {
      // 预测目标在 timeToHit 后的位置
      predictedX = targetX + targetVx * timeToHit
      predictedY = targetY + targetVy * timeToHit
      
      // 重新计算距离和时间
      const newDx = predictedX - this.player.x
      const newDy = predictedY - this.player.y
      const newDist = Math.hypot(newDx, newDy)
      timeToHit = newDist / bulletSpeed
    }
    
    return { x: predictedX, y: predictedY }
  }

  private fireBullets(targetX: number, targetY: number) {
    // 获取目标敌人（用于预测移动）
    const target = this.manualTarget || this.pickNearestZombieInArc()
    let predictedX = targetX
    let predictedY = targetY
    
    // 如果找到了目标敌人，进行预测性瞄准
    if (target) {
      // 检查僵尸是否已经停止移动（正在攻击）
      const isStopped = target.isAttacking()
      // 检查僵尸是否被冻结（无法移动）
      const isFrozen = this.timeAliveSec < target.getFrozenUntil()
      
      let targetVx = 0 // 僵尸通常不横向移动
      let targetVy = 0 // 默认不移动
      
      // 只有在未停止且未冻结时才预测移动
      if (!isStopped && !isFrozen) {
        // 计算敌人的实际移动速度
        // 僵尸向下移动：基础速度 + 击退效果（击退效果会逐渐衰减）
        // 注意：我们无法直接获取 extraVy，所以使用基础速度作为近似
        // 对于斜向移动的敌人，这已经足够准确
        targetVy = target.speed
      }
      
      // 预测目标位置
      const bulletSpeed = 260
      const predicted = this.predictTargetPosition(targetX, targetY, targetVx, targetVy, bulletSpeed)
      predictedX = predicted.x
      predictedY = predicted.y
    }
    
    const dx = predictedX - this.player.x
    const dy = predictedY - this.player.y
    const baseAng = Math.atan2(dy, dx)
    const speed = 260

    const count = this.skills.bulletCount
    const spread = this.skills.spreadRad

    if (count === 1) {
      const vx = Math.cos(baseAng) * speed
      const vy = Math.sin(baseAng) * speed
      this.bullets.push(
        new Bullet(this, { x: this.player.x, y: this.player.y - 8, vx, vy, damage: this.player.damage, maxDistance: this.player.range }),
      )
      return
    }

    for (let i = 0; i < count; i++) {
      const t = i / (count - 1)
      const ang = baseAng + (t - 0.5) * spread
      const vx = Math.cos(ang) * speed
      const vy = Math.sin(ang) * speed
      this.bullets.push(
        new Bullet(this, { x: this.player.x, y: this.player.y - 8, vx, vy, damage: this.player.damage, maxDistance: this.player.range }),
      )
    }
  }

  private stepCombat(dtSec: number) {
    if (this.defenseHp <= 0) return
    this.timeAliveSec += dtSec

    // 检查波次是否完成：本波僵尸已全部生成（不等待死亡）
    if (!this.waveCleared && 
        this.zombiesInWave >= this.getZombiesInWave() &&
        this.zombiesInWave > 0) {
      this.waveCleared = true
      
      // 如果完成20波且未开启无尽模式，显示选择界面
      if (this.currentWave >= this.maxWaves && !this.endlessMode) {
        this.showEndlessModeChoice()
        return
      }
      
      // 进入下一波（无尽模式或未到20波）
      this.currentWave++
      this.zombiesInWave = 0
      this.zombiesKilledInWave = 0
      this.waveCleared = false
      this.updateDifficulty() // 更新难度参数
      this.syncHud()
    }

    // 生成僵尸（基于波次）
    if (!this.waveCleared && this.zombiesInWave < this.getZombiesInWave()) {
      this.spawnTimer += dtSec
      while (this.spawnTimer >= this.spawnIntervalSec && this.zombiesInWave < this.getZombiesInWave()) {
        this.spawnTimer -= this.spawnIntervalSec
        this.spawnZombie()
        this.zombiesInWave++
      }
    }

    // update zombies + attack defense (melee/ranged)
    const aliveZ: Zombie[] = []
    for (const z of this.zombies) {
      z.update(dtSec, this.timeAliveSec, this.defenseLineY)

      // DOT: burning
      const burn = z.getBurnDamage(dtSec, this.timeAliveSec)
      if (burn > 0) z.takeDamage(burn)

      if (z.hp <= 0) {
        z.destroy()
        this.gainExp(this.expForZombie(z.kind))
        this.zombiesKilledInWave++
        continue
      }
      if (z.isAttacking() && z.tryAttack(dtSec)) {
        if (z.attackMode === 'melee') {
          this.applyDefenseDamage(z.attackDamage)
        } else {
          // ranged: shoot at defense line
          const shot = new EnemyShot(this, {
            x: z.x,
            y: z.y + 10,
            vy: z.shotSpeed,
            damage: z.attackDamage,
          })
          this.enemyShots.push(shot)
        }
      }
      aliveZ.push(z)
    }
    this.zombies = aliveZ

    // bullets move + hit
    for (const b of this.bullets) b.update(dtSec)
    const keepB: Bullet[] = []
    for (const b of this.bullets) {
      if (b.isOutOfRange()) {
        b.destroy()
        continue
      }
      
      // 连续碰撞检测：检查子弹移动路径是否与僵尸碰撞
      // 僵尸大小：12x12像素（半径约6像素），子弹大小：3x3像素（半径约1.5像素）
      // 碰撞判定范围：僵尸半径 + 子弹半径 + 容差 = 6 + 1.5 + 2 = 9.5，取10
      const hitRadius = 10
      let hit: Zombie | null = null
      
      for (const z of this.zombies) {
        if (z.hp <= 0 || !z.isAlive()) continue
        
        // 方法1：检查当前帧位置（快速检测）
        const d = Math.hypot(z.x - b.x, z.y - b.y)
        if (d <= hitRadius) {
          hit = z
          break
        }
        
        // 方法2：连续碰撞检测（检查子弹移动路径）
        // 如果子弹速度很快，可能在单帧内穿透僵尸，需要检查路径
        const prev = b.prevPosition
        const dist = Math.hypot(b.x - prev.x, b.y - prev.y)
        if (dist > 0.1) {  // 只有移动距离足够大时才进行路径检测
          // 计算点到线段的最近距离
          const pointToLineDist = this.pointToLineSegmentDistance(
            z.x, z.y,
            prev.x, prev.y,
            b.x, b.y
          )
          if (pointToLineDist <= hitRadius) {
            hit = z
            break
          }
        }
      }
      
      if (hit) {
        hit.takeDamage(b.damage * hit.getDamageTakenMult(this.timeAliveSec))
        b.destroy()
        continue
      }
      
      if (b.x < -30 || b.x > this.scale.width + 30 || b.y < -40 || b.y > this.scale.height + 40) {
        b.destroy()
        continue
      }
      keepB.push(b)
    }
    this.bullets = keepB

    // enemy shots -> hit defense line
    for (const s of this.enemyShots) s.update(dtSec)
    const keepS: EnemyShot[] = []
    for (const s of this.enemyShots) {
      if (s.y >= this.defenseLineY) {
        this.applyDefenseDamage(s.damage)
        s.destroy()
        continue
      }
      if (s.y > this.scale.height + 60) {
        s.destroy()
        continue
      }
      keepS.push(s)
    }
    this.enemyShots = keepS

    // tornados
    for (const t of this.tornados) {
      t.update(dtSec)
      t.applyDamage(dtSec, this.zombies)
    }
    const keepT: Tornado[] = []
    for (const t of this.tornados) {
      if (t.isDone() || t.y < -50) {
        t.destroy()
        continue
      }
      keepT.push(t)
    }
    this.tornados = keepT

    // === skill effects update ===
    this.stepExplosions(dtSec)
    this.stepBurnZones(dtSec)
    this.stepBeams(dtSec)
    this.stepCars(dtSec)
    this.stepVortexes(dtSec)
    this.stepPendingBombs(dtSec)
    this.stepIceFogs(dtSec)
    this.stepEmpWaves(dtSec)
    this.stepChainFx(dtSec)

    if (this.defenseHp <= 0) this.showGameOver()
  }

  /**
   * 更新难度参数（生成间隔等）
   */
  private updateDifficulty() {
    // 难度增长：基于波次，平缓增长
    if (this.endlessMode) {
      // 无尽模式：生成间隔继续减少，但设置下限（0.3秒）
      // 20波后继续增长：0.4 -> 0.3（30波后）
      const extraWaves = Math.max(0, this.currentWave - this.maxWaves)
      const baseInterval = Math.max(0.3, 0.4 - extraWaves * 0.01)
      this.spawnIntervalSec = this.crazyMode ? baseInterval * 0.5 : baseInterval
    } else {
      // 正常模式：每波生成间隔：从0.9秒逐渐减少到0.4秒（20波）
      const waveProgress = (this.currentWave - 1) / (this.maxWaves - 1)
      let baseInterval = 0.9 - waveProgress * 0.5 // 0.9 -> 0.4
      // 疯狂模式：生成频率加倍（间隔减半）
      this.spawnIntervalSec = this.crazyMode ? baseInterval * 0.5 : baseInterval
    }
  }

  private stepSkills(dtSec: number) {
    // 按解锁的主技能逐个走 cooldown
    const mains: MainSkillId[] = [
      'aurora',
      'tornado',
      'thermobaric',
      'napalm',
      'ice_pierce',
      'high_energy_ray',
      'guided_laser',
      'armored_car',
      'mini_vortex',
      'air_blast',
      'carpet_bomb',
      'ice_storm',
      'emp_pierce',
      'chain_electron',
    ]

    for (const id of mains) {
      const lv = this.skills.getLevel(id)
      if (lv <= 0) continue

      const next = (this.cds.get(id) ?? 0) - dtSec
      if (next > 0) {
        this.cds.set(id, next)
        continue
      }

      // cast
      this.castMainSkill(id, lv)
      const baseCd = this.baseCooldown(id, lv)
      const cd = baseCd * this.skills.getCooldownMult(id)
      this.cds.set(id, cd)
    }

    // 难度增长：基于波次，平缓增长
    // 每波生成间隔：从0.9秒逐渐减少到0.4秒（20波）
    const waveProgress = (this.currentWave - 1) / (this.maxWaves - 1)
    let baseInterval = 0.9 - waveProgress * 0.5 // 0.9 -> 0.4
    // 疯狂模式：生成频率加倍（间隔减半）
    this.spawnIntervalSec = this.crazyMode ? baseInterval * 0.5 : baseInterval
  }

  private baseCooldown(id: MainSkillId, lv: number) {
    switch (id) {
      case 'aurora':
        return Math.max(1.2, 4.2 - lv * 0.35)
      case 'tornado':
        return Math.max(2.0, 6.0 - lv * 0.4)
      case 'thermobaric':
        return Math.max(3.5, 7.5 - lv * 0.35)
      case 'napalm':
        return Math.max(4.0, 8.2 - lv * 0.35)
      case 'ice_pierce':
        return Math.max(2.8, 5.6 - lv * 0.25)
      case 'high_energy_ray':
        return Math.max(4.5, 8.8 - lv * 0.35)
      case 'guided_laser':
        return Math.max(3.2, 6.8 - lv * 0.28)
      case 'armored_car':
        return Math.max(6.0, 10.5 - lv * 0.4)
      case 'mini_vortex':
        return Math.max(5.5, 9.5 - lv * 0.35)
      case 'air_blast':
        return Math.max(2.2, 5.2 - lv * 0.25)
      case 'carpet_bomb':
        return Math.max(7.0, 12.5 - lv * 0.45)
      case 'ice_storm':
        return Math.max(6.0, 11.5 - lv * 0.4)
      case 'emp_pierce':
        return Math.max(5.0, 9.5 - lv * 0.35)
      case 'chain_electron':
        return Math.max(2.8, 6.2 - lv * 0.28)
      default:
        return 6
    }
  }

  private castMainSkill(id: MainSkillId, lv: number) {
    switch (id) {
      case 'aurora':
        this.castAurora(lv)
        return
      case 'tornado':
        this.castTornado(lv)
        return
      case 'thermobaric':
        this.castThermobaric(lv)
        return
      case 'napalm':
        this.castNapalm(lv)
        return
      case 'ice_pierce':
        this.castIcePierce(lv)
        return
      case 'high_energy_ray':
        this.castHighEnergyRay(lv)
        return
      case 'guided_laser':
        this.castGuidedLaser(lv)
        return
      case 'armored_car':
        this.castArmoredCar(lv)
        return
      case 'mini_vortex':
        this.castMiniVortex(lv)
        return
      case 'air_blast':
        this.castAirBlast(lv)
        return
      case 'carpet_bomb':
        this.castCarpetBomb(lv)
        return
      case 'ice_storm':
        this.castIceStorm(lv)
        return
      case 'emp_pierce':
        this.castEmpPierce(lv)
        return
      case 'chain_electron':
        this.castChainElectron(lv)
        return
    }
  }

  // ===== skill implementations (minimal but visible) =====

  /**
   * 极光：周期性召唤垂直光束，灼烧光束范围内的敌人
   * 特效：垂直光束 + 光晕效果 + 灼烧粒子
   */
  private castAurora(lv: number) {
    // 优先攻击最近的敌人位置
    const target = this.pickNearestZombie()
    if (!target) return // 无敌人时不释放
    
    const x = target.x // 以最近敌人的X坐标为中心
    const beamW = (14 + lv * 4) * this.skills.getRadiusMult('aurora')
    const dmg = (8 + lv * 3.2) * this.skills.getDamageMult('aurora')

    // 伤害判定
    for (const z of this.zombies) {
      if (z.y > this.defenseLineY) continue
      if (Math.abs(z.x - x) <= beamW) z.takeDamage(dmg * z.getDamageTakenMult(this.timeAliveSec))
    }

    // 多层光束特效
    const g = this.add.graphics()
    // 外层光晕（淡蓝色，大范围）
    g.fillStyle(0x6bffea, 0.15)
    g.fillRect(x - beamW * 1.2, 0, beamW * 2.4, this.defenseLineY)
    // 核心光束（亮蓝色，高亮度）
    g.fillStyle(0x6bffea, 0.35)
    g.fillRect(x - beamW, 0, beamW * 2, this.defenseLineY)
    // 中心高亮（白色）
    g.fillStyle(0xffffff, 0.5)
    g.fillRect(x - beamW * 0.3, 0, beamW * 0.6, this.defenseLineY)
    // 边缘光晕
    g.lineStyle(3, 0x6bffea, 0.7)
    g.strokeRect(x - beamW, 0, beamW * 2, this.defenseLineY)
    
    // 灼烧粒子效果（沿光束生成）
    this.spawnAuroraParticles(x, beamW, this.defenseLineY, 6 + lv * 2)
    
    this.tweens.add({ targets: g, alpha: 0, duration: 300, onComplete: () => g.destroy() })
  }

  private castTornado(lv: number) {
    const r = (18 + lv * 4) * this.skills.getRadiusMult('tornado')
    const d = (2.6 + lv * 0.4) * this.skills.getDurationMult('tornado')
    const dps = (3 + lv * 1.2) * this.skills.getDamageMult('tornado')
    const count = 1 + this.skills.getCountBonus('tornado')

    for (let i = 0; i < count; i++) {
      const x = Phaser.Math.Clamp(this.player.x + (i - (count - 1) / 2) * 26, 20, this.scale.width - 20)
      const t = new Tornado(this, { x, y: this.defenseLineY - 6, vy: -55 - lv * 10, radius: r, durationSec: d, dps })
      this.tornados.push(t)
    }
  }

  /**
   * 温压弹：高爆发火炮，大范围爆炸伤害
   * 特效：多层爆炸冲击波 + 火焰粒子 + 震动效果
   */
  private castThermobaric(lv: number) {
    // 优先攻击最近的敌人
    const target = this.pickNearestZombie()
    if (!target) return // 无敌人时不释放
    
    const count = 1 + this.skills.getCountBonus('thermobaric')
    const r = 60 * this.skills.getRadiusMult('thermobaric') + lv * 6
    const dmg = (40 + lv * 12) * this.skills.getDamageMult('thermobaric')

    // 根据数量词条释放多次
    for (let i = 0; i < count; i++) {
      // 每次释放选择最近的敌人（可能不同）
      const currentTarget = this.pickNearestZombie()
      if (!currentTarget) break
      
      const x = currentTarget.x
      const y = currentTarget.y
      
      // 如果有多个，稍微偏移位置
      if (count > 1 && i > 0) {
        const offsetX = (Math.random() - 0.5) * 40
        const offsetY = (Math.random() - 0.5) * 40
        const newX = Phaser.Math.Clamp(x + offsetX, 30, this.scale.width - 30)
        const newY = Phaser.Math.Clamp(y + offsetY, 50, this.defenseLineY - 50)
        
        // 伤害计算
        for (const z of this.zombies) {
          const d = Math.hypot(z.x - newX, z.y - newY)
          if (d <= r) z.takeDamage(dmg * z.getDamageTakenMult(this.timeAliveSec))
        }
        
        // 延迟释放特效
        this.time.delayedCall(i * 150, () => {
          this.spawnThermobaricExplosion(newX, newY, r)
        })
      } else {
        // 第一次立即释放
        // 伤害计算
        for (const z of this.zombies) {
          const d = Math.hypot(z.x - x, z.y - y)
          if (d <= r) z.takeDamage(dmg * z.getDamageTakenMult(this.timeAliveSec))
        }
        
        this.spawnThermobaricExplosion(x, y, r)
      }
    }
  }

  /**
   * 生成温压弹爆炸特效
   */
  private spawnThermobaricExplosion(x: number, y: number, r: number) {
    const innerR = r * 0.4
    const outerR = r
    
    // 核心爆炸（橙红色，高亮度）
    const coreGfx = this.add.graphics()
    coreGfx.fillStyle(0xff4500, 0.4)
    coreGfx.fillCircle(x, y, innerR)
    coreGfx.lineStyle(3, 0xff6b00, 0.9)
    coreGfx.strokeCircle(x, y, innerR)
    this.tweens.add({
      targets: coreGfx,
      alpha: 0,
      duration: 200,
      onComplete: () => coreGfx.destroy(),
    })

    // 冲击波（向外扩散）
    const shockGfx = this.add.graphics()
    shockGfx.lineStyle(4, 0xff6b6b, 0.8)
    shockGfx.strokeCircle(x, y, innerR)
    this.tweens.add({
      targets: shockGfx,
      scaleX: outerR / innerR,
      scaleY: outerR / innerR,
      alpha: 0,
      duration: 300,
      onComplete: () => shockGfx.destroy(),
    })

    // 火焰粒子效果（使用简单粒子模拟）
    this.spawnFireParticles(x, y, r, 15)
    
    // 基础爆炸标记
    this.spawnExplosion(x, y, r, 0xff6b6b)
  }

  /**
   * 燃油弹：地面持续燃烧区域，百分比扣血 + 点燃效果
   * 特效：火焰燃烧区域 + 持续火焰粒子 + 烟雾效果
   */
  /**
   * 燃油弹：地面持续燃烧区域，百分比扣血 + 点燃效果
   * 特效：火焰燃烧区域 + 持续火焰粒子 + 烟雾效果
   */
  private castNapalm(lv: number) {
    // 优先攻击最近的敌人位置
    const target = this.pickNearestZombie()
    if (!target) return // 无敌人时不释放
    
    const x = target.x
    const y = target.y
    const r = 55 * this.skills.getRadiusMult('napalm') + lv * 4
    const ttl = (4.0 + lv * 0.5) * this.skills.getDurationMult('napalm')
    // 提高百分比伤害：从每秒5%增加到每秒8%（随等级增加）
    const pct = (0.05 + lv * 0.008) * this.skills.getDamageMult('napalm')
    
    // 初始爆炸伤害：对范围内的敌人造成直接伤害
    const initialDmg = (30 + lv * 10) * this.skills.getDamageMult('napalm')
    for (const z of this.zombies) {
      const d = Math.hypot(z.x - x, z.y - y)
      if (d <= r) {
        z.takeDamage(initialDmg * z.getDamageTakenMult(this.timeAliveSec))
        // 立即应用燃烧效果
        z.applyBurn(this.timeAliveSec, 2.0, pct)
      }
    }
    
    // 创建燃烧区域图形（多层火焰效果）
    const g = this.add.graphics()
    // 外层火焰（橙红色）
    g.fillStyle(0xff4500, 0.15)
    g.fillCircle(x, y, r)
    // 内层火焰（亮黄色）
    g.fillStyle(0xffe66b, 0.20)
    g.fillCircle(x, y, r * 0.7)
    // 边框（火焰边缘）
    g.lineStyle(2, 0xff6b00, 0.5)
    g.strokeCircle(x, y, r)
    
    this.burnZones.push({ x, y, r, ttl, pctPerSec: pct, gfx: g })
    
    // 初始爆炸特效
    this.spawnExplosion(x, y, r * 0.6, 0xff6b00)
    this.spawnFireParticles(x, y, r, 12 + lv * 2)
    
    // 持续生成火焰粒子（在燃烧期间）
    this.startBurnParticles(x, y, r, ttl)
  }

  /**
   * 干冰弹：穿透冰弹，对沿途敌人造成伤害并概率冻结
   * 特效：冰弹轨迹 + 冰晶粒子 + 冻结效果
   */
  private castIcePierce(lv: number) {
    const count = 1 + this.skills.getCountBonus('ice_pierce')
    const width = (10 + lv * 2) * this.skills.getRadiusMult('ice_pierce')
    const dmg = (18 + lv * 6) * this.skills.getDamageMult('ice_pierce')
    const freezeChance = Math.min(0.6, 0.18 + lv * 0.04)
    const freezeSec = (1.2 + lv * 0.12) * this.skills.getDurationMult('ice_pierce')
    const baseX = this.player.x
    const y1 = 0
    const y2 = this.player.y

    // 根据数量词条释放多次
    for (let i = 0; i < count; i++) {
      // 每次释放稍微偏移X位置
      const offsetX = count > 1 ? (i - (count - 1) / 2) * 20 : 0
      const x = Phaser.Math.Clamp(baseX + offsetX, width, this.scale.width - width)

      // 伤害和冻结判定
      const hit = new Set<number>()
      for (const z of this.zombies) {
        if (hit.has(z.id)) continue
        if (Math.abs(z.x - x) <= width && z.y >= y1 && z.y <= y2) {
          hit.add(z.id)
          z.takeDamage(dmg * z.getDamageTakenMult(this.timeAliveSec))
          if (Math.random() < freezeChance) {
            z.applyFreeze(this.timeAliveSec, freezeSec)
            // 冻结特效：在敌人周围显示冰晶
            this.spawnFreezeEffect(z.x, z.y)
          }
        }
      }

      // 延迟释放特效
      const delay = i * 100
      this.time.delayedCall(delay, () => {
        // 冰弹轨迹特效：从玩家位置向上发射的冰蓝色光束
        const g = this.add.graphics()
        // 核心光束（亮蓝色）
        g.fillStyle(0x6bffea, 0.25)
        g.fillRect(x - width * 0.5, 0, width, this.player.y)
        // 边缘光晕（淡蓝色）
        g.lineStyle(3, 0x6bffea, 0.6)
        g.lineBetween(x - width, 0, x - width, this.player.y)
        g.lineBetween(x + width, 0, x + width, this.player.y)
        // 中心高亮线
        g.lineStyle(2, 0xffffff, 0.8)
        g.lineBetween(x, 0, x, this.player.y)
        
        // 冰晶粒子效果（沿轨迹生成）
        this.spawnIceParticles(x, width, this.player.y, 8 + lv * 2)
        
        this.tweens.add({ targets: g, alpha: 0, duration: 250, onComplete: () => g.destroy() })
      })
    }
  }

  /**
   * 高能射线：锁定最近目标，持续穿透射线造成高频伤害
   * 特效：能量光束 + 粒子流 + 目标锁定指示
   */
  private castHighEnergyRay(lv: number) {
    // 优先攻击最近的敌人（不限制射程和角度）
    const target = this.pickNearestZombie()
    if (!target) return
    const w = (8 + lv * 1.2) * this.skills.getRadiusMult('high_energy_ray')
    const ttl = (1.0 + lv * 0.22) * this.skills.getDurationMult('high_energy_ray')
    const dps = (35 + lv * 10) * this.skills.getDamageMult('high_energy_ray')

    const g = this.add.graphics()
    this.beams.push({ fromX: this.player.x, fromY: this.player.y, toX: target.x, toY: target.y, w, ttl, dps, gfx: g })
    
    // 初始锁定特效：在目标上显示锁定标记
    this.spawnLockOnEffect(target.x, target.y)
  }

  /**
   * 制导激光：自动锁定并打击多个目标，适合处理分散残血怪
   * 特效：多条激光连接线 + 目标锁定标记 + 激光粒子
   */
  private castGuidedLaser(lv: number) {
    const count = 2 + this.skills.getCountBonus('guided_laser') + Math.floor(lv / 2)
    const dmg = (22 + lv * 7) * this.skills.getDamageMult('guided_laser')

    const targets = [...this.zombies]
      .filter((z) => z.hp > 0)
      .sort((a, b) => a.hp - b.hp)
      .slice(0, count)
    
    if (targets.length === 0) return // 无敌人时不释放

    const g = this.add.graphics()
    // 绘制激光连接线（亮黄色，带光晕效果）
    for (const z of targets) {
      z.takeDamage(dmg * z.getDamageTakenMult(this.timeAliveSec))
      
      // 外层光晕（较粗，半透明）
      g.lineStyle(4, 0xffe66b, 0.4)
      g.lineBetween(this.player.x, this.player.y, z.x, z.y)
      // 核心激光（较细，高亮度）
      g.lineStyle(2, 0xffff00, 0.9)
      g.lineBetween(this.player.x, this.player.y, z.x, z.y)
      
      // 目标点爆炸特效
      this.spawnLockOnEffect(z.x, z.y)
    }
    this.chainFx.push({ ttl: 0.18, gfx: g })
  }

  /**
   * 装甲车：召唤战车横冲直撞，强力击退并造成伤害
   * 特效：车辆轨迹 + 撞击火花 + 尘土飞扬
   */
  private castArmoredCar(lv: number) {
    // 优先攻击最近的敌人（用于确定Y坐标）
    const target = this.pickNearestZombie()
    if (!target) return // 无敌人时不释放
    
    const count = 1 + this.skills.getCountBonus('armored_car')
    const dmg = (28 + lv * 8) * this.skills.getDamageMult('armored_car')
    const kb = 120 + lv * 18
    // 车辆在最近敌人的Y坐标附近行驶
    const baseY = Phaser.Math.Clamp(target.y, 120, this.defenseLineY - 40)
    const w = 46
    const h = 18
    const ttl = 1.8 * this.skills.getDurationMult('armored_car')
    
    // 根据数量词条释放多次
    for (let i = 0; i < count; i++) {
      // 每次释放稍微偏移Y位置
      const offsetY = count > 1 ? (i - (count - 1) / 2) * 30 : 0
      const y = Phaser.Math.Clamp(baseY + offsetY, 120, this.defenseLineY - 40)
      
      // 随机选择方向：从左到右或从右到左（横穿屏幕）
      const dir = Math.random() < 0.5 ? 1 : -1
      const startX = dir > 0 ? -30 : this.scale.width + 30
      const vx = dir > 0 ? 260 : -260
      const gfx = this.add.graphics()
      
      // 延迟释放，避免重叠
      const delay = i * 200
      this.time.delayedCall(delay, () => {
        this.cars.push({ x: startX, y, vx, w, h, ttl, dmg, kb, hit: new Set<number>(), gfx })
        // 车辆出现特效：尘土和烟雾
        this.spawnDustEffect(startX, y, dir)
      })
    }
  }

  /**
   * 旋风加农：生成小型旋风牵引敌人并持续切割伤害
   * 特效：旋转粒子 + 牵引效果 + 切割光效
   */
  private castMiniVortex(lv: number) {
    // 优先攻击最近的敌人位置
    const target = this.pickNearestZombie()
    if (!target) return // 无敌人时不释放
    
    const count = 1 + this.skills.getCountBonus('mini_vortex')
    const baseX = target.x
    const baseY = target.y
    const r = (80 + lv * 6) * this.skills.getRadiusMult('mini_vortex')
    const ttl = (3.6 + lv * 0.25) * this.skills.getDurationMult('mini_vortex')
    const dps = (12 + lv * 4) * this.skills.getDamageMult('mini_vortex')
    const pull = 60 + lv * 8
    
    // 根据数量词条释放多次
    for (let i = 0; i < count; i++) {
      // 每次释放稍微偏移位置
      const offsetX = count > 1 ? (i - (count - 1) / 2) * 50 : 0
      const offsetY = count > 1 ? (Math.random() - 0.5) * 40 : 0
      const x = Phaser.Math.Clamp(baseX + offsetX, r, this.scale.width - r)
      const y = Phaser.Math.Clamp(baseY + offsetY, r, this.defenseLineY - r)
      
      const gfx = this.add.graphics()
      this.vortexes.push({ x, y, r, ttl, dps, pull, gfx })
      
      // 旋风出现特效：旋转粒子
      this.spawnVortexParticles(x, y, r, ttl)
    }
  }

  /**
   * 压缩气弹：气压爆破击退靠近的敌人，近身防御技能
   * 特效：冲击波扩散 + 气浪效果 + 击退粒子
   */
  private castAirBlast(lv: number) {
    const count = 1 + this.skills.getCountBonus('air_blast')
    const r = (90 + lv * 6) * this.skills.getRadiusMult('air_blast')
    const dmg = (15 + lv * 5) * this.skills.getDamageMult('air_blast')
    const kb = 150 + lv * 25
    const baseX = this.player.x
    const baseY = this.defenseLineY - 40
    
    // 根据数量词条释放多次
    for (let i = 0; i < count; i++) {
      // 每次释放稍微偏移位置
      const offsetX = count > 1 ? (i - (count - 1) / 2) * 30 : 0
      const x = Phaser.Math.Clamp(baseX + offsetX, r, this.scale.width - r)
      const y = baseY
      
      // 延迟释放，避免重叠
      const delay = i * 150
      this.time.delayedCall(delay, () => {
        // 伤害和击退
        for (const z of this.zombies) {
          const d = Math.hypot(z.x - x, z.y - y)
          if (d <= r) {
            z.takeDamage(dmg * z.getDamageTakenMult(this.timeAliveSec))
            z.knockUp(kb)
            // 击退特效：在敌人位置生成冲击粒子
            this.spawnKnockbackEffect(z.x, z.y, x, y)
          }
        }
        
        // 多层冲击波特效
        this.spawnShockwave(x, y, r)
      })
    }
  }

  /**
   * 空投轰炸：对区域进行地毯式轰炸，瞬间清场能力强
   * 特效：轰炸标记 + 连续爆炸序列 + 烟雾效果
   */
  private castCarpetBomb(lv: number) {
    // 优先攻击最近的敌人
    const target = this.pickNearestZombie()
    if (!target) return // 无敌人时不释放
    
    const count = 4 + this.skills.getCountBonus('carpet_bomb') + Math.floor(lv / 2)
    const r = (55 + lv * 4) * this.skills.getRadiusMult('carpet_bomb')
    const dmg = (35 + lv * 10) * this.skills.getDamageMult('carpet_bomb')

    // 以最近敌人为中心，在其周围进行轰炸
    for (let i = 0; i < count; i++) {
      // 在目标周围随机分布，但确保在有效范围内
      const angle = (Math.PI * 2 / count) * i + Math.random() * 0.3
      const dist = 20 + Math.random() * 40
      const bombX = Phaser.Math.Clamp(target.x + Math.cos(angle) * dist, 24, this.scale.width - 24)
      const bombY = Phaser.Math.Clamp(target.y + Math.sin(angle) * dist, 90, this.defenseLineY - 90)
      const delay = i * 0.12
      
      this.pendingBombs.push({
        x: bombX,
        y: bombY,
        delay,
        r,
        dmg,
      })
      
      // 轰炸标记：显示即将轰炸的位置
      this.spawnBombMarker(bombX, bombY, r, delay)
    }
  }

  /**
   * 冰暴发生器：在防线前方制造大面积冰雾，长时间群体冻结
   * 特效：冰雾区域 + 持续冰晶粒子 + 冻结光效
   */
  private castIceStorm(lv: number) {
    const count = 1 + this.skills.getCountBonus('ice_storm')
    const baseX = this.player.x
    const baseY = this.defenseLineY - 160
    const r = (120 + lv * 8) * this.skills.getRadiusMult('ice_storm')
    const ttl = (4.0 + lv * 0.6) * this.skills.getDurationMult('ice_storm')
    const freezeSec = (0.6 + lv * 0.1) * this.skills.getDurationMult('ice_storm')
    
    // 根据数量词条释放多次
    for (let i = 0; i < count; i++) {
      // 每次释放稍微偏移位置
      const offsetX = count > 1 ? (i - (count - 1) / 2) * 60 : 0
      const offsetY = count > 1 ? (Math.random() - 0.5) * 40 : 0
      const x = Phaser.Math.Clamp(baseX + offsetX, r, this.scale.width - r)
      const y = Phaser.Math.Clamp(baseY + offsetY, r, this.defenseLineY - r)
      
      // 多层冰雾效果
      const g = this.add.graphics()
      // 外层冰雾（淡蓝色，大范围）
      g.fillStyle(0x6bffea, 0.12)
      g.fillCircle(x, y, r)
      // 内层冰雾（亮蓝色，高密度）
      g.fillStyle(0x9bffff, 0.18)
      g.fillCircle(x, y, r * 0.7)
      // 边缘光晕
      g.lineStyle(3, 0x6bffea, 0.4)
      g.strokeCircle(x, y, r)
      g.lineStyle(2, 0xffffff, 0.6)
      g.strokeCircle(x, y, r * 0.7)
      
      this.iceFogs.push({ x, y, r, ttl, freezeSec, gfx: g })
      
      // 持续生成冰晶粒子
      this.startIceFogParticles(x, y, r, ttl)
    }
  }

  /**
   * 电磁穿刺：电磁波贯穿战线，对敌人造成感电并提高其后续受伤
   * 特效：电磁波贯穿 + 电光闪烁 + 感电标记
   */
  private castEmpPierce(lv: number) {
    const y = Phaser.Math.Clamp(this.defenseLineY - 150, 80, this.defenseLineY - 80)
    const w = (18 + lv * 2) * this.skills.getRadiusMult('emp_pierce')
    const dmg = (20 + lv * 6) * this.skills.getDamageMult('emp_pierce')
    const shockMult = 1.2 + lv * 0.05
    const shockSec = (4.0 + lv * 0.2) * this.skills.getDurationMult('emp_pierce')
    const ttl = 0.22

    // 伤害和感电
    for (const z of this.zombies) {
      if (Math.abs(z.y - y) <= w) {
        z.takeDamage(dmg * z.getDamageTakenMult(this.timeAliveSec))
        z.applyShock(this.timeAliveSec, shockSec, shockMult)
        // 感电特效：在敌人身上显示电光
        this.spawnShockEffect(z.x, z.y)
      }
    }

    // 电磁波贯穿特效：多层电光波
    const g = this.add.graphics()
    // 外层电光（较粗，半透明）
    g.lineStyle(5, 0x9b6bff, 0.5)
    g.lineBetween(0, y, this.scale.width, y)
    // 核心电光（较细，高亮度）
    g.lineStyle(3, 0xffffff, 0.9)
    g.lineBetween(0, y, this.scale.width, y)
    // 电光闪烁点
    for (let i = 0; i < 8; i++) {
      const px = (this.scale.width / 8) * i
      g.fillStyle(0xffff00, 0.8)
      g.fillCircle(px, y, 3)
    }
    
    this.empWaves.push({ y, w, ttl, dmg, shockMult, shockSec, gfx: g })
  }

  /**
   * 跃迁电子：电流在目标间弹跳，适合清理大规模低血量群体
   * 特效：闪电链 + 跳跃电光 + 目标电击效果
   */
  private castChainElectron(lv: number) {
    // 优先攻击最近的敌人（不限制射程和角度）
    const start = this.pickNearestZombie()
    if (!start) return

    const jumps = 3 + this.skills.getCountBonus('chain_electron') + Math.floor(lv / 2)
    const jumpR = (90 + lv * 4) * this.skills.getRadiusMult('chain_electron')
    const dmg = (18 + lv * 5) * this.skills.getDamageMult('chain_electron')

    const hit = new Set<number>()
    const points: { x: number; y: number }[] = [{ x: start.x, y: start.y }]
    let cur: Zombie | null = start
    for (let i = 0; i < jumps && cur; i++) {
      hit.add(cur.id)
      cur.takeDamage(dmg * cur.getDamageTakenMult(this.timeAliveSec))
      // 电击特效：在每个目标上显示电击
      this.spawnShockEffect(cur.x, cur.y)
      cur = this.findNextChainTarget(cur, hit, jumpR)
      if (cur) points.push({ x: cur.x, y: cur.y })
    }

    // 闪电链特效：从玩家到所有目标的闪电连接（锯齿状闪电）
    const g = this.add.graphics()
    // 外层电光（较粗，半透明）
    g.lineStyle(5, 0x6bffea, 0.5)
    this.drawLightningPath(g, this.player.x, this.player.y, points)
    // 核心电光（较细，高亮度）
    g.lineStyle(3, 0xffffff, 0.9)
    this.drawLightningPath(g, this.player.x, this.player.y, points)
    this.chainFx.push({ ttl: 0.18, gfx: g })
  }

  private gainExp(amount: number) {
    this.exp += amount
    while (this.exp >= this.expNext) {
      this.exp -= this.expNext
      this.level += 1
      this.expNext = Math.floor(10 + this.level * 4)
      this.onLevelUp()
    }
    this.syncHud()
  }

  private onLevelUp() {
    this.pausedForLevelUp = true
    const choices = this.skillPool.pick3Distinct(this.skills)
    this.showSkillChoice(choices)
  }

  private showSkillChoice(choices: SkillChoice[]) {
    if (this.skillUi) this.skillUi.destroy(true)

    const overlay = this.add.container(0, 0)
    const bg = this.add.rectangle(0, 0, this.scale.width, this.scale.height, 0x000000, 0.55).setOrigin(0)
    overlay.add(bg)

    const title = this.add
      .text(this.scale.width / 2, 38, `升级！选择一个技能（LV ${this.level}）`, {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#e8f0ff',
      })
      .setOrigin(0.5)
    overlay.add(title)

    const cardW = 94
    const cardH = 64
    const gap = 10
    const startX = (this.scale.width - (cardW * 3 + gap * 2)) / 2
    const y = 70

    choices.forEach((c, i) => {
      const x = startX + i * (cardW + gap)
      const card = this.add.rectangle(x, y, cardW, cardH, 0x0c0f14, 0.9).setOrigin(0)
      card.setStrokeStyle(2, 0x2a3a58, 1)
      card.setInteractive({ useHandCursor: true })

      const name = this.add.text(x + 8, y + 8, c.name, {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: '#a9c1ff',
      })
      const desc = this.add.text(x + 8, y + 28, c.desc, {
        fontFamily: 'monospace',
        fontSize: '10px',
        color: '#e8f0ff',
        // 中文无空格场景下，启用 advanced wrap，确保多行换行
        wordWrap: { width: cardW - 16, useAdvancedWrap: true },
      })
      // 给描述一个固定区域，避免被渲染成单行或溢出卡片
      desc.setFixedSize(cardW - 16, cardH - 34)
      desc.setLineSpacing(2)

      card.on('pointerdown', () => {
        this.skills.levelUp(c.id)
        this.pausedForLevelUp = false
        overlay.destroy(true)
        this.skillUi = null
        this.updateSkillsBar() // 更新技能状态栏
        this.updatePlayerStats() // 更新人物属性
      })

      overlay.add([card, name, desc])
    })

    this.skillUi = overlay
  }

  /**
   * 选择距离指定位置最近的敌人作为手动目标
   * @param clickX 点击的X坐标
   * @param clickY 点击的Y坐标
   */
  private selectTargetAt(clickX: number, clickY: number) {
    let best: Zombie | null = null
    let bestD = Infinity
    
    // 找到距离点击位置最近的敌人（不限制射程和角度，只要点击就能选）
    for (const z of this.zombies) {
      if (z.hp <= 0 || !z.isAlive()) continue
      const d = Math.hypot(z.x - clickX, z.y - clickY)
      if (d < bestD) {
        bestD = d
        best = z
      }
    }
    
    // 如果找到了敌人，设置为手动目标
    if (best && bestD < 200) {  // 限制选择范围：距离点击位置200像素内
      this.manualTarget = best
    } else {
      this.manualTarget = null  // 点击位置没有敌人，清除手动目标
    }
  }

  /**
   * 自动选择射程内最近的敌人（用于自动攻击）
   */
  /**
   * 在射程和角度范围内选择最近的僵尸（用于玩家射击）
   */
  private pickNearestZombieInArc() {
    let best: Zombie | null = null
    let bestD = Infinity
    for (const z of this.zombies) {
      if (z.hp <= 0) continue
      const dx = z.x - this.player.x
      const dy = z.y - this.player.y
      const d = Math.hypot(dx, dy)
      if (d > this.player.range) continue
      if (!this.isAngleAllowed(Math.atan2(dy, dx))) continue
      if (d < bestD) {
        bestD = d
        best = z
      }
    }
    return best
  }

  /**
   * 选择最近的僵尸（不限制射程和角度，用于技能目标选择）
   * 确保技能不会空放
   */
  private pickNearestZombie(): Zombie | null {
    let best: Zombie | null = null
    let bestD = Infinity
    for (const z of this.zombies) {
      if (z.hp <= 0) continue
      const dx = z.x - this.player.x
      const dy = z.y - this.player.y
      const d = Math.hypot(dx, dy)
      if (d < bestD) {
        bestD = d
        best = z
      }
    }
    return best
  }

  /**
   * 更新目标指示器显示（在手动目标周围显示圆圈）
   */
  private updateTargetIndicator() {
    this.targetIndicatorGfx.clear()
    
    if (this.manualTarget && this.manualTarget.isAlive() && this.manualTarget.hp > 0) {
      const z = this.manualTarget
      // 检查是否在射程和角度范围内
      const dx = z.x - this.player.x
      const dy = z.y - this.player.y
      const d = Math.hypot(dx, dy)
      const inRange = d <= this.player.range && this.isAngleAllowed(Math.atan2(dy, dx))
      
      // 绘制目标指示器：有效目标用绿色，无效目标用红色
      const color = inRange ? 0x00ff00 : 0xff0000
      const alpha = inRange ? 0.6 : 0.4
      
      this.targetIndicatorGfx.lineStyle(2, color, alpha)
      this.targetIndicatorGfx.strokeCircle(z.x, z.y, 14)
      
      // 添加十字准星
      this.targetIndicatorGfx.lineStyle(1, color, alpha * 0.8)
      this.targetIndicatorGfx.lineBetween(z.x - 8, z.y, z.x + 8, z.y)
      this.targetIndicatorGfx.lineBetween(z.x, z.y - 8, z.x, z.y + 8)
    }
  }

  /**
   * 获取当前波次应该生成的僵尸总数
   */
  private getZombiesInWave(): number {
    // 基础数量 + 每波增加
    const base = this.zombiesPerWave
    const increase = Math.floor((this.currentWave - 1) * 0.5) // 每波增加0.5个（向下取整）
    return base + increase
  }

  private spawnZombie() {
    // 检查是否是boss波次（只在正常模式下的第10波和第20波）
    if (!this.endlessMode) {
      if (this.currentWave === 10 && this.zombiesInWave === 0) {
        // 第10波：生成boss
        this.spawnBoss('boss')
        return
      }
      if (this.currentWave === 20 && this.zombiesInWave === 0) {
        // 第20波：生成最终boss
        this.spawnBoss('final_boss')
        return
      }
    }

    const kind = this.pickZombieKind()
    const def = ZOMBIE_TYPES[kind]
    const x = Phaser.Math.Between(14, this.scale.width - 14)

    // 难度增长：每波按固定百分比提升，避免指数爆炸
    // HP增长：每波增加5%（线性增长，20波后约为2.0倍）
    // 公式：1.0 + (currentWave - 1) * 0.05
    // 第1波：1.0倍，第10波：1.45倍，第20波：1.95倍
    let hpScale = 1.0 + (this.currentWave - 1) * 0.05
    // 疯狂模式：怪物血量加倍
    if (this.crazyMode) hpScale *= 2
    
    // 速度增长：每波增加1.5%（线性增长，20波后约为1.29倍）
    // 公式：1.0 + (currentWave - 1) * 0.015
    // 第1波：1.0倍，第10波：1.135倍，第20波：1.285倍
    let speedScale = 1.0 + (this.currentWave - 1) * 0.015
    // 疯狂模式：怪物速度增加50%
    if (this.crazyMode) speedScale *= 1.5
    
    const hp = Math.floor(def.baseHp * hpScale)
    const speed = def.baseSpeed * speedScale

    this.zombies.push(
      new Zombie(this, {
        x,
        y: -16,
        hp,
        speed,
        kind: def.kind,
        color: def.color,
        attackMode: def.attackMode,
        attackDamage: def.attackDamage,
        attackIntervalSec: def.attackIntervalSec,
        rangedStopDistance: def.rangedStopDistance ?? 0,
        shotSpeed: def.shotSpeed ?? 140,
      }),
    )
  }

  /**
   * 生成Boss
   */
  private spawnBoss(bossType: 'boss' | 'final_boss') {
    const def = ZOMBIE_TYPES[bossType]
    const x = this.scale.width / 2 // Boss从中央出现
    
    // Boss的HP和速度基于波次
    const waveProgress = (this.currentWave - 1) / (this.maxWaves - 1)
    let hpScale = 1.0 // Boss不再额外增强，使用基础血量
    // 疯狂模式：Boss血量加倍
    if (this.crazyMode) hpScale *= 2
    
    let speedScale = 1 + waveProgress * 0.2
    // 疯狂模式：Boss速度增加50%
    if (this.crazyMode) speedScale *= 1.5
    
    const hp = Math.floor(def.baseHp * hpScale)
    const speed = def.baseSpeed * speedScale

    this.zombies.push(
      new Zombie(this, {
        x,
        y: -16,
        hp,
        speed,
        kind: def.kind,
        color: def.color,
        attackMode: def.attackMode,
        attackDamage: def.attackDamage,
        attackIntervalSec: def.attackIntervalSec,
        rangedStopDistance: def.rangedStopDistance ?? 0,
        shotSpeed: def.shotSpeed ?? 140,
      }),
    )
    
    // Boss也算作本波的一个僵尸
    this.zombiesInWave++
    
    // Boss出现提示
    this.showBossWarning(bossType === 'final_boss' ? '最终Boss' : 'Boss')
  }

  /**
   * 显示Boss警告
   */
  private showBossWarning(bossName: string) {
    const text = this.add
      .text(this.scale.width / 2, this.scale.height / 2, `${bossName} 出现！`, {
        fontFamily: 'monospace',
        fontSize: '24px',
        color: '#ff6b6b',
        stroke: '#000000',
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setAlpha(0)
    
    this.tweens.add({
      targets: text,
      alpha: 1,
      y: this.scale.height / 2 - 20,
      duration: 300,
      yoyo: true,
      repeat: 1,
      onComplete: () => {
        this.tweens.add({
          targets: text,
          alpha: 0,
          duration: 500,
          onComplete: () => text.destroy(),
        })
      },
    })
  }

  /**
   * 显示胜利画面
   */
  /**
   * 显示无尽模式选择界面
   */
  private showEndlessModeChoice() {
    this.pausedForLevelUp = true
    
    const container = this.add.container(this.scale.width / 2, this.scale.height / 2)
    
    // 背景遮罩
    const bg = this.add.rectangle(0, 0, this.scale.width, this.scale.height, 0x000000, 0.7)
    container.add(bg)
    
    // 标题
    const title = this.add.text(0, -80, '完成20波！', {
      fontFamily: 'monospace',
      fontSize: '28px',
      color: '#6bff95',
      stroke: '#000000',
      strokeThickness: 4,
    }).setOrigin(0.5)
    container.add(title)
    
    // 提示文字
    const hint = this.add.text(0, -30, '是否继续无尽模式？', {
      fontFamily: 'monospace',
      fontSize: '18px',
      color: '#e8f0ff',
      stroke: '#000000',
      strokeThickness: 2,
    }).setOrigin(0.5)
    container.add(hint)
    
    // 继续按钮
    const continueBtn = this.add.rectangle(-80, 40, 120, 40, 0x6bff95, 0.8)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => {
        this.endlessMode = true
        this.pausedForLevelUp = false
        container.destroy(true)
        // 进入下一波
        this.currentWave++
        this.zombiesInWave = 0
        this.zombiesKilledInWave = 0
        this.waveCleared = false
        this.updateDifficulty()
        this.syncHud()
      })
    const continueText = this.add.text(-80, 40, '继续', {
      fontFamily: 'monospace',
      fontSize: '16px',
      color: '#000000',
    }).setOrigin(0.5)
    container.add([continueBtn, continueText])
    
    // 结束按钮
    const endBtn = this.add.rectangle(80, 40, 120, 40, 0xff6b6b, 0.8)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => {
        this.showVictory()
        container.destroy(true)
      })
    const endText = this.add.text(80, 40, '结束', {
      fontFamily: 'monospace',
      fontSize: '16px',
      color: '#ffffff',
    }).setOrigin(0.5)
    container.add([endBtn, endText])
  }

  private showVictory() {
    this.pausedForLevelUp = true
    this.add
      .text(this.scale.width / 2, this.scale.height / 2, 'VICTORY!', {
        fontFamily: 'monospace',
        fontSize: '32px',
        color: '#6bff95',
        stroke: '#000000',
        strokeThickness: 4,
      })
      .setOrigin(0.5)
  }

  private showGameOver() {
    this.pausedForLevelUp = true
    this.add
      .text(this.scale.width / 2, this.scale.height / 2, 'GAME OVER', {
        fontFamily: 'monospace',
        fontSize: '26px',
        color: '#ff6b6b',
      })
      .setOrigin(0.5)
  }

  private applyDefenseDamage(amount: number) {
    this.defenseHp = Math.max(0, this.defenseHp - amount)
    this.syncHud()
  }

  /**
   * 生成爆炸特效（增强版：多层爆炸效果）
   */
  private spawnExplosion(x: number, y: number, r: number, color: number) {
    // 内层爆炸（核心，高亮度）
    const coreGfx = this.add.graphics()
    coreGfx.fillStyle(color, 0.3)
    coreGfx.fillCircle(x, y, r * 0.5)
    coreGfx.lineStyle(3, color, 0.9)
    coreGfx.strokeCircle(x, y, r * 0.5)
    this.explosions.push({ x, y, r: r * 0.5, ttl: 0.15, gfx: coreGfx })
    
    // 外层冲击波（扩散效果）
    const shockGfx = this.add.graphics()
    shockGfx.lineStyle(3, color, 0.7)
    shockGfx.strokeCircle(x, y, r * 0.6)
    this.tweens.add({
      targets: shockGfx,
      scaleX: r / (r * 0.6),
      scaleY: r / (r * 0.6),
      alpha: 0,
      duration: 250,
      onComplete: () => shockGfx.destroy(),
    })
    
    // 基础爆炸标记
    const g = this.add.graphics()
    g.fillStyle(color, 0.14)
    g.fillCircle(x, y, r)
    g.lineStyle(2, color, 0.55)
    g.strokeCircle(x, y, r)
    this.explosions.push({ x, y, r, ttl: 0.22, gfx: g })
  }

  private stepExplosions(dtSec: number) {
    const keep: typeof this.explosions = []
    for (const e of this.explosions) {
      e.ttl -= dtSec
      e.gfx.setAlpha(Math.max(0, e.ttl / 0.22))
      if (e.ttl <= 0) {
        e.gfx.destroy()
        continue
      }
      keep.push(e)
    }
    this.explosions = keep
  }

  private stepBurnZones(dtSec: number) {
    const keep: typeof this.burnZones = []
    for (const z of this.burnZones) {
      z.ttl -= dtSec
      // 对燃烧区域内的敌人持续应用燃烧效果
      // 燃烧持续时间应该和燃烧区域持续时间一致，确保持续伤害
      const burnDuration = Math.min(2.0, z.ttl + 0.5) // 至少2秒，或直到燃烧区域消失
      for (const e of this.zombies) {
        const d = Math.hypot(e.x - z.x, e.y - z.y)
        if (d <= z.r) {
          // 持续应用燃烧效果，确保敌人一直受到伤害
          e.applyBurn(this.timeAliveSec, burnDuration, z.pctPerSec)
        }
      }
      z.gfx.setAlpha(0.35 + 0.2 * Math.sin(this.timeAliveSec * 10))
      if (z.ttl <= 0) {
        z.gfx.destroy()
        continue
      }
      keep.push(z)
    }
    this.burnZones = keep
  }

  private stepBeams(dtSec: number) {
    const keep: typeof this.beams = []
    for (const b of this.beams) {
      b.ttl -= dtSec
      // re-aim to nearest current target point (keep it cheap)
      const t = this.pickNearestZombieInArc()
      if (t) {
        b.toX = t.x
        b.toY = t.y
      }
      // damage along segment (distance-to-line)
      for (const z of this.zombies) {
        const d = this.distPointToSegment(z.x, z.y, b.fromX, b.fromY, b.toX, b.toY)
        if (d <= b.w) z.takeDamage(b.dps * dtSec * z.getDamageTakenMult(this.timeAliveSec))
      }
      // 增强光束绘制：多层能量光束效果
      b.gfx.clear()
      const dx = b.toX - b.fromX
      const dy = b.toY - b.fromY
      const len = Math.hypot(dx, dy)
      if (len > 0) {
        // 外层光晕（较粗，半透明）
        b.gfx.lineStyle(6, 0xffe66b, 0.3)
        b.gfx.lineBetween(b.fromX, b.fromY, b.toX, b.toY)
        // 中层能量（中等粗细）
        b.gfx.lineStyle(4, 0xffff00, 0.6)
        b.gfx.lineBetween(b.fromX, b.fromY, b.toX, b.toY)
        // 核心光束（细，高亮度）
        b.gfx.lineStyle(2, 0xffffff, 0.9)
        b.gfx.lineBetween(b.fromX, b.fromY, b.toX, b.toY)
      }
      b.gfx.setAlpha(Math.max(0, b.ttl / 1.2))

      if (b.ttl <= 0) {
        b.gfx.destroy()
        continue
      }
      keep.push(b)
    }
    this.beams = keep
  }

  private stepCars(dtSec: number) {
    const keep: typeof this.cars = []
    for (const c of this.cars) {
      c.ttl -= dtSec
      c.x += c.vx * dtSec

      // hit
      for (const z of this.zombies) {
        if (c.hit.has(z.id)) continue
        if (Math.abs(z.y - c.y) > c.h) continue
        if (Math.abs(z.x - c.x) > c.w) continue
        c.hit.add(z.id)
        z.takeDamage(c.dmg * z.getDamageTakenMult(this.timeAliveSec))
        z.knockUp(c.kb)
      }

      // 增强车辆绘制：多层效果 + 轨迹
      c.gfx.clear()
      // 车辆阴影
      c.gfx.fillStyle(0x0c0f14, 0.3)
      c.gfx.fillRoundedRect(c.x - c.w + 2, c.y - c.h / 2 + 2, c.w * 2, c.h, 4)
      // 车辆主体
      c.gfx.fillStyle(0xa9c1ff, 0.9)
      c.gfx.fillRoundedRect(c.x - c.w, c.y - c.h / 2, c.w * 2, c.h, 4)
      // 车辆边框
      c.gfx.lineStyle(2, 0x0c0f14, 0.8)
      c.gfx.strokeRoundedRect(c.x - c.w, c.y - c.h / 2, c.w * 2, c.h, 4)
      // 车辆高光
      c.gfx.lineStyle(1, 0xffffff, 0.5)
      c.gfx.strokeRoundedRect(c.x - c.w + 1, c.y - c.h / 2 - 1, c.w * 2 - 2, c.h - 2, 3)
      
      // 撞击时生成火花
      if (c.hit.size > 0 && Math.random() < 0.3) {
        this.spawnFireParticles(c.x, c.y, 8, 3)
      }

      if (c.ttl <= 0 || c.x < -80 || c.x > this.scale.width + 80) {
        c.gfx.destroy()
        continue
      }
      keep.push(c)
    }
    this.cars = keep
  }

  private stepVortexes(dtSec: number) {
    const keep: typeof this.vortexes = []
    for (const v of this.vortexes) {
      v.ttl -= dtSec
      for (const z of this.zombies) {
        const dx = v.x - z.x
        const dy = v.y - z.y
        const d = Math.hypot(dx, dy)
        if (d > v.r || d <= 1) continue
        const pull = (v.pull * (1 - d / v.r)) * dtSec
        // direct position tweak for “牵引感”
        z.go.x += (dx / d) * pull
        z.go.y += (dy / d) * pull
        z.takeDamage(v.dps * dtSec * z.getDamageTakenMult(this.timeAliveSec))
      }
      // 增强旋风绘制：旋转效果 + 多层光晕
      v.gfx.clear()
      const rotation = this.timeAliveSec * 3 // 旋转角度
      // 外层光晕（大范围，半透明）
      v.gfx.fillStyle(0x9b6bff, 0.12)
      v.gfx.fillCircle(v.x, v.y, v.r)
      // 内层旋风（高密度）
      v.gfx.fillStyle(0x9b6bff, 0.20)
      v.gfx.fillCircle(v.x, v.y, v.r * 0.7)
      // 旋转线条（模拟旋风效果）
      for (let i = 0; i < 4; i++) {
        const angle = rotation + (Math.PI * 2 / 4) * i
        const startX = v.x + Math.cos(angle) * v.r * 0.3
        const startY = v.y + Math.sin(angle) * v.r * 0.3
        const endX = v.x + Math.cos(angle) * v.r
        const endY = v.y + Math.sin(angle) * v.r
        v.gfx.lineStyle(2, 0x9b6bff, 0.5)
        v.gfx.lineBetween(startX, startY, endX, endY)
      }
      // 边缘光晕
      v.gfx.lineStyle(3, 0x9b6bff, 0.45)
      v.gfx.strokeCircle(v.x, v.y, v.r)

      if (v.ttl <= 0) {
        v.gfx.destroy()
        continue
      }
      keep.push(v)
    }
    this.vortexes = keep
  }

  private stepPendingBombs(dtSec: number) {
    const keep: typeof this.pendingBombs = []
    for (const b of this.pendingBombs) {
      b.delay -= dtSec
      if (b.delay > 0) {
        keep.push(b)
        continue
      }
      // 伤害判定
      for (const z of this.zombies) {
        const d = Math.hypot(z.x - b.x, z.y - b.y)
        if (d <= b.r) z.takeDamage(b.dmg * z.getDamageTakenMult(this.timeAliveSec))
      }
      // 增强爆炸特效：多层爆炸 + 火焰粒子
      this.spawnExplosion(b.x, b.y, b.r, 0xff6b6b)
      this.spawnFireParticles(b.x, b.y, b.r, 12)
    }
    this.pendingBombs = keep
  }

  private stepIceFogs(dtSec: number) {
    const keep: typeof this.iceFogs = []
    for (const f of this.iceFogs) {
      f.ttl -= dtSec
      for (const z of this.zombies) {
        const d = Math.hypot(z.x - f.x, z.y - f.y)
        if (d <= f.r) z.applyFreeze(this.timeAliveSec, f.freezeSec)
      }
      f.gfx.setAlpha(0.35)
      if (f.ttl <= 0) {
        f.gfx.destroy()
        continue
      }
      keep.push(f)
    }
    this.iceFogs = keep
  }

  private stepEmpWaves(dtSec: number) {
    const keep: typeof this.empWaves = []
    for (const e of this.empWaves) {
      e.ttl -= dtSec
      e.gfx.setAlpha(Math.max(0, e.ttl / 0.22))
      if (e.ttl <= 0) {
        e.gfx.destroy()
        continue
      }
      keep.push(e)
    }
    this.empWaves = keep
  }

  private stepChainFx(dtSec: number) {
    const keep: typeof this.chainFx = []
    for (const c of this.chainFx) {
      c.ttl -= dtSec
      c.gfx.setAlpha(Math.max(0, c.ttl / 0.18))
      if (c.ttl <= 0) {
        c.gfx.destroy()
        continue
      }
      keep.push(c)
    }
    this.chainFx = keep
  }

  /**
   * 计算点到线段的最近距离（用于连续碰撞检测）
   * @param px 点X坐标
   * @param py 点Y坐标
   * @param x1 线段起点X
   * @param y1 线段起点Y
   * @param x2 线段终点X
   * @param y2 线段终点Y
   * @returns 点到线段的最近距离
   */
  private pointToLineSegmentDistance(px: number, py: number, x1: number, y1: number, x2: number, y2: number) {
    return this.distPointToSegment(px, py, x1, y1, x2, y2)
  }

  private distPointToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number) {
    const vx = x2 - x1
    const vy = y2 - y1
    const wx = px - x1
    const wy = py - y1
    const c1 = vx * wx + vy * wy
    if (c1 <= 0) return Math.hypot(px - x1, py - y1)
    const c2 = vx * vx + vy * vy
    if (c2 <= c1) return Math.hypot(px - x2, py - y2)
    const t = c1 / c2
    const bx = x1 + t * vx
    const by = y1 + t * vy
    return Math.hypot(px - bx, py - by)
  }

  private findNextChainTarget(cur: Zombie, hit: Set<number>, radius: number) {
    let best: Zombie | null = null
    let bestD = Infinity
    for (const z of this.zombies) {
      if (z.hp <= 0) continue
      if (hit.has(z.id)) continue
      const d = Math.hypot(z.x - cur.x, z.y - cur.y)
      if (d > radius) continue
      if (d < bestD) {
        bestD = d
        best = z
      }
    }
    return best
  }

  private pickZombieKind(): ZombieKind {
    // 基于波次选择僵尸类型，而不是时间
    // 早期波次主要是walker，逐渐增加brute和spitter
    const waveProgress = (this.currentWave - 1) / (this.maxWaves - 1)
    const wSpitter = Phaser.Math.Clamp(waveProgress * 0.4, 0, 0.38)
    const wBrute = Phaser.Math.Clamp(waveProgress * 0.3, 0, 0.28)
    const wWalker = Math.max(0.05, 1 - wSpitter - wBrute)

    const r = Math.random() * (wWalker + wBrute + wSpitter)
    if (r < wWalker) return 'walker'
    if (r < wWalker + wBrute) return 'brute'
    return 'spitter'
  }

  private expForZombie(kind: ZombieKind) {
    return ZOMBIE_TYPES[kind].exp
  }

  /** 80% 圆弧：保留 20% 盲区，盲区朝下（+π/2） */
  private isAngleAllowed(angleRad: number) {
    const blind = Math.PI * 2 * 0.2
    const blindCenter = Math.PI / 2 // down
    const diff = this.angleDiff(angleRad, blindCenter)
    return Math.abs(diff) > blind / 2
  }

  private angleDiff(a: number, b: number) {
    let d = a - b
    while (d > Math.PI) d -= Math.PI * 2
    while (d < -Math.PI) d += Math.PI * 2
    return d
  }

  private drawRangeArc() {
    // 圆弧虚线：可射击区域（80%圆周）
    const radius = this.player.range
    const cx = this.player.x
    const cy = this.player.y

    const blind =  Math.PI * 2 * 0.2
    const blindCenter = Math.PI / 2
    const start = blindCenter + blind / 2
    const end = blindCenter - blind / 2 + Math.PI * 2 // wrap

    this.rangeGfx.clear()
    this.rangeGfx.lineStyle(2, 0x2a3a58, 0.9)
    this.strokeDashedArc(this.rangeGfx, cx, cy, radius, start, end, 0.09, 0.06)
  }

  private strokeDashedArc(
    g: Phaser.GameObjects.Graphics,
    cx: number,
    cy: number,
    r: number,
    start: number,
    end: number,
    dashRad: number,
    gapRad: number,
  ) {
    let a = start
    while (a < end) {
      const a2 = Math.min(end, a + dashRad)
      const x1 = cx + Math.cos(a) * r
      const y1 = cy + Math.sin(a) * r
      const x2 = cx + Math.cos(a2) * r
      const y2 = cy + Math.sin(a2) * r
      g.lineBetween(x1, y1, x2, y2)
      a = a2 + gapRad
    }
  }

  private syncHud() {
    const setText = (id: string, value: string) => {
      const el = document.getElementById(id)
      if (el) el.textContent = value
    }

    setText('hud-hp', `${this.defenseHp}/${this.defenseHpMax}`)
    setText('hud-lv', String(this.level))
    setText('hud-exp', String(this.exp))
    setText('hud-exp-next', String(this.expNext))
    // 显示波次：无尽模式显示当前波次，正常模式显示当前/总波次
    if (this.endlessMode) {
      setText('hud-wave', `波次: ${this.currentWave} (无尽)`)
    } else {
      setText('hud-wave', `${this.currentWave}/${this.maxWaves}`)
    }
    
    // 更新人物属性（主武器信息）
    this.updatePlayerStats()
    
    // 更新怪物图鉴（显示当前波次下的实际属性）
    this.updateBestiary()
  }

  /**
   * 更新怪物图鉴（显示当前波次下的实际血量和速度）
   */
  private updateBestiary() {
    const bestiaryList = document.getElementById('bestiary-list')
    if (!bestiaryList) return

    // 计算当前波次下的倍率
    let hpScale = 1.0 + (this.currentWave - 1) * 0.05
    if (this.crazyMode) hpScale *= 2
    
    let speedScale = 1.0 + (this.currentWave - 1) * 0.015
    if (this.crazyMode) speedScale *= 1.5

    // 更新每个怪物图鉴项的属性
    const items = bestiaryList.querySelectorAll('.bestiary-item')
    items.forEach((item, index) => {
      const def = Object.values(ZOMBIE_TYPES)[index]
      if (!def) return

      // 计算实际属性
      const actualHp = Math.floor(def.baseHp * hpScale)
      const actualSpeed = Math.floor(def.baseSpeed * speedScale)

      // 更新生命值显示
      const hpStat = item.querySelector('.bestiary-item-stats .bestiary-item-stat:first-child')
      if (hpStat) {
        if (this.currentWave > 1 || this.crazyMode) {
          // 显示实际血量（如果与基础不同，显示基础→实际）
          if (actualHp !== def.baseHp) {
            hpStat.textContent = `生命: ${def.baseHp} → ${actualHp}`
          } else {
            hpStat.textContent = `生命: ${actualHp}`
          }
        } else {
          hpStat.textContent = `生命: ${def.baseHp}`
        }
      }

      // 更新速度显示
      const speedStat = item.querySelector('.bestiary-item-stats .bestiary-item-stat:nth-child(2)')
      if (speedStat) {
        if (this.currentWave > 1 || this.crazyMode) {
          // 显示实际速度（如果与基础不同，显示基础→实际）
          if (actualSpeed !== def.baseSpeed) {
            speedStat.textContent = `速度: ${def.baseSpeed} → ${actualSpeed} px/s`
          } else {
            speedStat.textContent = `速度: ${actualSpeed} px/s`
          }
        } else {
          speedStat.textContent = `速度: ${def.baseSpeed} px/s`
        }
      }
    })
  }

  /**
   * 更新人物属性显示（主武器增强信息）
   */
  private updatePlayerStats() {
    const bulletSpreadLevel = this.skills.getLevel('bullet_spread')
    const bulletCount = this.skills.bulletCount
    const spreadDeg = (this.skills.spreadRad * 180 / Math.PI).toFixed(0)
    
    const playerStatsEl = document.getElementById('player-stats')
    if (playerStatsEl) {
      if (bulletSpreadLevel > 0) {
        playerStatsEl.innerHTML = `
          <div class="player-stats-title">主武器</div>
          <div class="player-stats-item">子弹散射: Lv.${bulletSpreadLevel}</div>
          <div class="player-stats-item">子弹数: ${bulletCount}</div>
          <div class="player-stats-item">散射角: ${spreadDeg}°</div>
        `
        playerStatsEl.style.display = 'block'
      } else {
        playerStatsEl.style.display = 'none'
      }
    }
  }

  /**
   * 获取技能的当前属性信息
   */
  private getSkillStats(skillId: MainSkillId, level: number): string {
    const stats: string[] = []
    const lv = level

    switch (skillId) {
      case 'aurora': {
        const dmg = (8 + lv * 3.2) * this.skills.getDamageMult('aurora')
        const cd = this.baseCooldown('aurora', lv) * this.skills.getCooldownMult('aurora')
        const radius = (14 + lv * 4) * this.skills.getRadiusMult('aurora')
        stats.push(`伤害: ${dmg.toFixed(0)}`, `冷却: ${cd.toFixed(1)}s`, `宽度: ${radius.toFixed(0)}`)
        break
      }
      case 'tornado': {
        const dps = (3 + lv * 1.2) * this.skills.getDamageMult('tornado')
        const cd = this.baseCooldown('tornado', lv) * this.skills.getCooldownMult('tornado')
        const radius = (18 + lv * 4) * this.skills.getRadiusMult('tornado')
        const duration = (2.6 + lv * 0.4) * this.skills.getDurationMult('tornado')
        const count = 1 + this.skills.getCountBonus('tornado')
        stats.push(`DPS: ${dps.toFixed(1)}`, `冷却: ${cd.toFixed(1)}s`, `范围: ${radius.toFixed(0)}`, `持续: ${duration.toFixed(1)}s`, `数量: ${count}`)
        break
      }
      case 'thermobaric': {
        const dmg = (40 + lv * 12) * this.skills.getDamageMult('thermobaric')
        const cd = this.baseCooldown('thermobaric', lv) * this.skills.getCooldownMult('thermobaric')
        const radius = 60 * this.skills.getRadiusMult('thermobaric') + lv * 6
        const count = 1 + this.skills.getCountBonus('thermobaric')
        stats.push(`伤害: ${dmg.toFixed(0)}`, `冷却: ${cd.toFixed(1)}s`, `范围: ${radius.toFixed(0)}`, `数量: ${count}`)
        break
      }
      case 'napalm': {
        const initialDmg = (30 + lv * 10) * this.skills.getDamageMult('napalm')
        const pct = (0.05 + lv * 0.008) * this.skills.getDamageMult('napalm')
        const cd = this.baseCooldown('napalm', lv) * this.skills.getCooldownMult('napalm')
        const radius = 55 * this.skills.getRadiusMult('napalm') + lv * 4
        const duration = (4.0 + lv * 0.5) * this.skills.getDurationMult('napalm')
        stats.push(`初始: ${initialDmg.toFixed(0)}`, `燃烧: ${(pct * 100).toFixed(1)}%/s`, `冷却: ${cd.toFixed(1)}s`, `范围: ${radius.toFixed(0)}`, `持续: ${duration.toFixed(1)}s`)
        break
      }
      case 'ice_pierce': {
        const dmg = (18 + lv * 6) * this.skills.getDamageMult('ice_pierce')
        const cd = this.baseCooldown('ice_pierce', lv) * this.skills.getCooldownMult('ice_pierce')
        const width = (10 + lv * 2) * this.skills.getRadiusMult('ice_pierce')
        const freezeChance = Math.min(0.6, 0.18 + lv * 0.04)
        const count = 1 + this.skills.getCountBonus('ice_pierce')
        stats.push(`伤害: ${dmg.toFixed(0)}`, `冷却: ${cd.toFixed(1)}s`, `宽度: ${width.toFixed(0)}`, `冻结: ${(freezeChance * 100).toFixed(0)}%`, `数量: ${count}`)
        break
      }
      case 'high_energy_ray': {
        const dps = (35 + lv * 10) * this.skills.getDamageMult('high_energy_ray')
        const cd = this.baseCooldown('high_energy_ray', lv) * this.skills.getCooldownMult('high_energy_ray')
        const width = (8 + lv * 1.2) * this.skills.getRadiusMult('high_energy_ray')
        const duration = (1.0 + lv * 0.22) * this.skills.getDurationMult('high_energy_ray')
        stats.push(`DPS: ${dps.toFixed(1)}`, `冷却: ${cd.toFixed(1)}s`, `宽度: ${width.toFixed(1)}`, `持续: ${duration.toFixed(1)}s`)
        break
      }
      case 'guided_laser': {
        const dmg = (22 + lv * 7) * this.skills.getDamageMult('guided_laser')
        const cd = this.baseCooldown('guided_laser', lv) * this.skills.getCooldownMult('guided_laser')
        const count = 2 + this.skills.getCountBonus('guided_laser') + Math.floor(lv / 2)
        stats.push(`伤害: ${dmg.toFixed(0)}`, `冷却: ${cd.toFixed(1)}s`, `目标数: ${count}`)
        break
      }
      case 'armored_car': {
        const dmg = (28 + lv * 8) * this.skills.getDamageMult('armored_car')
        const cd = this.baseCooldown('armored_car', lv) * this.skills.getCooldownMult('armored_car')
        const count = 1 + this.skills.getCountBonus('armored_car')
        stats.push(`伤害: ${dmg.toFixed(0)}`, `冷却: ${cd.toFixed(1)}s`, `数量: ${count}`)
        break
      }
      case 'mini_vortex': {
        const dps = (12 + lv * 4) * this.skills.getDamageMult('mini_vortex')
        const cd = this.baseCooldown('mini_vortex', lv) * this.skills.getCooldownMult('mini_vortex')
        const radius = (80 + lv * 6) * this.skills.getRadiusMult('mini_vortex')
        const duration = (3.6 + lv * 0.25) * this.skills.getDurationMult('mini_vortex')
        const count = 1 + this.skills.getCountBonus('mini_vortex')
        stats.push(`DPS: ${dps.toFixed(1)}`, `冷却: ${cd.toFixed(1)}s`, `范围: ${radius.toFixed(0)}`, `持续: ${duration.toFixed(1)}s`, `数量: ${count}`)
        break
      }
      case 'air_blast': {
        const dmg = (15 + lv * 5) * this.skills.getDamageMult('air_blast')
        const cd = this.baseCooldown('air_blast', lv) * this.skills.getCooldownMult('air_blast')
        const radius = (90 + lv * 6) * this.skills.getRadiusMult('air_blast')
        const count = 1 + this.skills.getCountBonus('air_blast')
        stats.push(`伤害: ${dmg.toFixed(0)}`, `冷却: ${cd.toFixed(1)}s`, `范围: ${radius.toFixed(0)}`, `数量: ${count}`)
        break
      }
      case 'carpet_bomb': {
        const dmg = (35 + lv * 10) * this.skills.getDamageMult('carpet_bomb')
        const cd = this.baseCooldown('carpet_bomb', lv) * this.skills.getCooldownMult('carpet_bomb')
        const radius = (55 + lv * 4) * this.skills.getRadiusMult('carpet_bomb')
        const count = 4 + this.skills.getCountBonus('carpet_bomb') + Math.floor(lv / 2)
        stats.push(`伤害: ${dmg.toFixed(0)}`, `冷却: ${cd.toFixed(1)}s`, `范围: ${radius.toFixed(0)}`, `数量: ${count}`)
        break
      }
      case 'ice_storm': {
        const freezeSec = (0.6 + lv * 0.1) * this.skills.getDurationMult('ice_storm')
        const cd = this.baseCooldown('ice_storm', lv) * this.skills.getCooldownMult('ice_storm')
        const radius = (120 + lv * 8) * this.skills.getRadiusMult('ice_storm')
        const duration = (4.0 + lv * 0.6) * this.skills.getDurationMult('ice_storm')
        const count = 1 + this.skills.getCountBonus('ice_storm')
        stats.push(`冻结: ${freezeSec.toFixed(1)}s`, `冷却: ${cd.toFixed(1)}s`, `范围: ${radius.toFixed(0)}`, `持续: ${duration.toFixed(1)}s`, `数量: ${count}`)
        break
      }
      case 'emp_pierce': {
        const dmg = (20 + lv * 6) * this.skills.getDamageMult('emp_pierce')
        const cd = this.baseCooldown('emp_pierce', lv) * this.skills.getCooldownMult('emp_pierce')
        const width = (18 + lv * 2) * this.skills.getRadiusMult('emp_pierce')
        const shockMult = 1.2 + lv * 0.05
        stats.push(`伤害: ${dmg.toFixed(0)}`, `冷却: ${cd.toFixed(1)}s`, `宽度: ${width.toFixed(0)}`, `感电: ${shockMult.toFixed(2)}x`)
        break
      }
      case 'chain_electron': {
        const dmg = (18 + lv * 5) * this.skills.getDamageMult('chain_electron')
        const cd = this.baseCooldown('chain_electron', lv) * this.skills.getCooldownMult('chain_electron')
        const jumps = 3 + this.skills.getCountBonus('chain_electron') + Math.floor(lv / 2)
        stats.push(`伤害: ${dmg.toFixed(0)}`, `冷却: ${cd.toFixed(1)}s`, `跳跃: ${jumps}`)
        break
      }
      case 'bullet_spread': {
        const count = this.skills.bulletCount
        const spreadDeg = (this.skills.spreadRad * 180 / Math.PI).toFixed(0)
        stats.push(`子弹数: ${count}`, `散射角: ${spreadDeg}°`)
        break
      }
    }

    return stats.join(' | ')
  }

  /**
   * 更新技能状态栏（显示已选择的技能）
   * 区分主技能和被动（分支）技能
   * 分支技能只显示在对应主技能下方，作为强化词条
   */
  private updateSkillsBar() {
    const skillsBarList = document.getElementById('skills-bar-list')
    if (!skillsBarList) return

    // 清空现有内容
    skillsBarList.innerHTML = ''

    // 获取所有已解锁的主技能
    const unlockedSkills = this.skills.getUnlockedMainSkills()

    // 先收集所有分支技能，按主技能分组
    const upgradeSkillsByMain: Map<MainSkillId, Array<{ def: SkillDef; level: number }>> = new Map()
    
    for (const skillId in SKILL_DEFS) {
      const def = SKILL_DEFS[skillId as SkillId]
      if (def.type !== 'upgrade' || !def.requires) continue
      
      const level = this.skills.getLevel(skillId as SkillId)
      if (level <= 0) continue

      if (!upgradeSkillsByMain.has(def.requires)) {
        upgradeSkillsByMain.set(def.requires, [])
      }
      upgradeSkillsByMain.get(def.requires)!.push({ def, level })
    }

    // 显示主技能及其对应的分支技能（强化词条）
    // 排除 bullet_spread（主武器增强，不在技能栏显示）
    for (const skillId of unlockedSkills) {
      if (skillId === 'bullet_spread') continue // 子弹散射是主武器增强，不在技能栏显示
      
      const def = SKILL_DEFS[skillId]
      if (!def) continue

      const level = this.skills.getLevel(skillId)
      if (level <= 0) continue

      // 获取技能当前属性
      const stats = this.getSkillStats(skillId, level)

      // 显示主技能
      const mainItem = document.createElement('div')
      mainItem.className = 'skill-item skill-item-main'
      mainItem.innerHTML = `
        <div class="skill-item-name">${def.name} <span class="skill-item-tag">[主动]</span></div>
        <div class="skill-item-level">等级: ${level}/${def.maxLevel}</div>
        <div class="skill-item-stats">${stats}</div>
      `
      skillsBarList.appendChild(mainItem)

      // 显示该主技能的所有分支技能（强化词条）
      const upgrades = upgradeSkillsByMain.get(skillId)
      if (upgrades && upgrades.length > 0) {
        for (const { def: upgradeDef, level: upgradeLevel } of upgrades) {
          const upgradeItem = document.createElement('div')
          upgradeItem.className = 'skill-item skill-item-upgrade'
          upgradeItem.innerHTML = `
            <div class="skill-item-name">  └ ${upgradeDef.name} <span class="skill-item-tag">[强化]</span></div>
            <div class="skill-item-level">等级: ${upgradeLevel}/${upgradeDef.maxLevel}</div>
          `
          skillsBarList.appendChild(upgradeItem)
        }
      }
    }
  }

  // ===== 粒子特效辅助方法 =====

  /**
   * 绘制锯齿状闪电路径（用于闪电链特效）
   */
  private drawLightningPath(g: Phaser.GameObjects.Graphics, startX: number, startY: number, points: { x: number; y: number }[]) {
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
   * 生成火焰粒子（用于温压弹等爆炸特效）
   */
  private spawnFireParticles(x: number, y: number, radius: number, count: number) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2
      const dist = Math.random() * radius
      const px = x + Math.cos(angle) * dist
      const py = y + Math.sin(angle) * dist
      const particle = this.add.circle(px, py, 2, 0xff6b00, 0.8)
      
      const vx = (Math.random() - 0.5) * 80
      const vy = (Math.random() - 0.5) * 80 - 20
      
      this.tweens.add({
        targets: particle,
        x: px + vx * 0.3,
        y: py + vy * 0.3,
        alpha: 0,
        scale: 0.5,
        duration: 300 + Math.random() * 200,
        onComplete: () => particle.destroy(),
      })
    }
  }

  /**
   * 开始持续生成燃烧粒子（用于燃油弹）
   */
  private startBurnParticles(x: number, y: number, radius: number, duration: number) {
    const interval = 0.15 // 每0.15秒生成一次
    const count = Math.ceil(duration / interval)
    
    for (let i = 0; i < count; i++) {
      this.time.delayedCall(i * interval * 1000, () => {
        const angle = Math.random() * Math.PI * 2
        const dist = Math.random() * radius * 0.7
        const px = x + Math.cos(angle) * dist
        const py = y + Math.sin(angle) * dist
        const particle = this.add.circle(px, py, 1.5, 0xff4500, 0.7)
        
        this.tweens.add({
          targets: particle,
          y: py - 15,
          alpha: 0,
          scale: 0.3,
          duration: 400,
          onComplete: () => particle.destroy(),
        })
      })
    }
  }

  /**
   * 生成冰晶粒子（用于干冰弹）
   */
  private spawnIceParticles(centerX: number, width: number, height: number, count: number) {
    for (let i = 0; i < count; i++) {
      const x = centerX + (Math.random() - 0.5) * width * 2
      const y = Math.random() * height
      const particle = this.add.circle(x, y, 1.5, 0x6bffea, 0.8)
      
      this.tweens.add({
        targets: particle,
        y: y + 20,
        alpha: 0,
        scale: 0.5,
        duration: 250,
        onComplete: () => particle.destroy(),
      })
    }
  }

  /**
   * 生成冻结特效（用于干冰弹冻结敌人）
   */
  private spawnFreezeEffect(x: number, y: number) {
    const gfx = this.add.graphics()
    gfx.lineStyle(2, 0x6bffea, 0.9)
    gfx.strokeCircle(x, y, 8)
    gfx.fillStyle(0xffffff, 0.6)
    gfx.fillCircle(x, y, 3)
    
    this.tweens.add({
      targets: gfx,
      scaleX: 1.5,
      scaleY: 1.5,
      alpha: 0,
      duration: 400,
      onComplete: () => gfx.destroy(),
    })
  }

  /**
   * 生成锁定标记特效（用于高能射线、制导激光）
   */
  private spawnLockOnEffect(x: number, y: number) {
    const gfx = this.add.graphics()
    // 外圈
    gfx.lineStyle(2, 0xffe66b, 0.8)
    gfx.strokeCircle(x, y, 12)
    // 内圈十字
    gfx.lineStyle(1, 0xffff00, 0.9)
    gfx.lineBetween(x - 6, y, x + 6, y)
    gfx.lineBetween(x, y - 6, x, y + 6)
    
    this.tweens.add({
      targets: gfx,
      scaleX: 1.3,
      scaleY: 1.3,
      alpha: 0,
      duration: 200,
      onComplete: () => gfx.destroy(),
    })
  }

  /**
   * 生成尘土特效（用于装甲车）
   */
  private spawnDustEffect(x: number, y: number, dir: number) {
    for (let i = 0; i < 8; i++) {
      const offsetX = (Math.random() - 0.5) * 20
      const offsetY = (Math.random() - 0.5) * 10
      const particle = this.add.circle(x + offsetX, y + offsetY, 2, 0x888888, 0.6)
      
      const vx = dir * (20 + Math.random() * 30)
      const vy = -10 - Math.random() * 20
      
      this.tweens.add({
        targets: particle,
        x: x + offsetX + vx * 0.4,
        y: y + offsetY + vy * 0.4,
        alpha: 0,
        scale: 0.3,
        duration: 500,
        onComplete: () => particle.destroy(),
      })
    }
  }

  /**
   * 生成旋风粒子（用于旋风加农）
   */
  private spawnVortexParticles(x: number, y: number, radius: number, duration: number) {
    const interval = 0.1
    const count = Math.ceil(duration / interval)
    
    for (let i = 0; i < count; i++) {
      this.time.delayedCall(i * interval * 1000, () => {
        const angle = (this.timeAliveSec * 3 + i * 0.5) % (Math.PI * 2)
        const dist = Math.random() * radius
        const px = x + Math.cos(angle) * dist
        const py = y + Math.sin(angle) * dist
        const particle = this.add.circle(px, py, 1.5, 0x9b6bff, 0.7)
        
        this.tweens.add({
          targets: particle,
          x: x + Math.cos(angle + Math.PI * 0.5) * radius,
          y: y + Math.sin(angle + Math.PI * 0.5) * radius,
          alpha: 0,
          scale: 0.5,
          duration: 600,
          onComplete: () => particle.destroy(),
        })
      })
    }
  }

  /**
   * 生成击退特效（用于压缩气弹）
   */
  private spawnKnockbackEffect(zombieX: number, zombieY: number, centerX: number, centerY: number) {
    const dx = zombieX - centerX
    const dy = zombieY - centerY
    const dist = Math.hypot(dx, dy)
    if (dist === 0) return
    
    const dirX = dx / dist
    const dirY = dy / dist
    
    for (let i = 0; i < 4; i++) {
      const particle = this.add.circle(zombieX, zombieY, 1.5, 0xa9c1ff, 0.7)
      
      this.tweens.add({
        targets: particle,
        x: zombieX + dirX * 20,
        y: zombieY + dirY * 20,
        alpha: 0,
        scale: 0.3,
        duration: 200,
        onComplete: () => particle.destroy(),
      })
    }
  }

  /**
   * 生成冲击波特效（用于压缩气弹）
   */
  private spawnShockwave(x: number, y: number, maxRadius: number) {
    // 多层冲击波
    for (let layer = 0; layer < 3; layer++) {
      const gfx = this.add.graphics()
      const startR = maxRadius * 0.3 * (layer + 1)
      gfx.lineStyle(3 - layer, 0xa9c1ff, 0.6 - layer * 0.15)
      gfx.strokeCircle(x, y, startR)
      
      this.tweens.add({
        targets: gfx,
        scaleX: maxRadius / startR,
        scaleY: maxRadius / startR,
        alpha: 0,
        duration: 300 + layer * 50,
        delay: layer * 50,
        onComplete: () => gfx.destroy(),
      })
    }
  }

  /**
   * 生成轰炸标记（用于空投轰炸）
   */
  private spawnBombMarker(x: number, y: number, radius: number, delay: number) {
    const gfx = this.add.graphics()
    gfx.lineStyle(2, 0xff6b6b, 0.8)
    gfx.strokeCircle(x, y, radius)
    gfx.fillStyle(0xff6b6b, 0.3)
    gfx.fillCircle(x, y, radius)
    
    // 闪烁效果
    this.tweens.add({
      targets: gfx,
      alpha: { from: 0.8, to: 0.3 },
      duration: 100,
      repeat: Math.floor(delay / 0.1),
      yoyo: true,
    })
    
    // 爆炸时移除
    this.time.delayedCall(delay * 1000, () => {
      gfx.destroy()
    })
  }

  /**
   * 开始持续生成冰雾粒子（用于冰暴发生器）
   */
  private startIceFogParticles(x: number, y: number, radius: number, duration: number) {
    const interval = 0.2
    const count = Math.ceil(duration / interval)
    
    for (let i = 0; i < count; i++) {
      this.time.delayedCall(i * interval * 1000, () => {
        const angle = Math.random() * Math.PI * 2
        const dist = Math.random() * radius
        const px = x + Math.cos(angle) * dist
        const py = y + Math.sin(angle) * dist
        const particle = this.add.circle(px, py, 1.5, 0x6bffea, 0.6)
        
        this.tweens.add({
          targets: particle,
          x: px + (Math.random() - 0.5) * 10,
          y: py + (Math.random() - 0.5) * 10,
          alpha: 0,
          scale: 0.5,
          duration: 800,
          onComplete: () => particle.destroy(),
        })
      })
    }
  }

  /**
   * 生成感电特效（用于电磁穿刺、跃迁电子）
   */
  private spawnShockEffect(x: number, y: number) {
    const gfx = this.add.graphics()
    // 电光闪烁
    for (let i = 0; i < 3; i++) {
      const angle = (Math.PI * 2 / 3) * i
      const len = 6 + Math.random() * 4
      const endX = x + Math.cos(angle) * len
      const endY = y + Math.sin(angle) * len
      gfx.lineStyle(2, 0xffff00, 0.9)
      gfx.lineBetween(x, y, endX, endY)
    }
    
    this.tweens.add({
      targets: gfx,
      alpha: 0,
      duration: 150,
      onComplete: () => gfx.destroy(),
    })
  }

  /**
   * 生成极光粒子（用于极光技能）
   */
  private spawnAuroraParticles(centerX: number, width: number, height: number, count: number) {
    for (let i = 0; i < count; i++) {
      const x = centerX + (Math.random() - 0.5) * width * 1.5
      const y = Math.random() * height
      const particle = this.add.circle(x, y, 2, 0x6bffea, 0.8)
      
      // 粒子向上飘散
      this.tweens.add({
        targets: particle,
        y: y - 30,
        x: x + (Math.random() - 0.5) * 10,
        alpha: 0,
        scale: 0.5,
        duration: 400,
        onComplete: () => particle.destroy(),
      })
    }
  }
}