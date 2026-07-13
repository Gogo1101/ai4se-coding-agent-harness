import Database from 'better-sqlite3';
import type { Task, Round, TaskStatus } from '../types.js';

export class MemoryStore {
  private db: Database.Database;
  constructor(dbPath: string) { this.db = new Database(dbPath); this.init(); }

  private init(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, description TEXT NOT NULL, test_files TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL, finished_at TEXT);
      CREATE TABLE IF NOT EXISTS rounds (id INTEGER PRIMARY KEY AUTOINCREMENT, task_id TEXT NOT NULL REFERENCES tasks(id), round_num INTEGER NOT NULL, code_files TEXT NOT NULL, action TEXT NOT NULL, feedback TEXT, failure_type TEXT, created_at TEXT NOT NULL);
    `);
  }

  saveTask(task: Task): void {
    this.db.prepare('INSERT OR REPLACE INTO tasks (id, description, test_files, status, created_at, finished_at) VALUES (@id, @description, @test_files, @status, @created_at, @finished_at)').run({
      id: task.id, description: task.description, test_files: JSON.stringify(task.testFiles), status: task.status, created_at: task.createdAt, finished_at: task.finishedAt,
    });
  }

  saveRound(round: Round): void {
    this.db.prepare('INSERT INTO rounds (task_id, round_num, code_files, action, feedback, failure_type, created_at) VALUES (@task_id, @round_num, @code_files, @action, @feedback, @failure_type, @created_at)').run({
      task_id: round.taskId, round_num: round.roundNum, code_files: JSON.stringify(round.codeFiles), action: JSON.stringify(round.action), feedback: round.feedback ? JSON.stringify(round.feedback) : null, failure_type: round.failureType, created_at: round.createdAt,
    });
  }

  getTask(taskId: string): { task: Task; rounds: Round[] } | null {
    const taskRow = this.db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as Record<string, string | null> | undefined;
    if (!taskRow) return null;
    const task: Task = { id: taskRow.id as string, description: taskRow.description as string, testFiles: JSON.parse(taskRow.test_files as string), status: taskRow.status as TaskStatus, createdAt: taskRow.created_at as string, finishedAt: taskRow.finished_at };
    const roundRows = this.db.prepare('SELECT * FROM rounds WHERE task_id = ? ORDER BY round_num').all(taskId) as Array<Record<string, string | number | null>>;
    const rounds: Round[] = roundRows.map(r => ({ id: r.id as number, taskId: r.task_id as string, roundNum: r.round_num as number, codeFiles: JSON.parse(r.code_files as string), action: JSON.parse(r.action as string), feedback: r.feedback ? JSON.parse(r.feedback as string) : null, failureType: r.failure_type as Round['failureType'], createdAt: r.created_at as string }));
    return { task, rounds };
  }

  listTasks(offset: number, limit: number): Task[] {
    const rows = this.db.prepare('SELECT * FROM tasks ORDER BY created_at DESC LIMIT ? OFFSET ?').all(limit, offset) as Array<Record<string, string | null>>;
    return rows.map(r => ({ id: r.id as string, description: r.description as string, testFiles: JSON.parse(r.test_files as string), status: r.status as TaskStatus, createdAt: r.created_at as string, finishedAt: r.finished_at }));
  }

  updateTaskStatus(taskId: string, status: TaskStatus): void {
    const finishedAt = (status === 'success' || status === 'failure' || status === 'aborted') ? new Date().toISOString() : null;
    this.db.prepare('UPDATE tasks SET status = ?, finished_at = ? WHERE id = ?').run(status, finishedAt, taskId);
  }

  close(): void { this.db.close(); }
}
