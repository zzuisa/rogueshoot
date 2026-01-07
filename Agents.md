# Agents.md - 项目开发指南

本文档用于指导 AI Agent 理解和维护此项目。

## 项目概述

这是一个基于 **Phaser 3** 和 **TypeScript** 开发的僵尸生存游戏（Roguelike 风格）。游戏采用垂直战场布局（360x640），玩家在底部防线抵御从上方涌来的僵尸。

### 技术栈
- **游戏引擎**: Phaser 3.90.0
- **编程语言**: TypeScript 5.9.3
- **构建工具**: Vite 7.2.4
- **部署**: Nginx (路径: `/usr/share/nginx/zombies/dist`)

---

## 项目结构

```
rogueshoot/
├── src/                          # 源代码目录
│   ├── main.ts                   # 应用入口，初始化HTML和UI
│   ├── style.css                 # 全局样式文件
│   └── game/                     # 游戏核心代码
│       ├── startGame.ts          # 游戏启动配置
│       ├── entities/             # 游戏实体类
│       │   ├── Player.ts         # 玩家类
│       │   ├── Zombie.ts         # 僵尸类
│       │   ├── Bullet.ts         # 子弹类
│       │   ├── Tornado.ts        # 龙卷风实体
│       │   └── zombieTypes.ts    # 僵尸类型定义
│       ├── scenes/               # Phaser场景
│       │   ├── BootScene.ts      # 启动场景
│       │   └── BattleScene.ts    # 战斗场景（核心逻辑）
│       └── skills/               # 技能系统
│           ├── skillDefs.ts      # 技能定义和元数据
│           ├── SkillSystem.ts    # 技能系统核心逻辑
│           └── SkillPool.ts       # 技能池管理
├── public/                        # 静态资源
│   └── version.json              # 版本信息（构建时生成）
├── dist/                         # 构建输出目录
├── index.html                    # HTML入口文件
├── vite.config.ts                # Vite配置
├── vite-plugin-version.ts        # 版本信息生成插件
├── tsconfig.json                 # TypeScript配置
├── package.json                  # 项目依赖和脚本
├── deploy.sh                     # 部署脚本
└── DEPLOY.md                     # 部署说明文档
```

---

## 核心文件功能说明

### 1. 入口文件

#### `src/main.ts`
- **功能**: 应用入口，初始化HTML结构和UI元素
- **职责**:
  - 创建游戏容器和HUD界面
  - 生成怪物图鉴
  - 设置技能栏
  - 加载并显示版本信息
  - 启动游戏实例
- **关键元素**:
  - `#game-root`: 游戏渲染容器
  - `#hud`: 游戏HUD（血量、等级、经验、波次）
  - `#player-stats`: 主武器信息面板（可折叠）
  - `#bestiary`: 怪物图鉴（可折叠）
  - `#skills-bar`: 已选技能列表
  - `#version-info`: 版本信息显示（底部居中）

#### `src/game/startGame.ts`
- **功能**: 创建和配置Phaser游戏实例
- **配置要点**:
  - 像素风格渲染（`pixelArt: true`）
  - 垂直战场布局（360x640）
  - 60FPS目标帧率
  - 自适应缩放（FIT模式）

### 2. 游戏场景

#### `src/game/scenes/BattleScene.ts` ⭐ **核心文件**
- **功能**: 战斗场景，包含所有游戏逻辑
- **主要职责**:
  - 游戏循环和更新逻辑
  - 僵尸生成和波次管理
  - 玩家控制和射击
  - 技能系统集成
  - 碰撞检测
  - UI更新（HUD、技能栏、怪物图鉴）
  - 技能范围显示（弧形指示器）
- **关键方法**:
  - `update()`: 游戏主循环
  - `spawnZombie()`: 生成僵尸
  - `castMainSkill()`: 释放主技能
  - `updateSkillsBar()`: 更新技能栏UI
  - `showSkillRange()` / `hideSkillRange()`: 显示/隐藏技能范围
  - `hasEnemyInSkillRange()`: 检查技能范围内是否有敌人
  - `getSkillActualRange()`: 获取技能实际范围
- **重要属性**:
  - `player`: 玩家实例
  - `zombies`: 僵尸数组
  - `skills`: 技能系统实例
  - `currentWave`: 当前波次
  - `defenseLineY`: 防线Y坐标

#### `src/game/scenes/BootScene.ts`
- **功能**: 启动场景，用于预加载资源（当前为空场景）

### 3. 游戏实体

#### `src/game/entities/Player.ts`
- **功能**: 玩家实体类
- **属性**:
  - `x`, `y`: 位置
  - `range`: 射程
  - `hp`: 血量
- **方法**:
  - `shoot()`: 射击
  - `takeDamage()`: 受到伤害

#### `src/game/entities/Zombie.ts`
- **功能**: 僵尸实体类
- **属性**:
  - `x`, `y`: 位置
  - `hp`, `maxHp`: 血量和最大血量
  - `speed`: 移动速度
  - `type`: 僵尸类型
- **方法**:
  - `update()`: 更新逻辑
  - `takeDamage()`: 受到伤害
  - `applyFreeze()`: 应用冻结效果
  - `applyBurn()`: 应用燃烧效果

#### `src/game/entities/zombieTypes.ts`
- **功能**: 定义所有僵尸类型
- **结构**: 包含基础僵尸、快速僵尸、坦克僵尸、Boss等类型定义

### 4. 技能系统

#### `src/game/skills/skillDefs.ts` ⭐ **重要文件**
- **功能**: 定义所有技能的元数据
- **结构**:
  - `SKILL_DEFS`: 技能定义对象
  - `SkillDef`: 技能定义类型
  - `SkillRange`: 技能范围类型（支持 circle, rect, line, arc, arcRange）
- **技能类型**:
  - `main`: 主技能
  - `upgrade`: 升级技能（damage, cooldown, count, radius, duration）
- **关键属性**:
  - `id`: 技能ID
  - `name`: 显示名称
  - `desc`: 描述（包含数值范围）
  - `weight`: 出现权重
  - `maxLevel`: 最大等级
  - `range`: 技能范围定义
- **注意**: 技能描述必须包含精确的数值范围（如 "半径: 18-42px"）

#### `src/game/skills/SkillSystem.ts`
- **功能**: 技能系统核心逻辑
- **职责**:
  - 管理技能等级
  - 计算技能属性（伤害、冷却、范围、数量、持续时间）
  - 技能升级逻辑
  - 技能池管理

#### `src/game/skills/SkillPool.ts`
- **功能**: 技能池管理，用于随机选择技能

### 5. 样式文件

#### `src/style.css`
- **功能**: 全局样式定义
- **关键样式**:
  - `.version-info`: 版本信息（底部居中）
  - `#player-stats`: 主武器信息面板（z-index: 5）
  - `#skills-bar`: 技能栏（左下角）
  - `#bestiary`: 怪物图鉴（右上角）
  - `#hud`: 游戏HUD（顶部）
- **响应式**: 包含移动端和横屏适配

### 6. 构建和部署

#### `vite-plugin-version.ts`
- **功能**: Vite插件，在构建时生成版本信息文件
- **输出**: `public/version.json`（包含版本号和构建时间）

#### `deploy.sh`
- **功能**: 部署脚本
- **流程**:
  1. 检查 `dist/` 目录是否存在
  2. 备份现有部署目录到 `/usr/share/nginx/zombies/backups/`
  3. 复制新文件到 `/usr/share/nginx/zombies/dist/`
  4. 设置文件权限（www-data:www-data, 755）
  5. 清理旧备份（保留最近10个）
- **使用**: 通过 `npm run build` 自动执行

---

## 代码编写规范

### 1. 添加新技能

**步骤**:
1. 在 `src/game/skills/skillDefs.ts` 中添加技能定义:
   ```typescript
   new_skill: main('new_skill', '技能名', '描述\n参数: 范围', weight, maxLevel, { 
     type: 'arcRange',  // 或 'circle', 'rect', 'line', 'arc'
     radius: 100,       // 根据类型调整
     anglePercent: 0.8   // 弧形范围需要
   })
   ```
2. 在 `src/game/scenes/BattleScene.ts` 中添加技能实现:
   ```typescript
   private castNewSkill(lv: number) {
     // 检查范围内是否有敌人（可选，但推荐）
     const target = this.pickNearestZombie()
     if (!target) return
     
     // 技能逻辑
     const dmg = (base + lv * mult) * this.skills.getDamageMult('new_skill')
     // ...
   }
   ```
3. 在 `castMainSkill()` 方法中添加调用:
   ```typescript
   case 'new_skill':
     this.castNewSkill(lv)
     break
   ```
4. 在 `getSkillActualRange()` 中添加范围计算（如果是新类型）

### 2. 修改技能范围

**步骤**:
1. 在 `skillDefs.ts` 中修改技能的 `range` 属性
2. 在 `BattleScene.ts` 的 `getSkillActualRange()` 中添加或修改范围计算逻辑
3. 确保 `hasEnemyInSkillRange()` 支持该范围类型
4. 确保 `drawSkillRange()` 能正确绘制该范围类型

### 3. 添加新实体

**步骤**:
1. 在 `src/game/entities/` 中创建新实体类
2. 继承 `Phaser.GameObjects.GameObject` 或使用组合模式
3. 在 `BattleScene.ts` 中管理实体生命周期
4. 在 `update()` 方法中更新实体

### 4. 修改UI元素

**步骤**:
1. 在 `src/main.ts` 中修改HTML结构
2. 在 `src/style.css` 中添加或修改样式
3. 在 `BattleScene.ts` 中更新UI逻辑（如 `updateSkillsBar()`）

### 5. 技能范围显示

**要点**:
- 使用 `arcRange` 类型显示弧形范围（类似玩家射程指示器）
- 弧形范围：80% 圆弧，保留 20% 盲区朝下
- 使用 `strokeDashedArc()` 绘制虚线弧形
- 按住技能时显示范围，松开时隐藏

### 6. 技能触发条件

**要点**:
- 所有技能都应该检查范围内是否有敌人
- 使用 `hasEnemyInSkillRange()` 方法检查
- 如果范围内没有敌人，设置很短的冷却时间（10%）快速重试

---

## 开发与部署流程

### 🚀 开发模式（实时调试，无需构建）

**当前配置**：Nginx 已配置为代理到开发服务器（`proxy_pass http://localhost:5173`），可以直接通过域名实时调试。

#### 启动开发服务器

```bash
# 启动开发服务器（后台运行）
npm run dev

# 或者前台运行（可以看到日志）
npm run dev
```

**⚠️ 重要**：
- 开发服务器必须保持运行，否则网站无法访问
- 修改代码后保存即可，浏览器会自动热更新（HMR）
- 无需构建，直接通过 `https://ai.roguelife.de` 访问即可看到效果
- 如果开发服务器停止，需要重新启动

#### 检查开发服务器状态

```bash
# 检查开发服务器是否运行
ps aux | grep vite

# 如果未运行，启动它
npm run dev
```

#### 开发模式优势

- ✅ **实时热更新**：修改 CSS/TS 后立即生效
- ✅ **无需构建**：节省时间，快速迭代
- ✅ **Source Maps**：完整的调试支持
- ✅ **快速反馈**：保存即看到效果

### 📦 生产部署（正式发布）

**仅在需要发布生产版本时使用**：

```bash
# 方式1：构建并自动部署（推荐，默认递增小版本号）
npm run build

# 方式2：仅构建，不部署
npm run build:only

# 方式3：仅部署（需要先构建，默认递增小版本号）
npm run deploy

# 方式4：部署并递增小版本号 (v1.0.0 -> v1.0.1)
npm run deploy:patch

# 方式5：部署并递增中版本号 (v1.0.0 -> v1.1.0)
npm run deploy:minor

# 方式6：部署并递增大版本号 (v1.0.0 -> v2.0.0)
npm run deploy:major
```

**版本号递增规则**:
- **小版本号 (patch)**: 修复bug、小改动 → `v1.0.0` → `v1.0.1`（默认）
- **中版本号 (minor)**: 新功能、新技能 → `v1.0.0` → `v1.1.0`
- **大版本号 (major)**: 重大更新、架构变更 → `v1.0.0` → `v2.0.0`

**⚠️ 重要**: 每次部署都会自动递增版本号，无需手动修改 `package.json`！

### 生产部署流程说明

1. **构建阶段** (`npm run build`):
   - 运行 TypeScript 编译检查
   - Vite 构建生产版本
   - **自动执行** `deploy.sh`

2. **部署阶段** (`deploy.sh`):
   - **自动递增版本号**（在构建前执行）
     - 读取 `package.json` 中的当前版本号
     - 根据参数递增版本号（patch/minor/major）
     - 更新 `package.json` 中的版本号
   - 运行 Vite 构建（使用新版本号生成版本信息文件 `public/version.json`）
   - 检查 `dist/` 目录是否存在
   - 备份现有部署到 `/usr/share/nginx/zombies/backups/`
   - 复制新文件到 `/usr/share/nginx/zombies/dist/`
   - 设置文件权限
   - 清理旧备份（保留最近10个）
   - 显示新版本号信息

### ⚠️ 开发模式注意事项

**当前 Nginx 配置**：
- Nginx 已配置为 `proxy_pass http://localhost:5173`
- 访问 `https://ai.roguelife.de` 会直接连接到开发服务器
- **开发服务器必须保持运行**，否则网站无法访问

**每次修改代码时**：
1. ✅ 确保开发服务器正在运行（`npm run dev`）
2. ✅ 修改代码并保存
3. ✅ 浏览器自动热更新，立即看到效果
4. ❌ **不需要**运行 `npm run build`

**切换到生产模式**：
如果需要切换到生产版本，需要修改 Nginx 配置：
```bash
# 恢复为静态文件服务
sudo vim /etc/nginx/sites-available/ai.roguelife.de.conf
# 将 proxy_pass 改为 root /usr/share/nginx/zombies/dist
sudo nginx -t && sudo systemctl reload nginx
```

### 部署路径

- **部署目录**: `/usr/share/nginx/zombies/dist`
- **备份目录**: `/usr/share/nginx/zombies/backups`
- **Nginx配置**: 参考 `nginx.conf.example`

---

## 开发注意事项

### 1. 版本信息
- 版本号在 `package.json` 中定义
- 构建时间自动生成
- 版本信息显示在游戏界面底部居中

### 2. 技能范围
- **弧形范围** (`arcRange`): 用于大多数范围技能，类似玩家射程指示器
- **圆形范围** (`circle`): 全方向范围
- **矩形范围** (`rect`): 用于极光、装甲车等
- **线段范围** (`line`): 用于干冰弹、高能射线等
- **扇形范围** (`arc`): 固定角度的扇形

### 3. 技能触发
- **必须检查范围内是否有敌人**（使用 `hasEnemyInSkillRange()`）
- 避免技能空放，浪费冷却时间
- 如果范围内没有敌人，设置短冷却快速重试

### 4. UI层级
- 技能选择界面: z-index 1000（最高）
- 版本信息: z-index 15
- 主武器信息: z-index 5（避免遮挡技能选择）
- 其他UI元素: z-index 10

### 5. 代码风格
- 使用 TypeScript 严格模式
- 遵循现有代码风格
- 添加必要的注释
- 函数和类使用 JSDoc 注释

### 6. 性能优化
- 避免在 `update()` 中创建大量对象
- 使用对象池管理子弹、粒子等
- 及时清理不需要的图形对象

---

## 常见任务

### 修改技能数值
1. 编辑 `src/game/skills/skillDefs.ts` 中的技能定义
2. 更新描述中的数值范围
3. 运行 `npm run build` 部署

### 添加新僵尸类型
1. 在 `src/game/entities/zombieTypes.ts` 中添加类型定义
2. 在 `src/game/scenes/BattleScene.ts` 的 `spawnZombie()` 中使用
3. 更新怪物图鉴（`src/main.ts`）
4. 保存文件，浏览器自动热更新（开发模式）
5. 如需发布生产版本，运行 `npm run build`

### 修改游戏平衡
1. 修改技能伤害、冷却等数值（`skillDefs.ts`）
2. 修改僵尸血量、速度等（`zombieTypes.ts` 或 `BattleScene.ts`）
3. 修改波次难度（`BattleScene.ts` 的 `updateDifficulty()`）
4. 保存文件，浏览器自动热更新（开发模式）
5. 如需发布生产版本，运行 `npm run build`

### 修复Bug
1. 确保开发服务器正在运行（`npm run dev`）
2. 定位问题代码
3. 修复问题
4. 保存文件，浏览器自动热更新
5. 测试验证
6. 提交到 git：`git add . && git commit -m "fix: 描述修复内容"`
7. 如需发布生产版本，运行 `npm run build`

---

## 重要提醒

### ⚠️ 开发模式：保持开发服务器运行

**当前配置**：Nginx 已指向开发服务器，**每次修改代码时**：

1. ✅ **确保开发服务器运行**：
   ```bash
   # 检查是否运行
   ps aux | grep vite
   
   # 如果未运行，启动它
   npm run dev
   ```

2. ✅ **修改代码并保存**：浏览器会自动热更新

3. ✅ **无需构建**：直接通过 `https://ai.roguelife.de` 访问即可

4. ✅ **提交到 git**：
   ```bash
   git add .
   git commit -m "描述你的修改"
   ```

**⚠️ 重要**：
- 开发服务器必须保持运行，停止后网站无法访问
- 修改代码后保存即可，无需运行 `npm run build`
- 仅在需要发布生产版本时才运行 `npm run build`

### 📦 生产部署（仅在需要时）

**仅在需要发布生产版本时执行**：
```bash
npm run build
```

这将自动：
1. 编译 TypeScript
2. 构建生产版本
3. 备份现有部署
4. 部署到 `/usr/share/nginx/zombies/dist`
5. 设置正确的文件权限
6. 自动递增版本号
---

## 联系和参考

- **部署说明**: 查看 `DEPLOY.md`
- **Nginx配置**: 参考 `nginx.conf.example`
- **版本信息**: 查看 `public/version.json`（构建后生成）

---

**最后更新**: 2026-01-07
**项目版本**: 1.0.0

