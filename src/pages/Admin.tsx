import { useState, useEffect } from 'react';
import { useApiKey } from '../hooks/useApiKey';
import FlexSearch from 'flexsearch';
import { initializeApp } from "firebase/app";
import { getFirestore, collection, writeBatch, doc } from "firebase/firestore";
import { firestoreConfig } from '../firestore.config';

const ALLOWED_CHANNELS_STORAGE_KEY = 'allowed-channels';
const SYNCED_VIDEOS_STORAGE_KEY = 'synced-videos';

// Initialize Firebase
const firebaseApp = initializeApp(firestoreConfig);
const db = getFirestore(firebaseApp, firestoreConfig.databaseId);

export default function Admin() {
  const [channels, setChannels] = useState<string[]>(['']);
  const { apiKey } = useApiKey();
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState('');

  useEffect(() => {
    const storedChannels = localStorage.getItem(ALLOWED_CHANNELS_STORAGE_KEY);
    if (storedChannels) {
      const parsedChannels = JSON.parse(storedChannels);
      if (Array.isArray(parsedChannels) && parsedChannels.length > 0) {
        setChannels(parsedChannels);
      }
    }
  }, []);

  const handleAddChannel = () => {
    setChannels([...channels, '']);
  };

  const handleRemoveChannel = (index: number) => {
    const newChannels = channels.filter((_, i) => i !== index);
    setChannels(newChannels);
  };

  const handleChannelChange = (index: number, value: string) => {
    const newChannels = [...channels];
    newChannels[index] = value;
    setChannels(newChannels);
  };

  const handleSave = () => {
    const nonEmptyChannels = channels.map(c => c.trim()).filter(Boolean);
    localStorage.setItem(ALLOWED_CHANNELS_STORAGE_KEY, JSON.stringify(nonEmptyChannels));
    alert('Channels saved!');
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
    
    const storedChannels: string[] = JSON.parse(storedChannelsStr);
    if (!Array.isArray(storedChannels) || storedChannels.length === 0) {
      alert('No valid channels to sync.');
      return;
    }
    
    setIsSyncing(true);
    setSyncStatus('Starting sync...');
    
    const allVideos = [];
    
    for (const channelId of storedChannels) {
      if (!channelId) continue;
      try {
        setSyncStatus(`Fetching uploads playlist for ${channelId}...`);
        
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
          setSyncStatus(`Fetching videos for channel ${channelId} (Page ${pagesFetched + 1})...`);
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
        const videosCollection = collection(db, firestoreConfig.collectionName);
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

  return (
    <div style={{ padding: '20px' }}>
      <h1>Admin - Allowed Channels</h1>
      {channels.map((channel, index) => (
        <div key={index} style={{ display: 'flex', alignItems: 'center', marginBottom: '10px' }}>
          <input
            type="text"
            value={channel}
            onChange={(e) => handleChannelChange(index, e.target.value)}
            placeholder="Enter Channel ID"
            style={{ padding: '8px', width: '300px', fontSize: '16px' }}
          />
          <button onClick={() => handleRemoveChannel(index)} style={{ marginLeft: '10px', background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px' }}>
            🗑️
          </button>
        </div>
      ))}
      <button onClick={handleAddChannel} style={{ padding: '8px 12px', fontSize: '16px', marginRight: '10px' }}>
        Add Channel
      </button>
      <button onClick={handleSave} style={{ padding: '8px 12px', fontSize: '16px', background: 'green', color: 'white', border: 'none', cursor: 'pointer' }}>
        Save Channels
      </button>

      <div style={{ marginTop: '30px', borderTop: '1px solid #ccc', paddingTop: '20px' }}>
        <h2>Sync Channel Content</h2>
        <p>Downloads metadata of recent uploads from configured channels for offline search and syncs to Firestore.</p>
        <button 
          onClick={handleSyncVideos} 
          disabled={isSyncing}
          style={{ 
            padding: '8px 12px', 
            fontSize: '16px', 
            background: isSyncing ? '#aaa' : '#007bff', 
            color: 'white', 
            border: 'none', 
            cursor: isSyncing ? 'not-allowed' : 'pointer',
            borderRadius: '4px'
          }}
        >
          {isSyncing ? 'Syncing...' : 'Sync Videos to Local and Firestore'}
        </button>
        {syncStatus && <p style={{ marginTop: '10px', fontWeight: 'bold' }}>{syncStatus}</p>}
      </div>
    </div>
  );
}
