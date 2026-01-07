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
 * 技能释放范围类型
 */
export type SkillRange = 
  | { type: 'circle'; radius: number }           // 圆形范围（半径）
  | { type: 'rect'; width: number; height: number } // 矩形范围（宽度、高度）
  | { type: 'line'; length: number; width: number } // 线段范围（长度、宽度）
  | { type: 'arc'; radius: number; angle: number }  // 扇形范围（半径、角度，弧度）
  | { type: 'arcRange'; radius: number; anglePercent: number }  // 弧形范围（半径、角度百分比，类似玩家射程）

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
  range?: SkillRange             // 释放范围（仅主技能需要）
}>

/**
 * 创建主技能定义的辅助函数
 * @param id 技能ID
 * @param name 显示名称
 * @param desc 描述
 * @param weight 出现权重（默认1.0）
 * @param maxLevel 最大等级（默认6）
 * @param range 释放范围（可选）
 */
const main = (
  id: MainSkillId,
  name: string,
  desc: string,
  weight = 1,
  maxLevel = 6,
  range?: SkillRange,
): SkillDef => ({ id, name, desc, type: 'main', weight, maxLevel, range })

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
  
  // 极光：垂直光束，宽度14-38px，伤害8-27，冷却4.2-1.2秒
  // 范围：矩形，宽度38px（最大），高度到防线（520px）
  aurora: main('aurora', '极光', '召唤垂直光束灼烧敌人。\n宽度: 14-38px | 伤害: 8-27 | 冷却: 4.2-1.2秒', 1.0, 6, { type: 'rect', width: 38, height: 520 }),
  
  // 龙卷风：半径18-42px，持续时间2.6-5.0秒，DPS 3-10.2，冷却6.0-2.0秒，数量1+
  // 范围：弧形，半径42px（最大），80%圆弧
  tornado: main('tornado', '龙卷风', '生成向上推进的龙卷风持续伤害敌人。\n半径: 18-42px | 持续: 2.6-5.0秒 | DPS: 3-10.2 | 冷却: 6.0-2.0秒 | 数量: 1+', 1.0, 6, { type: 'arcRange', radius: 42, anglePercent: 0.8 }),

  // ===== 核心输出系：高伤害爆发技能 =====
  // 温压弹：半径60-96px，伤害40-112，冷却7.5-3.5秒，数量1+
  // 范围：弧形，半径96px（最大），80%圆弧
  thermobaric: main('thermobaric', '温压弹', '发射高爆发火炮造成大范围爆炸。\n半径: 60-96px | 伤害: 40-112 | 冷却: 7.5-3.5秒 | 数量: 1+', 0.9, 6, { type: 'arcRange', radius: 96, anglePercent: 0.8 }),
  
  // 燃油弹：半径55-79px，持续4.0-7.0秒，百分比伤害5%-8.8%，初始伤害30-90，冷却8.2-4.0秒
  // 范围：弧形，半径79px（最大），80%圆弧
  napalm: main('napalm', '燃油弹', '在地面生成持续燃烧区，附带百分比扣血。\n半径: 55-79px | 持续: 4.0-7.0秒 | 百分比: 5%-8.8%/秒 | 初始伤害: 30-90 | 冷却: 8.2-4.0秒', 0.9, 6, { type: 'arcRange', radius: 79, anglePercent: 0.8 }),
  
  // 干冰弹：宽度10-22px，伤害18-54，冻结概率18%-60%，冻结时间1.2-2.4秒，冷却5.6-2.8秒，数量1+
  // 范围：线段，长度到屏幕顶部（640px），宽度22px（最大）
  ice_pierce: main('ice_pierce', '干冰弹', '发射可穿透冰弹，概率冻结敌人。\n宽度: 10-22px | 伤害: 18-54 | 冻结: 18%-60%概率，1.2-2.4秒 | 冷却: 5.6-2.8秒 | 数量: 1+', 0.9, 6, { type: 'line', length: 640, width: 22 }),
  
  // 高能射线：宽度8-15.2px，持续1.0-2.32秒，DPS 35-95，冷却8.8-4.5秒
  // 范围：线段，长度可变（到目标），宽度15.2px（最大）
  high_energy_ray: main('high_energy_ray', '高能射线', '锁定最近目标，持续穿透射线造成高频伤害。\n宽度: 8-15.2px | 持续: 1.0-2.32秒 | DPS: 35-95 | 冷却: 8.8-4.5秒', 0.9, 6, { type: 'line', length: 600, width: 15.2 }),
  
  // 制导激光：目标数2+，伤害22-64，冷却6.8-3.2秒
  // 范围：全屏锁定（无固定范围，显示为全屏）
  guided_laser: main('guided_laser', '制导激光', '自动锁定并打击多个目标。\n目标数: 2+ | 伤害: 22-64 | 冷却: 6.8-3.2秒', 0.9, 6, { type: 'rect', width: 360, height: 640 }),

  // ===== 物理控制系：击退、牵引、控制类技能 =====
  // 装甲车：宽度18px，高度46px，持续1.8秒，伤害28-76，击退120-228，冷却10.5-6.0秒，数量1+
  // 范围：矩形，宽度18px，高度46px（竖向移动）
  armored_car: main('armored_car', '装甲车', '召唤战车从防线向对面冲击，强力击退敌人。\n尺寸: 18×46px | 持续: 1.8秒 | 伤害: 28-76 | 击退: 120-228 | 冷却: 10.5-6.0秒 | 数量: 1+', 0.8, 6, { type: 'rect', width: 18, height: 46 }),
  
  // 旋风加农：半径80-116px，持续3.6-4.85秒，DPS 12-36，牵引60-108，冷却9.5-5.5秒，数量1+
  // 范围：弧形，半径116px（最大），80%圆弧
  mini_vortex: main('mini_vortex', '旋风加农', '生成小型旋风牵引敌人并持续切割。\n半径: 80-116px | 持续: 3.6-4.85秒 | DPS: 12-36 | 牵引: 60-108 | 冷却: 9.5-5.5秒 | 数量: 1+', 0.8, 6, { type: 'arcRange', radius: 116, anglePercent: 0.8 }),
  
  // 压缩气弹：半径90-126px，伤害15-45，击退150-300，冷却5.2-2.2秒，数量1+
  // 范围：弧形，半径126px（最大），80%圆弧
  air_blast: main('air_blast', '压缩气弹', '气压爆破击退靠近的敌人。\n半径: 90-126px | 伤害: 15-45 | 击退: 150-300 | 冷却: 5.2-2.2秒 | 数量: 1+', 0.8, 6, { type: 'arcRange', radius: 126, anglePercent: 0.8 }),
  
  // 空投轰炸：半径55-79px，伤害35-95，轰炸数4+，冷却12.5-7.0秒
  // 范围：弧形，半径79px（最大），80%圆弧
  carpet_bomb: main('carpet_bomb', '空投轰炸', '对区域进行地毯式轰炸。\n半径: 55-79px | 伤害: 35-95 | 轰炸数: 4+ | 冷却: 12.5-7.0秒', 0.8, 6, { type: 'arcRange', radius: 79, anglePercent: 0.8 }),

  // ===== 元素控制系：冰冻、感电、连锁类技能 =====
  // 冰暴发生器：半径120-168px，持续4.0-7.6秒，冻结时间0.6-1.2秒，冷却11.5-6.0秒，数量1+
  // 范围：弧形，半径168px（最大），80%圆弧
  ice_storm: main('ice_storm', '冰暴发生器', '制造大面积冰雾，长时间群体冻结。\n半径: 120-168px | 持续: 4.0-7.6秒 | 冻结: 0.6-1.2秒 | 冷却: 11.5-6.0秒 | 数量: 1+', 0.85, 6, { type: 'arcRange', radius: 168, anglePercent: 0.8 }),
  
  // 电磁穿刺：宽度18-30px，伤害20-56，感电倍率1.2-1.5倍，感电时间4.0-5.2秒，冷却9.5-5.0秒
  // 范围：横向线段，宽度30px（最大），横跨屏幕（360px）
  emp_pierce: main('emp_pierce', '电磁穿刺', '电磁波贯穿战线，造成感电并提高后续受伤。\n宽度: 18-30px | 伤害: 20-56 | 感电: 1.2-1.5倍伤害，4.0-5.2秒 | 冷却: 9.5-5.0秒', 0.85, 6, { type: 'line', length: 360, width: 30 }),
  
  // 跃迁电子：跳跃数3+，跳跃半径90-114px，伤害18-48，冷却6.2-2.8秒
  // 范围：弧形，半径114px（最大，跳跃范围），80%圆弧
  chain_electron: main('chain_electron', '跃迁电子', '电流在目标间弹跳，适合清理大规模低血量群体。\n跳跃数: 3+ | 跳跃半径: 90-114px | 伤害: 18-48 | 冷却: 6.2-2.8秒', 0.85, 6, { type: 'arcRange', radius: 114, anglePercent: 0.8 }),

  // ===== 分支升级（需要先解锁对应主技能）=====
  // 注意：根据技能特性，不是所有技能都需要所有5种升级类型
  // 只保留对技能有意义的升级选项
  
  bullet_spread_damage: up('bullet_spread', 'damage', '伤害增强'),
  bullet_spread_cooldown: up('bullet_spread', 'cooldown', '冷却缩减'),
  bullet_spread_count: up('bullet_spread', 'count', '数量/次数增加'),
  bullet_spread_radius: up('bullet_spread', 'radius', '范围扩大'),
  bullet_spread_duration: up('bullet_spread', 'duration', '持续时间延长'),

  // 极光：需要伤害、冷却、范围（宽度），不需要数量和持续时间
  aurora_damage: up('aurora', 'damage', '伤害增强', '提升极光的伤害（每级+20%，可叠加）。'),
  aurora_cooldown: up('aurora', 'cooldown', '冷却缩减', '减少极光的冷却时间（每级-10%，可叠加）。'),
  aurora_count: up('aurora', 'count', '数量/次数增加', '极光不支持数量升级。', 0, 0), // 权重0，不会出现
  aurora_radius: up('aurora', 'radius', '宽度扩大', '扩大极光光束的宽度（每级+12%，可叠加）。'),
  aurora_duration: up('aurora', 'duration', '持续时间延长', '极光不支持持续时间升级。', 0, 0), // 权重0，不会出现

  // 龙卷风：需要全部5种升级
  tornado_damage: up('tornado', 'damage', '伤害增强', '提升龙卷风的DPS（每级+20%，可叠加）。'),
  tornado_cooldown: up('tornado', 'cooldown', '冷却缩减', '减少龙卷风的冷却时间（每级-10%，可叠加）。'),
  tornado_count: up('tornado', 'count', '数量增加', '增加龙卷风的数量（每级+1，可叠加）。'),
  tornado_radius: up('tornado', 'radius', '范围扩大', '扩大龙卷风的半径（每级+12%，可叠加）。'),
  tornado_duration: up('tornado', 'duration', '持续时间延长', '延长龙卷风的持续时间（每级+15%，可叠加）。'),

  // 温压弹：需要伤害、冷却、数量、范围，不需要持续时间
  thermobaric_damage: up('thermobaric', 'damage', '伤害增强', '提升温压弹的伤害（每级+20%，可叠加）。'),
  thermobaric_cooldown: up('thermobaric', 'cooldown', '冷却缩减', '减少温压弹的冷却时间（每级-10%，可叠加）。'),
  thermobaric_count: up('thermobaric', 'count', '多发射', '温压弹额外发射一次（可无限叠加）。', 1.2, 999),
  thermobaric_radius: up('thermobaric', 'radius', '范围扩大', '扩大温压弹的爆炸半径（每级+12%，可叠加）。'),
  thermobaric_duration: up('thermobaric', 'duration', '持续时间延长', '温压弹不支持持续时间升级。', 0, 0), // 权重0，不会出现

  // 燃油弹：需要伤害、冷却、范围、持续时间，不需要数量
  napalm_damage: up('napalm', 'damage', '伤害增强', '提升燃油弹的初始伤害和百分比伤害（每级+20%，可叠加）。'),
  napalm_cooldown: up('napalm', 'cooldown', '冷却缩减', '减少燃油弹的冷却时间（每级-10%，可叠加）。'),
  napalm_count: up('napalm', 'count', '数量/次数增加', '燃油弹不支持数量升级。', 0, 0), // 权重0，不会出现
  napalm_radius: up('napalm', 'radius', '范围扩大', '扩大燃油弹的燃烧区域半径（每级+12%，可叠加）。'),
  napalm_duration: up('napalm', 'duration', '持续时间延长', '延长燃油弹的燃烧持续时间（每级+15%，可叠加）。'),

  // 干冰弹：需要全部5种升级
  ice_pierce_damage: up('ice_pierce', 'damage', '伤害增强', '提升干冰弹的伤害（每级+20%，可叠加）。'),
  ice_pierce_cooldown: up('ice_pierce', 'cooldown', '冷却缩减', '减少干冰弹的冷却时间（每级-10%，可叠加）。'),
  ice_pierce_count: up('ice_pierce', 'count', '多发射', '干冰弹额外发射一次（可无限叠加）。', 1.2, 999),
  ice_pierce_radius: up('ice_pierce', 'radius', '宽度扩大', '扩大干冰弹的穿透宽度（每级+12%，可叠加）。'),
  ice_pierce_duration: up('ice_pierce', 'duration', '冻结时间延长', '延长干冰弹的冻结持续时间（每级+15%，可叠加）。'),

  // 高能射线：需要伤害、冷却、范围、持续时间，不需要数量
  high_energy_ray_damage: up('high_energy_ray', 'damage', '伤害增强', '提升高能射线的DPS（每级+20%，可叠加）。'),
  high_energy_ray_cooldown: up('high_energy_ray', 'cooldown', '冷却缩减', '减少高能射线的冷却时间（每级-10%，可叠加）。'),
  high_energy_ray_count: up('high_energy_ray', 'count', '数量/次数增加', '高能射线不支持数量升级。', 0, 0), // 权重0，不会出现
  high_energy_ray_radius: up('high_energy_ray', 'radius', '宽度扩大', '扩大高能射线的宽度（每级+12%，可叠加）。'),
  high_energy_ray_duration: up('high_energy_ray', 'duration', '持续时间延长', '延长高能射线的持续时间（每级+15%，可叠加）。'),

  // 制导激光：需要伤害、冷却、数量，不需要范围和持续时间
  guided_laser_damage: up('guided_laser', 'damage', '伤害增强', '提升制导激光的伤害（每级+20%，可叠加）。'),
  guided_laser_cooldown: up('guided_laser', 'cooldown', '冷却缩减', '减少制导激光的冷却时间（每级-10%，可叠加）。'),
  guided_laser_count: up('guided_laser', 'count', '目标数增加', '增加制导激光的目标数量（每级+1，可叠加）。'),
  guided_laser_radius: up('guided_laser', 'radius', '范围扩大', '制导激光不支持范围升级。', 0, 0), // 权重0，不会出现
  guided_laser_duration: up('guided_laser', 'duration', '持续时间延长', '制导激光不支持持续时间升级。', 0, 0), // 权重0，不会出现

  // 装甲车：需要伤害、冷却、数量、持续时间，不需要范围
  armored_car_damage: up('armored_car', 'damage', '伤害增强', '提升装甲车的伤害（每级+20%，可叠加）。'),
  armored_car_cooldown: up('armored_car', 'cooldown', '冷却缩减', '减少装甲车的冷却时间（每级-10%，可叠加）。'),
  armored_car_count: up('armored_car', 'count', '多发车', '装甲车额外召唤一辆（可无限叠加）。', 1.2, 999),
  armored_car_radius: up('armored_car', 'radius', '范围扩大', '装甲车不支持范围升级。', 0, 0), // 权重0，不会出现
  armored_car_duration: up('armored_car', 'duration', '持续时间延长', '延长装甲车的持续时间（每级+15%，可叠加）。'),

  // 旋风加农：需要全部5种升级
  mini_vortex_damage: up('mini_vortex', 'damage', '伤害增强', '提升旋风加农的DPS（每级+20%，可叠加）。'),
  mini_vortex_cooldown: up('mini_vortex', 'cooldown', '冷却缩减', '减少旋风加农的冷却时间（每级-10%，可叠加）。'),
  mini_vortex_count: up('mini_vortex', 'count', '数量增加', '增加旋风加农的数量（每级+1，可叠加）。'),
  mini_vortex_radius: up('mini_vortex', 'radius', '范围扩大', '扩大旋风加农的半径（每级+12%，可叠加）。'),
  mini_vortex_duration: up('mini_vortex', 'duration', '持续时间延长', '延长旋风加农的持续时间（每级+15%，可叠加）。'),

  // 压缩气弹：需要伤害、冷却、数量、范围，不需要持续时间
  air_blast_damage: up('air_blast', 'damage', '伤害增强', '提升压缩气弹的伤害（每级+20%，可叠加）。'),
  air_blast_cooldown: up('air_blast', 'cooldown', '冷却缩减', '减少压缩气弹的冷却时间（每级-10%，可叠加）。'),
  air_blast_count: up('air_blast', 'count', '数量增加', '增加压缩气弹的数量（每级+1，可叠加）。'),
  air_blast_radius: up('air_blast', 'radius', '范围扩大', '扩大压缩气弹的爆炸半径（每级+12%，可叠加）。'),
  air_blast_duration: up('air_blast', 'duration', '持续时间延长', '压缩气弹不支持持续时间升级。', 0, 0), // 权重0，不会出现

  // 空投轰炸：需要伤害、冷却、数量、范围，不需要持续时间
  carpet_bomb_damage: up('carpet_bomb', 'damage', '伤害增强', '提升空投轰炸的伤害（每级+20%，可叠加）。'),
  carpet_bomb_cooldown: up('carpet_bomb', 'cooldown', '冷却缩减', '减少空投轰炸的冷却时间（每级-10%，可叠加）。'),
  carpet_bomb_count: up('carpet_bomb', 'count', '轰炸数增加', '增加空投轰炸的轰炸次数（每级+1，可叠加）。'),
  carpet_bomb_radius: up('carpet_bomb', 'radius', '范围扩大', '扩大空投轰炸的爆炸半径（每级+12%，可叠加）。'),
  carpet_bomb_duration: up('carpet_bomb', 'duration', '持续时间延长', '空投轰炸不支持持续时间升级。', 0, 0), // 权重0，不会出现

  // 冰暴发生器：需要全部5种升级
  ice_storm_damage: up('ice_storm', 'damage', '伤害增强', '提升冰暴发生器的伤害（每级+20%，可叠加）。'),
  ice_storm_cooldown: up('ice_storm', 'cooldown', '冷却缩减', '减少冰暴发生器的冷却时间（每级-10%，可叠加）。'),
  ice_storm_count: up('ice_storm', 'count', '多发生', '冰暴发生器额外生成一个（可无限叠加）。', 1.2, 999),
  ice_storm_radius: up('ice_storm', 'radius', '范围扩大', '扩大冰暴发生器的半径（每级+12%，可叠加）。'),
  ice_storm_duration: up('ice_storm', 'duration', '持续时间延长', '延长冰暴发生器的持续时间和冻结时间（每级+15%，可叠加）。'),

  // 电磁穿刺：需要伤害、冷却、范围、持续时间，不需要数量
  emp_pierce_damage: up('emp_pierce', 'damage', '伤害增强', '提升电磁穿刺的伤害（每级+20%，可叠加）。'),
  emp_pierce_cooldown: up('emp_pierce', 'cooldown', '冷却缩减', '减少电磁穿刺的冷却时间（每级-10%，可叠加）。'),
  emp_pierce_count: up('emp_pierce', 'count', '数量/次数增加', '电磁穿刺不支持数量升级。', 0, 0), // 权重0，不会出现
  emp_pierce_radius: up('emp_pierce', 'radius', '宽度扩大', '扩大电磁穿刺的宽度（每级+12%，可叠加）。'),
  emp_pierce_duration: up('emp_pierce', 'duration', '感电时间延长', '延长电磁穿刺的感电持续时间（每级+15%，可叠加）。'),

  // 跃迁电子：需要伤害、冷却、数量、范围，不需要持续时间
  chain_electron_damage: up('chain_electron', 'damage', '伤害增强', '提升跃迁电子的伤害（每级+20%，可叠加）。'),
  chain_electron_cooldown: up('chain_electron', 'cooldown', '冷却缩减', '减少跃迁电子的冷却时间（每级-10%，可叠加）。'),
  chain_electron_count: up('chain_electron', 'count', '跳跃数增加', '增加跃迁电子的跳跃次数（每级+1，可叠加）。'),
  chain_electron_radius: up('chain_electron', 'radius', '跳跃半径扩大', '扩大跃迁电子的跳跃半径（每级+12%，可叠加）。'),
  chain_electron_duration: up('chain_electron', 'duration', '持续时间延长', '跃迁电子不支持持续时间升级。', 0, 0), // 权重0，不会出现
}


