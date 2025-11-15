/**
 * Chainlink On-Chain Price Feeds Client
 * 
 * Uses Chainlink Price Feeds directly from blockchain
 * Requires: ethers.js and RPC connection
 * 
 * Example usage:
 * ```typescript
 * import { ethers } from 'ethers';
 * 
 * const provider = new ethers.JsonRpcProvider('https://polygon-rpc.com');
 * const client = new ChainlinkOnChainClient(provider);
 * const price = await client.getPrice('BTC');
 * ```
 */
import { ethers } from 'ethers';
import { ChainlinkPrice } from './chainlink-client.js';

export interface ChainlinkFeedAddress {
  address: string;
  decimals: number;
  description: string;
}

export class ChainlinkOnChainClient {
  // Chainlink Price Feed addresses on Polygon (mainnet)
  // Source: https://docs.chain.link/data-feeds/price-feeds/addresses
  private readonly FEED_ADDRESSES: Record<string, ChainlinkFeedAddress> = {
    'BTC': {
      address: '0xc907E116054Ad103354f2D350FD2514433D57F6F4', // BTC/USD on Polygon
      decimals: 8,
      description: 'Bitcoin / USD',
    },
    'ETH': {
      address: '0xF9680D99D6C9589e2a93a78A04A279e509205945', // ETH/USD on Polygon
      decimals: 8,
      description: 'Ethereum / USD',
    },
    'MATIC': {
      address: '0xAB594600376Ec9fD91F8e885dADF0CE036862dE0', // MATIC/USD on Polygon
      decimals: 8,
      description: 'Polygon / USD',
    },
    'LINK': {
      address: '0xd9FFdb71EbE7496cC440152d43986Aae0AB76665', // LINK/USD on Polygon
      decimals: 8,
      description: 'Chainlink / USD',
    },
    // Note: SOL/USD may not be available on Polygon Chainlink feeds
    // You may need to use a different network or data source for SOL
  };

  private provider: ethers.Provider;
  private chainlinkAbi: string[];

  constructor(provider: ethers.Provider) {
    this.provider = provider;
    // Chainlink Price Feed ABI
    this.chainlinkAbi = [
      'function latestRoundData() external view returns (uint80 roundId, int256 price, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)',
      'function decimals() external view returns (uint8)',
      'function description() external view returns (string)',
    ];
  }

  /**
   * Get price from Chainlink Price Feed contract
   */
  async getPrice(symbol: string): Promise<ChainlinkPrice | null> {
    const feed = this.FEED_ADDRESSES[symbol.toUpperCase()];
    if (!feed) {
      return null;
    }

    try {
      // Validate address format
      // Some addresses may be invalid, skip on-chain fetch if address is invalid
      let address: string;
      try {
        // Try to validate and checksum the address
        address = ethers.getAddress(feed.address);
      } catch (e: any) {
        // Address is invalid, return null to use fallback
        console.warn(`⚠️  Invalid Chainlink feed address for ${symbol}: ${feed.address}`);
        console.warn(`   Error: ${e.message}`);
        return null;
      }
      
      const contract = new ethers.Contract(address, this.chainlinkAbi, this.provider);
      const roundData = await contract.latestRoundData();
      
      // Extract price from round data
      // roundData structure: [roundId, price, startedAt, updatedAt, answeredInRound]
      const priceBigInt = roundData[1]; // price is at index 1
      const updatedAt = Number(roundData[3]); // updatedAt is at index 3
      
      // Convert price from BigInt to number, accounting for decimals
      const price = Number(priceBigInt) / Math.pow(10, feed.decimals);
      
      if (price <= 0) {
        return null;
      }

      return {
        symbol: symbol.toUpperCase(),
        price,
        timestamp: updatedAt * 1000, // Convert to milliseconds
        source: 'chainlink-onchain',
      };
    } catch (error) {
      console.error(`Error fetching Chainlink on-chain price for ${symbol}:`, error);
      return null;
    }
  }

  /**
   * Get multiple prices at once
   */
  async getPrices(symbols: string[]): Promise<Map<string, ChainlinkPrice>> {
    const prices = new Map<string, ChainlinkPrice>();
    
    const promises = symbols.map(async (symbol) => {
      const price = await this.getPrice(symbol);
      if (price) {
        prices.set(symbol.toUpperCase(), price);
      }
    });

    await Promise.all(promises);
    return prices;
  }
}

/**
 * Note: To use this client:
 * 
 * 1. Install ethers.js:
 *    bun add ethers
 * 
 * 2. Configure provider:
 *    import { ethers } from 'ethers';
 *    const provider = new ethers.JsonRpcProvider('YOUR_RPC_URL');
 * 
 * 3. Use client:
 *    const client = new ChainlinkOnChainClient(provider);
 *    const price = await client.getPrice('BTC');
 */

