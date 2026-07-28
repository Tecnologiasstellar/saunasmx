/**
 * A CSV reader for the research import.
 *
 * Thirty lines instead of a dependency, because the job is small and fixed: the
 * two research files are RFC 4180 with quoted fields containing commas and
 * semicolons. It handles escaped quotes (`""`) and newlines inside quotes, which
 * a `split(',')` would corrupt silently — the failure mode that matters here,
 * since a misparsed address or price would be published as fact.
 */

/** Parses CSV text into row objects keyed by the header line. */
export function parseCsv(text: string): Array<Record<string, string>> {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  // A trailing newline is optional, so the final field is flushed after the loop.
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]!;

    if (quoted) {
      if (char !== '"') {
        field += char;
      } else if (text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else {
        quoted = false;
      }
      continue;
    }

    if (char === '"') quoted = true;
    else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (char !== '\r') field += char;
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  const header = rows.shift();
  if (!header) return [];

  return rows
    .filter((values) => values.some((value) => value.trim() !== ''))
    .map((values) => Object.fromEntries(header.map((key, index) => [key, values[index] ?? ''])));
}

/**
 * `PENDIENTE` is the research package's word for "the public web did not
 * establish this". It is not a value, and it must never reach a visitor — so it
 * becomes `undefined` here, at the edge, rather than being filtered in a
 * component later.
 *
 * Masked values get the same treatment: `saunasystems.mx` publishes its address
 * as the literal string `[email protected]`, which is an anti-scraping
 * placeholder, not a mailbox.
 */
export function value(raw: string | undefined): string | undefined {
  const trimmed = raw?.trim();
  if (!trimmed) return undefined;
  if (trimmed === 'PENDIENTE') return undefined;
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) return undefined;
  if (trimmed === 'not stated' || trimmed === 'not verified') return undefined;
  return trimmed;
}

/** Splits a `a; b; c` cell into trimmed parts, dropping unknowns. */
export function list(raw: string | undefined): string[] {
  const cell = value(raw);
  if (!cell) return [];
  return cell
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part.length > 0 && part !== 'PENDIENTE');
}

/** A whole number, or undefined when the cell is unknown or not numeric. */
export function number(raw: string | undefined): number | undefined {
  const cell = value(raw);
  if (!cell) return undefined;
  const parsed = Number(cell.replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : undefined;
}

/** Only http(s) survives. A directory must not render an unvalidated href. */
export function url(raw: string | undefined): string | undefined {
  const cell = value(raw);
  if (!cell) return undefined;
  try {
    const parsed = new URL(cell);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.toString() : undefined;
  } catch {
    return undefined;
  }
}

/** `2026-07-27`, or undefined. Kept as a string: it is a calendar date, not an instant. */
export function isoDate(raw: string | undefined): string | undefined {
  const cell = value(raw);
  return cell && /^\d{4}-\d{2}-\d{2}$/.test(cell) ? cell : undefined;
}

/**
 * A URL-safe slug. Accents are folded rather than dropped, so "Térmica" becomes
 * "termica" and not "trmica".
 */
export function slugify(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}
