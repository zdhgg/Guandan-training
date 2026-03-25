<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { pingLLMConnectivity } from '../api/gameClient'
import { useSettingsStore } from '../store/useSettingsStore'

type ToastType = 'success' | 'error' | 'info'
type PersonalityKey = 'aggressive' | 'balanced' | 'conservative'
type ProfilePreset = 'default' | 'attack' | 'resource' | 'team' | 'endgame' | 'custom'
type SettingsTab = 'connection' | 'strategy' | 'persona'

interface ProfileEditor {
  aggression: number
  bombConservation: number
  teammateSupport: number
  endgameRisk: number
}

type ProfileFieldKey = keyof ProfileEditor

const personalityCards: Array<{ key: PersonalityKey; label: string }> = [
  { key: 'aggressive', label: '激进型' },
  { key: 'balanced', label: '均衡型' },
  { key: 'conservative', label: '保守型' },
]

const profileFields: Array<{ key: ProfileFieldKey; label: string }> = [
  { key: 'aggression', label: '抢牌权' },
  { key: 'bombConservation', label: '保炸弹' },
  { key: 'teammateSupport', label: '队友协同' },
  { key: 'endgameRisk', label: '终局冲刺' },
]

const presetOptions: Array<{ value: ProfilePreset; label: string; desc: string }> = [
  { value: 'default', label: '默认人格基线', desc: '使用当前人格的系统默认参数，适合作为起点。' },
  { value: 'attack', label: '抢首游（强压）', desc: '更主动争夺牌权，优先拦截与压制，资源保留相对降低。' },
  { value: 'resource', label: '保二游（运营）', desc: '更强调资源保存与稳健推进，减少高风险爆发。' },
  { value: 'team', label: '配合队友（协同）', desc: '提升队友协同权重，倾向于团队节奏而非单点强压。' },
  { value: 'endgame', label: '收官冲刺（快出）', desc: '终局更果断，优先缩短回合并加速清手。' },
  { value: 'custom', label: '自定义微调', desc: '不套用预设，保留当前滑杆值并按你的偏好精细调整。' },
]

const settingTabs: Array<{ key: SettingsTab; label: string; desc: string }> = [
  { key: 'connection', label: '连接配置', desc: '模型连接与可用性' },
  { key: 'strategy', label: '对战策略', desc: '决策模式与座位角色' },
  { key: 'persona', label: '人格与提示词', desc: '提示词和参数微调' },
]

const PROFILE_DEFAULTS: Record<PersonalityKey, ProfileEditor> = {
  aggressive: { aggression: 92, bombConservation: 18, teammateSupport: 34, endgameRisk: 86 },
  balanced: { aggression: 55, bombConservation: 58, teammateSupport: 62, endgameRisk: 56 },
  conservative: { aggression: 26, bombConservation: 93, teammateSupport: 66, endgameRisk: 31 },
}

const clampPercent = (value: number): number => {
  if (!Number.isFinite(value)) {
    return 0
  }
  return Math.max(0, Math.min(100, Math.round(value)))
}

const toJsonWeight = (percent: number): number => Number((clampPercent(percent) / 100).toFixed(2))

const applyDelta = (base: ProfileEditor, delta: ProfileEditor): ProfileEditor => ({
  aggression: clampPercent(base.aggression + delta.aggression),
  bombConservation: clampPercent(base.bombConservation + delta.bombConservation),
  teammateSupport: clampPercent(base.teammateSupport + delta.teammateSupport),
  endgameRisk: clampPercent(base.endgameRisk + delta.endgameRisk),
})

const getPresetProfile = (personality: PersonalityKey, preset: ProfilePreset): ProfileEditor => {
  const base = PROFILE_DEFAULTS[personality]
  if (preset === 'default' || preset === 'custom') {
    return { ...base }
  }
  if (preset === 'attack') {
    return applyDelta(base, { aggression: 12, bombConservation: -22, teammateSupport: -8, endgameRisk: 10 })
  }
  if (preset === 'resource') {
    return applyDelta(base, { aggression: -15, bombConservation: 18, teammateSupport: 6, endgameRisk: -10 })
  }
  if (preset === 'team') {
    return applyDelta(base, { aggression: -8, bombConservation: 6, teammateSupport: 20, endgameRisk: 4 })
  }
  return applyDelta(base, { aggression: 10, bombConservation: -12, teammateSupport: 4, endgameRisk: 18 })
}

const hasSameProfile = (left: ProfileEditor, right: ProfileEditor): boolean =>
  profileFields.every((field) => left[field.key] === right[field.key])

const detectPreset = (personality: PersonalityKey, profile: ProfileEditor): ProfilePreset => {
  const presets: ProfilePreset[] = ['default', 'attack', 'resource', 'team', 'endgame']
  for (const preset of presets) {
    if (hasSameProfile(profile, getPresetProfile(personality, preset))) {
      return preset
    }
  }
  return 'custom'
}

const getPresetDescription = (preset: ProfilePreset): string =>
  presetOptions.find((item) => item.value === preset)?.desc ?? ''

const parseStoredProfile = (rawText: string, fallback: ProfileEditor): ProfileEditor => {
  const text = rawText.trim()
  if (!text) {
    return { ...fallback }
  }
  try {
    const parsed = JSON.parse(text) as Partial<Record<ProfileFieldKey, unknown>> | null
    if (!parsed || typeof parsed !== 'object') {
      return { ...fallback }
    }
    const read = (key: ProfileFieldKey): number => {
      const value = parsed[key]
      if (typeof value !== 'number' || Number.isNaN(value)) {
        return fallback[key]
      }
      const normalized = value <= 1 ? value * 100 : value
      return clampPercent(normalized)
    }
    return {
      aggression: read('aggression'),
      bombConservation: read('bombConservation'),
      teammateSupport: read('teammateSupport'),
      endgameRisk: read('endgameRisk'),
    }
  } catch {
    return { ...fallback }
  }
}

const buildProfileJson = (profile: ProfileEditor): string =>
  JSON.stringify({
    aggression: toJsonWeight(profile.aggression),
    bombConservation: toJsonWeight(profile.bombConservation),
    teammateSupport: toJsonWeight(profile.teammateSupport),
    endgameRisk: toJsonWeight(profile.endgameRisk),
  })

const router = useRouter()
const settingsStore = useSettingsStore()
const MAX_MODEL_HISTORY = 24

const normalizeModelName = (value: string): string => value.trim()
const dedupeModels = (models: string[]): string[] => {
  const normalized = models.map((item) => normalizeModelName(item)).filter(Boolean)
  return Array.from(new Set(normalized)).slice(0, MAX_MODEL_HISTORY)
}

const llmBaseUrl = ref(settingsStore.llmBaseUrl)
const llmApiKey = ref(settingsStore.llmApiKey)
const llmModel = ref(settingsStore.llmModel)
const llmModelHistory = ref<string[]>(dedupeModels(settingsStore.llmModelHistory ?? []))
const modelManagerOpen = ref(false)
const modelManagerInput = ref('')
const llmTimeoutMs = ref<number | undefined>(settingsStore.llmTimeoutMs)
const llmDecisionMode = ref(settingsStore.llmDecisionMode)
const llmPromptAggressive = ref(settingsStore.llmPromptAggressive)
const llmPromptConservative = ref(settingsStore.llmPromptConservative)
const llmPromptBalanced = ref(settingsStore.llmPromptBalanced)
const seat0Personality = ref(settingsStore.seat0Personality)
const seat1Personality = ref(settingsStore.seat1Personality)
const seat2Personality = ref(settingsStore.seat2Personality)
const seat3Personality = ref(settingsStore.seat3Personality)
const showBattleStrategyPanel = ref(settingsStore.showBattleStrategyPanel)
const showBattleSpeechBubble = ref(settingsStore.showBattleSpeechBubble)
const battleSpeechStyle = ref(settingsStore.battleSpeechStyle)
const battleTauntLevel = ref(settingsStore.battleTauntLevel)
const battleEnableAntiTribute = ref(settingsStore.battleEnableAntiTribute)
const battleEnableDoubleDownTribute = ref(settingsStore.battleEnableDoubleDownTribute)
const battleReturnTributeRule = ref(settingsStore.battleReturnTributeRule)
const battlePlaybackSpeed = ref(settingsStore.battlePlaybackSpeed)
const battlePresetName = ref('')
const selectedBattlePresetId = ref(settingsStore.battlePersonaPresets[0]?.id ?? '')
const activeTab = ref<SettingsTab>('connection')
const battlePersonaPresets = computed(() => settingsStore.battlePersonaPresets)

const setRecommendedSeatRoles = (): void => {
  seat0Personality.value = 'balanced'
  seat1Personality.value = 'aggressive'
  seat2Personality.value = 'balanced'
  seat3Personality.value = 'conservative'
}

const applyRecommendedSeatRoles = (): void => {
  setRecommendedSeatRoles()
  pushToast('已应用推荐座位组合：一号均衡 / 二号激进 / 三号均衡 / 四号保守', 'info')
}

const saveCurrentBattlePreset = (): void => {
  const preset = settingsStore.saveBattlePersonaPreset(battlePresetName.value, {
    seat0Personality: seat0Personality.value,
    seat1Personality: seat1Personality.value,
    seat2Personality: seat2Personality.value,
    seat3Personality: seat3Personality.value,
  })
  if (!preset) {
    pushToast('请输入预设名称后再保存', 'info')
    return
  }
  selectedBattlePresetId.value = preset.id
  battlePresetName.value = preset.name
  pushToast(`已保存预设：${preset.name}`, 'success')
}

const applySelectedBattlePreset = (): void => {
  if (!selectedBattlePresetId.value) {
    pushToast('请先选择一个预设', 'info')
    return
  }
  const preset = settingsStore.applyBattlePersonaPreset(selectedBattlePresetId.value)
  if (!preset) {
    pushToast('未找到对应预设', 'error')
    return
  }
  seat0Personality.value = preset.seat0Personality
  seat1Personality.value = preset.seat1Personality
  seat2Personality.value = preset.seat2Personality
  seat3Personality.value = preset.seat3Personality
  battlePresetName.value = preset.name
  pushToast(`已载入预设：${preset.name}`, 'success')
}

const deleteSelectedBattlePreset = (): void => {
  if (!selectedBattlePresetId.value) {
    pushToast('请先选择一个预设', 'info')
    return
  }
  const preset = battlePersonaPresets.value.find((item) => item.id === selectedBattlePresetId.value)
  settingsStore.deleteBattlePersonaPreset(selectedBattlePresetId.value)
  selectedBattlePresetId.value = settingsStore.battlePersonaPresets[0]?.id ?? ''
  battlePresetName.value = ''
  pushToast(`已删除预设：${preset?.name ?? '未命名预设'}`, 'info')
}

const profileEditors = reactive<Record<PersonalityKey, ProfileEditor>>({
  aggressive: parseStoredProfile(settingsStore.llmProfileAggressive ?? '', PROFILE_DEFAULTS.aggressive),
  balanced: parseStoredProfile(settingsStore.llmProfileBalanced ?? '', PROFILE_DEFAULTS.balanced),
  conservative: parseStoredProfile(settingsStore.llmProfileConservative ?? '', PROFILE_DEFAULTS.conservative),
})

const profilePreset = reactive<Record<PersonalityKey, ProfilePreset>>({
  aggressive: detectPreset('aggressive', profileEditors.aggressive),
  balanced: detectPreset('balanced', profileEditors.balanced),
  conservative: detectPreset('conservative', profileEditors.conservative),
})

const applyProfilePreset = (personality: PersonalityKey): void => {
  const preset = profilePreset[personality]
  if (preset === 'custom') {
    return
  }
  Object.assign(profileEditors[personality], getPresetProfile(personality, preset))
}

const resetProfile = (personality: PersonalityKey): void => {
  profilePreset[personality] = 'default'
  Object.assign(profileEditors[personality], getPresetProfile(personality, 'default'))
}

const updateProfileWeight = (personality: PersonalityKey, field: ProfileFieldKey, event: Event): void => {
  const input = event.target as HTMLInputElement | null
  const nextValue = clampPercent(input?.valueAsNumber ?? Number(input?.value ?? 0))
  profileEditors[personality][field] = nextValue
  profilePreset[personality] = detectPreset(personality, profileEditors[personality])
}

const profileJsonPreview = (personality: PersonalityKey): string => buildProfileJson(profileEditors[personality])

const applyDefaultStrategyPack = (): void => {
  llmDecisionMode.value = 'candidate'
  setRecommendedSeatRoles()
  for (const { key } of personalityCards) {
    profilePreset[key] = 'default'
    Object.assign(profileEditors[key], getPresetProfile(key, 'default'))
  }
  pushToast('已恢复默认策略包（Seat + 人格参数）', 'success')
}

const showToast = ref(false)
const toastMessage = ref('')
const toastType = ref<ToastType>('info')
const isTestingConnectivity = ref(false)

let toastTimer: ReturnType<typeof setTimeout> | null = null

const pushToast = (message: string, type: ToastType = 'info'): void => {
  toastMessage.value = message
  toastType.value = type
  showToast.value = true

  if (toastTimer) {
    clearTimeout(toastTimer)
  }
  toastTimer = setTimeout(() => {
    showToast.value = false
  }, 1600)
}

const goHome = (): void => {
  void router.push('/')
}

const openModelManager = (): void => {
  const normalizedCurrent = normalizeModelName(llmModel.value)
  if (normalizedCurrent && !llmModelHistory.value.includes(normalizedCurrent)) {
    llmModelHistory.value = dedupeModels([normalizedCurrent, ...llmModelHistory.value])
  }
  modelManagerInput.value = ''
  modelManagerOpen.value = true
}

const closeModelManager = (): void => {
  modelManagerOpen.value = false
}

const addModelFromManager = (): void => {
  const normalized = normalizeModelName(modelManagerInput.value)
  if (!normalized) {
    pushToast('请输入要添加的模型名称', 'info')
    return
  }

  const alreadyExists = llmModelHistory.value.includes(normalized)
  llmModelHistory.value = dedupeModels([normalized, ...llmModelHistory.value])
  modelManagerInput.value = ''
  pushToast(alreadyExists ? '模型已在候选列表中' : '已加入模型候选列表', 'info')
}

const applyModelCandidate = (modelName: string): void => {
  const normalized = normalizeModelName(modelName)
  if (!normalized) {
    return
  }
  llmModel.value = normalized
  llmModelHistory.value = dedupeModels([normalized, ...llmModelHistory.value])
  pushToast(`已切换当前模型：${normalized}`, 'success')
}

const removeModelCandidate = (modelName: string): void => {
  const target = normalizeModelName(modelName)
  if (!target) {
    return
  }
  const next = llmModelHistory.value.filter((item) => item !== target)
  if (next.length === llmModelHistory.value.length) {
    pushToast('该模型不在候选列表中', 'info')
    return
  }

  llmModelHistory.value = next
  if (normalizeModelName(llmModel.value) === target) {
    llmModel.value = next[0] ?? ''
  }
  pushToast('已从候选列表删除', 'info')
}

const saveSettings = (): void => {
  const normalizedModel = normalizeModelName(llmModel.value)
  const normalizedModelHistory = normalizedModel
    ? dedupeModels([normalizedModel, ...llmModelHistory.value])
    : dedupeModels(llmModelHistory.value)
  llmModel.value = normalizedModel
  llmModelHistory.value = normalizedModelHistory
  settingsStore.setSettings({
    llmBaseUrl: llmBaseUrl.value,
    llmApiKey: llmApiKey.value,
    llmModel: normalizedModel,
    llmModelHistory: normalizedModelHistory,
    llmTimeoutMs: llmTimeoutMs.value,
    llmDecisionMode: llmDecisionMode.value,
    llmPromptAggressive: llmPromptAggressive.value,
    llmPromptConservative: llmPromptConservative.value,
    llmPromptBalanced: llmPromptBalanced.value,
    llmProfileAggressive: buildProfileJson(profileEditors.aggressive),
    llmProfileConservative: buildProfileJson(profileEditors.conservative),
    llmProfileBalanced: buildProfileJson(profileEditors.balanced),
    seat0Personality: seat0Personality.value,
    seat1Personality: seat1Personality.value,
    seat2Personality: seat2Personality.value,
    seat3Personality: seat3Personality.value,
    showBattleStrategyPanel: showBattleStrategyPanel.value,
    showBattleSpeechBubble: showBattleSpeechBubble.value,
    battleSpeechStyle: battleSpeechStyle.value,
    battleTauntLevel: battleTauntLevel.value,
    battleEnableAntiTribute: battleEnableAntiTribute.value,
    battleEnableDoubleDownTribute: battleEnableDoubleDownTribute.value,
    battleReturnTributeRule: battleReturnTributeRule.value,
    battlePlaybackSpeed: battlePlaybackSpeed.value,
  })
  pushToast('保存成功', 'success')
}

const testConnectivity = async (): Promise<void> => {
  if (isTestingConnectivity.value) {
    return
  }

  if (!llmApiKey.value.trim()) {
    pushToast('请先填写 API Key', 'error')
    return
  }

  isTestingConnectivity.value = true
  try {
    const result = await pingLLMConnectivity({
      baseUrl: llmBaseUrl.value,
      apiKey: llmApiKey.value,
      model: llmModel.value,
    })
    const modelText = result.model ? `，模型: ${result.model}` : ''
    pushToast(`连通成功（${result.latencyMs}ms${modelText}）`, 'success')
  } catch (error) {
    const message = error instanceof Error ? error.message : '连通性测试失败'
    pushToast(message, 'error')
  } finally {
    isTestingConnectivity.value = false
  }
}

onBeforeUnmount(() => {
  if (toastTimer) {
    clearTimeout(toastTimer)
  }
})
</script>

<template>
  <main class="settings-page">
    <header class="top-bar">
      <div class="title-block">
        <p class="eyebrow">系统配置</p>
        <h1>LLM 全局设置</h1>
      </div>
      <button class="back-home-btn" type="button" @click="goHome">返回主页</button>
    </header>

    <section class="settings-panel" aria-label="大模型配置">
      <nav class="settings-tabs" aria-label="设置分组切换">
        <button
          v-for="tab in settingTabs"
          :key="tab.key"
          class="tab-btn"
          :class="{ 'is-active': activeTab === tab.key }"
          type="button"
          @click="activeTab = tab.key"
        >
          <span>{{ tab.label }}</span>
          <small>{{ tab.desc }}</small>
        </button>
      </nav>

      <section v-if="activeTab === 'connection'" class="tab-pane" aria-label="连接配置">
        <label class="field">
          <span class="field-label">API Base URL</span>
          <input
            v-model="llmBaseUrl"
            type="text"
            inputmode="url"
            placeholder="例如: https://api.deepseek.com/v1"
            autocomplete="off"
          />
          <small>可填写 DeepSeek、MiniMax 等 OpenAI 兼容接口地址；留空则不覆盖后端默认值。</small>
        </label>

        <label class="field">
          <span class="field-label">API Key</span>
          <input
            v-model="llmApiKey"
            type="password"
            placeholder="请输入你的 LLM API Key"
            autocomplete="off"
          />
        </label>

        <label class="field">
          <span class="field-label">模型名称 (Model Name)</span>
          <div class="model-input-row">
            <input
              v-model="llmModel"
              list="llm-model-options"
              type="text"
              placeholder="例如: deepseek-chat"
              autocomplete="off"
            />
            <button class="ghost-btn" type="button" @click="openModelManager">管理模型</button>
          </div>
          <datalist id="llm-model-options">
            <option v-for="modelName in llmModelHistory" :key="modelName" :value="modelName"></option>
          </datalist>
          <small>当前生效模型以上方输入框为准；添加/删除候选请点击“管理模型”。</small>
        </label>

        <label class="field">
          <span class="field-label">AI 思考时间上限 / API Timeout (毫秒)</span>
          <input
            v-model.number="llmTimeoutMs"
            type="number"
            min="1000"
            step="1000"
            placeholder="默认 60000；慢推理模型建议 60000-90000"
            autocomplete="off"
          />
          <small>默认超时已提升到 60000ms。若时间太短，大模型未响应完就会被系统掐断并降级到 fallback 出牌。</small>
        </label>
      </section>

      <section v-else-if="activeTab === 'strategy'" class="tab-pane" aria-label="对战策略">
        <label class="field">
          <span class="field-label">AI 决策模式</span>
          <select v-model="llmDecisionMode">
            <option value="candidate">候选动作模式 (Recommended)</option>
            <option value="legacy">Legacy 自由出牌模式</option>
          </select>
          <small>候选动作模式由规则引擎先生成合法动作，LLM只做选择，稳定性更高。Legacy 模式用于灰度对比。</small>
        </label>

        <div class="seat-toolbar">
          <small>快速应用推荐：一号位均衡、二号位激进、三号位均衡、四号位保守（可再手动调整）。</small>
          <div class="seat-toolbar-actions">
            <button class="ghost-btn" type="button" @click="applyRecommendedSeatRoles">应用推荐组合</button>
            <button class="ghost-btn is-strong" type="button" @click="applyDefaultStrategyPack">恢复默认策略包</button>
          </div>
        </div>

        <section class="preset-manager" aria-label="人格组合预设">
          <div class="preset-manager-head">
            <div>
              <p class="preset-manager-title">人格组合预设</p>
              <p class="preset-manager-desc">保存四个座位的人格编排，供批量实验与 A/B 对比复用。</p>
            </div>
          </div>
          <div class="preset-manager-row">
            <input
              v-model="battlePresetName"
              type="text"
              placeholder="例如：双压制实验"
              autocomplete="off"
            />
            <button class="ghost-btn is-strong" type="button" @click="saveCurrentBattlePreset">保存当前组合</button>
          </div>
          <div class="preset-manager-row">
            <select v-model="selectedBattlePresetId">
              <option value="">请选择一个预设</option>
              <option v-for="preset in battlePersonaPresets" :key="preset.id" :value="preset.id">
                {{ preset.name }}
              </option>
            </select>
            <button class="ghost-btn" type="button" @click="applySelectedBattlePreset">载入到当前草稿</button>
            <button class="ghost-btn" type="button" @click="deleteSelectedBattlePreset">删除预设</button>
          </div>
        </section>

        <label class="field toggle-field">
          <span class="field-label">显示 AI 决策解释面板</span>
          <div class="toggle-row">
            <input v-model="showBattleStrategyPanel" type="checkbox" />
            <span>在实战出牌播报时展示候选评分与局势信号</span>
          </div>
          <small>开启后可看到每一步 AI 的策略依据；关闭可减少界面信息密度。</small>
        </label>

        <label class="field toggle-field">
          <span class="field-label">显示 AI 台词气泡</span>
          <div class="toggle-row">
            <input v-model="showBattleSpeechBubble" type="checkbox" />
            <span>在牌桌各座位附近显示 AI 发言</span>
          </div>
          <small>关闭后仅保留行动结果与策略面板，不显示角色台词。</small>
        </label>

        <label class="field">
          <span class="field-label">AI 台词风格</span>
          <select v-model="battleSpeechStyle">
            <option value="restrained">克制</option>
            <option value="normal">普通</option>
            <option value="taunt">挑衅</option>
          </select>
          <small>仅影响“说话语气”，不会改变底层出牌决策。</small>
        </label>

        <label class="field">
          <span class="field-label">挑衅强度分级</span>
          <select v-model="battleTauntLevel">
            <option value="mild">轻度</option>
            <option value="medium">中度</option>
            <option value="heavy">重度</option>
          </select>
          <small>仅在“AI 台词风格 = 挑衅”时生效；不会影响出牌结果。</small>
        </label>

        <label class="field toggle-field">
          <span class="field-label">启用双大王抗贡</span>
          <div class="toggle-row">
            <input v-model="battleEnableAntiTribute" type="checkbox" />
            <span>下一局发牌后，若末游持有两张大王，则该组进贡自动免除</span>
          </div>
          <small>该设置会在新开系列赛时生效；正在进行的系列赛会沿用开局时的规则。</small>
        </label>

        <label class="field toggle-field">
          <span class="field-label">启用双下双贡</span>
          <div class="toggle-row">
            <input v-model="battleEnableDoubleDownTribute" type="checkbox" />
            <span>当上局形成双下时，下一局按“末游→头游、三游→二游”连续执行两组进贡</span>
          </div>
          <small>关闭后始终只执行单贡。该设置同样会在新开系列赛时生效。</small>
        </label>

        <label class="field">
          <span class="field-label">还贡限制规则</span>
          <select v-model="battleReturnTributeRule">
            <option value="any_lower">允许还任意较小牌</option>
            <option value="lowest_only">必须还最小牌</option>
          </select>
          <small>会同时影响 AI 自动还贡和人工还贡校验；若当前没有更小牌，系统会回退为可用的最小牌，且不能把收到的贡牌原样还回。</small>
        </label>

        <label class="field">
          <span class="field-label">全 AI 观战播放速度</span>
          <select v-model="battlePlaybackSpeed">
            <option value="slow">慢速讲解</option>
            <option value="normal">标准节奏</option>
            <option value="fast">快速推进</option>
            <option value="instant">瞬时完成</option>
          </select>
          <small>仅影响“全 AI 对战观战”页面的播报节奏，不会改变 AI 实际决策。</small>
        </label>

        <div class="field-row">
          <label class="field">
            <span class="field-label">一号位（Seat 0）角色：全 AI 首发位</span>
            <select v-model="seat0Personality">
              <option value="aggressive">激进型（抢牌权）</option>
              <option value="balanced">均衡型（控节奏）</option>
              <option value="conservative">保守型（保资源）</option>
            </select>
            <small>仅在“全 AI 对战观战”中生效；默认均衡型，便于稳定观察首发决策。</small>
          </label>
          <label class="field">
            <span class="field-label">二号位（Seat 1）角色：先手压制位</span>
            <select v-model="seat1Personality">
              <option value="aggressive">激进型（抢牌权）</option>
              <option value="balanced">均衡型（控节奏）</option>
              <option value="conservative">保守型（保资源）</option>
            </select>
            <small>建议：默认用激进型，优先争首游与拦截对手起势。</small>
          </label>
          <label class="field">
            <span class="field-label">三号位（Seat 2）角色：队友协同位</span>
            <select v-model="seat2Personality">
              <option value="aggressive">激进型（抢牌权）</option>
              <option value="balanced">均衡型（控节奏）</option>
              <option value="conservative">保守型（保资源）</option>
            </select>
            <small>建议：默认用均衡型，兼顾团队节奏与接风衔接。</small>
          </label>
          <label class="field">
            <span class="field-label">四号位（Seat 3）角色：防守拦截位</span>
            <select v-model="seat3Personality">
              <option value="aggressive">激进型（抢牌权）</option>
              <option value="balanced">均衡型（控节奏）</option>
              <option value="conservative">保守型（保资源）</option>
            </select>
            <small>建议：默认用保守型，优先守关键牌与残局反制。</small>
          </label>
        </div>
      </section>

      <section v-else class="tab-pane" aria-label="人格与提示词">
        <div class="prompts-group">
          <label class="field textarea-field">
            <span class="field-label">【激进型】自定义提示词</span>
            <textarea
              v-model="llmPromptAggressive"
              placeholder="留空则使用内置激进型带牌逻辑"
              rows="3"
            ></textarea>
          </label>
          <label class="field textarea-field">
            <span class="field-label">【均衡型】自定义提示词</span>
            <textarea
              v-model="llmPromptBalanced"
              placeholder="留空则使用内置均衡型带牌逻辑"
              rows="3"
            ></textarea>
          </label>
          <label class="field textarea-field">
            <span class="field-label">【保守型】自定义提示词</span>
            <textarea
              v-model="llmPromptConservative"
              placeholder="留空则使用内置保守型带牌逻辑"
              rows="3"
            ></textarea>
          </label>
        </div>

        <section class="profiles-group" aria-label="人格参数设置">
          <div class="profiles-head">
            <p class="profiles-title">人格参数设置（可视化）</p>
            <p class="profiles-desc">直接使用预设和滑杆调整，不需要手写 JSON。</p>
          </div>

          <div class="profile-grid">
            <article
              v-for="card in personalityCards"
              :key="card.key"
              class="profile-card"
            >
              <div class="profile-card-head">
                <span class="field-label">{{ card.label }}参数</span>
                <button class="ghost-btn" type="button" @click="resetProfile(card.key)">恢复默认</button>
              </div>

              <label class="field">
                <span class="field-hint">策略预设</span>
                <select v-model="profilePreset[card.key]" @change="applyProfilePreset(card.key)">
                  <option
                    v-for="preset in presetOptions"
                    :key="preset.value"
                    :value="preset.value"
                  >
                    {{ preset.label }}
                  </option>
                </select>
                <small>{{ getPresetDescription(profilePreset[card.key]) }}</small>
              </label>

              <div class="slider-list">
                <label
                  v-for="item in profileFields"
                  :key="item.key"
                  class="slider-row"
                >
                  <div class="slider-meta">
                    <span>{{ item.label }}</span>
                    <strong>{{ profileEditors[card.key][item.key] }}</strong>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="1"
                    :value="profileEditors[card.key][item.key]"
                    @input="updateProfileWeight(card.key, item.key, $event)"
                  />
                </label>
              </div>

              <details class="profile-json-box">
                <summary>查看自动生成的 JSON</summary>
                <code>{{ profileJsonPreview(card.key) }}</code>
              </details>
            </article>
          </div>
        </section>
      </section>

      <div class="actions">
        <button class="save-btn" type="button" @click="saveSettings">保存配置</button>
        <button
          v-if="activeTab === 'connection'"
          class="test-btn"
          type="button"
          :disabled="isTestingConnectivity"
          @click="testConnectivity"
        >
          {{ isTestingConnectivity ? '测试中...' : '测试连通性' }}
        </button>
      </div>
    </section>

    <transition name="model-modal-fade">
      <div
        v-if="modelManagerOpen"
        class="model-modal-overlay"
        role="dialog"
        aria-modal="true"
        aria-label="模型候选管理"
        @click.self="closeModelManager"
      >
        <div class="model-modal">
          <div class="model-modal-head">
            <h3>模型候选管理</h3>
            <button class="ghost-btn" type="button" @click="closeModelManager">关闭</button>
          </div>

          <p class="model-modal-current">
            当前生效模型：
            <strong>{{ llmModel || '未设置' }}</strong>
          </p>

          <div class="model-modal-add-row">
            <input
              v-model="modelManagerInput"
              type="text"
              placeholder="输入新模型名称，例如 DeepSeek-V3.2"
              autocomplete="off"
              @keydown.enter.prevent="addModelFromManager"
            />
            <button class="ghost-btn is-strong" type="button" @click="addModelFromManager">添加模型</button>
          </div>

          <div class="model-modal-list">
            <p v-if="llmModelHistory.length === 0" class="model-modal-empty">当前还没有候选模型，请先添加。</p>
            <div
              v-for="modelName in llmModelHistory"
              :key="`modal-model-${modelName}`"
              class="model-modal-item"
              :class="{ active: llmModel === modelName }"
            >
              <span class="model-modal-name">{{ modelName }}</span>
              <div class="model-modal-item-actions">
                <button class="ghost-btn" type="button" @click="applyModelCandidate(modelName)">设为当前</button>
                <button class="ghost-btn" type="button" @click="removeModelCandidate(modelName)">删除</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </transition>

    <transition name="toast-fade">
      <div v-if="showToast" class="toast" :class="toastType">{{ toastMessage }}</div>
    </transition>
  </main>
</template>

<style scoped>
.settings-page {
  min-height: 100vh;
  padding: 36px 22px 28px;
  color: #ecfff2;
  background:
    radial-gradient(circle at 10% 8%, rgba(195, 255, 220, 0.16), transparent 20%),
    radial-gradient(circle at 87% 6%, rgba(255, 255, 255, 0.12), transparent 22%),
    linear-gradient(145deg, #0d5c3a 0%, #0a4b31 45%, #083722 100%);
}

.top-bar {
  max-width: 960px;
  margin: 0 auto 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
}

.title-block {
  min-width: 0;
}

.eyebrow {
  margin: 0;
  color: rgba(229, 255, 238, 0.76);
  letter-spacing: 0.08em;
  font-size: 12px;
}

.title-block h1 {
  margin: 6px 0 0;
  font-size: clamp(28px, 4vw, 40px);
  line-height: 1.2;
}

.back-home-btn {
  border: 1px solid rgba(243, 255, 247, 0.26);
  border-radius: 12px;
  background: rgba(9, 53, 34, 0.52);
  color: #f3fff7;
  padding: 10px 14px;
  cursor: pointer;
  font-weight: 700;
  transition: transform 0.16s ease, background-color 0.16s ease;
}

.back-home-btn:hover {
  transform: translateY(-1px);
  background: rgba(14, 73, 46, 0.66);
}

.settings-panel {
  max-width: 960px;
  margin: 0 auto;
  border-radius: 18px;
  padding: 24px 20px 22px;
  border: 1px solid rgba(236, 255, 242, 0.18);
  background:
    linear-gradient(160deg, rgba(16, 98, 64, 0.62) 0%, rgba(10, 64, 41, 0.7) 100%),
    radial-gradient(circle at 86% 14%, rgba(241, 255, 247, 0.11), transparent 38%);
  box-shadow: 0 16px 32px rgba(4, 25, 16, 0.36);
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.settings-tabs {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.tab-btn {
  border-radius: 12px;
  border: 1px solid rgba(236, 255, 242, 0.2);
  background: rgba(7, 36, 24, 0.5);
  color: #dcf9e5;
  padding: 10px 12px;
  text-align: left;
  cursor: pointer;
  display: grid;
  gap: 2px;
  transition: transform 0.14s ease, border-color 0.14s ease, background-color 0.14s ease;
}

.tab-btn:hover {
  transform: translateY(-1px);
  border-color: rgba(245, 219, 118, 0.45);
}

.tab-btn span {
  font-size: 14px;
  font-weight: 800;
}

.tab-btn small {
  font-size: 12px;
  color: rgba(214, 241, 224, 0.78);
}

.tab-btn.is-active {
  border-color: rgba(245, 219, 118, 0.6);
  background: rgba(64, 76, 25, 0.52);
  color: #fff3c9;
}

.tab-pane {
  display: grid;
  gap: 16px;
}

.field {
  display: grid;
  gap: 8px;
}

.field-label {
  font-size: 15px;
  font-weight: 700;
  color: #f1fff6;
}

.field input, .field textarea, .field select {
  width: 100%;
  border-radius: 12px;
  border: 1px solid rgba(237, 255, 243, 0.24);
  padding: 12px 14px;
  background: rgba(6, 39, 26, 0.55);
  color: #effff4;
  font-size: 15px;
}
.field select {
  appearance: none;
  cursor: pointer;
}
.field textarea {
  resize: vertical;
  min-height: 80px;
}

.field-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
}

.model-input-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.model-input-row input {
  flex: 1;
  min-width: 220px;
}

.model-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(3, 16, 10, 0.62);
  display: grid;
  place-items: center;
  padding: 18px;
  z-index: 55;
}

.model-modal {
  width: min(680px, 100%);
  max-height: min(86vh, 760px);
  overflow: auto;
  border-radius: 16px;
  border: 1px solid rgba(236, 255, 242, 0.24);
  background:
    linear-gradient(162deg, rgba(16, 94, 62, 0.94) 0%, rgba(9, 56, 36, 0.96) 100%),
    radial-gradient(circle at 90% 4%, rgba(252, 255, 241, 0.14), transparent 36%);
  box-shadow: 0 16px 36px rgba(4, 23, 14, 0.48);
  padding: 16px;
  display: grid;
  gap: 12px;
}

.model-modal-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.model-modal-head h3 {
  margin: 0;
  font-size: 18px;
  color: #f4fff7;
}

.model-modal-current {
  margin: 0;
  color: rgba(229, 255, 237, 0.88);
}

.model-modal-current strong {
  color: #ffe8a6;
}

.model-modal-add-row {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.model-modal-add-row input {
  flex: 1;
  min-width: 220px;
  border-radius: 12px;
  border: 1px solid rgba(237, 255, 243, 0.24);
  padding: 10px 12px;
  background: rgba(6, 39, 26, 0.65);
  color: #effff4;
  font-size: 14px;
}

.model-modal-list {
  display: grid;
  gap: 8px;
  max-height: 52vh;
  overflow: auto;
  padding-right: 2px;
}

.model-modal-empty {
  margin: 0;
  color: rgba(220, 252, 231, 0.82);
}

.model-modal-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  border-radius: 12px;
  border: 1px solid rgba(236, 255, 242, 0.22);
  background: rgba(6, 34, 22, 0.5);
  padding: 9px 10px;
}

.model-modal-item.active {
  border-color: rgba(245, 219, 118, 0.62);
  background: rgba(78, 67, 20, 0.52);
}

.model-modal-name {
  font-size: 14px;
  color: #ecfff2;
  word-break: break-word;
}

.model-modal-item-actions {
  display: inline-flex;
  gap: 6px;
  flex-wrap: wrap;
}

.model-modal-fade-enter-active,
.model-modal-fade-leave-active {
  transition: opacity 0.2s ease;
}

.model-modal-fade-enter-from,
.model-modal-fade-leave-to {
  opacity: 0;
}

.seat-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  justify-content: space-between;
  border: 1px dashed rgba(236, 255, 242, 0.22);
  border-radius: 12px;
  padding: 10px 12px;
  background: rgba(8, 43, 28, 0.42);
}

.seat-toolbar small {
  margin: 0;
  color: rgba(226, 255, 236, 0.82);
  line-height: 1.4;
}

.seat-toolbar-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.preset-manager {
  display: grid;
  gap: 10px;
  border: 1px solid rgba(236, 255, 242, 0.18);
  border-radius: 12px;
  padding: 12px;
  background: rgba(7, 37, 25, 0.42);
}

.preset-manager-title {
  margin: 0;
  font-size: 15px;
  font-weight: 800;
  color: #f4fff7;
}

.preset-manager-desc {
  margin: 4px 0 0;
  font-size: 12px;
  line-height: 1.45;
  color: rgba(220, 249, 232, 0.78);
}

.preset-manager-row {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.preset-manager-row input,
.preset-manager-row select {
  flex: 1;
  min-width: 220px;
}

.field input::placeholder, .field textarea::placeholder {
  color: rgba(214, 241, 224, 0.68);
}

.field input:focus-visible, .field textarea:focus-visible {
  outline: 2px solid rgba(255, 249, 188, 0.86);
  outline-offset: 1px;
}

.field small {
  color: rgba(226, 255, 236, 0.78);
  line-height: 1.5;
}

.toggle-field .toggle-row {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  border-radius: 12px;
  border: 1px solid rgba(237, 255, 243, 0.24);
  padding: 10px 12px;
  background: rgba(6, 39, 26, 0.55);
  color: #effff4;
  font-size: 14px;
}

.toggle-field .toggle-row input[type='checkbox'] {
  width: 16px;
  height: 16px;
  margin: 0;
  accent-color: #f0cd62;
  cursor: pointer;
}

.profiles-group {
  display: grid;
  gap: 12px;
}

.profiles-head {
  display: grid;
  gap: 4px;
}

.profiles-title {
  margin: 0;
  font-size: 16px;
  font-weight: 800;
  color: #effff4;
}

.profiles-desc {
  margin: 0;
  font-size: 13px;
  color: rgba(221, 255, 233, 0.78);
}

.profile-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 14px;
}

.profile-card {
  border-radius: 14px;
  border: 1px solid rgba(237, 255, 243, 0.2);
  background: rgba(4, 31, 20, 0.42);
  padding: 12px;
  display: grid;
  gap: 10px;
}

.profile-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.field-hint {
  font-size: 13px;
  color: rgba(226, 255, 236, 0.8);
}

.ghost-btn {
  border-radius: 10px;
  border: 1px solid rgba(237, 255, 243, 0.28);
  padding: 6px 10px;
  color: #effff4;
  font-size: 12px;
  font-weight: 700;
  background: rgba(12, 59, 38, 0.52);
  cursor: pointer;
}

.ghost-btn.is-strong {
  border-color: rgba(243, 214, 109, 0.62);
  background: rgba(80, 64, 17, 0.5);
  color: #ffe9aa;
}

.slider-list {
  display: grid;
  gap: 8px;
}

.slider-row {
  display: grid;
  gap: 5px;
}

.slider-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 13px;
  color: rgba(233, 255, 241, 0.88);
}

.slider-meta strong {
  color: #f4db75;
  font-size: 13px;
}

.slider-row input[type='range'] {
  width: 100%;
  accent-color: #ddbf52;
  padding: 0;
  border: none;
  background: transparent;
}

.profile-json-box {
  border-radius: 10px;
  border: 1px dashed rgba(237, 255, 243, 0.2);
  padding: 8px 10px;
  background: rgba(6, 35, 23, 0.34);
}

.profile-json-box summary {
  cursor: pointer;
  font-size: 12px;
  color: rgba(224, 255, 234, 0.88);
}

.profile-json-box code {
  margin-top: 8px;
  display: block;
  font-size: 12px;
  color: rgba(207, 245, 220, 0.86);
  white-space: pre-wrap;
  word-break: break-all;
}

.save-btn {
  width: fit-content;
  border-radius: 12px;
  border: none;
  padding: 11px 18px;
  color: #214722;
  font-size: 15px;
  font-weight: 800;
  background: linear-gradient(180deg, #f2d867 0%, #dcb849 100%);
  box-shadow: 0 8px 18px rgba(8, 29, 14, 0.32);
  cursor: pointer;
  transition: transform 0.16s ease;
}

.save-btn:hover {
  transform: translateY(-2px);
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.test-btn {
  width: fit-content;
  border-radius: 12px;
  border: 1px solid rgba(237, 255, 243, 0.35);
  padding: 11px 18px;
  color: #effff4;
  font-size: 15px;
  font-weight: 700;
  background: rgba(10, 64, 41, 0.66);
  box-shadow: 0 8px 18px rgba(8, 29, 14, 0.22);
  cursor: pointer;
  transition: transform 0.16s ease, background-color 0.16s ease;
}

.test-btn:hover:enabled {
  transform: translateY(-2px);
  background: rgba(14, 80, 52, 0.78);
}

.test-btn:disabled {
  cursor: not-allowed;
  opacity: 0.68;
}

.toast {
  position: fixed;
  top: 24px;
  right: 24px;
  padding: 10px 14px;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 700;
  box-shadow: 0 8px 20px rgba(10, 29, 18, 0.35);
  z-index: 40;
}

.toast.info {
  background: rgba(205, 242, 221, 0.95);
  color: #12422a;
}

.toast.success {
  background: rgba(174, 238, 193, 0.95);
  color: #0f3f23;
}

.toast.error {
  background: rgba(255, 205, 205, 0.96);
  color: #5f1c1c;
}

.toast-fade-enter-active,
.toast-fade-leave-active {
  transition: all 0.2s ease;
}

.toast-fade-enter-from,
.toast-fade-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

@media (max-width: 700px) {
  .settings-page {
    padding: 20px 14px 18px;
  }

  .top-bar {
    flex-direction: column;
    align-items: flex-start;
    margin-bottom: 16px;
  }

  .settings-panel {
    padding: 16px 14px;
    gap: 14px;
  }

  .settings-tabs {
    grid-template-columns: 1fr;
  }

  .actions {
    width: 100%;
  }

  .seat-toolbar {
    width: 100%;
    align-items: stretch;
  }

  .seat-toolbar-actions {
    width: 100%;
    display: grid;
    grid-template-columns: 1fr;
    gap: 8px;
  }

  .seat-toolbar .ghost-btn {
    width: 100%;
  }

  .save-btn,
  .test-btn {
    width: 100%;
  }

  .toast {
    left: 14px;
    right: 14px;
    top: 14px;
  }
}
</style>
