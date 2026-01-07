import Phaser from 'phaser'

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' })
  }

  preload() {
    // 预留资源加载点：后续接入像素图集、音效、粒子贴图等
  }

  create() {
    this.scene.start('BattleScene')
  }
}


