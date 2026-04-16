import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { Box, Button, IconButton, Tooltip, Typography } from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import ReplayIcon from '@mui/icons-material/Replay';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import FullscreenIcon from '@mui/icons-material/Fullscreen';
import FullscreenExitIcon from '@mui/icons-material/FullscreenExit';
import UserMenu from '../components/UserMenu';
import { useSearchCache, type VideoResult } from '../contexts/SearchCacheContext';

declare global {
  interface Window {
    onYouTubeIframeAPIReady: () => void;
    YT: typeof YT;
  }
}

const INACTIVITY_DELAY = 3000;
const LONG_PRESS_MS = 1200;

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <Box
      component="kbd"
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: 28,
        height: 28,
        px: 0.75,
        borderRadius: 1,
        bgcolor: 'rgba(255,255,255,0.08)',
        border: '1px solid rgba(255,255,255,0.16)',
        color: 'text.primary',
        fontSize: '0.8rem',
        fontFamily: 'inherit',
        fontWeight: 600,
        lineHeight: 1,
      }}
    >
      {children}
    </Box>
  );
}

function ShortcutHint({ keys, label }: { keys: string[]; label: string }) {
  return (
    <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
      {keys.map((k, i) => (
        <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
          {i > 0 && (
            <Typography variant="caption" color="text.secondary" sx={{ mx: 0.25 }}>
              /
            </Typography>
          )}
          <Kbd>{k}</Kbd>
        </span>
      ))}
      <Typography variant="caption" color="text.secondary" sx={{ ml: 0.25 }}>
        {label}
      </Typography>
    </Box>
  );
}

interface VideoThumbProps {
  video: VideoResult;
  isActive: boolean;
  thumbRef?: React.Ref<HTMLDivElement>;
  onSelect: () => void;
}

function VideoThumb({ video, isActive, thumbRef, onSelect }: VideoThumbProps) {
  const [progress, setProgress] = useState(0);
  const rafRef = useRef<number>(0);
  const startTimeRef = useRef(0);
  const pressedRef = useRef(false);
  const isTouchRef = useRef(false);

  const cancel = useCallback(() => {
    pressedRef.current = false;
    cancelAnimationFrame(rafRef.current);
    setProgress(0);
  }, []);

  const tick = useCallback(() => {
    if (!pressedRef.current) return;
    const elapsed = performance.now() - startTimeRef.current;
    const ratio = Math.min(elapsed / LONG_PRESS_MS, 1);
    setProgress(ratio);
    if (ratio >= 1) {
      pressedRef.current = false;
      onSelect();
    } else {
      rafRef.current = requestAnimationFrame(tick);
    }
  }, [onSelect]);

  const onTouchStart = useCallback(() => {
    isTouchRef.current = true;
    if (isActive) return;
    pressedRef.current = true;
    startTimeRef.current = performance.now();
    rafRef.current = requestAnimationFrame(tick);
  }, [isActive, tick]);

  useEffect(() => {
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  const pressing = progress > 0 && progress < 1;
  const degrees = Math.round(progress * 360);

  return (
    <Box
      ref={thumbRef}
      onClick={() => {
        // On touch devices, only the long-press triggers selection
        if (isTouchRef.current) {
          isTouchRef.current = false;
          return;
        }
        if (!isActive) onSelect();
      }}
      onTouchStart={onTouchStart}
      onTouchEnd={cancel}
      onTouchCancel={cancel}
      onTouchMove={cancel}
      sx={{
        position: 'relative',
        flexShrink: 0,
        width: { xs: 120, sm: 150 },
        cursor: isActive ? 'default' : 'pointer',
        borderRadius: 1,
        overflow: 'hidden',
        border: '2px solid',
        borderColor: isActive ? 'primary.main' : 'transparent',
        opacity: isActive ? 1 : pressing ? 1 : 0.6,
        transition: 'opacity 0.2s, border-color 0.2s',
        '&:hover': { opacity: 1 },
        // Disable context menu on long press
        WebkitTouchCallout: 'none',
        userSelect: 'none',
      }}
    >
      {/* Long-press ring overlay */}
      {pressing && (
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            zIndex: 2,
            borderRadius: 'inherit',
            pointerEvents: 'none',
            p: '3px',
            background: `conic-gradient(from 0deg, #ff0000 ${degrees}deg, rgba(255,255,255,0.2) ${degrees}deg)`,
            WebkitMask: 'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)',
            WebkitMaskComposite: 'xor',
            mask: 'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)',
            maskComposite: 'exclude',
          }}
        />
      )}
      <Box
        component="img"
        src={video.thumbnail}
        alt={video.title}
        loading="lazy"
        draggable={false}
        sx={{ width: '100%', aspectRatio: '16/9', objectFit: 'cover', display: 'block' }}
      />
      <Typography
        variant="caption"
        sx={{
          display: 'block',
          px: 0.5,
          py: 0.25,
          fontSize: '0.65rem',
          lineHeight: 1.2,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          bgcolor: isActive ? 'primary.main' : 'transparent',
          color: isActive ? 'primary.contrastText' : 'text.secondary',
        }}
      >
        {video.title}
      </Typography>
    </Box>
  );
}

export default function Watch() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const searchQuery = searchParams.get('q') ?? '';

  const goBack = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen();
    navigate(searchQuery ? `/?q=${encodeURIComponent(searchQuery)}` : '/');
  }, [navigate, searchQuery]);

  const searchCache = useSearchCache();
  const cachedResults: VideoResult[] = searchQuery ? (searchCache.get(searchQuery)?.results ?? []) : [];

  const activeThumbRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YT.Player | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [apiReady, setApiReady] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [barVisible, setBarVisible] = useState(true);
  const inactivityTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Scroll active thumbnail into view
  useEffect(() => {
    if (activeThumbRef.current) {
      activeThumbRef.current.scrollIntoView({ inline: 'center', block: 'nearest' });
    }
  }, [id]);

  // Show control bar and reset inactivity timer
  const resetInactivityTimer = useCallback(() => {
    setBarVisible(true);
    if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
    if (document.fullscreenElement) {
      inactivityTimer.current = setTimeout(() => setBarVisible(false), INACTIVITY_DELAY);
    }
  }, []);

  // Load YouTube IFrame API
  useEffect(() => {
    if (!window.YT) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      const firstScriptTag = document.getElementsByTagName('script')[0];
      firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);
      window.onYouTubeIframeAPIReady = () => setApiReady(true);
    } else {
      setApiReady(true);
    }
  }, []);

  // Create player
  useEffect(() => {
    if (apiReady && id && containerRef.current) {
      playerRef.current = new window.YT.Player('player', {
        videoId: id,
        playerVars: {
          autoplay: 1,
          rel: 0,
          controls: 1,
          modestbranding: 1,
        },
      });
    }
    return () => {
      if (playerRef.current) {
        playerRef.current.destroy();
      }
    };
  }, [apiReady, id]);

  const toggleFullscreen = useCallback(() => {
    const wrapper = document.getElementById('watch-wrapper');
    if (!wrapper) return;
    if (!document.fullscreenElement) {
      wrapper.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  }, []);

  // Track fullscreen state and manage bar visibility on transitions
  useEffect(() => {
    const onFullscreenChange = () => {
      const fs = !!document.fullscreenElement;
      setIsFullscreen(fs);
      if (fs) {
        // Entering fullscreen: start inactivity timer
        if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
        inactivityTimer.current = setTimeout(() => setBarVisible(false), INACTIVITY_DELAY);
      } else {
        // Exiting fullscreen: always show bar
        if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
        setBarVisible(true);
      }
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  // Mouse/keyboard activity listener for fullscreen auto-hide
  useEffect(() => {
    const wrapper = document.getElementById('watch-wrapper');
    if (!wrapper) return;

    const onActivity = () => resetInactivityTimer();

    wrapper.addEventListener('mousemove', onActivity);
    wrapper.addEventListener('keydown', onActivity);
    return () => {
      wrapper.removeEventListener('mousemove', onActivity);
      wrapper.removeEventListener('keydown', onActivity);
    };
  }, [resetInactivityTimer]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const player = playerRef.current;
      if (!player || typeof player.getCurrentTime !== 'function') return;

      const currentTime = player.getCurrentTime();
      const duration = player.getDuration();

      switch (event.key) {
        case 'ArrowRight':
          player.seekTo(Math.min(currentTime + 10, duration), true);
          break;
        case 'ArrowLeft':
          if (event.shiftKey) {
            goBack();
          } else {
            player.seekTo(Math.max(currentTime - 10, 0), true);
          }
          break;
        case ' ':
        case 'Spacebar':
          {
            const state = player.getPlayerState();
            if (state === window.YT.PlayerState.PLAYING) {
              player.pauseVideo();
            } else {
              player.playVideo();
            }
            event.preventDefault();
          }
          break;
        case 'f':
        case 'F':
          toggleFullscreen();
          break;
        case 'Escape':
          if (document.fullscreenElement) {
            document.exitFullscreen();
          } else {
            goBack();
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [goBack, toggleFullscreen]);

  return (
    <Box
      id="watch-wrapper"
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        bgcolor: 'black',
        color: 'white',
      }}
    >
      {/* Video area */}
      <Box sx={{ flex: 1, position: 'relative', width: '100%' }} ref={containerRef}>
        <Box
          id="player"
          sx={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            pointerEvents: 'none',
          }}
        />
      </Box>

      {/* Bottom bar wrapper */}
      <Box
        sx={{
          transition: 'transform 0.3s ease, opacity 0.3s ease',
          ...(isFullscreen && {
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            zIndex: 10,
            ...(!barVisible && {
              transform: 'translateY(100%)',
              opacity: 0,
              pointerEvents: 'none',
            }),
          }),
        }}
      >
        {/* Video strip */}
        {cachedResults.length > 0 && (
          <Box
            sx={{
              display: 'flex',
              gap: 1,
              px: 1,
              py: 0.75,
              overflowX: 'auto',
              bgcolor: 'rgba(15,15,15,0.9)',
              borderBottom: '1px solid rgba(255,255,255,0.08)',
              scrollbarWidth: 'thin',
              '&::-webkit-scrollbar': { height: 4 },
              '&::-webkit-scrollbar-thumb': { bgcolor: 'rgba(255,255,255,0.2)', borderRadius: 2 },
            }}
          >
            {cachedResults.map((video) => {
              const isActive = video.videoId === id;
              return (
                <VideoThumb
                  key={video.videoId}
                  video={video}
                  isActive={isActive}
                  thumbRef={isActive ? activeThumbRef : undefined}
                  onSelect={() => {
                    navigate(`/watch/${video.videoId}${searchQuery ? `?q=${encodeURIComponent(searchQuery)}` : ''}`, { replace: true });
                  }}
                />
              );
            })}
          </Box>
        )}

        {/* Control bar */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: { xs: 1, sm: 2 },
            px: { xs: 1, sm: 2 },
            py: 1,
            bgcolor: 'background.paper',
            flexWrap: 'wrap',
          }}
        >
          {/* Action buttons */}
          <Button
            variant="contained"
            color="primary"
            size="small"
            startIcon={<PlayArrowIcon />}
            onClick={() => playerRef.current?.playVideo()}
          >
            Play
          </Button>
          <Tooltip title="Play from beginning">
            <Button
              variant="outlined"
              color="primary"
              size="small"
              startIcon={<ReplayIcon />}
              onClick={() => {
                const player = playerRef.current;
                if (player && typeof player.seekTo === 'function') {
                  player.seekTo(0, true);
                  player.playVideo();
                }
              }}
            >
              Restart
            </Button>
          </Tooltip>
          <Button
            variant="outlined"
            color="inherit"
            size="small"
            startIcon={<ArrowBackIcon />}
            onClick={goBack}
          >
            Search
          </Button>
          <Tooltip title={isFullscreen ? 'Exit fullscreen (F)' : 'Fullscreen (F)'}>
            <IconButton
              color="inherit"
              size="small"
              onClick={toggleFullscreen}
            >
              {isFullscreen ? <FullscreenExitIcon /> : <FullscreenIcon />}
            </IconButton>
          </Tooltip>

          {/* Divider */}
          <Box
            sx={{
              width: '1px',
              height: 24,
              bgcolor: 'rgba(255,255,255,0.12)',
              display: { xs: 'none', sm: 'block' },
            }}
          />

          {/* Keyboard shortcuts */}
          <Box
            sx={{
              display: { xs: 'none', sm: 'flex' },
              alignItems: 'center',
              gap: 2,
              ml: 'auto',
            }}
          >
            <ShortcutHint keys={['←', '→']} label="Seek" />
            <ShortcutHint keys={['Space']} label="Play/Pause" />
            <ShortcutHint keys={['F']} label="Fullscreen" />
            <ShortcutHint keys={['Shift+←']} label="Search" />
          </Box>

          {/* UserMenu pushed to far right */}
          <Box sx={{ ml: { xs: 'auto', sm: 0 } }}>
            <UserMenu />
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
