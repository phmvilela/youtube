import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useApiKey } from '../hooks/useApiKey';
import ApiKeyModal from '../components/ApiKeyModal';
import FlexSearch from 'flexsearch';

const SYNCED_VIDEOS_STORAGE_KEY = 'synced-videos';
const COLUMNS = 8;

interface SyncedVideo {
  videoId: string;
  title: string;
  channelName: string;
  channelId: string;
  publishedAt: string;
  thumbnail?: string;
}

interface GroupedResults {
  channelName: string;
  items: SyncedVideo[];
}

export default function Search() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GroupedResults[]>([]);
  const [searchIndex, setSearchIndex] = useState<any>(null);
  const navigate = useNavigate();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const videoRefs = useRef<(HTMLAnchorElement | null)[]>([]);

  const { apiKey, saveApiKey } = useApiKey();

  useEffect(() => {
    const storedVideosStr = localStorage.getItem(SYNCED_VIDEOS_STORAGE_KEY);
    const indexDataStr = localStorage.getItem('flexsearch-index');
    
    if (storedVideosStr) {
      const doc = new FlexSearch.Document({
        document: {
          id: "videoId",
          index: ["title", "channelName"],
          store: true
        }
      });
      
      let indexLoaded = false;
      if (indexDataStr) {
        try {
          const indexData = JSON.parse(indexDataStr);
          for (const key of Object.keys(indexData)) {
            doc.import(key, indexData[key]);
          }
          indexLoaded = true;
        } catch (err) {
          console.error("Failed to load FlexSearch index:", err);
        }
      }
      
      if (!indexLoaded) {
        try {
          const allVideos = JSON.parse(storedVideosStr);
          for (const video of allVideos) {
            doc.add(video);
          }
        } catch (err) {
          console.error("Failed to build fallback index:", err);
        }
      }
      setSearchIndex(doc);
    }
  }, []);

  const handleSearch = (searchQuery: string) => {
    if (!searchIndex) {
      setResults([]);
      return;
    }

    if (!searchQuery.trim()) {
      setResults([]);
      return;
    }

    const searchResults = searchIndex.search(searchQuery, { enrich: true });
    
    const uniqueVideos = new Map<string, SyncedVideo>();
    for (const fieldResult of searchResults) {
      for (const item of fieldResult.result) {
        if (item.doc && !uniqueVideos.has(item.id)) {
          uniqueVideos.set(item.id as string, item.doc as SyncedVideo);
        }
      }
    }

    const filteredVideos = Array.from(uniqueVideos.values());

    // Group by channel
    const groupedMap: Record<string, SyncedVideo[]> = {};
    filteredVideos.forEach(video => {
      if (!groupedMap[video.channelName]) {
        groupedMap[video.channelName] = [];
      }
      groupedMap[video.channelName].push(video);
    });

    const groupedResults: GroupedResults[] = Object.keys(groupedMap).map(channelName => ({
      channelName,
      items: groupedMap[channelName]
    }));

    setResults(groupedResults);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSearch(query);
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

  if (!apiKey) {
    return <ApiKeyModal onSave={saveApiKey} />;
  }

  return (
    <div className="search-page" style={{ padding: '20px' }}>
      <div style={{ position: 'absolute', top: '20px', right: '20px' }}>
        <Link to="/admin" style={{ textDecoration: 'none', color: 'blue' }}>
          Admin
        </Link>
      </div>
      <h1>YouTube Offline Search</h1>
      <div className="hint" style={{ fontSize: '14px', color: '#666', marginBottom: '10px' }}>
        Press <strong>0</strong> on your remote to focus the search box. Searching local copy.
      </div>

      <form onSubmit={handleSubmit} style={{ marginBottom: '30px' }}>
        <input
          ref={searchInputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search offline videos..."
          required
          style={{ padding: '8px', width: '300px', fontSize: '16px', border: '2px solid #ccc', borderRadius: '6px' }}
        />
        <button type="submit" style={{ padding: '8px 12px', fontSize: '16px' }}>Search</button>
      </form>

      {results.length === 0 && query && (
        <div style={{ padding: '20px', backgroundColor: '#f0f0f0' }}>
          <h2>No matches found</h2>
          <p>Try a different search term or sync videos in the <Link to="/admin">Admin Page</Link>.</p>
        </div>
      )}

      {results.length === 0 && !query && (
        <div style={{ padding: '20px', backgroundColor: '#f0f0f0' }}>
          <h2>Ready to search</h2>
          <p>Please enter a query above. Make sure you have synced videos in the <Link to="/admin">Admin Page</Link>.</p>
        </div>
      )}

      <div id="results-container">
        {results.map((res, channelIdx) => (
          <div key={res.channelName} className="channel-section" style={{ marginBottom: '50px' }}>
            <h2>{res.channelName}</h2>
            <div className="video-list" style={{ display: 'grid', gridTemplateColumns: `repeat(${COLUMNS}, 1fr)`, gap: '16px' }}>
              {res.items.map((item, videoIdx) => {
                const globalIdx = results.slice(0, channelIdx).reduce((acc, curr) => acc + curr.items.length, 0) + videoIdx;
                return (
                  <a
                    key={item.videoId}
                    href={`/watch/${item.videoId}`}
                    className="video-card"
                    tabIndex={0}
                    onClick={(e) => {
                      e.preventDefault();
                      navigate(`/watch/${item.videoId}`);
                    }}
                    ref={(el) => (videoRefs.current[globalIdx] = el)}
                    style={{ display: 'block', textAlign: 'center', textDecoration: 'none', color: '#333', fontWeight: 'bold', borderRadius: '8px' }}
                  >
                    {item.thumbnail ? (
                        <img src={item.thumbnail} alt={item.title} style={{ width: '100%', borderRadius: '8px' }} />
                    ) : (
                        <div style={{ width: '100%', height: '100px', backgroundColor: '#ddd', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>No Thumbnail</div>
                    )}
                    <div style={{ fontSize: '12px', marginTop: '5px' }}>{item.title}</div>
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
