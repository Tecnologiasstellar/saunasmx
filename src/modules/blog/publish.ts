import Anthropic from '@anthropic-ai/sdk';
import { and, desc, isNotNull, lte, sql } from 'drizzle-orm';
import { getBlogDb } from '@/db/client';
import { EMBEDDING_DIMENSIONS, posts } from '@/db/schema';
import { pickHeroImage, type HeroImage } from './hero-image';

/**
 * The daily publishing pipeline for the contrast-therapy blog.
 *
 * Available two ways, like the outbox worker: `npm run blog:agent` locally and
 * GET/POST /api/blog/publish on a platform with no shell (Vercel Cron).
 *
 *   1. DataForSEO Labs  → trending, low-competition Spanish keywords
 *   2. DataForSEO SERP  → top-10 results for the winning keyword
 *   3. Regex mining     → exact °C/°F and minute figures from those snippets
 *   4. Neon             → last 5 published posts, for internal links
 *   5. Claude Opus 5    → ~1,500-word Markdown article + FAQ, structured output
 *   6. Code             → claim gate, source allowlist, assembled page, JSON-LD
 *   7. OpenAI           → embedding for semantic internal linking (optional)
 *   8. Neon             → insert
 *
 * Research is best-effort: missing DataForSEO credentials degrade to a seed
 * keyword rather than failing. A published post beats a skipped day.
 */

/* -------------------------------------------------------------------------- */
/* Config — constants at the top beat env vars beat a settings table.          */
/* -------------------------------------------------------------------------- */

const SITE_ORIGIN = 'https://saunas.mx';
const SITE_NAME = 'Saunas.mx';
const LOCATION_CODE = 2484; // Mexico
const LANGUAGE_CODE = 'es';
const LOCALE = 'es-MX';

/**
 * Seeds the keyword hunt, rotating daily so consecutive posts aren't near
 * duplicates. These must be short head terms: keyword_suggestions expands a
 * phrase, so seeding it with a long-tail phrase returns nothing to expand.
 *
 * Drawn from the pillar clusters in docs/seo-strategy.md, weighted the way that
 * document prioritises them: sauna fundamentals and contrast therapy first,
 * buying intent second, sleep/recovery third. `cluster` becomes the article's
 * schema.org articleSection, so the corpus is grouped from day one.
 *
 * Deliberately absent: sexual health, testosterone, detox and weight loss as
 * primary topics. The strategy holds those until a qualified reviewer exists,
 * and an unattended robot is exactly the wrong thing to point at them.
 *
 * Every entry below was checked against the live API on 2026-07-27 and returns
 * suggestions; the count in each comment is what it returned. Seeds that came
 * back empty ("sauna seca", "sauna y sueño", "mantenimiento de sauna" and five
 * others) are deliberately absent — keyword_suggestions expands a short head
 * term, and a phrase that is already long-tail has nothing left to expand.
 *
 * The fat seeds are the engine: paired with the already-covered filter in
 * findKeyword, "sauna" alone can supply distinct targets for weeks, because each
 * run takes the best keyword no published article has claimed yet.
 */
const SEEDS: { seed: string; cluster: string }[] = [
  // Pillar A — sauna fundamentals
  { seed: 'sauna', cluster: 'Sauna' }, // 50
  { seed: 'temazcal', cluster: 'Sauna' }, // 50
  { seed: 'baño de vapor', cluster: 'Sauna' }, // 50
  { seed: 'sauna infrarrojo', cluster: 'Sauna' }, // 10
  { seed: 'sauna finlandesa', cluster: 'Sauna' }, // 1
  { seed: 'beneficios de la sauna', cluster: 'Sauna' }, // 1
  // Pillar B — contrast therapy and cold
  { seed: 'crioterapia', cluster: 'Terapia de contraste' }, // 50
  { seed: 'baño de hielo', cluster: 'Terapia de contraste' }, // 6
  { seed: 'terapia de contraste', cluster: 'Terapia de contraste' }, // 4
  { seed: 'ducha fría', cluster: 'Terapia de contraste' }, // 2
  { seed: 'inmersión en agua fría', cluster: 'Terapia de contraste' }, // 1
  // Pillar C/D — sleep, recovery, performance
  { seed: 'recuperación muscular', cluster: 'Sueño y recuperación' }, // 10
  // Pillar H — buying, installing, running one
  { seed: 'sauna portátil', cluster: 'Guía para comprar' }, // 9
  { seed: 'sauna en casa', cluster: 'Guía para comprar' }, // 7
  { seed: 'instalación de sauna', cluster: 'Guía para comprar' }, // 1
  { seed: 'sauna para exterior', cluster: 'Guía para comprar' }, // 1
];

/** Keywords above this difficulty aren't winnable by a new site. */
const MAX_KEYWORD_DIFFICULTY = 35;
/**
 * Mexican Spanish volumes in this niche are small — "baño de hielo" itself is
 * only ~480/mo — so a floor tuned for English throws away the entire long tail.
 */
const MIN_SEARCH_VOLUME = 20;

/**
 * "baño" means bathroom as often as bath, and "hielo" pulls in dry ice. Without
 * this guard the highest-volume match for "baño de hielo inflamación" is "taza
 * de baño" (toilet bowl, 74k/mo) and the agent writes about plumbing.
 */
const OFF_TOPIC = [
  'taza', 'traje', 'mueble', 'azulejo', 'espejo', 'regadera', 'tina para',
  // "hielo seco" is dry ice, but "sauna seco" is ours — match the phrase, not the word.
  'laboratorio', 'quemadura', 'hielo seco', 'pdf', 'costco', 'descargar',
  // "sauna disco" (9,900/mo) and "sauna gay" are bathhouses, not equipment.
  // "cerca de mi" is local intent we have no venue directory to answer.
  'disco', 'gay', 'cerca de mi', 'masaje', 'hotel', 'gimnasio con',
  // Plumbing again, from the other direction: "solo sale agua fría en la ducha".
  'sale agua', 'calentador', 'boiler', 'fuga', 'reparar', 'no calienta',
  // Prices and models: the robot has no verified supplier data and would invent
  // figures. Buying *education* (installation, power draw, upkeep) is in scope;
  // quoting a price is a human's job.
  'precio', 'cuanto cuesta', 'venta de', 'comprar',
  // Claim territory the strategy holds back until a clinical reviewer exists.
  // Blocked here as well as in the prompt: a keyword can never route us there.
  'testosterona', 'ereccion', 'erectil', 'fertilidad', 'esperma', 'libido',
  'adelgaz', 'quema grasa', 'bajar de peso', 'detox', 'desintox', 'celulitis',
];

/** A keyword must contain at least one of these to be ours. */
const ON_TOPIC = [
  'sauna', 'hielo', 'fri', 'calor', 'contraste', 'crioterapia', 'plunge',
  'temazcal', 'vapor', 'recuperacion', 'inmersion', 'termoterapia', 'sudor',
  'entrenar', 'muscular', 'sueno', 'dormir', 'descanso',
];
const SERP_DEPTH = 10;
const INTERNAL_LINK_POOL = 5;
const TARGET_WORDS = 1500;
/**
 * A prohibited claim is usually one bad sentence in 1,500 good words, not a bad
 * brief — rewriting clears it. Losing a whole day to the first draft's slip is
 * the expensive failure. The research above is reused; only the writing repeats.
 */
const DRAFT_ATTEMPTS = 3;

/**
 * The only citations the robot may use. Hand-checked public-health agencies,
 * systematic reviews and academic medical centres, per the source hierarchy in
 * docs/seo-strategy.md.
 *
 * This is an allowlist, not a suggestion: any URL the model returns that is not
 * on this list is dropped before render. That makes a fabricated citation
 * structurally impossible rather than merely forbidden — the failure mode a
 * prompt instruction alone cannot close.
 */
const SOURCES: { url: string; label: string }[] = [
  {
    url: 'https://www.health.harvard.edu/healthy-aging-and-longevity/saunas-and-your-health',
    label: 'Harvard Health — Saunas and your health (seguridad, hidratación, contraindicaciones)',
  },
  {
    url: 'https://pubmed.ncbi.nlm.nih.gov/30077204/',
    label: 'PubMed — Revisión de la evidencia sobre sauna y salud',
  },
  {
    url: 'https://pubmed.ncbi.nlm.nih.gov/30486813/',
    label: 'PubMed — Asociación entre uso de sauna y mortalidad cardiovascular (observacional)',
  },
  {
    url: 'https://pubmed.ncbi.nlm.nih.gov/41049507/',
    label: 'PubMed — Metaanálisis sobre calor pasivo',
  },
  {
    url: 'https://pubmed.ncbi.nlm.nih.gov/38211547/',
    label: 'PubMed — Respuesta de choque por frío (riesgos de la inmersión súbita)',
  },
  {
    url: 'https://www.ncbi.nlm.nih.gov/books/NBK620915/',
    label: 'CDC Yellow Book — Inmersión en agua fría',
  },
  {
    url: 'https://www.cdc.gov/healthy-weight-growth/physical-activity/index.html',
    label: 'CDC — Actividad física, peso y salud',
  },
  {
    url: 'https://www.who.int/es/news-room/fact-sheets/detail/physical-activity',
    label: 'OMS — Actividad física (en español)',
  },
];

/**
 * Claims that must never be published as fact. Checked against the finished
 * draft, not just forbidden in the prompt, because a prompt is advice and this
 * is a gate: Mexican health advertising is regulated by COFEPRIS, and the site
 * is an educational publisher, not a clinic.
 *
 * Narrowed 2026-07-28 (AV, explicit call) to the bright-line disease/medical-
 * authority claims COFEPRIS actually names — cure/prevent/treat a named
 * condition, or a false clinical/medical endorsement. Softer wellness-marketing
 * phrases (quema grasa, elimina toxinas, and the like) were dropped from the
 * gate: they were blocking routine cold-therapy/detox-adjacent topics whose
 * whole point is debunking that exact myth, and they're puffery rather than
 * the "therapeutic/preventive/rehabilitative" territory COFEPRIS warns about.
 * If a run starts asserting those as fact rather than debunking them, that's
 * still worth a manual read before it ships.
 *
 * A negation immediately before the phrase is allowed — "la sauna no cura el
 * insomnio" is exactly the myth-correction the strategy asks for. Anything
 * else fails the run. A missing day costs nothing; a published medical claim
 * does.
 */
const PROHIBITED_CLAIMS = [
  'cura el insomnio', 'cura la depresion', 'cura la ansiedad',
  'previene el cancer', 'previene la demencia', 'previene el alzheimer',
  'trata la disfuncion', 'aumenta la testosterona', 'sube la testosterona',
  'alarga la vida', 'extiende la vida', 'revierte el envejecimiento',
  'grado medico', 'clinicamente comprobado', 'cientificamente comprobado',
  'resultados garantizados',
];

/** Words that flip a prohibited phrase into a correction of it. */
const NEGATIONS = ['no ', 'nunca ', 'tampoco ', 'ni ', 'mito', 'falso', 'sin evidencia', 'no es cierto'];

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function optional(name: string): string | null {
  return process.env[name]?.trim() || null;
}

/** Deterministic seed rotation: same day → same seed, so a retry doesn't drift. */
function seedForDay(now: Date): { seed: string; cluster: string } {
  return SEEDS[Math.floor(now.getTime() / 86_400_000) % SEEDS.length]!;
}

/**
 * Returns the prohibited claims the draft asserts, ignoring ones it is debunking.
 *
 * The lookback is 40 characters *within the same sentence* — enough to catch "no
 * cura el insomnio" and "es un mito que la sauna previene el cancer", but
 * stopping at the previous full stop so a denial in one sentence cannot excuse
 * an assertion in the next one.
 */
export function prohibitedClaimsIn(text: string): string[] {
  const folded = fold(text);
  return PROHIBITED_CLAIMS.filter((claim) => {
    let from = 0;
    for (;;) {
      const at = folded.indexOf(claim, from);
      if (at === -1) return false; // every occurrence was a correction
      const lead = folded.slice(Math.max(0, at - 40), at).split(/[.!?\n]/).pop() ?? '';
      if (!NEGATIONS.some((negation) => lead.includes(negation))) return true;
      from = at + claim.length;
    }
  });
}

/** Lowercase, accent-free, for substring matching. "frío" and "frio" must agree. */
function fold(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Accents are stripped so "baño de hielo" → "bano-de-hielo" and the URL stays ASCII. */
export function slugify(title: string): string {
  return title
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

/* -------------------------------------------------------------------------- */
/* 1 + 2. DataForSEO                                                          */
/* -------------------------------------------------------------------------- */

type Keyword = { keyword: string; volume: number; difficulty: number };
type SerpResult = { title: string; description: string; url: string };

async function dataForSeo<T>(path: string, body: unknown): Promise<T | null> {
  const login = optional('DATAFORSEO_LOGIN');
  const password = optional('DATAFORSEO_PASSWORD');
  if (!login || !password) return null;

  const response = await fetch(`https://api.dataforseo.com/v3${path}`, {
    method: 'POST',
    headers: {
      authorization: `Basic ${Buffer.from(`${login}:${password}`).toString('base64')}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  // Never fail the day's post over a research API — log and degrade. DataForSEO
  // puts the actionable reason in the body (unverified account, no balance), not
  // in the status line, so surface it or the CI log says only "403".
  const payload = (await response.json().catch(() => null)) as { status_message?: string } | null;

  if (!response.ok) {
    const reason = payload?.status_message ?? 'no detail returned';
    console.warn(`DataForSEO ${path} → ${response.status}: ${reason} Falling back to the seed keyword.`);
    return null;
  }
  return payload as T;
}

/** Shares a word with a seed but not its intent — see OFF_TOPIC. */
export function isRelevant(keyword: string): boolean {
  const folded = fold(keyword);
  if (OFF_TOPIC.some((term) => folded.includes(term))) return false;
  return ON_TOPIC.some((term) => folded.includes(term));
}

async function findKeyword(seed: string, covered: string[]): Promise<Keyword> {
  // keyword_suggestions matches the whole phrase; keyword_ideas matches any single
  // word in it, which in Spanish drags in bathroom-remodelling and swimwear.
  const payload = await dataForSeo<{ tasks?: { result?: { items?: unknown[] }[] }[] }>(
    '/dataforseo_labs/google/keyword_suggestions/live',
    [
      {
        keyword: seed,
        location_code: LOCATION_CODE,
        language_code: LANGUAGE_CODE,
        limit: 100,
        // Volume is the only safe server-side filter. Difficulty is frequently
        // null on Spanish long-tail terms, and a server-side `<` drops nulls —
        // which is most of the winnable inventory. Filtered below instead.
        filters: [['keyword_info.search_volume', '>', MIN_SEARCH_VOLUME]],
        order_by: ['keyword_info.search_volume,desc'],
      },
    ],
  );

  const items = (payload?.tasks?.[0]?.result?.[0]?.items ?? []) as Array<{
    keyword?: string;
    keyword_info?: { search_volume?: number };
    keyword_properties?: { keyword_difficulty?: number };
  }>;

  const best = items
    .filter((item) => item.keyword && isRelevant(item.keyword))
    // Null difficulty means "not enough data to score", which for a term this
    // obscure reads as low competition. Treat it as winnable rather than drop it.
    .filter((item) => (item.keyword_properties?.keyword_difficulty ?? 0) < MAX_KEYWORD_DIFFICULTY)
    // One URL per intent. A keyword already answered by a published article
    // would produce a near-duplicate that competes with its own predecessor —
    // the single most common way a programmatic blog poisons itself.
    .filter((item) => !covered.some((title) => title.includes(fold(item.keyword!))))
    .sort((a, b) => (b.keyword_info?.search_volume ?? 0) - (a.keyword_info?.search_volume ?? 0))[0];

  if (!best?.keyword) {
    console.warn(`No usable keyword after filtering ${items.length} suggestion(s). Using the seed: "${seed}"`);
    return { keyword: seed, volume: 0, difficulty: 0 };
  }

  return {
    keyword: best.keyword,
    volume: best.keyword_info?.search_volume ?? 0,
    difficulty: best.keyword_properties?.keyword_difficulty ?? 0,
  };
}

async function fetchSerp(keyword: string): Promise<SerpResult[]> {
  const payload = await dataForSeo<{ tasks?: { result?: { items?: unknown[] }[] }[] }>(
    '/serp/google/organic/live/advanced',
    [{ keyword, location_code: LOCATION_CODE, language_code: LANGUAGE_CODE, depth: SERP_DEPTH }],
  );

  const items = (payload?.tasks?.[0]?.result?.[0]?.items ?? []) as Array<{
    type?: string;
    title?: string;
    description?: string;
    url?: string;
  }>;

  return items
    .filter((item) => item.type === 'organic' && item.title)
    .map((item) => ({ title: item.title ?? '', description: item.description ?? '', url: item.url ?? '' }));
}

/* -------------------------------------------------------------------------- */
/* 3. Mine exact temperature and timing metrics                               */
/* -------------------------------------------------------------------------- */

const TEMPERATURE = /\b\d{1,3}(?:[.,]\d)?\s?(?:°\s?[CF]\b|grados?\b)/gi;
const DURATION = /\b\d{1,3}(?:\s?[-–a]\s?\d{1,3})?\s?(?:minutos?|min\b|segundos?|seg\b|horas?|hrs?\b)/gi;

/** How many top-ranking pages to read. Beyond ~5 the yield drops and the wait grows. */
const PAGES_TO_MINE = 5;
const PAGE_TIMEOUT_MS = 8_000;
const MAX_PAGE_BYTES = 400_000;

function figuresIn(text: string): string[] {
  return [...(text.match(TEMPERATURE) ?? []), ...(text.match(DURATION) ?? [])].map((m) => m.trim());
}

/**
 * Reads the top-ranking pages and extracts their temperature and duration
 * figures, so the article can cite real numbers instead of inventing them.
 *
 * Deliberately a regex and not an LLM call: the whole point is that these values
 * are *not* generated. Deliberately the page body and not the SERP snippet:
 * Google truncates descriptions to ~155 characters of prose, which in practice
 * contain no figures at all — mining snippets alone always returned zero.
 *
 * Each figure is tagged with its source host. Sources are a mix of Spanish and
 * US sites, so a bare "69 grados" may be Fahrenheit; the host lets the model
 * judge, and the system prompt requires conversion to Celsius.
 */
export async function mineMetrics(results: SerpResult[]): Promise<string[]> {
  const found = new Set<string>();

  // Snippets rarely carry figures, but they are already paid for.
  for (const result of results) {
    for (const figure of figuresIn(`${result.title} ${result.description}`)) found.add(figure);
  }

  const pages = results.filter((result) => result.url).slice(0, PAGES_TO_MINE);

  await Promise.all(
    pages.map(async (page) => {
      try {
        const response = await fetch(page.url, {
          signal: AbortSignal.timeout(PAGE_TIMEOUT_MS),
          headers: { 'user-agent': 'Mozilla/5.0 (compatible; saunas.mx-research/1.0)' },
        });
        if (!response.ok) return;

        const html = (await response.text()).slice(0, MAX_PAGE_BYTES);
        const text = html
          .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ');

        const host = new URL(page.url).hostname.replace(/^www\./, '');
        for (const figure of figuresIn(text)) found.add(`${figure} (${host})`);
      } catch {
        // A blocked, slow, or malformed page is normal. Skip it; the other four
        // still yield figures, and an empty set only costs factual density.
      }
    }),
  );

  return [...found];
}

/* -------------------------------------------------------------------------- */
/* 4. Previous posts, for internal links                                      */
/* -------------------------------------------------------------------------- */

type PriorPost = { title: string; url: string };

/**
 * Everything already published, newest first. Two jobs: the newest few become
 * internal-link targets, and the whole set is what the keyword hunt checks
 * against so we never write the same article twice.
 */
async function publishedPosts(): Promise<PriorPost[]> {
  const rows = await getBlogDb()
    .select({ slug: posts.slug, title: posts.title })
    .from(posts)
    .where(and(isNotNull(posts.publishedAt), lte(posts.publishedAt, sql`now()`)))
    .orderBy(desc(posts.publishedAt));

  return rows.map((row) => ({ title: row.title, url: `${SITE_ORIGIN}/blog/${row.slug}` }));
}

/* -------------------------------------------------------------------------- */
/* 5. Write the article                                                       */
/* -------------------------------------------------------------------------- */

/**
 * The model returns prose and facts. It does NOT return JSON-LD — that is
 * assembled in code below, so the schema can never be malformed by generation.
 */
const ARTICLE_SCHEMA = {
  type: 'object',
  properties: {
    title: {
      type: 'string',
      description: 'Titular H1 en español, menos de 65 caracteres, contiene la palabra clave.',
    },
    seoMetaDescription: {
      type: 'string',
      description: 'Meta description en español, entre 140 y 158 caracteres.',
    },
    contentMarkdown: {
      type: 'string',
      description: `El cuerpo del artículo en Markdown, en español de México. Alrededor de ${TARGET_WORDS} palabras. Empieza en un H2 — sin H1, la página muestra el título por separado. No incluyas resumen, preguntas frecuentes ni fuentes: esas secciones se añaden aparte.`,
    },
    answerShort: {
      type: 'string',
      description:
        'Respuesta directa a la pregunta principal, de 40 a 80 palabras, en español. Debe poder leerse sola, fuera de contexto.',
    },
    whatWeKnow: {
      type: 'string',
      description: 'Una o dos frases sobre lo que la evidencia disponible sí respalda.',
    },
    whatIsUnclear: {
      type: 'string',
      description: 'Una o dos frases sobre lo que sigue siendo incierto, preliminar o mal estudiado.',
    },
    safety: {
      type: 'string',
      description:
        'Dos o tres frases de seguridad concretas para este tema: hidratación, enfriamiento gradual, alcohol, y quién debe consultar a su médico antes.',
    },
    sourceUrls: {
      type: 'array',
      items: { type: 'string' },
      description:
        'Las URLs de la lista de fuentes permitidas en las que realmente te apoyaste, entre 2 y 4. Copia la URL exacta. No incluyas ninguna otra.',
    },
    keyTakeaways: {
      type: 'array',
      items: { type: 'string' },
      description: 'De 3 a 5 conclusiones de una frase, en español, cada una con una cifra concreta.',
    },
    faq: {
      type: 'array',
      items: {
        type: 'object',
        properties: { question: { type: 'string' }, answer: { type: 'string' } },
        required: ['question', 'answer'],
        additionalProperties: false,
      },
      description:
        'De 3 a 5 preguntas que un lector mexicano realmente buscaría, en español, con respuestas de 40 a 60 palabras.',
    },
  },
  required: [
    'title',
    'seoMetaDescription',
    'contentMarkdown',
    'answerShort',
    'whatWeKnow',
    'whatIsUnclear',
    'safety',
    'sourceUrls',
    'keyTakeaways',
    'faq',
  ],
  additionalProperties: false,
} as const;

export type Article = {
  title: string;
  seoMetaDescription: string;
  contentMarkdown: string;
  answerShort: string;
  whatWeKnow: string;
  whatIsUnclear: string;
  safety: string;
  sourceUrls: string[];
  keyTakeaways: string[];
  faq: { question: string; answer: string }[];
};

const SYSTEM_PROMPT = `Escribes para ${SITE_NAME}, una publicación mexicana sobre terapia de contraste: sauna, baño de hielo y recuperación.

Idioma: español de México, en su totalidad. Título, cuerpo, tablas, conclusiones y preguntas frecuentes. Nunca mezcles inglés salvo en un término técnico que no tenga traducción establecida, y en ese caso explícalo la primera vez.

Trato: usa "tú", no "usted" ni "vosotros". Vocabulario mexicano neutro — "alberca" y no "piscina", "regadera" y no "ducha".

Unidades: grados Celsius y sistema métrico. Si citas una cifra en Fahrenheit tomada de una fuente, conviértela y pon el original entre paréntesis.

Estilo:
- Basado en evidencia y específico. Toda afirmación sobre un protocolo lleva un rango de temperatura y una duración.
- Frases directas y llanas. Sin promesas exageradas, sin "descubre el poder de", sin emojis.
- No eres médico. Menciona las contraindicaciones reales (padecimientos cardiovasculares, embarazo, medicamentos para la presión) una sola vez, con claridad, sin llenar el texto de advertencias.
- Nunca inventes un estudio, un investigador ni una cita. Si no tienes fuente, describe el mecanismo sin atribuirlo.

Evidencia — separa siempre lo comprobado de lo plausible:
- Usa "la evidencia disponible sugiere", "se ha observado una asociación", "los resultados son preliminares", "la respuesta puede variar".
- Una asociación observacional no es una causa. Dilo cuando corresponda.
- Distingue entre pausa de enfriamiento, ducha fría e inmersión completa en agua fría. No son la misma práctica.

Afirmaciones prohibidas. No escribas, ni siquiera de forma matizada, que la sauna o el frío:
desintoxican o eliminan toxinas; queman grasa o calorías de forma relevante; curan el insomnio, la ansiedad
o la depresión; previenen el cáncer, la demencia o la enfermedad cardiovascular; alargan la vida o revierten
el envejecimiento; tratan la disfunción eréctil, la infertilidad o la testosterona baja; o "fortalecen el
sistema inmune". Tampoco uses "grado médico", "clínicamente comprobado" ni "resultados garantizados".
Si el tema del artículo es precisamente uno de estos mitos, tu trabajo es corregirlo: dilo en negativo,
con la evidencia, y explica qué ocurre en realidad (por ejemplo, que el peso perdido en una sauna es agua).

Estructura: secciones H2, párrafos cortos, una tabla comparativa cuando aporte, y un protocolo en viñetas que el lector pueda seguir hoy mismo.`;

export async function writeArticle(input: {
  keyword: Keyword;
  serp: SerpResult[];
  metrics: string[];
  priorPosts: PriorPost[];
}): Promise<Article> {
  const anthropic = new Anthropic(); // reads ANTHROPIC_API_KEY

  const linkBlock = input.priorPosts.length
    ? input.priorPosts.map((post) => `- [${post.title}](${post.url})`).join('\n')
    : '(todavía ninguno — este es un artículo temprano, omite los enlaces internos)';

  const serpBlock = input.serp
    .slice(0, SERP_DEPTH)
    .map((result, i) => `${i + 1}. ${result.title}\n   ${result.description}`)
    .join('\n');

  const prompt = `Escribe un artículo de ${TARGET_WORDS} palabras en español dirigido a la palabra clave "${input.keyword.keyword}" (volumen mensual ${input.keyword.volume}, dificultad ${input.keyword.difficulty}).

## Lo que posiciona actualmente
${serpBlock || '(sin datos de SERP — apóyate en el conocimiento establecido sobre protocolos)'}

## Cifras concretas encontradas en los primeros resultados
Intégralas donde encajen de forma natural. Son la columna vertebral factual: el texto debe tener más números reales que cualquiera de los de arriba.
${input.metrics.length ? input.metrics.map((m) => `- ${m}`).join('\n') : '(ninguna extraída)'}

## Enlaces internos — obligatorio
Enlaza a 2 o 3 de estos artículos ya publicados, dentro del texto, con anclas naturales donde el tema realmente conecte. Usa las URLs exactas. No inventes otros enlaces internos.
${linkBlock}

## Fuentes permitidas — la lista completa
Solo puedes citar de aquí. Devuelve en \`sourceUrls\` las 2 a 4 en las que realmente te apoyaste, con la URL exacta. Cualquier otra URL se descarta antes de publicar.
${SOURCES.map((source) => `- ${source.label}\n  ${source.url}`).join('\n')}

Supera a lo que ya posiciona siendo más específico, no más largo.`;

  // Streaming: Opus 5 thinks by default and max_tokens caps thinking + text
  // together, so give it room and avoid the non-streaming HTTP timeout.
  const stream = anthropic.messages.stream({
    model: 'claude-opus-5',
    max_tokens: 32000,
    system: SYSTEM_PROMPT,
    output_config: { effort: 'high', format: { type: 'json_schema', schema: ARTICLE_SCHEMA } },
    messages: [{ role: 'user', content: prompt }],
  });

  const message = await stream.finalMessage();

  if (message.stop_reason === 'refusal') {
    throw new Error(`Model declined the request (${message.stop_details?.category ?? 'unknown'}).`);
  }
  if (message.stop_reason === 'max_tokens') {
    throw new Error('Hit max_tokens before finishing — the article would be truncated.');
  }

  const text = message.content.find((block) => block.type === 'text');
  if (!text || text.type !== 'text') throw new Error('No text block in the model response.');

  const article = JSON.parse(text.text) as Article;

  // Drop anything not on the allowlist. The model is told the rule; this is what
  // enforces it.
  const allowed = new Set(SOURCES.map((source) => source.url));
  const dropped = article.sourceUrls.filter((url) => !allowed.has(url));
  if (dropped.length) console.warn(`Dropped ${dropped.length} source(s) not on the allowlist: ${dropped.join(', ')}`);
  article.sourceUrls = article.sourceUrls.filter((url) => allowed.has(url));

  return article;
}

/* -------------------------------------------------------------------------- */
/* 5b. Assemble the published page                                            */
/* -------------------------------------------------------------------------- */

/**
 * Turns the model's fields into the markdown that actually ships.
 *
 * Assembled in code rather than asked for as prose so the shape is identical on
 * every post: answer first, then the body, then the questions, then the sources.
 * It also puts the FAQ on the page — the FAQPage schema below describes these
 * questions, and structured data that describes invisible content is exactly
 * what Google's guidance tells you not to do.
 */
export function assembleMarkdown(article: Article): string {
  const sources = SOURCES.filter((source) => article.sourceUrls.includes(source.url));

  return [
    `**Respuesta corta.** ${article.answerShort}`,
    '',
    '## Resumen rápido',
    '',
    ...article.keyTakeaways.map((takeaway) => `- ${takeaway}`),
    '',
    `**Lo que sí sabemos.** ${article.whatWeKnow}`,
    '',
    `**Lo que todavía no está claro.** ${article.whatIsUnclear}`,
    '',
    `**Seguridad.** ${article.safety}`,
    '',
    article.contentMarkdown.trim(),
    '',
    '## Preguntas frecuentes',
    '',
    ...article.faq.flatMap((entry) => [`### ${entry.question}`, '', entry.answer, '']),
    ...(sources.length
      ? ['## Fuentes', '', ...sources.map((source) => `- [${source.label}](${source.url})`), '']
      : []),
    '---',
    '',
    'Este artículo es información general y no sustituye una evaluación médica. Si tienes un padecimiento cardiovascular, estás embarazada o tomas medicamentos para la presión, consulta a tu médico antes de usar sauna o inmersión en frío.',
    '',
  ].join('\n');
}

/* -------------------------------------------------------------------------- */
/* 6. JSON-LD — built in code, never generated                                */
/* -------------------------------------------------------------------------- */

/**
 * MedicalWebPage (health-topic content) plus an Article and an FAQPage. `@graph`
 * keeps the three as separate addressable nodes rather than nesting them, which
 * is what Google's rich-results parser prefers.
 */
export function buildJsonLd(input: {
  article: Article;
  slug: string;
  keyword: string;
  cluster: string;
  publishedAt: Date;
}) {
  const url = `${SITE_ORIGIN}/blog/${input.slug}`;
  const iso = input.publishedAt.toISOString();

  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'MedicalWebPage',
        '@id': `${url}#webpage`,
        url,
        name: input.article.title,
        description: input.article.seoMetaDescription,
        inLanguage: LOCALE,
        datePublished: iso,
        dateModified: iso,
        about: { '@type': 'MedicalCondition', name: 'Recuperación muscular e inflamación' },
        audience: { '@type': 'Patient' },
        // Signals to Google that this is protocol/benefit content, not diagnosis.
        medicalAudience: 'Patient',
        specialty: 'https://schema.org/PhysicalTherapy',
        isPartOf: { '@type': 'WebSite', '@id': `${SITE_ORIGIN}#website`, name: SITE_NAME, url: SITE_ORIGIN },
      },
      {
        '@type': 'Article',
        '@id': `${url}#article`,
        headline: input.article.title,
        description: input.article.seoMetaDescription,
        articleSection: input.cluster,
        keywords: input.keyword,
        inLanguage: LOCALE,
        datePublished: iso,
        dateModified: iso,
        mainEntityOfPage: { '@id': `${url}#webpage` },
        // Organization, never a Person. Inventing a bylined author with
        // credentials would be the fake-expertise signal the strategy forbids.
        author: { '@type': 'Organization', name: SITE_NAME, url: SITE_ORIGIN },
        publisher: { '@type': 'Organization', name: SITE_NAME, url: SITE_ORIGIN },
        // The short answer is what an answer engine can lift verbatim.
        abstract: input.article.answerShort,
        // Every one of these is rendered as a visible link in "Fuentes".
        citation: input.article.sourceUrls.map((source) => ({ '@type': 'WebPage', url: source })),
      },
      {
        '@type': 'BreadcrumbList',
        '@id': `${url}#breadcrumbs`,
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Inicio', item: SITE_ORIGIN },
          { '@type': 'ListItem', position: 2, name: 'Blog', item: `${SITE_ORIGIN}/blog` },
          { '@type': 'ListItem', position: 3, name: input.article.title, item: url },
        ],
      },
      {
        '@type': 'FAQPage',
        '@id': `${url}#faq`,
        inLanguage: LOCALE,
        mainEntity: input.article.faq.map((entry) => ({
          '@type': 'Question',
          name: entry.question,
          acceptedAnswer: { '@type': 'Answer', text: entry.answer },
        })),
      },
    ],
  };
}

/* -------------------------------------------------------------------------- */
/* 7. Embedding (optional)                                                    */
/* -------------------------------------------------------------------------- */

/** Null when OPENAI_API_KEY is unset — the column is nullable and the site works without it. */
async function embed(text: string): Promise<number[] | null> {
  const key = optional('OPENAI_API_KEY');
  if (!key) return null;

  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: 'text-embedding-3-small',
      dimensions: EMBEDDING_DIMENSIONS,
      input: text.slice(0, 30_000),
    }),
  });

  if (!response.ok) {
    console.warn(`Embedding failed (${response.status}). Storing the post without one.`);
    return null;
  }

  const payload = (await response.json()) as { data?: { embedding?: number[] }[] };
  return payload.data?.[0]?.embedding ?? null;
}

/* -------------------------------------------------------------------------- */
/* The pipeline                                                               */
/* -------------------------------------------------------------------------- */

export type PublishResult = {
  slug: string;
  title: string;
  keyword: string;
  cluster: string;
  wordCount: number;
  internalLinks: number;
  metricsFound: number;
  serpResults: number;
  sourcesCited: number;
  embedded: boolean;
  written: boolean;
  article?: Article;
  markdown?: string;
  jsonLd?: unknown;
  /** Only on a dry run — the hero the real run would have published. */
  heroImage?: HeroImage;
};

export async function publishDailyPost(options: { dryRun?: boolean; now?: Date } = {}): Promise<PublishResult> {
  const now = options.now ?? new Date();
  const { seed, cluster } = seedForDay(now);
  console.log(`Seed: "${seed}" · cluster: ${cluster}`);

  const priorPosts = await publishedPosts();
  const keyword = await findKeyword(
    seed,
    priorPosts.map((post) => fold(post.title)),
  );
  console.log(`Target: "${keyword.keyword}" (vol ${keyword.volume}, KD ${keyword.difficulty})`);

  const serp = await fetchSerp(keyword.keyword);
  const metrics = await mineMetrics(serp);
  const linkPool = priorPosts.slice(0, INTERNAL_LINK_POOL);
  console.log(`SERP: ${serp.length} · metrics: ${metrics.length} · link pool: ${linkPool.length}`);

  let draft: { article: Article; markdown: string } | null = null;
  let violations: string[] = [];

  for (let attempt = 1; attempt <= DRAFT_ATTEMPTS; attempt++) {
    const candidate = await writeArticle({ keyword, serp, metrics, priorPosts: linkPool });
    const candidateMarkdown = assembleMarkdown(candidate);
    violations = prohibitedClaimsIn(`${candidate.title} ${candidateMarkdown}`);
    if (!violations.length) {
      draft = { article: candidate, markdown: candidateMarkdown };
      break;
    }
    console.warn(
      `Attempt ${attempt}/${DRAFT_ATTEMPTS} asserts prohibited claim(s): ${violations.join(', ')}. Rewriting.`,
    );
  }

  // Gate, not a warning. A prohibited health claim is the one failure worth
  // losing a day over, so this throws before anything reaches the database.
  if (!draft) {
    throw new Error(
      `Draft asserts prohibited health claim(s) after ${DRAFT_ATTEMPTS} attempts: ${violations.join(', ')}. Nothing was published.`,
    );
  }

  const { article, markdown } = draft;

  const slug = slugify(article.title);
  const jsonLd = buildJsonLd({ article, slug, keyword: keyword.keyword, cluster, publishedAt: now });

  const internalLinks = linkPool.filter((post) => markdown.includes(post.url)).length;
  const wordCount = markdown.split(/\s+/).length;
  console.log(
    `Draft: "${article.title}" · ${wordCount} palabras · ${internalLinks} enlaces · ${article.sourceUrls.length} fuentes · /blog/${slug}`,
  );

  if (linkPool.length >= 2 && internalLinks < 2) {
    console.warn(`Only ${internalLinks} internal link(s) — the model ignored part of the brief.`);
  }
  if (article.sourceUrls.length < 2) {
    console.warn(`Only ${article.sourceUrls.length} allowed source(s) cited — the evidence section will read thin.`);
  }

  const base = {
    slug,
    title: article.title,
    keyword: keyword.keyword,
    cluster,
    wordCount,
    internalLinks,
    metricsFound: metrics.length,
    serpResults: serp.length,
    sourcesCited: article.sourceUrls.length,
  };

  // Picked before the dry-run exit so `--dry` shows the photograph it would
  // publish. A dry run that skips the image is no use for checking the image.
  // Every hero already spoken for is passed in, so this article gets one no
  // other post is using.
  const takenImages = await getBlogDb()
    .select({ url: posts.heroImageUrl })
    .from(posts)
    .where(isNotNull(posts.heroImageUrl));
  const heroImage = await pickHeroImage({
    title: article.title,
    slug,
    keyword: keyword.keyword,
    usedUrls: takenImages.map((row) => row.url!),
  });
  console.log(`Hero: ${heroImage.alt}\n      ${heroImage.photographer} · ${heroImage.url}`);

  if (options.dryRun) {
    return { ...base, embedded: false, written: false, article, markdown, jsonLd, heroImage };
  }

  const vectorEmbedding = await embed(`${article.title}\n\n${markdown}`);

  await getBlogDb()
    .insert(posts)
    .values({
      slug,
      title: article.title,
      contentMarkdown: markdown,
      seoMetaDescription: article.seoMetaDescription,
      jsonLdSchema: jsonLd,
      publishedAt: now,
      heroImageUrl: heroImage.url,
      heroImageAlt: heroImage.alt,
      heroImagePhotographer: heroImage.photographer,
      heroImageSource: heroImage.source,
      vectorEmbedding,
    })
    // A same-day rerun updates rather than exploding on the unique slug. The
    // hero is deliberately not in this set: a republish must not reshuffle the
    // photograph of an article people have already seen and linked to.
    .onConflictDoUpdate({
      target: posts.slug,
      set: {
        title: article.title,
        contentMarkdown: markdown,
        seoMetaDescription: article.seoMetaDescription,
        jsonLdSchema: jsonLd,
        vectorEmbedding,
      },
    });

  console.log(`Published: ${SITE_ORIGIN}/blog/${slug}`);
  return { ...base, embedded: vectorEmbedding !== null, written: true };
}
