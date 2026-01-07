/**
 * 技能池：负责从所有可用技能中随机抽取升级选项
 * 
 * 抽取规则：
 * - 只抽取符合条件的技能（可升级 + 分支需先解锁主技能）
 * - 使用权重随机（weight）确保不同技能出现概率不同
 * - 保证返回3个不重复的技能选项
 */
import { SKILL_DEFS, type SkillDef, type SkillId } from './skillDefs'
import type { SkillChoice, SkillSystem } from './SkillSystem'

export class SkillPool {
  /** 随机数生成器（xorshift32算法，可复现） */
  private rng: () => number

  /**
   * @param seed 随机种子（默认使用当前时间戳）
   */
  constructor(seed = Date.now()) {
    // xorshift32 伪随机数生成器（快速且可复现）
    let x = seed | 0
    this.rng = () => {
      x ^= x << 13
      x ^= x >>> 17
      x ^= x << 5
      // 返回 [0, 1) 范围的浮点数
      return ((x >>> 0) % 1_000_000) / 1_000_000
    }
  }

  /**
   * 从所有符合条件的技能中抽取3个不重复的选项
   * 
   * @param skills 技能系统实例（用于判断技能是否可选）
   * @returns 3个技能选择项（如果可选技能不足，可能少于3个或允许重复）
   */
  pick3Distinct(skills: SkillSystem): SkillChoice[] {
    // 检查主技能数量限制（最多4个，不包括bullet_spread）
    const mainSkillCount = skills.getMainSkillCount()
    const maxMainSkills = 4
    
    // 筛选出所有符合条件的技能
    let eligible: SkillDef[] = Object.values(SKILL_DEFS).filter((d) => {
      if (!skills.isEligible(d)) return false
      
      // 如果主技能已达到上限，只允许基础技能（bullet_spread）和分支技能
      if (mainSkillCount >= maxMainSkills && d.type === 'main') {
        // 只允许bullet_spread作为主技能
        return d.id === 'bullet_spread'
      }
      
      return true
    })
    
    const ids = new Set<SkillId>()  // 已选中的技能ID（用于去重）
    const out: SkillChoice[] = []
    const maxTry = 50  // 最大尝试次数（防止死循环）
    let tries = 0

    // 尝试抽取3个不重复的技能
    while (out.length < 3 && tries++ < maxTry) {
      if (eligible.length === 0) break
      const c = this.pickWeighted(eligible)
      if (ids.has(c.id)) continue  // 跳过已选中的技能
      ids.add(c.id)
      out.push({ id: c.id, name: c.name, desc: c.desc })
    }

    // 兜底：如果可选技能太少导致无法凑齐3个，允许重复补齐
    // （但依然保证技能是可升级/解锁的）
    while (out.length < 3 && eligible.length > 0) {
      const c = this.pickWeighted(eligible)
      out.push({ id: c.id, name: c.name, desc: c.desc })
    }
    return out
  }

  /**
   * 按权重随机选择一个技能定义
   * 
   * 算法：累加所有权重，生成随机数，找到对应的区间
   * @param list 技能定义列表
   * @returns 选中的技能定义
   */
  private pickWeighted(list: SkillDef[]) {
    // 计算总权重
    let sum = 0
    for (const i of list) sum += Math.max(0, i.weight)
    
    // 生成 [0, sum) 范围的随机数
    const r = this.rng() * sum
    
    // 找到对应的区间
    let acc = 0
    for (const i of list) {
      acc += Math.max(0, i.weight)
      if (r <= acc) return i
    }
    
    // 兜底：返回最后一个（理论上不会执行到这里）
    return list[list.length - 1]
  }
}


