/**
 * 技能树：统一管理技能依赖关系、最大等级和优先级
 * 
 * 核心功能：
 * - 定义技能依赖关系树（技能优先级）
 * - 统一管理技能最大等级
 * - 提供技能解锁检查接口
 */
import type { MainSkillId, SkillId, UpgradeKind } from './skillDefs'

/**
 * 技能依赖关系定义
 */
export type SkillDependency = {
  /** 前置技能ID（必须已解锁才能解锁此技能） */
  requires?: MainSkillId | SkillId
  /** 前置技能的最小等级要求（默认1） */
  requiresLevel?: number
  /** 优先级（数字越小优先级越高，用于解锁顺序） */
  priority?: number
}

/**
 * 技能配置：包含最大等级和依赖关系
 */
export type SkillConfig = {
  /** 最大等级 */
  maxLevel: number
  /** 依赖关系 */
  dependency?: SkillDependency
}

/**
 * 技能树配置：所有技能的配置信息
 */
export type SkillTreeConfig = Record<SkillId, SkillConfig>

/**
 * 技能树管理器：统一管理技能依赖关系和最大等级
 */
export class SkillTree {
  /** 技能树配置 */
  private readonly config: SkillTreeConfig

  constructor(config: SkillTreeConfig) {
    this.config = config
  }

  /**
   * 获取技能的最大等级
   */
  getMaxLevel(skillId: SkillId): number {
    return this.config[skillId]?.maxLevel ?? 0
  }

  /**
   * 获取技能的依赖关系
   */
  getDependency(skillId: SkillId): SkillDependency | undefined {
    return this.config[skillId]?.dependency
  }

  /**
   * 获取技能的优先级（数字越小优先级越高）
   */
  getPriority(skillId: SkillId): number {
    return this.config[skillId]?.dependency?.priority ?? 999
  }

  /**
   * 检查技能是否可以解锁/升级
   * @param skillId 技能ID
   * @param currentLevel 当前等级
   * @param getSkillLevel 获取其他技能等级的函数
   */
  canUnlock(
    skillId: SkillId,
    currentLevel: number,
    getSkillLevel: (id: SkillId) => number
  ): boolean {
    // 检查是否已达到最大等级
    if (currentLevel >= this.getMaxLevel(skillId)) {
      return false
    }

    // 检查依赖关系
    const dependency = this.getDependency(skillId)
    if (!dependency || !dependency.requires) {
      return true  // 无依赖，可以直接解锁
    }

    // 检查前置技能是否已解锁
    const requiredLevel = dependency.requiresLevel ?? 1
    const requiredSkillLevel = getSkillLevel(dependency.requires)
    
    return requiredSkillLevel >= requiredLevel
  }

  /**
   * 获取所有依赖指定技能的技能列表
   * @param skillId 被依赖的技能ID
   */
  getDependents(skillId: SkillId): SkillId[] {
    const dependents: SkillId[] = []
    
    for (const [id, config] of Object.entries(this.config)) {
      if (config.dependency?.requires === skillId) {
        dependents.push(id as SkillId)
      }
    }
    
    return dependents
  }

  /**
   * 获取技能树中所有技能ID
   */
  getAllSkillIds(): SkillId[] {
    return Object.keys(this.config) as SkillId[]
  }

  /**
   * 获取所有主技能ID（按优先级排序）
   */
  getMainSkillIdsByPriority(): MainSkillId[] {
    const mainSkills = this.getAllSkillIds().filter(
      id => !id.includes('_') || id.startsWith('weapon_') || id === 'bullet_spread'
    ) as MainSkillId[]
    
    return mainSkills.sort((a, b) => {
      const priorityA = this.getPriority(a)
      const priorityB = this.getPriority(b)
      return priorityA - priorityB
    })
  }
}

