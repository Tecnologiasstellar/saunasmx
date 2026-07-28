export type LibraryPlatform = 'youtube' | 'spotify' | 'rss' | 'google_books' | 'pubmed' | 'website';

export type LibraryResourceFormat =
  | 'video'
  | 'podcast_episode'
  | 'book'
  | 'article'
  | 'research'
  | 'report'
  | 'course';

export type DiscoveredLibraryResource = {
  externalId: string;
  platform: LibraryPlatform;
  format: LibraryResourceFormat;
  title: string;
  canonicalUrl: string;
  embedUrl?: string;
  thumbnailUrl?: string;
  language?: string;
  durationSeconds?: number;
  publishedAt?: Date;
  description?: string;
  metadata: Record<string, unknown>;
};

export type LibrarySourceConfig = {
  id: string;
  creatorSlug: string;
  platform: LibraryPlatform;
  externalId: string;
  canonicalUrl: string;
  feedUrl?: string;
  officialAccount: boolean;
  active: boolean;
};

