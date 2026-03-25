import type { AIDecisionMode, AIPlayerPersonality } from './aiService';

export interface AITurnMetricInput {
  decisionMode: AIDecisionMode;
  personality: AIPlayerPersonality;
  model: string;
  latencyMs: number;
  llmAttempted: boolean;
  llmSuccess: boolean;
  fallback: boolean;
  timeoutError: boolean;
  parseError: boolean;
  illegalOutput: boolean;
}

export interface BattleOutcomeMetricInput {
  matchId: string;
  winnerTeam: 'teamA' | 'teamB' | 'unknown';
  model: string;
  decisionMode: AIDecisionMode;
}

interface MetricBucket {
  turnCount: number;
  llmCalls: number;
  llmSuccesses: number;
  fallbacks: number;
  timeoutErrors: number;
  parseErrors: number;
  illegalOutputs: number;
  totalLatencyMs: number;
}

function createEmptyBucket(): MetricBucket {
  return {
    turnCount: 0,
    llmCalls: 0,
    llmSuccesses: 0,
    fallbacks: 0,
    timeoutErrors: 0,
    parseErrors: 0,
    illegalOutputs: 0,
    totalLatencyMs: 0
  };
}

function toRateData(bucket: MetricBucket): {
  avgLatencyMs: number;
  llmSuccessRate: number;
  fallbackRate: number;
  timeoutRate: number;
  parseErrorRate: number;
  illegalOutputRate: number;
} {
  const turnBase = Math.max(1, bucket.turnCount);
  const llmBase = Math.max(1, bucket.llmCalls);
  return {
    avgLatencyMs: bucket.turnCount > 0 ? Number((bucket.totalLatencyMs / bucket.turnCount).toFixed(2)) : 0,
    llmSuccessRate: Number((bucket.llmSuccesses / llmBase).toFixed(4)),
    fallbackRate: Number((bucket.fallbacks / turnBase).toFixed(4)),
    timeoutRate: Number((bucket.timeoutErrors / turnBase).toFixed(4)),
    parseErrorRate: Number((bucket.parseErrors / turnBase).toFixed(4)),
    illegalOutputRate: Number((bucket.illegalOutputs / turnBase).toFixed(4))
  };
}

function ensureBucket(map: Map<string, MetricBucket>, key: string): MetricBucket {
  const existing = map.get(key);
  if (existing) {
    return existing;
  }
  const created = createEmptyBucket();
  map.set(key, created);
  return created;
}

function applyTurnMetric(bucket: MetricBucket, input: AITurnMetricInput): void {
  bucket.turnCount += 1;
  bucket.totalLatencyMs += Math.max(0, input.latencyMs);

  if (input.llmAttempted) {
    bucket.llmCalls += 1;
  }
  if (input.llmSuccess) {
    bucket.llmSuccesses += 1;
  }
  if (input.fallback) {
    bucket.fallbacks += 1;
  }
  if (input.timeoutError) {
    bucket.timeoutErrors += 1;
  }
  if (input.parseError) {
    bucket.parseErrors += 1;
  }
  if (input.illegalOutput) {
    bucket.illegalOutputs += 1;
  }
}

const totals = createEmptyBucket();
const byDecisionMode = new Map<string, MetricBucket>();
const byPersonality = new Map<string, MetricBucket>();
const byModel = new Map<string, MetricBucket>();
const recordedMatches = new Set<string>();
const battleOutcomes = {
  totalFinished: 0,
  teamAWins: 0,
  teamBWins: 0,
  unknown: 0
};

function snapshotMap(map: Map<string, MetricBucket>): Record<string, MetricBucket & ReturnType<typeof toRateData>> {
  const result: Record<string, MetricBucket & ReturnType<typeof toRateData>> = {};
  for (const [key, bucket] of map.entries()) {
    result[key] = {
      ...bucket,
      ...toRateData(bucket)
    };
  }
  return result;
}

export function recordAITurnMetric(input: AITurnMetricInput): void {
  applyTurnMetric(totals, input);
  applyTurnMetric(ensureBucket(byDecisionMode, input.decisionMode), input);
  applyTurnMetric(ensureBucket(byPersonality, input.personality), input);
  applyTurnMetric(ensureBucket(byModel, input.model || 'unknown'), input);
}

export function recordBattleOutcomeMetric(input: BattleOutcomeMetricInput): void {
  if (!input.matchId || recordedMatches.has(input.matchId)) {
    return;
  }
  recordedMatches.add(input.matchId);
  battleOutcomes.totalFinished += 1;
  if (input.winnerTeam === 'teamA') {
    battleOutcomes.teamAWins += 1;
    return;
  }
  if (input.winnerTeam === 'teamB') {
    battleOutcomes.teamBWins += 1;
    return;
  }
  battleOutcomes.unknown += 1;
}

export function getAIMetricsSnapshot(): {
  generatedAt: string;
  totals: MetricBucket & ReturnType<typeof toRateData>;
  byDecisionMode: Record<string, MetricBucket & ReturnType<typeof toRateData>>;
  byPersonality: Record<string, MetricBucket & ReturnType<typeof toRateData>>;
  byModel: Record<string, MetricBucket & ReturnType<typeof toRateData>>;
  battleOutcomes: typeof battleOutcomes;
} {
  return {
    generatedAt: new Date().toISOString(),
    totals: {
      ...totals,
      ...toRateData(totals)
    },
    byDecisionMode: snapshotMap(byDecisionMode),
    byPersonality: snapshotMap(byPersonality),
    byModel: snapshotMap(byModel),
    battleOutcomes: { ...battleOutcomes }
  };
}

export function resetAIMetrics(): void {
  const cleared = createEmptyBucket();
  totals.turnCount = cleared.turnCount;
  totals.llmCalls = cleared.llmCalls;
  totals.llmSuccesses = cleared.llmSuccesses;
  totals.fallbacks = cleared.fallbacks;
  totals.timeoutErrors = cleared.timeoutErrors;
  totals.parseErrors = cleared.parseErrors;
  totals.illegalOutputs = cleared.illegalOutputs;
  totals.totalLatencyMs = cleared.totalLatencyMs;

  byDecisionMode.clear();
  byPersonality.clear();
  byModel.clear();
  recordedMatches.clear();
  battleOutcomes.totalFinished = 0;
  battleOutcomes.teamAWins = 0;
  battleOutcomes.teamBWins = 0;
  battleOutcomes.unknown = 0;
}
