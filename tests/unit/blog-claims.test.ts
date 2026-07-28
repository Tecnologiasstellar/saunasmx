import { describe, expect, it } from 'vitest';
import { assembleMarkdown, isRelevant, prohibitedClaimsIn, type Article } from '@/modules/blog/publish';

/**
 * Every string below is a real suggestion DataForSEO returned for our own seeds
 * in Mexico. This filter has silently sent the agent at toilet bowls, plumbing
 * and bathhouses; the cases stay pinned so it cannot happen a fourth time.
 */
describe('isRelevant', () => {
  it('keeps our topics', () => {
    for (const keyword of [
      'sauna en casa',
      'temazcal qué es',
      'baño de hielo',
      'terapia de contraste frío y calor para que sirve',
      'ducha fría beneficios',
      'sauna portátil',
      'recuperación muscular',
    ]) {
      expect(isRelevant(keyword), keyword).toBe(true);
    }
  });

  it('rejects the lookalikes that share a word but not the intent', () => {
    for (const keyword of [
      'taza de baño', // bathroom fixtures
      'sauna disco', // bathhouse, 9,900/mo
      'sauna cerca de mi', // local intent, no venue directory
      'solo sale agua fría en la ducha', // plumbing
      'baño de hielo laboratorio', // lab equipment
      'sauna precio', // no verified supplier pricing
      'sauna y testosterona', // held until a clinical reviewer exists
    ]) {
      expect(isRelevant(keyword), keyword).toBe(false);
    }
  });

  it('does not reject a dry sauna over the dry-ice rule', () => {
    expect(isRelevant('sauna seca o húmeda')).toBe(true);
    expect(isRelevant('hielo seco para eventos')).toBe(false);
  });
});

/**
 * The health-claim gate is the one place in the blog pipeline where being wrong
 * is expensive: an unattended robot publishing "la sauna cura el insomnio" on a
 * Mexican wellness site is a regulatory problem, not a typo. It gets tests.
 */
describe('prohibitedClaimsIn', () => {
  it('catches an asserted claim', () => {
    expect(prohibitedClaimsIn('La sauna quema grasa mientras descansas.')).toEqual(['quema grasa']);
  });

  it('matches without accents or case', () => {
    expect(prohibitedClaimsIn('AUMENTA LA TESTOSTERONA de forma natural')).toEqual(['aumenta la testosterona']);
  });

  it('allows the claim when the article is correcting it', () => {
    expect(prohibitedClaimsIn('La sauna no quema grasa: lo que pierdes es agua.')).toEqual([]);
    expect(prohibitedClaimsIn('Es un mito que la sauna elimina toxinas del cuerpo.')).toEqual([]);
  });

  it('still fails when one mention is corrected and another is asserted', () => {
    const text = 'La sauna no quema grasa. Pero sí quema grasa abdominal si la usas a diario.';
    expect(prohibitedClaimsIn(text)).toEqual(['quema grasa']);
  });

  it('passes ordinary protocol prose', () => {
    const text = 'Entra 12 minutos a 85 °C, sal, enfríate 2 minutos y repite tres rondas.';
    expect(prohibitedClaimsIn(text)).toEqual([]);
  });
});

const article: Article = {
  title: 'Baño de hielo: temperatura y tiempo',
  seoMetaDescription: 'Protocolo con temperaturas y duraciones concretas.',
  contentMarkdown: '## Cómo empezar\n\nEmpieza a 15 °C durante 2 minutos.',
  answerShort: 'Entre 10 y 15 °C, de 2 a 5 minutos.',
  whatWeKnow: 'La inmersión reduce la percepción de dolor muscular.',
  whatIsUnclear: 'El efecto sobre la hipertrofia sigue en discusión.',
  safety: 'Entra de forma gradual y nunca solo.',
  sourceUrls: ['https://www.ncbi.nlm.nih.gov/books/NBK620915/', 'https://example.com/inventada'],
  keyTakeaways: ['10-15 °C es el rango habitual.'],
  faq: [{ question: '¿Cuánto tiempo?', answer: 'Entre 2 y 5 minutos.' }],
};

describe('assembleMarkdown', () => {
  const markdown = assembleMarkdown(article);

  it('leads with the short answer and the summary', () => {
    expect(markdown.startsWith('**Respuesta corta.**')).toBe(true);
    expect(markdown.indexOf('## Resumen rápido')).toBeLessThan(markdown.indexOf('## Cómo empezar'));
  });

  it('renders the FAQ so the FAQPage schema describes visible content', () => {
    expect(markdown).toContain('## Preguntas frecuentes');
    expect(markdown).toContain('### ¿Cuánto tiempo?');
  });

  it('renders only allowlisted sources', () => {
    expect(markdown).toContain('https://www.ncbi.nlm.nih.gov/books/NBK620915/');
    expect(markdown).not.toContain('example.com/inventada');
  });

  it('closes with the medical disclaimer', () => {
    expect(markdown).toContain('no sustituye una evaluación médica');
  });
});
