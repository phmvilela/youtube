import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

declare global {
  interface Window {
    onYouTubeIframeAPIReady: () => void;
    YT: typeof YT;
  }
}

export default function Watch() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const playerRef = useRef<YT.Player | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const playBtnRef = useRef<HTMLButtonElement>(null);
  const [apiReady, setApiReady] = useState(false);

  useEffect(() => {
    // Load YouTube API script if not already present
    if (!window.YT) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      const firstScriptTag = document.getElementsByTagName('script')[0];
      firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);

      window.onYouTubeIframeAPIReady = () => {
        setApiReady(true);
      };
    } else {
      setApiReady(true);
    }
  }, []);

  useEffect(() => {
    if (apiReady && id && containerRef.current) {
      playerRef.current = new window.YT.Player('player', {
        videoId: id,
        playerVars: {
          autoplay: 0,
          rel: 0,
          controls: 1,
          modestbranding: 1
        },
        events: {
          onReady: () => {
            playBtnRef.current?.focus();
          }
        }
      });
    }

    return () => {
      if (playerRef.current) {
        playerRef.current.destroy();
      }
    };
  }, [apiReady, id]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const player = playerRef.current;
      if (!player || typeof player.getCurrentTime !== 'function') return;

      const currentTime = player.getCurrentTime();
      const duration = player.getDuration();
      const volume = player.getVolume();

      switch (event.key) {
        case 'ArrowRight':
          player.seekTo(Math.min(currentTime + 10, duration), true);
          break;
        case 'ArrowLeft':
          player.seekTo(Math.max(currentTime - 10, 0), true);
          break;
        case 'ArrowUp':
          player.setVolume(Math.min(volume + 10, 100));
          break;
        case 'ArrowDown':
          player.setVolume(Math.max(volume - 10, 0));
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
        case '1':
        case 'Escape':
        case 'Backspace':
          navigate('/');
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [navigate]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', backgroundColor: '#000', color: '#fff' }}>
      <div style={{ display: 'flex', justifyContent: 'center', gap: '20px', padding: '16px', background: '#111', zIndex: 2 }}>
        <button
          ref={playBtnRef}
          onClick={() => playerRef.current?.playVideo()}
          style={{ padding: '14px 24px', fontSize: '16px', backgroundColor: '#00bcd4', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
        >
          Play Video
        </button>
        <button
          onClick={() => navigate('/')}
          style={{ padding: '14px 24px', fontSize: '16px', backgroundColor: '#00bcd4', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
        >
          Return to Search
        </button>
      </div>
      <div style={{ flex: 1, position: 'relative', width: '100%' }} ref={containerRef}>
        <div id="player" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none' }}></div>
      </div>
      <div style={{ textAlign: 'center', fontSize: '14px', color: '#aaa', padding: '10px', background: '#111' }}>
        Arrows: ⬅️/➡️ seek 10s, ⬆️/⬇️ volume ±10% &nbsp;|&nbsp; Space: Play/Pause &nbsp;|&nbsp; 1: Return to Search
      </div>
    </div>
  );
}
