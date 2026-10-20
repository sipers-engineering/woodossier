# Rule specification — WooDossier escalation engine

Public contract for the planning model in `engine.ts`. Where this document
and the code disagree, the code is wrong — please open an issue.

> **Qualification contract:** the engine returns a `planning_model` — never
> a statutory deadline, debt or entitlement. Its own output states
> `statutoryDeadlineDetermined: false`, `legalEntitlementDetermined: false`
> and `receiptsVerified: false`. User-supplied dates are recorded facts,
> not verified evidence.

## 1. Inputs

`requestDate` (submission date, required), `receiptDate` (optional,
documented receipt by the authority), `regime` (`woo` or `awb`),
`extensionDays` / `suspensionDays` (documented delay the user records),
`ingebrekestellingDate` / `ingebrekestellingReceiptDate` (notice-of-default
sending and receipt), `decisionDate` (a decision already received),
`evaluationDate` (the model's "today").

## 2. Model arithmetic (UTC calendar days)

```
totalDays   = baseDays + extensionDays + suspensionDays
deadline    = modelReceiptDate + totalDays            // model date
gracePeriod = noticeReceiptDate + 14 calendar days    // when a notice exists
```

| Parameter | Value | Basis |
| --- | --- | --- |
| `wooBaseCalendarDays` | 28 | Woo decision scheme (4 weeks; the official instruction describes a possible 2-week extension as `extensionDays` input) |
| `awbFallbackCalendarDays` | 56 | Generic Awb preparation model — **not** a universal statutory term; the engine's own limitation text says so |
| `noticeGraceCalendarDays` | 14 | Model recovery term after notice receipt |

`receiptDate` absent → the model assumes receipt on the submission date
and says so (`receiptDateSource: assumed_same_as_submission`). Impossible
chronology (receipt before sending, notice after decision, Woo extensions
above 14 days) is rejected.

## 3. Escalation outputs and gating

- **Ingebrekestelling template** is only produced when the model deadline
  has passed, no decision is recorded, and no notice was already sent —
  `noticeStatus` states which gate applied.
- **Dwangsom (penalty)**: for `regime: woo` the engine reports zero with
  legal basis — art. 8.4 Woo excludes the Awb art. 4:17 administrative
  penalty. For `awb` it returns an *illustrative* tier scale (€23/day
  capped €322, €35/day capped €490, €45/day capped €630; max 42 days /
  €1.442) labelled `model`, never an assessed amount.
- **Calendar events + RFC 5545 export** label every computed entry as a
  `Modeldatum` with its assumptions; user-supplied events are labelled
  `Opgegeven` (unverified).

## 4. Documented limitations (from the engine's own output)

- No universal eight-week Awb term is asserted; the specific statutory
  term is never determined.
- **Weekends, public holidays, special statutes, objection periods and
  the validity of extensions/suspensions are explicitly not qualified** —
  Algemene termijnenwet end-of-term adjustment is future work, not a
  current feature.
- Model dates and the penalty scale do not establish default (verzuim),
  a penalty debt or appeal rights.

## 5. Sources consulted by the model output

Wet open overheid arts. 4.4 & 8.4, Awb art. 4:17, the official
Rijksoverheid Woo-instructie (2024) and related overheid.nl materials —
linked in every response's `sources` array.
