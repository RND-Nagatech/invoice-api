# Smart invoice draft contract

This module extracts an editable draft from a transcript or pasted text. It uses
deterministic rules and read-only, tenant-scoped customer/catalog/invoice lookups.
It does not call a paid AI provider, create an invoice/customer, send messages, or
confirm payments. The response always has `needsReview: true` and explicit
`reviewWarnings`; it does not claim a statistical confidence score.

All endpoints use the existing JWT guard and the authenticated business ID:

- `POST /api/v1/ai/invoice-draft` with `{ "text": "..." }`: available on Free.
- `POST /api/v1/ai/voice-invoice` with `{ "transcript": "...", "requestId": "uuid-or-stable-id" }`.
- `GET /api/v1/ai/usage`: `{ isPro, voiceTrialLimit, voiceTrialUsed, voiceTrialRemaining }`.
  The remaining count is `null` for Pro (unrestricted).

`AI_FREE_VOICE_TRIAL_LIMIT` controls lifetime successful voice draft trials per
business. Default: `3`; accepted range: integer `0..100`. Only a successful draft
response consumes a trial, after parsing and lookups succeed. The database uses
a unique business key plus a conditional atomic increment, so concurrent
requests cannot exceed the limit. Invalid transcripts and Pro requests do not
consume Free trials. Text drafting remains available after the voice quota.

Use a fresh `requestId` for each intentional draft submission and reuse it for
network retries. IDs contain 8–100 letters/digits/underscores/hyphens. Concurrent
retries with the same business, ID, and transcript consume one trial. Reusing an
ID for a different transcript returns 400. Legacy clients without an ID remain
supported but their successful requests each consume a trial. The quota ledger
stores the request ID and SHA-256 transcript digest, not the transcript itself.

## Draft fields

The response contains `status: DRAFT`, `source: TEXT|VOICE`, `needsReview: true`,
`reviewWarnings: string[]`, and:

```
draft: {
  customerName, customerId?,
  items: [{ name, description, quantity, unit, unitPrice }],
  discount, taxPercent, additionalFee, depositAmount,
  issueDate, dueDate, notes, templateId?,
  itemName, quantity, unitPrice
}
```

The last three fields mirror the first item for older clients. Missing customer
IDs stay absent; missing prices become zero with a warning. An unmentioned
quantity defaults to one with a warning. Dates are logical dates represented as
UTC midnight, with "today" resolved against the Asia/Jakarta calendar. Missing
due dates default to seven days with a warning. Quantities remain integers for
the current Flutter item editor; fractional quantities require manual review.

Example supported input:

> Bikin invoice Bu Rina, servis AC dua unit masing-masing 150 ribu, tambah freon
> 200 ribu, sudah DP 100 ribu, pelunasan Jumat

It produces two items (Rp300.000 + Rp200.000) and a Rp100.000 proposed deposit.
The deposit does not mark anything as paid. Receipt of the money still requires
the owner's explicit payment confirmation after invoice creation.

Supported grammar includes comma/newline-separated items, numeric/word amounts,
`ribu/juta/Rp` grouping, basic English `thousand/million`, explicit quantity/unit,
price keywords, discount/tax/additional fee, DP amount/percent/half, relative and
weekday due dates, and notes. Unsupported action instructions stay visible as
warnings. This is not a general-purpose language model; review the fields before
saving, especially instructions with omitted prices or ambiguous dates.

Customer selection requires exactly one full name match in the authenticated
business, with an optional Indonesian honorific (`Pak/Bu/Bapak/Ibu`). It never
selects a longer name by fuzzy matching. Catalog prices are copied only for one
exact active item name, when the price was omitted, with a review warning.

`Bikin tagihan Pak Budi seperti kemarin, jumlahnya tiga` reads that customer's
latest non-cancelled invoice in the same business. It copies items and template;
old payments are never copied. The quantity override is applied only when there
is one item. With several items, it warns instead of guessing which one changes.
