# Portfolio Copilot Core Delivery

## Scope
- Deliver Portfolio Copilot across Dashboard, Portfolio, Stock, Thesis, and Community.
- Standardize AI outputs under an `AI Brief` section in each feature area.
- Enforce `Evidence Mode` by showing Evidence Chips under AI outputs.

## AI Stack Standard
- Model stack: Google Gemini API only.
- Retrieval stack: RAG from portfolio state + retrieved market/news context.
- Response contract:
  - Main answer
  - Evidence chips (`source`, `evidence`, `confidence`)
  - Confidence labels: `High`, `Medium`, `Low`

## Evidence Mode Requirements
- Evidence Chips must be rendered directly below each AI response.
- Every chip must include:
  - Source citation
  - Supporting evidence snippet
  - Confidence label

## Research Tracks

### 1) Security and Privacy (Data Privacy Plan)
- Data minimization: send only required portfolio fields for each query.
- Sensitive-data isolation: user holdings stay user-scoped in backend context build.
- Prompt safety: prohibit leaking unrelated user data and require least-privilege context.
- Output safety: avoid exposing raw private positions unless necessary to answer.

### 2) Mobile Feasibility and Performance
- Mobile response strategy: prioritize short AI brief + compact evidence chips.
- Rendering strategy: reduce initial payload and keep chat panel scroll lightweight.
- Latency target: optimize for first meaningful AI brief on mobile networks.

### 3) Multimodal Exploration
- Voice interaction path: keep microphone entry point for future STT pipeline.
- Image understanding path: keep report-screenshot upload entry for document/image parsing.
- Future integration: route multimodal inputs through Gemini multimodal endpoints with the same evidence contract.

## Acceptance Criteria
- AI Brief present in all feature sections.
- Evidence Chips shown under AI output everywhere AI content is displayed.
- Backend AI response includes RAG metadata and evidence chip payload.
- UI labels explicitly show `Gemini + RAG` and `Evidence Mode`.
