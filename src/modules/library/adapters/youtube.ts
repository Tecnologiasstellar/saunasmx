import type { DiscoveredLibraryResource } from '../types';

type Fetch = typeof fetch;

type YouTubeChannelResponse = {
  items?: Array<{ contentDetails?: { relatedPlaylists?: { uploads?: string } } }>;
};
type YouTubePlaylistResponse = {
  items?: Array<{ contentDetails?: { videoId?: string } }>;
};
type YouTubeVideosResponse = {
  items?: Array<{
    id?: string;
    snippet?: {
      title?: string;
      description?: string;
      publishedAt?: string;
      defaultLanguage?: string;
      defaultAudioLanguage?: string;
      thumbnails?: Record<string, { url?: string }>;
    };
    contentDetails?: { duration?: string };
    status?: { embeddable?: boolean; privacyStatus?: string; license?: string };
  }>;
};

async function youtubeJson<T>(fetcher: Fetch, url: URL): Promise<T> {
  const response = await fetcher(url);
  if (!response.ok) throw new Error(`YouTube API returned ${response.status} for ${url.pathname}`);
  return (await response.json()) as T;
}

/** Parses the subset of ISO-8601 durations returned by YouTube. */
export function youtubeDurationSeconds(value?: string): number | undefined {
  if (!value) return undefined;
  const match = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(value);
  if (!match) return undefined;
  return Number(match[1] ?? 0) * 86400 + Number(match[2] ?? 0) * 3600 + Number(match[3] ?? 0) * 60 + Number(match[4] ?? 0);
}

function thumbnail(snippet: NonNullable<NonNullable<YouTubeVideosResponse['items']>[number]['snippet']>): string | undefined {
  return (
    snippet.thumbnails?.maxres?.url ??
    snippet.thumbnails?.standard?.url ??
    snippet.thumbnails?.high?.url ??
    snippet.thumbnails?.medium?.url
  );
}

/**
 * Reads an approved channel's upload playlist and then verifies each video is
 * public and embeddable. Search is intentionally absent: discovery never jumps
 * from an approved official account to an unknown account.
 */
export async function fetchYouTubeUploads(input: {
  channelId: string;
  apiKey: string;
  maxResults?: number;
  fetcher?: Fetch;
}): Promise<DiscoveredLibraryResource[]> {
  const fetcher = input.fetcher ?? fetch;
  const maxResults = Math.min(Math.max(input.maxResults ?? 25, 1), 50);

  const channelsUrl = new URL('https://www.googleapis.com/youtube/v3/channels');
  channelsUrl.search = new URLSearchParams({
    part: 'contentDetails',
    id: input.channelId,
    key: input.apiKey,
  }).toString();
  const channel = await youtubeJson<YouTubeChannelResponse>(fetcher, channelsUrl);
  const uploads = channel.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
  if (!uploads) throw new Error(`YouTube channel ${input.channelId} has no public upload playlist`);

  const playlistUrl = new URL('https://www.googleapis.com/youtube/v3/playlistItems');
  playlistUrl.search = new URLSearchParams({
    part: 'contentDetails',
    playlistId: uploads,
    maxResults: String(maxResults),
    key: input.apiKey,
  }).toString();
  const playlist = await youtubeJson<YouTubePlaylistResponse>(fetcher, playlistUrl);
  const ids = (playlist.items ?? []).map((item) => item.contentDetails?.videoId).filter((id): id is string => !!id);
  if (ids.length === 0) return [];

  const videosUrl = new URL('https://www.googleapis.com/youtube/v3/videos');
  videosUrl.search = new URLSearchParams({
    part: 'snippet,contentDetails,status',
    id: ids.join(','),
    key: input.apiKey,
  }).toString();
  const videos = await youtubeJson<YouTubeVideosResponse>(fetcher, videosUrl);

  return (videos.items ?? [])
    .filter((video) => video.id && video.snippet?.title && video.status?.privacyStatus === 'public' && video.status.embeddable)
    .map((video) => {
      const id = video.id!;
      const snippet = video.snippet!;
      return {
        externalId: id,
        platform: 'youtube',
        format: 'video',
        title: snippet.title!,
        canonicalUrl: `https://www.youtube.com/watch?v=${id}`,
        embedUrl: `https://www.youtube-nocookie.com/embed/${id}`,
        thumbnailUrl: thumbnail(snippet),
        language: snippet.defaultLanguage ?? snippet.defaultAudioLanguage,
        durationSeconds: youtubeDurationSeconds(video.contentDetails?.duration),
        publishedAt: snippet.publishedAt ? new Date(snippet.publishedAt) : undefined,
        description: snippet.description,
        metadata: {
          license: video.status?.license ?? null,
          description: snippet.description ?? null,
        },
      } satisfies DiscoveredLibraryResource;
    });
}

