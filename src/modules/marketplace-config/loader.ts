import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';
import {
  marketplaceFileSchema,
  matchingFileSchema,
  questionnaireFileSchema,
  type MatchingFile,
  type QuestionnaireFile,
} from './schema';
import {
  ConfigValidationError,
  type MarketplaceConfig,
  type MatchingConfig,
  type Questionnaire,
  type QuestionnaireOption,
  type QuestionnaireStep,
} from './types';

export const CONFIG_ROOT = resolve(process.cwd(), 'config/marketplaces');

function formatIssues(where: string, error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join('.') : '(root)';
    return `${where}: ${path} — ${issue.message}`;
  });
}

function toOptions(options: Array<number | { value: string | number; label: string }>): QuestionnaireOption[] {
  return options.map((option) => {
    // A bare number is its own label; anything else must have said so explicitly.
    if (typeof option === 'number') return { value: String(option), label: String(option) };
    return { value: String(option.value), label: option.label };
  });
}

function toQuestionnaire(file: QuestionnaireFile): Questionnaire {
  const steps: QuestionnaireStep[] = file.steps.map((step) => {
    switch (step.type) {
      case 'single_select':
      case 'multi_select':
        return { ...step, options: toOptions(step.options) };
      default:
        return step;
    }
  });
  return { id: file.id, version: file.version, locale: file.locale, steps };
}

function toMatching(file: MatchingFile): MatchingConfig {
  return {
    version: file.version,
    reviewPolicy: file.review_policy,
    distribution: { mode: file.distribution.mode, maxProviders: file.distribution.max_providers },
    eligibility: { required: file.eligibility.required },
    answerMapping: { service: file.answer_mapping.service, budget: file.answer_mapping.budget },
    scoring: file.scoring,
    tieBreakers: file.tie_breakers,
    explanationsRequired: file.explanations_required,
    aiRole: file.ai_role,
  };
}

function readFile(path: string): string {
  return readFileSync(path, 'utf8');
}

/**
 * Load and validate one marketplace directory. Accumulates every issue instead
 * of throwing on the first one so an operator can fix the config in one pass.
 */
function loadOne(dir: string, issues: string[]): MarketplaceConfig | null {
  const slugFromDir = dir.split('/').pop() ?? dir;
  const marketplacePath = join(dir, 'marketplace.yaml');

  let rawMarketplace: unknown;
  try {
    rawMarketplace = parseYaml(readFile(marketplacePath));
  } catch (error) {
    issues.push(`${slugFromDir}/marketplace.yaml: unreadable — ${(error as Error).message}`);
    return null;
  }

  const parsed = marketplaceFileSchema.safeParse(rawMarketplace);
  if (!parsed.success) {
    issues.push(...formatIssues(`${slugFromDir}/marketplace.yaml`, parsed.error));
    return null;
  }
  const file = parsed.data;

  if (file.slug !== slugFromDir) {
    issues.push(`${slugFromDir}/marketplace.yaml: slug "${file.slug}" must match its directory name "${slugFromDir}"`);
  }

  const questionnairePath = resolve(dirname(marketplacePath), file.questionnaire);
  const matchingPath = resolve(dirname(marketplacePath), file.matching);

  let questionnaire: Questionnaire | null = null;
  try {
    const result = questionnaireFileSchema.safeParse(JSON.parse(readFile(questionnairePath)));
    if (result.success) {
      questionnaire = toQuestionnaire(result.data);
    } else {
      issues.push(...formatIssues(`${slugFromDir}/${file.questionnaire}`, result.error));
    }
  } catch (error) {
    issues.push(`${slugFromDir}/${file.questionnaire}: unreadable — ${(error as Error).message}`);
  }

  let matching: MatchingConfig | null = null;
  try {
    const result = matchingFileSchema.safeParse(parseYaml(readFile(matchingPath)));
    if (result.success) {
      matching = toMatching(result.data);
    } else {
      issues.push(...formatIssues(`${slugFromDir}/${file.matching}`, result.error));
    }
  } catch (error) {
    issues.push(`${slugFromDir}/${file.matching}: unreadable — ${(error as Error).message}`);
  }

  if (questionnaire && questionnaire.locale !== file.localization.locale) {
    issues.push(
      `${slugFromDir}: questionnaire locale "${questionnaire.locale}" does not match marketplace locale "${file.localization.locale}"`,
    );
  }

  // Cross-file check: matching rules may only reference answers the
  // questionnaire actually collects, and those answers must be selectable
  // options so eligibility stays deterministic.
  if (questionnaire && matching) {
    for (const [dimension, stepId] of Object.entries(matching.answerMapping)) {
      const step = questionnaire.steps.find((candidate) => candidate.id === stepId);
      if (!step) {
        issues.push(
          `${slugFromDir}/${file.matching}: answer_mapping.${dimension} references step "${stepId}", which the questionnaire does not collect`,
        );
      } else if (step.type !== 'single_select') {
        issues.push(
          `${slugFromDir}/${file.matching}: answer_mapping.${dimension} references step "${stepId}" of type "${step.type}"; it must be single_select`,
        );
      }
    }
  }

  if (!questionnaire || !matching) return null;

  const configVersion = createHash('sha256')
    .update(readFile(marketplacePath))
    .update(readFile(questionnairePath))
    .update(readFile(matchingPath))
    .digest('hex')
    .slice(0, 16);

  return {
    id: file.id,
    slug: file.slug,
    name: file.name,
    domain: file.domain.toLowerCase(),
    aliases: file.aliases.map((alias) => alias.toLowerCase()),
    category: file.category,
    localization: file.localization,
    themeKey: file.theme,
    nav: file.nav,
    features: file.features,
    seo: file.seo,
    questionnaire,
    matching,
    configVersion,
  };
}

/**
 * Load every marketplace from disk and cross-validate the set.
 *
 * Throws `ConfigValidationError` listing every problem found. Callers that need
 * partial results should call `loadMarketplaceConfigsSafe`.
 */
export function loadMarketplaceConfigs(root: string = CONFIG_ROOT): MarketplaceConfig[] {
  const result = loadMarketplaceConfigsSafe(root);
  if (result.issues.length > 0) throw new ConfigValidationError(result.issues);
  return result.configs;
}

export function loadMarketplaceConfigsSafe(root: string = CONFIG_ROOT): {
  configs: MarketplaceConfig[];
  issues: string[];
} {
  const issues: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(root)
      .filter((name) => !name.startsWith('.'))
      .filter((name) => statSync(join(root, name)).isDirectory())
      .sort();
  } catch (error) {
    return { configs: [], issues: [`config root "${root}" is unreadable — ${(error as Error).message}`] };
  }

  if (entries.length === 0) {
    return { configs: [], issues: [`config root "${root}" contains no marketplace directories`] };
  }

  const configs: MarketplaceConfig[] = [];
  for (const entry of entries) {
    const config = loadOne(join(root, entry), issues);
    if (config) configs.push(config);
  }

  // Cross-marketplace uniqueness. A duplicate hostname would make host
  // resolution ambiguous, which is an authorization boundary — reject it.
  const byId = new Map<string, string>();
  const bySlug = new Map<string, string>();
  const byHost = new Map<string, string>();
  for (const config of configs) {
    if (byId.has(config.id)) issues.push(`duplicate marketplace id "${config.id}" in ${byId.get(config.id)} and ${config.slug}`);
    byId.set(config.id, config.slug);

    if (bySlug.has(config.slug)) issues.push(`duplicate marketplace slug "${config.slug}"`);
    bySlug.set(config.slug, config.slug);

    for (const host of [config.domain, ...config.aliases]) {
      const owner = byHost.get(host);
      if (owner) issues.push(`hostname "${host}" is claimed by both "${owner}" and "${config.slug}"`);
      byHost.set(host, config.slug);
    }
    if (config.aliases.includes(config.domain)) {
      issues.push(`${config.slug}: canonical domain "${config.domain}" must not also be listed as an alias`);
    }
  }

  return { configs, issues };
}
