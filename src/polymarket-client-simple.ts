/**
 * Simplified Polymarket Client (Read-Only)
 * 
 * This version only uses the public Market Data API
 * Perfect for testing and development without trading permissions
 */
import { Market, MarketPrice } from './types.js';
import { API_CONFIG } from './config.js';

export class PolymarketClientSimple {
  private dataApiUrl: string;

  constructor() {
    this.dataApiUrl = API_CONFIG.dataApiUrl || 'https://gamma-api.polymarket.com';
  }

  /**
   * Get crypto markets (15-minute timeframe)
   * Specifically fetches Up/Down 15m markets for BTC, ETH, XRP, SOL, MATIC, LINK
   */
  async getCryptoMarkets(): Promise<Market[]> {
    const allMarkets: Market[] = [];
    const symbols = ['btc', 'eth', 'xrp', 'sol', 'matic', 'link'];
    
    // Generate slugs for recent and upcoming 15m markets
    const currentTimestamp = Math.floor(Date.now() / 1000);
    const roundedTimestamp = Math.floor(currentTimestamp / 900) * 900; // Round to nearest 15 minutes
    
    const slugsToCheck: string[] = [];
    
    // Check current and next 2 periods (45 minutes ahead)
    for (let i = 0; i <= 2; i++) {
      const timestamp = roundedTimestamp + (i * 900);
      for (const symbol of symbols) {
        slugsToCheck.push(`${symbol}-updown-15m-${timestamp}`);
      }
    }
    
    // Also check recent markets (last 2 periods) in case they're still active
    for (let i = 1; i <= 2; i++) {
      const timestamp = roundedTimestamp - (i * 900);
      for (const symbol of symbols) {
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
      
      // Small delay between batches
      if (i + batchSize < slugsToCheck.length) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
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
   */
  async getMarketPrices(marketId: string): Promise<MarketPrice[]> {
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
        const errorText = await response.text();
        throw new Error(`API error: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const market = await response.json();
      return this.parseMarketPrices(marketId, market);
    } catch (error) {
      console.error(`Error fetching prices for market ${marketId}:`, error);
      throw error;
    }
  }

  /**
   * Parse markets from API response
   */
  private parseMarkets(data: any): Market[] {
    if (!Array.isArray(data)) {
      return [];
    }

    return data
      .map((market: any) => ({
        id: market.id || market.market_id || market.slug,
        question: market.question || market.title || '',
        slug: market.slug || market.id,
        endDate: market.end_date_iso || market.endDate || market.resolution_date,
        liquidity: parseFloat(
          market.liquidityNum || 
          market.liquidityClob || 
          market.liquidity || 
          '0'
        ),
        volume: parseFloat(
          market.volumeNum || 
          market.volumeClob || 
          market.volume || 
          market.volume24hr || 
          '0'
        ),
        active: !market.closed && market.active !== false,
      }))
      .filter((m: Market) => m.id && m.question);
  }

  /**
   * Parse market prices from API response
   */
  private parseMarketPrices(marketId: string, market: any): MarketPrice[] {
    const prices: MarketPrice[] = [];
    
    const liquidity = parseFloat(
      market.liquidityNum || 
      market.liquidityClob || 
      market.liquidity || 
      '0'
    );
    const volume24h = parseFloat(
      market.volume24hr || 
      market.volume24hrClob || 
      market.volume24h || 
      market.volume || 
      '0'
    );

    // Try outcomePrices first (most common format)
    if (market.outcomePrices && Array.isArray(market.outcomePrices)) {
      const outcomes = market.outcomes ? JSON.parse(market.outcomes) : ['Yes', 'No'];
      market.outcomePrices.forEach((priceStr: string, index: number) => {
        const price = parseFloat(priceStr);
        const outcomeName = outcomes[index] || (index === 0 ? 'Yes' : 'No');
        const outcome = outcomeName === 'Yes' || outcomeName === 'YES' ? 'YES' : 'NO';
        
        prices.push({
          marketId,
          outcome,
          price: Math.max(0, Math.min(1, price)),
          liquidity: liquidity / Math.max(outcomes.length, 2),
          volume24h: volume24h / Math.max(outcomes.length, 2),
        });
      });
    }
    
    // Fallback: try tokens array
    if (prices.length === 0 && market.tokens && Array.isArray(market.tokens)) {
      for (const token of market.tokens) {
        const outcome = 
          token.outcome === 'Yes' || 
          token.outcome === 'YES' || 
          token.side === 'yes' ||
          token.outcome === '1'
            ? 'YES' 
            : 'NO';
        
        let price = 0.5;
        if (token.price) {
          price = parseFloat(token.price);
        } else if (token.probability) {
          price = parseFloat(token.probability);
        } else if (token.last_price) {
          price = parseFloat(token.last_price);
        }

        if (price > 1) {
          price = price / 100;
        }

        prices.push({
          marketId,
          outcome,
          price: Math.max(0, Math.min(1, price)),
          liquidity: liquidity / Math.max(market.tokens.length, 2),
          volume24h: volume24h / Math.max(market.tokens.length, 2),
        });
      }
    }

    // Fallback: try direct price fields
    if (prices.length === 0) {
      let yesPrice = parseFloat(market.bestAsk || market.lastTradePrice || '0.5');
      let noPrice = 1 - yesPrice;

      if (market.yes_price !== undefined) {
        yesPrice = parseFloat(market.yes_price);
      } else if (market.yesPrice !== undefined) {
        yesPrice = parseFloat(market.yesPrice);
      } else if (market.probability_yes !== undefined) {
        yesPrice = parseFloat(market.probability_yes);
      }

      if (market.no_price !== undefined) {
        noPrice = parseFloat(market.no_price);
      } else if (market.noPrice !== undefined) {
        noPrice = parseFloat(market.noPrice);
      } else if (market.probability_no !== undefined) {
        noPrice = parseFloat(market.probability_no);
      }

      if (yesPrice > 1) yesPrice = yesPrice / 100;
      if (noPrice > 1) noPrice = noPrice / 100;

      prices.push(
        {
          marketId,
          outcome: 'YES',
          price: Math.max(0, Math.min(1, yesPrice)),
          liquidity: liquidity / 2,
          volume24h: volume24h / 2,
        },
        {
          marketId,
          outcome: 'NO',
          price: Math.max(0, Math.min(1, noPrice)),
          liquidity: liquidity / 2,
          volume24h: volume24h / 2,
        }
      );
    }

    return prices;
  }
}

