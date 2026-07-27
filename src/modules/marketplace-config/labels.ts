import type { MarketplaceConfig } from './types';

/**
 * Human labels for the keys stored against providers and projects.
 *
 * The questionnaire is already the single place where a marketplace writes the
 * words a consumer reads (`{"value": "traditional", "label": "Sauna
 * tradicional…"}`). Reusing it here means a service key can never be shown as a
 * raw database identifier, and a category-specific dictionary never appears in
 * a shared component.
 */
export function serviceLabels(config: MarketplaceConfig): Record<string, string> {
  const stepId = config.matching.answerMapping.service;
  const step = config.questionnaire.steps.find((candidate) => candidate.id === stepId);
  if (!step || !('options' in step)) return {};
  return Object.fromEntries(step.options.map((option) => [option.value, option.label]));
}

/** The label for one key, falling back to the key itself rather than to nothing. */
export function serviceLabel(labels: Record<string, string>, key: string): string {
  return labels[key] ?? key;
}
