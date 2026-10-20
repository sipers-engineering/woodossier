# WooDossier

Local Dutch Woo request preparation by The Dark Store. WooDossier is independent of government. It drafts and exports a request for user review, with an optional browser-local case workspace. It never submits a request, authenticates a user, stores case input on the server or calculates a definitive statutory deadline.

Run with Node.js 22 or newer:

```powershell
npm ci
npm run typecheck
npm test
npm run build
npm start
```

Open `http://127.0.0.1:4320/`. The standalone page has an editable form, a print view, plain-text request export, portable JSON dossier export, a manual event timeline and planning controls. `WOODOSSIER_PORT` overrides port 4320. The service binds only to `127.0.0.1` and accepts only loopback hostnames. Server input is handled in memory for each request; there are no case logs, analytics, server persistence or external lookups during use. Saving a case is an explicit browser-local action.

## Complete local case flow, 19 October 2026

1. Enter your organisation, topic and optional request/contact fields, then select **Maak concept**. Review the letter and export its text or print it.
2. Give the dossier a name. Record the status, reference and optional next action/date yourself. These fields do not confirm government submission, receipt or a decision. An own action date is never presented as a statutory deadline.
3. Enter documented events, including the request's sending date and any known receipt/decision. **Neem verzoek en gebeurtenissen over** copies those facts and request contact details into the planning form. The optional model-contact fields can be reviewed and edited separately; imported model contact details are retained independently of request contact details. Review the other model values and make the model; its evaluation date and uncertain legal conclusions remain explicit. Uncheck **Neem de modelgegevens op in dit dossier** to omit that optional model.
4. Select **Bewaar dossier in deze browser**. Reopen it from the saved-case selector after closing/reloading the page. The request, contact fields, manual events, case tracking and optional planning inputs are retained together. Editing input clears stale output; saving regenerates the current letter, timeline and included model.
5. Use **Exporteer heropenbaar dossier (.json)** for a portable backup. The full-dossier button beside the standalone letter produces the same package. Import through **Heropen een dossierexport** to open a copy, then explicitly save it. Text-only request exports and old engine-only JSON results are not reopenable case packages. **Exporteer eigen actie (.ics)** exports the user's own next-action date separately from the model agenda.

The storage key is `woodossier.cases.v1` in the browser's local storage for the exact origin. Use the stable `http://127.0.0.1:4320/` address: `localhost`, another port, a different browser/profile or private browsing has separate storage. No server data directory is required. Browser-data removal can remove the local list; exported JSON is the backup. Stored/exported cases include supplied contact data, so use a personal device and protect backups. Cases are not encrypted by this app.

`POST /api/dossier` validates the version-1 `{product:"WooDossier", kind:"case", version:1, case:{...}}` package and returns regenerated `outputs` with the letter, timeline, optional model and optional own-action calendar. Imported outputs are discarded. Unknown versions/fields, invalid nested inputs and impossible supplied dates are rejected. It shares the 64 KiB body limit, same-origin checks and no-store responses of the other endpoints. It writes nothing to disk. Bad imports leave the open case intact; unreadable/quota-blocked storage is reported without replacing existing records, and a newer saved copy from another tab is not overwritten.

API: `POST /api/prepare` takes `intent` (`public_documents`, `personal_data`, `complaint`, `appeal`), plus `authority` and `topic` for a Woo draft. Optional `documentTypes` and `keywords` are arrays; `dateFrom` and `dateTo` are ISO dates; `contact` may include `name`, `email`, `postalAddress` and `phone`. Other fields and invalid or reversed dates are rejected. `POST /api/timeline` takes optional `authority` and up to 30 manually entered `{type,date,note}` events. Both endpoints accept JSON with a 64 KiB request limit.

MCP: connect a Streamable HTTP client to `http://127.0.0.1:4320/mcp`. Base tools are `prepare_woo_request` and `summarise_woo_dossier`; both share the HTTP engine. `ui://woodossier/review.html` is their embedded review resource. Embedded file export asks the host for `ui/download-file` if advertised; otherwise it exposes selectable copy text. Official links use `ui/open-link` when the host supports it.

## Retained planning expansion, 17 October 2026

The newer `POST /api/escalation`, `POST /api/calendar` and MCP `evaluate_statutory_escalation` remain local preparation tools. They return fixed calendar-day scenarios, an illustrative penalty scale, a review template when appropriate, and iCalendar export. They do not determine an actual statutory deadline, debt or right of appeal. The advanced MCP tool returns structured output and does not bind the base preparation widget.

The standalone page includes **Een vervolgstap voorbereiden**, backed by the same `/api/escalation` engine. Enter submission and optional receipt dates separately, choose the model and evaluation date, and record known notices or decisions. The result shows receipt provenance, calendar-day assumptions and model dates; actual legal conclusions remain undetermined. Export the returned planning dossier as JSON, its exact iCalendar content, or a review-only notice template when the engine supplies one. There is no notice export before the model date, after a reported decision or for an already reported notice. Editing any planning input removes the previous result and exports, including when a response is still pending. The explicit copy control connects request/timeline inputs to this form; review the model's own fields before including it in a saved case. The page sends nothing to government and saves no case data on the server.

`requestDate` is the submission date. Optional `receiptDate` and `ingebrekestellingReceiptDate` distinguish receipt from sending; absent receipts use explicit model assumptions, not verified facts. A notice receipt requires its submission date. Impossible chronology and Woo model extensions above 14 days are rejected. The generic Awb model's fixed 56 days are not a universal statutory deadline: see the [Rijksoverheid explanation](https://www.rijksoverheid.nl/themas/overheid-en-democratie/bezwaar-en-beroep/vraag-en-antwoord/bezwaar-en-beroep/beslissing-aanvraag-bezwaar-te-laat) and the [official Woo instruction](https://www.rijksoverheid.nl/site/binaries/site-content/collections/documents/2022/04/01/rijksbrede-instructie-voor-het-behandelen-van-woo-verzoeken/woo-instructie.pdf). Receipt evidence, valid extensions/suspensions, holidays and the specific law require case review.

Output contract: actual `timeline.deadlineDate`, overdue/timeliness conclusions, `statutoryPenalty.applicable`/`accruedAmount`, and actual judicial eligibility/earliest filing date are null. Retained arithmetic lives in `timeline.model`, `statutoryPenalty.model` and explicitly named judicial model fields; `qualification` records the assumptions. Exported calculated dates say Modeldatum. A notice is withheld before the model deadline, after a reported decision or when a notice is already reported. A premature notice cannot activate the penalty/appeal model. Any remaining draft has explicit receipt/deadline placeholders for review and does not assert that a calculated date is a proven legal deadline. No submission or public launch is authorized by these local corrections.

The authority and its filing channel must be verified in the [official Woo-index](https://organisaties.overheid.nl/woo). This package makes no claim that a generated request was submitted or that documents will be disclosed. Its official source links were checked on 5 October 2026.
