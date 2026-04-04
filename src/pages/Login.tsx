import { Box, Button, Container, Typography } from '@mui/material';
import GoogleIcon from '@mui/icons-material/Google';
import { useAuth } from '../auth/AuthContext';

export default function Login() {
  const { login } = useAuth();

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
          YouTube Offline
        </Typography>
        <Typography variant="body1" color="text.secondary" textAlign="center">
          Sign in to sync and search your favourite channels offline.
        </Typography>
        <Button
          variant="contained"
          size="large"
          startIcon={<GoogleIcon />}
          onClick={login}
          sx={{ textTransform: 'none', px: 4, py: 1.5 }}
        >
          Sign in with Google
        </Button>
      </Box>
    </Container>
  );
}
