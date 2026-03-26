import React, { useState } from 'react';
import { FirestoreConfig } from '../hooks/useFirestoreConfig';

interface FirestoreConfigModalProps {
  onSave: (config: FirestoreConfig) => void;
}

const FirestoreConfigModal: React.FC<FirestoreConfigModalProps> = ({ onSave }) => {
  const [config, setConfig] = useState<Partial<FirestoreConfig>>({
    apiKey: '',
    authDomain: '',
    projectId: '',
    storageBucket: '',
    messagingSenderId: '',
    appId: '',
    measurementId: '',
    collectionName: 'videos',
    databaseId: 'youtube-kids'
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setConfig({ ...config, [e.target.name]: e.target.value });
  };

  const handleSave = () => {
    if (
      config.apiKey &&
      config.authDomain &&
      config.projectId &&
      config.storageBucket &&
      config.messagingSenderId &&
      config.appId &&
      config.collectionName &&
      config.databaseId
    ) {
      onSave(config as FirestoreConfig);
    } else {
      alert("Please fill in all required fields.");
    }
  };

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full flex items-center justify-center" style={{ zIndex: 1300 }}>
      <div className="bg-white p-8 rounded-lg shadow-xl text-black w-full max-w-md">
        <h2 className="text-2xl font-bold mb-4">Enter Firestore Config</h2>
        <p className="mb-4 text-sm text-gray-600">
          Please provide your Firebase configuration details.
        </p>
        <div className="space-y-3 mb-4 max-h-96 overflow-y-auto">
          {['apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId', 'measurementId', 'collectionName', 'databaseId'].map((field) => (
            <input
              key={field}
              type="text"
              name={field}
              value={config[field as keyof FirestoreConfig] || ''}
              onChange={handleChange}
              className="border p-2 w-full text-black rounded"
              placeholder={field + (field === 'measurementId' ? ' (optional)' : '')}
            />
          ))}
        </div>
        <button
          onClick={handleSave}
          className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 w-full"
        >
          Save Configuration
        </button>
      </div>
    </div>
  );
};

export default FirestoreConfigModal;
