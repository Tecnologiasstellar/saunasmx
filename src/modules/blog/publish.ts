import Anthropic from '@anthropic-ai/sdk';
import { and, desc, isNotNull, lte, sql } from 'drizzle-orm';
import { getBlogDb } from '@/db/client';
import { EMBEDDING_DIMENSIONS, posts } from '@/db/schema';

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
 *   6. Code             → JSON-LD assembled deterministically, never LLM-authored
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

/** Seeds the keyword hunt. Rotates daily so consecutive posts aren't near-duplicates. */
const SEED_KEYWORDS = [
  'protocolo terapia de contraste',
  'baño de hielo inflamación',
  'rutina sauna y baño de hielo',
  'inmersión en agua fría recuperación',
  'beneficios sauna infrarrojo',
  'baños de contraste fisioterapia',
  'temperatura baño de hielo',
];

/** Keywords above this difficulty aren't winnable by a new site. */
const MAX_KEYWORD_DIFFICULTY = 35;
const MIN_SEARCH_VOLUME = 50; // Spanish volumes run lower than English
const SERP_DEPTH = 10;
const INTERNAL_LINK_POOL = 5;
const TARGET_WORDS = 1500;

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function optional(name: string): string | null {
  return process.env[name]?.trim() || null;
}

/** Deterministic seed rotation: same day → same seed, so a retry doesn't drift. */
function seedForDay(now: Date): string {
  return SEED_KEYWORDS[Math.floor(now.getTime() / 86_400_000) % SEED_KEYWORDS.length]!;
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

  if (!response.ok) {
    // Never fail the day's post over a research API. Log and degrade.
    console.warn(`DataForSEO ${path} → ${response.status}. Continuing without it.`);
    return null;
  }
  return (await response.json()) as T;
}

async function findKeyword(seed: string): Promise<Keyword> {
  const payload = await dataForSeo<{ tasks?: { result?: { items?: unknown[] }[] }[] }>(
    '/dataforseo_labs/google/keyword_ideas/live',
    [
      {
        keywords: [seed],
        location_code: LOCATION_CODE,
        language_code: LANGUAGE_CODE,
        limit: 200,
        // Filter server-side — cheaper than paging through everything.
        filters: [
          ['keyword_info.search_volume', '>', MIN_SEARCH_VOLUME],
          'and',
          ['keyword_properties.keyword_difficulty', '<', MAX_KEYWORD_DIFFICULTY],
        ],
        order_by: ['keyword_info.search_volume,desc'],
      },
    ],
  );

  const items = (payload?.tasks?.[0]?.result?.[0]?.items ?? []) as Array<{
    keyword?: string;
    keyword_info?: { search_volume?: number };
    keyword_properties?: { keyword_difficulty?: number };
  }>;

  const best = items.find((item) => item.keyword);
  if (!best?.keyword) {
    console.warn(`No keyword ideas returned. Falling back to the seed: "${seed}"`);
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

/**
 * Pulls concrete figures out of the SERP text so the article cites real numbers
 * rather than inventing them. Deliberately a regex and not an LLM call: the
 * whole point is that these values are *not* generated.
 */
export function mineMetrics(results: SerpResult[]): string[] {
  const TEMPERATURE = /\b\d{1,3}(?:[.,]\d)?\s?(?:°\s?[CF]|grados?\s?(?:centígrados?|celsius)?\b)/gi;
  const DURATION = /\b\d{1,3}(?:\s?[-–a]\s?\d{1,3})?\s?(?:minutos?|min\b|segundos?|seg\b|horas?|hrs?\b)/gi;

  const found = new Set<string>();
  for (const result of results) {
    const text = `${result.title} ${result.description}`;
    for (const match of text.match(TEMPERATURE) ?? []) found.add(match.trim());
    for (const match of text.match(DURATION) ?? []) found.add(match.trim());
  }
  return [...found];
}

/* -------------------------------------------------------------------------- */
/* 4. Previous posts, for internal links                                      */
/* -------------------------------------------------------------------------- */

type PriorPost = { title: string; url: string };

async function recentPosts(): Promise<PriorPost[]> {
  const rows = await getBlogDb()
    .select({ slug: posts.slug, title: posts.title })
    .from(posts)
    .where(and(isNotNull(posts.publishedAt), lte(posts.publishedAt, sql`now()`)))
    .orderBy(desc(posts.publishedAt))
    .limit(INTERNAL_LINK_POOL);

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
      description: `El artículo completo en Markdown, en español de México. Alrededor de ${TARGET_WORDS} palabras. Empieza en un H2 — sin H1, la página muestra el título por separado.`,
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
  required: ['title', 'seoMetaDescription', 'contentMarkdown', 'keyTakeaways', 'faq'],
  additionalProperties: false,
} as const;

export type Article = {
  title: string;
  seoMetaDescription: string;
  contentMarkdown: string;
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

  return JSON.parse(text.text) as Article;
}

/* -------------------------------------------------------------------------- */
/* 6. JSON-LD — built in code, never generated                                */
/* -------------------------------------------------------------------------- */

/**
 * MedicalWebPage (health-topic content) plus an Article and an FAQPage. `@graph`
 * keeps the three as separate addressable nodes rather than nesting them, which
 * is what Google's rich-results parser prefers.
 */
export function buildJsonLd(input: { article: Article; slug: string; keyword: string; publishedAt: Date }) {
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
        articleSection: 'Terapia de contraste',
        keywords: input.keyword,
        inLanguage: LOCALE,
        datePublished: iso,
        dateModified: iso,
        mainEntityOfPage: { '@id': `${url}#webpage` },
        author: { '@type': 'Organization', name: SITE_NAME, url: SITE_ORIGIN },
        publisher: { '@type': 'Organization', name: SITE_NAME, url: SITE_ORIGIN },
        // Takeaways give AI search engines a citable, extractable summary.
        abstract: input.article.keyTakeaways.join(' '),
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
  wordCount: number;
  internalLinks: number;
  metricsFound: number;
  serpResults: number;
  embedded: boolean;
  written: boolean;
  article?: Article;
  jsonLd?: unknown;
};

export async function publishDailyPost(options: { dryRun?: boolean; now?: Date } = {}): Promise<PublishResult> {
  const now = options.now ?? new Date();
  const seed = seedForDay(now);
  console.log(`Seed: "${seed}"`);

  const keyword = await findKeyword(seed);
  console.log(`Target: "${keyword.keyword}" (vol ${keyword.volume}, KD ${keyword.difficulty})`);

  // Independent calls — no reason to serialize them.
  const [serp, priorPosts] = await Promise.all([fetchSerp(keyword.keyword), recentPosts()]);
  const metrics = mineMetrics(serp);
  console.log(`SERP: ${serp.length} · metrics: ${metrics.length} · link pool: ${priorPosts.length}`);

  const article = await writeArticle({ keyword, serp, metrics, priorPosts });
  const slug = slugify(article.title);
  const jsonLd = buildJsonLd({ article, slug, keyword: keyword.keyword, publishedAt: now });

  const internalLinks = priorPosts.filter((post) => article.contentMarkdown.includes(post.url)).length;
  const wordCount = article.contentMarkdown.split(/\s+/).length;
  console.log(`Draft: "${article.title}" · ${wordCount} palabras · ${internalLinks} enlaces · /blog/${slug}`);

  if (priorPosts.length >= 2 && internalLinks < 2) {
    console.warn(`Only ${internalLinks} internal link(s) — the model ignored part of the brief.`);
  }

  const base = {
    slug,
    title: article.title,
    keyword: keyword.keyword,
    wordCount,
    internalLinks,
    metricsFound: metrics.length,
    serpResults: serp.length,
  };

  if (options.dryRun) {
    return { ...base, embedded: false, written: false, article, jsonLd };
  }

  const vectorEmbedding = await embed(`${article.title}\n\n${article.contentMarkdown}`);

  await getBlogDb()
    .insert(posts)
    .values({
      slug,
      title: article.title,
      contentMarkdown: article.contentMarkdown,
      seoMetaDescription: article.seoMetaDescription,
      jsonLdSchema: jsonLd,
      publishedAt: now,
      vectorEmbedding,
    })
    // A same-day rerun updates rather than exploding on the unique slug.
    .onConflictDoUpdate({
      target: posts.slug,
      set: {
        title: article.title,
        contentMarkdown: article.contentMarkdown,
        seoMetaDescription: article.seoMetaDescription,
        jsonLdSchema: jsonLd,
        vectorEmbedding,
      },
    });

  console.log(`Published: ${SITE_ORIGIN}/blog/${slug}`);
  return { ...base, embedded: vectorEmbedding !== null, written: true };
}
