import { useCallback, useEffect, useRef, useState } from 'react';
import { Box, Button, CircularProgress, Container, Divider, Typography } from '@mui/material';
import GoogleIcon from '@mui/icons-material/Google';
import RefreshIcon from '@mui/icons-material/Refresh';
import { QRCodeSVG } from 'qrcode.react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import {
  requestDeviceCode,
  pollDeviceToken,
  completeDeviceAuth,
  type DeviceCodeResponse,
} from '../auth/AuthContext';

interface DeviceFlowState {
  deviceCode: string;
  userCode: string;
  verificationUrl: string;
  interval: number;
  expiresAt: number;
}

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [deviceFlow, setDeviceFlow] = useState<DeviceFlowState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  // Request a new device code from Google via GAS
  const startDeviceFlow = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const res: DeviceCodeResponse = await requestDeviceCode();
      if (!mountedRef.current) return;
      setDeviceFlow({
        deviceCode: res.deviceCode,
        userCode: res.userCode,
        verificationUrl: res.verificationUrl,
        interval: res.interval,
        expiresAt: Date.now() + res.expiresIn * 1000,
      });
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err instanceof Error ? err.message : 'Failed to start device login');
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  // Kick off device flow on mount
  useEffect(() => {
    mountedRef.current = true;
    startDeviceFlow();
    return () => {
      mountedRef.current = false;
    };
  }, [startDeviceFlow]);

  // Poll for authorization once we have a device code
  useEffect(() => {
    if (!deviceFlow) return;

    let intervalMs = deviceFlow.interval * 1000;
    let timeoutId: ReturnType<typeof setTimeout>;
    let cancelled = false;

    const poll = async () => {
      if (cancelled) return;

      // Code expired — request a fresh one
      if (Date.now() > deviceFlow.expiresAt) {
        startDeviceFlow();
        return;
      }

      try {
        const result = await pollDeviceToken(deviceFlow.deviceCode);
        if (cancelled) return;

        if (result.pending) {
          if (result.slowDown) intervalMs += 5000;
          timeoutId = setTimeout(poll, intervalMs);
          return;
        }

        // User authorized — complete sign-in
        await completeDeviceAuth(result);
        if (!cancelled) navigate('/', { replace: true });
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Authentication failed');
        setDeviceFlow(null);
      }
    };

    timeoutId = setTimeout(poll, intervalMs);
    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [deviceFlow, navigate, startDeviceFlow]);

  const qrValue = deviceFlow
    ? `${deviceFlow.verificationUrl}?user_code=${deviceFlow.userCode}`
    : '';

  return (
    <Container maxWidth="xs">
      <Box
        sx={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 3,
        }}
      >
        <Typography variant="h4" fontWeight="bold">
          FamilyTube
        </Typography>
        <Typography variant="body1" color="text.secondary" textAlign="center">
          Sign in to curate and search your favourite channels.
        </Typography>

        {/* ---------- QR code section ---------- */}
        {loading ? (
          <CircularProgress />
        ) : error ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
            <Typography color="error" textAlign="center">
              {error}
            </Typography>
            <Button variant="outlined" startIcon={<RefreshIcon />} onClick={startDeviceFlow}>
              Try Again
            </Button>
          </Box>
        ) : deviceFlow ? (
          <>
            <Box
              sx={{
                bgcolor: 'white',
                p: 2,
                borderRadius: 2,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <QRCodeSVG value={qrValue} size={200} />
            </Box>

            <Typography variant="body1" color="text.secondary" textAlign="center">
              Scan with your phone to sign in
            </Typography>

            <Box sx={{ textAlign: 'center' }}>
              <Typography variant="body2" color="text.secondary">
                Or visit{' '}
                <Typography component="span" variant="body2" fontWeight="bold" color="text.primary">
                  google.com/device
                </Typography>{' '}
                and enter:
              </Typography>
              <Typography
                variant="h4"
                fontWeight="bold"
                sx={{ mt: 1, letterSpacing: 4 }}
              >
                {deviceFlow.userCode}
              </Typography>
            </Box>
          </>
        ) : null}

        {/* ---------- Fallback: regular Google sign-in ---------- */}
        <Divider flexItem sx={{ my: 1 }}>
          or
        </Divider>

        <Button
          variant="outlined"
          size="large"
          startIcon={<GoogleIcon />}
          onClick={login}
          sx={{ px: 4, py: 1.5 }}
        >
          Sign in with Google
        </Button>
      </Box>
    </Container>
  );
}
