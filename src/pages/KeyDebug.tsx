import { useState, useEffect } from 'react';

interface KeyInfo {
  key: string;
  keyCode: number;
  code: string;
  time: string;
}

export default function KeyDebug() {
  const [keyInfo, setKeyInfo] = useState<KeyInfo | null>(null);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      setKeyInfo({
        key: event.key,
        keyCode: event.keyCode,
        code: event.code || 'N/A',
        time: new Date().toLocaleTimeString(),
      });
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const styles = {
    body: {
      backgroundColor: '#111',
      color: '#fff',
      padding: '20px',
      textAlign: 'center' as const,
      height: '100vh',
    },
    h1: {
      color: '#00bcd4',
    },
    output: {
      fontSize: '24px',
      marginTop: '40px',
      whiteSpace: 'pre-line' as const,
    },
  };

  return (
    <div style={styles.body}>
      <h1 style={styles.h1}>Remote Key Debugger</h1>
      <p>Press any button on your remote.</p>
      <div style={styles.output}>
        {keyInfo ? (
          `Key: ${keyInfo.key}\nKeyCode: ${keyInfo.keyCode}\nCode: ${keyInfo.code}\nTime: ${keyInfo.time}`
        ) : (
          'Waiting for input...'
        )}
      </div>
    </div>
  );
}
