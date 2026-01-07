import type { Grid, GridCoord } from './Grid'

export type PlacementConfig = Readonly<{
  /** 固定路径格：不可放置（后续会替换为真正寻路/路径图层） */
  blockedCells: ReadonlySet<string>
  towerCost: number
}>

export class Placement {
  private occupied = new Set<string>()
  private readonly blocked: ReadonlySet<string>
  readonly towerCost: number
  private readonly grid: Grid

  constructor(grid: Grid, cfg: PlacementConfig) {
    this.grid = grid
    this.blocked = cfg.blockedCells
    this.towerCost = cfg.towerCost
  }

  isBlocked(c: GridCoord) {
    return this.blocked.has(this.grid.key(c))
  }

  isOccupied(c: GridCoord) {
    return this.occupied.has(this.grid.key(c))
  }

  canPlaceTower(c: GridCoord, gold: number) {
    if (!this.grid.isInside(c)) return false
    if (this.isBlocked(c)) return false
    if (this.isOccupied(c)) return false
    if (gold < this.towerCost) return false
    return true
  }

  placeTower(c: GridCoord) {
    this.occupied.add(this.grid.key(c))
  }
}


