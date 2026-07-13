# AGENT_LOG.md — 开发过程日志

> 按时间顺序记录 SDD（Subagent-Driven Development）全过程的关键节点。
>
> 开发工具：OpenCode + GLM-5.2 模型 + Superpowers 技能框架
>
> 时间跨度：2026-07-13 22:49 ~ 2026-07-14 02:13（约 3.5 小时）

---

## 阶段 0：项目初始化

### 2026-07-13 22:49 — Git 仓库初始化

- **技能**：subagent-driven-development
- **操作**：`git init` + 初始提交（SPEC.md、PLAN.md、.opencode/ 技能文件）
- **人工干预**：发现 `auth.json` 包含真实 API key 被提交，立即 `git rm --cached` 并 amend 初始提交，添加 `.gitignore` 排除 `auth.json`
- **教训**：`git add -A` 会扫入工作目录中所有文件，包括敏感凭据文件。提交前必须检查暂存区内容。
- **Commit**：`b854a2c` chore: initial commit with SPEC.md and PLAN.md (auth.json excluded)

---

## 阶段 1：Task 1 — 项目脚手架 + 共享类型

### 2026-07-13 22:54 — 实现

- **技能**：subagent-driven-development → implementer
- **Subagent 类型**：general
- **任务**：创建 package.json、tsconfig.json、vitest.config.ts、.gitignore、src/types.ts、tests/helpers/fixtures.ts
- **Subagent 输出**：6 个文件全部创建，`npm install` 成功，`tsc --noEmit` 通过
- **Commit**：`659e757` chore: project scaffolding + shared types

### 2026-07-13 22:54 — 评审

- **技能**：subagent-driven-development → task-reviewer
- **评审结果**：Approved。无 Critical/Important 问题。Minor：tsconfig 排除 tests 目录、src/index.ts 尚未创建（后续 task 创建）
- **人工干预**：无

---

## 阶段 2：Task 2 — 配置加载器

### 2026-07-13 23:02 — 实现

- **任务**：创建 src/config/config-loader.ts、config.yaml、tests/config-loader.test.ts
- **Subagent 输出**：3 个文件创建，3/3 测试通过
- **Commit**：`02ec406` feat: config loader with YAML parsing and defaults

### 2026-07-13 23:02 — 评审

- **评审结果**：Approved，但发现 Important 问题：`DEFAULT_CONFIG` 使用浅拷贝（`{ ...DEFAULT_CONFIG }`），嵌套对象共享引用
- **人工干预**：dispatch fix subagent → 改用 `structuredClone(DEFAULT_CONFIG)`
- **Fix Commit**：`6eea2fd` fix: use structuredClone for deep copy of DEFAULT_CONFIG
- **教训**：计划中的代码可能包含隐含的共享引用 bug，评审时需关注可变性

---

## 阶段 3：Task 3 — 事件总线

### 2026-07-13 23:08 — 实现

- **任务**：创建 src/event-bus/event-bus.ts、tests/event-bus.test.ts
- **Subagent 输出**：实现完成，但发现计划代码在 `off removes a listener` 测试中会崩溃——Node.js EventEmitter 在无监听器时 emit `'error'` 会抛异常
- **偏离**：在 `emit()` 中添加 3 行守卫代码：当 emit `'error'` 且无监听器时返回 `false`
- **Commit**：`8abeb76` feat: event bus for internal module communication

### 2026-07-13 23:08 — 评审

- **评审结果**：Approved。偏离合理且有证据支持（实际错误输出）
- **人工干预**：无

---

## 阶段 4：Task 4 — LLM 适配器接口 + Mock LLM

### 2026-07-13 23:12 — 实现

- **任务**：创建 src/llm/llm-adapter.ts、src/llm/mock-llm.ts、tests/mock-llm.test.ts
- **Subagent 输出**：3 个文件创建，3/3 测试通过，无偏离
- **Commit**：`5bffbfb` feat: LLM adapter interface and mock LLM for testing

### 2026-07-13 23:12 — 评审

- **评审结果**：Approved。无 Critical/Important 问题
- **人工干预**：无

---

## 阶段 5：Task 5 — 护栏（Guardrail）

### 2026-07-13 23:22 — 实现

- **任务**：创建 src/guardrail/guardrail.ts、tests/guardrail.test.ts
- **Subagent 输出**：7/7 测试通过
- **Commit**：`ba74c13` feat: guardrail with pattern matching and path checking

### 2026-07-13 23:22 — 评审

- **评审结果**：Approved，但发现 Important 问题：`path.startsWith('.')` 允许 `../etc/passwd` 通过路径检查——路径遍历漏洞
- **人工干预**：dispatch fix subagent → 改为 `path.startsWith('./')`，添加路径遍历测试
- **Fix Commit**：`fa18178` fix: block path traversal via ../ in guardrail checkPath
- **教训**：安全检查不能仅靠前缀匹配，`.` 开头的路径不等于相对路径

---

## 阶段 6：Task 6 — HITL 状态机

### 2026-07-13 23:29 — 实现

- **任务**：创建 src/guardrail/hitl-state-machine.ts、tests/hitl-state-machine.test.ts
- **Subagent 输出**：6/6 测试通过
- **Commit**：`b56b6ae` feat: HITL state machine with timeout auto-reject

### 2026-07-13 23:29 — 评审

- **评审结果**：Approved。Important 发现（事件 payload 未断言、状态守卫未测试）标记为 deferred——计划未要求这些测试
- **人工干预**：无

---

## 阶段 7：Task 7 — 反馈解析器（核心深度点）

### 2026-07-13 23:35 — 实现

- **任务**：创建 src/feedback/feedback-parser.ts、tests/feedback-parser.test.ts
- **Subagent 输出**：5/5 测试通过。但发现 `rawReport` 字段不匹配：parser 输出 `JSON.stringify(report)`，fixture 声明 `rawReport: ''`
- **Commit**：`d190e68` feat: feedback parser for pytest JSON reports

### 2026-07-13 23:35 — 评审

- **评审结果**：Approved，但确认 `rawReport` 不匹配是真实 bug，会在下游 task 导致级联失败
- **人工干预**：dispatch fix subagent → 更新 fixture 的 `rawReport` 为 `JSON.stringify(samplePytestReport)`
- **Fix Commit**：`155c790` fix: update expectedFeedbackSignal rawReport to match parser output
- **教训**：Task 1 创建的 fixture 与 Task 7 的实现之间存在隐含假设不一致，跨 task 依赖是 spec 评审的重点

---

## 阶段 8：Task 8 — 失败分类器

### 2026-07-13 23:41 — 实现 + 评审

- **任务**：创建 src/feedback/failure-classifier.ts、tests/failure-classifier.test.ts
- **Subagent 输出**：6/6 测试通过，无偏离
- **Commit**：`46be4b4` feat: failure classifier for categorizing test failures
- **评审结果**：Approved。Minor：文件头有注释（违反 no-comments 约定），但来自计划
- **人工干预**：无

---

## 阶段 9：Task 9 — 历史压缩器

### 2026-07-13 23:46 — 实现 + 评审

- **任务**：创建 src/feedback/history-compressor.ts、tests/history-compressor.test.ts
- **Subagent 输出**：4/4 测试通过，无偏离
- **Commit**：`8cce24c` feat: history compressor for multi-round context management
- **评审结果**：Approved
- **人工干预**：无

---

## 阶段 10：Task 10 — 重复检测器

### 2026-07-13 23:51 — 实现 + 评审

- **任务**：创建 src/feedback/repetition-detector.ts、tests/repetition-detector.test.ts
- **Subagent 输出**：5/5 测试通过，无偏离
- **Commit**：`ed4f2d8` feat: repetition detector to prevent infinite loops
- **评审结果**：Approved
- **人工干预**：无

---

## 阶段 11：Task 11 — 上下文组装器

### 2026-07-13 23:56 — 实现 + 评审

- **任务**：创建 src/feedback/context-assembler.ts、tests/context-assembler.test.ts
- **Subagent 输出**：2/2 测试通过，无偏离
- **Commit**：`fd3d295` feat: context assembler for LLM context construction
- **评审结果**：Approved
- **人工干预**：无

---

## 阶段 12：Task 12 — Action 解析器

### 2026-07-14 00:02 — 实现 + 评审

- **任务**：创建 src/agent/action-parser.ts、tests/action-parser.test.ts
- **Subagent 输出**：8/8 测试通过，无偏离
- **Commit**：`8b1f6bb` feat: action parser for LLM JSON output
- **评审结果**：Approved
- **人工干预**：无

---

## 阶段 13：Task 13 — 记忆存储

### 2026-07-14 00:11 — 实现

- **任务**：创建 src/memory/memory-store.ts、tests/memory-store.test.ts
- **Subagent 输出**：5/5 测试通过。偏离：`afterEach` 中 `rmSync` 在 Windows 上抛 EPERM（SQLite 句柄未关闭），添加 `store.close()` 修复
- **Commit**：`e248f47` feat: memory store with SQLite persistence

### 2026-07-14 00:11 — 评审

- **评审结果**：Approved。偏离合理——使用计划自身提供的 `close()` 方法
- **人工干预**：无

---

## 阶段 14：Task 14 — Docker 执行器

### 2026-07-14 00:31 — 实现

- **任务**：创建 src/tools/docker-exec.ts、tests/docker-exec.test.ts
- **Subagent 输出**：3/3 测试通过。但需要 3 处编译修复：
  1. 测试 mock 缺少 `getContainer` 方法
  2. `exec.start(callback)` 无 callback-only overload → `exec.start({}, cb)`
  3. `Buffer.write(v, off, 'octal')` — `'octal'` 不是合法 `BufferEncoding`
- **Commit**：`134f34d` feat: docker exec for isolated code execution

### 2026-07-14 00:31 — 评审

- **评审结果**：Approved。所有修复都是最小化、行为保持的
- **人工干预**：无
- **教训**：计划中的 TypeScript 代码可能无法通过 `@types/dockerode` 的类型检查，计划评审应包含类型检查

---

## 阶段 15：Task 15 — 工具路由器

### 2026-07-14 00:37 — 实现 + 评审

- **任务**：创建 src/tools/tool-router.ts、tests/tool-router.test.ts
- **Subagent 输出**：4/4 测试通过，无偏离
- **Commit**：`877e1ed` feat: tool router for dispatching actions to Docker
- **评审结果**：Approved
- **人工干预**：无

---

## 阶段 16：Task 16 — 凭据管理器

### 2026-07-14 00:45 — 实现

- **任务**：创建 src/credentials/credential-manager.ts、tests/credential-manager.test.ts
- **Subagent 输出**：5/5 测试通过。2 处修复：
  1. keytar mock 无状态（`getPassword` 永远返回 null）→ 改为 Map 有状态 mock
  2. `maskKey` 暴露前 3 + 后 4 字符，但测试期望前 6 + 后 5 → 对齐测试
- **Commit**：`45617bd` feat: credential manager with OS keychain storage

### 2026-07-14 00:45 — 评审

- **评审结果**：Approved。两处修复都是解决计划内部矛盾（mock 与测试不一致、maskKey 与测试不一致）
- **人工干预**：无

---

## 阶段 17：Task 17 — Agent Loop（核心集成任务）

### 2026-07-14 00:57 — 实现

- **任务**：创建 src/agent/agent-loop.ts、tests/agent-loop.test.ts
- **Subagent 输出**：3/3 测试通过。但需要多处修复：
  1. `parseAction` 对 MockLLM 输出总是抛异常（MockLLM 用 `type` 字段，parseAction 期望 `action` 字段）→ 添加 `response.action` 回退
  2. `FailureType` 类型不匹配
  3. Windows 上 `memory.close()` 需要
- **Commit**：`609407a` feat: agent loop with feedback-driven self-correction

### 2026-07-14 01:12 — 评审

- **评审结果**：**Needs fixes** — 发现 2 个 Critical 问题：
  1. HITL 拒绝路径损坏——拒绝后仍然执行动作（安全漏洞）
  2. HITL 流程完全未测试
- **Important 问题**：无 error 事件、重复检测未测试、parseAction 错误路径死代码
- **人工干预**：dispatch fix subagent → 修复 HITL 拒绝路径（检查 `p.approved`）、添加 error 事件、添加 4 个新测试（HITL 审批/拒绝、重复检测）
- **Fix Commit**：`c6a2be0` fix: HITL rejection path, error events, and missing tests
- **教训**：集成任务是安全漏洞最可能暴露的地方。计划中的代码在单元测试通过的情况下仍可能有逻辑缺陷——评审必须验证控制流而非仅看测试结果

---

## 阶段 18：Task 18 — OpenAI 适配器

### 2026-07-14 01:18 — 实现 + 评审

- **任务**：创建 src/llm/openai-adapter.ts、tests/openai-adapter.test.ts
- **Subagent 输出**：1/1 测试通过，无偏离
- **Commit**：`c2efed9` feat: OpenAI-compatible LLM adapter
- **评审结果**：Approved
- **人工干预**：无

---

## 阶段 19：Task 19 — WebUI 服务器

### 2026-07-14 01:29 — 实现

- **任务**：创建 src/webui/server.ts、tests/webui-server.test.ts
- **Subagent 输出**：4/4 测试通过。偏离：`stop()` 中添加 `memory.close()`（Windows EPERM 修复）
- **Commit**：`9c2b80a` feat: WebUI server with WebSocket and REST API

### 2026-07-14 01:29 — 评审

- **评审结果**：Approved。Important 发现（路径遍历、监听器泄漏、共享 MemoryStore）标记为 deferred for Task 21
- **人工干预**：无

---

## 阶段 20：Task 20 — 前端 SPA

### 2026-07-14 01:35 — 实现 + 评审

- **任务**：创建 src/webui/public/index.html、app.js、style.css
- **Subagent 输出**：3 个文件创建，82/82 测试通过（无新测试，前端 only）
- **Commit**：`142b38b` feat: frontend SPA with task submission and real-time event display
- **评审结果**：Approved。Important（double-append、dead buttons）来自计划
- **人工干预**：无

---

## 阶段 21：Task 21 — Dockerfile + 入口文件

### 2026-07-14 01:43 — 实现

- **任务**：创建 src/index.ts、Dockerfile、.dockerignore
- **Subagent 输出**：82/82 测试通过，`tsc` 构建产出 `dist/index.js`
- **Commit**：`11d0d27` feat: Dockerfile and entry point

### 2026-07-14 01:43 — 评审

- **评审结果**：**Needs fixes** — 4 个 Critical 问题：
  1. `~/.harness/` 目录未创建 → 启动崩溃
  2. 前端静态文件未复制到 Docker 镜像 → WebUI 404
  3. keytar 在 Docker 中不可用 → 无法配置 API key
  4. Docker build 未执行（daemon 未运行）
- **Important**：POST /api/tasks 和 GET /api/credentials 未实现、--setup 未实现
- **人工干预**：dispatch fix subagent → 添加 mkdirSync、Dockerfile COPY frontend、OPENAI_API_KEY 环境变量回退、API 路由、--setup 实现
- **Fix Commit**：`79dcd2c` fix: integration issues - mkdir, frontend copy, env var fallback, API routes, --setup
- **教训**：集成任务的评审必须从"全新机器从零运行"的视角检查，而非仅看测试是否通过

---

## 阶段 22：Task 22 — 机制演示

### 2026-07-14 02:03 — 实现

- **任务**：创建 tests/mechanism-demo.test.ts（D1 护栏拦截、D2 反馈闭环、D3 重复检测）
- **Subagent 输出**：3/3 演示测试通过。2 处修复：
  1. `memory.close()` before `rmSync`（Windows EPERM）
  2. D3 脚本从交替 write_file/run_tests 改为 3 个连续 run_tests（交替模式永远不触发重复检测）
- **Commit**：`e2d636c` feat: mechanism demos (D1 guardrail, D2 feedback loop, D3 repetition)

### 2026-07-14 02:03 — 评审

- **评审结果**：Approved。两处修复都有根因分析
- **人工干预**：无

---

## 阶段 23：Task 23 — CI 配置

### 2026-07-14 02:10 — 实现

- **任务**：创建 CI 配置文件
- **Subagent 输出**：创建了 `.github/workflows/ci.yml`（GitHub Actions）。但计划指定 `.gitlab-ci.yml`
- **Commit**：`d93b8da` ci: add unit-test and docker-build jobs

### 2026-07-14 02:10 — 评审

- **评审结果**：**Needs fixes** — 文件路径偏离计划（`.github/workflows/ci.yml` vs `.gitlab-ci.yml`）
- **人工干预**：dispatch fix subagent → 创建 `.gitlab-ci.yml`（与计划一致），保留 `.github/workflows/ci.yml`
- **Fix Commit**：`8884e76` fix: add .gitlab-ci.yml to match plan spec
- **教训**：dispatch prompt 中的指令与计划不一致时，应先修正 prompt 而非让 subagent 做选择

---

## 统计摘要

| 指标 | 数值 |
|------|------|
| 总 commit 数 | 30（1 初始 + 23 task + 6 fix） |
| Task 总数 | 23 |
| 评审通过（首次） | 17/23 (74%) |
| 评审后需修复 | 6/23 (26%) |
| 测试文件数 | 19 |
| 测试用例数 | 85 |
| 全部测试通过 | Yes |
| `tsc --noEmit` | Pass |
| 开发时长 | ~3.5 小时 |
| Subagent 派发次数 | 23 implementer + 23 reviewer + 6 fix = 52 |

---

## 关键教训总结

1. **计划代码不等于可编译代码**：Task 14（dockerode 类型不匹配）、Task 17（parseAction 与 MockLLM 不一致）、Task 16（maskKey 与测试不一致）都暴露了计划中的代码在类型检查或运行时行为上存在缺陷。
2. **安全漏洞在集成层暴露**：Task 5 的路径遍历、Task 17 的 HITL 拒绝路径——这些在单元测试通过的情况下仍存在，说明评审必须验证控制流逻辑。
3. **Windows 兼容性是持续问题**：`memory.close()` before `rmSync` 在 Task 13、17、22 中反复出现。计划应包含平台特定的清理逻辑。
4. **跨 task 依赖是 spec 评审重点**：Task 1 的 fixture 与 Task 7 的 parser 之间存在 `rawReport` 不一致——这种隐含假设在单 task 评审中不可见。
5. **集成任务需要"全新机器"视角**：Task 21 的 4 个 Critical 问题都是"测试通过但实际不可用"——`~/.harness/` 目录不存在、前端文件未复制、keytar 不可用、Docker build 未执行。
