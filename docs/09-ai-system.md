# AI System Design

## AI’s role

AI reduces operator work and improves interpretation. It is not the source of truth for authorization, provider eligibility, consent, money, or irreversible assignment decisions.

## Central gateway

```ts
interface AIService {
  extractProjectAttributes(input: ExtractInput): Promise<ExtractResult>;
  summarizeLead(input: SummaryInput): Promise<SummaryResult>;
  detectSpam(input: SpamInput): Promise<SpamResult>;
  generateContentBrief(input: BriefInput): Promise<BriefResult>;
  draftContent(input: DraftInput): Promise<DraftResult>;
  reviewContent(input: ReviewInput): Promise<ReviewResult>;
  suggestProviderMatches(input: MatchInput): Promise<MatchSuggestionResult>;
}
```

## Every run must record

- task key and version;
- prompt version;
- model identifier;
- input hash and safe references;
- structured output schema version;
- confidence and validation result;
- token/cost estimate;
- latency;
- human override or correction;
- final status.

## Structured output example

```json
{
  "installationSetting": "outdoor",
  "capacityPeople": 6,
  "electricalReadiness": "unknown",
  "requiresSiteVisit": true,
  "confidence": 0.86,
  "needsHumanReview": false
}
```

Validate with Zod. Unknown values must map to an explicit `unknown` state, not an invented answer.

## Human review triggers

- low confidence;
- conflicting answers;
- safety or regulatory claim;
- price/value extraction that affects eligibility;
- suspected fraud/spam;
- high-value project;
- provider recommendation conflict;
- content without adequate sources.

## Evaluation set

Create fixtures covering:

- clear structured projects;
- ambiguous natural language;
- missing location/budget;
- mixed indoor/outdoor intent;
- Spanish/English or Spanglish responses;
- prompt injection in free text;
- spam and duplicate submissions.

The gateway must fail safely when the model is unavailable or returns invalid output.
