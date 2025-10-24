import Firecrawl from '@mendable/firecrawl-js';

class FirecrawlService {
  private client: Firecrawl | null = null;

  constructor() {
    const apiKey = process.env.FIRECRAWL_API_KEY;
    if (apiKey) {
      this.client = new Firecrawl({ apiKey });
      console.log('[FirecrawlService] Initialized successfully.');
    } else {
      console.warn('[FirecrawlService] FIRECRAWL_API_KEY not set. Web research features will be disabled.');
    }
  }

  public isConfigured(): boolean {
    return !!this.client;
  }

  async search(query: string): Promise<any[]> {
    if (!this.client) {
      console.warn('[FirecrawlService] Search called but service is not configured.');
      // Return a mock response if not configured to prevent crashes
      return [{
        url: 'https://example.com/mock-result',
        title: 'Mock Search Result',
        description: 'Firecrawl API key not provided. This is a mock result.',
        markdown: '# Mock Result\n\nFirecrawl API key not provided. This is a mock result.',
        position: 1
      }];
    }
    try {
      // Perform search and scrape markdown content for top 3 results
      const results = await this.client.search(query, {
        limit: 3,
        scrapeOptions: { formats: ['markdown'] }
      });
      
      // The SDK returns { success: boolean, data: [...] }. We want the data.
      return results.data || [];
    } catch (error) {
      console.error('[FirecrawlService] Error during search:', error);
      return [];
    }
  }
}

export const firecrawlService = new FirecrawlService();
