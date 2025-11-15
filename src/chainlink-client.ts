/**
 * Chainlink Client
 * 
 * Integrates Chainlink price feeds using on-chain Price Feeds
 * Uses Chainlink Price Feed contracts directly from blockchain
 * 
 * Reference: https://docs.chain.link/data-feeds/price-feeds
 */
import { ethers } from 'ethers';
import { ChainlinkOnChainClient } from './chainlink-client-onchain.js';

export interface ChainlinkPrice {
  symbol: string;
  price: number;
  timestamp: number;
  source: string;
}

export class ChainlinkClient {
  private onChainClient: ChainlinkOnChainClient | null = null;
  private provider: ethers.Provider | null = null;
  private useOnChain: boolean = false; // Disable on-chain by default due to address validation issues
  
  // Common crypto price feeds (for symbol extraction)
  private readonly PRICE_FEEDS: Record<string, string> = {
    'BTC': 'btc-usd',
    'ETH': 'eth-usd',
    'SOL': 'sol-usd',
    'XRP': 'xrp-usd',
    'DOGE': 'doge-usd',
    'MATIC': 'matic-usd',
    'AVAX': 'avax-usd',
    'LINK': 'link-usd',
    'ADA': 'ada-usd',
    'DOT': 'dot-usd',
  };

  constructor(rpcUrl?: string) {
    if (rpcUrl) {
      this.initializeProvider(rpcUrl);
    }
  }

  /**
   * Initialize provider and on-chain client
   */
  private initializeProvider(rpcUrl: string): void {
    try {
      this.provider = new ethers.JsonRpcProvider(rpcUrl);
      this.onChainClient = new ChainlinkOnChainClient(this.provider);
    } catch (error) {
      console.error('Error initializing Chainlink provider:', error);
    }
  }

  /**
   * Get current price for a cryptocurrency
   * Tries multiple sources: Chainlink Data Streams, Price Feeds API, on-chain (if enabled)
   * @param symbol Crypto symbol (e.g., 'BTC', 'ETH', 'SOL')
   */
  async getPrice(symbol: string): Promise<ChainlinkPrice | null> {
    // Try Chainlink Data Streams first (most reliable)
    try {
      const feedSlug = this.PRICE_FEEDS[symbol.toUpperCase()];
      if (feedSlug) {
        const price = await this.getPriceFeed(symbol, feedSlug);
        if (price) {
          return price;
        }
      }
    } catch (error) {
      // Continue to next method
    }

    // Try on-chain if enabled (currently disabled due to address validation issues)
    if (this.useOnChain && this.onChainClient) {
      try {
        return await this.onChainClient.getPrice(symbol);
      } catch (error) {
        // On-chain fetch failed, continue to fallback
      }
    }

    // Fallback: Strategy can work without Chainlink price (uses K-line data)
    return null;
  }

  /**
   * Get price from Chainlink Data Streams
   */
  private async parseStreamData(symbol: string, data: any): Promise<ChainlinkPrice | null> {
    try {
      // Parse Data Streams response format
      // Format may vary, adjust based on actual API response
      const price = parseFloat(data.midPrice || data.price || data.value || '0');
      const timestamp = data.timestamp || data.updatedAt || Date.now();

      if (price <= 0) {
        return null;
      }

      return {
        symbol: symbol.toUpperCase(),
        price,
        timestamp: typeof timestamp === 'string' ? new Date(timestamp).getTime() : timestamp,
        source: 'chainlink-streams',
      };
    } catch (error) {
      console.error(`Error parsing Chainlink stream data:`, error);
      return null;
    }
  }

  /**
   * Fallback: Get price from traditional Chainlink Price Feed
   */
  private async getPriceFeed(symbol: string, feedSlug: string): Promise<ChainlinkPrice | null> {
    try {
      // Try multiple Chainlink API endpoints
      const endpoints = [
        `https://data.chain.link/v1/feeds/${feedSlug}`,
        `https://api.chain.link/v1/feeds/${feedSlug}`,
      ];

      for (const feedUrl of endpoints) {
        try {
          const response = await fetch(feedUrl, {
            headers: {
              'Accept': 'application/json',
            },
            // Disable SSL verification for Bun compatibility (development only)
            // @ts-ignore - Bun specific option
            tls: { rejectUnauthorized: false },
          });

          if (response.ok) {
            const data = await response.json() as any;
            const price = parseFloat(data.price || data.value || data.data?.price || '0');
            
            if (price > 0) {
              return {
                symbol: symbol.toUpperCase(),
                price,
                timestamp: Date.now(),
                source: 'chainlink-feeds',
              };
            }
          }
        } catch (e) {
          // Try next endpoint
          continue;
        }
      }

      return null;
    } catch (error) {
      // Silently fail - strategy can work without Chainlink price
      return null;
    }
  }

  /**
   * Get multiple crypto prices at once
   */
  async getPrices(symbols: string[]): Promise<Map<string, ChainlinkPrice>> {
    const prices = new Map<string, ChainlinkPrice>();
    
    // Fetch prices sequentially
    for (const symbol of symbols) {
      try {
        const price = await this.getPrice(symbol);
        if (price) {
          prices.set(symbol.toUpperCase(), price);
        }
      } catch (error) {
        // Skip failed symbols
      }
    }
    
    return prices;
  }

  /**
   * Extract crypto symbol from market question
   * Examples:
   * - "Bitcoin above $100k?" -> "BTC"
   * - "Ethereum price in November?" -> "ETH"
   * - "Solana hits $200?" -> "SOL"
   */
  extractCryptoSymbol(question: string): string | null {
    const upperQuestion = question.toUpperCase();
    
    // Direct symbol matches
    const symbolMap: Record<string, string> = {
      'BITCOIN': 'BTC',
      'BTC': 'BTC',
      'ETHEREUM': 'ETH',
      'ETH': 'ETH',
      'SOLANA': 'SOL',
      'SOL': 'SOL',
      'RIPPLE': 'XRP',
      'XRP': 'XRP',
      'DOGECOIN': 'DOGE',
      'DOGE': 'DOGE',
      'POLYGON': 'MATIC',
      'MATIC': 'MATIC',
      'AVALANCHE': 'AVAX',
      'AVAX': 'AVAX',
      'CHAINLINK': 'LINK',
      'LINK': 'LINK',
      'CARDANO': 'ADA',
      'ADA': 'ADA',
      'POLKADOT': 'DOT',
      'DOT': 'DOT',
    };

    for (const [keyword, symbol] of Object.entries(symbolMap)) {
      if (upperQuestion.includes(keyword)) {
        return symbol;
      }
    }

    return null;
  }

  /**
   * Validate Polymarket price against Chainlink data
   * Returns true if prices are consistent (within threshold)
   */
  async validatePrice(
    marketQuestion: string,
    polymarketPrice: number,
    thresholdPercent: number = 5
  ): Promise<{ valid: boolean; chainlinkPrice: ChainlinkPrice | null; difference: number }> {
    const symbol = this.extractCryptoSymbol(marketQuestion);
    if (!symbol) {
      return { valid: true, chainlinkPrice: null, difference: 0 }; // Can't validate non-crypto markets
    }

    const chainlinkPrice = await this.getPrice(symbol);
    if (!chainlinkPrice) {
      return { valid: true, chainlinkPrice: null, difference: 0 }; // Can't validate if no Chainlink data
    }

    // For price-based markets, we need to extract the target price from question
    // This is a simplified version - you may need more sophisticated parsing
    const targetPrice = this.extractTargetPrice(marketQuestion);
    if (!targetPrice) {
      return { valid: true, chainlinkPrice, difference: 0 }; // Can't validate without target price
    }

    // Compare Chainlink price with target price
    const difference = Math.abs(chainlinkPrice.price - targetPrice) / targetPrice * 100;
    const valid = difference <= thresholdPercent;

    return {
      valid,
      chainlinkPrice,
      difference,
    };
  }

  /**
   * Extract target price from market question
   * Examples:
   * - "Bitcoin above $100,000?" -> 100000
   * - "Ethereum hits $5,000?" -> 5000
   * - "Solana price $200?" -> 200
   */
  extractTargetPrice(question: string): number | null {
    // Match patterns like $100,000, $100k, $100K, etc.
    const patterns = [
      /\$([\d,]+(?:\.\d+)?)\s*k/i,  // $100k, $100K
      /\$([\d,]+(?:\.\d+)?)\s*m/i,  // $100m, $100M
      /\$([\d,]+(?:\.\d+)?)/,       // $100,000
    ];

    for (const pattern of patterns) {
      const match = question.match(pattern);
      if (match) {
        let price = parseFloat(match[1].replace(/,/g, ''));
        
        // Handle k (thousands) and m (millions)
        if (/k/i.test(match[0])) {
          price *= 1000;
        } else if (/m/i.test(match[0])) {
          price *= 1000000;
        }
        
        return price;
      }
    }

    return null;
  }
}

