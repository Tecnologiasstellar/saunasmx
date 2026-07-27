#!/usr/bin/env tsx
/**
 * Seeds synthetic fixtures. No real people, no real companies, no real PII.
 * Idempotent: safe to run repeatedly. Usage: npm run db:seed
 */
import { and, eq } from 'drizzle-orm';
import { assignPlan, createPlan } from '../src/modules/commercial/agreements';
import { getDb } from '../src/modules/database/client';
import {
  appUser,
  commercialPlan,
  contentBlock,
  contentPage,
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

type ColumnsCopy = {
  anchor: string;
  eyebrow: string;
  title: string;
  lead: string;
  columns: Array<{ title: string; tone: 'dark' | 'cold'; items: string[] }>;
};

/**
 * Section copy is deliberately about the installation decision, not about
 * physiological effects. We have no medical source, so the site does not make a
 * health claim.
 */
const LANDING_COPY: Record<
  string,
  {
    title: string;
    description: string;
    eyebrow: string;
    hero: string;
    bullets: string[];
    columns: ColumnsCopy;
    faq: Array<{ q: string; a: string }>;
  }
> = {
  'suanas-mx': {
    title: 'Saunas a medida en México',
    description: 'Compara proveedores de saunas verificados y recibe hasta dos propuestas para tu proyecto, sin costo.',
    eyebrow: 'Terapia de contraste en México',
    hero: 'Cuéntanos tu proyecto de sauna y te conectamos con proveedores que sí trabajan en tu zona.',
    columns: {
      anchor: 'ciencia',
      eyebrow: 'Terapia de contraste 101',
      title: 'Lo que cambia entre el calor y el frío',
      lead: 'Un resumen de lo que cada modalidad exige de tu espacio y tu instalación. No damos consejo médico: para eso, consulta a un profesional de la salud.',
      columns: [
        {
          title: 'Calor / Sauna',
          tone: 'dark',
          items: [
            'Tres caminos distintos: tradicional de piedras, infrarroja o baño de vapor',
            'Cada uno pide una instalación eléctrica y una ventilación diferentes',
            'Interior o exterior define el aislamiento, la madera y el mantenimiento',
          ],
        },
        {
          title: 'Frío / Inmersión',
          tone: 'cold',
          items: [
            'La temperatura se sostiene con un enfriador, no cargando hielo',
            'Necesita filtración, desagüe y una toma eléctrica cerca',
            'El tamaño depende de si te sientas o te recuestas dentro',
          ],
        },
      ],
    },
    bullets: [
      'Proveedores que atienden tu código postal',
      'Hasta dos propuestas relevantes, no diez llamadas',
      'Revisamos cada proyecto antes de compartirlo',
    ],
    faq: [
      { q: '¿Cuánto cuesta?', a: 'Para ti es gratis. Los proveedores pagan por participar en el marketplace.' },
      { q: '¿Cuántos proveedores me contactan?', a: 'Un máximo de dos, elegidos por zona, especialidad y presupuesto.' },
      { q: '¿Qué hacen con mis datos?', a: 'Solo los compartimos con los proveedores asignados, y únicamente si nos das tu consentimiento.' },
    ],
  },
  'pergolas-mx': {
    title: 'Pérgolas a medida en México',
    description: 'Compara fabricantes de pérgolas y recibe hasta dos propuestas para tu terraza o jardín, sin costo.',
    eyebrow: 'Sombra a medida en México',
    hero: 'Cuéntanos qué espacio quieres cubrir y te conectamos con fabricantes que trabajan en tu zona.',
    columns: {
      anchor: 'guia',
      eyebrow: 'Materiales 101',
      title: 'Lo que cambia entre la madera y el metal',
      lead: 'Un resumen de lo que cada material exige de tu terraza y de tu presupuesto de mantenimiento.',
      columns: [
        {
          title: 'Madera',
          tone: 'dark',
          items: [
            'Se ve cálida y se integra al jardín sin esfuerzo',
            'Pide sellado periódico, más seguido si le pega el sol directo',
            'La sección de las vigas depende del claro que quieras cubrir',
          ],
        },
        {
          title: 'Aluminio y acero',
          tone: 'cold',
          items: [
            'Aguanta claros más largos con perfiles más delgados',
            'Mantenimiento mínimo, pero la cimentación pesa más en el costo',
            'Permite techos móviles o de lamas, que la madera complica',
          ],
        },
      ],
    },
    bullets: [
      'Fabricantes que atienden tu código postal',
      'Madera, aluminio o acero según tu proyecto',
      'Revisamos cada proyecto antes de compartirlo',
    ],
    faq: [
      { q: '¿Cuánto cuesta?', a: 'Para ti es gratis. Los fabricantes pagan por participar en el marketplace.' },
      { q: '¿Cuántos fabricantes me contactan?', a: 'Un máximo de dos, elegidos por zona, material y presupuesto.' },
      { q: '¿Qué hacen con mis datos?', a: 'Solo los compartimos con los proveedores asignados, y únicamente si nos das tu consentimiento.' },
    ],
  },
};

for (const [slug, marketplaceId] of marketplaceIds) {
  const copy = LANDING_COPY[slug];
  if (!copy) continue;

  const existing = await db
    .select({ id: contentPage.id })
    .from(contentPage)
    .where(eq(contentPage.marketplaceId, marketplaceId))
    .limit(1);
  if (existing.length > 0) continue;

  const [page] = await db
    .insert(contentPage)
    .values({
      marketplaceId,
      pageType: 'landing',
      slug: 'home',
      title: copy.title,
      description: copy.description,
      searchIntent: 'transactional',
      status: 'published',
      indexingPolicy: 'index',
      lastReviewedAt: new Date(),
    })
    .returning({ id: contentPage.id });

  await db.insert(contentBlock).values([
    {
      pageId: page!.id,
      blockType: 'hero',
      contentJson: { headline: copy.title, body: copy.hero, eyebrow: copy.eyebrow },
      sortOrder: 0,
    },
    { pageId: page!.id, blockType: 'bullets', contentJson: { items: copy.bullets }, sortOrder: 1 },
    { pageId: page!.id, blockType: 'columns', contentJson: copy.columns, sortOrder: 2 },
    { pageId: page!.id, blockType: 'faq', contentJson: { items: copy.faq }, sortOrder: 3 },
  ]);
  console.log(`Content seeded for ${slug}`);
}

console.log('\nSeed complete.');
process.exit(0);
