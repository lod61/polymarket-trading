import { Market, MarketPrice, Order, Position } from './types.js';
import { API_CONFIG } from './config.js';

/**
 * Polymarket API Client
 * 
 * Uses:
 * - polymarket-data SDK for market data (public API)
 * - CLOB API for trading (requires authentication)
 * 
 * API Documentation:
 * - Market Data: https://polymarket-data.com/
 * - Trading API: https://docs.polymarket.com/
 */
export class PolymarketClient {
  private apiKey: string;
  private privateKey?: string;
  private dataApiUrl: string;
  private clobApiUrl: string;

  constructor() {
    this.apiKey = API_CONFIG.apiKey || '';
    this.privateKey = process.env.POLYMARKET_PRIVATE_KEY;
    this.dataApiUrl = API_CONFIG.dataApiUrl || 'https://gamma-api.polymarket.com';
    this.clobApiUrl = API_CONFIG.baseUrl || 'https://clob.polymarket.com';
  }

  /**
   * Get crypto markets (15-minute, hourly, 4-hour timeframes)
   * These markets are created every 15 minutes with slug pattern: {symbol}-updown-15m-{timestamp}
   * Uses Polymarket Data API (public, no auth required)
   */
  async getCryptoMarkets(): Promise<Market[]> {
    const allMarkets: Market[] = [];
    
    // Generate slugs for recent and upcoming markets
    // Markets are created every 15 minutes, so we check current and next few periods
    const symbols = ['btc', 'eth', 'xrp', 'sol', 'matic', 'link'];
    const now = Math.floor(Date.now() / 1000);
    const roundedMinutes = Math.floor(now / 60 / 15) * 15;
    const currentTimestamp = roundedMinutes * 60;
    
    // Generate slugs: check current period and next 4 periods (next hour)
    // This covers markets that are currently active or about to start
    const slugsToCheck: string[] = [];
    for (const symbol of symbols) {
      // Check current and future markets (0 to +4 periods = next hour)
      for (let i = 0; i <= 4; i++) {
        const timestamp = currentTimestamp + (i * 900); // 15 minutes = 900 seconds
        slugsToCheck.push(`${symbol}-updown-15m-${timestamp}`);
      }
      // Also check recent markets (last 2 periods) in case they're still active
      for (let i = 1; i <= 2; i++) {
        const timestamp = currentTimestamp - (i * 900);
        slugsToCheck.push(`${symbol}-updown-15m-${timestamp}`);
      }
    }

    // Fetch markets by slug using query parameter
    // Process in batches to avoid overwhelming the API
    const batchSize = 10;
    for (let i = 0; i < slugsToCheck.length; i += batchSize) {
      const batch = slugsToCheck.slice(i, i + batchSize);
      const batchPromises = batch.map(async (slug) => {
        try {
          const response = await fetch(
            `${this.dataApiUrl}/markets?slug=${slug}&limit=1`,
            {
              headers: {
                'Content-Type': 'application/json',
              },
            }
          );
          if (response.ok) {
            const data = await response.json() as any;
            const markets = Array.isArray(data) ? data : [];
            if (markets.length > 0) {
              const market = markets[0];
              // Check if market is active and not closed
              const isActive = !market.closed && market.active !== false;
              if (isActive) {
                return this.parseMarkets([market])[0];
              }
            }
          }
        } catch (e) {
          // Skip if error
        }
        return null;
      });

      const results = await Promise.all(batchPromises);
      const validMarkets = results.filter(m => m !== null) as Market[];
      allMarkets.push(...validMarkets);
    }

    // Remove duplicates by market ID
    const uniqueMarkets = new Map<string, Market>();
    for (const market of allMarkets) {
      if (!uniqueMarkets.has(market.id)) {
        uniqueMarkets.set(market.id, market);
      }
    }

    return Array.from(uniqueMarkets.values());
  }

  /**
   * Get current prices for a market
   * Uses Polymarket Data API
   */
  async getMarketPrices(marketId: string): Promise<MarketPrice[]> {
    try {
      // Get market details including prices
      const response = await fetch(
        `${this.dataApiUrl}/markets/${marketId}`,
        {
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        throw new Error(`API error: ${response.status} ${response.statusText}`);
      }

      const market = await response.json();
      return this.parseMarketPrices(marketId, market);
    } catch (error) {
      console.error(`Error fetching prices for market ${marketId}:`, error);
      throw error;
    }
  }

  /**
   * Get order book for a market (for better price discovery)
   */
  async getOrderBook(marketId: string, outcome: 'YES' | 'NO'): Promise<{ bids: Array<{ price: number; size: number }>; asks: Array<{ price: number; size: number }> }> {
    try {
      // Get token ID for the outcome
      const tokenId = await this.getTokenId(marketId, outcome);
      
      const response = await fetch(
        `${this.clobApiUrl}/book?token_id=${tokenId}`,
        {
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        throw new Error(`API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json() as any;
      return {
        bids: (data.bids || []).map((b: any) => ({ price: parseFloat(b.price), size: parseFloat(b.size) })),
        asks: (data.asks || []).map((a: any) => ({ price: parseFloat(a.price), size: parseFloat(a.size) })),
      };
    } catch (error) {
      console.error(`Error fetching order book for ${marketId} ${outcome}:`, error);
      throw error;
    }
  }

  /**
   * Place an order using CLOB API
   * Requires private key for signing
   */
  async placeOrder(order: Order): Promise<string> {
    if (!this.privateKey) {
      throw new Error('Private key is required for trading. Set POLYMARKET_PRIVATE_KEY in .env');
    }

    try {
      // Get token ID for the outcome
      const tokenId = await this.getTokenId(order.marketId, order.outcome);
      
      // Convert price from probability (0-1) to price in cents (0-10000)
      const priceInCents = Math.round(order.price * 10000);
      
      // Convert size from USD to token amount
      // Size in tokens = USD / price
      const sizeInTokens = Math.floor((order.size * 10000) / priceInCents);

      // Create order payload
      const orderPayload = {
        token_id: tokenId,
        side: order.side.toLowerCase(), // 'buy' or 'sell'
        price: priceInCents.toString(),
        size: sizeInTokens.toString(),
        // Additional fields for CLOB API
        nonce: Date.now().toString(),
        expiration: Math.floor(Date.now() / 1000) + 60 * 60, // 1 hour expiration
      };

      // Sign the order (simplified - actual implementation needs proper signing)
      const signature = await this.signOrder(orderPayload);

      const response = await fetch(`${this.clobApiUrl}/orders`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...orderPayload,
          signature,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API error: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const data = await response.json() as any;
      return data.order_id || data.id || JSON.stringify(data);
    } catch (error) {
      console.error('Error placing order:', error);
      throw error;
    }
  }

  /**
   * Get current positions
   * Uses CLOB API
   * Note: This endpoint may not be available in all Polymarket API versions
   * Returns empty array if endpoint is not available
   */
  async getPositions(): Promise<Position[]> {
    if (!this.privateKey) {
      // Silently return empty if no private key (read-only mode)
      return [];
    }

    try {
      // Try multiple possible endpoints
      const endpoints = [
        `${this.clobApiUrl}/positions`,
        `${this.clobApiUrl}/user/positions`,
        `${this.dataApiUrl}/user/positions`,
      ];

      for (const endpoint of endpoints) {
        try {
          const response = await fetch(endpoint, {
            headers: {
              'Authorization': `Bearer ${this.apiKey}`,
              'Content-Type': 'application/json',
            },
          });

          if (response.ok) {
            const data = await response.json() as any;
            return this.parsePositions(data);
          }
        } catch (e) {
          // Try next endpoint
          continue;
        }
      }

      // If all endpoints fail, return empty array (positions will be tracked locally)
      return [];
    } catch (error) {
      // Silently return empty array - positions will be tracked locally
      return [];
    }
  }

  /**
   * Get open orders
   */
  async getOpenOrders(): Promise<any[]> {
    if (!this.privateKey) {
      return [];
    }

    try {
      const response = await fetch(`${this.clobApiUrl}/orders`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      return Array.isArray(data) ? data : [];
    } catch (error) {
      console.error('Error fetching open orders:', error);
      throw error;
    }
  }

  /**
   * Cancel an order
   */
  async cancelOrder(orderId: string): Promise<void> {
    if (!this.privateKey) {
      throw new Error('Private key is required for trading');
    }

    try {
      const response = await fetch(`${this.clobApiUrl}/orders/${orderId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status} ${response.statusText}`);
      }
    } catch (error) {
      console.error(`Error canceling order ${orderId}:`, error);
      throw error;
    }
  }

  /**
   * Get token ID for a market outcome
   * Polymarket uses token IDs for trading
   */
  private async getTokenId(marketId: string, outcome: 'YES' | 'NO'): Promise<string> {
    try {
      const response = await fetch(
        `${this.dataApiUrl}/markets/${marketId}`,
        {
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        throw new Error(`API error: ${response.status} ${response.statusText}`);
      }

      const market = await response.json() as any;
      
      // Find the token for the outcome
      const tokens = market.tokens || [];
      const token = tokens.find((t: any) => 
        t.outcome === outcome || 
        (outcome === 'YES' && t.side === 'yes') ||
        (outcome === 'NO' && t.side === 'no')
      );

      if (!token || !token.token_id) {
        throw new Error(`Token ID not found for ${marketId} ${outcome}`);
      }

      return token.token_id;
    } catch (error) {
      console.error(`Error getting token ID for ${marketId} ${outcome}:`, error);
      throw error;
    }
  }

  /**
   * Sign an order using EIP-712 standard
   */
  private async signOrder(order: any): Promise<string> {
    if (!this.privateKey) {
      throw new Error('Private key required for signing');
    }
    
    try {
      // Try to use ethers.js if available
      const { Wallet } = await import('ethers');
      const wallet = new Wallet(this.privateKey);
      
      // Polymarket CLOB EIP-712 domain
      const domain = {
        name: 'Polymarket',
        version: '1',
        chainId: 137, // Polygon mainnet
        verifyingContract: '0x4bFb41d5B3570DeFd03C39a9A4D35d77Ee8f8F91', // CLOB contract
      };
      
      // Order types for EIP-712
      const types = {
        Order: [
          { name: 'tokenId', type: 'string' },
          { name: 'side', type: 'string' },
          { name: 'price', type: 'string' },
          { name: 'size', type: 'string' },
          { name: 'nonce', type: 'string' },
          { name: 'expiration', type: 'uint256' },
        ],
      };
      
      // Sign the order
      const signature = await wallet.signTypedData(domain, types, order);
      return signature;
    } catch (error) {
      // Fallback: if ethers.js not available or signing fails
      console.warn('⚠️  EIP-712 signing failed, using placeholder. Install ethers: bun add ethers');
      console.warn('⚠️  Error:', error);
      return '0x' + '0'.repeat(130); // Placeholder signature (will fail on real API)
    }
  }

  /**
   * Parse markets from API response
   */
  private parseMarkets(data: any): Market[] {
    if (!Array.isArray(data)) {
      return [];
    }

    return data.map((market: any) => ({
      id: market.id || market.market_id || market.slug,
      question: market.question || market.title || '',
      slug: market.slug || market.id,
      endDate: market.end_date_iso || market.endDate || market.resolution_date,
      liquidity: parseFloat(market.liquidity || market.liquidity_num || '0'),
      volume: parseFloat(market.volume || market.volume24h || '0'),
      active: !market.closed && market.active !== false,
    })).filter((m: Market) => m.id && m.question);
  }

  /**
   * Parse market prices from API response
   */
  private parseMarketPrices(marketId: string, market: any): MarketPrice[] {
    const prices: MarketPrice[] = [];
    
    // Try different response formats
    const tokens = market.tokens || [];
    const liquidity = parseFloat(market.liquidity || market.liquidity_num || '0');
    const volume24h = parseFloat(market.volume24h || market.volume || '0');

    for (const token of tokens) {
      const outcome = token.outcome === 'Yes' || token.outcome === 'YES' || token.side === 'yes' 
        ? 'YES' 
        : 'NO';
      
      // Price can be in different formats
      const price = token.price 
        ? parseFloat(token.price) 
        : token.probability 
        ? parseFloat(token.probability)
        : 0.5;

      prices.push({
        marketId,
        outcome,
        price: price > 1 ? price / 100 : price, // Convert percentage to decimal if needed
        liquidity: liquidity / 2, // Split liquidity between YES and NO
        volume24h: volume24h / 2,
      });
    }

    // If no tokens found, try alternative format
    if (prices.length === 0) {
      const yesPrice = market.yes_price || market.yesPrice || market.probability_yes || 0.5;
      const noPrice = market.no_price || market.noPrice || market.probability_no || 0.5;
      
      prices.push(
        {
          marketId,
          outcome: 'YES',
          price: yesPrice > 1 ? yesPrice / 100 : yesPrice,
          liquidity: liquidity / 2,
          volume24h: volume24h / 2,
        },
        {
          marketId,
          outcome: 'NO',
          price: noPrice > 1 ? noPrice / 100 : noPrice,
          liquidity: liquidity / 2,
          volume24h: volume24h / 2,
        }
      );
    }

    return prices;
  }

  /**
   * Parse positions from API response
   */
  private parsePositions(data: any): Position[] {
    if (!Array.isArray(data)) {
      return [];
    }

    return data.map((pos: any) => {
      const size = parseFloat(pos.size || pos.quantity || '0');
      const avgPrice = parseFloat(pos.average_price || pos.entry_price || pos.price || '0');
      const currentPrice = parseFloat(pos.current_price || pos.mark_price || avgPrice);
      
      const pnlPercent = avgPrice > 0 
        ? ((currentPrice - avgPrice) / avgPrice) * 100 
        : 0;
      const pnl = size * (pnlPercent / 100);

      return {
        marketId: pos.market_id || pos.marketId || '',
        outcome: pos.outcome === 'Yes' || pos.outcome === 'YES' ? 'YES' : 'NO',
        size,
        averagePrice: avgPrice > 1 ? avgPrice / 100 : avgPrice,
        currentPrice: currentPrice > 1 ? currentPrice / 100 : currentPrice,
        pnl,
        pnlPercent,
      };
    });
  }
}
