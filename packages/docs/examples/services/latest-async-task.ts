import { isAbortError, Service } from 'wheel/core';

interface SearchResult {
  id: string;
  label: string;
}

class SearchService extends Service {
  /** Identity that survives minification (see require-service-name). */
  static override serviceName = 'SearchService';

  readonly results = this.atom<SearchResult[]>([], 'results');

  readonly search = async (query: string): Promise<void> => {
    const task = this.latestAsyncTask(); // A new query cancels the previous search.
    try {
      const response = await task.wait(
        fetch(`/api/search?q=${encodeURIComponent(query)}`, { signal: task.signal })
      );
      const rows = await task.wait(response.json() as Promise<SearchResult[]>);
      this.results.set(rows); // A stale search cannot reach this write.
    } catch (error) {
      if (!isAbortError(error)) throw error;
    }
  };
}
