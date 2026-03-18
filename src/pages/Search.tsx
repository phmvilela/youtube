import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link as RouterLink } from 'react-router-dom';
import { useApiKey } from '../hooks/useApiKey';
import ApiKeyModal from '../components/ApiKeyModal';
import FlexSearch from 'flexsearch';
import {
  Container,
  Typography,
  TextField,
  Button,
  Box,
  Card,
  CardMedia,
  CardContent,
  CardActionArea,
  AppBar,
  Toolbar,
  Paper,
  IconButton
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import SettingsIcon from '@mui/icons-material/Settings';

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
  const videoRefs = useRef<(HTMLElement | null)[]>([]);

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
    if (!searchIndex || !searchQuery.trim()) {
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
      const index = videoRefs.current.indexOf(current as HTMLElement);

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
    <Box sx={{ pb: 8 }}>
      <AppBar position="static" color="transparent" elevation={0}>
        <Toolbar sx={{ justifyContent: 'space-between' }}>
          <Typography variant="h5" component="h1" fontWeight="bold">
            YouTube Offline
          </Typography>
          <IconButton component={RouterLink} to="/admin" color="inherit" aria-label="admin">
            <SettingsIcon />
          </IconButton>
        </Toolbar>
      </AppBar>

      <Container maxWidth={false}>
        <Box sx={{ mb: 4, mt: 2, textAlign: 'center' }}>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            Press <strong>0</strong> on your remote to focus the search box. Searching local copy.
          </Typography>

          <Box component="form" onSubmit={handleSubmit} sx={{ display: 'flex', justifyContent: 'center', gap: 1, mt: 2 }}>
            <TextField
              inputRef={searchInputRef}
              variant="outlined"
              placeholder="Search offline videos..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              required
              size="small"
              sx={{ width: { xs: '100%', sm: 400 } }}
              InputProps={{
                startAdornment: <SearchIcon color="action" sx={{ mr: 1 }} />
              }}
            />
            <Button variant="contained" type="submit" size="large" disableElevation>
              Search
            </Button>
          </Box>
        </Box>

        {results.length === 0 && query && (
          <Paper sx={{ p: 4, textAlign: 'center', bgcolor: 'background.paper', borderRadius: 2 }}>
            <Typography variant="h6" gutterBottom>No matches found</Typography>
            <Typography variant="body1" color="text.secondary">
              Try a different search term or sync videos in the <RouterLink to="/admin" style={{ color: 'inherit' }}>Admin Page</RouterLink>.
            </Typography>
          </Paper>
        )}

        {results.length === 0 && !query && (
          <Paper sx={{ p: 4, textAlign: 'center', bgcolor: 'background.paper', borderRadius: 2 }}>
            <Typography variant="h6" gutterBottom>Ready to search</Typography>
            <Typography variant="body1" color="text.secondary">
              Please enter a query above. Make sure you have synced videos in the <RouterLink to="/admin" style={{ color: 'inherit' }}>Admin Page</RouterLink>.
            </Typography>
          </Paper>
        )}

        <Box id="results-container">
          {results.map((res, channelIdx) => (
            <Box key={res.channelName} sx={{ mb: 6 }}>
              <Typography variant="h6" component="h2" sx={{ mb: 2, fontWeight: 'bold' }}>
                {res.channelName}
              </Typography>
              <Box sx={{ 
                display: 'grid', 
                gridTemplateColumns: `repeat(${COLUMNS}, 1fr)`, 
                gap: 2 
              }}>
                {res.items.map((item, videoIdx) => {
                  const globalIdx = results.slice(0, channelIdx).reduce((acc, curr) => acc + curr.items.length, 0) + videoIdx;
                  return (
                    <Card 
                      key={item.videoId} 
                      sx={{ 
                        height: '100%', 
                        display: 'flex', 
                        flexDirection: 'column',
                        '&:focus-within': {
                          outline: '4px solid #3ea6ff',
                        }
                      }}
                    >
                      <CardActionArea 
                        component="a"
                        href={`/watch/${item.videoId}`}
                        onClick={(e: React.MouseEvent) => {
                          e.preventDefault();
                          navigate(`/watch/${item.videoId}`);
                        }}
                        ref={(el: any) => (videoRefs.current[globalIdx] = el)}
                        sx={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'flex-start' }}
                      >
                        {item.thumbnail ? (
                          <CardMedia
                            component="img"
                            image={item.thumbnail}
                            alt={item.title}
                            sx={{ aspectRatio: '16/9', objectFit: 'cover' }}
                          />
                        ) : (
                          <Box sx={{ width: '100%', aspectRatio: '16/9', bgcolor: 'grey.800', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Typography variant="caption" color="text.secondary">No Thumbnail</Typography>
                          </Box>
                        )}
                        <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                          <Typography variant="body2" component="div" sx={{ 
                            display: '-webkit-box', 
                            WebkitLineClamp: 2, 
                            WebkitBoxOrient: 'vertical', 
                            overflow: 'hidden',
                            fontWeight: 500,
                            lineHeight: 1.2,
                            fontSize: '0.85rem'
                          }}>
                            {item.title}
                          </Typography>
                        </CardContent>
                      </CardActionArea>
                    </Card>
                  );
                })}
              </Box>
            </Box>
          ))}
        </Box>
      </Container>
    </Box>
  );
}
