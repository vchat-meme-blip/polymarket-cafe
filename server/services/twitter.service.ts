// This is a MOCK service. A real implementation would require Twitter API v2 access.
class TwitterService {
  
  async searchPosts(query: string): Promise<any[]> {
    console.log(`[TwitterService MOCK] Searching for posts with query: "${query}"`);
    // Simulate API delay
    await new Promise(res => setTimeout(res, 300));

    // Return mock data that mimics the Twitter API v2 response structure
    return [
      { id: '1', text: `This is looking extremely bullish for ${query}, free money imo` },
      { id: '2', text: `Not sure about ${query}, seems like a classic rug is incoming` },
      { id: '3', text: `Just watching ${query} from the sidelines for now.` },
    ];
  }

  async getSentiment(posts: any[]): Promise<number> {
    console.log('[TwitterService MOCK] Calculating sentiment...');
    // Simple keyword score: +1 for 'bullish/free money', -1 for 'rug/bear'
    const score = posts.reduce((score, p) => {
        const text = p.text.toLowerCase();
        if (text.includes('bullish') || text.includes('free money')) return score + 1;
        if (text.includes('rug') || text.includes('bearish')) return score - 1;
        return score;
    }, 0);

    // Normalize score to a 1-10 scale
    const normalizedScore = Math.round(((score / posts.length) + 1) * 4.5 + 1);
    return Math.max(1, Math.min(10, normalizedScore));
  }
}

export const twitterService = new TwitterService();
