/**
 * 音频管理器：使用Web Audio API生成游戏音效和BGM
 */
export class AudioManager {
  private audioContext: AudioContext | null = null
  private bgmGainNode: GainNode | null = null
  private sfxGainNode: GainNode | null = null
  private bgmOscillator: OscillatorNode | null = null
  private bgmPlaying = false

  constructor() {
    // 延迟初始化AudioContext（需要用户交互后才能创建）
  }

  /**
   * 初始化音频上下文（需要在用户交互后调用）
   */
  init() {
    if (this.audioContext) return
    
    try {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
      
      // 创建音量控制节点
      this.bgmGainNode = this.audioContext.createGain()
      this.bgmGainNode.gain.value = 0.3  // BGM音量30%
      this.bgmGainNode.connect(this.audioContext.destination)
      
      this.sfxGainNode = this.audioContext.createGain()
      this.sfxGainNode.gain.value = 0.5  // 音效音量50%
      this.sfxGainNode.connect(this.audioContext.destination)
    } catch (e) {
      console.warn('AudioContext not supported:', e)
    }
  }

  /**
   * 播放BGM（动感的电子音乐）
   */
  playBGM() {
    // 如果已经在播放，不重复播放
    if (this.bgmPlaying) return
    
    // 确保音频上下文已初始化
    this.init()
    if (!this.audioContext || !this.bgmGainNode) return
    
    this.bgmPlaying = true
    
    // 创建低音节奏（Bass）
    const bassOsc = this.audioContext.createOscillator()
    const bassGain = this.audioContext.createGain()
    bassOsc.type = 'square'
    bassOsc.frequency.value = 60  // C2
    bassGain.gain.value = 0.15
    bassOsc.connect(bassGain)
    bassGain.connect(this.bgmGainNode)
    
    // 创建主旋律（Lead）
    const leadOsc = this.audioContext.createOscillator()
    const leadGain = this.audioContext.createGain()
    leadOsc.type = 'sawtooth'
    leadOsc.frequency.value = 220  // A3
    leadGain.gain.value = 0.1
    leadOsc.connect(leadGain)
    leadGain.connect(this.bgmGainNode)
    
    // 创建高音（Hi-hat效果）
    const hiOsc = this.audioContext.createOscillator()
    const hiGain = this.audioContext.createGain()
    hiOsc.type = 'triangle'
    hiOsc.frequency.value = 880  // A5
    hiGain.gain.value = 0.05
    hiOsc.connect(hiGain)
    hiGain.connect(this.bgmGainNode)
    
    // 创建LFO（低频振荡器）用于颤音效果
    const lfo = this.audioContext.createOscillator()
    const lfoGain = this.audioContext.createGain()
    lfo.type = 'sine'
    lfo.frequency.value = 4  // 4Hz颤音
    lfoGain.gain.value = 10
    lfo.connect(lfoGain)
    lfoGain.connect(leadOsc.frequency)
    
    // 启动所有振荡器
    bassOsc.start()
    leadOsc.start()
    hiOsc.start()
    lfo.start()
    
    // 保存引用以便停止
    this.bgmOscillator = leadOsc
    
    // 创建节奏变化（每2秒改变一次频率）
    let beatCount = 0
    const beatInterval = setInterval(() => {
      if (!this.bgmPlaying || !this.audioContext) {
        clearInterval(beatInterval)
        return
      }
      
      beatCount++
      const notes = [220, 247, 277, 294, 330, 370, 415, 440]  // A3到A4的音阶
      const note = notes[beatCount % notes.length]
      
      if (leadOsc) {
        leadOsc.frequency.setValueAtTime(note, this.audioContext.currentTime)
      }
      
      // 低音节奏
      if (bassOsc && beatCount % 2 === 0) {
        bassOsc.frequency.setValueAtTime(60, this.audioContext.currentTime)
      }
    }, 2000)
    
    // 保存清理函数
    ;(this as any)._bgmCleanup = () => {
      clearInterval(beatInterval)
      try {
        bassOsc?.stop()
        leadOsc?.stop()
        hiOsc?.stop()
        lfo?.stop()
      } catch (e) {
        // 忽略停止错误
      }
    }
  }

  /**
   * 停止BGM
   */
  stopBGM() {
    if (!this.bgmPlaying) return
    
    this.bgmPlaying = false
    
    if ((this as any)._bgmCleanup) {
      ;(this as any)._bgmCleanup()
    }
    
    if (this.bgmOscillator) {
      try {
        this.bgmOscillator.stop()
      } catch (e) {
        // 忽略停止错误
      }
      this.bgmOscillator = null
    }
  }

  /**
   * 播放子弹发射音效
   */
  playShootSound() {
    if (!this.audioContext || !this.sfxGainNode) {
      this.init()
      if (!this.audioContext || !this.sfxGainNode) return
    }
    
    const now = this.audioContext.currentTime
    
    // 创建主音调（短促的"砰"声）
    const osc1 = this.audioContext.createOscillator()
    const gain1 = this.audioContext.createGain()
    osc1.type = 'square'
    osc1.frequency.setValueAtTime(400, now)
    osc1.frequency.exponentialRampToValueAtTime(200, now + 0.05)
    gain1.gain.setValueAtTime(0.3, now)
    gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.05)
    
    osc1.connect(gain1)
    gain1.connect(this.sfxGainNode)
    
    // 创建高频音效（"咻"声）
    const osc2 = this.audioContext.createOscillator()
    const gain2 = this.audioContext.createGain()
    osc2.type = 'sine'
    osc2.frequency.setValueAtTime(800, now)
    osc2.frequency.exponentialRampToValueAtTime(1200, now + 0.03)
    gain2.gain.setValueAtTime(0.2, now)
    gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.03)
    
    osc2.connect(gain2)
    gain2.connect(this.sfxGainNode)
    
    // 启动并自动停止
    osc1.start(now)
    osc1.stop(now + 0.05)
    osc2.start(now)
    osc2.stop(now + 0.03)
  }

  /**
   * 设置BGM音量（0-1）
   */
  setBGMVolume(volume: number) {
    if (this.bgmGainNode) {
      this.bgmGainNode.gain.value = Math.max(0, Math.min(1, volume))
    }
  }

  /**
   * 设置音效音量（0-1）
   */
  setSFXVolume(volume: number) {
    if (this.sfxGainNode) {
      this.sfxGainNode.gain.value = Math.max(0, Math.min(1, volume))
    }
  }

  /**
   * 销毁音频管理器
   */
  destroy() {
    this.stopBGM()
    if (this.audioContext) {
      this.audioContext.close().catch(() => {})
      this.audioContext = null
    }
  }
}

