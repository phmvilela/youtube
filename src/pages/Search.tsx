import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

const API_KEY = 'AIzaSyAA5ffcNmPla6nq0WzTu265jUprHJUw9HM';
const CHANNELS = [
  { id: 'UCLsooMJoIpl_7ux2jvdPB-Q', title: 'Channel A (UCLsooMJo...)' },
  { id: 'UCMgbJL73cGG3TxmYafJw5hA', title: 'Channel B (UCMgbJL7...)' }
];
const MAX_RESULTS = 15;
const COLUMNS = 8;

interface VideoItem {
  id: { videoId: string };
  snippet: {
    title: string;
    thumbnails: {
      medium: { url: string };
    };
  };
}

interface ChannelResults {
  channel: { id: string; title: string };
  items: VideoItem[];
}

export default function Search() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ChannelResults[]>([]);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const videoRefs = useRef<(HTMLAnchorElement | null)[]>([]);

  const [error, setError] = useState<string | null>(null);

  const searchAllChannels = async (searchQuery: string) => {
    setLoading(true);
    setError(null);
    try {
      const promises = CHANNELS.map(async (channel) => {
        const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=${MAX_RESULTS}&q=${encodeURIComponent(searchQuery)}&channelId=${channel.id}&key=${API_KEY}`;
        const res = await fetch(url);
        const data = await res.json();
        
        if (data.error) {
          throw new Error(data.error.message || 'YouTube API Error');
        }
        
        return { channel, items: data.items || [] };
      });

      const searchResults = await Promise.all(promises);
      setResults(searchResults);
    } catch (err: any) {
      console.error('Search failed:', err);
      setError(err.message || 'An unknown error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      searchAllChannels(query);
    }
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const current = document.activeElement;
      const index = videoRefs.current.indexOf(current as HTMLAnchorElement);

      if (event.key === '0' || event.keyCode === 48 || event.keyCode === 10009) {
        searchInputRef.current?.focus();
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }

      if (index === -1) return;

      switch (event.key) {
        case 'ArrowRight':
          videoRefs.current[index + 1]?.focus();
          break;
        case 'ArrowLeft':
          videoRefs.current[index - 1]?.focus();
          break;
        case 'ArrowDown':
          videoRefs.current[index + COLUMNS]?.focus();
          break;
        case 'ArrowUp':
          videoRefs.current[index - COLUMNS]?.focus();
          break;
        case 'Enter':
          videoRefs.current[index]?.click();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [results]);

  useEffect(() => {
    if (results.length > 0 && videoRefs.current[0]) {
      videoRefs.current[0].focus();
    }
  }, [results]);

  return (
    <div className="search-page" style={{ padding: '20px' }}>
      <h1>YouTube Multi-Channel Search</h1>
      <div className="hint" style={{ fontSize: '14px', color: '#666', marginBottom: '10px' }}>
        Press <strong>0</strong> on your remote to focus the search box
      </div>

      <form onSubmit={handleSubmit} style={{ marginBottom: '30px' }}>
        <input
          ref={searchInputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search videos..."
          required
          style={{ padding: '8px', width: '300px', fontSize: '16px', border: '2px solid #ccc', borderRadius: '6px' }}
        />
        <button type="submit" style={{ padding: '8px 12px', fontSize: '16px' }}>Search</button>
      </form>

      {loading && <p>Loading...</p>}
      {error && (
        <div style={{ color: 'red', padding: '20px', border: '1px solid red', borderRadius: '6px', marginBottom: '20px', backgroundColor: '#fff5f5' }}>
          <strong>Error:</strong> {error}
        </div>
      )}

      <div id="results-container">
        {results.map((res, channelIdx) => (
          <div key={res.channel.id} className="channel-section" style={{ marginBottom: '50px' }}>
            <h2>{res.channel.title}</h2>
            <div className="video-list" style={{ display: 'grid', gridTemplateColumns: `repeat(${COLUMNS}, 1fr)`, gap: '16px' }}>
              {res.items.map((item, videoIdx) => {
                const globalIdx = results.slice(0, channelIdx).reduce((acc, curr) => acc + curr.items.length, 0) + videoIdx;
                return (
                  <a
                    key={item.id.videoId}
                    href={`/watch/${item.id.videoId}`}
                    className="video-card"
                    tabIndex={0}
                    onClick={(e) => {
                      e.preventDefault();
                      navigate(`/watch/${item.id.videoId}`);
                    }}
                    ref={(el) => (videoRefs.current[globalIdx] = el)}
                    style={{ display: 'block', textAlign: 'center', textDecoration: 'none', color: '#333', fontWeight: 'bold', borderRadius: '8px' }}
                  >
                    <img src={item.snippet.thumbnails.medium.url} alt={item.snippet.title} style={{ width: '100%', borderRadius: '8px' }} />
                    <div style={{ fontSize: '12px', marginTop: '5px' }}>{item.snippet.title}</div>
                  </a>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <style>{`
        .video-card:focus {
          outline: 4px solid #2196f3;
          background-color: #eef6ff;
        }
      `}</style>
    </div>
  );
}
