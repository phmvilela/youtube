import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate, Link as RouterLink } from 'react-router-dom';
import { getAuth } from 'firebase/auth';
import { appConfig } from '../services/firebase';
import {
  Box, Typography, TextField, Button, Paper, AppBar, Toolbar, IconButton,
  Container, Card, CardMedia, CardContent, CardActionArea, LinearProgress,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SearchIcon from '@mui/icons-material/Search';
import UserMenu from '../components/UserMenu';

interface VideoResult {
  videoId: string;
  title: string;
  channelName: string;
  channelId: string;
  publishedAt: string;
  thumbnail: string;
}

interface SearchProgress {
  status: string;
  searched?: number;
  total?: number;
  matchesSoFar?: number;
  channels?: number;
}

export default function StreamDemo() {
  const [queryText, setQueryText] = useState('');
  const [results, setResults] = useState<VideoResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [progress, setProgress] = useState<SearchProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const videoRefs = useRef<(HTMLElement | null)[]>([]);
  const gridRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const handleSearch = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim()) return;

    // Abort any in-flight search
    abortRef.current?.abort();

    setResults([]);
    setError(null);
    setProgress(null);
    setIsSearching(true);
    setHasSearched(true);

    const auth = getAuth();
    const idToken = await auth.currentUser?.getIdToken();
    if (!idToken) {
      setError('Not authenticated');
      setIsSearching(false);
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const url = `${appConfig.cloudRunSearchUrl}?q=${encodeURIComponent(searchQuery)}`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${idToken}` },
        signal: controller.signal,
      });

      if (!res.ok) {
        setError(`Error: ${res.status} ${res.statusText}`);
        setIsSearching(false);
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) {
        setError('No readable stream');
        setIsSearching(false);
        return;
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const event = JSON.parse(line);
            if (event.type === 'video') {
              setResults(prev => [...prev, event as VideoResult]);
            } else if (event.error) {
              setError(event.error);
            } else {
              setProgress(event as SearchProgress);
            }
          } catch {
            // skip malformed lines
          }
        }
      }

      // Flush remaining
      if (buffer.trim()) {
        try {
          const event = JSON.parse(buffer);
          if (event.type === 'video') {
            setResults(prev => [...prev, event as VideoResult]);
          } else {
            setProgress(event as SearchProgress);
          }
        } catch { /* ignore */ }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setError((err as Error).message);
      }
    } finally {
      abortRef.current = null;
      setIsSearching(false);
    }
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSearch(queryText);
  };

  const getColumns = () => {
    if (!gridRef.current) return 1;
    const style = window.getComputedStyle(gridRef.current);
    return style.gridTemplateColumns.split(' ').length;
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const current = document.activeElement;
      const index = videoRefs.current.indexOf(current as HTMLElement);

      if (event.key === '0' || event.keyCode === 48 || event.keyCode === 10009 || (event.key.toLowerCase() === 's' && event.shiftKey)) {
        event.preventDefault();
        searchInputRef.current?.focus();
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }

      if (index === -1) return;

      const cols = getColumns();
      switch (event.key) {
        case 'ArrowRight':
          videoRefs.current[index + 1]?.focus();
          break;
        case 'ArrowLeft':
          videoRefs.current[index - 1]?.focus();
          break;
        case 'ArrowDown':
          videoRefs.current[index + cols]?.focus();
          break;
        case 'ArrowUp':
          videoRefs.current[index - cols]?.focus();
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

  const progressPercent = progress?.searched && progress?.total
    ? (progress.searched / progress.total) * 100
    : 0;

  const statusMessage = (() => {
    if (!progress) return null;
    switch (progress.status) {
      case 'loading_channels': return 'Loading channels...';
      case 'no_channels': return 'No channels found. Add channels in Content Management.';
      case 'searching': return `Searching across ${progress.channels} channels...`;
      case 'progress': return `Searched ${progress.searched}/${progress.total} channels (${progress.matchesSoFar} matches)`;
      case 'done': return null;
      default: return null;
    }
  })();

  const renderedResults = useMemo(() => {
    videoRefs.current = [];
    return (
      <Box
        ref={gridRef}
        sx={{
          display: 'grid',
          gridTemplateColumns: {
            xs: 'repeat(auto-fill, minmax(160px, 1fr))',
            sm: 'repeat(auto-fill, minmax(200px, 1fr))',
            md: 'repeat(auto-fill, minmax(220px, 1fr))',
            lg: 'repeat(auto-fill, minmax(240px, 1fr))',
            xl: 'repeat(auto-fill, minmax(280px, 1fr))',
          },
          gap: 2,
        }}
      >
        {results.map((item, idx) => (
          <Card
            key={item.videoId}
            sx={{
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              '&:focus-within': { outline: '4px solid #3ea6ff' },
            }}
          >
            <CardActionArea
              component="a"
              href={`/watch/${item.videoId}`}
              onClick={(e: React.MouseEvent) => {
                e.preventDefault();
                navigate(`/watch/${item.videoId}`);
              }}
              ref={(el: any) => (videoRefs.current[idx] = el)}
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
                  fontSize: '0.85rem',
                }}>
                  {item.title}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                  {item.channelName}
                </Typography>
              </CardContent>
            </CardActionArea>
          </Card>
        ))}
      </Box>
    );
  }, [results, navigate]);

  return (
    <Box sx={{ pb: 8 }}>
      <AppBar position="static" color="transparent" elevation={0}>
        <Toolbar>
          <IconButton edge="start" component={RouterLink} to="/" color="inherit" aria-label="back to search" sx={{ mr: 2 }}>
            <ArrowBackIcon />
          </IconButton>
          <Typography variant="h5" component="h1" fontWeight="bold" sx={{ flexGrow: 1 }}>
            GCS Search
          </Typography>
          <UserMenu />
        </Toolbar>
      </AppBar>

      <Container maxWidth={false}>
        <Box sx={{ mb: 4, mt: 2, textAlign: 'center' }}>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            Search videos from GCS protobuf storage. Press <strong>Shift+S</strong> to focus search.
          </Typography>

          <Box component="form" onSubmit={handleSubmit} sx={{ display: 'flex', justifyContent: 'center', gap: 1, mt: 2 }}>
            <TextField
              inputRef={searchInputRef}
              variant="outlined"
              placeholder="Search GCS videos..."
              value={queryText}
              onChange={(e) => setQueryText(e.target.value)}
              required
              size="small"
              sx={{ width: { xs: '100%', sm: 400 } }}
              InputProps={{
                startAdornment: <SearchIcon color="action" sx={{ mr: 1 }} />,
              }}
            />
            <Button variant="contained" type="submit" size="large" disableElevation disabled={isSearching}>
              {isSearching ? 'Searching...' : 'Search'}
            </Button>
          </Box>
        </Box>

        {(isSearching || statusMessage) && (
          <Box sx={{ mb: 3, textAlign: 'center' }}>
            {statusMessage && (
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                {statusMessage}
              </Typography>
            )}
            {isSearching && progress?.status === 'progress' && (
              <LinearProgress variant="determinate" value={progressPercent} sx={{ maxWidth: 400, mx: 'auto' }} />
            )}
            {isSearching && progress?.status !== 'progress' && (
              <LinearProgress sx={{ maxWidth: 400, mx: 'auto' }} />
            )}
          </Box>
        )}

        {error && (
          <Paper sx={{ p: 3, textAlign: 'center', bgcolor: 'background.paper', borderRadius: 2, mb: 3 }}>
            <Typography color="error">{error}</Typography>
          </Paper>
        )}

        {results.length === 0 && !isSearching && hasSearched && !error && (
          <Paper sx={{ p: 4, textAlign: 'center', bgcolor: 'background.paper', borderRadius: 2 }}>
            <Typography variant="h6" gutterBottom>No matches found</Typography>
            <Typography variant="body1" color="text.secondary">
              Try a different search term or sync videos in the <RouterLink to="/admin" style={{ color: 'inherit' }}>Content Management</RouterLink>.
            </Typography>
          </Paper>
        )}

        {results.length === 0 && !isSearching && !hasSearched && (
          <Paper sx={{ p: 4, textAlign: 'center', bgcolor: 'background.paper', borderRadius: 2 }}>
            <Typography variant="h6" gutterBottom>Ready to search</Typography>
            <Typography variant="body1" color="text.secondary">
              Searches video data stored in GCS (protobuf format) via a Go Cloud Run service.
            </Typography>
          </Paper>
        )}

        <Box id="results-container">
          {renderedResults}
        </Box>
      </Container>
    </Box>
  );
}
