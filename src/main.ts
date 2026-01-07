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
  <div id="player-stats" style="display: none;">
    <div class="player-stats-title">主武器</div>
    <div class="player-stats-item">子弹散射: Lv.0</div>
  </div>
  <div id="bestiary">
    <div class="bestiary-title" id="bestiary-toggle">怪物图鉴 ▼</div>
    <div class="bestiary-list" id="bestiary-list"></div>
  </div>
  <div id="skills-bar">
    <div class="skills-bar-title">已选技能</div>
    <div class="skills-bar-list" id="skills-bar-list"></div>
  </div>
  <button id="crazy-mode-btn" class="crazy-mode-btn">疯狂模式 OFF</button>
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
