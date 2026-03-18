import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import Search from './pages/Search';
import Watch from './pages/Watch';
import KeyDebug from './pages/KeyDebug';
import Admin from './pages/Admin';

const darkTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#ff0000', // YouTube red
    },
    background: {
      default: '#0f0f0f',
      paper: '#282828',
    },
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
        },
      },
    },
  },
});

function App() {
  return (
    <ThemeProvider theme={darkTheme}>
      <CssBaseline />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Search />} />
          <Route path="/watch/:id" element={<Watch />} />
          <Route path="/debug" element={<KeyDebug />} />
          <Route path="/admin" element={<Admin />} />
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  );
}

export default App;
