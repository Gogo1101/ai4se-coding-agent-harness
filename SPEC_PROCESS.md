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

### 2.1 验证方案

按照要求 §4.5，在 SPEC.md 与 PLAN.md 完成后、正式实现前，使用**与主开发智能体不同类型**的 agent 进行冷启动试运行。

- **主开发智能体**：OpenCode + GLM-5.2
- **冷启动智能体**：Claude Code (Anthropic Claude Sonnet 4)
- **启动方式**：全新 session，不导入任何先前会话或 memory
- **输入**：仅提供 SPEC.md + PLAN.md，不补充口头解释
- **指定任务**：从 PLAN.md 中选择 Task 5（Guardrail）和 Task 17（Agent Loop）自主推进
- **指令**：遇到不确定之处即暂停询问，而非凭猜测继续

### 2.2 冷启动过程

#### Task 5: Guardrail — Claude Code 的实现尝试

Claude Code 在阅读 SPEC.md §3.4（Guardrail）和 PLAN.md Task 5 后，提出了以下问题：

**问题 1**："SPEC 中说 guardrail 要检查路径，但 `checkPath` 的输入是 action 中的 path 字段还是完整命令字符串？"
- **暴露的 spec 缺陷**：SPEC 未明确 `checkPath` 的输入契约——是 `Action.path` 字段还是整个 action 对象。
- **我的修订**：在 SPEC §3.4 补充 `checkPath(action: Action): { decision, reason }` 的函数签名，明确输入是 Action 对象。

**问题 2**："plan 中测试用例 `should block path traversal via ../` 期望返回 BLOCK，但 SPEC 中说 `..` 开头的路径被拦截——那 `foo/../bar` 这种中间包含 `..` 的路径呢？"
- **暴露的 spec 缺陷**：SPEC 只说了"以 `..` 开头"，没有覆盖路径中间包含 `..` 的情况。
- **我的修订**：将规则改为"路径中任何位置包含 `..` 均拦截"，而非仅检查前缀。

**问题 3**："guardrail 的 ALLOW/BLOCK/REQUIRE_APPROVAL 三级决策中，REQUIRE_APPROVAL 的超时行为是什么？自动批准还是自动拒绝？"
- **暴露的 spec 缺陷**：SPEC 未说明超时策略。
- **我的修订**：在 SPEC §3.5 明确"超时自动拒绝（安全优先原则）"。

Claude Code 最终完成了 Task 5 的实现，但产出了 2 处与原意不一致的解读：
1. 将 `checkPath` 设计为接收字符串而非 Action 对象——与我的设计意图不符
2. 未实现 `sudo` 命令的 REQUIRE_APPROVAL 逻辑——SPEC 中提到了但 plan 的验证步骤未覆盖

#### Task 17: Agent Loop — Claude Code 的实现尝试

Claude Code 在阅读 SPEC §3.9（Agent Loop）和 PLAN.md Task 17 后，提出了以下问题：

**问题 1**："agent loop 的停机条件是什么？是 `maxRetries` 次用完就停，还是检测到重复也停？两个条件的关系是 OR 还是 AND？"
- **暴露的 spec 缺陷**：SPEC 中两个停机条件分散在不同章节，未明确逻辑关系。
- **我的修订**：在 SPEC §3.9 补充"任一条件满足即停机（OR 关系）"。

**问题 2**："write_file 之后是否自动运行测试？还是等 LLM 下一轮主动选择 run_tests？"
- **暴露的 spec 缺陷**：SPEC 未说明 write_file 后的自动测试行为。
- **我的修订**：在 SPEC §3.9 补充"write_file 后自动触发 run_tests，减少不必要的 LLM 调用轮次"。

**问题 3**："MockLLM 的 `generate()` 返回什么格式？plan 中说是 `{ content: string, action: Action }`，但 SPEC 中只说了 `LLMResponse` 接口——action 字段是可选的吗？"
- **暴露的 spec 缺陷**：SPEC 的 `LLMResponse` 接口定义不够清晰，`action` 字段的可选性未说明。
- **我的修订**：在 SPEC §6 明确 `action?: Action`（可选，当 LLM 返回合法 JSON 时填充，否则通过 `parseAction` 解析 `content`）。

Claude Code 最终完成了 Task 17 的实现，但产出了 1 处与原意不一致的解读：
1. 将 write_file 后的行为设计为"不自动运行测试，等下一轮 LLM 决策"——与我的设计意图不符（我希望自动运行以节省轮次）

### 2.3 冷启动暴露的 spec 缺陷汇总

| # | 暴露的缺陷 | 来源 | 修订内容 | 修订位置 |
|---|-----------|------|---------|---------|
| 1 | `checkPath` 输入契约不明 | Task 5 Q1 | 补充函数签名，明确输入为 Action 对象 | SPEC §3.4 |
| 2 | `..` 路径检查规则不完整 | Task 5 Q2 | 改为路径中任何位置包含 `..` 均拦截 | SPEC §3.4 |
| 3 | REQUIRE_APPROVAL 超时策略未说明 | Task 5 Q3 | 明确超时自动拒绝 | SPEC §3.5 |
| 4 | 停机条件逻辑关系未明确 | Task 17 Q1 | 补充 OR 关系 | SPEC §3.9 |
| 5 | write_file 后自动测试行为未说明 | Task 17 Q2 | 补充自动触发 run_tests | SPEC §3.9 |
| 6 | LLMResponse.action 可选性未说明 | Task 17 Q3 | 明确 action 为可选字段 | SPEC §6 |

### 2.4 修订前后的关键 diff

**SPEC §3.4 checkPath 修订：**
```diff
- checkPath 检查路径安全性
+ checkPath(action: Action): { decision: Decision, reason: string }
+ 输入为 Action 对象，检查 action.path 字段
+ 路径中任何位置包含 ".." 均拦截（非仅前缀检查）
```

**SPEC §3.5 超时策略修订：**
```diff
- 超时后进入 REJECTED 状态
+ 超时自动拒绝（安全优先原则），默认超时 30 秒
```

**SPEC §3.9 停机条件修订：**
```diff
- max_retries 上限 + detectRepetition 检测
+ 任一条件满足即停机（OR 关系）：
+ 1. roundNum > maxRetries
+ 2. detectRepetition 返回 true
+ write_file 后自动触发 run_tests，减少 LLM 调用轮次
```

### 2.5 冷启动结论

冷启动验证暴露了 6 处 spec 缺陷，全部在正式实现前完成修订。这些缺陷集中在两类：
1. **接口契约不清晰**（3 处）：函数签名、输入类型、字段可选性
2. **行为语义不明确**（3 处）：超时策略、停机逻辑关系、自动测试行为

这验证了冷启动的核心价值：**与主 agent 共享的隐性上下文会严重高估 spec 的清晰度**。主 agent 在 brainstorming 阶段已经"知道"了这些设计意图，因此不会提问；而陌生 agent 在每个未明文写下的假设处都会受阻。

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

4. **冷启动验证的时机**：冷启动验证应在 SPEC 和 PLAN 完成后、正式实现前进行。但实际开发中，部分修订在实现阶段才完成，说明冷启动验证如果更早执行，能更有效地减少实现阶段的返工。
