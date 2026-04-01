import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate, Link as RouterLink } from 'react-router-dom';
import { collection, getDocs, query, where, onSnapshot } from "firebase/firestore";
import { db, appConfig } from '../config/firebase';
import { useAuth } from '../contexts/AuthContext';
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
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import UserMenu from '../components/UserMenu';

interface SyncedVideo {
  videoId: string;
  title: string;
  channelName: string;
  channelId: string;
  publishedAt: string;
  thumbnail?: string;
  searchWords?: string[];
}

export default function Search() {
  const [queryText, setQueryText] = useState('');
  const [results, setResults] = useState<SyncedVideo[]>([]);
  const [deletedChannelIds, setDeletedChannelIds] = useState<Set<string>>(new Set());
  const navigate = useNavigate();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const videoRefs = useRef<(HTMLElement | null)[]>([]);
  const { user } = useAuth();

  // Listen for soft-deleted channels to exclude from search results
  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, 'users', user.uid, 'allowed_channels'),
      where('status', '==', 'deleted')
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const ids = new Set<string>();
      snapshot.forEach((doc) => ids.add(doc.id));
      setDeletedChannelIds(ids);
    });
    return () => unsubscribe();
  }, [user]);

  const handleSearch = async (searchQuery: string) => {
    if (!searchQuery.trim() || !user) {
      setResults([]);
      return;
    }

    const queryWords = searchQuery.toLowerCase().split(/\W+/).filter(Boolean);
    if (!queryWords.length) {
      setResults([]);
      return;
    }

    try {
      const searchTerms = queryWords.slice(0, 10);
      const q = query(
        collection(db, 'users', user.uid, appConfig.collectionName),
        where('searchWords', 'array-contains-any', searchTerms)
      );

      const querySnapshot = await getDocs(q);
      const videos: SyncedVideo[] = [];
      querySnapshot.forEach((docSnap) => {
        const video = docSnap.data() as SyncedVideo;
        if (!deletedChannelIds.has(video.channelId)) {
          videos.push(video);
        }
      });

      // Rank based on words (and secondary, on letters) that search terms matches
      const rankedVideos = videos.map(video => {
        const videoWords = video.searchWords || [];
        let wordMatches = 0;
        let letterMatches = 0;

        queryWords.forEach(qw => {
          if (videoWords.includes(qw)) {
            wordMatches++;
            letterMatches += qw.length;
          } else {
            const partialMatch = videoWords.find(vw => vw.includes(qw));
            if (partialMatch) {
              letterMatches += qw.length;
            }
          }
        });

        return { video, wordMatches, letterMatches };
      });

      rankedVideos.sort((a, b) => {
        if (b.wordMatches !== a.wordMatches) {
          return b.wordMatches - a.wordMatches; // primary: word matches
        }
        return b.letterMatches - a.letterMatches; // secondary: letter matches
      });

      setResults(rankedVideos.map(r => r.video));
    } catch (err) {
      console.error("Failed to search videos from Firestore:", err);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSearch(queryText);
  };

  const gridRef = useRef<HTMLDivElement>(null);

  // Compute visible columns from the grid layout for keyboard navigation
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
                  fontSize: '0.85rem'
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
        <Toolbar sx={{ justifyContent: 'space-between' }}>
          <Typography variant="h5" component="h1" fontWeight="bold">
            YouTube Offline
          </Typography>
          <UserMenu />
        </Toolbar>
      </AppBar>

      <Container maxWidth={false}>
        <Box sx={{ mb: 4, mt: 2, textAlign: 'center' }}>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            Press <strong>Shift+S</strong> on your remote to focus the search box.
          </Typography>

          <Box component="form" onSubmit={handleSubmit} sx={{ display: 'flex', justifyContent: 'center', gap: 1, mt: 2 }}>
            <TextField
              inputRef={searchInputRef}
              variant="outlined"
              placeholder="Search offline videos..."
              value={queryText}
              onChange={(e) => setQueryText(e.target.value)}
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

        {results.length === 0 && queryText && (
          <Paper sx={{ p: 4, textAlign: 'center', bgcolor: 'background.paper', borderRadius: 2 }}>
            <Typography variant="h6" gutterBottom>No matches found</Typography>
            <Typography variant="body1" color="text.secondary">
              Try a different search term or sync videos in the <RouterLink to="/admin" style={{ color: 'inherit' }}>Content Management</RouterLink>.
            </Typography>
          </Paper>
        )}

        {results.length === 0 && !queryText && (
          <Paper sx={{ p: 4, textAlign: 'center', bgcolor: 'background.paper', borderRadius: 2 }}>
            <Typography variant="h6" gutterBottom>Ready to search</Typography>
            <Typography variant="body1" color="text.secondary">
              Please enter a query above. Make sure you have synced videos in the <RouterLink to="/admin" style={{ color: 'inherit' }}>Content Management</RouterLink>.
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
