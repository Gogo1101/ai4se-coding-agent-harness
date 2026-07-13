import type { Round } from '../types.js';

export function detectRepetition(rounds: Round[], threshold: number): boolean {
  if (rounds.length < threshold) return false;
  const lastN = rounds.slice(-threshold);
  const firstKey = failureKey(lastN[0]);
  return lastN.every(r => failureKey(r) === firstKey);
}

function failureKey(round: Round): string {
  const failureType = round.failureType || 'UNKNOWN';
  const testNames = round.feedback?.failures.map(f => f.testName).sort().join(',') || '';
  return `${failureType}:${testNames}`;
}
