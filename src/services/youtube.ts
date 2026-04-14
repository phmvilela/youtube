import type { Channel } from './firestore';

const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';

/**
 * Search YouTube for channels matching a query string.
 * Calls the YouTube Data API directly using the user's OAuth access token.
 */
export async function searchYouTubeChannels(query: string, accessToken: string): Promise<Channel[]> {
  const params = new URLSearchParams({
    part: 'snippet',
    q: query,
    type: 'channel',
    maxResults: '10',
  });

  const res = await fetch(`${YOUTUBE_API_BASE}/search?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    throw new Error(`YouTube API search failed (HTTP ${res.status}): ${await res.text()}`);
  }

  const data = await res.json();

  return (data.items || []).map((item: any) => ({
    id: item.snippet.channelId,
    name: item.snippet.channelTitle,
    thumbnail: item.snippet.thumbnails?.default?.url ?? '',
  }));
}
