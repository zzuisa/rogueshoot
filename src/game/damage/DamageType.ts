/**
 * 伤害属性类型定义
 */
export type DamageType = 'wind' | 'fire' | 'electric' | 'energy' | 'ice' | 'physical'

/**
 * 属性名称映射
 */
export const DAMAGE_TYPE_NAMES: Record<DamageType, string> = {
  wind: '风',
  fire: '火',
  electric: '电',
  energy: '能量',
  ice: '冰',
  physical: '物理',
}

/**
 * 属性颜色映射（用于UI显示）
 */
export const DAMAGE_TYPE_COLORS: Record<DamageType, string> = {
  wind: '#4ade80',      // 绿色
  fire: '#f97316',      // 橙色
  electric: '#fbbf24',  // 黄色
  energy: '#3b82f6',    // 蓝色
  ice: '#60a5fa',       // 浅蓝色
  physical: '#9ca3af',  // 灰色
}

