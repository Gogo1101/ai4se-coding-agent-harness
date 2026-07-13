# SPEC.md — Coding Agent Harness

> AI4SE 期末项目 · A · Coding Agent Harness
>
> *Spec-Driven, Subagent-Built, Human-Owned.*

---

## 目录

1. [问题陈述](#1-问题陈述)
2. [用户故事](#2-用户故事)
3. [功能规约](#3-功能规约)
4. [非功能性需求](#4-非功能性需求)
5. [系统架构](#5-系统架构)
6. [数据模型](#6-数据模型)
7. [凭据与分发设计](#7-凭据与分发设计)
8. [技术选型与理由](#8-技术选型与理由)
9. [领域与机制设计](#9-领域与机制设计)
10. [六维度详细设计](#10-六维度详细设计)
11. [验收标准](#11-验收标准)
12. [风险与未决问题](#12-风险与未决问题)

---

## 1. 问题陈述

### 要解决什么问题？

当 LLM 能生成代码时，如何确保生成的代码是正确的？传统做法是人工审查——慢、主观、不可扩展。一个"考试教练型"编码智能体控制中枢能自动化这个过程：给 AI 布置编程任务，用确定性测试用例评判其输出，将失败信号结构化回灌驱动自我修正，直到全绿或达到重试上限。

### 目标用户

1. **AI4SE 课程学生**：通过构建 harness 理解 Agent = LLM + Harness 的工程分层。
2. **想用自动化测试驱动 LLM 编程的开发者**：用客观测试信号替代主观代码审查。

### 为什么值得做？

它把"LLM 生成代码是否正确"这一主观问题，转化为"测试是否全绿"这一客观信号。且所有核心机制（反馈解析、护栏拦截、循环控制）都是确定性代码，可离线单测——移除 LLM 这一不确定因素后，仓库里仍有大量可独立验证的工程。

---

## 2. 用户故事

遵循 INVEST 原则（Independent, Negotiable, Valuable, Estimable, Small, Testable）。

### U1: 提交任务

作为开发者，我想通过 WebUI 提交一个编程任务描述和一组 pytest 测试用例，以便启动 agent 自动编程流程。

### U2: 实时观察

作为开发者，我想在 WebUI 上实时看到 agent 的每一步动作（调用 LLM、写文件、运行测试、触发护栏），以便理解 agent 的决策过程。

### U3: 自动测试反馈

作为开发者，我想让 harness 自动运行 pytest 并将结构化失败摘要回灌给 LLM，以便 agent 能据此自我修正代码。

### U4: 危险命令审批

作为开发者，当 agent 试图执行危险命令时，我想在 WebUI 上收到审批请求并决定是否允许，以防止意外破坏。

### U5: 安全配置 Key

作为开发者，我想在首次运行时被引导安全录入 API key（不回显明文），并能查看状态/更新/清除，以便凭据不被泄露。

### U6: 历史回溯

作为开发者，我想查看过往任务的执行历史（每轮代码、测试结果、最终状态），以便在类似任务中参考之前的经验。

### U7: 一键部署

作为开发者，我想通过单条 `docker build` + `docker run` 启动整个系统并在浏览器中访问，以便在新机器上快速运行。

---

## 3. 功能规约

按模块拆分。每项描述输入/行为/输出/边界条件/错误处理。

### 3.1 WebUI 模块

**输入**：用户在浏览器中操作。

| 功能 | 输入 | 行为 | 输出 | 边界条件 | 错误处理 |
|------|------|------|------|----------|----------|
| 任务提交 | 任务描述 (text) + 测试文件 (多文件) | 创建 Task 记录，启动 Agent Loop | task_id + WebSocket 连接 | 描述非空；至少 1 个测试文件 | 描述为空时禁用提交按钮；文件解析失败提示 |
| 实时事件流 | WebSocket 连接 | 推送 agent 每步动作事件 | JSON 事件流 | 单连接；断线自动重连 | 断线时显示"重连中" |
| HITL 审批面板 | 审批请求事件 | 显示危险命令详情 + 批准/拒绝按钮 | approve/reject 事件 | 30s 内无响应默认拒绝 | 超时提示"已自动拒绝" |
| 历史查看 | 任务列表请求 | 查询 SQLite，展示任务列表和详情 | 任务卡片 + 轮次详情 | 分页，每页 20 条 | 无数据时显示空状态 |
| Key 管理 | 查看/更新/清除操作 | 调用 Credential Manager | 状态/成功/失败 | 仅本地访问 | 操作失败显示错误消息 |

### 3.2 Agent Loop 模块（决策核心）

**输入**：Task 记录 + 配置 + LLM Adapter。

| 功能 | 输入 | 行为 | 输出 | 边界条件 | 错误处理 |
|------|------|------|------|----------|----------|
| 组装上下文 | task, tests, config, history, currentFailure | 组装 LLMContext | LLMContext 对象 | history 不超 max_history_tokens | 历史超限时截断最早轮次 |
| 调用 LLM | LLMContext | 通过 LLM Adapter 调用 API | LLMResponse | 超时 30s | 超时重试 1 次，仍失败则终止任务 |
| 解析动作 | LLMResponse.content | parseAction() 解析 JSON | Action 对象 | 必须为合法 JSON | 解析失败回灌"请按 JSON 格式返回" |
| 护栏检查 | Action | guardrail.checkAction() | GuardrailResult | — | — |
| 分发执行 | Action | toolRouter.dispatch() | ActionResult | Docker 容器可用 | Docker 异常终止任务 |
| 回灌结果 | ActionResult (run_tests) | feedbackParser.parse() | FeedbackSignal | — | 解析失败回灌原始输出 |
| 停机判断 | round_num, feedback, repetition | 判断是否终止 | SUCCESS/FAILURE/CONTINUE | round_num <= max_retries | — |

### 3.3 Tool Router 模块（工具分发）

**输入**：Action 对象。

| 工具 | 输入 | 行为 | 输出 | 边界条件 | 错误处理 |
|------|------|------|------|----------|----------|
| write_file | path, content | 在容器工作目录写文件 | {success: boolean} | path 在工作目录内 | 路径越界返回错误 |
| read_file | path | 从容器工作目录读文件 | {content: string} | path 在工作目录内 | 文件不存在返回错误 |
| run_shell | command | 在容器内执行 shell | {stdout, stderr, exitCode} | 超时 30s | 超时返回 TIMEOUT 信号 |
| run_tests | (无) | 在容器内执行 pytest --json-report | {feedbackSignal: FeedbackSignal} | 至少 1 个测试文件 | pytest 崩溃返回原始 stderr |

### 3.4 Feedback Parser 模块（反馈解析）—— 重点维度

**输入**：pytest JSON report。

| 功能 | 输入 | 行为 | 输出 | 边界条件 | 错误处理 |
|------|------|------|------|----------|----------|
| 测试结果解析 | PytestJsonReport | 提取通过/失败数、失败详情 | FeedbackSignal | report 非空 | report 缺失字段时降级 |
| 失败分类 | FeedbackSignal | classifyFailure() | FailureType | — | 无法分类时标记 RUNTIME_ERROR |
| 历史压缩 | Round[] | compressHistory() | string 摘要 | 不超 max_history_tokens | 超限时截断最早轮次 |
| 重复检测 | Round[] | detectRepetition() | boolean | 至少 3 轮 | 不足 3 轮返回 false |
| 上下文组装 | task, tests, config, history, failure | assembleContext() | LLMContext | — | — |

### 3.5 Guardrail 模块（治理护栏）

**输入**：Action 对象。

| 功能 | 输入 | 行为 | 输出 | 边界条件 | 错误处理 |
|------|------|------|------|----------|----------|
| 动作检查 | Action | checkAction() 匹配危险模式 | GuardrailResult | 模式列表已加载 | 模式列表为空时全部 ALLOW |
| HITL 状态机 | GuardrailResult (REQUIRE_APPROVAL) | 暂停循环，发送审批事件 | 等待 approve/reject | 30s 超时 | 超时默认拒绝 |

### 3.6 Memory Store 模块（记忆）

**输入**：Task/Round 对象。

| 功能 | 输入 | 行为 | 输出 | 边界条件 | 错误处理 |
|------|------|------|------|----------|----------|
| 保存任务 | Task | 写入 SQLite | task_id | — | 写入失败抛异常 |
| 保存轮次 | Round | 写入 SQLite | round_id | — | 写入失败抛异常 |
| 查询任务 | task_id | 读取 SQLite | Task + Rounds[] | — | 不存在返回 null |
| 列出任务 | (分页参数) | 查询 SQLite | Task[] | 每页 20 条 | — |

### 3.7 Config Loader 模块（配置）

**输入**：YAML 配置文件。

| 功能 | 输入 | 行为 | 输出 | 边界条件 | 错误处理 |
|------|------|------|------|----------|----------|
| 加载配置 | config.yaml | 读取并校验 schema | Config 对象 | 文件存在 | 文件不存在用默认值 |
| 校验 schema | Config | 检查必填字段和类型 | boolean | — | 校验失败抛异常并提示 |

### 3.8 Credential Manager 模块（凭据管理）

**输入**：用户交互。

| 功能 | 输入 | 行为 | 输出 | 边界条件 | 错误处理 |
|------|------|------|------|----------|----------|
| 检测 key | (无) | 查钥匙串/加密文件 | boolean | — | — |
| 录入 key | 隐藏输入 | 存入钥匙串/加密文件 | 成功/失败 | key 非空 | 钥匙串不可用时降级加密文件 |
| 查看状态 | (无) | 读取并脱敏 | "sk-***...***ab12 (来源)" | — | key 不存在显示"未配置" |
| 更新 | 隐藏输入 | 覆盖旧 key | 成功/失败 | — | — |
| 清除 | (无) | 从钥匙串/加密文件删除 | 成功/失败 | — | — |

### 3.9 Docker Exec 模块（容器执行）

**输入**：命令/文件操作。

| 功能 | 输入 | 行为 | 输出 | 边界条件 | 错误处理 |
|------|------|------|------|----------|----------|
| 创建容器 | (无) | docker create + start | containerId | Docker daemon 可用 | 不可用时抛异常 |
| 写文件 | path, content | docker cp 写入容器 | 成功/失败 | path 在工作目录内 | — |
| 读文件 | path | docker cp 读出容器 | content | — | — |
| 执行命令 | command | docker exec | stdout, stderr, exitCode | 超时 30s | 超时 kill 容器 |
| 销毁容器 | (无) | docker rm | 成功 | — | — |

---

## 4. 非功能性需求

### 4.1 性能

| 指标 | 目标 | 说明 |
|------|------|------|
| LLM 单轮响应 | < 30s | 取决于供应商；超时由配置控制 |
| pytest 执行 | < 30s（可配置） | 超时即终止并回灌 TIMEOUT 信号 |
| Docker 容器启动 | < 5s | 预构建镜像，仅挂载工作目录 |
| WebSocket 事件推送延迟 | < 1s | 事件总线 → WebSocket → 浏览器 |
| 单任务最大轮次 | 5（可配置） | 达到上限即终止 |
| 并发任务 | 1（MVP） | 单进程串行处理，不做并发 |

### 4.2 安全

| 维度 | 措施 |
|------|------|
| 凭据存储 | OS 钥匙串优先 + 加密文件兜底（详见第 7 节） |
| 代码执行隔离 | AI 生成的代码在 Docker 容器内执行，与宿主机隔离 |
| 危险命令拦截 | Guardrail 模式匹配 + HITL 审批（详见第 10.4 节） |
| 日志脱敏 | 所有日志中 API key 自动替换为 `sk-****...****` |
| 容器网络 | 执行容器默认无网络访问（防止数据外泄） |
| 文件系统边界 | 容器仅挂载工作目录，无法访问宿主机其他路径 |

### 4.3 可用性

| 维度 | 措施 |
|------|------|
| 首次运行 | 交互式引导录入 API key，无需阅读文档 |
| WebUI | 任务提交 → 实时进度 → 结果查看，全流程浏览器内完成 |
| 错误提示 | LLM 解析失败、Docker 异常、测试超时等均有明确错误消息 |
| 配置 | YAML 配置文件，注释完整，可复制修改 |
| 历史回溯 | WebUI 可查看过往任务的每轮代码和测试结果 |

### 4.4 可观测性

| 维度 | 实现 |
|------|------|
| 实时事件流 | 事件总线 → WebSocket → 浏览器，展示 agent 每一步动作 |
| 持久化日志 | SQLite 存储全部任务/轮次记录，可查询 |
| 调试模式 | 配置 `debug: true` 时，记录原始 LLM 响应、原始 pytest 输出 |
| Agent 日志 | 每轮记录：上下文摘要、LLM 请求/响应、动作、护栏结果、测试结果 |
| 指标统计 | 任务成功率、平均轮次、常见失败类型分布 |

---

## 5. 系统架构

### 5.1 架构方案：模块化单体 + 事件总线 + WebSocket

单进程 Node.js 应用，内部用事件总线（EventEmitter）连接各模块，WebSocket 推送实时事件给浏览器前端。六个维度各自是独立模块，接口清晰，可独立单测。

### 5.2 组件图

```
                    ┌──────────────────────────────────────────────────────────┐
                    │                    浏览器 (前端 SPA)                       │
                    │  任务提交 │ 实时事件流 │ HITL 审批面板 │ 历史查看 │ Key 管理 │
                    └──────────────────────────┬───────────────────────────────┘
                                               │ WebSocket (JSON 事件)
                    ┌──────────────────────────┴───────────────────────────────┐
                    │                    WebUI Server                           │
                    │  (静态文件服务 + WebSocket 连接管理 + REST 端点)             │
                    └──────────────────────────┬───────────────────────────────┘
                                               │ 内部事件总线 (EventEmitter)
                    ┌──────────────────────────┴───────────────────────────────┐
                    │                                                          │
                    │   ┌─────────────┐  ┌─────────────┐  ┌─────────────┐   │
                    │   │ Config      │  │ Memory      │  │ Credential   │   │
                    │   │ Loader      │  │ Store       │  │ Manager     │   │
                    │   │ (YAML)      │  │ (SQLite)    │  │ (Keychain/  │   │
                    │   │             │  │             │  │  Encrypted) │   │
                    │   └──────┬──────┘  └──────┬──────┘  └──────┬──────┘   │
                    │          │                │                │           │
                    │   ┌──────┴────────────────┴────────────────┴──────┐    │
                    │   │              Agent Loop (决策核心)               │    │
                    │   │  组织上下文 → 调用 LLM → 解析动作 → 分发执行       │    │
                    │   │  → 回灌结果 → 停机判断                            │    │
                    │   └──┬──────────┬──────────┬──────────┬─────────────┘    │
                    │      │          │          │          │                  │
                    │   ┌──┴──────┐ ┌┴────────┐ ┌┴────────┐ ┌┴──────────┐    │
                    │   │ LLM     │ │ Tool    │ │Feedback │ │ Guardrail  │    │
                    │   │ Adapter │ │ Router  │ │ Parser │ │ + HITL     │    │
                    │   │         │ │         │ │         │ │            │    │
                    │   │ (Mock   │ │ (file   │ │ (pytest │ │ (pattern   │    │
                    │   │  注入)  │ │  r/w,  │ │  JSON   │ │  match +   │    │
                    │   │         │ │  shell, │ │  parse) │ │  approve)  │    │
                    │   │         │ │  test)  │ │         │ │            │    │
                    │   └────┬────┘ └────┬────┘ └────┬────┘ └─────┬──────┘    │
                    │        │           │           │             │            │
                    │        ▼           ▼           ▼             ▼            │
                    │   ┌─────────────────────────────────────────────────┐   │
                    │   │              Docker Exec (dockerode)             │   │
                    │   │   (在隔离容器内执行 AI 生成的代码和 pytest)         │   │
                    │   └─────────────────────────────────────────────────┘   │
                    └──────────────────────────────────────────────────────────┘
                                               │ HTTPS
                                               ▼
                                    ┌──────────────────┐
                                    │  LLM API          │
                                    │  (OpenAI 兼容,    │
                                    │   端点可配置)      │
                                    └──────────────────┘
```

### 5.3 数据流

1. **任务提交**：用户在 WebUI 填写任务描述 + 上传/编写 pytest 测试用例 → WebSocket 发送到 WebUI Server → 创建 Agent Session。
2. **Agent 循环**：Agent Loop 组织上下文（任务描述 + 测试 + 配置 + 压缩历史） → 通过 LLM Adapter 调用 LLM API → 解析返回的动作（write_file / run_shell / run_tests）。
3. **工具分发**：Tool Router 接收动作 → 若为危险命令，Guardrail 拦截 → HITL 通过 WebUI 请求审批 → 批准则执行 / 拒绝则回灌拒绝信号。
4. **测试反馈**：若动作为 run_tests → Docker Exec 在容器内执行 `pytest --json-report --tb=short` → Feedback Parser 解析 JSON → 提取通过/失败数、失败测试名、assertion 错误、traceback → 回灌给 Agent Loop。
5. **多轮修正**：Agent Loop 将结构化失败摘要 + 压缩历史（前几轮尝试的摘要）组装为新上下文 → 再次调用 LLM → 重复直到全绿或达到 max_retries。
6. **持久化**：每轮的代码、测试结果、最终状态写入 Memory Store (SQLite) → 可在后续任务中查询历史。

### 5.4 外部依赖

| 依赖 | 用途 | 替代方案 |
|------|------|----------|
| OpenAI 兼容 LLM API（端点通过配置注入） | LLM 推理 | 任何 OpenAI 兼容 API |
| Docker daemon | 代码执行沙箱 | 无（硬依赖） |
| OS 钥匙串 | API key 安全存储 | 加密文件（兜底） |
| dockerode (npm) | Docker SDK | Docker CLI via child_process |

---

## 6. 数据模型

### 6.1 实体关系

```
┌───────────┐ 1    N ┌───────────┐ 1    1 ┌───────────────┐
│   Task    │───────►│  Round    │───────►│ FeedbackSignal│
└─────┬─────┘        └─────┬─────┘        └───────┬───────┘
      │                    │                      │
      │ 1                  │ 1                    │ 1
      ▼                    ▼                      ▼
┌───────────┐      ┌───────────┐          ┌───────────────┐
│ TestFiles │      │  Action   │          │    Failure    │
└───────────┘      └───────────┘          └───────────────┘
```

### 6.2 持久化实体（SQLite）

**tasks 表**

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | TEXT | PK, UUID | 任务唯一标识 |
| description | TEXT | NOT NULL | 编程任务描述 |
| test_files | TEXT (JSON) | NOT NULL | `{filename: content}` 测试用例文件 |
| status | TEXT | NOT NULL | `pending` / `running` / `success` / `failure` / `aborted` |
| created_at | TEXT (ISO8601) | NOT NULL | 创建时间 |
| finished_at | TEXT (ISO8601) | nullable | 完成时间 |

**rounds 表**

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | INTEGER | PK, autoincrement | 轮次唯一标识 |
| task_id | TEXT | FK → tasks.id | 所属任务 |
| round_num | INTEGER | NOT NULL | 第几轮（从 1 开始） |
| code_files | TEXT (JSON) | NOT NULL | `{filename: content}` 本轮生成的代码 |
| action | TEXT (JSON) | NOT NULL | LLM 本轮的动作 |
| feedback | TEXT (JSON) | nullable | FeedbackSignal JSON |
| failure_type | TEXT | nullable | `COMPILE_ERROR` / `ASSERTION_ERROR` / `TIMEOUT` / `IMPORT_ERROR` / `RUNTIME_ERROR` |
| created_at | TEXT (ISO8601) | NOT NULL | 创建时间 |

### 6.3 内存实体（TypeScript 类型定义）

**Action（动作）**

```typescript
type Action =
  | { type: 'write_file'; path: string; content: string }
  | { type: 'read_file';  path: string }
  | { type: 'run_shell';  command: string }
  | { type: 'run_tests' };
```

**FeedbackSignal（反馈信号）**

```typescript
interface FeedbackSignal {
  total: number;
  passed: number;
  failed: number;
  failures: Failure[];
  failureType: FailureType;
  rawReport: string;       // 原始 JSON report, 调试用
}

interface Failure {
  testName: string;
  assertion: string;      // 断言表达式
  expected: string;        // 预期值
  actual: string;          // 实际值
  traceback: string;       // 简化的 traceback
}

type FailureType = 'COMPILE_ERROR' | 'ASSERTION_ERROR' | 'TIMEOUT' | 'IMPORT_ERROR' | 'RUNTIME_ERROR';
```

**GuardrailResult（护栏结果）**

```typescript
interface GuardrailResult {
  decision: 'ALLOW' | 'BLOCK' | 'REQUIRE_APPROVAL';
  reason: string;
  matchedPattern?: string;
}
```

**LLMContext（LLM 上下文）**

```typescript
interface LLMContext {
  systemPrompt: string;
  task: string;
  testFiles: Record<string, string>;
  historySummary: string;
  currentFailure?: FeedbackSignal;
  roundNum: number;
  maxRetries: number;
}
```

**LLMResponse（LLM 响应）**

```typescript
interface LLMResponse {
  content: string;
  action: Action;
  usage?: { promptTokens: number; completionTokens: number };
}
```

### 6.4 约束

- 一个 Task 有 1~max_retries 个 Round。
- Round.round_num 在同一 Task 内唯一且递增。
- Task.status 为 `success` 时不再产生新 Round。
- FeedbackSignal 只在 Action.type 为 `run_tests` 时产生。
- code_files 至少包含一个与任务相关的 .py 文件。

---

## 7. 凭据与分发设计

### 7.1 威胁模型

| 威胁 | 对策 |
|------|------|
| Key 硬编码进源码 | `.gitignore` + pre-commit hook 扫描 |
| Key 进入 Git 历史 | 提交前自查，若已泄露则 `git filter-branch` 清除 |
| Key 进入 shell history | 不使用 `export` 命令行方式；通过交互式引导录入 |
| Key 写入日志/终端 | 所有日志输出中 key 自动脱敏（`sk-****...****ab12`） |
| Key 明文存储在 .env | .env 仅作为开发环境便利，文档中明确标注明文风险 |
| Key 烘焙进 Docker 镜像 | 镜像不含 key，运行时通过交互式引导或挂载 volume 注入 |

### 7.2 存储方案：双模式

**模式 1（优先）：OS 钥匙串**

- Windows: Credential Manager（通过 `keytar` npm 库）
- macOS: Keychain
- Linux: Secret Service / GNOME Keyring

**模式 2（兜底）：加密文件**

- 文件路径：`~/.harness/credentials.enc`
- 算法：AES-256-GCM
- 主密码：用户首次运行时设置，通过隐藏输入录入
- 主密码不存储，仅存在于用户记忆中

### 7.3 录入/查看/更新/清除流程

```
首次运行:
  ┌──────────┐     ┌──────────────┐     ┌─────────────────┐
  │ 检测 key  │──无──►│ 引导录入      │───►│ 存入钥匙串/加密  │
  │ 是否存在  │     │ (隐藏输入)    │     │ 文件             │
  └──────────┘     └──────────────┘     └─────────────────┘
       │有
       ▼
  ┌──────────┐
  │ 正常启动  │
  └──────────┘

查看状态:  显示 "API Key: sk-****...****ab12 (已配置, 来源: 钥匙串)"
更新:     重新引导录入, 覆盖旧 key
清除:     从钥匙串/加密文件中删除
```

查看状态时**永不回显明文**，仅显示前 3 位 + 后 4 位 + 来源。

### 7.4 分发形态：Docker 镜像

```dockerfile
# 构建阶段
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY . .
RUN npm run build

# 运行阶段
FROM node:20-alpine
RUN apk add --no-cache docker-cli python3 py3-pip
RUN pip3 install pytest --break-system-packages
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
EXPOSE 3000
CMD ["node", "dist/server.js"]
```

### 7.5 获取与运行

```bash
# 构建
docker build -t harness-python:latest .

# 运行（首次，交互式录入 key）
docker run -it -p 3000:3000 -v /var/run/docker.sock:/var/run/docker.sock harness-python:latest

# 运行（后续，key 已存储在挂载的 volume 中）
docker run -d -p 3000:3000 \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v harness-data:/root/.harness \
  harness-python:latest
```

浏览器访问 `http://localhost:3000` 即可使用 WebUI。

### 7.6 目标平台与限制

| 项目 | 说明 |
|------|------|
| 目标平台 | Linux (x86_64 / ARM64), macOS (Intel / Apple Silicon), Windows (WSL2) |
| 前提依赖 | 宿主机需安装 Docker daemon |
| 架构限制 | 需要挂载 Docker socket（`/var/run/docker.sock`）以管理容器 |
| 已知限制 | Windows 原生（非 WSL2）不支持 Docker socket 挂载；ARM 平台需构建对应架构镜像 |

### 7.7 Key 在目标机器的安全配置

1. 首次 `docker run -it` 时，harness 检测到无 key，引导用户隐藏输入。
2. Key 存入容器内钥匙串或加密文件（持久化到 `harness-data` volume）。
3. 后续运行无需再次输入。
4. 可通过 WebUI 的 Key 管理页面查看状态/更新/清除。

---

## 8. 技术选型与理由

| 选型 | 理由 |
|------|------|
| **TypeScript (Node.js)** | 前后端统一语言生态；LLM SDK 丰富；Docker 镜像构建简单；类型安全利于大型项目维护 |
| **DeepSeek V4 Pro**（OpenAI 兼容 API） | 代码生成能力强；OpenAI 兼容格式便于抽象层设计；端点可配置，预留多供应商 |
| **Python (pytest)** 作为被测代码语言 | pytest 生态成熟；`--json-report` 输出结构化结果，解析器实现清晰；适合算法类任务 |
| **Docker** 作为沙箱和分发形态 | 安全隔离好；与分发要求天然契合；单镜像部署简单 |
| **SQLite** 作为记忆存储 | 无需额外服务；单文件持久化；适合单进程应用 |
| **WebSocket** 作为实时通信 | 双向通信，天然支持事件推送；比 SSE 更灵活 |
| **dockerode** 作为 Docker SDK | Node.js 原生库；API 丰富；比 CLI 调用更可靠 |
| **keytar** 作为钥匙串库 | 跨平台支持 Windows/macOS/Linux 钥匙串 |
| **YAML** 作为配置格式 | 人类可读；注释支持好；适合声明式规则 |

本项目为纯后端 + CLI/WebUI 项目，无前端设计系统需求，Open Design 豁免。

---

## 9. 领域与机制设计

> 满足课程 §A.5 的额外要求。

### 9.1 领域：Coding（编码场景）

harness 面向的场景是：给定一个编程任务 + 一组 pytest 测试用例，让 LLM 生成 Python 代码，harness 自动运行测试、解析结果、回灌失败信号驱动自我修正。

### 9.2 客观反馈信号

| 信号类型 | 来源 | 解析方式 | 回灌内容 |
|----------|------|----------|----------|
| 测试通过/失败 | pytest --json-report | Feedback Parser 解析 JSON | 通过数/失败数/失败测试名/assertion 错误/traceback 摘要 |
| 语法/编译错误 | pytest collection error | Feedback Parser 识别 error class | 错误类型/文件名/行号/错误消息 |
| 执行超时 | Docker Exec 超时检测 | 超时信号 | "执行超时，N 秒内未完成" |

**关键设计**：Feedback Parser 是一个纯函数 `parseTestResult(jsonReport: PytestJsonReport): FeedbackSignal`，输入是 pytest 的 JSON report，输出是结构化的 `FeedbackSignal` 对象。这个函数是确定性的，不依赖 LLM，可直接单测。

### 9.3 危险动作

| 危险类别 | 匹配模式 | 处理方式 |
|----------|----------|----------|
| 删除命令 | `rm -rf`, `rm -r /`, `rmdir /s` 等 | HITL 审批 |
| Git 推送 | `git push --force`, `git push -f`, `git push origin` | HITL 审批 |
| 网络管道 | `curl ... \| sh`, `wget ... \| bash` | HITL 审批 |
| 系统修改 | `chmod -R`, `chown`, `sudo` | HITL 审批 |
| 写入系统目录 | 路径匹配 `/etc/`, `/usr/`, `C:\Windows\` | 硬拦截 |

**关键设计**：Guardrail 是一个纯函数 `checkAction(action: Action): GuardrailResult`，输入是一个动作对象，输出是 `ALLOW` / `BLOCK` / `REQUIRE_APPROVAL`。危险命令模式列表从配置文件加载，可扩展。HITL 审批通过事件总线暂停 Agent Loop，等待 WebUI 用户响应。整个流程是确定性代码，可用 mock LLM + mock 审批单测。

### 9.4 所需工具

| 工具名 | 输入 | 行为 | 输出 |
|--------|------|------|------|
| `write_file` | path, content | 在 Docker 容器工作目录写文件 | 成功/失败 |
| `read_file` | path | 从 Docker 容器工作目录读文件 | 文件内容 |
| `run_shell` | command | 在 Docker 容器内执行 shell 命令 | stdout, stderr, exit_code |
| `run_tests` | (无参数) | 在容器内执行 `pytest --json-report --tb=short` | FeedbackSignal 对象 |

**关键设计**：Tool Router 是一个分发器 `dispatchAction(action: Action): ActionResult`，根据 action.type 路由到对应工具。所有工具通过 Docker Exec 在隔离容器内执行。Tool Router 本身不依赖 LLM，可用 mock 动作单测。

### 9.5 记忆需求

| 记忆类型 | 存储 | 用途 | 检索方式 |
|----------|------|------|----------|
| 任务历史 | SQLite | 跨会话回溯过往任务 | 按任务 ID / 状态 / 时间查询 |
| 轮次记录 | SQLite | 每轮代码 + 测试结果 + 压缩摘要 | 按任务 ID 查询全部轮次 |
| 压缩历史摘要 | 内存（运行时） | 避免重复尝试 + 控制 token | 当前会话内组装 |

**关键设计**：Memory Store 提供接口 `saveTask`, `saveRound`, `getTask`, `listTasks`。压缩历史摘要由 `compressHistory(rounds: Round[]): string` 纯函数生成，将每轮的"改了什么 + 为什么失败"压缩为一行摘要。这个函数是确定性的，可单测。

### 9.6 重点维度：反馈闭环 + 多轮自我修正

**选择理由**：

1. **工程密度最高**——涉及测试解析、失败分类、历史压缩、上下文组装、循环终止，每个环节都是确定性代码。
2. **最契合 §A.4-C 判定标准**——移除 LLM 后，整个反馈闭环仍可用 mock LLM 驱动的单测验证：mock LLM 按脚本返回预设动作，Feedback Parser 真实解析测试结果，Guardrail 真实拦截，循环逻辑真实运转。
3. **最能体现"考试教练"比喻**——harness 不是被动地转发 LLM 输出，而是主动解析失败、压缩历史、组装上下文，像一个教练分析学生错题后给出针对性反馈。

**深入实现点**：

- **失败分类器**：将失败分为 `COMPILE_ERROR`（语法错误）/ `ASSERTION_ERROR`（逻辑错误）/ `TIMEOUT`（超时）/ `IMPORT_ERROR`（依赖缺失），不同类别回灌给 LLM 的信息粒度不同。
- **历史压缩器**：将 N 轮尝试压缩为"第 1 轮：尝试 X 方案，因 Y 失败；第 2 轮：尝试 Z 方案，因 W 失败"的摘要，控制 token 消耗。
- **循环终止逻辑**：全绿 → 成功；达到 max_retries → 失败；连续 N 轮失败模式相同（重复尝试同一修法）→ 提前终止。

---

## 10. 六维度详细设计

### 10.1 决策封装（Agent Loop）

Agent Loop 是 harness 的心脏，自己编码实现主循环：

```
┌─────────────────────────────────────────────────────────────────┐
│  Agent Loop                                                      │
│                                                                  │
│  1. 组装上下文                                                    │
│     context = {                                                  │
│       task: 任务描述,                                              │
│       tests: 测试用例文件,                                         │
│       config: 配置参数,                                            │
│       history: compressHistory(previousRounds),  // 压缩历史      │
│       currentFailure: latestFeedbackSignal  // 本轮失败信号       │
│     }                                                            │
│                                                                  │
│  2. 调用 LLM  ────► LLM Adapter.generate(context) → response      │
│                                                                  │
│  3. 解析动作  ────► parseAction(response) → Action                │
│     Action = { type: 'write_file'|'run_shell'|'run_tests',      │
│                ...params }                                       │
│                                                                  │
│  4. 护栏检查  ────► guardrail.checkAction(action) → result        │
│     ALLOW → 执行                                                  │
│     BLOCK → 回灌拒绝信号                                          │
│     REQUIRE_APPROVAL → 暂停, 等待 HITL                            │
│                                                                  │
│  5. 分发执行  ────► toolRouter.dispatch(action) → result         │
│                                                                  │
│  6. 回灌结果  ────► 若为 run_tests:                               │
│     feedback = feedbackParser.parse(result)                      │
│     若全绿 → 停机(成功)                                           │
│     若失败 → 记录本轮, 回到步骤 1                                   │
│                                                                  │
│  7. 停机判断                                                      │
│     全绿 → SUCCESS                                                │
│     round >= max_retries → FAILURE                               │
│     连续 N 轮失败模式相同 → FAILURE (提前终止)                     │
│     用户中止 → ABORTED                                            │
└─────────────────────────────────────────────────────────────────┘
```

**LLM 输出协议**：LLM 返回 JSON 格式的动作指令，例如：

```json
{"action": "write_file", "path": "stack.py", "content": "class Stack: ..."}
{"action": "run_tests"}
```

`parseAction()` 是确定性解析函数，不依赖 LLM 智能来理解输出——它按固定 schema 解析 JSON。

### 10.2 动作/工具（Tool Router）

| 工具 | 接口 | 执行环境 | 返回 |
|------|------|----------|------|
| `write_file` | `(path: string, content: string)` | Docker 容器 | `{success: boolean}` |
| `read_file` | `(path: string)` | Docker 容器 | `{content: string}` |
| `run_shell` | `(command: string)` | Docker 容器 | `{stdout, stderr, exitCode}` |
| `run_tests` | `()` | Docker 容器 | `{feedbackSignal: FeedbackSignal}` |

所有工具通过 `DockerExec` 在隔离容器内执行。容器挂载工作目录，预装 Python + pytest。`run_tests` 内部调用 `run_shell("pytest --json-report --tb=short")` 并将结果传给 Feedback Parser。

### 10.3 上下文与记忆（Memory Store）

**SQLite Schema**：

```sql
CREATE TABLE tasks (
  id          TEXT PRIMARY KEY,
  description TEXT NOT NULL,
  test_files  TEXT NOT NULL,      -- JSON: {filename: content}
  status      TEXT NOT NULL,      -- pending|running|success|failure|aborted
  created_at  TEXT NOT NULL,
  finished_at TEXT
);

CREATE TABLE rounds (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id     TEXT NOT NULL REFERENCES tasks(id),
  round_num   INTEGER NOT NULL,
  code_files  TEXT NOT NULL,      -- JSON: {filename: content}
  action      TEXT NOT NULL,      -- LLM 本轮的动作
  feedback    TEXT,               -- FeedbackSignal JSON
  failure_type TEXT,             -- COMPILE_ERROR|ASSERTION_ERROR|TIMEOUT|...
  created_at  TEXT NOT NULL
);
```

**压缩历史函数**：

```typescript
compressHistory(rounds: Round[]): string
// 输出: "第1轮: write_file stack.py, 失败[ASSERTION_ERROR]: test_push_pop 失败
//        第2轮: write_file stack.py, 失败[TIMEOUT]: 执行超时"
```

### 10.4 治理护栏（Guardrail + HITL）

**护栏函数**：

```typescript
checkAction(action: Action): GuardrailResult
// 返回: { decision: 'ALLOW'|'BLOCK'|'REQUIRE_APPROVAL', reason: string }
```

**HITL 状态机**：

```
    ┌─────────┐  危险动作   ┌──────────────────┐
    │ RUNNING │ ──────────► │ WAITING_APPROVAL │
    └────┬────┘              └────────┬─────────┘
         │                            │
         │                    ┌───────┴───────┐
         │                    │               │
         │               批准(approve)     拒绝(reject)
         │                    │               │
         │                    ▼               ▼
         │              ┌──────────┐   ┌───────────┐
         │              │ APPROVED │   │ REJECTED  │
         │              └─────┬────┘   └─────┬─────┘
         │                    │              │
         │     ◄──恢复执行────┘              │
         │                                   │
         │◄────回灌拒绝信号──────────────────┘
         │
         ▼
    继续循环
```

危险命令模式从配置文件加载，支持正则匹配。HITL 审批通过事件总线暂停 Agent Loop，WebUI 收到 `approval_request` 事件后展示审批面板，用户操作后发送 `approve`/`reject` 事件恢复循环。

### 10.5 反馈闭环（Feedback Parser）—— 重点维度

本项目的**主要贡献**，深入实现以下子机制：

**a) 测试结果解析器**：

```typescript
parseTestResult(jsonReport: PytestJsonReport): FeedbackSignal
// 提取: { total, passed, failed, failures: [{testName, assertion, traceback}] }
```

**b) 失败分类器**：

```typescript
classifyFailure(feedback: FeedbackSignal): FailureType
// COMPILE_ERROR   - 语法错误, pytest collection error
// ASSERTION_ERROR - 测试运行了但断言失败
// TIMEOUT         - 执行超时
// IMPORT_ERROR    - 依赖缺失
// RUNTIME_ERROR   - 运行时异常
```

不同失败类型回灌给 LLM 的信息粒度不同：

- `COMPILE_ERROR`：回灌完整错误消息 + 行号
- `ASSERTION_ERROR`：回灌失败测试名 + assertion 表达式 + 预期/实际值
- `TIMEOUT`：回灌"执行超时, N 秒内未完成"
- `IMPORT_ERROR`：回灌缺失的模块名

**c) 历史压缩器**：

```typescript
compressHistory(rounds: Round[]): string
// 将 N 轮压缩为摘要, 控制在 max_history_tokens 以内
```

**d) 重复检测器**：

```typescript
detectRepetition(rounds: Round[]): boolean
// 检测连续 N 轮是否产生相同的失败类型 + 相同失败测试
// 若重复 → 提前终止, 避免无限循环
```

**e) 上下文组装器**：

```typescript
assembleContext(task, tests, config, history, currentFailure): LLMContext
// 组装最终发给 LLM 的上下文
```

以上五个函数全部是纯函数，不依赖 LLM，可用确定性单测验证。

### 10.6 配置（Config Loader）

**config.yaml 示例**：

```yaml
llm:
  model: "deepseek-v4-pro"
  temperature: 0.3
  max_tokens: 4096
  api_base: ""        # 从凭据管理器注入

agent:
  max_retries: 5
  timeout_seconds: 30
  repetition_threshold: 3   # 连续 3 轮相同失败模式 → 提前终止
  max_history_tokens: 2000  # 压缩历史摘要的最大 token 数

guardrail:
  enable_hitl: true
  hitl_timeout_seconds: 30  # HITL 审批超时, 超时默认拒绝
  blocked_patterns:         # 硬拦截
    - "rm\\s+-rf\\s+/"
    - "git\\s+push\\s+(-f|--force)"
  approval_patterns:        # 需审批
    - "sudo\\s+"
    - "chmod\\s+-R"
    - "curl.*\\|.*sh"

docker:
  image: "harness-python:latest"
  work_dir: "/workspace"
  memory_limit: "256m"
```

Config Loader 在启动时读取配置文件，校验 schema，注入到各模块。

---

## 11. 验收标准

### 11.1 功能验收标准

| ID | 功能 | 验收标准 | 验证方式 |
|----|------|----------|----------|
| AC1 | 任务提交 | 用户在 WebUI 填写任务描述 + 上传 pytest 文件，点击开始后任务状态变为 `running` | 手动 + E2E 测试 |
| AC2 | Agent 主循环 | Agent Loop 按顺序执行：组装上下文 → 调用 LLM → 解析动作 → 护栏检查 → 分发执行 → 回灌结果 → 停机判断 | Mock LLM 单测 |
| AC3 | 测试反馈解析 | 给定 pytest JSON report，Feedback Parser 正确提取通过/失败数、失败测试名、assertion 错误、traceback | 确定性单测 |
| AC4 | 失败分类 | 给定不同类型的 pytest 失败输出，分类器正确识别为 COMPILE_ERROR / ASSERTION_ERROR / TIMEOUT / IMPORT_ERROR / RUNTIME_ERROR | 确定性单测 |
| AC5 | 多轮自我修正 | Mock LLM 按脚本返回预设动作，第 1 轮失败 → 收到反馈 → 第 2 轮修正 → 全绿。循环正确运转且停机 | Mock LLM 单测 |
| AC6 | 历史压缩 | 给定 N 轮 Round 记录，compressHistory 输出不超过 max_history_tokens 的摘要，且包含每轮的关键信息 | 确定性单测 |
| AC7 | 重复检测 | 连续 N 轮（可配置）产生相同失败类型 + 相同失败测试时，detectRepetition 返回 true，Agent Loop 提前终止 | 确定性单测 |
| AC8 | 护栏拦截 | 给定 `rm -rf /` 动作，Guardrail 返回 BLOCK 或 REQUIRE_APPROVAL；给定 `ls` 动作，返回 ALLOW | 确定性单测 |
| AC9 | HITL 审批 | 危险动作触发后，Agent Loop 暂停，WebUI 显示审批面板；用户批准后恢复执行，拒绝后回灌拒绝信号 | Mock LLM + Mock 审批单测 |
| AC10 | 记忆持久化 | 任务完成后重启系统，可通过 WebUI 查看过往任务的轮次记录和最终状态 | 集成测试 |
| AC11 | 配置加载 | 修改 YAML 配置文件后重启，新配置生效（max_retries、timeout、危险命令模式等） | 集成测试 |
| AC12 | 凭据管理 | 首次运行引导录入 key；查看状态显示脱敏 key；更新覆盖旧 key；清除后 key 不存在 | 手动 + 单测 |
| AC13 | Docker 分发 | 全新机器上 `docker build` + `docker run` 可启动系统，浏览器访问 WebUI 可用 | 手动验证 |

### 11.2 机制演示验收（课程 §A.6 要求）

| ID | 演示 | 验收标准 | 验证方式 |
|----|------|----------|----------|
| D1 | 护栏拦截危险动作 | Mock LLM 返回 `rm -rf /` 动作 → Guardrail 拦截 → Agent Loop 不执行该动作 → 回灌拒绝信号 | 可重复运行的测试/脚本 |
| D2 | 反馈闭环驱动修正 | Mock LLM 第 1 轮返回有 bug 的代码 → pytest 失败 → Feedback Parser 解析 → 回灌失败信号 → Mock LLM 第 2 轮返回修正代码 → pytest 全绿 | 可重复运行的测试/脚本 |
| D3 | 重点维度确定性行为 | Mock LLM 连续 3 轮返回相同 bug 的代码 → detectRepetition 检测到重复 → Agent Loop 提前终止（不等 max_retries） | 可重复运行的测试/脚本 |

### 11.3 Mock LLM 单测覆盖（课程 §A.6 要求）

所有核心机制在替换为 Mock LLM 后，仍能用确定性单元测试验证：

| 机制 | Mock LLM 脚本 | 断言 |
|------|---------------|------|
| Agent Loop | 按预设序列返回动作 | 循环按预期步骤执行 |
| Tool Router | 返回 write_file / run_tests 动作 | 正确路由到对应工具 |
| Guardrail | 返回危险/安全动作 | 正确拦截/放行 |
| Feedback Parser | （不依赖 LLM） | 正确解析各种 pytest 输出 |
| HITL 状态机 | 返回危险动作 + Mock 审批 | 状态转换正确 |
| 停机判断 | 返回全绿/失败/重复失败 | 正确停机 |

---

## 12. 风险与未决问题

### 12.1 风险

| ID | 风险 | 影响 | 概率 | 对策 |
|----|------|------|------|------|
| R1 | **LLM 输出格式不稳定** — LLM 可能不总是返回合法 JSON 动作 | Agent Loop 中断 | 中 | `parseAction()` 做容错解析；解析失败时回灌"请按 JSON 格式返回动作"的信号；启用 LLM 的 JSON mode（若供应商支持） |
| R2 | **Docker socket 安全风险** — 挂载 `/var/run/docker.sock` 等于赋予容器 root 权限 | 宿主机安全 | 中 | 文档中明确标注风险；建议在 CI/专用机器上运行；未来可考虑用 Docker-in-Docker 或 Podman 替代 |
| R3 | **pytest JSON report 格式变化** — 不同 pytest 版本 JSON 结构可能不同 | Feedback Parser 解析失败 | 低 | Docker 镜像中 pin pytest 版本；解析器做防御性编程，缺失字段时降级为原始输出回灌 |
| R4 | **Token 溢出** — 长任务多轮重试后上下文超出窗口 | LLM 调用失败 | 中 | `compressHistory()` 控制 token；配置 `max_history_tokens`；极端情况截断最早的历史 |
| R5 | **LLM 重复同一修法** — LLM 反复尝试相同的错误修复方案 | 无限循环浪费 token | 高 | `detectRepetition()` 检测连续 N 轮相同失败模式，提前终止 |
| R6 | **Docker 不可用** — 用户机器未安装 Docker | 系统无法运行 | 中 | 启动时检测 Docker daemon，不可用时给出明确错误消息和安装指引 |
| R7 | **钥匙串不可用** — 无头 Linux 无 Secret Service | 凭据存储降级 | 低 | 自动降级为加密文件模式，引导用户设置主密码 |
| R8 | **LLM 生成恶意代码** — LLM 可能生成有破坏性的 Python 代码 | 容器内文件损坏 | 低 | Docker 容器隔离 + 无网络访问 + 工作目录挂载隔离；每任务新建容器，不复用 |

### 12.2 未决问题

| ID | 问题 | 当前倾向 | 留待何时决定 |
|----|------|----------|-------------|
| Q1 | 是否支持多个测试文件？ | 支持，`test_files` 已设计为 `{filename: content}` 结构 | 实现阶段确认 |
| Q2 | WebUI 是否支持多并发任务？ | MVP 不支持，单任务串行；架构上事件总线可扩展 | MVP 后评估 |
| Q3 | 未来是否支持 Python 以外的语言？ | 架构上 Tool Router 和 Docker Exec 可扩展；Feedback Parser 需为每种语言实现 | 不在本次范围 |
| Q4 | LLM 的 JSON mode 是否可靠？ | 先实现容错解析器，同时测试 JSON mode 效果 | 实现阶段验证 |
| Q5 | 是否需要用户认证？ | MVP 不需要（本地运行）；若部署到公网则需加 | 取决于是否公网部署 |
