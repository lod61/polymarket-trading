import { PolymarketClient } from './polymarket-client.js';
import { ShortTermStrategy } from './short-term-strategy.js';
import { ChainlinkClient } from './chainlink-client.js';
import { KLineClient } from './kline-client.js';
import { RiskManager } from './risk-manager.js';
import { Market, MarketPrice, Position, TradeSignal, TradingConfig, Order } from './types.js';

/**
 * Main Trading Bot with Short-Term Multi-Factor Strategy
 * Orchestrates market monitoring, signal generation, and trade execution
 */
export class TradingBot {
  private client: PolymarketClient;
  private strategy: ShortTermStrategy;
  private riskManager: RiskManager;
  private config: TradingConfig;
  private isRunning: boolean = false;
  private positions: Map<string, Position> = new Map();
  private chainlinkClient: ChainlinkClient;
  private klineClient: KLineClient;

  constructor(config: TradingConfig) {
    this.config = config;
    this.client = new PolymarketClient();
    const rpcUrl = process.env.POLYGON_RPC_URL || 'https://polygon-rpc.com';
    
    // Initialize Chainlink and K-line clients for short-term strategy
    this.chainlinkClient = new ChainlinkClient(rpcUrl);
    this.klineClient = new KLineClient(this.chainlinkClient);
    
    // Initialize short-term multi-factor strategy
    this.strategy = new ShortTermStrategy(this.chainlinkClient, this.klineClient, {
      minConfidence: config.minWinProbability || 0.60,
      minSignalStrength: 0.55,
      momentumPeriods: [3, 5],
      momentumThreshold: 0.001,
    });
    
    this.riskManager = new RiskManager(config);
  }

  /**
   * Start the trading bot
   */
  async start(): Promise<void> {
    console.log('🚀 Starting Polymarket Trading Bot...');
    console.log(`📊 Strategy: Short-Term Multi-Factor Strategy`);
    console.log(`   - Momentum (3-5 periods)`);
    console.log(`   - Pricing Deviation (Arbitrage)`);
    console.log(`   - Volatility Analysis`);
    console.log(`   - Volume Anomaly Detection`);
    console.log(`   - Time Factor`);
    console.log(`💰 Max position size: $${this.config.maxPositionSizeUsd}`);
    console.log(`🛡️  Max daily loss: $${this.config.maxDailyLossUsd}`);
    console.log(`⏱️  Poll interval: ${this.config.pollIntervalMs}ms`);
    console.log(`🎯 Min confidence: ${(this.config.minWinProbability * 100).toFixed(1)}%\n`);

    this.isRunning = true;

    // Load existing positions
    await this.loadPositions();

    // Start main loop
    while (this.isRunning) {
      try {
        await this.tick();
      } catch (error) {
        console.error('❌ Error in trading loop:', error);
      }

      await this.sleep(this.config.pollIntervalMs);
    }
  }

  /**
   * Stop the trading bot
   */
  stop(): void {
    console.log('🛑 Stopping trading bot...');
    this.isRunning = false;
  }

  /**
   * Main trading loop
   */
  private async tick(): Promise<void> {
    console.log(`\n[${new Date().toISOString()}] 🔄 Checking markets...`);

    // Get crypto markets
    const markets = await this.client.getCryptoMarkets();
    console.log(`📈 Found ${markets.length} active markets`);

    // Update positions
    await this.updatePositions();

    // Check for exit signals
    await this.checkExitSignals();

    // Check for new entry signals
    // Markets are already filtered by getCryptoMarkets() to include Up/Down 15m markets
    // Filter by liquidity and active status
    const activeMarkets = markets.filter(m => {
      if (!m.active || m.liquidity < this.config.minMarketLiquidityUsd) {
        return false;
      }
      
      // Markets from getCryptoMarkets() are already Up/Down 15m markets
      // Just verify by slug pattern
      const slug = (m.slug || '').toLowerCase();
      const slugPattern = /(btc|eth|xrp|sol|matic|link)-updown-15m-\d+/;
      return slugPattern.test(slug);
    });
    
    console.log(`🎯 Found ${activeMarkets.length} active Up/Down 15m markets`);
    
    for (const market of activeMarkets.slice(0, 10)) { // Limit to first 10 for performance
      try {
        // Extract symbol from market slug or question
        const symbol = this.extractSymbol(market.question, market.slug);
        if (!symbol) {
          continue; // Skip if can't extract symbol
        }

        const prices = await this.client.getMarketPrices(market.id);
        
        // For persistent markets (15 minute, hourly, 4 hour), they run continuously
        // Each period resets automatically, so we don't have a fixed start time
        // The strategy will use current time as reference
        const marketStartTime = undefined;

        const signal = await this.strategy.analyzeMarket(
          symbol,
          market.id,
          prices,
          marketStartTime
        );

        if (signal) {
          await this.handleSignal(signal, prices, market);
        }
      } catch (error) {
        console.error(`Error processing market ${market.id}:`, error);
      }
    }

    // Print status
    this.printStatus();
  }

  /**
   * Extract crypto symbol from market question or slug
   * Handles persistent markets like "Bitcoin Up or Down - 15 minute"
   */
  private extractSymbol(question: string, slug?: string): string | null {
    const symbolMap: Record<string, string> = {
      'bitcoin': 'btc',
      'btc': 'btc',
      'ethereum': 'eth',
      'eth': 'eth',
      'xrp': 'xrp',
      'ripple': 'xrp',
      'solana': 'sol',
      'sol': 'sol',
      'polygon': 'matic',
      'matic': 'matic',
      'chainlink': 'link',
      'link': 'link',
      'binance': 'bnb',
      'bnb': 'bnb',
      'cardano': 'ada',
      'ada': 'ada',
      'polkadot': 'dot',
      'dot': 'dot',
      'avalanche': 'avax',
      'avax': 'avax',
    };
    
    const lowerQuestion = question.toLowerCase();
    const lowerSlug = (slug || '').toLowerCase();
    
    // Check question first (more reliable for persistent markets)
    for (const [keyword, symbol] of Object.entries(symbolMap)) {
      if (lowerQuestion.includes(keyword)) {
        return symbol;
      }
    }
    
    // Fallback to slug
    for (const [keyword, symbol] of Object.entries(symbolMap)) {
      if (lowerSlug.includes(keyword)) {
        return symbol;
      }
    }
    
    return null;
  }

  /**
   * Handle a trading signal
   */
  private async handleSignal(signal: TradeSignal, prices: MarketPrice[], market: Market): Promise<void> {
    console.log(`\n📊 Signal detected: ${signal.reason}`);
    console.log(`   Market: ${signal.marketId}`);
    console.log(`   Outcome: ${signal.outcome}`);
    console.log(`   Probability: ${(signal.probability * 100).toFixed(1)}%`);
    console.log(`   Confidence: ${(signal.confidence * 100).toFixed(1)}%`);

    const currentPositions = Array.from(this.positions.values());

    // Check risk limits
    if (!this.riskManager.canOpenPosition(signal, currentPositions)) {
      console.log('   ⚠️  Risk check failed, skipping trade');
      return;
    }

    // Adjust position size
    const positionSize = this.riskManager.adjustPositionSize(signal, currentPositions);
    console.log(`   💰 Position size: $${positionSize.toFixed(2)}`);

    // Place order
    const targetPrice = prices.find(p => p.outcome === signal.outcome)?.price || signal.probability;
    
    const order: Order = {
      marketId: signal.marketId,
      outcome: signal.outcome,
      side: 'BUY',
      size: positionSize,
      price: targetPrice,
    };

    try {
      console.log(`\n📤 Placing order...`);
      console.log(`   Market: ${market.question}`);
      console.log(`   Side: BUY ${signal.outcome}`);
      console.log(`   Size: $${positionSize.toFixed(2)}`);
      console.log(`   Price: ${(targetPrice * 100).toFixed(2)}%`);
      
      const orderId = await this.client.placeOrder(order);
      console.log(`   ✅ Order placed successfully!`);
      console.log(`   Order ID: ${orderId}`);
      
      // Track position
      const position: Position = {
        marketId: signal.marketId,
        outcome: signal.outcome,
        size: positionSize,
        averagePrice: targetPrice,
        currentPrice: targetPrice,
        pnl: 0,
        pnlPercent: 0,
      };
      
      this.positions.set(signal.marketId, position);
      console.log(`   📦 Position tracked: ${signal.outcome} @ ${(targetPrice * 100).toFixed(2)}%`);
    } catch (error: any) {
      console.error(`   ❌ Failed to place order:`);
      console.error(`   Error: ${error.message || error}`);
      
      // Check if it's a signing error
      if (error.message?.includes('signing') || error.message?.includes('signature') || error.message?.includes('private key')) {
        console.error(`\n   💡 Tip: Make sure you have:`);
        console.error(`      1. POLYMARKET_PRIVATE_KEY set in .env`);
        console.error(`      2. ethers.js installed: bun add ethers`);
        console.error(`      3. Valid private key format (0x...)`);
      }
    }
  }

  /**
   * Update existing positions
   * Note: If API endpoint is not available, positions are tracked locally only
   */
  private async updatePositions(): Promise<void> {
    try {
      const positions = await this.client.getPositions();
      
      // Only update if API returned positions
      if (positions.length > 0) {
        for (const position of positions) {
          this.positions.set(position.marketId, position);
        }
      }
      // If empty, continue using locally tracked positions
    } catch (error) {
      // Silently continue - positions are tracked locally
      // This allows the bot to continue even if positions API is unavailable
    }
  }

  /**
   * Check for exit signals
   */
  private async checkExitSignals(): Promise<void> {
    for (const [marketId, position] of this.positions.entries()) {
      try {
        const prices = await this.client.getMarketPrices(marketId);
        const currentPrice = prices.find(p => p.outcome === position.outcome)?.price || position.currentPrice;

        // Update position P&L
        const pnlPercent = position.outcome === 'YES'
          ? ((currentPrice - position.averagePrice) / position.averagePrice) * 100
          : ((position.averagePrice - currentPrice) / position.averagePrice) * 100;

        position.currentPrice = currentPrice;
        position.pnl = position.size * (pnlPercent / 100);
        position.pnlPercent = pnlPercent;

        // Check exit conditions
        // Note: ShortTermStrategy doesn't have shouldExitPosition, using risk manager only
        if (this.riskManager.shouldClosePosition(position)) {
          console.log(`\n🔄 Exit signal for ${marketId}:`);
          console.log(`   P&L: $${position.pnl.toFixed(2)} (${position.pnlPercent.toFixed(2)}%)`);
          
          // Place sell order
          const order: Order = {
            marketId,
            outcome: position.outcome,
            side: 'SELL',
            size: position.size,
            price: currentPrice,
          };

          try {
            await this.client.placeOrder(order);
            console.log(`   ✅ Exit order placed`);
            this.positions.delete(marketId);
            this.riskManager.updateDailyPnL(position.pnl);
          } catch (error) {
            console.error(`   ❌ Failed to place exit order:`, error);
          }
        }
      } catch (error) {
        console.error(`Error checking exit for ${marketId}:`, error);
      }
    }
  }

  /**
   * Load existing positions
   * Note: If API endpoint is not available, starts with empty positions
   */
  private async loadPositions(): Promise<void> {
    try {
      const positions = await this.client.getPositions();
      if (positions.length > 0) {
        for (const position of positions) {
          this.positions.set(position.marketId, position);
        }
        console.log(`📦 Loaded ${positions.length} existing positions from API`);
      } else {
        console.log(`📦 Starting with empty positions (positions will be tracked locally)`);
      }
    } catch (error) {
      // Silently continue - positions will be tracked locally
      console.log(`📦 Starting with empty positions (API unavailable, tracking locally)`);
    }
  }

  /**
   * Print current status
   */
  private printStatus(): void {
    const positions = Array.from(this.positions.values());
    const totalPnL = positions.reduce((sum, p) => sum + p.pnl, 0);
    const dailyPnL = this.riskManager.getDailyPnL();

    console.log(`\n📊 Status:`);
    console.log(`   Positions: ${positions.length}/${this.config.maxPositions}`);
    console.log(`   Total P&L: $${totalPnL.toFixed(2)}`);
    console.log(`   Daily P&L: $${dailyPnL.toFixed(2)}`);
    
    if (positions.length > 0) {
      console.log(`\n   Open positions:`);
      positions.forEach(p => {
        const sign = p.pnl >= 0 ? '+' : '';
        console.log(`   - ${p.marketId}: ${sign}$${p.pnl.toFixed(2)} (${sign}${p.pnlPercent.toFixed(2)}%)`);
      });
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

