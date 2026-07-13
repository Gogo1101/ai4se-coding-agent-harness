# Task 18: OpenAI Adapter — Report

## Status: DONE

## What Was Implemented

The `OpenAIAdapter` class in `src/llm/openai-adapter.ts` — a real OpenAI-compatible LLM adapter implementing the `LLMAdapter` interface from Task 4. It bridges the agent harness to any OpenAI-compatible chat completions API endpoint (e.g., OpenAI, DeepSeek, local LLM servers).

### Components

1. **`OpenAIAdapterConfig` interface** — constructor config with `apiKey`, `apiBase`, `model`, `temperature`, `maxTokens`.
2. **`OpenAIAdapter` class** (implements `LLMAdapter`):
   - **Constructor**: Instantiates the `openai` SDK client with `apiKey` and `baseURL` (configurable endpoint), storing model/temperature/maxTokens for reuse.
   - **`generate(context: LLMContext): Promise<LLMResponse>`**: 
     - Builds a structured user prompt via `buildPrompt()` from the `LLMContext` (task, test files, history summary, current failure, round info).
     - Calls `client.chat.completions.create()` with system + user messages, model, temperature, and max_tokens.
     - Extracts the assistant message content from `choices[0].message.content`.
     - Parses the content into an `Action` via `parseAction` (Task 12).
     - Maps the OpenAI `usage` object (`prompt_tokens`/`completion_tokens`) to the `LLMResponse.usage` shape (`promptTokens`/`completionTokens`).
     - Returns `{ content, action, usage }`.
   - **`buildPrompt(ctx)` (private)**: Assembles a Markdown-structured prompt with sections for Task, Test Files (in python code blocks), Previous Attempts (history), Current Failure (type, pass/total counts, per-failure details with traceback), and Round N of M with a JSON action instruction.

### Files Changed

| File | Action | Description |
|------|--------|-------------|
| `src/llm/openai-adapter.ts` | Created | OpenAIAdapter class implementing LLMAdapter, OpenAIAdapterConfig interface |
| `tests/openai-adapter.test.ts` | Created | 1 test case with mocked openai SDK |

## TDD Evidence

### RED Phase (Step 2)
```
Error: Failed to load url ../src/llm/openai-adapter.js (resolved id: ../src/llm/openai-adapter.js)
in tests/openai-adapter.test.ts. Does the file exist?
Test Files: 1 failed (1)
Tests: no tests
```
Test failed because `src/llm/openai-adapter.ts` did not exist — confirmed RED.

### GREEN Phase (Step 4)
```
✓ tests/openai-adapter.test.ts (1 test) 2ms
Test Files: 1 passed (1)
Tests: 1 passed (1)
```

### Full Suite Verification
```
Test Files: 17 passed (17)
Tests: 78 passed (78)
Duration: 2.37s
```

### TypeScript Typecheck
```
npx tsc --noEmit  →  (no errors)
```

## Self-Review Findings

### Correctness
- **Test 1 (calls API and returns LLMResponse):** The mocked `openai` default export returns a client whose `chat.completions.create` resolves to `{ choices: [{ message: { content: '{"action": "run_tests"}' } }], usage: { prompt_tokens: 100, completion_tokens: 10 } }`. The adapter constructs the client, builds the prompt, calls `create`, extracts content `'{"action": "run_tests"}'`, parses it via `parseAction` into `{ type: 'run_tests' }`, and maps usage to `{ promptTokens: 100, completionTokens: 10 }`. All three assertions pass: content matches, `action.type === 'run_tests'`, `usage.promptTokens === 100`. ✓

### API Surface Verification
- The `openai` SDK (v4.104.0) `ClientOptions` accepts `apiKey` and `baseURL` — matching the constructor call. ✓
- `ChatCompletionCreateParams` accepts `model`, `temperature`, `max_tokens` (deprecated but still supported), and `messages` with `role`/`content`. ✓
- `ChatCompletion` response has `choices[0].message.content` (string | null) and `usage?: CompletionUsage` with `prompt_tokens`/`completion_tokens`/`total_tokens`. ✓
- The `|| ''` fallback on `completion.choices[0]?.message?.content` correctly handles null/undefined content. ✓

### Prompt Construction
- `buildPrompt` covers all `LLMContext` fields: task, testFiles (with python code fences), historySummary (conditional), currentFailure (conditional, with per-failure details), roundNum/maxRetries. ✓
- Empty `testFiles` produces a "## Test Files" header with no file entries (valid). ✓
- The prompt instructs the model to "Respond with a JSON action" matching the format `parseAction` expects (`{"action": "..."}`). ✓

### Integration with Agent Loop (Task 17)
- `OpenAIAdapter` returns `LLMResponse` with a pre-parsed `action` field. In `AgentLoop`, `parseAction(response.content)` is attempted first; for real LLM output using the `{"action": "..."}` format, it will succeed. The fallback to `response.action` (added in Task 17) handles any edge case where the model output isn't perfectly parseable. ✓
- Unlike `MockLLM` (which serializes with `type` field), `OpenAIAdapter` relies on the model producing `{"action": "..."}` JSON, which `parseAction` handles natively. ✓

### Security
- `apiKey` is passed only to the `openai` SDK constructor; never logged, never returned in responses, never serialized. ✓
- `apiBase` is configurable, enabling self-hosted/local endpoints without code changes. ✓

## Deviations from Plan

None. The implementation and test match the plan exactly. The `max_tokens` parameter is deprecated in the openai SDK v4.104.0 (in favor of `max_completion_tokens`) but remains supported and is what the plan specifies, so it was used as-is.

## Issues and Concerns

1. **Single test case:** The plan specifies only one test (happy path: API call returns valid JSON action). Edge cases are not covered by tests: empty/null content from the API, missing `usage` field, API errors (network/4xx/5xx), malformed JSON content (parseAction throwing), and prompt construction with populated testFiles/history/failure. These would be valuable for a production adapter but were not part of the plan's TDD steps.

2. **No error handling:** `generate()` does not wrap the `client.chat.completions.create()` call in try/catch. API errors (rate limits, auth failures, network issues) will propagate as unhandled rejections to the caller (`AgentLoop`). The Task 17 agent loop does have a round-body try/catch that emits an `error` event and continues, so this is mitigated at the loop level, but the adapter itself provides no retry or specific error messaging.

3. **`max_tokens` deprecation:** The openai SDK marks `max_tokens` as deprecated in favor of `max_completion_tokens` (incompatible with o-series reasoning models). For non-reasoning models this works fine. A future enhancement could switch to `max_completion_tokens` or make it configurable, but this matches the plan exactly.

4. **Mock fidelity:** The test mocks the entire `openai` module with a static resolved value, so it verifies the adapter's wiring (prompt building, content extraction, parseAction, usage mapping) but not real HTTP behavior. This is appropriate for unit testing (per the global constraint "All core mechanisms must be testable with Mock LLM (no network, no real LLM)").
