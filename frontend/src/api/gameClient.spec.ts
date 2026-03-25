import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  advanceBattle,
  advanceBattleStream,
  autoGroupBattle,
  autoGroupTraining,
  createMatch,
  fetchBattleMetrics,
  fetchBattleSessions,
  fetchBattleState,
  fetchInitialHands,
  fetchNewTrainingHand,
  pingLLMConnectivity,
  resetBattleMetrics,
  startBattle,
  startNextBattleRound,
  startBattleWithMode,
  submitBattlePlay,
  submitBattleTribute,
  submitBattlePlayStream,
  submitPlay,
  validateTrainingGroups,
} from './gameClient'
import type { RuntimeCard } from '../types/cards'
import { useSettingsStore } from '../store/useSettingsStore'
import { pinia } from '../store'

const makeCards = (count: number): RuntimeCard[] =>
  Array.from({ length: count }, (_, index) => ({
    id: `card-${index}`,
    suit: 'hearts',
    rank: '8',
    deckIndex: 0,
    logicValue: 84,
    isWildcard: index < 2,
    isSelected: false,
  }))

const response = (ok: boolean, payload: unknown, status = 200, statusText = 'OK'): Response =>
  ({
    ok,
    status,
    statusText,
    json: async () => payload,
  }) as Response

const streamResponse = (chunks: string[], status = 200): Response =>
  new Response(
    new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder()
        for (const chunk of chunks) {
          controller.enqueue(encoder.encode(chunk))
        }
        controller.close()
      },
    }),
    {
      status,
      headers: {
        'Content-Type': 'text/event-stream',
      },
    },
  )

describe('gameClient', () => {
  const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>()

  beforeEach(() => {
    useSettingsStore(pinia).clearSettings()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('fetchInitialHands 接受数组响应并校验27张', async () => {
    fetchMock.mockResolvedValueOnce(response(true, makeCards(27)))

    const result = await fetchInitialHands('match-001')

    expect(result).toHaveLength(27)
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/matches/match-001/hands/initial?playerId=player1',
      expect.objectContaining({ method: 'GET' }),
    )
  })

  it('fetchInitialHands 接受 { cards } 响应格式', async () => {
    fetchMock.mockResolvedValueOnce(response(true, { cards: makeCards(27) }))

    const result = await fetchInitialHands('match-002')
    expect(result).toHaveLength(27)
  })

  it('fetchInitialHands 支持指定 playerId 参数', async () => {
    fetchMock.mockResolvedValueOnce(response(true, makeCards(27)))

    await fetchInitialHands('match-003', 'player3')
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/matches/match-003/hands/initial?playerId=player3',
      expect.any(Object),
    )
  })

  it('fetchInitialHands 非27张时抛错', async () => {
    fetchMock.mockResolvedValueOnce(response(true, makeCards(26)))

    await expect(fetchInitialHands('bad-match')).rejects.toThrow('expected 27 cards')
  })

  it('createMatch 成功时返回 matchId', async () => {
    fetchMock.mockResolvedValueOnce(response(true, { success: true, matchId: 'm-1' }, 201, 'Created'))

    const matchId = await createMatch([makeCards(27), makeCards(27), makeCards(27), makeCards(27)])
    expect(matchId).toBe('m-1')
  })

  it('submitPlay 正确提交出牌请求', async () => {
    const cards = makeCards(3)
    fetchMock.mockResolvedValueOnce(response(true, { success: true, message: 'ok' }))

    const result = await submitPlay('match-play', cards)

    expect(result.success).toBe(true)
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/matches/match-play/play',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
        }),
      }),
    )

    const fetchInit = fetchMock.mock.calls[0]?.[1]
    const body = fetchInit?.body ? JSON.parse(String(fetchInit.body)) : null
    expect(body?.playerId).toBe('player1')
    expect(body?.cards).toEqual(cards)
  })

  it('submitPlay 接口失败时抛错', async () => {
    fetchMock.mockResolvedValueOnce(response(false, { success: false, message: '牌型不合法，请检查出牌规则' }, 400, 'Bad Request'))

    await expect(submitPlay('match-play', makeCards(1))).rejects.toThrow('牌型不合法')
  })

  it('validateTrainingGroups 成功返回手数', async () => {
    fetchMock.mockResolvedValueOnce(response(true, { success: true, totalMoves: 3, message: 'ok' }))

    const result = await validateTrainingGroups([makeCards(1), makeCards(2), makeCards(3)])

    expect(result.success).toBe(true)
    expect(result.totalMoves).toBe(3)
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/training/validate-groups',
      expect.objectContaining({
        method: 'POST',
      }),
    )
  })

  it('validateTrainingGroups 失败时返回非法分组索引', async () => {
    fetchMock.mockResolvedValueOnce(response(true, { success: false, invalidGroupIndex: 1, message: '第2组牌型不合法' }))

    const result = await validateTrainingGroups([makeCards(1), makeCards(2)])

    expect(result.success).toBe(false)
    expect(result.invalidGroupIndex).toBe(1)
  })

  it('autoGroupTraining 成功返回智能分组', async () => {
    const groupedCards = [makeCards(5), makeCards(4), makeCards(1)]
    const allGroupings = [
      {
        strategyName: 'MinHands',
        groups: groupedCards,
        score: 120,
        scoreBreakdown: { handCountPenalty: 120, patternContribution: 260, contextAdjustment: 0, totalScore: 140 },
        reasonTags: ['objective_min_hands'],
      },
      {
        strategyName: 'Balanced',
        groups: [makeCards(3), makeCards(3), makeCards(4)],
        score: 110,
        scoreBreakdown: { handCountPenalty: 130, patternContribution: 250, contextAdjustment: 0, totalScore: 120 },
        reasonTags: ['objective_min_hands', 'single_control_strict'],
      },
    ]
    fetchMock.mockResolvedValueOnce(response(true, { success: true, groupedCards, totalGroups: 3, allGroupings }))

    const result = await autoGroupTraining(makeCards(27))

    expect(result.success).toBe(true)
    expect(result.groupedCards).toEqual(groupedCards)
    expect(result.totalGroups).toBe(3)
    expect(result.allGroupings).toEqual(allGroupings)
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/training/auto-group',
      expect.objectContaining({
        method: 'POST',
      }),
    )
  })

  it('autoGroupTraining 接口失败时抛错', async () => {
    fetchMock.mockResolvedValueOnce(response(false, { success: false, message: '理牌失败' }, 400, 'Bad Request'))

    await expect(autoGroupTraining(makeCards(27))).rejects.toThrow('autoGroupTraining failed')
  })

  it('autoGroupBattle 支持非27张实战手牌分组', async () => {
    const groupedCards = [makeCards(6), makeCards(5), makeCards(4)]
    const allGroupings = [
      {
        strategyName: 'BattleDefense',
        groups: groupedCards,
        score: 88,
        scoreBreakdown: { handCountPenalty: 90, patternContribution: 143, contextAdjustment: 35, totalScore: 88 },
        reasonTags: ['objective_battle_balance', 'enemy_sprint_risk'],
      },
      {
        strategyName: 'BattlePressure',
        groups: [makeCards(4), makeCards(4), makeCards(7)],
        score: 82,
        scoreBreakdown: { handCountPenalty: 90, patternContribution: 137, contextAdjustment: 35, totalScore: 82 },
        reasonTags: ['objective_battle_balance'],
      },
    ]
    fetchMock.mockResolvedValueOnce(response(true, { success: true, groupedCards, totalGroups: 3, totalCards: 15, allGroupings }))

    const result = await autoGroupBattle(makeCards(15))

    expect(result.success).toBe(true)
    expect(result.groupedCards).toEqual(groupedCards)
    expect(result.totalGroups).toBe(3)
    expect(result.allGroupings).toEqual(allGroupings)
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/battle/auto-group',
      expect.objectContaining({
        method: 'POST',
      }),
    )
  })

  it('autoGroupBattle 会透传实战理牌上下文', async () => {
    const groupedCards = [makeCards(5), makeCards(5), makeCards(5)]
    fetchMock.mockResolvedValueOnce(response(true, { success: true, groupedCards, totalGroups: 3 }))

    const context = {
      players: [
        { seat: 0, cardsLeft: 15, isTeammate: false },
        { seat: 1, cardsLeft: 4, isTeammate: false },
        { seat: 2, cardsLeft: 9, isTeammate: true },
        { seat: 3, cardsLeft: 11, isTeammate: false },
      ],
      currentTurn: 0,
      currentLevel: '8',
      lastPlay: null,
    }

    await autoGroupBattle(makeCards(15), context)

    const fetchInit = fetchMock.mock.calls[0]?.[1]
    const body = fetchInit?.body ? JSON.parse(String(fetchInit.body)) : null
    expect(body?.context).toEqual(context)
    expect(body?.cards).toEqual(makeCards(15))
  })

  it('fetchNewTrainingHand 返回27张手牌', async () => {
    fetchMock.mockResolvedValueOnce(response(true, { success: true, cards: makeCards(27), totalCards: 27 }))

    const cards = await fetchNewTrainingHand()

    expect(cards).toHaveLength(27)
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/training/new-hand',
      expect.objectContaining({ method: 'GET' }),
    )
  })

  it('fetchNewTrainingHand 非27张时抛错', async () => {
    fetchMock.mockResolvedValueOnce(response(true, { success: true, cards: makeCards(26), totalCards: 26 }))

    await expect(fetchNewTrainingHand()).rejects.toThrow('expected 27 cards')
  })

  it('startBattle 返回实战初始化状态', async () => {
    fetchMock.mockResolvedValueOnce(
      response(true, {
        success: true,
        matchId: 'battle-1',
        playerId: 'player1',
        battleMode: 'human_vs_ai',
        currentLevel: '2',
        currentTurn: 0,
        passCount: 0,
        handCards: makeCards(27),
        opponents: [
          { playerId: 'player2', seat: 1, cardsLeft: 27 },
          { playerId: 'player3', seat: 2, cardsLeft: 27 },
          { playerId: 'player4', seat: 3, cardsLeft: 27 },
        ],
        lastPlay: null,
        turnEvents: [
          {
            playerId: 'player2',
            playerSeat: 1,
            action: 'play',
            cards: [makeCards(1)[0]],
            decisionInsight: {
              decisionMode: 'candidate',
              selectedAction: 'play',
              selectedCandidateIndex: 0,
              selectedSummary: '单张 card-0',
              selectedScore: 123.5,
              tacticalSignals: {
                hasLastPlay: true,
                lastPlayByTeammate: false,
                lastPlayByOpponent: true,
                teammateNearFinish: false,
                opponentNearFinish: true,
                opponentCritical: false,
              },
              topCandidates: [
                {
                  index: 0,
                  action: 'play',
                  summary: '单张 card-0',
                  patternType: 'single',
                  powerLevel: 92,
                  score: 123.5,
                  cardIds: ['card-0'],
                  tacticHints: ['对手接近出线，优先阻断其牌权'],
                },
              ],
            },
          },
          {
            playerId: 'player3',
            playerSeat: 2,
            action: 'pass',
            cards: [],
          },
        ],
      }),
    )

    const state = await startBattle()

    expect(state.matchId).toBe('battle-1')
    expect(state.battleMode).toBe('human_vs_ai')
    expect(state.currentLevel).toBe('2')
    expect(state.handCards).toHaveLength(27)
    expect(state.opponents).toHaveLength(3)
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/battle/start',
      expect.objectContaining({ method: 'POST' }),
    )
    const fetchInit = fetchMock.mock.calls[0]?.[1]
    const body = fetchInit?.body ? JSON.parse(String(fetchInit.body)) : null
    expect(body?.battleMode).toBe('human_vs_ai')
  })

  it('startBattleWithMode 支持初始化全 AI 观战模式', async () => {
    fetchMock.mockResolvedValueOnce(
      response(true, {
        success: true,
        matchId: 'battle-ai-1',
        playerId: 'player1',
        battleMode: 'ai_vs_ai',
        currentLevel: '2',
        currentTurn: 0,
        passCount: 0,
        handCards: makeCards(27),
        opponents: [
          { playerId: 'player2', seat: 1, cardsLeft: 27 },
          { playerId: 'player3', seat: 2, cardsLeft: 27 },
          { playerId: 'player4', seat: 3, cardsLeft: 27 },
        ],
        lastPlay: null,
      }),
    )

    const state = await startBattleWithMode('ai_vs_ai')

    expect(state.matchId).toBe('battle-ai-1')
    expect(state.battleMode).toBe('ai_vs_ai')
    const fetchInit = fetchMock.mock.calls[0]?.[1]
    const body = fetchInit?.body ? JSON.parse(String(fetchInit.body)) : null
    expect(body?.battleMode).toBe('ai_vs_ai')
  })

  it('startBattleWithMode 支持临时覆盖座位人格请求头', async () => {
    fetchMock.mockResolvedValueOnce(
      response(true, {
        success: true,
        matchId: 'battle-ai-override-1',
        playerId: 'player1',
        battleMode: 'ai_vs_ai',
        currentLevel: '2',
        currentTurn: 0,
        passCount: 0,
        handCards: makeCards(27),
        opponents: [],
        lastPlay: null,
      }),
    )

    await startBattleWithMode('ai_vs_ai', 'player1', {
      llmOverride: {
        seatPersonalities: {
          0: 'aggressive',
          1: 'conservative',
          2: 'balanced',
          3: 'aggressive',
        },
      },
    })

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/battle/start',
      expect.objectContaining({
        headers: expect.objectContaining({
          'X-LLM-Seat0-Personality': 'aggressive',
          'X-LLM-Seat1-Personality': 'conservative',
          'X-LLM-Seat2-Personality': 'balanced',
          'X-LLM-Seat3-Personality': 'aggressive',
        }),
      }),
    )
  })

  it('submitBattlePlay 返回最新实战状态', async () => {
    fetchMock.mockResolvedValueOnce(
      response(true, {
        success: true,
        matchId: 'battle-2',
        playerId: 'player1',
        battleMode: 'human_vs_ai',
        currentLevel: '2',
        currentTurn: 0,
        passCount: 0,
        handCards: makeCards(26),
        opponents: [
          { playerId: 'player2', seat: 1, cardsLeft: 27 },
          { playerId: 'player3', seat: 2, cardsLeft: 27 },
          { playerId: 'player4', seat: 3, cardsLeft: 27 },
        ],
        lastPlay: null,
        turnEvents: [
          {
            playerId: 'player2',
            playerSeat: 1,
            action: 'play',
            cards: [makeCards(1)[0]],
            decisionInsight: {
              decisionMode: 'candidate',
              selectedAction: 'play',
              selectedCandidateIndex: 0,
              selectedSummary: '单张 card-0',
              selectedScore: 123.5,
              tacticalSignals: {
                hasLastPlay: true,
                lastPlayByTeammate: false,
                lastPlayByOpponent: true,
                teammateNearFinish: false,
                opponentNearFinish: true,
                opponentCritical: false,
              },
              topCandidates: [
                {
                  index: 0,
                  action: 'play',
                  summary: '单张 card-0',
                  patternType: 'single',
                  powerLevel: 92,
                  score: 123.5,
                  cardIds: ['card-0'],
                  tacticHints: ['对手接近出线，优先阻断其牌权'],
                },
              ],
            },
          },
          {
            playerId: 'player3',
            playerSeat: 2,
            action: 'pass',
            cards: [],
          },
        ],
      }),
    )

    const state = await submitBattlePlay('battle-2', makeCards(1))

    expect(state.matchId).toBe('battle-2')
    expect(state.handCards).toHaveLength(26)
    expect(state.turnEvents).toHaveLength(2)
    expect(state.turnEvents?.[0]?.action).toBe('play')
    expect(state.turnEvents?.[0]?.decisionInsight?.selectedCandidateIndex).toBe(0)
    expect(state.turnEvents?.[0]?.decisionInsight?.topCandidates?.[0]?.summary).toBe('单张 card-0')
    expect(state.turnEvents?.[1]?.action).toBe('pass')
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/battle/play',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('advanceBattle 返回全 AI 推进后的最终状态，并支持 cleanupWhenFinished', async () => {
    fetchMock.mockResolvedValueOnce(
      response(true, {
        success: true,
        matchId: 'battle-advance-1',
        playerId: 'player1',
        battleMode: 'ai_vs_ai',
        currentLevel: '2',
        currentTurn: 0,
        passCount: 0,
        handCards: makeCards(5),
        opponents: [
          { playerId: 'player2', seat: 1, cardsLeft: 0, lastThought: '先手压制' },
          { playerId: 'player3', seat: 2, cardsLeft: 2, lastThought: '配合推进' },
          { playerId: 'player4', seat: 3, cardsLeft: 0, lastThought: '这轮不出' },
        ],
        finishedSeats: [1, 3, 0],
        lastPlay: null,
      }),
    )

    const state = await advanceBattle('battle-advance-1', 'player1', { cleanupWhenFinished: true })

    expect(state.matchId).toBe('battle-advance-1')
    expect(state.battleMode).toBe('ai_vs_ai')
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/battle/advance',
      expect.objectContaining({ method: 'POST' }),
    )
    const fetchInit = fetchMock.mock.calls[0]?.[1]
    const body = fetchInit?.body ? JSON.parse(String(fetchInit.body)) : null
    expect(body?.cleanupWhenFinished).toBe(true)
  })

  it('submitBattlePlayStream 逐条解析实时战斗事件并返回最终状态', async () => {
    fetchMock.mockResolvedValueOnce(
      streamResponse([
        'event: ready\ndata: {"success":true,"matchId":"battle-stream-1"}\n\n',
        'event: player_action_applied\ndata: {"action":"play","cards":[{"id":"card-0","suit":"hearts","rank":"8","deckIndex":0,"logicValue":84,"isWildcard":false,"isSelected":false}],"state":{"success":true,"matchId":"battle-stream-1","playerId":"player1","battleMode":"human_vs_ai","currentLevel":"2","currentTurn":1,"passCount":0,"handCards":[],"opponents":[],"lastPlay":null,"finishedSeats":[]}}\n\n',
        'event: ai_turn_start\ndata: {"playerId":"player2","playerSeat":1,"state":{"success":true,"matchId":"battle-stream-1","playerId":"player1","battleMode":"human_vs_ai","currentLevel":"2","currentTurn":1,"passCount":0,"handCards":[],"opponents":[],"lastPlay":null,"finishedSeats":[]}}\n\n',
        'event: ai_turn_event\ndata: {"event":{"playerId":"player2","playerSeat":1,"action":"pass","cards":[],"reasoning":"先不出"},"state":{"success":true,"matchId":"battle-stream-1","playerId":"player1","battleMode":"human_vs_ai","currentLevel":"2","currentTurn":2,"passCount":1,"handCards":[],"opponents":[],"lastPlay":null,"finishedSeats":[]}}\n\n',
        'event: complete\ndata: {"success":true,"matchId":"battle-stream-1","playerId":"player1","battleMode":"human_vs_ai","currentLevel":"2","currentTurn":0,"passCount":1,"handCards":[],"opponents":[],"lastPlay":null,"finishedSeats":[]}\n\n',
      ]),
    )

    const seenEvents: string[] = []
    const finalState = await submitBattlePlayStream('battle-stream-1', makeCards(1), async (event) => {
      seenEvents.push(event.type)
    })

    expect(seenEvents).toEqual(['ready', 'player_action_applied', 'ai_turn_start', 'ai_turn_event', 'complete'])
    expect(finalState.matchId).toBe('battle-stream-1')
    expect(finalState.battleMode).toBe('human_vs_ai')
    expect(finalState.currentTurn).toBe(0)
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/battle/play/stream',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Accept: 'text/event-stream',
          'Content-Type': 'application/json',
        }),
      }),
    )
  })

  it('advanceBattleStream 逐条解析全 AI 对战事件并返回最终状态', async () => {
    fetchMock.mockResolvedValueOnce(
      streamResponse([
        'event: ready\ndata: {"success":true,"matchId":"battle-ai-stream-1"}\n\n',
        'event: ai_turn_start\ndata: {"playerId":"player1","playerSeat":0,"state":{"success":true,"matchId":"battle-ai-stream-1","playerId":"player1","battleMode":"ai_vs_ai","currentLevel":"2","currentTurn":0,"passCount":0,"handCards":[],"opponents":[],"lastPlay":null,"finishedSeats":[]}}\n\n',
        'event: ai_turn_event\ndata: {"event":{"playerId":"player1","playerSeat":0,"action":"play","cards":[{"id":"card-0","suit":"hearts","rank":"8","deckIndex":0,"logicValue":84,"isWildcard":false,"isSelected":false}],"reasoning":"先手建立节奏"},"state":{"success":true,"matchId":"battle-ai-stream-1","playerId":"player1","battleMode":"ai_vs_ai","currentLevel":"2","currentTurn":1,"passCount":0,"handCards":[],"opponents":[],"lastPlay":null,"finishedSeats":[]}}\n\n',
        'event: complete\ndata: {"success":true,"matchId":"battle-ai-stream-1","playerId":"player1","battleMode":"ai_vs_ai","currentLevel":"2","currentTurn":1,"passCount":0,"handCards":[],"opponents":[],"lastPlay":null,"finishedSeats":[]}\n\n',
      ]),
    )

    const seenEvents: string[] = []
    const finalState = await advanceBattleStream('battle-ai-stream-1', async (event) => {
      seenEvents.push(event.type)
    })

    expect(seenEvents).toEqual(['ready', 'ai_turn_start', 'ai_turn_event', 'complete'])
    expect(finalState.matchId).toBe('battle-ai-stream-1')
    expect(finalState.battleMode).toBe('ai_vs_ai')
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/battle/advance/stream',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Accept: 'text/event-stream',
          'Content-Type': 'application/json',
        }),
      }),
    )
  })

  it('fetchBattleMetrics 返回聚合指标快照', async () => {
    fetchMock.mockResolvedValueOnce(
      response(true, {
        success: true,
        generatedAt: '2026-03-21T12:00:00.000Z',
        totals: {
          turnCount: 120,
          llmCalls: 120,
          llmSuccesses: 118,
          fallbacks: 2,
          timeoutErrors: 1,
          parseErrors: 1,
          illegalOutputs: 1,
          totalLatencyMs: 5600,
          avgLatencyMs: 46.7,
          llmSuccessRate: 0.9833,
          fallbackRate: 0.0167,
          timeoutRate: 0.0083,
          parseErrorRate: 0.0083,
          illegalOutputRate: 0.0083,
        },
        byDecisionMode: {
          candidate: {
            turnCount: 120,
            llmCalls: 120,
            llmSuccesses: 118,
            fallbacks: 2,
            timeoutErrors: 1,
            parseErrors: 1,
            illegalOutputs: 1,
            totalLatencyMs: 5600,
            avgLatencyMs: 46.7,
            llmSuccessRate: 0.9833,
            fallbackRate: 0.0167,
            timeoutRate: 0.0083,
            parseErrorRate: 0.0083,
            illegalOutputRate: 0.0083,
          },
        },
        byPersonality: {},
        byModel: {},
        battleOutcomes: {
          totalFinished: 12,
          teamAWins: 7,
          teamBWins: 5,
          unknown: 0,
        },
      }),
    )

    const snapshot = await fetchBattleMetrics()

    expect(snapshot.battleOutcomes.totalFinished).toBe(12)
    expect(snapshot.totals.avgLatencyMs).toBe(46.7)
    expect(snapshot.totals.timeoutErrors).toBe(1)
    expect(snapshot.totals.timeoutRate).toBe(0.0083)
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/battle/metrics',
      expect.objectContaining({ method: 'GET' }),
    )
  })

  it('resetBattleMetrics 触发后端指标重置', async () => {
    fetchMock.mockResolvedValueOnce(response(true, { success: true, message: 'metrics reset' }))

    await resetBattleMetrics()

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/battle/metrics/reset',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('submitBattlePlay 会附加设置页中的 LLM 请求头', async () => {
    const settingsStore = useSettingsStore(pinia)
    settingsStore.setSettings({
      llmBaseUrl: 'https://api.deepseek.com/v1',
      llmApiKey: 'sk-demo',
      llmModel: 'deepseek-chat',
      seat0Personality: 'conservative',
      battleEnableAntiTribute: false,
      battleEnableDoubleDownTribute: false,
      battleReturnTributeRule: 'lowest_only',
    })

    fetchMock.mockResolvedValueOnce(
      response(true, {
        success: true,
        matchId: 'battle-3',
        playerId: 'player1',
        battleMode: 'human_vs_ai',
        currentLevel: '2',
        currentTurn: 0,
        passCount: 0,
        handCards: makeCards(26),
        opponents: [
          { playerId: 'player2', seat: 1, cardsLeft: 27 },
          { playerId: 'player3', seat: 2, cardsLeft: 27 },
          { playerId: 'player4', seat: 3, cardsLeft: 27 },
        ],
        lastPlay: null,
      }),
    )

    await submitBattlePlay('battle-3', makeCards(1))

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/battle/play',
      expect.objectContaining({
        headers: expect.objectContaining({
          'X-LLM-Base-Url': 'https://api.deepseek.com/v1',
          'X-LLM-Api-Key': 'sk-demo',
          'X-LLM-Model': 'deepseek-chat',
          'X-LLM-Seat0-Personality': 'conservative',
          'X-Battle-Anti-Tribute': 'false',
          'X-Battle-Double-Down-Tribute': 'false',
          'X-Battle-Return-Tribute-Rule': 'lowest_only',
        }),
      }),
    )
  })

  it('fetchBattleState 返回实战当前状态', async () => {
    fetchMock.mockResolvedValueOnce(
      response(true, {
        success: true,
        matchId: 'battle-state-1',
        playerId: 'player1',
        battleMode: 'human_vs_ai',
        currentLevel: '2',
        roundNumber: 2,
        roundPhase: 'playing',
        antiTributeEnabled: true,
        currentTurn: 0,
        passCount: 0,
        handCards: makeCards(27),
        opponents: [
          { playerId: 'player2', seat: 1, cardsLeft: 27 },
          { playerId: 'player3', seat: 2, cardsLeft: 27 },
          { playerId: 'player4', seat: 3, cardsLeft: 27 },
        ],
        lastPlay: null,
        lastRoundSummary: null,
        roundHistory: [
          {
            roundNumber: 1,
            finishedSeats: [0, 2, 1],
            winnerTeam: 'teamA',
            levelBefore: '2',
            levelAfter: '5',
            upgradeSteps: 3,
            resultLabel: '头游 + 二游（双上）',
            tributeRequired: true,
            tributeGiverSeat: 1,
            tributeReceiverSeat: 0,
          },
        ],
        pendingTribute: null,
      }),
    )

    const state = await fetchBattleState('battle-state-1')

    expect(state.matchId).toBe('battle-state-1')
    expect(state.battleMode).toBe('human_vs_ai')
    expect(state.roundNumber).toBe(2)
    expect(state.roundHistory).toHaveLength(1)
    expect(state.roundHistory[0]?.levelAfter).toBe('5')
    expect(state.handCards).toHaveLength(27)
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/battle/state?matchId=battle-state-1&playerId=player1',
      expect.objectContaining({ method: 'GET' }),
    )
  })

  it('fetchBattleSessions 会规范化系列赛摘要字段', async () => {
    fetchMock.mockResolvedValueOnce(
      response(true, {
        success: true,
        sessions: [
          {
            matchId: 'battle-session-1',
            battleMode: 'human_vs_ai',
            roundNumber: 3,
            roundPhase: 'awaiting_return',
            antiTributeEnabled: false,
            doubleDownTributeEnabled: true,
            returnTributeRule: 'lowest_only',
            currentLevel: '8',
            currentTurn: 0,
            stepCount: 48,
            finishedSeats: [],
            createdAt: '2026-03-23T12:00:00.000Z',
            updatedAt: '2026-03-23T12:10:00.000Z',
            lastRoundSummary: {
              roundNumber: 2,
              finishedSeats: [0, 2, 1],
              winnerTeam: 'teamA',
              levelBefore: '6',
              levelAfter: '8',
              upgradeSteps: 2,
              resultLabel: '头游 + 三游',
              tributeRequired: true,
              tributeGiverSeat: 1,
              tributeReceiverSeat: 0,
              tributePairs: [
                { order: 1, giverSeat: 1, receiverSeat: 0, phase: 'awaiting_return' },
              ],
            },
          },
        ],
      }),
    )

    const sessions = await fetchBattleSessions('human_vs_ai', 5)

    expect(sessions).toHaveLength(1)
    expect(sessions[0]?.roundNumber).toBe(3)
    expect(sessions[0]?.roundPhase).toBe('awaiting_return')
    expect(sessions[0]?.antiTributeEnabled).toBe(false)
    expect(sessions[0]?.doubleDownTributeEnabled).toBe(true)
    expect(sessions[0]?.returnTributeRule).toBe('lowest_only')
    expect(sessions[0]?.lastRoundSummary?.levelAfter).toBe('8')
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/battle/sessions?battleMode=human_vs_ai&limit=5',
      expect.objectContaining({ method: 'GET' }),
    )
  })

  it('startNextBattleRound 返回下一局状态与交供信息', async () => {
    fetchMock.mockResolvedValueOnce(
      response(true, {
        success: true,
        matchId: 'battle-next-1',
        playerId: 'player1',
        battleMode: 'human_vs_ai',
        roundNumber: 2,
        roundPhase: 'awaiting_tribute',
        antiTributeEnabled: true,
        doubleDownTributeEnabled: true,
        returnTributeRule: 'any_lower',
        currentLevel: '7',
        currentTurn: 0,
        passCount: 0,
        handCards: makeCards(27),
        opponents: [
          { playerId: 'player2', seat: 1, cardsLeft: 28, lastThought: '收到进贡', rank: 1 },
          { playerId: 'player3', seat: 2, cardsLeft: 27, lastThought: '', rank: 2 },
          { playerId: 'player4', seat: 3, cardsLeft: 27, lastThought: '', rank: 3 },
        ],
        lastPlay: null,
        finishedSeats: [1, 2, 3],
        lastRoundSummary: {
          roundNumber: 1,
          finishedSeats: [1, 2, 3],
          winnerTeam: 'teamB',
          levelBefore: '5',
          levelAfter: '7',
          upgradeSteps: 2,
          resultLabel: '头游 + 三游',
          tributeRequired: true,
          tributeGiverSeat: 0,
          tributeReceiverSeat: 1,
          tributePairs: [
            { order: 1, giverSeat: 0, receiverSeat: 1, phase: 'awaiting_tribute' },
          ],
        },
        tributeQueue: [
          { order: 1, giverSeat: 0, receiverSeat: 1, phase: 'awaiting_tribute' },
        ],
        pendingTribute: {
          exchangeIndex: 0,
          totalExchanges: 1,
          phase: 'awaiting_tribute',
          giverSeat: 0,
          receiverSeat: 1,
          requiredAction: 'give',
        },
      }),
    )

    const state = await startNextBattleRound('battle-next-1')

    expect(state.roundNumber).toBe(2)
    expect(state.roundPhase).toBe('awaiting_tribute')
    expect(state.pendingTribute?.requiredAction).toBe('give')
    expect(state.lastRoundSummary?.levelAfter).toBe('7')
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/battle/next-round',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('submitBattleTribute 提交交供卡牌并返回更新后的下一局状态', async () => {
    fetchMock.mockResolvedValueOnce(
      response(true, {
        success: true,
        matchId: 'battle-next-1',
        playerId: 'player1',
        battleMode: 'human_vs_ai',
        roundNumber: 2,
        roundPhase: 'playing',
        antiTributeEnabled: true,
        doubleDownTributeEnabled: false,
        returnTributeRule: 'lowest_only',
        currentLevel: '7',
        currentTurn: 0,
        passCount: 0,
        handCards: makeCards(27),
        opponents: [
          { playerId: 'player2', seat: 1, cardsLeft: 27, lastThought: '我先回一张小牌' },
          { playerId: 'player3', seat: 2, cardsLeft: 27, lastThought: '' },
          { playerId: 'player4', seat: 3, cardsLeft: 27, lastThought: '' },
        ],
        lastPlay: null,
        finishedSeats: [],
        lastRoundSummary: {
          roundNumber: 1,
          finishedSeats: [1, 2, 3],
          winnerTeam: 'teamB',
          levelBefore: '5',
          levelAfter: '7',
          upgradeSteps: 2,
          resultLabel: '头游 + 三游',
          tributeRequired: true,
          tributeGiverSeat: 0,
          tributeReceiverSeat: 1,
          tributePairs: [
            { order: 1, giverSeat: 0, receiverSeat: 1, phase: 'completed' },
          ],
        },
        tributeQueue: [
          { order: 1, giverSeat: 0, receiverSeat: 1, phase: 'completed' },
        ],
        pendingTribute: null,
      }),
    )

    const state = await submitBattleTribute('battle-next-1', 'card-0')

    expect(state.roundPhase).toBe('playing')
    expect(state.pendingTribute).toBeNull()
    const fetchInit = fetchMock.mock.calls[0]?.[1]
    const body = fetchInit?.body ? JSON.parse(String(fetchInit.body)) : null
    expect(body?.cardId).toBe('card-0')
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/battle/tribute',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('pingLLMConnectivity 成功时返回连通信息', async () => {
    fetchMock.mockResolvedValueOnce(
      response(true, {
        success: true,
        message: '连通性测试通过',
        model: 'deepseek-chat',
        latencyMs: 120,
      }),
    )

    const result = await pingLLMConnectivity({
      baseUrl: 'https://api.deepseek.com/v1',
      apiKey: 'sk-demo',
      model: 'deepseek-chat',
    })

    expect(result.success).toBe(true)
    expect(result.model).toBe('deepseek-chat')
    expect(result.latencyMs).toBe(120)
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/llm/ping',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
        }),
      }),
    )
  })

  it('pingLLMConnectivity 失败时抛出后端错误信息', async () => {
    fetchMock.mockResolvedValueOnce(
      response(true, {
        success: false,
        message: '鉴权失败，请检查 API Key 是否正确',
      }),
    )

    await expect(
      pingLLMConnectivity({
        baseUrl: 'https://api.deepseek.com/v1',
        apiKey: 'sk-demo',
        model: 'deepseek-chat',
      }),
    ).rejects.toThrow('鉴权失败')
  })
})
