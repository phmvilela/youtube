import { useState, useCallback, useRef } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { getAuth } from 'firebase/auth';
import { appConfig } from '../services/firebase';
import {
  Box, Typography, Button, Paper, AppBar, Toolbar, IconButton, Container,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import StopIcon from '@mui/icons-material/Stop';
import UserMenu from '../components/UserMenu';

export default function StreamDemo() {
  const [lines, setLines] = useState<string[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const handleStream = useCallback(async () => {
    setLines([]);
    setIsStreaming(true);

    const auth = getAuth();
    const idToken = await auth.currentUser?.getIdToken();
    if (!idToken) {
      setLines(['Error: Not authenticated']);
      setIsStreaming(false);
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch(appConfig.cloudRunStreamUrl, {
        headers: { Authorization: `Bearer ${idToken}` },
        signal: controller.signal,
      });

      if (!res.ok) {
        setLines([`Error: ${res.status} ${res.statusText}`]);
        setIsStreaming(false);
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) {
        setLines(['Error: No readable stream']);
        setIsStreaming(false);
        return;
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n');
        // Keep the last incomplete chunk in the buffer
        buffer = parts.pop() ?? '';

        setLines((prev) => [...prev, ...parts.filter((p) => p.length > 0)]);
      }

      // Flush remaining buffer
      if (buffer.length > 0) {
        setLines((prev) => [...prev, buffer]);
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setLines((prev) => [...prev, `Error: ${(err as Error).message}`]);
      }
    } finally {
      abortRef.current = null;
      setIsStreaming(false);
    }
  }, []);

  const handleStop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return (
    <Box sx={{ pb: 8 }}>
      <AppBar position="static" color="transparent" elevation={0}>
        <Toolbar>
          <IconButton edge="start" component={RouterLink} to="/" color="inherit" aria-label="back to search" sx={{ mr: 2 }}>
            <ArrowBackIcon />
          </IconButton>
          <Typography variant="h5" component="h1" fontWeight="bold" sx={{ flexGrow: 1 }}>
            Stream Demo
          </Typography>
          <UserMenu />
        </Toolbar>
      </AppBar>

      <Container maxWidth="md" sx={{ mt: 4 }}>
        <Typography variant="h4" component="h2" gutterBottom>
          Cloud Run Function - HTTP Stream
        </Typography>
        <Typography color="text.secondary" sx={{ mb: 3 }}>
          Streams the contents of a server-side file line by line via a Cloud Run Function.
        </Typography>

        <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
          <Button
            variant="contained"
            startIcon={<PlayArrowIcon />}
            onClick={handleStream}
            disabled={isStreaming}
          >
            {isStreaming ? 'Streaming...' : 'Start Stream'}
          </Button>
          {isStreaming && (
            <Button
              variant="outlined"
              color="error"
              startIcon={<StopIcon />}
              onClick={handleStop}
            >
              Stop
            </Button>
          )}
        </Box>

        {lines.length > 0 && (
          <Paper
            variant="outlined"
            sx={{
              p: 2,
              maxHeight: 500,
              overflow: 'auto',
              fontFamily: 'monospace',
              fontSize: '0.875rem',
              bgcolor: 'background.default',
            }}
          >
            {lines.map((line, i) => (
              <Box
                key={i}
                sx={{
                  py: 0.5,
                  borderBottom: '1px solid',
                  borderColor: 'divider',
                  animation: 'fadeIn 0.3s ease-in',
                  '@keyframes fadeIn': {
                    from: { opacity: 0, transform: 'translateY(4px)' },
                    to: { opacity: 1, transform: 'translateY(0)' },
                  },
                }}
              >
                <Typography
                  component="span"
                  sx={{ color: 'text.secondary', mr: 2, fontFamily: 'monospace', fontSize: '0.75rem' }}
                >
                  {String(i + 1).padStart(2, '0')}
                </Typography>
                {line}
              </Box>
            ))}
          </Paper>
        )}
      </Container>
    </Box>
  );
}
