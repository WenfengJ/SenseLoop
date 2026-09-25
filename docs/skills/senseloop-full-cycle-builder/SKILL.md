---
name: senseloop-full-cycle-builder
description: Use for SenseLoop-style requirement-document-driven product work, including implementation, review, testing, validation, and updating demo or architecture docs. Do not use for unrelated generic coding tasks.
---

# SenseLoop Full Cycle Builder

Use this skill when the user asks to turn a SenseLoop product requirement, task document, review note, or architecture plan into working product changes.

The goal is not just to write code. The goal is to make the feature usable, profile-scoped, AI-honest, privacy-aware, tested, and demo-ready.

## Mandatory Intake

Before editing, identify the concrete contract for this turn:

- Requirement source: task doc, design doc, user message, screenshot, or code review.
- User-facing goal.
- Affected pages.
- Affected APIs.
- Affected tables or persisted data.
- AI/Agent/RAG behavior.
- Privacy or medical safety boundary.
- Validation path.
- Docs that need updates.

If one item is unknown, make a conservative assumption and continue unless it risks data loss, privacy leakage, medical overclaiming, or irreversible external changes.

## Product Context

SenseLoop is an AI health app organized around the TCM-inspired input model “望闻问切” and a central assistant named “岐黄问诊助手”.

Core product story:

```text
四诊输入层
  望：舌图、饮食图、体检报告
  闻：soundcore Work 夜间声音、鼾声、咳嗽、起夜、口气反馈
  问：聊天问诊、症状描述、生活习惯
  切：心率、步数、运动、未来穿戴体征

-> 四诊特征抽取层
-> 近 7 天用户记忆层
-> 知识库/RAG 引用层
-> 岐黄问诊助手
-> 今日建议 / 报告 / 趋势 / 追问
```

The main navigation is:

```text
今日 / 检测 / 问诊 / 报告 / 我的
```

## Development Rules

Implement the smallest coherent change that makes the requested user flow real.

Frontend requirements:

- Every new button must have a visible click effect.
- Every upload must have loading, success, and failure states.
- Every save action must call a real API or be clearly marked as local-only by design.
- User-facing text should be product language, not implementation language.
- Keep mobile app ergonomics in mind.
- Organize inputs through the four-diagnosis model instead of scattered feature cards.

Backend requirements:

- Add or update schemas, routes, repository logic, and persistence together.
- Bind health data to `profileId`.
- Do not let Agent tools read cross-user data.
- Prefer PostgreSQL as the primary product database.
- Use `pgvector` for embeddings/RAG when semantic retrieval matters.
- Use object storage for large raw files in production; keep only metadata and summaries in relational tables unless explicitly prototyping locally.

AI requirements:

- Do not fake AI analysis.
- If the model succeeds, return useful analysis grounded in provided data.
- If the model fails or cannot read an image/PDF, say it could not reliably identify the content.
- Do not infer report indicators, tongue features, or food details from filenames.
- Keep AI output medical-boundary safe.

## Review Checklist

Before the final response, review the diff and check:

- No fake functionality or dead UI was introduced.
- Frontend and backend contracts match.
- Changed data is persisted where the UI claims it is saved.
- Health/user data is profile-scoped.
- AI calls are honest and have bounded fallbacks.
- End-user UI does not expose internal words such as `mock`, `MVP`, `backend`, `RAG`, `model failed`, `first version`, or unfinished implementation notes.
- Medical wording avoids diagnosis, treatment promises, and “AI doctor” framing.
- Sensitive data handling is explicit enough for the feature.

## Validation Checklist

Unless the user explicitly asks for design only, run the relevant checks before final response:

- Frontend changed: run the TypeScript/frontend build.
- Backend changed: run Python compile checks for changed modules.
- API contract changed: run at least one API smoke test.
- Upload/AI changed: test success-shaped and failure-shaped behavior when feasible.
- Docs changed: confirm the updated doc matches the implemented behavior.

If a check cannot run, state the exact blocker and provide the strongest available fallback evidence.

## Documentation Rule

Update demo, API, task, or architecture documentation when behavior changes the product story, API contract, data model, AI capability, or known limitation.

For task docs:

- Mark outdated review findings as fixed instead of deleting useful history.
- Keep remaining gaps actionable.
- Separate implemented behavior from pending work.

For architecture docs:

- Keep the four-diagnosis Agent workflow current.
- Show where user identity, profile data, memory, knowledge cards, and document/image analysis fit.

## Done Definition

A turn is complete only when:

- The user flow works or the blocker is clearly stated.
- Backend contracts match frontend usage.
- Required persistence is real.
- AI behavior is honest and bounded.
- Relevant checks have run or blockers are reported.
- Relevant docs are updated.

Final response must briefly include:

- What changed.
- What was validated.
- What remains blocked or needs the user’s help.
