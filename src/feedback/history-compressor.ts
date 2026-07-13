import type { Round } from '../types.js';

export function compressHistory(rounds: Round[], maxTokens: number): string {
  if (rounds.length === 0) return '';
  const maxChars = maxTokens * 4;
  const lines: string[] = rounds.map(r => {
    const actionDesc = formatAction(r.action);
    const failureDesc = r.feedback ? `[${r.failureType || 'UNKNOWN'}]: ${r.feedback.failures.map(f => f.testName).join(', ')}` : 'no feedback';
    return `Round ${r.roundNum}: ${actionDesc}, failed ${failureDesc}`;
  });
  let result = lines.join('\n');
  if (result.length > maxChars) {
    const truncated: string[] = [];
    let totalLen = 0;
    for (let i = lines.length - 1; i >= 0; i--) {
      if (totalLen + lines[i].length + 1 > maxChars - 50) break;
      truncated.unshift(lines[i]);
      totalLen += lines[i].length + 1;
    }
    result = `[...earlier rounds truncated...]\n${truncated.join('\n')}`;
  }
  return result;
}

function formatAction(action: Round['action']): string {
  switch (action.type) {
    case 'write_file': return `write_file ${action.path}`;
    case 'read_file': return `read_file ${action.path}`;
    case 'run_shell': return `run_shell ${action.command.substring(0, 50)}`;
    case 'run_tests': return 'run_tests';
    default: return 'unknown action';
  }
}
