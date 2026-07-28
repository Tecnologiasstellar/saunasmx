import { describe, expect, it, vi } from 'vitest';
import { fetchOfficialFeed } from '@/modules/library/adapters/rss';
import { fetchYouTubeUploads, youtubeDurationSeconds } from '@/modules/library/adapters/youtube';
import { canonicalizeResourceUrl, metadataHash } from '@/modules/library/official-source';

describe('official resource URL normalization', () => {
  it('removes tracking without changing the content identity', () => {
    expect(canonicalizeResourceUrl('https://WWW.YouTube.com/watch?v=abc&utm_source=x&si=share#chapter')).toBe(
      'https://www.youtube.com/watch?v=abc',
    );
  });

  it('creates a stable metadata hash', () => {
    const resource = {
      externalId: 'abc',
      platform: 'youtube' as const,
      format: 'video' as const,
      title: 'Sauna basics',
      canonicalUrl: 'https://youtube.com/watch?v=abc&utm_source=a',
      metadata: { license: 'youtube' },
    };
    expect(metadataHash(resource)).toBe(metadataHash({ ...resource, canonicalUrl: 'https://youtube.com/watch?v=abc' }));
  });
});

describe('YouTube official channel adapter', () => {
  it('parses durations', () => {
    expect(youtubeDurationSeconds('PT1H2M3S')).toBe(3723);
    expect(youtubeDurationSeconds('PT12M')).toBe(720);
  });

  it('reads only public embeddable videos from the approved channel upload playlist', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ items: [{ contentDetails: { relatedPlaylists: { uploads: 'UUofficial' } } }] })),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ items: [{ contentDetails: { videoId: 'public' } }, { contentDetails: { videoId: 'private' } }] })),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            items: [
              {
                id: 'public',
                snippet: {
                  title: 'Official sauna lesson',
                  publishedAt: '2026-07-01T00:00:00Z',
                  thumbnails: { high: { url: 'https://img.youtube.com/public.jpg' } },
                },
                contentDetails: { duration: 'PT12M' },
                status: { privacyStatus: 'public', embeddable: true, license: 'youtube' },
              },
              {
                id: 'private',
                snippet: { title: 'Do not import' },
                status: { privacyStatus: 'private', embeddable: false },
              },
            ],
          }),
        ),
      );

    const result = await fetchYouTubeUploads({
      channelId: 'UCofficial',
      apiKey: 'test-key',
      fetcher: fetcher as unknown as typeof fetch,
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      externalId: 'public',
      platform: 'youtube',
      format: 'video',
      embedUrl: 'https://www.youtube-nocookie.com/embed/public',
      durationSeconds: 720,
    });
    expect(new URL(fetcher.mock.calls[0]![0] as URL).searchParams.get('id')).toBe('UCofficial');
  });
});

describe('official RSS adapter', () => {
  it('extracts metadata but never downloads or rehosts the audio enclosure', async () => {
    const xml = `<?xml version="1.0"?>
      <rss><channel><language>en-US</language><item>
        <guid>episode-101</guid>
        <title><![CDATA[Sauna Talk: Cultura y löyly]]></title>
        <link>https://official.example/episode-101?utm_source=feed</link>
        <pubDate>Tue, 21 Jul 2026 10:00:00 GMT</pubDate>
        <description>Una conversación oficial.</description>
        <itunes:duration>01:02:03</itunes:duration>
        <itunes:image href="https://official.example/cover.jpg" />
        <enclosure url="https://cdn.example/audio.mp3" type="audio/mpeg" />
      </item></channel></rss>`;
    const fetcher = vi.fn().mockResolvedValue(new Response(xml));

    const result = await fetchOfficialFeed({
      feedUrl: 'https://official.example/feed.xml',
      format: 'podcast_episode',
      fetcher: fetcher as unknown as typeof fetch,
    });

    expect(result[0]).toMatchObject({
      externalId: 'episode-101',
      title: 'Sauna Talk: Cultura y löyly',
      format: 'podcast_episode',
      language: 'en',
      durationSeconds: 3723,
      thumbnailUrl: 'https://official.example/cover.jpg',
    });
    expect(result[0]?.metadata.enclosureUrl).toBe('https://cdn.example/audio.mp3');
    expect(result[0]).not.toHaveProperty('audio');
  });
});
