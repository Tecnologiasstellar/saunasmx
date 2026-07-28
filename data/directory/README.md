# Directory source data

The research package behind `/lugares` and `/proveedores`. These files are an
**import source**, not the runtime data layer — the app reads `directory_profile`
in PostgreSQL and never opens a CSV.

Research date: 2026-07-27. Origin: `CODEX/2026-07-27/i-am/outputs/`.

## Files

| File | What it is |
|---|---|
| `sauna_places.csv` | 39 researched sauna venues, one row each, with public source URLs. |
| `sauna_suppliers.csv` | 25 researched manufacturers and installers. |
| `terms.es.json` | Spanish vocabulary: venue types, access models, supplier types, sauna types, amenities. |
| `copy.es.json` | Per-record Spanish copy — access conditions, price notes, provider service and heater notes. |

The CSVs are in English because the research was. Translation happens **at import
time**, so the database stores display-ready Spanish and the running app carries
no dictionary.

## Running an import

```bash
npm run directory:import
```

Dry run by default: it prints exactly what an apply would do — creates, updates,
conflicts, and records held back — and writes nothing. Add `--apply` to commit,
and `--marketplace=<slug>` to target a different marketplace.

**Locally, stop `npm run dev` before applying.** With `DATABASE_URL` unset the
database is PGlite embedded in the dev server's own process (ADR-010), so an
import running in a second process writes to disk while the server keeps serving
what it already loaded — the pages look unchanged until you restart it. Against
Neon this does not apply: it is a real shared server, and an import is visible on
the next request.

## Rules the import enforces

1. **`PENDIENTE` is not a value.** It means the public web did not establish the
   fact. It becomes `null`, never a string a visitor can read. Masked
   placeholders like `[email protected]` get the same treatment.
2. **Evidence gates publication.** `core` and `secondary` publish; `verify` and
   `inactive` never do. Four records are held back today: SUMMIT Wellness Club
   (announced, not open), Finlandesa Spa, Baños Saunas Premier and Saunas Siete
   Grados.
3. **Nothing is invented.** Every published sentence is a translation of a column
   in that row. Where the research says a fact is unconfirmed, the Spanish says so.
4. **No health claims.** Amenities and the operator's own stated experience only.
5. **The editorial 1–5 price tier is never published.** It is our score about a
   third party, not a price they published. It stays in `details_json` for
   internal use. A price is only shown where the business published one.
6. **Re-running is safe.** Records match on (marketplace, dataset, research id).
   A field an operator edited since the last import is reported as a conflict and
   left alone; a field still matching what the import last wrote is refreshed.

## Refreshing the research

Replace the CSV, run a dry run, read the conflict list, then apply. The dry run
is the review step — it names every field it would refuse to touch and every
record it would pull down because the evidence weakened.

Both README files from the research package ask for re-verification of pricing,
schedules and access **before launch and every 90 days after**. `last_verified_at`
is on every row and rendered on every profile so that stays visible.

## Adding a second category

Pergolas ships its own `data/directory/` files with the same four names and its
own vocabulary. No code changes: `directory_profile` is scoped by
`marketplace_id`, and the pages, cards and queries are category-agnostic.
