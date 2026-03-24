// ============================================================
// CONSENSUS ARBITER — Synthesizes all 3 engine scores
// ============================================================

import type {
  SignalOutput,
  GoldLogicSnapshot,
  ConsensusDirection,
  AgreementLevel,
  EngineVote,
  ConsensusResult,
} from "./types";

// Engine weights for consensus calculation
const ENGINE_WEIGHTS = {
  signal: 0.40,      // Primary signal engine
  gold_logic: 0.35,  // Gold Logic AI
  spectre: 0.25,     // Spectre contrarian
} as const;

// Thresholds for consensus determination
const SCORE_THRESHOLDS = {
  strong: 30,        // Score magnitude for strong direction
  weak: 10,          // Score magnitude for weak/lean direction
} as const;

const AGREEMENT_THRESHOLDS = {
  strong: 0.7,       // 70%+ agreement = strong consensus
  lean: 0.5,         // 50-70% = lean
  mixed: 0.3,        // 30-50% = mixed
} as const;

/**
 * Extracts direction from a score value
 */
function scoreToDirection(score: number): ConsensusDirection {
  if (score > SCORE_THRESHOLDS.weak) return "UP";
  if (score < -SCORE_THRESHOLDS.weak) return "DOWN";
  return "FLAT";
}

/**
 * Extracts confidence from score magnitude (0-100 scale)
 */
function scoreToConfidence(score: number): number {
  const magnitude = Math.abs(score);
  if (magnitude >= 70) return 0.95;
  if (magnitude >= 50) return 0.80;
  if (magnitude >= 30) return 0.65;
  if (magnitude >= 10) return 0.50;
  return 0.30;
}

/**
 * Builds an EngineVote from signal engine output
 */
function buildSignalVote(signal: SignalOutput | null): EngineVote {
  if (!signal) {
    return {
      engine: "signal",
      direction: "FLAT",
      score: 0,
      confidence: 0,
      weight: ENGINE_WEIGHTS.signal,
    };
  }

  return {
    engine: "signal",
    direction: scoreToDirection(signal.master_score),
    score: signal.master_score,
    confidence: signal.confidence_pct,
    weight: ENGINE_WEIGHTS.signal,
  };
}

/**
 * Builds an EngineVote from Gold Logic output
 */
function buildGoldLogicVote(goldLogic: GoldLogicSnapshot | null): EngineVote {
  if (!goldLogic) {
    return {
      engine: "gold_logic",
      direction: "FLAT",
      score: 0,
      confidence: 0,
      weight: ENGINE_WEIGHTS.gold_logic,
    };
  }

  // Convert probability-based output to directional score
  // probabilityUp: 0-1, where 0.5 = neutral
  const directionScore = (goldLogic.probabilityUp - 0.5) * 200; // Maps to -100 to +100

  return {
    engine: "gold_logic",
    direction: scoreToDirection(directionScore),
    score: directionScore,
    confidence: goldLogic.confidence / 100, // Convert 0-100 to 0-1
    weight: ENGINE_WEIGHTS.gold_logic,
  };
}

/**
 * Builds an EngineVote from Spectre output
 * Note: Spectre score may already be in the signal output as a factor
 */
function buildSpectreVote(spectreScore: number | null, spectreConfidence: number = 0.5): EngineVote {
  if (spectreScore === null || spectreScore === undefined) {
    return {
      engine: "spectre",
      direction: "FLAT",
      score: 0,
      confidence: 0,
      weight: ENGINE_WEIGHTS.spectre,
    };
  }

  return {
    engine: "spectre",
    direction: scoreToDirection(spectreScore),
    score: spectreScore,
    confidence: scoreToConfidence(spectreScore),
    weight: ENGINE_WEIGHTS.spectre,
  };
}

/**
 * Determines agreement level based on vote alignment
 */
function calculateAgreement(votes: EngineVote[]): AgreementLevel {
  const activeVotes = votes.filter(v => v.confidence > 0);
  if (activeVotes.length === 0) return "MIXED";

  const upVotes = activeVotes.filter(v => v.direction === "UP");
  const downVotes = activeVotes.filter(v => v.direction === "DOWN");

  // Calculate weighted agreement
  const totalWeight = activeVotes.reduce((sum, v) => sum + v.weight * v.confidence, 0);
  const upWeight = upVotes.reduce((sum, v) => sum + v.weight * v.confidence, 0);
  const downWeight = downVotes.reduce((sum, v) => sum + v.weight * v.confidence, 0);

  const dominantWeight = Math.max(upWeight, downWeight);
  const agreementRatio = totalWeight > 0 ? dominantWeight / totalWeight : 0;

  // Check for conflict: strong opposing views
  const hasStrongUp = upVotes.some(v => Math.abs(v.score) >= SCORE_THRESHOLDS.strong);
  const hasStrongDown = downVotes.some(v => Math.abs(v.score) >= SCORE_THRESHOLDS.strong);
  if (hasStrongUp && hasStrongDown) return "CONFLICT";

  if (agreementRatio >= AGREEMENT_THRESHOLDS.strong) return "STRONG_CONSENSUS";
  if (agreementRatio >= AGREEMENT_THRESHOLDS.lean) return "LEAN";
  if (agreementRatio >= AGREEMENT_THRESHOLDS.mixed) return "MIXED";
  return "CONFLICT";
}

/**
 * Calculates weighted net score from all votes
 */
function calculateNetScore(votes: EngineVote[]): number {
  const totalWeight = votes.reduce((sum, v) => sum + v.weight * v.confidence, 0);
  if (totalWeight === 0) return 0;

  const weightedSum = votes.reduce(
    (sum, v) => sum + v.score * v.weight * v.confidence,
    0
  );

  return Math.round(weightedSum / totalWeight);
}

/**
 * Determines overall direction from net score
 */
function determineDirection(netScore: number): ConsensusDirection {
  if (netScore > SCORE_THRESHOLDS.weak) return "UP";
  if (netScore < -SCORE_THRESHOLDS.weak) return "DOWN";
  return "FLAT";
}

/**
 * Checks if engines have significant divergence
 */
function checkDivergence(votes: EngineVote[]): boolean {
  const activeVotes = votes.filter(v => v.confidence > 0.3);
  if (activeVotes.length < 2) return false;

  const directions = activeVotes.map(v => v.direction);
  const hasUp = directions.includes("UP");
  const hasDown = directions.includes("DOWN");

  // Divergence if opposite strong signals
  if (hasUp && hasDown) {
    const upScore = Math.max(...activeVotes.filter(v => v.direction === "UP").map(v => v.score));
    const downScore = Math.min(...activeVotes.filter(v => v.direction === "DOWN").map(v => v.score));
    return upScore > SCORE_THRESHOLDS.strong && Math.abs(downScore) > SCORE_THRESHOLDS.strong;
  }

  return false;
}

/**
 * Main entry point: builds consensus from all engine outputs
 */
export function buildConsensus(
  signal: SignalOutput | null,
  goldLogic: GoldLogicSnapshot | null,
  spectreScore: number | null,
  spectreConfidence?: number
): ConsensusResult {
  const votes: EngineVote[] = [
    buildSignalVote(signal),
    buildGoldLogicVote(goldLogic),
    buildSpectreVote(spectreScore, spectreConfidence),
  ];

  const netScore = calculateNetScore(votes);
  const direction = determineDirection(netScore);
  const agreement = calculateAgreement(votes);
  const divergenceFlag = checkDivergence(votes);

  return {
    direction,
    agreement,
    netScore,
    votes,
    divergenceFlag,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Utility: formats consensus for display
 */
export function formatConsensus(consensus: ConsensusResult): string {
  const arrow = consensus.direction === "UP" ? "↑" : consensus.direction === "DOWN" ? "↓" : "→";
  const score = consensus.netScore >= 0 ? `+${consensus.netScore}` : `${consensus.netScore}`;
  return `${arrow} ${consensus.agreement} (${score})`;
}
