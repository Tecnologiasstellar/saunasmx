import type { Database } from '@/modules/database/client';
import {
  appUser,
  providerCompany,
  providerMarketplace,
  providerProfile,
  providerService,
  providerTeamMembership,
  providerTerritory,
  userRole,
} from '@/modules/database/schema';
import { loadMarketplaceConfigs } from '@/modules/marketplace-config/loader';
import { publishMarketplaceConfigs } from '@/modules/marketplace-config/publish';
import type { MarketplaceConfig } from '@/modules/marketplace-config/types';
import { buildIntakeSchema, type IntakeInput } from '@/modules/forms-engine/intake-schema';

export type PublishedMarketplaces = {
  ids: Map<string, string>;
  configs: MarketplaceConfig[];
  config: (slug: string) => MarketplaceConfig;
  id: (slug: string) => string;
};

export async function publishRepoConfigs(db: Database): Promise<PublishedMarketplaces> {
  const configs = loadMarketplaceConfigs();
  const ids = await publishMarketplaceConfigs(db, configs);
  return {
    ids,
    configs,
    config: (slug) => {
      const found = configs.find((candidate) => candidate.slug === slug);
      if (!found) throw new Error(`No config for ${slug}`);
      return found;
    },
    id: (slug) => {
      const found = ids.get(slug);
      if (!found) throw new Error(`No marketplace id for ${slug}`);
      return found;
    },
  };
}

export async function seedOperator(db: Database, email = 'operator@example.com'): Promise<string> {
  const [user] = await db.insert(appUser).values({ email, name: 'Operador' }).returning({ id: appUser.id });
  await db.insert(userRole).values({ userId: user!.id, role: 'operator' });
  return user!.id;
}

export type ProviderSpec = {
  name: string;
  marketplaceId: string;
  status?: 'approved' | 'pending' | 'paused';
  services?: string[];
  postalPrefixes?: string[];
  regionCode?: string;
  minValueMinor?: number;
  capacityLimit?: number;
  ownerEmail?: string;
};

export async function seedProvider(db: Database, spec: ProviderSpec): Promise<{ companyId: string; ownerUserId: string }> {
  const [company] = await db
    .insert(providerCompany)
    .values({
      legalName: `${spec.name} SA de CV`,
      displayName: spec.name,
      status: 'active',
      contactEmail: spec.ownerEmail ?? `${spec.name.toLowerCase().replace(/\W+/g, '.')}@example.com`,
    })
    .returning({ id: providerCompany.id });
  const companyId = company!.id;

  const [owner] = await db
    .insert(appUser)
    .values({
      email: spec.ownerEmail ?? `owner.${companyId.slice(0, 8)}@example.com`,
      name: `${spec.name} owner`,
    })
    .returning({ id: appUser.id });
  const ownerUserId = owner!.id;

  await db.insert(providerTeamMembership).values({ providerCompanyId: companyId, userId: ownerUserId, role: 'provider_owner' });
  await db.insert(userRole).values({ userId: ownerUserId, role: 'provider_owner', providerCompanyId: companyId });

  await db.insert(providerMarketplace).values({
    providerCompanyId: companyId,
    marketplaceId: spec.marketplaceId,
    status: spec.status ?? 'approved',
    approvedAt: (spec.status ?? 'approved') === 'approved' ? new Date() : null,
    capacityLimit: spec.capacityLimit ?? 10,
  });

  for (const serviceKey of spec.services ?? []) {
    await db.insert(providerService).values({
      providerCompanyId: companyId,
      marketplaceId: spec.marketplaceId,
      serviceKey,
      minProjectValueMinor: spec.minValueMinor ?? 0,
      currency: 'MXN',
    });
  }

  for (const postalPrefix of spec.postalPrefixes ?? []) {
    await db.insert(providerTerritory).values({
      providerCompanyId: companyId,
      marketplaceId: spec.marketplaceId,
      regionCode: spec.regionCode ?? 'CDMX',
      postalPrefix,
    });
  }

  await db.insert(providerProfile).values({
    providerCompanyId: companyId,
    marketplaceId: spec.marketplaceId,
    description: `${spec.name} test fixture`,
    verificationStatus: 'verified',
  });

  return { companyId, ownerUserId };
}

/** Builds a valid intake payload for a config, parsed through the real schema. */
export function makeIntake(
  config: MarketplaceConfig,
  overrides: {
    email?: string;
    name?: string;
    phone?: string;
    postalCode?: string;
    answers?: Record<string, string>;
    idempotencyKey?: string;
  } = {},
): IntakeInput {
  const answers: Record<string, string> = {};
  for (const step of config.questionnaire.steps) {
    if (step.type === 'single_select') answers[step.id] = step.options[0]!.value;
  }
  Object.assign(answers, overrides.answers ?? {});

  const payload = {
    marketplaceSlug: config.slug,
    contact: {
      name: overrides.name ?? 'Ana Prueba',
      email: overrides.email ?? 'ana.prueba@example.com',
      phone: overrides.phone ?? '5512345678',
    },
    location: { postalCode: overrides.postalCode ?? '01000' },
    answers,
    consent: { leadContact: true, providerSharing: true, policyVersion: 'privacy-2026-01' },
    attribution: { source: 'google', medium: 'organic', campaign: 'brand', landingPath: '/' },
    idempotencyKey: overrides.idempotencyKey ?? `test-${crypto.randomUUID()}`,
  };

  return buildIntakeSchema(config).parse(payload);
}
