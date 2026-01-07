export type GridCoord = Readonly<{ row: number; col: number }>

export type GridConfig = Readonly<{
  rows: number
  cols: number
  cellSize: number
  originX: number
  originY: number
}>

export class Grid {
  readonly rows: number
  readonly cols: number
  readonly cellSize: number
  readonly originX: number
  readonly originY: number

  constructor(cfg: GridConfig) {
    this.rows = cfg.rows
    this.cols = cfg.cols
    this.cellSize = cfg.cellSize
    this.originX = cfg.originX
    this.originY = cfg.originY
  }

  key(c: GridCoord) {
    return `${c.row},${c.col}`
  }

  isInside(c: GridCoord) {
    return c.row >= 0 && c.row < this.rows && c.col >= 0 && c.col < this.cols
  }

  cellTopLeft(c: GridCoord) {
    return {
      x: this.originX + c.col * this.cellSize,
      y: this.originY + c.row * this.cellSize,
    }
  }

  cellCenter(c: GridCoord) {
    const tl = this.cellTopLeft(c)
    return {
      x: tl.x + this.cellSize / 2,
      y: tl.y + this.cellSize / 2,
    }
  }

  worldToCell(x: number, y: number): GridCoord {
    const col = Math.floor((x - this.originX) / this.cellSize)
    const row = Math.floor((y - this.originY) / this.cellSize)
    return { row, col }
  }

  cellBounds(c: GridCoord) {
    const tl = this.cellTopLeft(c)
    return {
      x: tl.x,
      y: tl.y,
      w: this.cellSize,
      h: this.cellSize,
    }
  }
}


