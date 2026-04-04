import { collection, getDocs, query, where, onSnapshot, doc, updateDoc, type Unsubscribe } from "firebase/firestore";
import { db, appConfig } from './firebase';

export interface SyncedVideo {
  videoId: string;
  title: string;
  channelName: string;
  channelId: string;
  publishedAt: string;
  thumbnail?: string;
  searchWords?: string[];
}

export interface Channel {
  id: string;
  name: string;
  thumbnail?: string;
}

/** Search videos by keywords using Firestore array-contains-any. */
export async function searchVideos(uid: string, searchTerms: string[]): Promise<SyncedVideo[]> {
  const q = query(
    collection(db, 'users', uid, appConfig.collectionName),
    where('searchWords', 'array-contains-any', searchTerms)
  );
  const snapshot = await getDocs(q);
  const videos: SyncedVideo[] = [];
  snapshot.forEach((docSnap) => {
    videos.push(docSnap.data() as SyncedVideo);
  });
  return videos;
}

/** Subscribe to soft-deleted channel IDs. Returns an unsubscribe function. */
export function subscribeToDeletedChannels(
  uid: string,
  onUpdate: (deletedIds: Set<string>) => void,
): Unsubscribe {
  const q = query(
    collection(db, 'users', uid, 'allowed_channels'),
    where('status', '==', 'deleted')
  );
  return onSnapshot(q, (snapshot) => {
    const ids = new Set<string>();
    snapshot.forEach((doc) => ids.add(doc.id));
    onUpdate(ids);
  });
}

/** Subscribe to active (non-deleted) allowed channels. Returns an unsubscribe function. */
export function subscribeToActiveChannels(
  uid: string,
  onUpdate: (channels: Channel[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  const q = query(collection(db, 'users', uid, 'allowed_channels'));
  return onSnapshot(q, (snapshot) => {
    const channels: Channel[] = [];
    snapshot.forEach((doc) => {
      const data = doc.data();
      if (data.status !== 'deleted') {
        channels.push(data as Channel);
      }
    });
    onUpdate(channels);
  }, (error) => {
    onError?.(error);
  });
}

/** Soft-delete a channel by setting status to 'deleted'. */
export async function softDeleteChannel(uid: string, channelId: string): Promise<void> {
  await updateDoc(doc(db, 'users', uid, 'allowed_channels', channelId), { status: 'deleted' });
}
