import type { DiscoveredLibraryResource, LibraryResourceFormat } from '../types';

type Fetch = typeof fetch;

function decodeXml(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .trim();
}

function tag(xml: string, names: string[]): string | undefined {
  for (const name of names) {
    const match = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, 'i').exec(xml);
    if (match?.[1]) return decodeXml(match[1]);
  }
  return undefined;
}

function attribute(xml: string, tagName: string, attributeName: string): string | undefined {
  const match = new RegExp(`<${tagName}\\b[^>]*\\b${attributeName}=["']([^"']+)["'][^>]*>`, 'i').exec(xml);
  return match?.[1] ? decodeXml(match[1]) : undefined;
}

function blocks(xml: string): string[] {
  const rss = [...xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)].map((match) => match[1]!);
  if (rss.length > 0) return rss;
  return [...xml.matchAll(/<entry(?:\s[^>]*)?>([\s\S]*?)<\/entry>/gi)].map((match) => match[1]!);
}

function durationSeconds(value?: string): number | undefined {
  if (!value) return undefined;
  const parts = value.split(':').map(Number);
  if (parts.some(Number.isNaN)) return undefined;
  if (parts.length === 3) return parts[0]! * 3600 + parts[1]! * 60 + parts[2]!;
  if (parts.length === 2) return parts[0]! * 60 + parts[1]!;
  return parts[0];
}

/**
 * Ingests metadata from the creator/publisher's canonical RSS/Atom feed.
 * Audio is never downloaded or proxied. The public resource links back to the
 * canonical episode/article and may use a separately approved Spotify embed.
 */
export async function fetchOfficialFeed(input: {
  feedUrl: string;
  format: Extract<LibraryResourceFormat, 'podcast_episode' | 'article'>;
  maxResults?: number;
  fetcher?: Fetch;
}): Promise<DiscoveredLibraryResource[]> {
  const fetcher = input.fetcher ?? fetch;
  const response = await fetcher(input.feedUrl, {
    headers: { accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml' },
  });
  if (!response.ok) throw new Error(`Official feed returned ${response.status}: ${input.feedUrl}`);
  const xml = await response.text();
  const feedLanguage = tag(xml, ['language'])?.split(/[-_]/)[0]?.toLowerCase();
  const feedImage =
    attribute(xml, 'itunes:image', 'href') ??
    tag(tag(xml, ['image']) ?? '', ['url']);

  return blocks(xml)
    .slice(0, Math.min(Math.max(input.maxResults ?? 25, 1), 100))
    .flatMap((block) => {
      const title = tag(block, ['title']);
      const canonicalUrl =
        tag(block, ['link']) ??
        attribute(block, 'link', 'href') ??
        attribute(block, 'enclosure', 'url');
      const guid = tag(block, ['guid', 'id']) ?? canonicalUrl;
      if (!title || !canonicalUrl || !guid) return [];

      const date = tag(block, ['pubDate', 'published', 'updated']);
      const image =
        attribute(block, 'itunes:image', 'href') ??
        attribute(block, 'media:thumbnail', 'url') ??
        attribute(block, 'media:content', 'url') ??
        feedImage;
      const description = tag(block, ['description', 'summary', 'content:encoded']);
      const enclosureType = attribute(block, 'enclosure', 'type');
      const detectedFormat = enclosureType?.toLowerCase().startsWith('audio/') ? 'podcast_episode' : input.format;

      return [
        {
          externalId: guid,
          platform: 'rss',
          format: detectedFormat,
          title,
          canonicalUrl,
          language: feedLanguage,
          thumbnailUrl: image,
          durationSeconds: durationSeconds(tag(block, ['itunes:duration'])),
          publishedAt: date && !Number.isNaN(Date.parse(date)) ? new Date(date) : undefined,
          description,
          metadata: {
            feedUrl: input.feedUrl,
            enclosureUrl: attribute(block, 'enclosure', 'url') ?? null,
            enclosureType: enclosureType ?? null,
            description: description ?? null,
          },
        } satisfies DiscoveredLibraryResource,
      ];
    });
}
