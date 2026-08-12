import type { MarketplaceConfig } from '../marketplace-config/types';

/**
 * Structured data for the pages that had none.
 *
 * Blog articles already ship their own JSON-LD, generated with the article.
 * These cover the homepage and the two directory indexes.
 *
 * Everything here describes something the page actually renders. No aggregate
 * rating (nobody has reviewed anyone), no logo (there is no logo asset), no
 * SearchAction (there is no site search). Structured data that claims a feature
 * the site does not have is a manual action waiting to happen, not a shortcut
 * to a rich result.
 */

/** Serializes a JSON-LD object into a script tag, escaping `<` so a string cannot close it early. */
export function JsonLd({ data }: { data: unknown }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }}
    />
  );
}

export function organizationJsonLd(input: { config: MarketplaceConfig; origin: string; description?: string }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: input.config.name,
    url: input.origin,
    ...(input.description ? { description: input.description } : {}),
    areaServed: { '@type': 'Country', name: 'México' },
    // The entity behind the site, named the same way the privacy notice names it.
    parentOrganization: { '@type': 'Organization', name: input.config.contact.legalName },
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'customer support',
      email: input.config.contact.email,
      availableLanguage: 'Spanish',
    },
  };
}

/**
 * An ordered list of what the page is actually showing.
 *
 * Positions are 1-based and follow render order. Only the profiles on this page
 * go in: describing the whole database while showing one state's slice would
 * misrepresent the page to a crawler.
 */
export function itemListJsonLd(input: {
  origin: string;
  path: string;
  name: string;
  items: Array<{ slug: string; name: string }>;
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: input.name,
    url: `${input.origin}${input.path}`,
    numberOfItems: input.items.length,
    itemListElement: input.items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      url: `${input.origin}${input.path}/${item.slug}`,
    })),
  };
}
