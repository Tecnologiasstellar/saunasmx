#!/usr/bin/env tsx
/**
 * Seeds synthetic fixtures. No real people, no real companies, no real PII.
 * Idempotent: safe to run repeatedly. Usage: npm run db:seed
 */
import { and, eq } from 'drizzle-orm';
import { assignPlan, createPlan } from '../src/modules/commercial/agreements';
import { publishLandingPage } from '../src/modules/content/landing-copy';
import { getDb } from '../src/modules/database/client';
import {
  appUser,
  commercialPlan,
  providerCompany,
  providerMarketplace,
  providerProfile,
  providerService,
  providerTeamMembership,
  providerTerritory,
  userRole,
} from '../src/modules/database/schema';
import { loadMarketplaceConfigs } from '../src/modules/marketplace-config/loader';
import { publishMarketplaceConfigs } from '../src/modules/marketplace-config/publish';

const MXN = 'MXN';
const pesos = (amount: number) => amount * 100; // minor units

type ProviderFixture = {
  legalName: string;
  displayName: string;
  ownerEmail: string;
  memberEmail?: string;
  marketplaces: Array<{
    slug: string;
    status: 'approved' | 'pending';
    minValueMxn: number;
    services: string[];
    postalPrefixes: string[];
    regionCode: string;
    description: string;
  }>;
};

const PROVIDERS: ProviderFixture[] = [
  {
    legalName: 'Nordic Sauna CDMX SA de CV',
    displayName: 'Nordic Sauna CDMX',
    ownerEmail: 'owner.nordic@example.com',
    memberEmail: 'member.nordic@example.com',
    marketplaces: [
      {
        slug: 'suanas-mx',
        status: 'approved',
        minValueMxn: 80_000,
        services: ['traditional', 'infrared'],
        postalPrefixes: ['01', '03', '05', '11'],
        regionCode: 'CDMX',
        description: 'Instalación de saunas tradicionales e infrarrojos en la Ciudad de México.',
      },
    ],
  },
  {
    legalName: 'Vapor y Madera SA de CV',
    displayName: 'Vapor y Madera',
    ownerEmail: 'owner.vapor@example.com',
    marketplaces: [
      {
        slug: 'suanas-mx',
        status: 'approved',
        minValueMxn: 50_000,
        services: ['traditional', 'steam'],
        postalPrefixes: ['01', '04', '06'],
        regionCode: 'CDMX',
        description: 'Saunas de vapor y madera a medida.',
      },
    ],
  },
  {
    legalName: 'Infrarrojo Wellness GDL SA de CV',
    displayName: 'Infrarrojo Wellness GDL',
    ownerEmail: 'owner.infrarrojo@example.com',
    marketplaces: [
      {
        slug: 'suanas-mx',
        status: 'approved',
        minValueMxn: 30_000,
        services: ['infrared'],
        postalPrefixes: ['44', '45'],
        regionCode: 'JAL',
        description: 'Cabinas de infrarrojos para casa en Guadalajara.',
      },
    ],
  },
  {
    // Deliberately not approved: proves an unapproved provider never matches.
    legalName: 'Baja Spa Works SA de CV',
    displayName: 'Baja Spa Works',
    ownerEmail: 'owner.baja@example.com',
    marketplaces: [
      {
        slug: 'suanas-mx',
        status: 'pending',
        minValueMxn: 40_000,
        services: ['traditional', 'infrared'],
        postalPrefixes: ['01', '03', '22'],
        regionCode: 'BC',
        description: 'Solicitud de alta pendiente de revisión.',
      },
    ],
  },
  {
    legalName: 'Pérgolas del Valle SA de CV',
    displayName: 'Pérgolas del Valle',
    ownerEmail: 'owner.valle@example.com',
    marketplaces: [
      {
        slug: 'pergolas-mx',
        status: 'approved',
        minValueMxn: 25_000,
        services: ['wood', 'aluminum'],
        postalPrefixes: ['01', '03'],
        regionCode: 'CDMX',
        description: 'Pérgolas de madera y aluminio para terrazas y jardines.',
      },
    ],
  },
  {
    legalName: 'Aluminio Norte SA de CV',
    displayName: 'Aluminio Norte',
    ownerEmail: 'owner.norte@example.com',
    marketplaces: [
      {
        slug: 'pergolas-mx',
        status: 'approved',
        minValueMxn: 60_000,
        services: ['aluminum', 'steel'],
        postalPrefixes: ['64', '66'],
        regionCode: 'NL',
        description: 'Estructuras de aluminio y acero en Monterrey.',
      },
    ],
  },
  {
    // Second-marketplace gate: one provider identity, two marketplaces.
    legalName: 'Grupo Exterior MX SA de CV',
    displayName: 'Grupo Exterior MX',
    ownerEmail: 'owner.exterior@example.com',
    marketplaces: [
      {
        slug: 'suanas-mx',
        status: 'approved',
        minValueMxn: 100_000,
        services: ['traditional'],
        postalPrefixes: ['01', '05'],
        regionCode: 'CDMX',
        description: 'Proyectos de bienestar exterior llave en mano.',
      },
      {
        slug: 'pergolas-mx',
        status: 'approved',
        minValueMxn: 40_000,
        services: ['wood', 'aluminum', 'steel'],
        postalPrefixes: ['01', '05'],
        regionCode: 'CDMX',
        description: 'Pérgolas y estructuras exteriores llave en mano.',
      },
    ],
  },
];

async function upsertUser(
  db: Awaited<ReturnType<typeof getDb>>,
  email: string,
  name: string,
): Promise<string> {
  const existing = await db.select({ id: appUser.id }).from(appUser).where(eq(appUser.email, email)).limit(1);
  if (existing[0]) return existing[0].id;
  const [row] = await db.insert(appUser).values({ email, name, status: 'active' }).returning({ id: appUser.id });
  return row!.id;
}

const db = await getDb();
const configs = loadMarketplaceConfigs();
const marketplaceIds = await publishMarketplaceConfigs(db, configs);
console.log(`Published ${marketplaceIds.size} marketplace(s): ${[...marketplaceIds.keys()].join(', ')}`);

/* Operator ---------------------------------------------------------------- */

const operatorId = await upsertUser(db, 'operator@example.com', 'Operador Marketplace');
const existingOperatorRole = await db.select().from(userRole).where(eq(userRole.userId, operatorId)).limit(1);
if (existingOperatorRole.length === 0) {
  await db.insert(userRole).values({ userId: operatorId, role: 'operator' });
}
console.log('Operator: operator@example.com');

/* Commercial plans -------------------------------------------------------- */

for (const [slug, marketplaceId] of marketplaceIds) {
  const existing = await db.select().from(commercialPlan).where(eq(commercialPlan.marketplaceId, marketplaceId)).limit(1);
  if (existing.length > 0) continue;

  // Pilot terms: no money changes hands until lead quality is proven (docs/00).
  await createPlan(db, {
    marketplaceId,
    name: 'Piloto — sin cuota',
    terms: {
      currency: MXN,
      note: 'Acuerdo piloto. Los términos se registran pero no se facturan en el MVP.',
    },
    actor: { type: 'system' },
    correlationId: 'seed',
  });

  // Seeded but unassigned: it exists so an operator can see what a paid plan
  // looks like, not because anyone is being billed.
  await createPlan(db, {
    marketplaceId,
    name: 'Crecimiento — comisión por venta',
    terms: {
      currency: MXN,
      qualifiedLeadFeeMinor: pesos(250),
      successCommissionBps: 300,
      note: 'Cuota por lead calificado más 3% sobre ventas verificadas.',
    },
    actor: { type: 'system' },
    correlationId: 'seed',
  });

  console.log(`Plans seeded for ${slug}`);
}

/* Providers --------------------------------------------------------------- */

for (const fixture of PROVIDERS) {
  const existing = await db
    .select({ id: providerCompany.id })
    .from(providerCompany)
    .where(eq(providerCompany.legalName, fixture.legalName))
    .limit(1);

  const companyId =
    existing[0]?.id ??
    (
      await db
        .insert(providerCompany)
        .values({
          legalName: fixture.legalName,
          displayName: fixture.displayName,
          status: fixture.marketplaces.some((m) => m.status === 'approved') ? 'active' : 'pending',
          contactEmail: fixture.ownerEmail,
          contactPhone: '+520000000000',
        })
        .returning({ id: providerCompany.id })
    )[0]!.id;

  const ownerId = await upsertUser(db, fixture.ownerEmail, `${fixture.displayName} (owner)`);
  const memberships: Array<{ userId: string; role: 'provider_owner' | 'provider_member' }> = [
    { userId: ownerId, role: 'provider_owner' },
  ];
  if (fixture.memberEmail) {
    memberships.push({
      userId: await upsertUser(db, fixture.memberEmail, `${fixture.displayName} (member)`),
      role: 'provider_member',
    });
  }

  for (const membership of memberships) {
    await db
      .insert(providerTeamMembership)
      .values({ providerCompanyId: companyId, userId: membership.userId, role: membership.role })
      .onConflictDoNothing();
    const roles = await db.select().from(userRole).where(eq(userRole.userId, membership.userId));
    if (roles.length === 0) {
      await db.insert(userRole).values({ userId: membership.userId, role: membership.role, providerCompanyId: companyId });
    }
  }

  for (const entry of fixture.marketplaces) {
    const marketplaceId = marketplaceIds.get(entry.slug);
    if (!marketplaceId) throw new Error(`Unknown marketplace slug in fixture: ${entry.slug}`);

    await db
      .insert(providerMarketplace)
      .values({
        providerCompanyId: companyId,
        marketplaceId,
        status: entry.status,
        approvedAt: entry.status === 'approved' ? new Date() : null,
        capacityLimit: 10,
      })
      .onConflictDoNothing();

    // Signed through the real command, so seeded data has the same agreement
    // and terms snapshot the operator screen would produce.
    const [pilot] = await db
      .select({ id: commercialPlan.id })
      .from(commercialPlan)
      .where(and(eq(commercialPlan.marketplaceId, marketplaceId), eq(commercialPlan.name, 'Piloto — sin cuota')))
      .limit(1);
    if (pilot) {
      await assignPlan(db, {
        providerCompanyId: companyId,
        marketplaceId,
        planId: pilot.id,
        actor: { type: 'system' },
        correlationId: 'seed',
      });
    }

    for (const serviceKey of entry.services) {
      await db
        .insert(providerService)
        .values({
          providerCompanyId: companyId,
          marketplaceId,
          serviceKey,
          minProjectValueMinor: pesos(entry.minValueMxn),
          currency: MXN,
        })
        .onConflictDoNothing();
    }

    for (const postalPrefix of entry.postalPrefixes) {
      await db
        .insert(providerTerritory)
        .values({ providerCompanyId: companyId, marketplaceId, regionCode: entry.regionCode, postalPrefix })
        .onConflictDoNothing();
    }

    await db
      .insert(providerProfile)
      .values({
        providerCompanyId: companyId,
        marketplaceId,
        description: entry.description,
        specialtiesJson: entry.services,
        verificationStatus: entry.status === 'approved' ? 'verified' : 'unverified',
      })
      .onConflictDoNothing();
  }

  console.log(`Provider: ${fixture.displayName} (${fixture.marketplaces.map((m) => `${m.slug}:${m.status}`).join(', ')})`);
}

/* Editorial content ------------------------------------------------------- */

// The copy itself lives in src/modules/content/landing-copy.ts, so production
// can publish the same words without also inheriting the fixtures above.
for (const [slug, marketplaceId] of marketplaceIds) {
  const result = await publishLandingPage(db, slug, marketplaceId);
  if (result === 'created') console.log(`Content seeded for ${slug}`);
}

console.log('\nSeed complete.');
process.exit(0);
