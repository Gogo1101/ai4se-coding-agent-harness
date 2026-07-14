import type { Action, Config, FeedbackSignal } from '../types.js';
import { DockerExec } from './docker-exec.js';
import { parseTestResult } from '../feedback/feedback-parser.js';

export class ToolRouter {
  dockerExec: DockerExec;
  constructor(private config: Config) { this.dockerExec = new DockerExec(config); }

  async dispatch(action: Action, containerId: string): Promise<unknown> {
    switch (action.type) {
      case 'write_file':
        await this.dockerExec.writeFile(containerId, action.path, action.content);
        return { success: true };
      case 'read_file':
        return { content: await this.dockerExec.readFile(containerId, action.path) };
      case 'run_shell':
        return await this.dockerExec.exec(containerId, action.command);
      case 'run_tests': {
        const result = await this.dockerExec.exec(containerId, 'cd /workspace && pytest --json-report --json-report-file /tmp/report.json --tb=short -q > /dev/null 2>&1; cat /tmp/report.json');
        let report: unknown;
        try { report = JSON.parse(result.stdout); } catch { report = { tests: [], summary: { total: 0, passed: 0, failed: 0 } }; }
        return { feedbackSignal: parseTestResult(report) };
      }
      default:
        throw new Error(`Unknown action type: ${(action as Action).type}`);
    }
  }
}
