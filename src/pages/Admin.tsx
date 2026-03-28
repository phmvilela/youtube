import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link as RouterLink } from 'react-router-dom';
import { useApiKey } from '../hooks/useApiKey';
import FlexSearch from 'flexsearch';
import { collection, writeBatch, doc, setDoc, deleteDoc } from "firebase/firestore";
import { useFirestoreConfig } from '../hooks/useFirestoreConfig';
import FirestoreConfigModal from '../components/FirestoreConfigModal';
import ApiKeyModal from '../components/ApiKeyModal';
import { Box, Typography, List, ListItem, ListItemAvatar, Avatar, ListItemText, IconButton, Paper, AppBar, Toolbar, Container } from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';

const ALLOWED_CHANNELS_STORAGE_KEY = 'allowed-channels';
const SYNCED_VIDEOS_STORAGE_KEY = 'synced-videos';

interface Channel {
  id: string;
  name: string;
  thumbnail?: string;
}

export default function Admin() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const { apiKey, saveApiKey } = useApiKey();
  const { config, saveConfig, db } = useFirestoreConfig();
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState('');

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Channel[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft' && event.shiftKey) {
        event.preventDefault();
        navigate('/');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [navigate]);

  // Load from local storage once
  useEffect(() => {
    const storedChannels = localStorage.getItem(ALLOWED_CHANNELS_STORAGE_KEY);
    if (storedChannels) {
      try {
        const parsedChannels = JSON.parse(storedChannels);
        if (Array.isArray(parsedChannels) && parsedChannels.length > 0) {
          const normalized = parsedChannels.map((c: any) => {
            if (typeof c === 'string') return { id: c, name: c };
            return c;
          });
          setChannels(normalized);
        }
      } catch (e) {
        console.error("Failed to parse channels", e);
      }
    }
  }, []);

  // Fetch missing channel details if needed
  useEffect(() => {
    if (!apiKey || channels.length === 0) return;
    
    // Channels that only have ID and no name yet (meaning they just got parsed from old format)
    const channelsToFetch = channels.filter(c => c.name === c.id);
    if (channelsToFetch.length === 0) return;

    const fetchMissingDetails = async () => {
      const ids = channelsToFetch.slice(0, 50).map(c => c.id).join(',');
      try {
        const res = await fetch(`https://www.googleapis.com/youtube/v3/channels?part=snippet&id=${ids}&key=${apiKey}`);
        const data = await res.json();
        if (data.items) {
          const fetchedMap = new Map();
          data.items.forEach((item: any) => {
            fetchedMap.set(item.id, {
              id: item.id,
              name: item.snippet.title,
              thumbnail: item.snippet.thumbnails?.default?.url
            });
          });
          
          let updated: Channel[] = [];
          setChannels(prevChannels => {
            updated = prevChannels.map(c => {
              if (channelsToFetch.some(fetchC => fetchC.id === c.id)) {
                 if (fetchedMap.has(c.id)) {
                   return fetchedMap.get(c.id);
                 } else {
                   return { ...c, name: c.id + ' (Unknown)' };
                 }
              }
              return c;
            });
            localStorage.setItem(ALLOWED_CHANNELS_STORAGE_KEY, JSON.stringify(updated));
            return updated;
          });

          if (db && updated.length > 0) {
            const batch = writeBatch(db);
            updated.forEach(c => {
              if (channelsToFetch.some(fetchC => fetchC.id === c.id)) {
                batch.set(doc(db, 'allowed_channels', c.id), c);
              }
            });
            await batch.commit();
          }
        }
      } catch (err) {
        console.error("Failed to fetch missing channel details", err);
      }
    };
    
    fetchMissingDetails();
  }, [channels, apiKey]);

  // Handle outside click for dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (searchQuery.trim().length < 3) {
      setSearchResults([]);
      setShowDropdown(false);
      return;
    }

    const timer = setTimeout(async () => {
      if (!apiKey) return;
      setIsSearching(true);
      try {
        const res = await fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&q=${encodeURIComponent(searchQuery)}&key=${apiKey}&maxResults=10`);
        const data = await res.json();
        if (data.items) {
          const results = data.items.map((item: any) => ({
            id: item.snippet.channelId,
            name: item.snippet.channelTitle,
            thumbnail: item.snippet.thumbnails?.default?.url
          }));
          setSearchResults(results);
          setShowDropdown(true);
        }
      } catch (err) {
        console.error("Failed to search channels", err);
      } finally {
        setIsSearching(false);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [searchQuery, apiKey]);

  const handleSelectChannel = async (channel: Channel) => {
    if (!channels.some(c => c.id === channel.id)) {
      const newChannels = [...channels, channel];
      setChannels(newChannels);
      localStorage.setItem(ALLOWED_CHANNELS_STORAGE_KEY, JSON.stringify(newChannels));
      if (db) {
        try {
          await setDoc(doc(db, 'allowed_channels', channel.id), channel);
        } catch (e) {
          console.error("Failed to sync new channel to Firestore", e);
        }
      }
    }
    setSearchQuery('');
    setShowDropdown(false);
  };

  const handleRemoveChannel = async (index: number) => {
    const channelToRemove = channels[index];
    const newChannels = channels.filter((_, i) => i !== index);
    setChannels(newChannels);
    localStorage.setItem(ALLOWED_CHANNELS_STORAGE_KEY, JSON.stringify(newChannels));
    if (db && channelToRemove) {
      try {
        await deleteDoc(doc(db, 'allowed_channels', channelToRemove.id));
      } catch (e) {
        console.error("Failed to remove channel from Firestore", e);
      }
    }
  };

  const handleSyncVideos = async () => {
    if (!apiKey) {
      alert('API Key is missing. Please set it first.');
      return;
    }
    
    const storedChannelsStr = localStorage.getItem(ALLOWED_CHANNELS_STORAGE_KEY);
    if (!storedChannelsStr) {
      alert('No channels saved. Please save channels first.');
      return;
    }
    
    let storedChannels = JSON.parse(storedChannelsStr);
    if (!Array.isArray(storedChannels) || storedChannels.length === 0) {
      alert('No valid channels to sync.');
      return;
    }
    
    storedChannels = storedChannels.map((c: any) => typeof c === 'string' ? { id: c, name: c } : c);
    
    setIsSyncing(true);
    setSyncStatus('Starting sync...');
    
    const allVideos = [];
    
    for (const channel of storedChannels) {
      const channelId = channel.id;
      if (!channelId) continue;
      try {
        setSyncStatus(`Fetching uploads playlist for ${channel.name || channelId}...`);
        
        const channelRes = await fetch(`https://www.googleapis.com/youtube/v3/channels?part=contentDetails&id=${channelId}&key=${apiKey}`);
        const channelData = await channelRes.json();
        
        if (channelData.error) {
           console.error(`YouTube API Error for ${channelId}:`, channelData.error);
           continue;
        }

        const uploadsPlaylistId = channelData.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
        if (!uploadsPlaylistId) {
          console.warn(`No uploads playlist found for channel ${channelId}`);
          continue;
        }
        
        let pageToken = '';
        let pagesFetched = 0;
        
        while (true) {
          setSyncStatus(`Fetching videos for channel ${channel.name || channelId} (Page ${pagesFetched + 1})...`);
          const pageTokenParam = pageToken ? `&pageToken=${pageToken}` : '';
          const playlistRes = await fetch(`https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=${uploadsPlaylistId}&maxResults=50${pageTokenParam}&key=${apiKey}`);
          const playlistData = await playlistRes.json();
          
          if (!playlistData.items || playlistData.items.length === 0) break;
          
          for (const item of playlistData.items) {
            const title = item.snippet.title || '';
            const channelName = item.snippet.channelTitle || '';
            const rawWords = `${title} ${channelName}`.toLowerCase().split(/\W+/).filter(Boolean);
            const searchWords = Array.from(new Set(rawWords));

            allVideos.push({
              videoId: item.snippet.resourceId.videoId,
              title,
              channelName,
              channelId: item.snippet.channelId,
              publishedAt: item.snippet.publishedAt,
              thumbnail: item.snippet.thumbnails?.medium?.url || item.snippet.thumbnails?.default?.url,
              searchWords,
            });
          }
          
          pageToken = playlistData.nextPageToken;
          pagesFetched++;
          
          if (!pageToken) break;
        }
      } catch (e) {
        console.error(`Error syncing channel ${channelId}:`, e);
      }
    }
    
    setSyncStatus('Building local search index...');
    try {
      const doc = new FlexSearch.Document({
        document: {
          id: "videoId",
          index: ["title", "channelName"],
          store: true
        }
      });

      for (const video of allVideos) {
        doc.add(video);
      }

      const indexData: Record<string, any> = {};
      await doc.export((key, data) => {
        if (data) {
          indexData[key.toString()] = data;
        }
      });
      localStorage.setItem('flexsearch-index', JSON.stringify(indexData));
    } catch (err) {
      console.error('Error building search index:', err);
    }
    
    localStorage.setItem(SYNCED_VIDEOS_STORAGE_KEY, JSON.stringify(allVideos));
    setSyncStatus(`Sync complete! Saved metadata for ${allVideos.length} videos locally.`);

    setSyncStatus(`Syncing ${allVideos.length} videos to Firestore...`);
    try {
        if (!db || !config) throw new Error("Database not initialized");
        const videosCollection = collection(db, config.collectionName);
        const chunkSize = 500;
        for (let i = 0; i < allVideos.length; i += chunkSize) {
            const chunk = allVideos.slice(i, i + chunkSize);
            const batch = writeBatch(db);
            chunk.forEach((video) => {
                const videoDocRef = doc(videosCollection, video.videoId);
                batch.set(videoDocRef, video);
            });
            await batch.commit();
            setSyncStatus(`Synced ${i + chunk.length} of ${allVideos.length} videos to Firestore...`);
        }
        setSyncStatus(`Successfully synced ${allVideos.length} videos to Firestore.`);
    } catch (error) {
        console.error("Error syncing to Firestore:", error);
        setSyncStatus("An error occurred while syncing to Firestore.");
    }

    setIsSyncing(false);
  };

  if (!apiKey) {
    return <ApiKeyModal onSave={saveApiKey} />;
  }

  if (!config || !db) {
    return <FirestoreConfigModal onSave={saveConfig} />;
  }

  return (
    <Box sx={{ pb: 8 }}>
      <AppBar position="static" color="transparent" elevation={0}>
        <Toolbar>
          <IconButton edge="start" component={RouterLink} to="/" color="inherit" aria-label="back to search" sx={{ mr: 2 }}>
            <ArrowBackIcon />
          </IconButton>
          <Typography variant="h5" component="h1" fontWeight="bold">
            YouTube Offline
          </Typography>
        </Toolbar>
      </AppBar>

      <Container maxWidth="md" sx={{ mt: 4 }}>
        <Typography variant="h4" component="h2" gutterBottom>Admin - Allowed Channels</Typography>
      
      <div style={{ position: 'relative', marginBottom: '30px' }} ref={dropdownRef}>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search for a channel to add (min 3 chars)..."
          style={{ 
            padding: '12px', 
            width: '100%', 
            fontSize: '16px',
            boxSizing: 'border-box',
            borderRadius: '4px',
            border: '1px solid #ccc'
          }}
        />
        {isSearching && <div style={{ position: 'absolute', right: '12px', top: '12px', color: '#666' }}>Searching...</div>}
        
        {showDropdown && searchResults.length > 0 && (
          <div style={{ 
            position: 'absolute', 
            top: '100%', 
            left: 0, 
            right: 0, 
            backgroundColor: 'white', 
            border: '1px solid #ccc', 
            borderTop: 'none',
            borderRadius: '0 0 4px 4px',
            zIndex: 10,
            maxHeight: '300px',
            overflowY: 'auto',
            boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
          }}>
            {searchResults.map(channel => (
              <div 
                key={channel.id}
                onClick={() => handleSelectChannel(channel)}
                style={{ 
                  padding: '10px', 
                  display: 'flex', 
                  alignItems: 'center', 
                  cursor: 'pointer',
                  borderBottom: '1px solid #eee'
                }}
                onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#f5f5f5'}
                onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'white'}
              >
                {channel.thumbnail && (
                  <img src={channel.thumbnail} alt={channel.name} style={{ width: '40px', height: '40px', borderRadius: '50%', marginRight: '15px' }} />
                )}
                <div>
                  <div style={{ fontWeight: 'bold', color: '#333' }}>{channel.name}</div>
                  <div style={{ fontSize: '12px', color: '#666' }}>ID: {channel.id}</div>
                </div>
              </div>
            ))}
          </div>
        )}
        {showDropdown && searchResults.length === 0 && !isSearching && searchQuery.length >= 3 && (
          <div style={{
            position: 'absolute', 
            top: '100%', 
            left: 0, 
            right: 0, 
            backgroundColor: 'white', 
            border: '1px solid #ccc',
            padding: '10px',
            color: '#666'
          }}>
            No channels found.
          </div>
        )}
      </div>

      <Box sx={{ mb: 4 }}>
        <Typography variant="h6" sx={{ mb: 2 }}>Saved Channels ({channels.length})</Typography>
        {channels.length === 0 ? (
          <Typography color="text.secondary">No channels saved yet. Search and add one above.</Typography>
        ) : (
          <Paper variant="outlined">
            <List disablePadding>
              {channels.map((channel, index) => (
                <ListItem
                  key={index}
                  divider={index !== channels.length - 1}
                  secondaryAction={
                    <IconButton 
                      edge="end" 
                      aria-label="delete" 
                      onClick={() => handleRemoveChannel(index)}
                      color="error"
                    >
                      <DeleteIcon />
                    </IconButton>
                  }
                >
                  <ListItemAvatar>
                    <Avatar src={channel.thumbnail} alt={channel.name}>
                      {channel.name ? channel.name[0] : '?'}
                    </Avatar>
                  </ListItemAvatar>
                  <ListItemText
                    primary={channel.name}
                    primaryTypographyProps={{ fontWeight: 'bold' }}
                    secondary={channel.id}
                    secondaryTypographyProps={{ variant: 'body2', color: 'text.secondary' }}
                  />
                </ListItem>
              ))}
            </List>
          </Paper>
        )}
      </Box>

      <div style={{ marginTop: '30px', borderTop: '1px solid #ccc', paddingTop: '20px' }}>
        <h2>Sync Channel Content</h2>
        <p>Downloads metadata of recent uploads from configured channels for offline search and syncs to Firestore.</p>
        <button 
          onClick={handleSyncVideos} 
          disabled={isSyncing}
          style={{ 
            padding: '10px 16px', 
            fontSize: '16px', 
            background: isSyncing ? '#aaa' : '#007bff', 
            color: 'white', 
            border: 'none', 
            cursor: isSyncing ? 'not-allowed' : 'pointer',
            borderRadius: '4px',
            fontWeight: 'bold'
          }}
        >
          {isSyncing ? 'Syncing...' : 'Sync Videos to Local and Firestore'}
        </button>
        {syncStatus && <div style={{ 
          marginTop: '15px', 
          padding: '10px', 
          backgroundColor: '#e8f4fd', 
          borderLeft: '4px solid #007bff',
          color: '#0056b3'
        }}>{syncStatus}</div>}
      </div>
      </Container>
    </Box>
  );
}

