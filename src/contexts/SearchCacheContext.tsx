import { createContext, useContext, useRef, useCallback, type ReactNode } from 'react';

interface VideoResult {
  videoId: string;
  title: string;
  channelName: string;
  channelId: string;
  publishedAt: string;
  thumbnail: string;
}

interface SearchCacheEntry {
  query: string;
  results: VideoResult[];
  scrollY: number;
}

interface SearchCacheContextValue {
  get: (query: string) => SearchCacheEntry | null;
  set: (entry: SearchCacheEntry) => void;
}

const SearchCacheContext = createContext<SearchCacheContextValue>({
  get: () => null,
  set: () => {},
});

export function useSearchCache() {
  return useContext(SearchCacheContext);
}

export function SearchCacheProvider({ children }: { children: ReactNode }) {
  const cacheRef = useRef<SearchCacheEntry | null>(null);

  const get = useCallback((query: string): SearchCacheEntry | null => {
    const entry = cacheRef.current;
    if (entry && entry.query === query && entry.results.length > 0) return entry;
    return null;
  }, []);

  const set = useCallback((entry: SearchCacheEntry) => {
    cacheRef.current = entry;
  }, []);

  return (
    <SearchCacheContext.Provider value={{ get, set }}>
      {children}
    </SearchCacheContext.Provider>
  );
}
