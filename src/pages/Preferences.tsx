import { Link as RouterLink } from 'react-router-dom';
import { Box, Typography, AppBar, Toolbar, IconButton, Container, Paper } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import UserMenu from '../components/UserMenu';

export default function Preferences() {
  return (
    <Box sx={{ pb: 8 }}>
      <AppBar position="static" color="transparent" elevation={0}>
        <Toolbar>
          <IconButton edge="start" component={RouterLink} to="/" color="inherit" aria-label="back to search" sx={{ mr: 2 }}>
            <ArrowBackIcon />
          </IconButton>
          <Typography variant="h5" component="h1" fontWeight="bold" sx={{ flexGrow: 1 }}>
            YouTube Offline
          </Typography>
          <UserMenu />
        </Toolbar>
      </AppBar>

      <Container maxWidth="md" sx={{ mt: 4 }}>
        <Typography variant="h4" component="h2" gutterBottom>Preferences</Typography>
        <Paper sx={{ p: 4, textAlign: 'center', bgcolor: 'background.paper', borderRadius: 2 }}>
          <Typography variant="body1" color="text.secondary">
            Nothing here yet. Preferences will be added soon.
          </Typography>
        </Paper>
      </Container>
    </Box>
  );
}
