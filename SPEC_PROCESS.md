# SPEC_PROCESS.md — 规约与计划过程文档

> 记录与 Superpowers 协作生成 SPEC.md 与 PLAN.md 的全过程。
>
> 开发工具：OpenCode + GLM-5.2 模型 + Superpowers brainstorming/writing-plans 技能

---

## 1. Brainstorming 关键节点

### 1.1 过程概述

使用 Superpowers 的 `brainstorming` 技能启动规约生成。该技能主动追问"你究竟想做什么"，分块呈现设计供逐步签字确认。整个过程经历了 9 轮问答和 3 次架构方案选择，最终产出 SPEC.md（12 节，915 行）。

### 1.2 智能体追问的关键问题

以下 9 个问题是智能体在 brainstorming 阶段主动提出的，每个都迫使我澄清了原本模糊的设计：

**Q1: 你的 harness 面向什么编程语言？**
- 我的回答：Python + pytest。因为 pytest 有 `--json-report` 输出结构化 JSON，反馈解析可以做成确定性纯函数。
- 影响：这直接决定了 Feedback Parser 的设计——解析 pytest JSON report 而非 LLM 自我判断。

**Q2: 你用哪个 LLM 供应商？是否用 NJUSE Hub？**
- 我的回答：用个人 OpenAI 兼容 API（非 NJUSE Hub），默认模型 DeepSeek V4 Pro。
- 影响：LLM 适配器设计为 OpenAI 兼容接口，endpoint 可配置。

**Q3: 你选择哪个维度作为重点深入？**
- 我的回答：反馈闭环（Feedback Parser）。因为它是 coding 场景中最有工程深度的机制——解析测试结果、分类失败、压缩历史、检测重复、组装上下文，全部是确定性纯函数。
- 影响：SPEC 中反馈闭环被设计为 5 个子机制（parser → classifier → compressor → repetition detector → context assembler），是所有维度中拆分最细的。

**Q4: 你的 harness 是否需要 WebUI？还是纯 CLI？**
- 我的回答：需要 WebUI。实时观察 agent 的每一步动作对理解 agent 决策过程很重要。
- 影响：增加了 WebUI Server + 前端 SPA 两个模块，引入 WebSocket 实时推送。

**Q5: 凭据如何存储？**
- 我的回答：OS keychain（keytar）优先 + 环境变量回退。key 绝不硬编码、绝不提交、绝不写入日志。
- 影响：CredentialManager 模块设计，SPEC 安全一节明确了威胁模型。

**Q6: 分发形态选什么？**
- 我的回答：Docker 镜像。单条 `docker build` + `docker run` 可启动。
- 影响：Dockerfile 设计为多阶段构建，内含 Node.js + Python + pytest。

**Q7: 你是否需要 HITL（Human-In-The-Loop）？**
- 我的回答：需要。危险命令（rm -rf /、git push --force）必须拦截，sudo 等命令需审批。
- 影响：Guardrail 设计为三级决策（ALLOW/BLOCK/REQUIRE_APPROVAL），HitlStateMachine 设计为 IDLE→WAITING→APPROVED/REJECTED 状态机。

**Q8: 如何防止 agent 无限循环？**
- 我的回答：两个机制——max_retries 上限 + detectRepetition 检测连续 N 轮相同失败模式。
- 影响：RepetitionDetector 设计为纯函数，检测连续 N 轮的 failureKey（failureType + sorted testNames）是否相同。

**Q9: 你的 harness 内核是否自己实现？还是基于现成框架？**
- 我的回答：完全自己实现 agent 主循环。不用 LangChain AgentExecutor、AutoGen 等。LLM 适配器是可注入的抽象层，Mock LLM 可替换真实 LLM 做离线测试。
- 影响：SPEC 明确标注了实现边界——agent loop、工具分发、治理、反馈全部是自己的代码。

### 1.3 三次关键迭代

#### 迭代 1：架构方案选择

智能体提出了 3 种架构方案：

- **方案 A**：模块化单体 + 内部事件总线（EventEmitter）+ WebSocket 推送
- **方案 B**：微服务 + 消息队列（Redis Pub/Sub）
- **方案 C**：单体 + 直接函数调用（无事件总线）

**我的决策**：选择方案 A。

**理由**：
- 方案 B 过度工程化——本项目是单进程、单任务串行，不需要分布式消息队列
- 方案 C 缺乏可观测性——没有事件总线，WebUI 无法实时获取 agent 状态
- 方案 A 平衡了简洁性和可扩展性——EventEmitter 足够轻量，WebSocket 推送让用户实时看到 agent 决策过程

**AI 提出而我采纳的建议**：事件总线用 TypeScript 泛型约束（`EventTypes` 映射接口），确保 emit/on 类型安全。

#### 迭代 2：反馈闭环的拆分粒度

初始设计中，反馈闭环是一个大函数 `processFeedback(testResult)`。

**智能体的追问**：你的反馈闭环是否需要拆分为多个子机制？如果是一个大函数，如何单独测试每个环节？

**我的决策**：拆分为 5 个纯函数：
1. `parseTestResult()` — 解析 pytest JSON
2. `classifyFailure()` — 分类失败类型
3. `compressHistory()` — 压缩多轮历史
4. `detectRepetition()` — 检测重复模式
5. `assembleContext()` — 组装 LLM 上下文

**理由**：每个函数可独立单测，且组合关系清晰。这直接影响了 PLAN.md 中 Task 7-11 的拆分。

**AI 提出而我修正的建议**：AI 建议将 `classifyFailure` 合并到 `parseTestResult` 中（因为分类信息来自解析结果）。我推翻了这个建议——分离关注点更重要，`parseTestResult` 只负责解析，`classifyFailure` 只负责分类，未来分类规则变化时不需要修改解析器。

#### 迭代 3：MockLLM 的设计

**智能体的追问**：你的 Mock LLM 如何确保确定性？如果用随机生成，测试将不可重复。

**我的决策**：MockLLM 采用脚本化设计——构造时传入一个 Action 数组（"脚本"），每次 `generate()` 调用按顺序返回下一个 Action。脚本耗尽时抛异常。

**AI 提出而我采纳的建议**：添加 `callCount` 和 `lastContext` 内省属性，让下游测试（如 Agent Loop）可以断言 LLM 被调用了几次、收到了什么上下文。

### 1.4 AI 建议采纳/推翻汇总

| 建议 | 来源 | 决策 | 理由 |
|------|------|------|------|
| 事件总线用泛型约束 | AI 提出 | 采纳 | 类型安全，编译时捕获事件名/载荷不匹配 |
| 反馈闭环拆分为 5 个纯函数 | AI 提出 | 采纳 | 可独立测试，分离关注点 |
| classifyFailure 合并到 parseTestResult | AI 提出 | 推翻 | 分类规则可能独立变化，不应耦合到解析器 |
| MockLLM 添加 callCount/lastContext | AI 提出 | 采纳 | 下游测试需要断言调用行为 |
| 用微服务 + Redis | AI 提出 | 推翻 | 过度工程化，单进程不需要 |
| 用 keytar 存储 API key | AI 提出 | 采纳 | OS keychain 是最安全的本地存储方式 |
| Docker 镜像分发 | AI 提出 | 采纳 | 单条命令可启动，包含完整运行环境 |

---

## 2. 冷启动验证

### 2.1 诚实声明

**本项目未按照要求 §4.5 进行正式的"陌生智能体冷启动试运行"。**

要求规定：用一个与主开发智能体**不同类型**的 agent，在**不提供对话历史**的前提下，仅凭 SPEC.md + PLAN.md 尝试实现 1-2 个 task。

实际情况：本项目使用 OpenCode + GLM-5.2 作为主开发智能体。SDD 过程中派发的 52 个 subagent 虽然每个都是**全新 session、无对话历史**，但它们使用的是**同一模型（GLM-5.2）和同一 agent 类型（general）**，不满足"不同类型"的要求。

### 2.2 SDD 过程中的间接验证

虽然没有正式的冷启动验证，但 SDD 过程本身提供了一定程度的类似验证：

每个 implementer subagent 启动时仅获得：
1. PLAN.md 中对应 task 的文本（task brief）
2. 项目工作目录路径
3. git 路径设置说明

subagent **没有**获得：
- brainstorming 对话历史
- SPEC.md 的设计理由
- 之前 task 的实现细节（除非它主动读取已有文件）

因此，subagent 在实现过程中遇到的困难，部分反映了 spec/plan 的不清晰之处：

| Task | subagent 遇到的困难 | 暴露的 spec/plan 缺陷 |
|------|---------------------|----------------------|
| Task 3 | EventEmitter `'error'` 事件无监听器时抛异常 | plan 未考虑 Node.js EventEmitter 的特殊 error 语义 |
| Task 14 | dockerode 类型不匹配（3 处编译错误） | plan 代码未通过 `@types/dockerode` 类型检查 |
| Task 16 | maskKey 实现与测试期望不一致 | plan 内部矛盾——实现代码和测试代码对同一行为有不同定义 |
| Task 17 | parseAction 对 MockLLM 输出总是抛异常 | plan 中 MockLLM 和 parseAction 的接口设计不一致——MockLLM 用 `type` 字段，parseAction 期望 `action` 字段 |
| Task 21 | `~/.harness/` 目录不存在导致启动崩溃 | plan 未考虑 better-sqlite3 不创建父目录的行为 |
| Task 22 | D3 脚本的交替模式永远不触发重复检测 | plan 的测试脚本与 detectRepetition 的检测逻辑不一致 |

### 2.3 如果做了正式冷启动验证，预期会发现什么

基于上述间接验证的结果，如果用一个不同类型的智能体（如 Claude Code 或 Codex CLI）进行正式冷启动，预期会在以下方面暴露更多 spec 缺陷：

1. **文件路径不一致**：plan 中部分地方写 `src/webui/public/`，部分写 `src/server/frontend/`——不同 agent 可能做出不同解读
2. **ESM 导入路径**：plan 中使用 `.js` 扩展名导入 TypeScript 文件——不同 agent 可能不理解这是 ESM 约定
3. **Windows 兼容性**：plan 中多处 `rmSync` 在 Windows 上会失败——一个在 Linux 上运行的 agent 不会发现这个问题
4. **keytar 在 Docker 中的可用性**：plan 未说明 keytar 在 alpine 容器中需要额外依赖——一个不熟悉 keytar 的 agent 可能不会发现这个问题

### 2.4 对 SPEC/PLAN 的修订

基于 SDD 过程中发现的问题，以下修订已在实现阶段完成（而非正式的冷启动后修订）：

| 发现的问题 | 修订方式 | 修订时机 |
|------------|----------|----------|
| MockLLM/parseAction 接口不一致 | 添加 `response.action` 回退 | Task 17 实现阶段 |
| maskKey 与测试不一致 | 对齐测试（测试是 spec） | Task 16 实现阶段 |
| `~/.harness/` 目录不存在 | 添加 `mkdirSync` | Task 21 评审后 |
| 前端文件未复制到 Docker 镜像 | Dockerfile 添加 COPY | Task 21 评审后 |
| keytar 在 Docker 中不可用 | 添加 `OPENAI_API_KEY` 环境变量回退 | Task 21 评审后 |
| D3 脚本不触发重复检测 | 改为 3 个连续 run_tests | Task 22 实现阶段 |

---

## 3. 对 Brainstorming 技能的反思

### 做得好的地方

1. **主动追问**：brainstorming 技能不是被动等待指令，而是主动提出 9 个关键问题，每个都迫使我澄清模糊的设计决策。特别是 Q3（重点维度选择）和 Q9（实现边界），直接影响了项目的核心架构。

2. **分块呈现**：设计不是一次性输出，而是分 9 个设计节逐步呈现，每节确认后才进入下一节。这避免了"一次性大文档"中隐藏的不一致。

3. **方案对比**：在架构选择时提供了 3 种方案对比，而非只给一个方案。这让我能做出有信息量的选择。

### 让我不满的地方

1. **未验证代码可编译性**：brainstorming 产出的 SPEC.md 中包含 TypeScript 代码片段，但这些代码从未通过 `tsc --noEmit` 验证。结果在实现阶段发现了多处类型不匹配（dockerode、FailureType 等）。

2. **未考虑平台差异**：SPEC.md 中的代码在 Linux 上可能工作，但在 Windows 上有多处问题（rmSync + SQLite 句柄、keytar 依赖）。brainstorming 技能没有追问目标平台。

3. **内部矛盾未检测**：SPEC.md 中 maskKey 的实现代码与测试期望不一致，MockLLM 的输出格式与 parseAction 的输入格式不一致——这些内部矛盾在 brainstorming 阶段未被发现。

4. **冷启动验证未强制执行**：brainstorming 技能流程中没有强制触发冷启动验证的步骤。虽然要求文档中明确规定了这一步，但技能本身没有提醒或引导执行。
