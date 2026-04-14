import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, Link as RouterLink } from 'react-router-dom';
import { getAuth } from 'firebase/auth';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
import { appConfig } from '../services/firebase';
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
  LinearProgress,
} from '@mui/material';
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

const FLUSH_INTERVAL_MS = 150;
const ROW_HEIGHT_ESTIMATE = 230;
const VIRTUALIZER_OVERSCAN = 3;

function getMinCardWidth(): number {
  const vw = window.innerWidth;
  if (vw >= 1536) return 280;
  if (vw >= 1200) return 240;
  if (vw >= 900) return 220;
  if (vw >= 600) return 200;
  return 160;
}

export default function Search() {
  const [queryText, setQueryText] = useState('');
  const [results, setResults] = useState<VideoResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [progress, setProgress] = useState<SearchProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [columnCount, setColumnCount] = useState(4);

  const abortRef = useRef<AbortController | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const gridContainerRef = useRef<HTMLDivElement>(null);
  const bufferRef = useRef<VideoResult[]>([]);
  const flushTimerRef = useRef<number | null>(null);
  const focusedIndexRef = useRef<number>(-1);
  const hasFocusedRef = useRef(false);

  const navigate = useNavigate();

  // --- Batching helpers ---

  const flushBuffer = useCallback(() => {
    if (flushTimerRef.current) {
      clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }
    if (bufferRef.current.length > 0) {
      const batch = bufferRef.current;
      bufferRef.current = [];
      setResults(prev => [...prev, ...batch]);
    }
  }, []);

  const clearBuffer = useCallback(() => {
    bufferRef.current = [];
    if (flushTimerRef.current) {
      clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }
  }, []);

  const bufferResult = useCallback((video: VideoResult) => {
    bufferRef.current.push(video);
    if (!flushTimerRef.current) {
      flushTimerRef.current = window.setTimeout(flushBuffer, FLUSH_INTERVAL_MS);
    }
  }, [flushBuffer]);

  // --- Column count via ResizeObserver ---

  useEffect(() => {
    const el = gridContainerRef.current;
    if (!el) return;

    const computeColumns = () => {
      const width = el.clientWidth;
      const minWidth = getMinCardWidth();
      const gap = 16; // MUI spacing(2)
      setColumnCount(Math.max(1, Math.floor((width + gap) / (minWidth + gap))));
    };

    computeColumns();
    const observer = new ResizeObserver(computeColumns);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // --- Virtualizer ---

  const rowCount = Math.ceil(results.length / columnCount);

  const virtualizer = useWindowVirtualizer({
    count: rowCount,
    estimateSize: () => ROW_HEIGHT_ESTIMATE,
    overscan: VIRTUALIZER_OVERSCAN,
    scrollMargin: gridContainerRef.current?.offsetTop ?? 0,
  });

  // --- Streaming search ---

  const handleSearch = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim()) return;

    abortRef.current?.abort();

    setResults([]);
    setError(null);
    setProgress(null);
    setIsSearching(true);
    setHasSearched(true);
    hasFocusedRef.current = false;
    focusedIndexRef.current = -1;
    clearBuffer();

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
              bufferResult(event as VideoResult);
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

      // Flush remaining NDJSON buffer
      if (buffer.trim()) {
        try {
          const event = JSON.parse(buffer);
          if (event.type === 'video') {
            bufferResult(event as VideoResult);
          } else {
            setProgress(event as SearchProgress);
          }
        } catch { /* ignore */ }
      }

      // Flush remaining batched results
      flushBuffer();
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        clearBuffer();
      } else {
        flushBuffer();
        setError((err as Error).message);
      }
    } finally {
      abortRef.current = null;
      setIsSearching(false);
    }
  }, [bufferResult, flushBuffer, clearBuffer]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSearch(queryText);
  };

  // --- Keyboard navigation ---

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === '0' || event.keyCode === 48 || event.keyCode === 10009 || (event.key.toLowerCase() === 's' && event.shiftKey)) {
        event.preventDefault();
        searchInputRef.current?.focus();
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }

      const index = focusedIndexRef.current;
      if (index === -1) return;

      let newIndex = index;
      switch (event.key) {
        case 'ArrowRight':
          newIndex = Math.min(index + 1, results.length - 1);
          break;
        case 'ArrowLeft':
          newIndex = Math.max(index - 1, 0);
          break;
        case 'ArrowDown':
          newIndex = Math.min(index + columnCount, results.length - 1);
          break;
        case 'ArrowUp':
          newIndex = Math.max(index - columnCount, 0);
          break;
        case 'Enter':
          if (results[index]) navigate(`/watch/${results[index].videoId}`);
          return;
        default:
          return;
      }

      if (newIndex !== index) {
        event.preventDefault();
        focusedIndexRef.current = newIndex;
        const targetRow = Math.floor(newIndex / columnCount);
        virtualizer.scrollToIndex(targetRow, { align: 'auto' });
        requestAnimationFrame(() => {
          const el = document.querySelector(`[data-video-index="${newIndex}"]`) as HTMLElement;
          el?.focus();
        });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [results, columnCount, virtualizer, navigate]);

  // Auto-focus first result once per search
  useEffect(() => {
    if (results.length > 0 && !hasFocusedRef.current) {
      hasFocusedRef.current = true;
      focusedIndexRef.current = 0;
      requestAnimationFrame(() => {
        const el = document.querySelector('[data-video-index="0"]') as HTMLElement;
        el?.focus();
      });
    }
  }, [results]);

  // --- Progress display ---

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

  // --- Render ---

  const virtualItems = virtualizer.getVirtualItems();

  return (
    <Box sx={{ pb: 8 }}>
      <AppBar position="static" color="transparent" elevation={0}>
        <Toolbar sx={{ justifyContent: 'space-between' }}>
          <Typography variant="h5" component="h1" fontWeight="bold">
            FamilyTube
          </Typography>
          <UserMenu />
        </Toolbar>
      </AppBar>

      <Container maxWidth={false}>
        <Box sx={{ mb: 4, mt: 2, textAlign: 'center' }}>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            Press <strong>Shift+S</strong> to focus the search box.
          </Typography>

          <Box component="form" onSubmit={handleSubmit} sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 1, mt: 2 }}>
            <TextField
              inputRef={searchInputRef}
              variant="outlined"
              placeholder="Search videos..."
              value={queryText}
              onChange={(e) => setQueryText(e.target.value)}
              required
              size="small"
              sx={{ width: { xs: '100%', sm: 400 } }}
              InputProps={{
                startAdornment: <SearchIcon color="action" sx={{ mr: 1 }} />
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

        <div ref={gridContainerRef} id="results-container">
          {results.length > 0 && (
            <div style={{ height: virtualizer.getTotalSize(), position: 'relative', width: '100%' }}>
              {virtualItems.map((virtualRow) => {
                const startIdx = virtualRow.index * columnCount;
                const rowItems = results.slice(startIdx, startIdx + columnCount);
                return (
                  <div
                    key={virtualRow.key}
                    data-index={virtualRow.index}
                    ref={virtualizer.measureElement}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      transform: `translateY(${virtualRow.start - (virtualizer.options.scrollMargin ?? 0)}px)`,
                    }}
                  >
                    <Box sx={{
                      display: 'grid',
                      gridTemplateColumns: `repeat(${columnCount}, 1fr)`,
                      gap: 2,
                      pb: 2,
                    }}>
                      {rowItems.map((item, colIdx) => {
                        const absoluteIdx = startIdx + colIdx;
                        return (
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
                              onFocus={() => { focusedIndexRef.current = absoluteIdx; }}
                              data-video-index={absoluteIdx}
                              sx={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'flex-start' }}
                            >
                              {item.thumbnail ? (
                                <CardMedia
                                  component="img"
                                  image={item.thumbnail}
                                  alt={item.title}
                                  loading="lazy"
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
                        );
                      })}
                    </Box>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Container>
    </Box>
  );
}
