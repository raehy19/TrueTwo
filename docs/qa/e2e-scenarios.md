# E2E Scenario Checklist

<!-- markdownlint-disable MD060 -->

This document defines the real user journeys to audit after implementation starts.
The product is now drafted as **진진거**, but no application code exists yet.

## Current status

- Product direction: drafted in [`../project/product-brief.md`](../project/product-brief.md), [`../project/PRD.md`](../project/PRD.md), and [`../project/brand-positioning.md`](../project/brand-positioning.md).
- Implementation status: no application code yet.
- Approval status: product problem, MVP scope, and platform are still open in [`../operations/approval-queue.md`](../operations/approval-queue.md) until the team explicitly resolves them.
- QA status: scenarios below are planning baselines, not executed tests.

## Critical journeys

### 1. First Entry And Family Setup

Goal: a family member reaches the first value path from a chat link without getting stuck in account setup.

Entry conditions:

- User opens a 진진거 link from a family chat.
- User has no active session.
- User may either create a family or join with a 6-character code.

Success path:

1. User lands on the login screen and sees the service value quickly.
2. User signs in with Google.
3. If the link has a family code, the join tab is preselected.
4. If there is no code, the user creates a family and receives a code.
5. Another family member joins with that code.
6. Both users can see the same family home.

Failure and recovery:

| Failure | Expected recovery |
|---------|-------------------|
| Google consent canceled | Return to login with a retry CTA. |
| Invalid family code | Show "이 코드의 가족을 찾을 수 없어요" and keep the code input editable. |
| Family is full | Block join and show "이 가족은 정원(8명)이 가득 찼어요". |
| User already belongs to a family | Route to current family home or explain the one-family MVP limit. |

Related specs:

- [`../specs/2026-05-10-auth-google-login.md`](../specs/2026-05-10-auth-google-login.md)
- [`../specs/2026-05-10-family-workspace.md`](../specs/2026-05-10-family-workspace.md)

### 2. Daily 진진거 Creation

Goal: a user creates the daily game in under 5 minutes.

Entry conditions:

- User is logged in.
- User belongs to a family.
- User has not already registered today's 진진거.

Success path:

1. User opens "오늘의 진진거 만들기".
2. User enters two true events from today.
3. AI generates three plausible false candidates.
4. User selects one candidate, edits it, and sets difficulty.
5. User publishes the 진진거.
6. Family home shows the new game as playable for other members.

Failure and recovery:

| Failure | Expected recovery |
|---------|-------------------|
| True event is too short or too long | Disable next step and show character count feedback. |
| AI generation fails | Offer retry and direct manual false-option input. |
| AI call limit reached | Disable reroll and keep manual input available. |
| User closes the wizard | Preserve draft locally without exposing it to family. |
| Daily limit already reached | Show the existing entry and explain backlog rules. |

Related specs:

- [`../specs/2026-05-10-daily-quiz-registration.md`](../specs/2026-05-10-daily-quiz-registration.md)
- [`../specs/2026-05-10-ai-lie-generation.md`](../specs/2026-05-10-ai-lie-generation.md)

### 3. Family Solves And Finds The Real Day

Goal: family members enter to find the fake option, then leave with the real two events and a reason to talk.

Entry conditions:

- A 진진거 exists with status `open`.
- At least one family member other than the author can solve it.

Success path:

1. Solver opens the play screen.
2. Solver sees three shuffled option cards without answer labels.
3. Solver chooses the fake option and optionally writes a reason.
4. When all eligible solvers answer, or the author reveals, the result page opens.
5. Result page shows true/false labels, solver choices, accuracy, and fool rate.
6. AI comment explains the result without mocking anyone.
7. "진짜 하루 질문" chips prompt a comment or follow-up question.

Failure and recovery:

| Failure | Expected recovery |
|---------|-------------------|
| Author tries to solve own game | Show author-only waiting/reveal state. |
| Solver submits twice | Reject duplicate answer and show existing status. |
| Result opens before reveal | Mask answer content and offer "풀이하러 가기". |
| AI comment fails | Use safe fallback text and keep the result visible. |
| Harmful AI comment is generated | Discard, retry once, then use fallback text. |

Related specs:

- [`../specs/2026-05-10-quiz-answer-results.md`](../specs/2026-05-10-quiz-answer-results.md)
- [`../specs/2026-05-10-family-ranking.md`](../specs/2026-05-10-family-ranking.md)

### 4. Family Retention Dashboard

Goal: the family sees progress, ranking, and chemistry without turning the service into harsh competition.

Entry conditions:

- Family has at least one revealed 진진거.
- Some ranking categories may still have low sample size.

Success path:

1. User opens `/family`.
2. Dashboard shows today's participation state.
3. Ranking carousel shows available categories.
4. Low-sample categories show a warm empty state instead of fake precision.
5. Chemistry map appears only when enough data exists.
6. Family character comments stay safe and non-insulting.

Failure and recovery:

| Failure | Expected recovery |
|---------|-------------------|
| No 진진거 exists yet | Show one clear CTA to create the first 진진거. |
| Ranking sample is too small | Show "이번 주는 아직 활동이 적어요". |
| Character comment AI fails | Use a static fallback sentence. |
| Another family tries to access dashboard data | Return 403 and hide all private data. |

Related specs:

- [`../specs/2026-05-10-family-ranking.md`](../specs/2026-05-10-family-ranking.md)
- [`../specs/2026-05-10-dashboard.md`](../specs/2026-05-10-dashboard.md)

### 5. Public Board Sharing

Goal: a family can share a funny or warm 진진거 publicly without exposing private details.

Entry conditions:

- A 진진거 is revealed.
- Current user is the author.
- The source content is safe enough for public sharing.

Success path:

1. Author clicks "남의 집 진진거에 공유하기" from the result page.
2. AI anonymizes names, workplaces, schools, exact locations, and other identifiers.
3. Author reviews and edits the anonymized text.
4. Author chooses a category and confirms public consent.
5. Public post appears in `/board`.
6. Another user guesses the fake option and can upvote.

Failure and recovery:

| Failure | Expected recovery |
|---------|-------------------|
| Non-author tries to share | Hide or disable share action. |
| AI anonymization fails | Offer manual anonymized input. |
| Sensitive content is detected | Block public posting and keep content private to family. |
| Consent checkbox is not checked | Keep the publish button disabled. |
| Same quiz was already shared | Route to the existing public post. |

Related specs:

- [`../specs/2026-05-10-public-board.md`](../specs/2026-05-10-public-board.md)

## Cross-cutting checks

Use these checks across every scenario once implementation exists.

| Axis | Check |
|------|-------|
| Brand promise | Does the flow reveal the real day, not just the fake answer? |
| Simplicity | Can the core loop be completed without reading instructions? |
| Privacy | Is family-only content inaccessible to outsiders? |
| AI failure | Can users continue when LLM calls fail? |
| Tone safety | Do AI comments and rankings avoid ridicule? |
| Mobile context | Does the flow work from a family chat link on a phone? |
| Observability | Are LLM usage, reveal events, answers, and public shares measurable? |

## Actions before implementation

- Resolve or explicitly defer approval items 1–3 in [`../operations/approval-queue.md`](../operations/approval-queue.md).
- Convert these scenarios into manual QA scripts once screens exist.
- Add automated E2E tests only after the app stack is bootstrapped.
