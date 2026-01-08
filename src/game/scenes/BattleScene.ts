import Phaser from 'phaser'
import { Player } from '../entities/Player'
import { Zombie } from '../entities/Zombie'
import { Bullet } from '../entities/Bullet'
import { SecondaryBullet } from '../entities/SecondaryBullet'
import { Tornado } from '../entities/Tornado'
import { EnemyShot } from '../entities/EnemyShot'
import { ZOMBIE_TYPES, type ZombieKind } from '../entities/zombieTypes'
import { SkillPool } from '../skills/SkillPool'
import { SkillSystem, type SkillChoice } from '../skills/SkillSystem'
import { SKILL_DEFS, type MainSkillId, type SkillId, type SkillDef } from '../skills/skillDefs'
import { AudioManager } from '../audio/AudioManager'
import { getSkillDamageType } from '../damage/SkillDamageType'
import type { DamageType } from '../damage/DamageType'
import { DamageCalculator } from '../damage/DamageCalculator'
import { TalentManager } from '../talents/TalentManager'
import { EffectManager } from '../effects/EffectManager'

export class BattleScene extends Phaser.Scene {
  // ===== 子弹速度常量 =====
  /** 主武器子弹速度（像素/秒） */
  private static readonly BULLET_SPEED = 260
  /** 次级子弹速度（像素/秒，为主子弹的38.5%） */
  private static readonly SECONDARY_BULLET_SPEED = 100

  private defenseHp = 2000
  private readonly defenseHpMax = 2000

  private exp = 0
  private level = 1
  private expNext = 10
  private pendingLevelUps = 0  // 待处理的升级次数（用于连升多级）

  private player!: Player
  private zombies: Zombie[] = []
  private bullets: Bullet[] = []
  private secondaryBullets: SecondaryBullet[] = []
  
  // 连发系统：存储待发射的子弹批次信息
  // 每个批次包含一次连发的所有散射子弹（同时发射）
  private burstQueue: Array<{
    targetX: number
    targetY: number
    baseAng: number
    angles: number[]  // 该批次所有子弹的角度（散射子弹同时发射）
    index: number     // 批次索引
    total: number     // 总批次数
  }> = []
  private burstTimer = 0  // 连发间隔计时器
  private readonly burstInterval = 0.03  // 连发间隔（秒），避免子弹重叠
  private tornados: Tornado[] = []
  
  /** 手动选择的目标（点击鼠标时设置，优先攻击此目标） */
  private manualTarget: Zombie | null = null
  /** 目标指示器图形（显示当前锁定的目标） */
  private targetIndicatorGfx!: Phaser.GameObjects.Graphics
  private enemyShots: EnemyShot[] = []

  private rangeGfx!: Phaser.GameObjects.Graphics
  private skillRangeGfx!: Phaser.GameObjects.Graphics  // 技能范围显示图形

  private readonly defenseLineY = 520

  // 主武器信息（canvas内渲染，深度999，低于技能选择界面1000）
  private weaponInfoGfx!: Phaser.GameObjects.Graphics
  private weaponInfoTexts: Phaser.GameObjects.Text[] = []
  

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
  
  // 伤害统计系统
  private damageStats = new Map<string, number>()  // 伤害来源 -> 总伤害
  private totalDamage = 0  // 总伤害

  // lightweight skill VFX/effects state (keep it simple / easy to swap later)
  private explosions: { x: number; y: number; r: number; ttl: number; gfx: Phaser.GameObjects.Graphics }[] = []
  private burnZones: { x: number; y: number; r: number; ttl: number; pctPerSec: number; gfx: Phaser.GameObjects.Graphics }[] = []
  private beams: { fromX: number; fromY: number; toX: number; toY: number; w: number; ttl: number; dps: number; gfx: Phaser.GameObjects.Graphics }[] = []
  private cars: { x: number; y: number; vx: number; vy: number; w: number; h: number; ttl: number; dmg: number; kb: number; hit: Set<number>; gfx: Phaser.GameObjects.Graphics }[] =
    []
  private vortexes: { x: number; y: number; r: number; ttl: number; dps: number; pull: number; gfx: Phaser.GameObjects.Graphics }[] = []
  private pendingBombs: { x: number; y: number; delay: number; r: number; dmg: number }[] = []
  private iceFogs: { x: number; y: number; r: number; ttl: number; freezeSec: number; gfx: Phaser.GameObjects.Graphics }[] = []
  private empStrikes: { x: number; y: number; r: number; ttl: number; dmg: number; shockMult: number; shockSec: number; gfx: Phaser.GameObjects.Graphics }[] = []
  private chainFx: { ttl: number; gfx: Phaser.GameObjects.Graphics }[] = []
  
  // 燃油弹抛掷物系统
  private napalmProjectiles: Array<{
    x: number
    y: number
    vx: number  // 水平速度
    vy: number  // 垂直速度
    targetX: number  // 目标X坐标
    targetY: number  // 目标Y坐标
    radius: number  // 爆炸半径
    ttl: number  // 持续时间
    pctPerSec: number  // 百分比伤害
    initialDmg: number  // 初始伤害
    lv: number  // 技能等级
    gfx: Phaser.GameObjects.Graphics  // 抛掷物图形
    trailGfx: Phaser.GameObjects.Graphics  // 轨迹线图形
    flightTime: number  // 已飞行时间
  }> = []
  
  // 伤害数字UI系统已移至 EffectManager
  
  // 管理器实例
  private audioManager!: AudioManager
  private damageCalculator!: DamageCalculator
  private talentManager!: TalentManager
  private effectManager!: EffectManager

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
    
    // 技能范围显示图形
    this.skillRangeGfx = this.add.graphics()
    this.skillRangeGfx.setVisible(false)
    
    // 主武器信息图形（canvas内渲染，深度999，低于技能选择界面1000）
    this.weaponInfoGfx = this.add.graphics()
    this.weaponInfoGfx.setDepth(999) // 确保低于技能选择界面（1000）

    // 初始化管理器
    this.audioManager = new AudioManager()
    this.damageCalculator = new DamageCalculator(this, this.player, this.skills)
    this.talentManager = new TalentManager(this, this.skills, this.scale)
    this.effectManager = new EffectManager(this)
    
    // 鼠标/触摸点击事件：选择距离点击位置最近的敌人作为目标
    // 移动端和桌面端都支持
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      // 左键点击或触摸（移动端button为0）
      if (pointer.button === 0 || pointer.isDown) {
        // 初始化音频（需要在用户交互后）
        this.audioManager.init()
        // 启动BGM（如果还没启动）
        this.audioManager.playBGM()
        
        this.selectTargetAt(pointer.worldX, pointer.worldY)
      }
    })
    
    // 键盘事件：也用于初始化音频
    this.input.keyboard?.on('keydown', () => {
      this.audioManager.init()
      this.audioManager.playBGM()
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
    
    // 更新伤害数字UI
    this.effectManager.updateDamageNumbers(dtSec)
    
    // 更新传送动画
    this.talentManager.updateTeleportAnimations(dtSec)
    
    // 更新伤害计算器的时间
    this.damageCalculator.setTimeAliveSec(this.timeAliveSec)
    
    // 绘制主武器信息（canvas内，深度999，常显示，无边框）
    this.drawWeaponInfo()
    
    // 更新伤害统计（DOM方式）
    this.updateDamageStats()
  }

  private stepPlayer(dtSec: number) {
    this.player.update(dtSec)
    this.drawRangeArc()

    // 处理连发队列：按时间间隔发射批次
    // 每次发射一个批次的所有散射子弹（同时发射，整齐地）
    if (this.burstQueue.length > 0) {
      this.burstTimer += dtSec
      if (this.burstTimer >= this.burstInterval) {
        this.burstTimer = 0
        const nextBatch = this.burstQueue.shift()
        if (nextBatch) {
          // 同时发射该批次的所有散射子弹（整齐地）
          const speed = BattleScene.BULLET_SPEED
          // 计算实际伤害（应用增伤倍率）
          const actualDamage = this.player.damage * this.skills.weaponDamageMult
          // 获取穿透数量
          const pierce = this.skills.weaponPierce
          
          for (const ang of nextBatch.angles) {
            const vx = Math.cos(ang) * speed
            const vy = Math.sin(ang) * speed
            const bullet = new Bullet(this, {
              x: this.player.x,
              y: this.player.y - 8,
              vx,
              vy,
              damage: actualDamage,
              pierce
              // 无最大射程限制
            })
            this.bullets.push(bullet)
          }
          
          // 播放发射音效
          this.audioManager?.playShootSound()
          
          // 分裂逻辑在命中时处理，每发子弹命中时都会触发分裂
        }
      }
    }

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
    // 如果连发队列不为空，不触发新的射击
    if (this.burstQueue.length > 0) {
      this.updateTargetIndicator()
      return
    }
    
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
      const bulletSpeed = BattleScene.BULLET_SPEED
      const predicted = this.predictTargetPosition(targetX, targetY, targetVx, targetVy, bulletSpeed)
      predictedX = predicted.x
      predictedY = predicted.y
    }
    
    const dx = predictedX - this.player.x
    const dy = predictedY - this.player.y
    const baseAng = Math.atan2(dy, dx)
    const speed = BattleScene.BULLET_SPEED

    // 连发数量：1 + rapidFireCount（每级+1发）
    const rapidFireLevel = this.skills.rapidFireCount
    const burstCount = 1 + rapidFireLevel  // 0级=1发，1级=2发，2级=3发...
    
    // 散射子弹数：1 + bulletSpreadLevel（每级+1发）
    const bulletSpreadLevel = this.skills.getLevel('bullet_spread')
    const spreadBulletCount = 1 + bulletSpreadLevel  // 0级=1发，1级=2发，2级=3发...
    
    // 散射角度
    const spread = this.skills.spreadRad

    // 清空之前的连发队列
    this.burstQueue = []
    this.burstTimer = 0

    // 计算实际伤害（应用增伤倍率）
    const actualDamage = this.player.damage * this.skills.weaponDamageMult
    // 获取穿透数量（默认1，表示命中即消失）
    const pierce = this.skills.weaponPierce

    // 如果只有单发且没有散射，直接发射
    if (burstCount === 1 && spreadBulletCount === 1) {
      const vx = Math.cos(baseAng) * speed
      const vy = Math.sin(baseAng) * speed
      const bullet = new Bullet(this, { x: this.player.x, y: this.player.y - 8, vx, vy, damage: actualDamage, pierce })  // 无最大射程限制
      this.bullets.push(bullet)
      
      // 播放发射音效
      this.audioManager?.playShootSound()
      return
    }

    // 连发：将子弹批次加入队列，按时间间隔发射
    // 每次连发都同时发射 spreadBulletCount 颗散射子弹（整齐地）
    // 确保至少一条弹道（双数时为最左侧）能命中目标
    for (let burstIndex = 0; burstIndex < burstCount; burstIndex++) {
      // 计算该批次所有散射子弹的角度
      // 确保至少一条弹道（双数时为最左侧）能命中目标
      const angles: number[] = []
      if (spreadBulletCount === 1) {
        // 没有散射，使用基础角度
        angles.push(baseAng)
      } else {
        // 有散射，调整角度分布确保至少一条弹道命中目标
        const isEven = spreadBulletCount % 2 === 0
        const targetIndex = isEven ? 0 : Math.floor(spreadBulletCount / 2)  // 双数=0（最左侧），单数=中间
        
        if (isEven) {
          // 双数弹道：最左侧（索引0）指向目标，其他弹道向右分布
          // 分布范围：[baseAng, baseAng + spread]
          for (let spreadIndex = 0; spreadIndex < spreadBulletCount; spreadIndex++) {
            if (spreadIndex === 0) {
              // 最左侧精确指向目标
              angles.push(baseAng)
            } else {
              // 其他弹道在 [baseAng, baseAng + spread] 范围内均匀分布
              const t = spreadIndex / (spreadBulletCount - 1)  // 0 到 1
              const ang = baseAng + t * spread
              angles.push(ang)
            }
          }
        } else {
          // 单数弹道：中间（索引 targetIndex）指向目标，其他弹道在两侧分布
          // 分布范围：[baseAng - spread/2, baseAng + spread/2]
          for (let spreadIndex = 0; spreadIndex < spreadBulletCount; spreadIndex++) {
            if (spreadIndex === targetIndex) {
              // 中间精确指向目标
              angles.push(baseAng)
            } else {
              // 其他弹道在 [baseAng - spread/2, baseAng + spread/2] 范围内均匀分布
              const offset = spreadIndex - targetIndex
              const totalSlots = spreadBulletCount - 1  // 除了中间那条，其他位置数
              const t = offset / (totalSlots / 2)  // -1 到 1
              const ang = baseAng + t * (spread / 2)
              angles.push(ang)
            }
          }
        }
      }
      
      // 将批次信息加入连发队列
      this.burstQueue.push({
        targetX: predictedX,
        targetY: predictedY,
        baseAng,
        angles,  // 该批次所有子弹的角度
        index: burstIndex,
        total: burstCount
      })
    }
    
    // 立即发射第一批次的所有子弹（不等待间隔，整齐地同时发射）
    if (this.burstQueue.length > 0) {
      const firstBatch = this.burstQueue.shift()!
      // 同时发射该批次的所有散射子弹
      const pierce = this.skills.weaponPierce
      for (const ang of firstBatch.angles) {
        const vx = Math.cos(ang) * speed
        const vy = Math.sin(ang) * speed
        const bullet = new Bullet(this, { 
          x: this.player.x, 
          y: this.player.y - 8, 
          vx, 
          vy, 
          damage: actualDamage,
          pierce
          // 无最大射程限制
        })
        this.bullets.push(bullet)
      }
      
      // 播放发射音效
      this.audioManager?.playShootSound()
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
      if (burn > 0) {
        this.recordDamage('燃油弹', burn)
        z.takeDamage(burn)
      }

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
      // 检查是否超出射程（如果有设置最大射程）
      if (b.isOutOfRange()) {
        b.destroy()
        continue
      }
      
      // 连续碰撞检测：检查子弹移动路径是否与僵尸碰撞
      // 根据僵尸体型计算碰撞半径：基础半径6像素，乘以体型得到实际半径
      // 子弹大小：3x3像素（半径约1.5像素）
      // 碰撞判定范围：僵尸半径 + 子弹半径 + 容差
      const bulletRadius = 1.5  // 子弹半径
      const tolerance = 2  // 容差
      let hit: Zombie | null = null
      
      for (const z of this.zombies) {
        if (z.hp <= 0 || !z.isAlive()) continue
        
        // 如果已经穿透过这个敌人，跳过（避免重复命中）
        if (b.piercedZombies.has(z.id)) continue
        
        // 根据该僵尸的体型计算碰撞半径
        const zombieRadius = 6 * z.size  // 根据体型计算僵尸半径
        const hitRadius = zombieRadius + bulletRadius + tolerance
        
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
        // 计算基础伤害（主武器是物理属性）
        const baseDmg = b.damage
        // 应用暴击和天赋效果（传递物理属性）
        const { finalDamage, isCrit } = this.damageCalculator.calculateDamageWithCritAndTalents(baseDmg, hit, '主武器', 'physical')
        this.recordDamage('主武器', finalDamage)
        hit.takeDamage(finalDamage)
        
        // 显示伤害数字（暴击时显示不同颜色）
        this.effectManager.showDamageNumber(hit.x, hit.y, finalDamage, isCrit)
        
        // 应用天赋效果（命中时触发）
        const instakilled = this.talentManager.applyTalentEffectsOnHit(hit, finalDamage, isCrit)
        if (instakilled) {
          this.recordDamage('秒杀', hit.maxHp)
        }
        
        // 记录已穿透的敌人
        b.piercedZombies.add(hit.id)
        
        // 子弹命中时在命中位置分裂（传入被命中的目标，让次级子弹避开它）
        const bulletAngle = Math.atan2(b.vy, b.vx)
        this.spawnBulletSplitImmediate(b.x, b.y, bulletAngle, b.damage, hit)
        
        // 检查穿透数量：如果已穿透数量达到上限，销毁子弹
        if (b.piercedZombies.size >= b.pierce) {
          b.destroy()
          continue
        }
      }
      
      if (b.x < -30 || b.x > this.scale.width + 30 || b.y < -40 || b.y > this.scale.height + 40) {
        b.destroy()
        continue
      }
      keepB.push(b)
    }
    this.bullets = keepB

    // 更新次级子弹
    for (const sb of this.secondaryBullets) sb.update(dtSec)
    const keepSB: SecondaryBullet[] = []
    for (const sb of this.secondaryBullets) {
      if (sb.isOutOfRange()) {
        sb.destroy()
        continue
      }
      
      // 次级子弹碰撞检测
      // 根据僵尸体型计算碰撞半径
      const bulletRadius = 1.5  // 次级子弹半径（与主子弹相同）
      const tolerance = 2  // 容差
      let hit: Zombie | null = null
      
      for (const z of this.zombies) {
        if (z.hp <= 0 || !z.isAlive()) continue
        
        // 如果该目标是排除目标且体型<=3，则跳过（体型>3的可以命中）
        if (sb.excludedTargetId !== undefined && z.id === sb.excludedTargetId && z.size <= 3) {
          continue
        }
        
        // 根据该僵尸的体型计算碰撞半径
        const zombieRadius = 6 * z.size  // 根据体型计算僵尸半径
        const hitRadius = zombieRadius + bulletRadius + tolerance
        
        const d = Math.hypot(z.x - sb.x, z.y - sb.y)
        if (d <= hitRadius) {
          hit = z
          break
        }
        
        // 连续碰撞检测
        const prev = sb.prevPosition
        const dist = Math.hypot(sb.x - prev.x, sb.y - prev.y)
        if (dist > 0.1) {
          const pointToLineDist = this.pointToLineSegmentDistance(
            z.x, z.y,
            prev.x, prev.y,
            sb.x, sb.y
          )
          if (pointToLineDist <= hitRadius) {
            hit = z
            break
          }
        }
      }
      
      if (hit) {
        const baseDmg = sb.damage
        const { finalDamage, isCrit } = this.damageCalculator.calculateDamageWithCritAndTalents(baseDmg, hit, '主武器', 'physical')
        this.recordDamage('主武器', finalDamage)
        hit.takeDamage(finalDamage)
        
        // 显示伤害数字（暴击时显示不同颜色）
        this.effectManager.showDamageNumber(hit.x, hit.y, finalDamage, isCrit)
        
        // 应用天赋效果（命中时触发）
        const instakilled = this.talentManager.applyTalentEffectsOnHit(hit, finalDamage, isCrit)
        if (instakilled) {
          this.recordDamage('秒杀', hit.maxHp)
        }
        
        sb.destroy()
        continue
      }
      
      if (sb.x < -30 || sb.x > this.scale.width + 30 || sb.y < -40 || sb.y > this.scale.height + 40) {
        sb.destroy()
        continue
      }
      keepSB.push(sb)
    }
    this.secondaryBullets = keepSB

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
      // 记录龙卷风伤害
      const dmg = t.dps * dtSec
      for (const z of this.zombies) {
        const d = Math.hypot(z.x - t.x, z.y - t.y)
        if (d <= t.radius) {
          const actualDmg = dmg * z.getDamageTakenMult(this.timeAliveSec)
          this.recordDamage('龙卷风', actualDmg)
        }
      }
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
    this.stepNapalmProjectiles(dtSec)
    this.stepExplosions(dtSec)
    this.stepBurnZones(dtSec)
    this.stepBeams(dtSec)
    this.stepCars(dtSec)
    this.stepVortexes(dtSec)
    this.stepPendingBombs(dtSec)
    this.stepIceFogs(dtSec)
    this.stepEmpStrikes(dtSec)
    this.stepChainFx(dtSec)

    if (this.defenseHp <= 0) this.showGameOver()
  }

  /**
   * 更新难度参数（生成间隔等）
   * 每波速度固定：每18秒一波（通过调整生成间隔来控制）
   */
  private updateDifficulty() {
    // 每波固定18秒，计算生成间隔
    // 假设每波有 getZombiesInWave() 个僵尸，需要在18秒内生成完
    const zombiesCount = this.getZombiesInWave()
    const waveDurationSec = 18.0 // 每波固定18秒
    const baseInterval = zombiesCount > 0 ? waveDurationSec / zombiesCount : 0.9
    
    // 设置下限和上限，避免过快或过慢
    const minInterval = 0.3 // 最快0.3秒生成一个
    const maxInterval = 0.9  // 最慢0.9秒生成一个
    const clampedInterval = Phaser.Math.Clamp(baseInterval, minInterval, maxInterval)
    
    // 疯狂模式：生成频率加倍（间隔减半）
    this.spawnIntervalSec = this.crazyMode ? clampedInterval * 0.5 : clampedInterval
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

      // 检查技能范围内是否有敌人（只有范围内有敌人才触发）
      if (!this.hasEnemyInSkillRange(id, lv)) {
        // 范围内没有敌人，重置冷却时间（避免技能一直等待）
        const baseCd = this.baseCooldown(id, lv)
        const cd = baseCd * this.skills.getCooldownMult(id)
        this.cds.set(id, cd * 0.1) // 设置很短的冷却，快速重试
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

  /**
   * 获取主武器伤害因子
   * 频率越高的技能（冷却时间越短），因子越低
   * 公式：因子 = 技能冷却时间 / 基准冷却时间（5秒）
   * 例如：冷却2秒的技能因子=0.4，冷却5秒的技能因子=1.0，冷却10秒的技能因子=2.0
   */
  private getWeaponDamageFactor(skillId: MainSkillId, lv: number): number {
    const cooldown = this.baseCooldown(skillId, lv) * this.skills.getCooldownMult(skillId)
    const baseCooldown = 5.0  // 基准冷却时间（5秒）
    // 频率越高（冷却越短），因子越低
    // 最小因子0.2（冷却1秒），最大因子2.5（冷却12.5秒）
    return Math.max(0.2, Math.min(2.5, cooldown / baseCooldown))
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
    const weaponFactor = this.getWeaponDamageFactor('aurora', lv)
    const baseDmg = 8 + lv * 3.2
    const dmg = (baseDmg + weaponFactor * this.player.damage) * this.skills.getDamageMult('aurora')

    // 伤害判定
    for (const z of this.zombies) {
      if (z.y > this.defenseLineY) continue
      if (Math.abs(z.x - x) <= beamW) {
        const actualDmg = dmg * z.getDamageTakenMult(this.timeAliveSec)
        this.recordDamage('极光', actualDmg)
        z.takeDamage(actualDmg)
        this.effectManager.showDamageNumber(z.x, z.y, actualDmg)
      }
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
    // 提高龙卷风DPS：基础值从3提高到15，每级从1.2提高到6
    const weaponFactor = this.getWeaponDamageFactor('tornado', lv)
    const baseDps = 15 + lv * 6
    const dps = (baseDps + weaponFactor * this.player.damage) * this.skills.getDamageMult('tornado')
    const count = 1 + this.skills.getCountBonus('tornado')
    
    // 从防线到屏幕顶部需要移动的距离
    const startY = this.defenseLineY - 6
    const distanceToTop = startY  // 从514到0，需要移动514像素
    const vy = -55 - lv * 10  // 向上移动速度（负值表示向上）
    // 计算到达屏幕顶部所需的时间（加上一些余量，确保到达顶部）
    const timeToTop = Math.abs(distanceToTop / vy) + 0.5  // 加上0.5秒余量
    const d = timeToTop * this.skills.getDurationMult('tornado')

    for (let i = 0; i < count; i++) {
      const x = Phaser.Math.Clamp(this.player.x + (i - (count - 1) / 2) * 26, 20, this.scale.width - 20)
      const t = new Tornado(this, { x, y: startY, vy, radius: r, durationSec: d, dps })
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
    const weaponFactor = this.getWeaponDamageFactor('thermobaric', lv)
    const baseDmg = 40 + lv * 12
    const dmg = (baseDmg + weaponFactor * this.player.damage) * this.skills.getDamageMult('thermobaric')

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
          if (d <= r) {
            const actualDmg = dmg * z.getDamageTakenMult(this.timeAliveSec)
            this.recordDamage('温压弹', actualDmg)
            z.takeDamage(actualDmg)
          }
        }
        
        // 延迟释放特效（飞行时间放慢50%，即延迟时间增加100%）
        this.time.delayedCall(i * 300, () => {
          this.spawnThermobaricExplosion(newX, newY, r)
        })
      } else {
        // 第一次立即释放
        // 伤害计算
        for (const z of this.zombies) {
          const d = Math.hypot(z.x - x, z.y - y)
          if (d <= r) {
            const actualDmg = dmg * z.getDamageTakenMult(this.timeAliveSec)
            this.recordDamage('温压弹', actualDmg)
            z.takeDamage(actualDmg)
          }
        }
        
        // 添加飞行轨迹动画
        const flightTime = 0.6  // 飞行时间（秒）
        this.spawnProjectileTrail(this.player.x, this.player.y, x, y, flightTime, 0xff6b00, 0xff4500)
        // 延迟爆炸
        this.time.delayedCall(flightTime * 1000, () => {
          this.spawnThermobaricExplosion(x, y, r)
        })
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
    this.effectManager.spawnFireParticles(x, y, r, 15)
    
    // 基础爆炸标记
    this.effectManager.spawnExplosion(x, y, r, 0xff6b6b)
  }

  /**
   * 燃油弹：地面持续燃烧区域，百分比扣血 + 点燃效果
   * 特效：火焰燃烧区域 + 持续火焰粒子 + 烟雾效果
   */
  /**
   * 燃油弹：地面持续燃烧区域，百分比扣血 + 点燃效果
   * 特效：抛掷动画 + 抛物线轨迹 + 火焰燃烧区域 + 持续火焰粒子 + 烟雾效果
   */
  private castNapalm(lv: number) {
    // 优先攻击最近的敌人位置
    const target = this.pickNearestZombie()
    if (!target) return // 无敌人时不释放
    
    const targetX = target.x
    const targetY = target.y
    const startX = this.player.x
    const startY = this.player.y - 8  // 从玩家位置稍上方发射
    
    // 固定飞行时间为0.8秒
    const flightTime = 0.8  // 固定飞行时间（秒）
    
    // 计算抛物线轨迹参数
    const dx = targetX - startX
    const dy = targetY - startY
    
    // 计算初始速度（考虑重力，确保在0.8秒后到达目标位置）
    const gravity = 400  // 重力加速度（像素/秒²）
    // 水平速度：直接计算
    const vx = dx / flightTime
    // 垂直速度：使用抛物线公式 y = y0 + vy*t - 0.5*g*t^2
    // 解方程：dy = vy*flightTime - 0.5*gravity*flightTime^2
    // 得到：vy = (dy + 0.5*gravity*flightTime^2) / flightTime
    const vy = (dy + 0.5 * gravity * flightTime * flightTime) / flightTime
    
    // 创建抛掷物图形（燃油弹外观）
    const projectileGfx = this.add.graphics()
    projectileGfx.fillStyle(0xff6b00, 1.0)
    projectileGfx.fillCircle(0, 0, 4)  // 燃油弹主体（橙色）
    projectileGfx.fillStyle(0xffe66b, 1.0)
    projectileGfx.fillCircle(0, 0, 2)  // 内部亮点（黄色）
    projectileGfx.setPosition(startX, startY)
    projectileGfx.setDepth(500)  // 确保在僵尸上方
    
    // 创建轨迹线图形（抛物线预览）
    const trailGfx = this.add.graphics()
    trailGfx.lineStyle(1, 0xff6b00, 0.3)
    trailGfx.setDepth(499)
    
    // 计算并绘制轨迹预览（虚线）
    const steps = 20
    for (let i = 0; i <= steps; i++) {
      const t = i / steps
      const time = flightTime * t
      // 使用正确的抛物线公式：y = y0 + vy*t - 0.5*g*t^2
      const px = startX + vx * time
      const py = startY + vy * time - 0.5 * gravity * time * time
      if (i === 0) {
        trailGfx.moveTo(px, py)
      } else {
        trailGfx.lineTo(px, py)
      }
    }
    trailGfx.strokePath()
    
    // 计算技能参数
    const r = 55 * this.skills.getRadiusMult('napalm') + lv * 4
    const ttl = (4.0 + lv * 0.5) * this.skills.getDurationMult('napalm')
    const pct = (0.05 + lv * 0.008) * this.skills.getDamageMult('napalm')
    const weaponFactor = this.getWeaponDamageFactor('napalm', lv)
    const baseInitialDmg = 30 + lv * 10
    const initialDmg = (baseInitialDmg + weaponFactor * this.player.damage) * this.skills.getDamageMult('napalm')
    
    // 添加到抛掷物数组
    this.napalmProjectiles.push({
      x: startX,
      y: startY,
      vx,
      vy,
      targetX,
      targetY,
      radius: r,
      ttl,
      pctPerSec: pct,
      initialDmg,
      lv,
      gfx: projectileGfx,
      trailGfx: trailGfx,
      flightTime: 0,
    })
  }
  
  /**
   * 创建燃油弹燃烧区域（当抛掷物落地时调用）
   */
  private createNapalmBurnZone(
    x: number,
    y: number,
    r: number,
    ttl: number,
    pct: number,
    initialDmg: number,
    lv: number
  ) {
    // 初始爆炸伤害：对范围内的敌人造成直接伤害
    for (const z of this.zombies) {
      const d = Math.hypot(z.x - x, z.y - y)
      if (d <= r) {
        const actualDmg = initialDmg * z.getDamageTakenMult(this.timeAliveSec)
        this.recordDamage('燃油弹', actualDmg)
        z.takeDamage(actualDmg)
        this.effectManager.showDamageNumber(z.x, z.y, actualDmg)
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
    this.effectManager.spawnExplosion(x, y, r * 0.6, 0xff6b00)
    this.effectManager.spawnFireParticles(x, y, r, 12 + lv * 2)
    
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
    const weaponFactor = this.getWeaponDamageFactor('ice_pierce', lv)
    const baseDmg = 18 + lv * 6
    const dmg = (baseDmg + weaponFactor * this.player.damage) * this.skills.getDamageMult('ice_pierce')
    const freezeChance = Math.min(0.6, 0.18 + lv * 0.04)
    const freezeSec = (1.2 + lv * 0.12) * this.skills.getDurationMult('ice_pierce')

    // 根据数量词条释放多次
    for (let i = 0; i < count; i++) {
      // 优先攻击最近的敌人，如果没有敌人则向随机方向发射
      let targetX = this.player.x
      let targetY = 0
      
      if (i === 0) {
        // 第一发：向最近的敌人
        const target = this.pickNearestZombie()
        if (target) {
          targetX = target.x
          targetY = target.y
        } else {
          // 没有敌人时，向随机方向发射
          targetX = Phaser.Math.Between(50, this.scale.width - 50)
        }
      } else {
        // 后续发射：向随机敌人或随机位置
        const aliveZombies = this.zombies.filter(z => z.hp > 0)
        if (aliveZombies.length > 0) {
          const randomTarget = aliveZombies[Math.floor(Math.random() * aliveZombies.length)]
          targetX = randomTarget.x
          targetY = randomTarget.y
        } else {
          targetX = Phaser.Math.Between(50, this.scale.width - 50)
        }
      }
      
      // 计算从玩家到目标的方向
      const dx = targetX - this.player.x
      const dy = targetY - this.player.y
      const dist = Math.hypot(dx, dy)
      const angle = Math.atan2(dy, dx)
      
      // 计算穿透路径的起点和终点（从玩家位置延伸到屏幕边缘或目标位置）
      const maxDist = Math.max(dist, Math.hypot(this.scale.width, this.scale.height))
      const startX = this.player.x
      const startY = this.player.y
      const endX = startX + Math.cos(angle) * maxDist
      const endY = startY + Math.sin(angle) * maxDist
      
      // 计算垂直于路径的偏移（用于宽度判定）
      const perpAngle = angle + Math.PI / 2
      const perpX = Math.cos(perpAngle)
      const perpY = Math.sin(perpAngle)

      // 伤害和冻结判定（沿路径检测，支持穿透）
      const pierce = 1  // 干冰弹默认穿透1（穿透路径，穿透表示可以穿透多少个敌人）
      const hit = new Set<number>()
      for (const z of this.zombies) {
        if (hit.size >= pierce) break  // 达到穿透上限
        if (hit.has(z.id)) continue  // 已命中过
        
        // 计算点到线段的距离
        const distToLine = this.distToLineSegment(z.x, z.y, startX, startY, endX, endY)
        if (distToLine <= width) {
          hit.add(z.id)
          const actualDmg = dmg * z.getDamageTakenMult(this.timeAliveSec)
          this.recordDamage('干冰弹', actualDmg)
          z.takeDamage(actualDmg)
          this.effectManager.showDamageNumber(z.x, z.y, actualDmg)
          if (Math.random() < freezeChance) {
            z.applyFreeze(this.timeAliveSec, freezeSec)
            // 冻结特效：在敌人周围显示冰晶
            this.effectManager.spawnFreezeEffect(z.x, z.y)
          }
        }
      }

      // 延迟释放特效
      const delay = i * 100
      this.time.delayedCall(delay, () => {
        // 冰弹轨迹特效：从玩家位置向目标方向发射的冰蓝色光束
        const g = this.add.graphics()
        
        // 绘制路径（使用多边形表示宽度）
        const p1x = startX + perpX * width * 0.5
        const p1y = startY + perpY * width * 0.5
        const p2x = startX - perpX * width * 0.5
        const p2y = startY - perpY * width * 0.5
        const p3x = endX - perpX * width * 0.5
        const p3y = endY - perpY * width * 0.5
        const p4x = endX + perpX * width * 0.5
        const p4y = endY + perpY * width * 0.5
        
        // 核心光束（亮蓝色）
        g.fillStyle(0x6bffea, 0.25)
        g.fillTriangle(p1x, p1y, p2x, p2y, p3x, p3y)
        g.fillTriangle(p1x, p1y, p3x, p3y, p4x, p4y)
        
        // 边缘光晕（淡蓝色）
        g.lineStyle(3, 0x6bffea, 0.6)
        g.lineBetween(p1x, p1y, p4x, p4y)
        g.lineBetween(p2x, p2y, p3x, p3y)
        
        // 中心高亮线
        g.lineStyle(2, 0xffffff, 0.8)
        g.lineBetween(startX, startY, endX, endY)
        
        // 冰晶粒子效果（沿轨迹生成）
        const particleCount = 8 + lv * 2
        for (let j = 0; j < particleCount; j++) {
          const t = j / particleCount
          const px = startX + (endX - startX) * t
          this.effectManager.spawnIceParticles(px, width * 0.5, 10, 1)
        }
        
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
    const ttl = (4.0 + lv * 0.22) * this.skills.getDurationMult('high_energy_ray')
    const weaponFactor = this.getWeaponDamageFactor('high_energy_ray', lv)
    const baseDps = 35 + lv * 10
    const dps = (baseDps + weaponFactor * this.player.damage) * this.skills.getDamageMult('high_energy_ray')

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
    const weaponFactor = this.getWeaponDamageFactor('guided_laser', lv)
    const baseDmg = 22 + lv * 7
    const dmg = (baseDmg + weaponFactor * this.player.damage) * this.skills.getDamageMult('guided_laser')

    const targets = [...this.zombies]
      .filter((z) => z.hp > 0)
      .sort((a, b) => a.hp - b.hp)
      .slice(0, count)
    
    if (targets.length === 0) return // 无敌人时不释放

    const g = this.add.graphics()
    // 绘制激光连接线（亮黄色，带光晕效果）
    for (const z of targets) {
      const actualDmg = dmg * z.getDamageTakenMult(this.timeAliveSec)
      this.recordDamage('制导激光', actualDmg)
      z.takeDamage(actualDmg)
      
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
   * 装甲车：召唤战车从防线向对面冲击，强力击退并造成伤害
   * 特效：车辆轨迹 + 撞击火花 + 尘土飞扬
   */
  private castArmoredCar(lv: number) {
    const count = 1 + this.skills.getCountBonus('armored_car')
    const weaponFactor = this.getWeaponDamageFactor('armored_car', lv)
    const baseDmg = 28 + lv * 8
    const dmg = (baseDmg + weaponFactor * this.player.damage) * this.skills.getDamageMult('armored_car')
    const kb = 120 + lv * 18
    const w = 18  // 宽度（横向尺寸）
    const h = 46  // 高度（竖向尺寸，车辆长度）
    
    // 从防线到屏幕顶部需要移动的距离
    const distanceToTop = this.defenseLineY  // 从520到0，需要移动520像素
    const vy = -130  // 向上移动速度（负值表示向上）
    // 计算到达屏幕顶部所需的时间（加上一些余量，确保到达顶部）
    const timeToTop = Math.abs(distanceToTop / vy) + 0.5  // 加上0.5秒余量
    const ttl = timeToTop * this.skills.getDurationMult('armored_car')
    
    // 根据数量词条释放多次
    for (let i = 0; i < count; i++) {
      // 每次释放稍微偏移X位置（横向分布）
      const offsetX = count > 1 ? (i - (count - 1) / 2) * 30 : 0
      const x = Phaser.Math.Clamp(this.player.x + offsetX, w, this.scale.width - w)
      
      // 从防线位置开始，向屏幕上方移动
      const startY = this.defenseLineY
      const gfx = this.add.graphics()
      
      // 延迟释放，避免重叠（飞行时间放慢50%，延迟增加100%）
      const delay = i * 400
      this.time.delayedCall(delay, () => {
        this.cars.push({ x, y: startY, vx: 0, vy, w, h, ttl, dmg, kb, hit: new Set<number>(), gfx })
        // 车辆出现特效：尘土和烟雾（从防线向上）
        this.spawnDustEffectVertical(x, startY)
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
    const weaponFactor = this.getWeaponDamageFactor('mini_vortex', lv)
    const baseDps = 12 + lv * 4
    const dps = (baseDps + weaponFactor * this.player.damage) * this.skills.getDamageMult('mini_vortex')
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
    const weaponFactor = this.getWeaponDamageFactor('air_blast', lv)
    const baseDmg = 15 + lv * 5
    const dmg = (baseDmg + weaponFactor * this.player.damage) * this.skills.getDamageMult('air_blast')
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
            const actualDmg = dmg * z.getDamageTakenMult(this.timeAliveSec)
            this.recordDamage('压缩气弹', actualDmg)
            z.takeDamage(actualDmg)
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
    const weaponFactor = this.getWeaponDamageFactor('carpet_bomb', lv)
    const baseDmg = 35 + lv * 10
    const dmg = (baseDmg + weaponFactor * this.player.damage) * this.skills.getDamageMult('carpet_bomb')

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
   * 电磁穿刺：随机雷劈，优先近点怪物，对敌人造成感电并提高其后续受伤
   * 特效：从天空到目标的闪电 + 圆形范围电击 + 感电标记
   * @param lv 技能等级
   * @param isChain 是否为连锁雷劈（连锁雷劈继承所有强化）
   */
  private castEmpPierce(lv: number, isChain: boolean = false) {
    // 计算基础数量
    const baseCount = 1 + this.skills.getCountBonus('emp_pierce')
    // 额外释放强化（只在非连锁时计算，连锁时继承）
    let extraCount = 0
    if (!isChain) {
      if (this.skills.getLevel('emp_pierce_extra_1') > 0) extraCount += 1
      if (this.skills.getLevel('emp_pierce_extra_2') > 0) extraCount += 2
    } else {
      // 连锁时继承额外释放强化
      if (this.skills.getLevel('emp_pierce_extra_1') > 0) extraCount += 1
      if (this.skills.getLevel('emp_pierce_extra_2') > 0) extraCount += 2
    }
    const totalCount = baseCount + extraCount
    
    const r = (18 + lv * 2) * this.skills.getRadiusMult('emp_pierce')  // 圆形范围半径
    const weaponFactor = this.getWeaponDamageFactor('emp_pierce', lv)
    const baseDmg = 20 + lv * 6
    let dmg = (baseDmg + weaponFactor * this.player.damage) * this.skills.getDamageMult('emp_pierce')
    // 电磁增伤80%强化（连锁时也继承）
    if (this.skills.getLevel('emp_pierce_electric_damage') > 0) {
      dmg *= 1.8
    }
    const shockMult = 1.2 + lv * 0.05
    const shockSec = (4.0 + lv * 0.2) * this.skills.getDurationMult('emp_pierce')
    const ttl = 0.3  // 闪电特效持续时间
    const hasExplosion = this.skills.getLevel('emp_pierce_explosion') > 0  // 连锁时也继承
    const explosionRadius = 25  // 爆炸范围
    const hasChain = this.skills.getLevel('emp_pierce_chain') > 0  // 连锁雷劈强化

    // 获取所有可攻击的僵尸，按距离排序（优先近点）
    const availableZombies = this.zombies
      .filter(z => z.hp > 0 && z.y < this.defenseLineY)
      .map(z => ({
        zombie: z,
        distance: Math.hypot(z.x - this.player.x, z.y - this.player.y),
      }))
      .sort((a, b) => a.distance - b.distance)  // 按距离排序，近的在前

    if (availableZombies.length === 0) return

    // 用于记录本次释放过程中是否有击杀（用于连锁雷劈，整个释放过程只触发一次）
    // 使用数组来存储每个雷劈的击杀状态，因为它们是异步执行的
    const killFlags: boolean[] = new Array(totalCount).fill(false)
    let chainTriggered = false  // 标记是否已经触发了连锁（防止多次触发）
    
    // 执行单次雷劈的内部函数
    const executeStrike = (targetIndex: number, delay: number = 0) => {
      this.time.delayedCall(delay, () => {
        // 重新获取可用僵尸（因为可能已经被之前的雷劈击杀）
        const currentAvailableZombies = this.zombies
          .filter(z => z.hp > 0 && z.y < this.defenseLineY)
          .map(z => ({
            zombie: z,
            distance: Math.hypot(z.x - this.player.x, z.y - this.player.y),
          }))
          .sort((a, b) => a.distance - b.distance)

        if (currentAvailableZombies.length === 0) return

        // 选择目标
        const poolSize = Math.max(1, Math.floor(currentAvailableZombies.length * 0.5))
        const pool = currentAvailableZombies.slice(0, poolSize)
        const selected = pool[Math.floor(Math.random() * pool.length)]
        const z = selected.zombie
        const strikeX = z.x
        const strikeY = z.y

        // 伤害和感电（圆形范围）
        let hasKilled = false  // 本次雷劈是否击杀了敌人
        for (const zombie of this.zombies) {
          const dist = Math.hypot(zombie.x - strikeX, zombie.y - strikeY)
          if (dist <= r) {
            const baseDmg = dmg
            const { finalDamage, isCrit } = this.damageCalculator.calculateDamageWithCritAndTalents(baseDmg, zombie, '电磁穿刺', 'electric')
            this.recordDamage('电磁穿刺', finalDamage)
            const oldHp = zombie.hp
            zombie.takeDamage(finalDamage)
            this.effectManager.showDamageNumber(zombie.x, zombie.y, finalDamage, isCrit)
            zombie.applyShock(this.timeAliveSec, shockSec, shockMult)
            // 感电特效：在敌人身上显示电光
            this.effectManager.spawnShockEffect(zombie.x, zombie.y)
            
            // 检查是否击杀
            if (oldHp > 0 && zombie.hp <= 0) {
              hasKilled = true
            }
          }
        }
        
        // 爆炸伤害（如果已解锁）
        if (hasExplosion) {
          for (const zombie of this.zombies) {
            const dist = Math.hypot(zombie.x - strikeX, zombie.y - strikeY)
            if (dist > r && dist <= r + explosionRadius) {
              // 爆炸伤害为原伤害的50%
              const explosionDmg = dmg * 0.5
              const baseDmg = explosionDmg
              const { finalDamage, isCrit } = this.damageCalculator.calculateDamageWithCritAndTalents(baseDmg, zombie, '电磁穿刺', 'electric')
              this.recordDamage('电磁穿刺', finalDamage)
              const oldHp = zombie.hp
              zombie.takeDamage(finalDamage)
              this.effectManager.showDamageNumber(zombie.x, zombie.y, finalDamage, isCrit)
              
              // 检查是否击杀
              if (oldHp > 0 && zombie.hp <= 0) {
                hasKilled = true
              }
            }
          }
          
          // 爆炸特效
          const explosionGfx = this.add.graphics()
          explosionGfx.lineStyle(2, 0xff6b00, 0.8)
          explosionGfx.strokeCircle(strikeX, strikeY, r + explosionRadius)
          explosionGfx.fillStyle(0xff6b00, 0.15)
          explosionGfx.fillCircle(strikeX, strikeY, r + explosionRadius)
          this.time.delayedCall(0.2, () => {
            explosionGfx.destroy()
          })
        }
        
        // 记录本次雷劈的击杀状态
        killFlags[targetIndex] = hasKilled

        // 闪电特效：从天空到目标
        const g = this.add.graphics()
        const skyY = -20  // 天空起始位置
        
        // 绘制锯齿状闪电路径（从天空到目标）
        // 外层电光（较粗，半透明，紫色）
        g.lineStyle(6, 0x9b6bff, 0.6)
        this.effectManager.drawLightningPath(g, strikeX, skyY, [{ x: strikeX, y: strikeY }])
        
        // 核心电光（较细，高亮度，白色）
        g.lineStyle(3, 0xffffff, 1.0)
        this.effectManager.drawLightningPath(g, strikeX, skyY, [{ x: strikeX, y: strikeY }])
        
        // 圆形范围电击特效
        g.lineStyle(1.5, 0xffff00, 0.8)
        g.strokeCircle(strikeX, strikeY, r)
        g.fillStyle(0xffff00, 0.2)
        g.fillCircle(strikeX, strikeY, r)
        
        // 中心电击点
        g.fillStyle(0xffffff, 1.0)
        g.fillCircle(strikeX, strikeY, 4)
        
        this.empStrikes.push({ x: strikeX, y: strikeY, r, ttl, dmg, shockMult, shockSec, gfx: g })
      })
    }

    // 执行所有雷劈，第一个立即执行，额外释放的有1秒间隔
    executeStrike(0, 0)  // 第一个立即执行
    
    // 额外释放：1秒间隔
    for (let i = 1; i < totalCount; i++) {
      executeStrike(i, 1 * i)  // 每个额外释放延迟1秒
    }
    
    // 连锁雷劈：等待所有雷劈执行完毕后，检查是否有击杀，只触发一次
    if (hasChain && totalCount > 0) {
      // 计算最后一个雷劈的延迟时间（最后一个雷劈的索引是 totalCount - 1）
      const lastStrikeDelay = (totalCount - 1) * 1  // 最后一个雷劈的延迟（秒）
      // 等待所有雷劈执行完毕 + 一个小缓冲（0.2秒），确保所有伤害和特效都处理完毕
      this.time.delayedCall((lastStrikeDelay + 0.2) * 1000, () => {
        // 检查是否有任何雷劈击杀了敌人
        const hasAnyKill = killFlags.some(killed => killed)
        if (hasAnyKill) {
          // 延迟一小段时间后释放连锁雷劈，避免无限递归
          this.time.delayedCall(0.1 * 1000, () => {
            this.castEmpPierce(lv, true)  // 连锁雷劈继承所有强化
          })
        }
      })
    }
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
    const weaponFactor = this.getWeaponDamageFactor('chain_electron', lv)
    const baseDmg = 18 + lv * 5
    const dmg = (baseDmg + weaponFactor * this.player.damage) * this.skills.getDamageMult('chain_electron')

    const hit = new Set<number>()
    const points: { x: number; y: number }[] = [{ x: start.x, y: start.y }]
    let cur: Zombie | null = start
    for (let i = 0; i < jumps && cur; i++) {
      hit.add(cur.id)
      const actualDmg = dmg * cur.getDamageTakenMult(this.timeAliveSec)
      this.recordDamage('跃迁电子', actualDmg)
      cur.takeDamage(actualDmg)
      // 电击特效：在每个目标上显示电击
      this.effectManager.spawnShockEffect(cur.x, cur.y)
      cur = this.findNextChainTarget(cur, hit, jumpR)
      if (cur) points.push({ x: cur.x, y: cur.y })
    }

    // 闪电链特效：从玩家到所有目标的闪电连接（锯齿状闪电）
    const g = this.add.graphics()
    // 外层电光（较粗，半透明）
    g.lineStyle(5, 0x6bffea, 0.5)
    this.effectManager.drawLightningPath(g, this.player.x, this.player.y, points)
    // 核心电光（较细，高亮度）
    g.lineStyle(3, 0xffffff, 0.9)
    this.effectManager.drawLightningPath(g, this.player.x, this.player.y, points)
    this.chainFx.push({ ttl: 0.18, gfx: g })
  }

  private gainExp(amount: number) {
    this.exp += amount
    let levelUps = 0
    // 计算可以连升多少级
    while (this.exp >= this.expNext) {
      this.exp -= this.expNext
      this.level += 1
      this.expNext = Math.floor(10 + this.level * 4)
      levelUps++
    }
    
    // 如果有升级，处理升级逻辑
    if (levelUps > 0) {
      this.pendingLevelUps += levelUps
      this.onLevelUp()
    }
    
    this.syncHud()
  }

  private onLevelUp() {
    // 如果已经在升级选择界面，不重复触发（等待当前选择完成）
    if (this.pausedForLevelUp) {
      return
    }
    
    // 暂停所有动画和时间
    this.pauseAllAnimations()
    
    // 开始升级流程
    this.pendingLevelUps--
    this.pausedForLevelUp = true
    const choices = this.skillPool.pick3Distinct(this.skills)
    this.showSkillChoice(choices)
  }
  
  /**
   * 暂停所有动画和时间
   */
  private pauseAllAnimations() {
    // 暂停所有 tweens
    this.tweens.pauseAll()
    // 暂停时间系统（这会暂停所有 time.delayedCall 等，但不影响场景本身）
    this.time.paused = true
  }
  
  /**
   * 恢复所有动画和时间
   */
  private resumeAllAnimations() {
    // 恢复时间系统
    this.time.paused = false
    // 恢复所有 tweens
    this.tweens.resumeAll()
  }

  private showSkillChoice(choices: SkillChoice[]) {
    if (this.skillUi) this.skillUi.destroy(true)

    // 主武器信息现在在canvas中渲染，深度999，低于技能选择界面1000，所以不需要隐藏

    const overlay = this.add.container(0, 0)
    overlay.setDepth(1000) // 确保技能选择界面在最上层
    const bg = this.add.rectangle(0, 0, this.scale.width, this.scale.height, 0x000000, 0.55).setOrigin(0)
    overlay.add(bg)

    // 显示当前是第几次升级（如果有连升多级）
    const levelUpText = this.pendingLevelUps > 0 
      ? `升级！选择一个技能（LV ${this.level}，还有 ${this.pendingLevelUps} 次升级待选择）`
      : `升级！选择一个技能（LV ${this.level}）`
    const title = this.add
      .text(this.scale.width / 2, 38, levelUpText, {
        fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif',
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
        fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif',
        fontSize: '13px',
        color: '#a9c1ff',
      })
      const desc = this.add.text(x + 8, y + 28, c.desc, {
        fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif',
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
        overlay.destroy(true)
        this.skillUi = null
        this.updateSkillsBar() // 更新技能状态栏
        
        // 检查是否还有待处理的升级
        if (this.pendingLevelUps > 0) {
          // 还有待升级，继续显示下一个技能选择界面
          this.onLevelUp()
        } else {
          // 所有升级完成，恢复游戏
          this.pausedForLevelUp = false
          this.resumeAllAnimations()
        }
        // 主武器信息现在在canvas中自动渲染，不需要手动恢复
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
    if (this.endlessMode) {
      // 无尽模式：限制增长，避免指数爆炸
      // 前20波：正常增长
      // 20波后：每5波增加1个（更平缓的增长）
      if (this.currentWave <= this.maxWaves) {
        const increase = Math.floor((this.currentWave - 1) * 0.5) // 每波增加0.5个（向下取整）
        return base + increase
      } else {
        // 20波后：每5波增加1个
        const extraWaves = this.currentWave - this.maxWaves
        const extraIncrease = Math.floor(extraWaves / 5) // 每5波增加1个
        const baseAt20 = base + Math.floor((this.maxWaves - 1) * 0.5)
        return baseAt20 + extraIncrease
      }
    } else {
      // 正常模式：每波增加0.5个（向下取整）
      const increase = Math.floor((this.currentWave - 1) * 0.5)
      return base + increase
    }
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
    
    // 速度增长：每10波才增加少量移速（每10波增加3%）
    // 公式：1.0 + Math.floor((currentWave - 1) / 10) * 0.03
    // 第1-10波：1.0倍，第11-20波：1.03倍，第21-30波：1.06倍
    const speedWaveTier = Math.floor((this.currentWave - 1) / 10)
    let speedScale = 1.0 + speedWaveTier * 0.03
    // 疯狂模式：怪物速度增加50%
    if (this.crazyMode) speedScale *= 1.5
    // 整体游戏节奏放慢50%
    speedScale *= 0.5
    
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
        size: def.size,
        elementResistance: def.elementResistance,
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
    let hpScale = 1.0 // Boss不再额外增强，使用基础血量
    // 疯狂模式：Boss血量加倍
    if (this.crazyMode) hpScale *= 2
    
    // Boss速度也遵循每10波增加规则
    const speedWaveTier = Math.floor((this.currentWave - 1) / 10)
    let speedScale = 1.0 + speedWaveTier * 0.03
    // 疯狂模式：Boss速度增加50%
    if (this.crazyMode) speedScale *= 1.5
    // 整体游戏节奏放慢50%
    speedScale *= 0.5
    
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
        size: def.size,
        elementResistance: def.elementResistance,
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
        fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif',
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
      fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif',
      fontSize: '28px',
      color: '#6bff95',
      stroke: '#000000',
      strokeThickness: 4,
    }).setOrigin(0.5)
    container.add(title)
    
    // 提示文字
    const hint = this.add.text(0, -30, '是否继续无尽模式？', {
      fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif',
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
      fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif',
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
      fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif',
      fontSize: '16px',
      color: '#ffffff',
    }).setOrigin(0.5)
    container.add([endBtn, endText])
  }

  private showVictory() {
    this.pausedForLevelUp = true
    this.add
      .text(this.scale.width / 2, this.scale.height / 2, 'VICTORY!', {
        fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif',
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
        fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif',
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

  /**
   * 更新燃油弹抛掷物（抛物线运动）
   */
  private stepNapalmProjectiles(dtSec: number) {
    const gravity = 400  // 重力加速度（像素/秒²）
    const keep: typeof this.napalmProjectiles = []
    
    for (const proj of this.napalmProjectiles) {
      // 更新飞行时间
      proj.flightTime += dtSec
      
      // 获取起始位置（从玩家位置）
      const startX = this.player.x
      const startY = this.player.y - 8
      
      // 更新位置（抛物线运动）
      // 使用正确的抛物线公式：x = x0 + vx*t, y = y0 + vy*t - 0.5*g*t^2
      proj.x = startX + proj.vx * proj.flightTime
      proj.y = startY + proj.vy * proj.flightTime - 0.5 * gravity * proj.flightTime * proj.flightTime
      
      // 更新图形位置
      proj.gfx.setPosition(proj.x, proj.y)
      
      // 更新轨迹线（动态更新，显示已飞行的路径）
      proj.trailGfx.clear()
      proj.trailGfx.lineStyle(1, 0xff6b00, 0.3)
      const steps = Math.max(2, Math.ceil(proj.flightTime * 30))  // 每帧一步
      let firstPoint = true
      for (let i = 0; i <= steps; i++) {
        const t = i / steps
        const time = proj.flightTime * t
        // 使用正确的抛物线公式：y = y0 + vy*t - 0.5*g*t^2
        const px = startX + proj.vx * time
        const py = startY + proj.vy * time - 0.5 * gravity * time * time
        if (firstPoint) {
          proj.trailGfx.moveTo(px, py)
          firstPoint = false
        } else {
          proj.trailGfx.lineTo(px, py)
        }
      }
      proj.trailGfx.strokePath()
      
      // 检查是否落地（飞行时间达到0.8秒或超出屏幕）
      const hasLanded = proj.flightTime >= 0.8 || proj.y > this.scale.height || proj.y < -50
      
      if (hasLanded) {
        // 落地：使用目标位置创建燃烧区域（确保在目标位置爆炸）
        const finalX = proj.flightTime >= 0.8 ? proj.targetX : proj.x
        const finalY = proj.flightTime >= 0.8 ? proj.targetY : proj.y
        this.createNapalmBurnZone(
          finalX,
          finalY,
          proj.radius,
          proj.ttl,
          proj.pctPerSec,
          proj.initialDmg,
          proj.lv
        )
        
        // 清理图形
        proj.gfx.destroy()
        proj.trailGfx.destroy()
      } else {
        keep.push(proj)
      }
    }
    
    this.napalmProjectiles = keep
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
        if (d <= b.w) {
          const actualDmg = b.dps * dtSec * z.getDamageTakenMult(this.timeAliveSec)
          this.recordDamage('高能射线', actualDmg)
          z.takeDamage(actualDmg)
        }
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
      // 竖向移动：从防线向上移动
      c.y += c.vy * dtSec

      // hit（竖向碰撞检测）
      for (const z of this.zombies) {
        if (c.hit.has(z.id)) continue
        // 检查X轴重叠（横向）
        if (Math.abs(z.x - c.x) > c.w) continue
        // 检查Y轴重叠（竖向，车辆从下往上移动）
        if (z.y > c.y || z.y < c.y - c.h) continue
        c.hit.add(z.id)
        const actualDmg = c.dmg * z.getDamageTakenMult(this.timeAliveSec)
        this.recordDamage('装甲车', actualDmg)
        z.takeDamage(actualDmg)
        z.knockUp(c.kb)
      }

      // 增强车辆绘制：多层效果 + 轨迹（竖向）
      c.gfx.clear()
      // 车辆阴影
      c.gfx.fillStyle(0x0c0f14, 0.3)
      c.gfx.fillRoundedRect(c.x - c.w / 2 + 2, c.y - c.h + 2, c.w, c.h, 4)
      // 车辆主体
      c.gfx.fillStyle(0xa9c1ff, 0.9)
      c.gfx.fillRoundedRect(c.x - c.w / 2, c.y - c.h, c.w, c.h, 4)
      // 车辆边框
      c.gfx.lineStyle(2, 0x0c0f14, 0.8)
      c.gfx.strokeRoundedRect(c.x - c.w / 2, c.y - c.h, c.w, c.h, 4)
      // 车辆高光
      c.gfx.lineStyle(1, 0xffffff, 0.5)
      c.gfx.strokeRoundedRect(c.x - c.w / 2 + 1, c.y - c.h - 1, c.w - 2, c.h - 2, 3)
      
      // 撞击时生成火花
      if (c.hit.size > 0 && Math.random() < 0.3) {
        this.effectManager.spawnFireParticles(c.x, c.y, 8, 3)
      }

      // 超出屏幕上方或时间到则销毁
      if (c.ttl <= 0 || c.y < -80) {
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
        const actualDmg = v.dps * dtSec * z.getDamageTakenMult(this.timeAliveSec)
        this.recordDamage('旋风加农', actualDmg)
        z.takeDamage(actualDmg)
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
        if (d <= b.r) {
          const actualDmg = b.dmg * z.getDamageTakenMult(this.timeAliveSec)
          this.recordDamage('空投轰炸', actualDmg)
          z.takeDamage(actualDmg)
        }
      }
      // 增强爆炸特效：多层爆炸 + 火焰粒子
      this.effectManager.spawnExplosion(b.x, b.y, b.r, 0xff6b6b)
      this.spawnFireParticles(b.x, b.y, b.r, 12)
    }
    this.pendingBombs = keep
  }

  private stepIceFogs(dtSec: number) {
    const keep: typeof this.iceFogs = []
    for (const f of this.iceFogs) {
      f.ttl -= dtSec
      
      // 计算伤害（基于技能等级，每0.5秒造成一次伤害）
      // 伤害值：基础15 + 等级*5，每秒伤害
      const lv = this.skills.getLevel('ice_storm')
      const weaponFactor = this.getWeaponDamageFactor('ice_storm', lv)
      const baseDps = 15 + lv * 5
      const dps = (baseDps + weaponFactor * this.player.damage) * this.skills.getDamageMult('ice_storm')
      const dmgPerTick = dps * dtSec
      
      for (const z of this.zombies) {
        const d = Math.hypot(z.x - f.x, z.y - f.y)
        if (d <= f.r) {
          // 持续伤害
          const actualDmg = dmgPerTick * z.getDamageTakenMult(this.timeAliveSec)
          this.recordDamage('冰暴发生器', actualDmg)
          z.takeDamage(actualDmg)
          // 持续冻结
          z.applyFreeze(this.timeAliveSec, f.freezeSec)
        }
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

  private stepEmpStrikes(dtSec: number) {
    const keep: typeof this.empStrikes = []
    for (const strike of this.empStrikes) {
      strike.ttl -= dtSec
      const alpha = Math.max(0, strike.ttl / 0.3)
      strike.gfx.setAlpha(alpha)
      if (strike.ttl <= 0) {
        strike.gfx.destroy()
        continue
      }
      keep.push(strike)
    }
    this.empStrikes = keep
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
    // 从第5波开始，有20%概率出现属性抗性僵尸
    const waveProgress = (this.currentWave - 1) / (this.maxWaves - 1)
    const wSpitter = Phaser.Math.Clamp(waveProgress * 0.4, 0, 0.38)
    const wBrute = Phaser.Math.Clamp(waveProgress * 0.3, 0, 0.28)
    const wWalker = Math.max(0.05, 1 - wSpitter - wBrute)
    
    // 从第5波开始，有20%概率出现属性抗性僵尸
    const wResistant = this.currentWave >= 5 ? 0.2 : 0
    const totalBase = wWalker + wBrute + wSpitter
    const total = totalBase + wResistant

    const r = Math.random() * total
    if (r < wWalker) return 'walker'
    if (r < wWalker + wBrute) return 'brute'
    if (r < wWalker + wBrute + wSpitter) return 'spitter'
    
    // 属性抗性僵尸（随机选择一种）
    const resistantKinds: ZombieKind[] = [
      'wind_resistant', 'fire_resistant', 'electric_resistant',
      'energy_resistant', 'ice_resistant', 'physical_resistant'
    ]
    return resistantKinds[Math.floor(Math.random() * resistantKinds.length)]
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
    
    // 更新怪物图鉴（显示当前波次下的实际属性）
    this.updateBestiary()
    // 注意：主武器信息现在通过 drawWeaponInfo() 在canvas中渲染
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
    
    // 速度增长：每10波才增加少量移速
    const speedWaveTier = Math.floor((this.currentWave - 1) / 10)
    let speedScale = 1.0 + speedWaveTier * 0.03
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

      // 更新体型显示（体型不会随波次变化，始终显示基础值）
      const sizeStat = item.querySelector('.bestiary-item-stats .bestiary-item-stat:nth-child(3)')
      if (sizeStat) {
        sizeStat.textContent = `体型: ${def.size}`
      }
    })
  }

  /**
   * 在canvas内绘制主武器信息（左上角，深度999，常显示，无边框）
   */
  private drawWeaponInfo() {
    this.weaponInfoGfx.clear() // 不再绘制背景和边框，只清理
    
    const bulletSpreadLevel = this.skills.getLevel('bullet_spread')
    const rapidFireLevel = this.skills.rapidFireCount
    const spreadBulletCount = 1 + bulletSpreadLevel  // 散射子弹数：0级=1发，1级=2发...
    const burstCount = 1 + rapidFireLevel  // 连发数量：0级=1发，1级=2发...
    const spreadDeg = (this.skills.spreadRad * 180 / Math.PI).toFixed(0)
    // 计算实际伤害（应用增伤倍率）
    const damage = this.player.damage * this.skills.weaponDamageMult
    
    // 计算射速（每秒射击次数）
    const fireRateMult = this.skills.fireRateMult
    const actualFireInterval = this.player.fireIntervalSec / fireRateMult
    const fireRate = (1 / actualFireInterval).toFixed(1)
    
    // 射程
    const range = Math.round(this.player.range)
    
    // 分裂信息
    const split2Count = this.skills.split2Count
    const split4Count = this.skills.split4Count
    let splitText = '无'
    if (split4Count > 0) {
      splitText = `1→4 (Lv.${split4Count})`
    } else if (split2Count > 0) {
      splitText = `1→2 (Lv.${split2Count})`
    }
    
    // 穿透信息
    const pierce = this.skills.weaponPierce
    
    // 暴击信息
    const critChance = (this.player.critChance * 100).toFixed(1)  // 转换为百分比，保留1位小数
    const critDamageMult = (this.player.critDamageMult * 100).toFixed(0)  // 转换为百分比
    
    // 移动端检测
    const isMobile = this.scale.width <= 768
    const isSmallMobile = this.scale.width <= 480
    
    // 根据屏幕尺寸调整参数
    const x = isMobile ? 4 : 12
    const y = isMobile ? 100 : 120
    const lineHeight = isSmallMobile ? 10 : (isMobile ? 12 : 14)
    const fontSize = isSmallMobile ? 8 : (isMobile ? 9 : 10)
    const normalFont = 'SimSun, 宋体, serif'  // 使用清晰的宋体
    
    // 清理旧文本
    this.weaponInfoTexts.forEach(t => t.destroy())
    this.weaponInfoTexts = []
    
    let currentY = y
    
    // 标题
    const title = this.add.text(x, currentY, '主武器', {
      fontSize: `${fontSize + 1}px`,
      color: '#6bff95',
      fontFamily: normalFont,
      fontStyle: 'bold',
      resolution: 2,  // 高清渲染（2倍分辨率）
    }).setOrigin(0, 0).setDepth(999)
    this.weaponInfoTexts.push(title)
    currentY += lineHeight + 2
    
    // 散射信息
    const spreadText = `散射: Lv.${bulletSpreadLevel} (${spreadDeg}°)`
    const spreadObj = this.add.text(x, currentY, spreadText, {
      fontSize: `${fontSize}px`,
      color: '#e8f0ff',
      fontFamily: normalFont,
      fontStyle: 'bold',
      resolution: 2,  // 高清渲染（2倍分辨率）
    }).setOrigin(0, 0).setDepth(999)
    this.weaponInfoTexts.push(spreadObj)
    currentY += lineHeight
    
    // 连发信息
    const countText = `连发: ${burstCount}`
    const countObj = this.add.text(x, currentY, countText, {
      fontSize: `${fontSize}px`,
      color: '#e8f0ff',
      fontFamily: normalFont,
      fontStyle: 'bold',
      resolution: 2,  // 高清渲染（2倍分辨率）
    }).setOrigin(0, 0).setDepth(999)
    this.weaponInfoTexts.push(countObj)
    currentY += lineHeight
    
    // 伤害信息
    const damageText = `伤害: ${damage}`
    const damageObj = this.add.text(x, currentY, damageText, {
      fontSize: `${fontSize}px`,
      color: '#e8f0ff',
      fontFamily: normalFont,
      fontStyle: 'bold',
      resolution: 2,  // 高清渲染（2倍分辨率）
    }).setOrigin(0, 0).setDepth(999)
    this.weaponInfoTexts.push(damageObj)
    currentY += lineHeight
    
    // 射速信息
    const fireRateText = `射速: ${fireRate}/s`
    const fireRateObj = this.add.text(x, currentY, fireRateText, {
      fontSize: `${fontSize}px`,
      color: '#e8f0ff',
      fontFamily: normalFont,
      fontStyle: 'bold',
      resolution: 2,  // 高清渲染（2倍分辨率）
    }).setOrigin(0, 0).setDepth(999)
    this.weaponInfoTexts.push(fireRateObj)
    currentY += lineHeight
    
    // 射程信息
    const rangeText = `射程: ${range}px`
    const rangeObj = this.add.text(x, currentY, rangeText, {
      fontSize: `${fontSize}px`,
      color: '#e8f0ff',
      fontFamily: normalFont,
      fontStyle: 'bold',
      resolution: 2,  // 高清渲染（2倍分辨率）
    }).setOrigin(0, 0).setDepth(999)
    this.weaponInfoTexts.push(rangeObj)
    currentY += lineHeight
    
    // 分裂信息
    const splitTextObj = this.add.text(x, currentY, `分裂: ${splitText}`, {
      fontSize: `${fontSize}px`,
      color: '#e8f0ff',
      fontFamily: normalFont,
      fontStyle: 'bold',
      resolution: 2,  // 高清渲染（2倍分辨率）
    }).setOrigin(0, 0).setDepth(999)
    this.weaponInfoTexts.push(splitTextObj)
    currentY += lineHeight
    
    // 穿透信息
    const pierceTextObj = this.add.text(x, currentY, `穿透: ${pierce}`, {
      fontSize: `${fontSize}px`,
      color: '#e8f0ff',
      fontFamily: normalFont,
      fontStyle: 'bold',
      resolution: 2,  // 高清渲染（2倍分辨率）
    }).setOrigin(0, 0).setDepth(999)
    this.weaponInfoTexts.push(pierceTextObj)
    currentY += lineHeight
    
    // 暴击信息
    const critText = `暴击: ${critChance}% (${critDamageMult}%伤害)`
    const critObj = this.add.text(x, currentY, critText, {
      fontSize: `${fontSize}px`,
      color: '#ffd700',  // 金色，突出暴击属性
      fontFamily: normalFont,
      fontStyle: 'bold',
      resolution: 2,  // 高清渲染（2倍分辨率）
    }).setOrigin(0, 0).setDepth(999)
    this.weaponInfoTexts.push(critObj)
  }

  /**
   * 记录伤害统计
   */
  private recordDamage(source: string, amount: number) {
    if (amount <= 0) return
    const current = this.damageStats.get(source) || 0
    this.damageStats.set(source, current + amount)
    this.totalDamage += amount
    // 伤害统计现在在update中每帧绘制，不需要定时器
  }

  private damageStatsUpdateTimer: Phaser.Time.TimerEvent | null = null

  /**
   * 更新伤害统计显示（DOM方式）
   */
  private updateDamageStats() {
    const damageStatsList = document.getElementById('damage-stats-list')
    if (!damageStatsList) return
    
    if (this.totalDamage === 0) {
      damageStatsList.innerHTML = ''
      return
    }
    
    // 按伤害排序
    const sorted = Array.from(this.damageStats.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8) // 最多显示8项
    
    if (sorted.length === 0) {
      damageStatsList.innerHTML = ''
      return
    }
    
    // 更新DOM
    damageStatsList.innerHTML = sorted.map(([source, damage]) => {
      const percent = ((damage / this.totalDamage) * 100).toFixed(1)
      const damageText = damage >= 1000 ? `${(damage / 1000).toFixed(1)}k` : Math.floor(damage).toString()
      
      return `
        <div class="damage-stats-item">
          <span class="damage-stats-item-name">${source}</span>
          <span class="damage-stats-item-damage">${damageText}</span>
          <span class="damage-stats-item-percent">${percent}%</span>
        </div>
      `
    }).join('')
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
        // 提高龙卷风DPS：基础值从3提高到15，每级从1.2提高到6
        const dps = (15 + lv * 6) * this.skills.getDamageMult('tornado')
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
        const spreadLevel = this.skills.getLevel('bullet_spread')
        const count = 1 + spreadLevel  // 散射子弹数
        const spreadDeg = (this.skills.spreadRad * 180 / Math.PI).toFixed(0)
        stats.push(`子弹数: ${count}`, `散射角: ${spreadDeg}°`)
        break
      }
    }

    return stats.join(' | ')
  }

  /**
   * 更新技能状态栏（DOM方式）
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
      
      // 添加按住显示范围的功能
      if (def.range) {
        mainItem.style.cursor = 'pointer'
        mainItem.style.userSelect = 'none'
        
        // 鼠标按下/触摸按下：显示范围
        const showRange = () => {
          this.showSkillRange(skillId, level)
        }
        
        // 鼠标松开/触摸松开：隐藏范围
        const hideRange = () => {
          this.hideSkillRange()
        }
        
        // 桌面端：鼠标事件
        mainItem.addEventListener('mousedown', showRange)
        mainItem.addEventListener('mouseup', hideRange)
        mainItem.addEventListener('mouseleave', hideRange)  // 鼠标移出也隐藏
        
        // 移动端：触摸事件
        mainItem.addEventListener('touchstart', (e) => {
          e.preventDefault()
          showRange()
        })
        mainItem.addEventListener('touchend', (e) => {
          e.preventDefault()
          hideRange()
        })
        mainItem.addEventListener('touchcancel', (e) => {
          e.preventDefault()
          hideRange()
        })
      }
      
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

  /**
   * 检查技能触发范围内是否有敌人
   * 注意：这是"触发范围"（用于判断是否可以释放技能），不是"效果范围"（实际作用范围）
   * 例如：装甲车的触发范围是弧形范围，但实际效果是装甲车会一直移动到屏幕尽头
   */
  private hasEnemyInSkillRange(skillId: MainSkillId, level: number): boolean {
    const range = this.getSkillTriggerRange(skillId, level)
    if (!range) return true // 如果没有定义范围，允许触发（向后兼容）
    
    const cx = this.player.x
    const cy = this.player.y
    
    // 检查每个敌人是否在范围内
    for (const z of this.zombies) {
      if (z.hp <= 0) continue
      
      const dx = z.x - cx
      const dy = z.y - cy
      const dist = Math.hypot(dx, dy)
      const angle = Math.atan2(dy, dx)
      
      // 所有主技能都使用弧形范围（arcRange）
      if (range.type === 'arcRange') {
        // 弧形范围：检查距离和角度
        if (dist > range.radius) continue
        // 检查角度是否在允许范围内（类似玩家射程）
        const blind = Math.PI * 2 * (1 - range.anglePercent)
        const blindCenter = Math.PI / 2  // 盲区朝下
        const angleDiff = this.angleDiff(angle, blindCenter)
        if (Math.abs(angleDiff) <= blind / 2) continue  // 在盲区内
        return true  // 找到范围内敌人
      }
      
      // 向后兼容其他类型（理论上不应该到达这里）
      switch (range.type) {
        case 'circle': {
          if (dist <= range.radius) return true
          break
        }
        case 'rect': {
          if (Math.abs(z.x - cx) <= range.width / 2 && Math.abs(z.y - cy) <= range.height / 2) {
            return true
          }
          break
        }
        case 'line': {
          if (Math.abs(z.x - cx) <= range.width / 2 && z.y >= cy - range.length && z.y <= cy) {
            return true
          }
          break
        }
        case 'arc': {
          if (dist > range.radius) continue
          const startAngle = -Math.PI / 2 - range.angle / 2
          const endAngle = -Math.PI / 2 + range.angle / 2
          if (angle >= startAngle && angle <= endAngle) return true
          break
        }
      }
    }
    
    return false  // 范围内没有敌人
  }

  /**
   * 获取技能的触发范围（用于判断是否可以释放技能）
   * 
   * 注意：这是"触发范围"，不是"效果范围"
   * - 触发范围：用于判断范围内是否有敌人，如果有才允许释放技能
   * - 效果范围：技能的实际作用范围，可能比触发范围大得多
   *   例如：
   *   - 装甲车：触发范围是弧形范围，但实际效果是装甲车会一直移动到屏幕尽头
   *   - 温压弹：触发范围是弧形范围，但实际效果是飞行到目标位置后爆炸
   *   - 干冰弹：触发范围是弧形范围，但实际效果是直线穿透到屏幕尽头
   * 
   * 所有主技能默认使用弧形范围，半径为玩家触发范围 * 0.9
   */
  private getSkillTriggerRange(skillId: MainSkillId, level: number): import('../skills/skillDefs').SkillRange | null {
    const def = SKILL_DEFS[skillId]
    if (!def) return null
    
    const radiusMult = this.skills.getRadiusMult(skillId)
    // 所有主技能默认使用玩家触发范围 * 0.9 作为基础半径
    const baseRadius = this.player.range * 0.9 * radiusMult
    
    // 所有主技能都使用弧形范围（80%圆弧，保留20%盲区朝下，与玩家射程一致）
    return { type: 'arcRange', radius: baseRadius, anglePercent: 0.8 }
  }
  
  /**
   * 获取技能的实际释放范围（已废弃，重命名为 getSkillTriggerRange）
   * @deprecated 使用 getSkillTriggerRange 代替
   */
  private getSkillActualRange(skillId: MainSkillId, level: number): import('../skills/skillDefs').SkillRange | null {
    return this.getSkillTriggerRange(skillId, level)
  }

  /**
   * 显示技能触发范围（虚线弧形范围）
   * 注意：这只是触发范围，用于判断是否可以释放技能
   * 实际效果范围可能更大（如装甲车会移动到屏幕尽头）
   */
  showSkillRange(skillId: MainSkillId, level: number) {
    const range = this.getSkillTriggerRange(skillId, level)
    if (!range) return
    
    this.skillRangeGfx.setVisible(true)
    this.drawSkillRange(range, skillId)
  }

  /**
   * 隐藏技能释放范围
   */
  hideSkillRange() {
    this.skillRangeGfx.setVisible(false)
    this.skillRangeGfx.clear()
  }

  /**
   * 绘制技能触发范围（虚线弧形范围）
   * 注意：这只是触发范围，用于判断是否可以释放技能
   * 实际效果范围可能更大（如装甲车会移动到屏幕尽头）
   */
  private drawSkillRange(range: import('../skills/skillDefs').SkillRange, skillId: MainSkillId) {
    this.skillRangeGfx.clear()
    
    // 设置虚线样式
    this.skillRangeGfx.lineStyle(2, 0x6bffea, 0.8)
    
    // 绘制虚线辅助函数
    const drawDashedLine = (x1: number, y1: number, x2: number, y2: number, dashLength = 5, gapLength = 5) => {
      const dx = x2 - x1
      const dy = y2 - y1
      const dist = Math.hypot(dx, dy)
      const angle = Math.atan2(dy, dx)
      const dashDist = dashLength + gapLength
      let currentDist = 0
      
      while (currentDist < dist) {
        const startDist = currentDist
        const endDist = Math.min(currentDist + dashLength, dist)
        
        const startX = x1 + Math.cos(angle) * startDist
        const startY = y1 + Math.sin(angle) * startDist
        const endX = x1 + Math.cos(angle) * endDist
        const endY = y1 + Math.sin(angle) * endDist
        
        this.skillRangeGfx.lineBetween(startX, startY, endX, endY)
        currentDist += dashDist
      }
    }
    
    const drawDashedCircle = (x: number, y: number, radius: number, dashLength = 5, gapLength = 5) => {
      const segments = Math.ceil((2 * Math.PI * radius) / (dashLength + gapLength))
      const angleStep = (2 * Math.PI) / segments
      
      for (let i = 0; i < segments; i++) {
        const angle1 = i * angleStep
        const angle2 = (i + 0.5) * angleStep  // 只绘制一半作为虚线
        
        const x1 = x + Math.cos(angle1) * radius
        const y1 = y + Math.sin(angle1) * radius
        const x2 = x + Math.cos(angle2) * radius
        const y2 = y + Math.sin(angle2) * radius
        
        this.skillRangeGfx.lineBetween(x1, y1, x2, y2)
      }
    }
    
    // 所有主技能都使用弧形范围（arcRange）
    if (range.type === 'arcRange') {
      // 弧形范围：类似玩家射程指示器，80%圆弧（保留20%盲区朝下）
      const radius = range.radius
      const cx = this.player.x
      const cy = this.player.y
      const anglePercent = range.anglePercent || 0.8
      
      const blind = Math.PI * 2 * (1 - anglePercent)
      const blindCenter = Math.PI / 2  // 盲区朝下
      const start = blindCenter + blind / 2
      const end = blindCenter - blind / 2 + Math.PI * 2  // wrap
      
      // 使用虚线绘制弧形
      this.strokeDashedArc(this.skillRangeGfx, cx, cy, radius, start, end, 0.09, 0.06)
      return
    }
    
    // 向后兼容其他类型（理论上不应该到达这里）
    switch (range.type) {
      case 'circle': {
        const centerX = this.player.x
        const centerY = this.player.y
        drawDashedCircle(centerX, centerY, range.radius)
        break
      }
      case 'rect': {
        const x = this.player.x
        const y = this.player.y
        const left = x - range.width / 2
        const right = x + range.width / 2
        const top = y - range.height / 2
        const bottom = y + range.height / 2
        drawDashedLine(left, top, right, top)
        drawDashedLine(right, top, right, bottom)
        drawDashedLine(right, bottom, left, bottom)
        drawDashedLine(left, bottom, left, top)
        break
      }
      case 'line': {
        const x = this.player.x
        const y = this.player.y
        const w = range.width
        const len = range.length
        const left = x - w / 2
        const right = x + w / 2
        const top = y - len
        const bottom = y
        drawDashedLine(left, top, right, top)
        drawDashedLine(right, top, right, bottom)
        drawDashedLine(right, bottom, left, bottom)
        drawDashedLine(left, bottom, left, top)
        break
      }
      case 'arc': {
        const centerX = this.player.x
        const centerY = this.player.y
        const startAngle = -Math.PI / 2 - range.angle / 2
        const endAngle = -Math.PI / 2 + range.angle / 2
        const segments = 32
        const angleStep = (endAngle - startAngle) / segments
        
        // 绘制圆弧
        for (let i = 0; i < segments; i++) {
          const angle1 = startAngle + i * angleStep
          const angle2 = startAngle + (i + 0.5) * angleStep
          const x1 = centerX + Math.cos(angle1) * range.radius
          const y1 = centerY + Math.sin(angle1) * range.radius
          const x2 = centerX + Math.cos(angle2) * range.radius
          const y2 = centerY + Math.sin(angle2) * range.radius
          this.skillRangeGfx.lineBetween(x1, y1, x2, y2)
        }
        
        // 绘制两条边
        drawDashedLine(centerX, centerY, centerX + Math.cos(startAngle) * range.radius, centerY + Math.sin(startAngle) * range.radius)
        drawDashedLine(centerX, centerY, centerX + Math.cos(endAngle) * range.radius, centerY + Math.sin(endAngle) * range.radius)
        break
      }
    }
  }

  // ===== 粒子特效辅助方法 =====

  /**
   * 绘制锯齿状闪电路径（用于闪电链特效）
   */
  // drawLightningPath 已移至 EffectManager

  /**
   * 生成飞行轨迹动画
   */
  private spawnProjectileTrail(
    fromX: number, 
    fromY: number, 
    toX: number, 
    toY: number, 
    duration: number, 
    color1: number, 
    color2: number
  ) {
    const trailGfx = this.add.graphics()
    const dx = toX - fromX
    const dy = toY - fromY
    const dist = Math.hypot(dx, dy)
    const angle = Math.atan2(dy, dx)
    
    // 创建轨迹动画
    let progress = 0
    const stepTime = 16  // 约60fps
    const steps = Math.ceil((duration * 1000) / stepTime)
    const stepProgress = 1 / steps
    
    const updateTrail = () => {
      trailGfx.clear()
      const currentDist = dist * progress
      const currentX = fromX + Math.cos(angle) * currentDist
      const currentY = fromY + Math.sin(angle) * currentDist
      
      // 绘制轨迹（从起点到当前位置）
      trailGfx.lineStyle(4, color1, 0.5)
      trailGfx.lineBetween(fromX, fromY, currentX, currentY)
      trailGfx.lineStyle(2, color2, 0.8)
      trailGfx.lineBetween(fromX, fromY, currentX, currentY)
      
      // 绘制轨迹头部（亮点）
      trailGfx.fillStyle(color2, 0.9)
      trailGfx.fillCircle(currentX, currentY, 4)
      
      progress += stepProgress
      if (progress < 1) {
        this.time.delayedCall(stepTime, updateTrail)
      } else {
        trailGfx.destroy()
      }
    }
    
    updateTrail()
  }

  /**
   * 立即分裂：向固定方向发射指定个数的次级子弹
   * @param startX 起始X坐标
   * @param startY 起始Y坐标
   * @param baseAngle 基础角度（主子弹方向）
   * @param baseDamage 基础伤害值
   * @param hitTarget 被命中的目标（次级子弹会避开它，除非体型>3）
   */
  private spawnBulletSplitImmediate(startX: number, startY: number, baseAngle: number, baseDamage: number, hitTarget?: Zombie) {
    const split2Count = this.skills.split2Count
    const split4Count = this.skills.split4Count
    
    // 获取被命中目标的ID（如果存在且体型<=3，次级子弹会避开它）
    const excludedTargetId = hitTarget && hitTarget.size <= 3 ? hitTarget.id : undefined
    
    // 计算分裂位置偏移：让次级子弹从稍微分散的位置出发，避免重叠
    // 根据目标体型调整偏移距离，体型越大偏移越大
    const splitOffsetRadius = hitTarget ? Math.max(hitTarget.size * 4, 10) : 10
    
    // 查找附近的敌人，用于优先朝向敌人方向分裂
    const nearbyZombies: Array<{ zombie: Zombie, angle: number, distance: number }> = []
    const searchRadius = this.player.range * 0.8  // 搜索半径为主武器射程的80%
    
    for (const z of this.zombies) {
      if (z.hp <= 0 || !z.isAlive()) continue
      if (excludedTargetId !== undefined && z.id === excludedTargetId && z.size <= 3) continue
      
      const dx = z.x - startX
      const dy = z.y - startY
      const distance = Math.hypot(dx, dy)
      
      if (distance <= searchRadius && distance > 0) {
        const angle = Math.atan2(dy, dx)
        nearbyZombies.push({ zombie: z, angle, distance })
      }
    }
    
    // 优先使用 split4Count（如果已解锁），否则使用 split2Count
    // 每级增加分裂次数（每级+1次分裂机会）
    if (split4Count > 0) {
      // 1->4：向4个方向分裂，每级+1次分裂
      for (let level = 0; level < split4Count; level++) {
        // 计算4个基础分裂方向
        const baseSplitAngles: number[] = []
        for (let i = 0; i < 4; i++) {
          baseSplitAngles.push(baseAngle + (Math.PI * 2 / 4) * i)
        }
        
        // 如果有附近敌人，调整分裂方向优先朝向敌人
        const adjustedAngles = this.adjustSplitAnglesToTargets(baseSplitAngles, nearbyZombies, startX, startY)
        
        // 每次分裂成4发
        for (let i = 0; i < 4; i++) {
          const splitAngle = adjustedAngles[i]
          // 分裂位置稍微偏移：沿着分裂方向的反方向偏移，让子弹从目标边缘出发
          const offsetAngle = splitAngle + Math.PI  // 反方向偏移
          const offsetX = startX + Math.cos(offsetAngle) * splitOffsetRadius
          const offsetY = startY + Math.sin(offsetAngle) * splitOffsetRadius
          
          const speed = BattleScene.SECONDARY_BULLET_SPEED
          const vx = Math.cos(splitAngle) * speed
          const vy = Math.sin(splitAngle) * speed
          
          // 次级子弹伤害继承主子弹的50%（4发时伤害更低）
          const secondaryDamage = baseDamage * 0.5
          
          this.secondaryBullets.push(
            new SecondaryBullet(this, {
              x: offsetX,
              y: offsetY,
              vx,
              vy,
              damage: secondaryDamage,
              maxDistance: this.player.range * 0.6,  // 次级子弹射程为60%
              splitLevel: 0,
              excludedTargetId,
            })
          )
        }
      }
    } else if (split2Count > 0) {
      // 1->2：向2个方向分裂，每级+1次分裂
      for (let level = 0; level < split2Count; level++) {
        // 计算2个基础分裂方向（垂直于主子弹方向）
        const baseSplitAngles: number[] = [
          baseAngle - Math.PI / 2,
          baseAngle + Math.PI / 2
        ]
        
        // 如果有附近敌人，调整分裂方向优先朝向敌人
        const adjustedAngles = this.adjustSplitAnglesToTargets(baseSplitAngles, nearbyZombies, startX, startY)
        
        // 每次分裂成2发
        for (let i = 0; i < 2; i++) {
          const splitAngle = adjustedAngles[i]
          // 分裂位置稍微偏移：沿着分裂方向的反方向偏移，让子弹从目标边缘出发
          const offsetAngle = splitAngle + Math.PI  // 反方向偏移
          const offsetX = startX + Math.cos(offsetAngle) * splitOffsetRadius
          const offsetY = startY + Math.sin(offsetAngle) * splitOffsetRadius
          
          const speed = BattleScene.SECONDARY_BULLET_SPEED
          const vx = Math.cos(splitAngle) * speed
          const vy = Math.sin(splitAngle) * speed
          
          // 次级子弹伤害继承主子弹的60%
          const secondaryDamage = baseDamage * 0.6
          
          this.secondaryBullets.push(
            new SecondaryBullet(this, {
              x: offsetX,
              y: offsetY,
              vx,
              vy,
              damage: secondaryDamage,
              maxDistance: this.player.range * 0.6,  // 次级子弹射程为60%
              splitLevel: 0,
              excludedTargetId,
            })
          )
        }
      }
    }
  }
  
  /**
   * 调整分裂角度，每个方向独立寻找最近的敌人
   * @param baseAngles 基础分裂角度数组
   * @param nearbyZombies 附近的敌人列表
   * @param startX 分裂起始X坐标
   * @param startY 分裂起始Y坐标
   * @returns 调整后的角度数组
   */
  private adjustSplitAnglesToTargets(
    baseAngles: number[],
    nearbyZombies: Array<{ zombie: Zombie, angle: number, distance: number }>,
    startX: number,
    startY: number
  ): number[] {
    if (nearbyZombies.length === 0) {
      // 没有敌人，使用基础角度
      return baseAngles
    }
    
    // 按距离排序，优先考虑近的敌人
    const sortedZombies = [...nearbyZombies].sort((a, b) => a.distance - b.distance)
    
    // 为每个分裂方向独立寻找最近的敌人
    const adjustedAngles: number[] = []
    const usedZombieIds = new Set<number>()  // 已分配的敌人ID，避免重复分配
    
    for (const baseAngle of baseAngles) {
      let bestAngle = baseAngle
      let bestDistance = Infinity
      let bestZombieId: number | null = null
      
      // 在该方向的扇形区域内寻找最近的敌人
      // 扇形角度范围：基础角度 ± 90度（每个方向覆盖180度范围）
      const sectorRange = Math.PI / 2  // 90度范围
      
      for (const zombieInfo of sortedZombies) {
        // 跳过已分配的敌人
        if (usedZombieIds.has(zombieInfo.zombie.id)) continue
        
        const zombieAngle = zombieInfo.angle
        const angleDiff = Math.abs(this.normalizeAngle(zombieAngle - baseAngle))
        
        // 检查敌人是否在该方向的扇形区域内
        if (angleDiff <= sectorRange) {
          // 找到该方向最近的敌人
          if (zombieInfo.distance < bestDistance) {
            bestDistance = zombieInfo.distance
            bestAngle = zombieAngle
            bestZombieId = zombieInfo.zombie.id
          }
        }
      }
      
      // 如果找到了该方向的敌人，使用敌人方向；否则使用基础角度
      if (bestZombieId !== null) {
        adjustedAngles.push(bestAngle)
        usedZombieIds.add(bestZombieId)  // 标记该敌人已被分配
      } else {
        adjustedAngles.push(baseAngle)
      }
    }
    
    return adjustedAngles
  }
  
  /**
   * 将角度标准化到 [-π, π] 范围
   */
  private normalizeAngle(angle: number): number {
    while (angle > Math.PI) angle -= Math.PI * 2
    while (angle < -Math.PI) angle += Math.PI * 2
    return angle
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
  // spawnFreezeEffect 已移至 EffectManager

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
   * 生成竖向尘土特效（用于竖向移动的装甲车）
   */
  private spawnDustEffectVertical(x: number, y: number) {
    for (let i = 0; i < 8; i++) {
      const offsetX = (Math.random() - 0.5) * 10
      const offsetY = (Math.random() - 0.5) * 20
      const particle = this.add.circle(x + offsetX, y + offsetY, 2, 0x888888, 0.6)
      
      const vx = (Math.random() - 0.5) * 20
      const vy = -20 - Math.random() * 30  // 向上扩散
      
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
   * 计算点到线段的距离
   */
  private distToLineSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
    const dx = x2 - x1
    const dy = y2 - y1
    const len2 = dx * dx + dy * dy
    
    if (len2 === 0) {
      // 线段退化为点
      return Math.hypot(px - x1, py - y1)
    }
    
    // 计算投影参数t
    const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len2))
    
    // 计算线段上最近的点
    const projX = x1 + t * dx
    const projY = y1 + t * dy
    
    // 返回点到最近点的距离
    return Math.hypot(px - projX, py - projY)
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
  // spawnShockEffect 已移至 EffectManager

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

  /**
   * 显示伤害数字
   * @param x X坐标
   * @param y Y坐标
   * @param damage 伤害值
   */
  // showDamageNumber 和 updateDamageNumbers 已移至 EffectManager

  // calculateDamageWithCritAndTalents, applyTalentEffectsOnHit, teleportZombieToSpawn, instakillZombie, updateTeleportAnimations 已移至 DamageCalculator 和 TalentManager
}