import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useSettingsStore } from './useSettingsStore'

const buildLocalStorageMock = () => {
  const bucket = new Map<string, string>()

  return {
    getItem: (key: string): string | null => bucket.get(key) ?? null,
    setItem: (key: string, value: string): void => {
      bucket.set(key, value)
    },
    removeItem: (key: string): void => {
      bucket.delete(key)
    },
    clear: (): void => {
      bucket.clear()
    },
    key: (index: number): string | null => Array.from(bucket.keys())[index] ?? null,
    get length(): number {
      return bucket.size
    },
  }
}

describe('useSettingsStore', () => {
  beforeEach(() => {
    const storage = buildLocalStorageMock()
    vi.stubGlobal('localStorage', storage)
    setActivePinia(createPinia())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('初始化时会从 localStorage 读取配置', () => {
    localStorage.setItem(
      'guandan.training.settings.v1',
      JSON.stringify({
        llmBaseUrl: 'https://api.deepseek.com/v1',
        llmApiKey: 'sk-test-read',
        llmModel: 'deepseek-chat',
        seat0Personality: 'aggressive',
        battleEnableAntiTribute: false,
        battleEnableDoubleDownTribute: false,
        battleReturnTributeRule: 'lowest_only',
        battlePlaybackSpeed: 'fast',
      }),
    )

    const store = useSettingsStore()
    expect(store.llmBaseUrl).toBe('https://api.deepseek.com/v1')
    expect(store.llmApiKey).toBe('sk-test-read')
    expect(store.llmModel).toBe('deepseek-chat')
    expect(store.seat0Personality).toBe('aggressive')
    expect(store.battleEnableAntiTribute).toBe(false)
    expect(store.battleEnableDoubleDownTribute).toBe(false)
    expect(store.battleReturnTributeRule).toBe('lowest_only')
    expect(store.battlePlaybackSpeed).toBe('fast')
    expect(store.showBattleStrategyPanel).toBe(true)
    expect(store.llmModelHistory.length).toBeGreaterThan(0)
  })

  it('更新配置后会自动持久化到 localStorage', () => {
    const store = useSettingsStore()
    store.setSettings({
      llmBaseUrl: ' https://api.minimax.com/v1 ',
      llmApiKey: ' sk-test-write ',
      llmModel: ' MiniMax-Text-01 ',
      llmModelHistory: [' MiniMax-Text-01 ', 'deepseek-chat', 'MiniMax-Text-01'],
      seat0Personality: 'conservative',
      battleEnableAntiTribute: false,
      battleEnableDoubleDownTribute: false,
      battleReturnTributeRule: 'lowest_only',
      battlePlaybackSpeed: 'instant',
      showBattleStrategyPanel: false,
    })

    const raw = localStorage.getItem('guandan.training.settings.v1')
    const persisted = raw
      ? (JSON.parse(raw) as {
          llmBaseUrl: string
          llmApiKey: string
          llmModel: string
          llmModelHistory: string[]
          seat0Personality: string
          battleEnableAntiTribute: boolean
          battleEnableDoubleDownTribute: boolean
          battleReturnTributeRule: string
          battlePlaybackSpeed: string
          showBattleStrategyPanel: boolean
        })
      : null

    expect(store.llmBaseUrl).toBe('https://api.minimax.com/v1')
    expect(store.llmApiKey).toBe('sk-test-write')
    expect(store.llmModel).toBe('MiniMax-Text-01')
    expect(store.llmModelHistory).toEqual(['MiniMax-Text-01', 'deepseek-chat'])
    expect(store.seat0Personality).toBe('conservative')
    expect(store.battleEnableAntiTribute).toBe(false)
    expect(store.battleEnableDoubleDownTribute).toBe(false)
    expect(store.battleReturnTributeRule).toBe('lowest_only')
    expect(store.battlePlaybackSpeed).toBe('instant')
    expect(store.showBattleStrategyPanel).toBe(false)
    expect(persisted?.llmBaseUrl).toBe('https://api.minimax.com/v1')
    expect(persisted?.llmApiKey).toBe('sk-test-write')
    expect(persisted?.llmModel).toBe('MiniMax-Text-01')
    expect(persisted?.llmModelHistory).toEqual(['MiniMax-Text-01', 'deepseek-chat'])
    expect(persisted?.seat0Personality).toBe('conservative')
    expect(persisted?.battleEnableAntiTribute).toBe(false)
    expect(persisted?.battleEnableDoubleDownTribute).toBe(false)
    expect(persisted?.battleReturnTributeRule).toBe('lowest_only')
    expect(persisted?.battlePlaybackSpeed).toBe('instant')
    expect(persisted?.showBattleStrategyPanel).toBe(false)
  })

  it('支持保存、应用与删除人格组合预设', () => {
    const store = useSettingsStore()
    store.setSettings({
      seat0Personality: 'aggressive',
      seat1Personality: 'balanced',
      seat2Personality: 'conservative',
      seat3Personality: 'aggressive',
    })

    const preset = store.saveBattlePersonaPreset('测试预设')
    expect(preset?.name).toBe('测试预设')
    expect(store.battlePersonaPresets.some((item) => item.name === '测试预设')).toBe(true)

    store.setSettings({
      seat0Personality: 'balanced',
      seat1Personality: 'aggressive',
      seat2Personality: 'balanced',
      seat3Personality: 'conservative',
    })

    const applied = preset ? store.applyBattlePersonaPreset(preset.id) : null
    expect(applied?.seat0Personality).toBe('aggressive')
    expect(store.seat0Personality).toBe('aggressive')
    expect(store.seat2Personality).toBe('conservative')

    if (preset) {
      store.deleteBattlePersonaPreset(preset.id)
    }
    expect(store.battlePersonaPresets.some((item) => item.name === '测试预设')).toBe(false)
  })
})
