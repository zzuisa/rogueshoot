/**
 * 技能定义文件：包含所有主技能和分支升级的配置
 * 
 * 技能体系：
 * - 主技能：可直接解锁的核心技能（如温压弹、燃油弹等）
 * - 分支升级：必须先解锁主技能才能出现的强化选项（伤害/冷却/数量/范围/持续）
 */

/** 主技能ID类型：所有可直接解锁的核心技能 */
export type MainSkillId =
  | 'bullet_spread'    // 子弹散射
  | 'aurora'           // 极光
  | 'tornado'           // 龙卷风
  | 'thermobaric'       // 温压弹
  | 'napalm'            // 燃油弹
  | 'ice_pierce'        // 干冰弹
  | 'high_energy_ray'   // 高能射线
  | 'guided_laser'      // 制导激光
  | 'armored_car'       // 装甲车
  | 'mini_vortex'       // 旋风加农
  | 'air_blast'         // 压缩气弹
  | 'carpet_bomb'       // 空投轰炸
  | 'ice_storm'         // 冰暴发生器
  | 'emp_pierce'        // 电磁穿刺
  | 'chain_electron'    // 跃迁电子

/** 分支升级类型：5种可选的强化方向 */
export type UpgradeKind = 'damage' | 'cooldown' | 'count' | 'radius' | 'duration'

/** 分支技能ID类型：格式为 "主技能ID_升级类型" */
export type UpgradeSkillId =
  | `${MainSkillId}_damage`     // 伤害增强
  | `${MainSkillId}_cooldown`   // 冷却缩减
  | `${MainSkillId}_count`      // 数量/次数增加
  | `${MainSkillId}_radius`     // 范围扩大
  | `${MainSkillId}_duration`   // 持续时间延长

/** 所有技能ID（主技能 + 分支升级） */
export type SkillId = MainSkillId | UpgradeSkillId

/**
 * 技能定义：包含技能的所有元数据
 */
export type SkillDef = Readonly<{
  id: SkillId                    // 技能唯一标识
  name: string                   // 显示名称
  desc: string                   // 描述文本（支持多行）
  type: 'main' | 'upgrade'       // 类型：主技能 或 分支升级
  weight: number                 // 出现权重（用于随机抽取）
  maxLevel: number               // 最大等级
  requires?: MainSkillId         // 分支升级需要的主技能（仅分支技能需要）
  upgradeKind?: UpgradeKind      // 分支升级类型（仅分支技能需要）
}>

/**
 * 创建主技能定义的辅助函数
 * @param id 技能ID
 * @param name 显示名称
 * @param desc 描述
 * @param weight 出现权重（默认1.0）
 * @param maxLevel 最大等级（默认6）
 */
const main = (
  id: MainSkillId,
  name: string,
  desc: string,
  weight = 1,
  maxLevel = 6,
): SkillDef => ({ id, name, desc, type: 'main', weight, maxLevel })

/**
 * 主技能名称映射（用于生成分支技能描述）
 */
const MAIN_SKILL_NAMES: Record<MainSkillId, string> = {
  bullet_spread: '子弹散射',
  aurora: '极光',
  tornado: '龙卷风',
  thermobaric: '温压弹',
  napalm: '燃油弹',
  ice_pierce: '干冰弹',
  high_energy_ray: '高能射线',
  guided_laser: '制导激光',
  armored_car: '装甲车',
  mini_vortex: '旋风加农',
  air_blast: '压缩气弹',
  carpet_bomb: '空投轰炸',
  ice_storm: '冰暴发生器',
  emp_pierce: '电磁穿刺',
  chain_electron: '跃迁电子',
}

/**
 * 创建分支升级定义的辅助函数
 * @param mainId 所属主技能ID
 * @param kind 升级类型（伤害/冷却/数量/范围/持续）
 * @param name 显示名称
 * @param desc 描述（如果不提供，将自动生成包含主技能名称的描述）
 * @param weight 出现权重（默认0.6，比主技能略低）
 * @param maxLevel 最大等级（默认5）
 */
const up = (mainId: MainSkillId, kind: UpgradeKind, name: string, desc?: string, weight = 0.6, maxLevel = 5): SkillDef => {
  // 获取主技能名称
  const mainName = MAIN_SKILL_NAMES[mainId] || mainId
  
  // 如果没有提供描述，自动生成包含主技能名称的描述
  let finalDesc = desc
  if (!finalDesc) {
    switch (kind) {
      case 'damage':
        finalDesc = `提升${mainName}的伤害百分比（每级+20%，可叠加）。`
        break
      case 'cooldown':
        finalDesc = `减少${mainName}的冷却时间（每级-10%，可叠加）。`
        break
      case 'count':
        finalDesc = `增加${mainName}的弹药数/射线数/触发次数（每级+1，可叠加）。`
        break
      case 'radius':
        finalDesc = `扩大${mainName}的爆炸半径/穿透宽度/影响范围（每级+12%，可叠加）。`
        break
      case 'duration':
        finalDesc = `延长${mainName}的持续时间（每级+15%，可叠加）。`
        break
    }
  } else {
    // 如果提供了描述，确保包含主技能名称（如果描述中没有）
    if (finalDesc.includes('该技能')) {
      // 替换"该技能"为主技能名称
      finalDesc = finalDesc.replace(/该技能/g, mainName)
    } else if (!finalDesc.includes(mainName)) {
      // 如果描述中不包含主技能名称，在描述前添加主技能名称
      finalDesc = `${mainName}：${finalDesc}`
    }
  }
  
  return {
    id: `${mainId}_${kind}` as UpgradeSkillId,
    name,
    desc: finalDesc,
    type: 'upgrade',
    weight,
    maxLevel,
    requires: mainId,
    upgradeKind: kind,
  } as const
}

/**
 * 所有技能定义的完整列表
 * 包含：主技能 + 每个主技能对应的5种分支升级
 * 
 * 注意：分支技能的描述会自动包含主技能名称，确保依赖关系清晰
 */
export const SKILL_DEFS: Record<SkillId, SkillDef> = {
  // ===== 原有技能（保留兼容） =====
  bullet_spread: main('bullet_spread', '子弹散射', '发射多发扇形子弹，提高清怪能力。', 1.1, 3),
  aurora: main('aurora', '极光', '周期性召唤垂直光束，灼烧光束范围内的敌人。', 1.0, 6),
  tornado: main('tornado', '龙卷风', '周期性生成向上推进的龙卷风，持续伤害范围内敌人。', 1.0, 6),

  // ===== 核心输出系：高伤害爆发技能 =====
  thermobaric: main('thermobaric', '温压弹', '发射高爆发火炮，造成大范围爆炸伤害。', 0.9, 6),
  napalm: main('napalm', '燃油弹', '在地面生成持续燃烧区，附带百分比扣血与点燃效果。', 0.9, 6),
  ice_pierce: main('ice_pierce', '干冰弹', '发射可穿透的冰弹，对沿途敌人造成伤害并概率冻结。', 0.9, 6),
  high_energy_ray: main('high_energy_ray', '高能射线', '锁定最近目标，持续穿透射线造成高频伤害。', 0.9, 6),
  guided_laser: main('guided_laser', '制导激光', '自动锁定并打击多个目标，适合处理分散残血怪。', 0.9, 6),

  // ===== 物理控制系：击退、牵引、控制类技能 =====
  armored_car: main('armored_car', '装甲车', '召唤战车横冲直撞，强力击退并造成伤害。', 0.8, 6),
  mini_vortex: main('mini_vortex', '旋风加农', '生成小型旋风牵引敌人并持续切割伤害。', 0.8, 6),
  air_blast: main('air_blast', '压缩气弹', '气压爆破击退靠近的敌人，近身防御技能。', 0.8, 6),
  carpet_bomb: main('carpet_bomb', '空投轰炸', '对区域进行地毯式轰炸，瞬间清场能力强。', 0.8, 6),

  // ===== 元素控制系：冰冻、感电、连锁类技能 =====
  ice_storm: main('ice_storm', '冰暴发生器', '在防线前方制造大面积冰雾，长时间群体冻结。', 0.85, 6),
  emp_pierce: main('emp_pierce', '电磁穿刺', '电磁波贯穿战线，对敌人造成感电并提高其后续受伤。', 0.85, 6),
  chain_electron: main('chain_electron', '跃迁电子', '电流在目标间弹跳，适合清理大规模低血量群体。', 0.85, 6),

  // ===== 分支升级（需要先解锁对应主技能）=====
  // 注意：分支升级的描述会自动包含主技能名称，确保依赖关系清晰
  // 每个主技能都有5种分支：伤害增强、冷却缩减、数量/次数增加、范围扩大、持续时间延长
  // 如果描述中包含"该技能"，会自动替换为主技能名称
  
  bullet_spread_damage: up('bullet_spread', 'damage', '伤害增强'),
  bullet_spread_cooldown: up('bullet_spread', 'cooldown', '冷却缩减'),
  bullet_spread_count: up('bullet_spread', 'count', '数量/次数增加'),
  bullet_spread_radius: up('bullet_spread', 'radius', '范围扩大'),
  bullet_spread_duration: up('bullet_spread', 'duration', '持续时间延长'),

  aurora_damage: up('aurora', 'damage', '伤害增强'),
  aurora_cooldown: up('aurora', 'cooldown', '冷却缩减'),
  aurora_count: up('aurora', 'count', '数量/次数增加'),
  aurora_radius: up('aurora', 'radius', '范围扩大'),
  aurora_duration: up('aurora', 'duration', '持续时间延长'),

  tornado_damage: up('tornado', 'damage', '伤害增强'),
  tornado_cooldown: up('tornado', 'cooldown', '冷却缩减'),
  tornado_count: up('tornado', 'count', '数量/次数增加'),
  tornado_radius: up('tornado', 'radius', '范围扩大'),
  tornado_duration: up('tornado', 'duration', '持续时间延长'),

  thermobaric_damage: up('thermobaric', 'damage', '伤害增强'),
  thermobaric_cooldown: up('thermobaric', 'cooldown', '冷却缩减'),
  thermobaric_count: up('thermobaric', 'count', '多发射', '温压弹额外发射一次（可无限叠加）。', 1.2, 999),
  thermobaric_radius: up('thermobaric', 'radius', '范围扩大'),
  thermobaric_duration: up('thermobaric', 'duration', '持续时间延长'),

  napalm_damage: up('napalm', 'damage', '伤害增强'),
  napalm_cooldown: up('napalm', 'cooldown', '冷却缩减'),
  napalm_count: up('napalm', 'count', '数量/次数增加'),
  napalm_radius: up('napalm', 'radius', '范围扩大'),
  napalm_duration: up('napalm', 'duration', '持续时间延长'),

  ice_pierce_damage: up('ice_pierce', 'damage', '伤害增强'),
  ice_pierce_cooldown: up('ice_pierce', 'cooldown', '冷却缩减'),
  ice_pierce_count: up('ice_pierce', 'count', '多发射', '干冰弹额外发射一次（可无限叠加）。', 1.2, 999),
  ice_pierce_radius: up('ice_pierce', 'radius', '范围扩大'),
  ice_pierce_duration: up('ice_pierce', 'duration', '持续时间延长'),

  high_energy_ray_damage: up('high_energy_ray', 'damage', '伤害增强'),
  high_energy_ray_cooldown: up('high_energy_ray', 'cooldown', '冷却缩减'),
  high_energy_ray_count: up('high_energy_ray', 'count', '数量/次数增加'),
  high_energy_ray_radius: up('high_energy_ray', 'radius', '范围扩大'),
  high_energy_ray_duration: up('high_energy_ray', 'duration', '持续时间延长'),

  guided_laser_damage: up('guided_laser', 'damage', '伤害增强'),
  guided_laser_cooldown: up('guided_laser', 'cooldown', '冷却缩减'),
  guided_laser_count: up('guided_laser', 'count', '数量/次数增加'),
  guided_laser_radius: up('guided_laser', 'radius', '范围扩大'),
  guided_laser_duration: up('guided_laser', 'duration', '持续时间延长'),

  armored_car_damage: up('armored_car', 'damage', '伤害增强'),
  armored_car_cooldown: up('armored_car', 'cooldown', '冷却缩减'),
  armored_car_count: up('armored_car', 'count', '多发车', '装甲车额外召唤一辆（可无限叠加）。', 1.2, 999),
  armored_car_radius: up('armored_car', 'radius', '范围扩大'),
  armored_car_duration: up('armored_car', 'duration', '持续时间延长'),

  mini_vortex_damage: up('mini_vortex', 'damage', '伤害增强'),
  mini_vortex_cooldown: up('mini_vortex', 'cooldown', '冷却缩减'),
  mini_vortex_count: up('mini_vortex', 'count', '数量/次数增加'),
  mini_vortex_radius: up('mini_vortex', 'radius', '范围扩大'),
  mini_vortex_duration: up('mini_vortex', 'duration', '持续时间延长'),

  air_blast_damage: up('air_blast', 'damage', '伤害增强'),
  air_blast_cooldown: up('air_blast', 'cooldown', '冷却缩减'),
  air_blast_count: up('air_blast', 'count', '数量/次数增加'),
  air_blast_radius: up('air_blast', 'radius', '范围扩大'),
  air_blast_duration: up('air_blast', 'duration', '持续时间延长'),

  carpet_bomb_damage: up('carpet_bomb', 'damage', '伤害增强'),
  carpet_bomb_cooldown: up('carpet_bomb', 'cooldown', '冷却缩减'),
  carpet_bomb_count: up('carpet_bomb', 'count', '数量/次数增加'),
  carpet_bomb_radius: up('carpet_bomb', 'radius', '范围扩大'),
  carpet_bomb_duration: up('carpet_bomb', 'duration', '持续时间延长'),

  ice_storm_damage: up('ice_storm', 'damage', '伤害增强'),
  ice_storm_cooldown: up('ice_storm', 'cooldown', '冷却缩减'),
  ice_storm_count: up('ice_storm', 'count', '多发生', '冰暴发生器额外生成一个（可无限叠加）。', 1.2, 999),
  ice_storm_radius: up('ice_storm', 'radius', '范围扩大'),
  ice_storm_duration: up('ice_storm', 'duration', '持续时间延长'),

  emp_pierce_damage: up('emp_pierce', 'damage', '伤害增强'),
  emp_pierce_cooldown: up('emp_pierce', 'cooldown', '冷却缩减'),
  emp_pierce_count: up('emp_pierce', 'count', '数量/次数增加'),
  emp_pierce_radius: up('emp_pierce', 'radius', '范围扩大'),
  emp_pierce_duration: up('emp_pierce', 'duration', '持续时间延长'),

  chain_electron_damage: up('chain_electron', 'damage', '伤害增强'),
  chain_electron_cooldown: up('chain_electron', 'cooldown', '冷却缩减'),
  chain_electron_count: up('chain_electron', 'count', '数量/次数增加'),
  chain_electron_radius: up('chain_electron', 'radius', '范围扩大'),
  chain_electron_duration: up('chain_electron', 'duration', '持续时间延长'),
}


