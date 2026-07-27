#!/usr/bin/env tsx
/**
 * Validates every marketplace configuration on disk.
 * Exit code 1 with an actionable list of issues when anything is wrong.
 *
 * Usage: npm run config:validate
 */
import { loadMarketplaceConfigsSafe } from '../src/modules/marketplace-config/loader';

const { configs, issues } = loadMarketplaceConfigsSafe();

for (const config of configs) {
  const hosts = [config.domain, ...config.aliases].join(', ');
  console.log(
    `✓ ${config.slug.padEnd(14)} ${config.category.padEnd(10)} ${config.localization.locale}  hosts: ${hosts}  ` +
      `questionnaire ${config.questionnaire.id}@${config.questionnaire.version}  ` +
      `matching v${config.matching.version} max=${config.matching.distribution.maxProviders}  ` +
      `config ${config.configVersion}`,
  );
}

if (issues.length > 0) {
  console.error(`\n${issues.length} configuration problem(s):`);
  for (const issue of issues) console.error(`  ✗ ${issue}`);
  process.exit(1);
}

console.log(`\n${configs.length} marketplace configuration(s) valid.`);
