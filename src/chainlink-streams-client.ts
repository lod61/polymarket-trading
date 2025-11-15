/**
 * Chainlink Data Streams Client
 * 
 * Fetches historical and real-time data from Chainlink Data Streams
 * Reference: https://data.chain.link/streams/
 */
import { KLine } from './kline-client.js';

export interface ChainlinkStreamData {
  feedId: string;
  timestamp: number;
  price: number;
  volume?: number;
}

export class ChainlinkStreamsClient {
  private baseUrl: string = 'https://data.chain.link/v1';

  /**
   * Get historical data from Chainlink Data Streams
   * Note: Actual API endpoint may vary - this is a reference implementation
   * 
   * @param feedId Feed ID (e.g., '0x0003...75b8' for BTC/USD)
   * @param interval Interval in minutes (15 for 15-minute candles)
   * @param limit Number of candles to fetch
   */
  async getHistoricalData(
    feedId: string,
    interval: number = 15,
    limit: number = 200
  ): Promise<KLine[]> {
    try {
      // Try Chainlink Data Streams API
      // Note: Actual endpoint structure may differ
      const url = `${this.baseUrl}/streams/${feedId}/history?interval=${interval}&limit=${limit}`;
      
      const response = await fetch(url, {
        headers: {
          'Accept': 'application/json',
        },
        // Disable SSL verification for Bun compatibility (development only)
        // @ts-ignore - Bun specific option
        tls: { rejectUnauthorized: false },
      });

      if (response.ok) {
        const data = await response.json();
        return this.parseStreamData(data);
      }

      // Fallback: If API not available, return empty array
      console.warn(`Chainlink Data Streams API not available. Using fallback method.`);
      return [];
    } catch (error) {
      console.error(`Error fetching Chainlink Streams data:`, error);
      return [];
    }
  }

  /**
   * Parse Chainlink Streams API response
   */
  private parseStreamData(data: any): KLine[] {
    if (!Array.isArray(data)) {
      return [];
    }

    return data.map((item: any) => ({
      timestamp: new Date(item.timestamp || item.time).getTime(),
      open: parseFloat(item.open || item.price || '0'),
      high: parseFloat(item.high || item.price || '0'),
      low: parseFloat(item.low || item.price || '0'),
      close: parseFloat(item.close || item.price || '0'),
      volume: item.volume ? parseFloat(item.volume) : undefined,
    }));
  }

  /**
   * Get Feed ID for a symbol
   * Reference: https://data.chain.link/streams/btc-usd-cexprice-streams
   */
  getFeedId(symbol: string): string | null {
    const feedIds: Record<string, string> = {
      'BTC': '0x000375b8', // BTC/USD Feed ID (partial, get full ID from Chainlink)
      'ETH': '0x0003...', // ETH/USD Feed ID
      'SOL': '0x0003c24f', // SOL/USD Feed ID (from earlier reference)
    };

    return feedIds[symbol.toUpperCase()] || null;
  }
}




