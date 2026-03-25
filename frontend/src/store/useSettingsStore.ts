import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

export type AIPlayerPersonality = 'aggressive' | 'conservative' | 'balanced'
export type AIDecisionMode = 'candidate' | 'legacy'
export type AISpeechStyle = 'restrained' | 'normal' | 'taunt'
export type AITauntLevel = 'mild' | 'medium' | 'heavy'
export type BattlePlaybackSpeed = 'slow' | 'normal' | 'fast' | 'instant'
export type ReturnTributeRule = 'any_lower' | 'lowest_only'
export interface BattlePersonaPreset {
  id: string
  name: string
  seat0Personality: AIPlayerPersonality
  seat1Personality: AIPlayerPersonality
  seat2Personality: AIPlayerPersonality
  seat3Personality: AIPlayerPersonality
}

interface PersistedSettings {
  llmBaseUrl: string
  llmApiKey: string
  llmModel: string
  llmModelHistory?: string[]
  llmTimeoutMs?: number
  llmDecisionMode?: AIDecisionMode
  llmPromptAggressive?: string
  llmPromptConservative?: string
  llmPromptBalanced?: string
  llmProfileAggressive?: string
  llmProfileConservative?: string
  llmProfileBalanced?: string
  seat0Personality?: AIPlayerPersonality
  seat1Personality?: AIPlayerPersonality
  seat2Personality?: AIPlayerPersonality
  seat3Personality?: AIPlayerPersonality
  showBattleStrategyPanel?: boolean
  showBattleSpeechBubble?: boolean
  battleSpeechStyle?: AISpeechStyle
  battleTauntLevel?: AITauntLevel
  battleEnableAntiTribute?: boolean
  battleEnableDoubleDownTribute?: boolean
  battleReturnTributeRule?: ReturnTributeRule
  battlePlaybackSpeed?: BattlePlaybackSpeed
  battlePersonaPresets?: BattlePersonaPreset[]
}

const STORAGE_KEY = 'guandan.training.settings.v1'
const DEFAULT_LLM_MODELS = ['deepseek-chat', 'DeepSeek-V3.2-Exp', 'gpt-4o-mini', 'MiniMax-Text-01']
const DEFAULT_BATTLE_PERSONA_PRESETS: BattlePersonaPreset[] = [
  {
    id: 'preset-default',
    name: '默认均衡编排',
    seat0Personality: 'balanced',
    seat1Personality: 'aggressive',
    seat2Personality: 'balanced',
    seat3Personality: 'conservative',
  },
  {
    id: 'preset-pressure',
    name: '双压制实验',
    seat0Personality: 'aggressive',
    seat1Personality: 'aggressive',
    seat2Personality: 'balanced',
    seat3Personality: 'conservative',
  },
  {
    id: 'preset-control',
    name: '控资源编排',
    seat0Personality: 'balanced',
    seat1Personality: 'conservative',
    seat2Personality: 'balanced',
    seat3Personality: 'conservative',
  },
]

const normalizeText = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')
const normalizeModelList = (value: unknown): string[] => {
  const source = Array.isArray(value) ? value : []
  const dedupe = new Set<string>()
  for (const item of source) {
    const normalized = normalizeText(item)
    if (!normalized) {
      continue
    }
    dedupe.add(normalized)
  }
  return Array.from(dedupe).slice(0, 24)
}

const normalizeBattlePersonaPreset = (value: unknown, index: number): BattlePersonaPreset | null => {
  if (!value || typeof value !== 'object') {
    return null
  }

  const candidate = value as Partial<BattlePersonaPreset>
  const normalizePersonality = (personality: unknown, fallback: AIPlayerPersonality): AIPlayerPersonality =>
    personality === 'aggressive' || personality === 'balanced' || personality === 'conservative'
      ? personality
      : fallback

  const name = normalizeText(candidate.name)
  if (!name) {
    return null
  }

  return {
    id: normalizeText(candidate.id) || `preset-${index + 1}`,
    name,
    seat0Personality: normalizePersonality(candidate.seat0Personality, 'balanced'),
    seat1Personality: normalizePersonality(candidate.seat1Personality, 'aggressive'),
    seat2Personality: normalizePersonality(candidate.seat2Personality, 'balanced'),
    seat3Personality: normalizePersonality(candidate.seat3Personality, 'conservative'),
  }
}

const normalizeBattlePersonaPresets = (value: unknown): BattlePersonaPreset[] => {
  const source = Array.isArray(value) ? value : []
  const dedupe = new Map<string, BattlePersonaPreset>()

  source.forEach((item, index) => {
    const normalized = normalizeBattlePersonaPreset(item, index)
    if (!normalized) {
      return
    }
    dedupe.set(normalized.id, normalized)
  })

  return dedupe.size > 0 ? Array.from(dedupe.values()).slice(0, 12) : DEFAULT_BATTLE_PERSONA_PRESETS.map((preset) => ({ ...preset }))
}

const canUseLocalStorage = (): boolean => typeof globalThis.localStorage !== 'undefined'

const loadPersistedSettings = (): PersistedSettings => {
  const defaults: PersistedSettings = {
    llmBaseUrl: '', llmApiKey: '', llmModel: '', llmModelHistory: [...DEFAULT_LLM_MODELS], llmTimeoutMs: 60000, llmDecisionMode: 'candidate',
    llmPromptAggressive: '', llmPromptConservative: '', llmPromptBalanced: '',
    llmProfileAggressive: '', llmProfileConservative: '', llmProfileBalanced: '',
    seat0Personality: 'balanced',
    seat1Personality: 'aggressive', seat2Personality: 'balanced', seat3Personality: 'conservative',
    showBattleStrategyPanel: true,
    showBattleSpeechBubble: true,
    battleSpeechStyle: 'normal',
    battleTauntLevel: 'mild',
    battleEnableAntiTribute: true,
    battleEnableDoubleDownTribute: true,
    battleReturnTributeRule: 'any_lower',
    battlePlaybackSpeed: 'normal',
    battlePersonaPresets: DEFAULT_BATTLE_PERSONA_PRESETS.map((preset) => ({ ...preset })),
  }
  if (!canUseLocalStorage()) {
    return defaults
  }

  try {
    const raw = globalThis.localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return defaults
    }

    const parsed = JSON.parse(raw) as Partial<PersistedSettings> | null
    const savedModel = normalizeText(parsed?.llmModel)
    const modelHistory = normalizeModelList(parsed?.llmModelHistory)
    if (savedModel && !modelHistory.includes(savedModel)) {
      modelHistory.unshift(savedModel)
    }
    return {
      llmBaseUrl: normalizeText(parsed?.llmBaseUrl),
      llmApiKey: normalizeText(parsed?.llmApiKey),
      llmModel: savedModel,
      llmModelHistory: modelHistory.length > 0 ? modelHistory : [...DEFAULT_LLM_MODELS],
      llmTimeoutMs: typeof parsed?.llmTimeoutMs === 'number' ? parsed.llmTimeoutMs : 60000,
      llmDecisionMode: parsed?.llmDecisionMode === 'legacy' ? 'legacy' : 'candidate',
      llmPromptAggressive: normalizeText(parsed?.llmPromptAggressive),
      llmPromptConservative: normalizeText(parsed?.llmPromptConservative),
      llmPromptBalanced: normalizeText(parsed?.llmPromptBalanced),
      llmProfileAggressive: normalizeText(parsed?.llmProfileAggressive),
      llmProfileConservative: normalizeText(parsed?.llmProfileConservative),
      llmProfileBalanced: normalizeText(parsed?.llmProfileBalanced),
      seat0Personality: parsed?.seat0Personality ?? 'balanced',
      seat1Personality: parsed?.seat1Personality ?? 'aggressive',
      seat2Personality: parsed?.seat2Personality ?? 'balanced',
      seat3Personality: parsed?.seat3Personality ?? 'conservative',
      showBattleStrategyPanel: parsed?.showBattleStrategyPanel !== false,
      showBattleSpeechBubble: parsed?.showBattleSpeechBubble !== false,
      battleSpeechStyle:
        parsed?.battleSpeechStyle === 'restrained' || parsed?.battleSpeechStyle === 'taunt'
          ? parsed.battleSpeechStyle
          : 'normal',
      battleTauntLevel:
        parsed?.battleTauntLevel === 'medium' || parsed?.battleTauntLevel === 'heavy'
          ? parsed.battleTauntLevel
          : 'mild',
      battleEnableAntiTribute: parsed?.battleEnableAntiTribute !== false,
      battleEnableDoubleDownTribute: parsed?.battleEnableDoubleDownTribute !== false,
      battleReturnTributeRule: parsed?.battleReturnTributeRule === 'lowest_only' ? 'lowest_only' : 'any_lower',
      battlePlaybackSpeed:
        parsed?.battlePlaybackSpeed === 'slow' ||
        parsed?.battlePlaybackSpeed === 'fast' ||
        parsed?.battlePlaybackSpeed === 'instant'
          ? parsed.battlePlaybackSpeed
          : 'normal',
      battlePersonaPresets: normalizeBattlePersonaPresets(parsed?.battlePersonaPresets),
    }
  } catch {
    return defaults
  }
}

const persistSettings = (settings: PersistedSettings): void => {
  if (!canUseLocalStorage()) {
    return
  }

  try {
    globalThis.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch {
    // ignore storage write errors
  }
}

export const useSettingsStore = defineStore('settings', () => {
  const initial = loadPersistedSettings()
  const llmBaseUrl = ref(initial.llmBaseUrl)
  const llmApiKey = ref(initial.llmApiKey)
  const llmModel = ref(initial.llmModel)
  const llmModelHistory = ref<string[]>(normalizeModelList(initial.llmModelHistory).length > 0 ? normalizeModelList(initial.llmModelHistory) : [...DEFAULT_LLM_MODELS])
  const llmTimeoutMs = ref(initial.llmTimeoutMs)
  const llmDecisionMode = ref<AIDecisionMode>(initial.llmDecisionMode ?? 'candidate')
  const llmPromptAggressive = ref(initial.llmPromptAggressive)
  const llmPromptConservative = ref(initial.llmPromptConservative)
  const llmPromptBalanced = ref(initial.llmPromptBalanced)
  const llmProfileAggressive = ref(initial.llmProfileAggressive)
  const llmProfileConservative = ref(initial.llmProfileConservative)
  const llmProfileBalanced = ref(initial.llmProfileBalanced)
  const seat0Personality = ref<AIPlayerPersonality>(initial.seat0Personality ?? 'balanced')
  const seat1Personality = ref<AIPlayerPersonality>(initial.seat1Personality ?? 'aggressive')
  const seat2Personality = ref<AIPlayerPersonality>(initial.seat2Personality ?? 'balanced')
  const seat3Personality = ref<AIPlayerPersonality>(initial.seat3Personality ?? 'conservative')
  const showBattleStrategyPanel = ref(initial.showBattleStrategyPanel !== false)
  const showBattleSpeechBubble = ref(initial.showBattleSpeechBubble !== false)
  const battleSpeechStyle = ref<AISpeechStyle>(initial.battleSpeechStyle ?? 'normal')
  const battleTauntLevel = ref<AITauntLevel>(initial.battleTauntLevel ?? 'mild')
  const battleEnableAntiTribute = ref(initial.battleEnableAntiTribute !== false)
  const battleEnableDoubleDownTribute = ref(initial.battleEnableDoubleDownTribute !== false)
  const battleReturnTributeRule = ref<ReturnTributeRule>(initial.battleReturnTributeRule ?? 'any_lower')
  const battlePlaybackSpeed = ref<BattlePlaybackSpeed>(initial.battlePlaybackSpeed ?? 'normal')
  const battlePersonaPresets = ref<BattlePersonaPreset[]>(normalizeBattlePersonaPresets(initial.battlePersonaPresets))

  watch(
    [llmBaseUrl, llmApiKey, llmModel, llmModelHistory, llmTimeoutMs, llmDecisionMode, llmPromptAggressive, llmPromptConservative, llmPromptBalanced, llmProfileAggressive, llmProfileConservative, llmProfileBalanced, seat0Personality, seat1Personality, seat2Personality, seat3Personality, showBattleStrategyPanel, showBattleSpeechBubble, battleSpeechStyle, battleTauntLevel, battleEnableAntiTribute, battleEnableDoubleDownTribute, battleReturnTributeRule, battlePlaybackSpeed, battlePersonaPresets],
    ([nextBaseUrl, nextApiKey, nextModel, nextModelHistory, nextTimeoutMs, nextDecisionMode, pAgg, pCon, pBal, profAgg, profCon, profBal, s0, s1, s2, s3, showPanel, showSpeechBubble, speechStyle, tauntLevel, antiTributeEnabled, doubleDownEnabled, returnTributeRule, playbackSpeed, personaPresets]) => {
      persistSettings({
        llmBaseUrl: normalizeText(nextBaseUrl as string),
        llmApiKey: normalizeText(nextApiKey as string),
        llmModel: normalizeText(nextModel as string),
        llmModelHistory: normalizeModelList(nextModelHistory),
        llmTimeoutMs: nextTimeoutMs as number | undefined,
        llmDecisionMode: (nextDecisionMode === 'legacy' ? 'legacy' : 'candidate') as AIDecisionMode,
        llmPromptAggressive: normalizeText(pAgg as string),
        llmPromptConservative: normalizeText(pCon as string),
        llmPromptBalanced: normalizeText(pBal as string),
        llmProfileAggressive: normalizeText(profAgg as string),
        llmProfileConservative: normalizeText(profCon as string),
        llmProfileBalanced: normalizeText(profBal as string),
        seat0Personality: s0 as AIPlayerPersonality,
        seat1Personality: s1 as AIPlayerPersonality,
        seat2Personality: s2 as AIPlayerPersonality,
        seat3Personality: s3 as AIPlayerPersonality,
        showBattleStrategyPanel: showPanel as boolean,
        showBattleSpeechBubble: showSpeechBubble as boolean,
        battleSpeechStyle: speechStyle as AISpeechStyle,
        battleTauntLevel: tauntLevel as AITauntLevel,
        battleEnableAntiTribute: antiTributeEnabled as boolean,
        battleEnableDoubleDownTribute: doubleDownEnabled as boolean,
        battleReturnTributeRule: (returnTributeRule === 'lowest_only' ? 'lowest_only' : 'any_lower') as ReturnTributeRule,
        battlePlaybackSpeed: playbackSpeed as BattlePlaybackSpeed,
        battlePersonaPresets: normalizeBattlePersonaPresets(personaPresets),
      })
    },
    { flush: 'sync' },
  )

  const setSettings = (payload: Partial<PersistedSettings>): void => {
    if (payload.llmBaseUrl !== undefined) llmBaseUrl.value = normalizeText(payload.llmBaseUrl)
    if (payload.llmApiKey !== undefined) llmApiKey.value = normalizeText(payload.llmApiKey)
    if (payload.llmModel !== undefined) llmModel.value = normalizeText(payload.llmModel)
    if (payload.llmModelHistory !== undefined) llmModelHistory.value = normalizeModelList(payload.llmModelHistory)
    if (payload.llmTimeoutMs !== undefined) llmTimeoutMs.value = payload.llmTimeoutMs
    if (payload.llmDecisionMode !== undefined) llmDecisionMode.value = payload.llmDecisionMode === 'legacy' ? 'legacy' : 'candidate'
    if (payload.llmPromptAggressive !== undefined) llmPromptAggressive.value = normalizeText(payload.llmPromptAggressive)
    if (payload.llmPromptConservative !== undefined) llmPromptConservative.value = normalizeText(payload.llmPromptConservative)
    if (payload.llmPromptBalanced !== undefined) llmPromptBalanced.value = normalizeText(payload.llmPromptBalanced)
    if (payload.llmProfileAggressive !== undefined) llmProfileAggressive.value = normalizeText(payload.llmProfileAggressive)
    if (payload.llmProfileConservative !== undefined) llmProfileConservative.value = normalizeText(payload.llmProfileConservative)
    if (payload.llmProfileBalanced !== undefined) llmProfileBalanced.value = normalizeText(payload.llmProfileBalanced)
    if (payload.seat0Personality !== undefined) seat0Personality.value = payload.seat0Personality
    if (payload.seat1Personality !== undefined) seat1Personality.value = payload.seat1Personality
    if (payload.seat2Personality !== undefined) seat2Personality.value = payload.seat2Personality
    if (payload.seat3Personality !== undefined) seat3Personality.value = payload.seat3Personality
    if (payload.showBattleStrategyPanel !== undefined) showBattleStrategyPanel.value = payload.showBattleStrategyPanel
    if (payload.showBattleSpeechBubble !== undefined) showBattleSpeechBubble.value = payload.showBattleSpeechBubble
    if (payload.battleSpeechStyle !== undefined) {
      battleSpeechStyle.value =
        payload.battleSpeechStyle === 'restrained' || payload.battleSpeechStyle === 'taunt'
          ? payload.battleSpeechStyle
          : 'normal'
    }
    if (payload.battleTauntLevel !== undefined) {
      battleTauntLevel.value =
        payload.battleTauntLevel === 'medium' || payload.battleTauntLevel === 'heavy'
          ? payload.battleTauntLevel
          : 'mild'
    }
    if (payload.battleEnableAntiTribute !== undefined) {
      battleEnableAntiTribute.value = payload.battleEnableAntiTribute !== false
    }
    if (payload.battleEnableDoubleDownTribute !== undefined) {
      battleEnableDoubleDownTribute.value = payload.battleEnableDoubleDownTribute !== false
    }
    if (payload.battleReturnTributeRule !== undefined) {
      battleReturnTributeRule.value = payload.battleReturnTributeRule === 'lowest_only' ? 'lowest_only' : 'any_lower'
    }
    if (payload.battlePlaybackSpeed !== undefined) {
      battlePlaybackSpeed.value =
        payload.battlePlaybackSpeed === 'slow' ||
        payload.battlePlaybackSpeed === 'fast' ||
        payload.battlePlaybackSpeed === 'instant'
          ? payload.battlePlaybackSpeed
          : 'normal'
    }
    if (payload.battlePersonaPresets !== undefined) {
      battlePersonaPresets.value = normalizeBattlePersonaPresets(payload.battlePersonaPresets)
    }
  }

  const saveBattlePersonaPreset = (
    name: string,
    config?: Pick<BattlePersonaPreset, 'seat0Personality' | 'seat1Personality' | 'seat2Personality' | 'seat3Personality'>,
  ): BattlePersonaPreset | null => {
    const normalizedName = normalizeText(name)
    if (!normalizedName) {
      return null
    }

    const existing = battlePersonaPresets.value.find((preset) => preset.name === normalizedName)
    const preset: BattlePersonaPreset = {
      id: existing?.id ?? `preset-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: normalizedName,
      seat0Personality: config?.seat0Personality ?? seat0Personality.value,
      seat1Personality: config?.seat1Personality ?? seat1Personality.value,
      seat2Personality: config?.seat2Personality ?? seat2Personality.value,
      seat3Personality: config?.seat3Personality ?? seat3Personality.value,
    }

    if (existing) {
      battlePersonaPresets.value = battlePersonaPresets.value.map((item) => (item.id === existing.id ? preset : item))
    } else {
      battlePersonaPresets.value = [...battlePersonaPresets.value, preset].slice(0, 12)
    }

    return preset
  }

  const applyBattlePersonaPreset = (presetId: string): BattlePersonaPreset | null => {
    const target = battlePersonaPresets.value.find((preset) => preset.id === presetId)
    if (!target) {
      return null
    }

    seat0Personality.value = target.seat0Personality
    seat1Personality.value = target.seat1Personality
    seat2Personality.value = target.seat2Personality
    seat3Personality.value = target.seat3Personality
    return target
  }

  const deleteBattlePersonaPreset = (presetId: string): void => {
    battlePersonaPresets.value = battlePersonaPresets.value.filter((preset) => preset.id !== presetId)
  }

  const clearSettings = (): void => {
    llmBaseUrl.value = ''
    llmApiKey.value = ''
    llmModel.value = ''
    llmModelHistory.value = [...DEFAULT_LLM_MODELS]
    llmTimeoutMs.value = 60000
    llmDecisionMode.value = 'candidate'
    llmPromptAggressive.value = ''
    llmPromptConservative.value = ''
    llmPromptBalanced.value = ''
    llmProfileAggressive.value = ''
    llmProfileConservative.value = ''
    llmProfileBalanced.value = ''
    seat0Personality.value = 'balanced'
    seat1Personality.value = 'aggressive'
    seat2Personality.value = 'balanced'
    seat3Personality.value = 'conservative'
    showBattleStrategyPanel.value = true
    showBattleSpeechBubble.value = true
    battleSpeechStyle.value = 'normal'
    battleTauntLevel.value = 'mild'
    battleEnableAntiTribute.value = true
    battleEnableDoubleDownTribute.value = true
    battleReturnTributeRule.value = 'any_lower'
    battlePlaybackSpeed.value = 'normal'
    battlePersonaPresets.value = DEFAULT_BATTLE_PERSONA_PRESETS.map((preset) => ({ ...preset }))
  }

  return {
    llmBaseUrl,
    llmApiKey,
    llmModel,
    llmModelHistory,
    llmTimeoutMs,
    llmDecisionMode,
    llmPromptAggressive,
    llmPromptConservative,
    llmPromptBalanced,
    llmProfileAggressive,
    llmProfileConservative,
    llmProfileBalanced,
    seat0Personality,
    seat1Personality,
    seat2Personality,
    seat3Personality,
    showBattleStrategyPanel,
    showBattleSpeechBubble,
    battleSpeechStyle,
    battleTauntLevel,
    battleEnableAntiTribute,
    battleEnableDoubleDownTribute,
    battleReturnTributeRule,
    battlePlaybackSpeed,
    battlePersonaPresets,
    setSettings,
    saveBattlePersonaPreset,
    applyBattlePersonaPreset,
    deleteBattlePersonaPreset,
    clearSettings,
  }
})
