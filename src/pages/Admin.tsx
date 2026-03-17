import React, { useState, useEffect } from 'react';

const ALLOWED_CHANNELS_STORAGE_KEY = 'allowed-channels';

export default function Admin() {
  const [channels, setChannels] = useState<string[]>(['']);

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
      <button onClick={handleSave} style={{ padding: '8px 12px', fontSize: '16px', background: 'green', color: 'white' }}>
        Save Channels
      </button>
    </div>
  );
}
