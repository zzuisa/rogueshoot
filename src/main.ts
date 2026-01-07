/**
 * 应用入口文件：初始化HTML结构和启动游戏
 */
import './style.css'
import { startGame } from './game/startGame'
import { ZOMBIE_TYPES } from './game/entities/zombieTypes'

// 获取根容器元素
const app = document.querySelector<HTMLDivElement>('#app')
if (!app) throw new Error('Missing #app container')

// 创建游戏容器和HUD界面
app.innerHTML = `
  <div id="game-root"></div>
  <div id="hud">
    <div class="hud-row">
      <span class="hud-pill">防线HP: <b id="hud-hp">1000</b></span>
      <span class="hud-pill">LV: <b id="hud-lv">1</b></span>
      <span class="hud-pill">EXP: <b id="hud-exp">0</b>/<b id="hud-exp-next">10</b></span>
      <span class="hud-pill">波次: <b id="hud-wave">1/20</b></span>
    </div>
    <div class="hud-row hud-hint">
    向僵尸开炮！
    </div>
  </div>
  <div id="bestiary">
    <div class="bestiary-title" id="bestiary-toggle">怪物图鉴 ▼</div>
    <div class="bestiary-list" id="bestiary-list"></div>
  </div>
  <div id="skills-bar">
    <div class="skills-bar-title" id="skills-bar-toggle">已选技能 ▼</div>
    <div class="skills-bar-list" id="skills-bar-list"></div>
  </div>
  <div id="damage-stats" class="damage-stats">
    <div class="damage-stats-title">伤害统计</div>
    <div class="damage-stats-list" id="damage-stats-list"></div>
  </div>
  <button id="crazy-mode-btn" class="crazy-mode-btn">疯狂模式 OFF</button>
  <button id="debug-btn" class="debug-btn">DEBUG</button>
  <div id="debug-panel" class="debug-panel" style="display: none;">
    <div class="debug-panel-header">
      <span>调试：选择技能升级</span>
      <button id="debug-close" class="debug-close">×</button>
    </div>
    <div id="debug-skill-list" class="debug-skill-list"></div>
  </div>
  <div id="version-info" class="version-info"></div>
`

// 生成怪物图鉴
const bestiaryListEl = document.getElementById('bestiary-list')
if (bestiaryListEl) {
  for (const def of Object.values(ZOMBIE_TYPES)) {
    const item = document.createElement('div')
    item.className = 'bestiary-item'
    
    const colorHex = '#' + def.color.toString(16).padStart(6, '0')
    const attackModeText = def.attackMode === 'melee' ? '近战' : '远程'
    const stopDistText = def.rangedStopDistance ? `停止距离: ${def.rangedStopDistance}px` : ''
    
    item.innerHTML = `
      <div class="bestiary-item-header">
        <div class="bestiary-item-color" style="background-color: ${colorHex}"></div>
        <div class="bestiary-item-name">${def.name}</div>
      </div>
      <div class="bestiary-item-stats">
        <div class="bestiary-item-stat">生命: ${def.baseHp}</div>
        <div class="bestiary-item-stat">速度: ${def.baseSpeed} px/s</div>
        <div class="bestiary-item-stat">攻击: ${def.attackDamage} (${attackModeText})</div>
        <div class="bestiary-item-stat">攻击间隔: ${def.attackIntervalSec.toFixed(1)}s</div>
        <div class="bestiary-item-stat">经验: ${def.exp}</div>
        ${stopDistText ? `<div class="bestiary-item-stat">${stopDistText}</div>` : ''}
      </div>
    `
    bestiaryListEl.appendChild(item)
  }
}

// 启动游戏（渲染到 #game-root 容器）
startGame('game-root')

// 技能栏点击隐藏/显示（放在怪物图鉴正下方，默认折叠，使用绝对位置）
const skillsBarToggle = document.getElementById('skills-bar-toggle')
const skillsBarList = document.getElementById('skills-bar-list')
if (skillsBarToggle && skillsBarList) {
  // 默认折叠
  let isExpanded = false
  
  const toggleSkillsBar = () => {
    isExpanded = !isExpanded
    if (isExpanded) {
      skillsBarList.classList.remove('collapsed')
      skillsBarToggle.textContent = '已选技能 ▼'
    } else {
      skillsBarList.classList.add('collapsed')
      skillsBarToggle.textContent = '已选技能 ▶'
    }
  }
  
  skillsBarToggle.addEventListener('click', toggleSkillsBar)
  
  // 初始化状态（默认折叠）
  skillsBarList.classList.add('collapsed')
  skillsBarToggle.textContent = '已选技能 ▶'
}

// 怪物图鉴点击隐藏/显示
const bestiaryToggle = document.getElementById('bestiary-toggle')
const bestiaryList = document.getElementById('bestiary-list')
if (bestiaryToggle && bestiaryList) {
  // 移动端默认折叠
  const isMobile = window.innerWidth <= 768
  let isExpanded = !isMobile
  
  if (!isExpanded) {
    bestiaryList.style.display = 'none'
    bestiaryToggle.textContent = '怪物图鉴 ▶'
  }
  
  bestiaryToggle.style.cursor = 'pointer'
  bestiaryToggle.addEventListener('click', () => {
    isExpanded = !isExpanded
    if (isExpanded) {
      bestiaryList.style.display = 'flex'
      bestiaryToggle.textContent = '怪物图鉴 ▼'
    } else {
      bestiaryList.style.display = 'none'
      bestiaryToggle.textContent = '怪物图鉴 ▶'
    }
  })
  
  // 监听窗口大小变化，移动端默认折叠
  window.addEventListener('resize', () => {
    const isMobileNow = window.innerWidth <= 768
    if (isMobileNow && isExpanded) {
      isExpanded = false
      bestiaryList.style.display = 'none'
      bestiaryToggle.textContent = '怪物图鉴 ▶'
    }
  })
}

// 疯狂模式按钮（等待游戏场景创建后再绑定）
const crazyModeBtn = document.getElementById('crazy-mode-btn')
if (crazyModeBtn) {
  let crazyModeEnabled = false
  
  // 等待BattleScene创建
  const setupCrazyMode = () => {
    const battleScene = (window as any).battleScene
    if (!battleScene) {
      // 如果场景还没创建，延迟重试
      setTimeout(setupCrazyMode, 100)
      return
    }
    
    // 绑定点击事件
    crazyModeBtn.addEventListener('click', () => {
      crazyModeEnabled = !crazyModeEnabled
      
      // 切换疯狂模式
      battleScene.setCrazyMode(crazyModeEnabled)
      
      // 更新按钮样式和文本
      if (crazyModeEnabled) {
        crazyModeBtn.textContent = '疯狂模式 ON'
        crazyModeBtn.classList.add('active')
      } else {
        crazyModeBtn.textContent = '疯狂模式 OFF'
        crazyModeBtn.classList.remove('active')
      }
    })
  }
  
  setupCrazyMode()
}

// 加载并显示版本信息
const loadVersionInfo = async () => {
  try {
    const response = await fetch('/version.json')
    if (response.ok) {
      const versionInfo = await response.json()
      const versionEl = document.getElementById('version-info')
      if (versionEl) {
        versionEl.textContent = `v${versionInfo.version} | ${versionInfo.buildTimeLocal}`
      }
    }
  } catch (error) {
    // 如果无法加载版本信息，显示默认值
    const versionEl = document.getElementById('version-info')
    if (versionEl) {
      versionEl.textContent = 'v1.0.0 | 开发模式'
    }
  }
}

// 页面加载后显示版本信息
loadVersionInfo()

// Debug按钮功能
const debugBtn = document.getElementById('debug-btn')
const debugPanel = document.getElementById('debug-panel')
const debugClose = document.getElementById('debug-close')
const debugSkillList = document.getElementById('debug-skill-list')

if (debugBtn && debugPanel && debugClose && debugSkillList) {
  // 等待BattleScene创建
  const setupDebugPanel = () => {
    const battleScene = (window as any).battleScene
    if (!battleScene) {
      setTimeout(setupDebugPanel, 100)
      return
    }
    
    // 打开/关闭面板
    debugBtn.addEventListener('click', () => {
      const isVisible = debugPanel.style.display !== 'none'
      if (isVisible) {
        debugPanel.style.display = 'none'
      } else {
        updateDebugSkillList()
        debugPanel.style.display = 'flex'
      }
    })
    
    debugClose.addEventListener('click', () => {
      debugPanel.style.display = 'none'
    })
    
    // 更新技能列表
    const updateDebugSkillList = () => {
      debugSkillList.innerHTML = ''
      
      // 导入技能定义
      import('./game/skills/skillDefs').then(({ SKILL_DEFS }) => {
        const skills = battleScene.skills
        
        // 按主技能分组显示
        const mainSkills: { [key: string]: any[] } = {}
        const upgradeSkills: any[] = []
        
        for (const skillDef of Object.values(SKILL_DEFS)) {
          const currentLevel = skills.getLevel(skillDef.id)
          const maxLevel = skillDef.maxLevel
          const isMaxLevel = currentLevel >= maxLevel
          
          const skillItem = {
            id: skillDef.id,
            name: skillDef.name,
            desc: skillDef.desc,
            type: skillDef.type,
            currentLevel,
            maxLevel,
            isMaxLevel,
            requires: skillDef.requires,
          }
          
          if (skillDef.type === 'main') {
            if (!mainSkills[skillDef.id]) {
              mainSkills[skillDef.id] = []
            }
            mainSkills[skillDef.id].push(skillItem)
          } else {
            upgradeSkills.push(skillItem)
          }
        }
        
        // 显示主技能
        for (const [mainId, items] of Object.entries(mainSkills)) {
          const item = items[0]
          const div = document.createElement('div')
          div.className = `debug-skill-item ${item.isMaxLevel ? 'max-level' : ''}`
          div.innerHTML = `
            <div class="debug-skill-item-name">${item.name}</div>
            <div class="debug-skill-item-desc">${item.desc}</div>
            <div class="debug-skill-item-level">等级: ${item.currentLevel}/${item.maxLevel}</div>
          `
          if (!item.isMaxLevel) {
            div.addEventListener('click', () => {
              skills.levelUp(item.id)
              // 更新技能栏（如果方法存在）
              if (typeof battleScene.updateSkillsBar === 'function') {
                battleScene.updateSkillsBar()
              }
              updateDebugSkillList()
            })
          }
          debugSkillList.appendChild(div)
        }
        
        // 显示分支升级（按主技能分组）
        const upgradeGroups: { [key: string]: any[] } = {}
        for (const item of upgradeSkills) {
          if (!item.requires) continue
          if (!upgradeGroups[item.requires]) {
            upgradeGroups[item.requires] = []
          }
          upgradeGroups[item.requires].push(item)
        }
        
        for (const [mainId, items] of Object.entries(upgradeGroups)) {
          // 检查主技能是否已解锁
          const mainSkillUnlocked = skills.isUnlocked(mainId)
          if (!mainSkillUnlocked) continue
          
          for (const item of items) {
            const div = document.createElement('div')
            div.className = `debug-skill-item ${item.isMaxLevel ? 'max-level' : ''}`
            div.innerHTML = `
              <div class="debug-skill-item-name">${item.name}</div>
              <div class="debug-skill-item-desc">${item.desc}</div>
              <div class="debug-skill-item-level">等级: ${item.currentLevel}/${item.maxLevel}</div>
            `
            if (!item.isMaxLevel) {
              div.addEventListener('click', () => {
                skills.levelUp(item.id)
                // 更新技能栏（如果方法存在）
                if (typeof battleScene.updateSkillsBar === 'function') {
                  battleScene.updateSkillsBar()
                }
                updateDebugSkillList()
              })
            }
            debugSkillList.appendChild(div)
          }
        }
      })
    }
  }
  
  setupDebugPanel()
}
