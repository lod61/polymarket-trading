/**
 * 数据收集器 - 只计算和记录，不下单
 * 
 * 功能：
 * 1. 使用真实 API 获取市场数据
 * 2. 分析市场并生成信号
 * 3. 记录所有分析结果到文件
 * 4. 持续运行，收集数据
 * 
 * Usage:
 * bun run src/data-collector.ts
 */

import 'dotenv/config';
import { PolymarketClientSimple } from './polymarket-client-simple.js';
import { ShortTermStrategy } from './short-term-strategy.js';
import { ChainlinkClient } from './chainlink-client.js';
import { KLineClient } from './kline-client.js';
import { Market, MarketPrice, TradeSignal } from './types.js';
import { writeFile, appendFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';

interface AnalysisRecord {
  timestamp: string;
  marketId: string;
  slug: string;
  question: string;
  symbol: string;
  yesPrice: number;
  noPrice: number;
  liquidity: number;
  volume24h: number;
  signal: {
    outcome: 'YES' | 'NO' | null;
    probability: number | null;
    confidence: number | null;
    signalStrength: number | null;
    recommendedSize: number | null;
    reason: string | null;
  };
  factors: {
    momentum: number | null;
    volatility: number | null;
    pricingDeviation: number | null;
    volumeAnomaly: number | null;
    timeFactor: number | null;
  };
  chainlinkPrice: number | null;
  klineData: {
    count: number;
    firstPrice: number | null;
    lastPrice: number | null;
    priceChange: number | null;
  };
  marketStartTime: number | null;
  marketEndTime: number | null;
}

class DataCollector {
  private polymarketClient: PolymarketClientSimple;
  private strategy: ShortTermStrategy;
  private chainlinkClient: ChainlinkClient;
  private klineClient: KLineClient;
  private dataDir: string;
  private recordsFile: string;
  private signalsFile: string;
  private isRunning: boolean = false;
  private pollInterval: number = 30000; // 30秒
  private bestOpportunities: Map<string, AnalysisRecord> = new Map();

  constructor() {
    this.polymarketClient = new PolymarketClientSimple();
    
    const rpcUrl = process.env.POLYGON_RPC_URL || 'https://polygon-rpc.com';
    this.chainlinkClient = new ChainlinkClient(rpcUrl);
    this.klineClient = new KLineClient(this.chainlinkClient);
    
    // 使用较严格的策略配置，寻找高概率机会
    this.strategy = new ShortTermStrategy(
      this.chainlinkClient,
      this.klineClient,
      {
        minConfidence: 0.65, // 65% 最小信心度（高概率）
        minSignalStrength: 0.60, // 60% 最小信号强度
        momentumPeriods: [3, 5],
        momentumThreshold: 0.001, // 0.1% 动量阈值
        pricingDeviationThreshold: 0.05, // 5% 定价偏差阈值
      }
    );

    // 创建数据目录
    this.dataDir = join(process.cwd(), 'data');
    this.recordsFile = join(this.dataDir, 'analysis-records.jsonl');
    this.signalsFile = join(this.dataDir, 'signals.jsonl');
  }

  /**
   * 初始化数据目录
   */
  async initialize(): Promise<void> {
    if (!existsSync(this.dataDir)) {
      await mkdir(this.dataDir, { recursive: true });
    }

    console.log(`📁 数据目录: ${this.dataDir}`);
    console.log(`📝 记录文件: ${this.recordsFile}`);
    console.log(`📊 信号文件: ${this.signalsFile}`);
  }

  /**
   * 提取加密货币符号
   */
  private extractSymbol(market: Market): string | null {
    const question = market.question.toLowerCase();
    const slug = market.slug.toLowerCase();

    // 从slug中提取（优先级更高）
    if (slug.includes('btc-updown')) return 'btc';
    if (slug.includes('eth-updown')) return 'eth';
    if (slug.includes('xrp-updown')) return 'xrp';
    if (slug.includes('sol-updown')) return 'sol';
    if (slug.includes('matic-updown')) return 'matic';
    if (slug.includes('link-updown')) return 'link';

    // 从question中提取
    if (question.includes('bitcoin') || question.includes('btc')) return 'btc';
    if (question.includes('ethereum') || question.includes('eth')) return 'eth';
    if (question.includes('ripple') || question.includes('xrp')) return 'xrp';
    if (question.includes('solana') || question.includes('sol')) return 'sol';
    if (question.includes('polygon') || question.includes('matic')) return 'matic';
    if (question.includes('chainlink') || question.includes('link')) return 'link';

    return null;
  }

  /**
   * 分析单个市场
   */
  async analyzeMarket(market: Market): Promise<AnalysisRecord | null> {
    const symbol = this.extractSymbol(market);
    if (!symbol) {
      return null; // 跳过非加密货币市场
    }

    try {
      // 获取市场价格
      const prices = await this.polymarketClient.getMarketPrices(market.id);
      const yesPrice = prices.find(p => p.outcome === 'YES');
      const noPrice = prices.find(p => p.outcome === 'NO');

      if (!yesPrice || !noPrice) {
        return null;
      }

      // 获取Chainlink价格
      let chainlinkPrice: number | null = null;
      try {
        const chainlinkData = await this.chainlinkClient.getPrice(symbol.toUpperCase());
        chainlinkPrice = chainlinkData?.price || null;
      } catch (error) {
        // Chainlink价格不可用，继续分析
      }

      // 获取K线数据
      const klines = await this.klineClient.get15mKlines(symbol, 50);
      
      // 计算各个因子（通过反射访问私有方法）
      let momentum: number | null = null;
      let volatility: number | null = null;
      let pricingDeviation: number | null = null;
      let volumeAnomaly: number | null = null;
      let timeFactor: number | null = null;

      try {
        momentum = (this.strategy as any).calculateMomentum(klines);
        volatility = (this.strategy as any).calculateVolatility(klines);
        
        if (chainlinkPrice) {
          pricingDeviation = (this.strategy as any).calculatePricingDeviation(
            chainlinkPrice,
            klines,
            yesPrice.price
          );
        }
        
        volumeAnomaly = (this.strategy as any).calculateVolumeAnomaly(klines, yesPrice.volume24h);
        
        const marketStartTime = market.endDate ? Date.parse(market.endDate) - 15 * 60 * 1000 : undefined;
        if (marketStartTime) {
          timeFactor = (this.strategy as any).calculateTimeFactor(klines, marketStartTime);
        }
      } catch (error) {
        // 因子计算失败，继续记录其他数据
      }

      // 生成交易信号
      const marketStartTime = market.endDate ? Date.parse(market.endDate) - 15 * 60 * 1000 : undefined;
      const signal = await this.strategy.analyzeMarket(
        symbol,
        market.id,
        prices,
        marketStartTime
      );

      // 构建记录
      const record: AnalysisRecord = {
        timestamp: new Date().toISOString(),
        marketId: market.id,
        slug: market.slug,
        question: market.question,
        symbol,
        yesPrice: yesPrice.price,
        noPrice: noPrice.price,
        liquidity: market.liquidity,
        volume24h: yesPrice.volume24h,
        signal: {
          outcome: signal?.outcome || null,
          probability: signal?.probability || null,
          confidence: signal?.confidence || null,
          signalStrength: signal?.signalStrength || null,
          recommendedSize: signal?.recommendedSize || null,
          reason: signal?.reason || null,
        },
        factors: {
          momentum,
          volatility,
          pricingDeviation,
          volumeAnomaly,
          timeFactor,
        },
        chainlinkPrice,
        klineData: {
          count: klines.length,
          firstPrice: klines.length > 0 ? klines[0].close : null,
          lastPrice: klines.length > 0 ? klines[klines.length - 1].close : null,
          priceChange: klines.length > 0 
            ? ((klines[klines.length - 1].close - klines[0].close) / klines[0].close) * 100
            : null,
        },
        marketStartTime: marketStartTime || null,
        marketEndTime: market.endDate ? Date.parse(market.endDate) : null,
      };

      return record;
    } catch (error) {
      console.error(`❌ 分析市场失败 ${market.id}:`, error);
      return null;
    }
  }

  /**
   * 记录分析结果
   */
  async recordAnalysis(record: AnalysisRecord): Promise<void> {
    // 记录所有分析结果（JSONL格式）
    const line = JSON.stringify(record) + '\n';
    await appendFile(this.recordsFile, line, 'utf-8');

    // 如果有信号，单独记录
    if (record.signal.outcome) {
      const signalLine = JSON.stringify(record) + '\n';
      await appendFile(this.signalsFile, signalLine, 'utf-8');

      // 更新最佳机会
      const key = record.marketId;
      const existing = this.bestOpportunities.get(key);
      if (!existing || (record.signal.confidence || 0) > (existing.signal.confidence || 0)) {
        this.bestOpportunities.set(key, record);
      }
    }
  }

  /**
   * 保存最佳机会摘要
   */
  async saveBestOpportunities(): Promise<void> {
    const summaryFile = join(this.dataDir, 'best-opportunities.json');
    const opportunities = Array.from(this.bestOpportunities.values())
      .sort((a, b) => (b.signal.confidence || 0) - (a.signal.confidence || 0))
      .slice(0, 50); // 保存前50个最佳机会

    await writeFile(summaryFile, JSON.stringify(opportunities, null, 2), 'utf-8');
    console.log(`\n💾 已保存 ${opportunities.length} 个最佳机会到 ${summaryFile}`);
  }

  /**
   * 运行一次数据收集
   */
  async collectOnce(): Promise<void> {
    try {
      console.log(`\n${'='.repeat(70)}`);
      console.log(`🕐 ${new Date().toLocaleString()}`);
      console.log(`${'='.repeat(70)}`);

      // 获取活跃市场
      console.log('📊 获取活跃市场...');
      let markets = await this.polymarketClient.getCryptoMarkets();
      
      // 如果getCryptoMarkets已经过滤了，直接使用；否则需要进一步过滤
      // 过滤Up/Down 15m市场（包括15m、hourly、4hour）
      const upDownMarkets = markets.filter(m => {
        const slug = (m.slug || '').toLowerCase();
        const question = (m.question || '').toLowerCase();
        
        // 匹配Up/Down市场模式
        const isUpDown = 
          slug.includes('-updown-15m') ||
          slug.includes('-updown-hourly') ||
          slug.includes('-updown-4hour') ||
          question.includes('up or down') ||
          question.includes('up/down');
        
        return (
          isUpDown &&
          m.active &&
          m.liquidity >= 1000 // 最小流动性$1000
        );
      });

      console.log(`✅ 找到 ${upDownMarkets.length} 个活跃的Up/Down 15m市场`);

      if (upDownMarkets.length === 0) {
        console.log('⚠️  没有找到活跃市场，等待下次轮询...');
        return;
      }

      // 分析每个市场
      let analyzedCount = 0;
      let signalCount = 0;

      for (const market of upDownMarkets) {
        const record = await this.analyzeMarket(market);
        
        if (record) {
          analyzedCount++;
          await this.recordAnalysis(record);

          if (record.signal.outcome) {
            signalCount++;
            console.log(`\n✅ 发现信号: ${market.slug}`);
            console.log(`   方向: ${record.signal.outcome}`);
            console.log(`   信心度: ${((record.signal.confidence || 0) * 100).toFixed(1)}%`);
            console.log(`   信号强度: ${((record.signal.signalStrength || 0) * 100).toFixed(1)}%`);
            console.log(`   推荐仓位: $${(record.signal.recommendedSize || 0).toFixed(2)}`);
            console.log(`   原因: ${record.signal.reason || 'N/A'}`);
          }

          // 避免请求过快
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }

      console.log(`\n📈 本轮分析完成:`);
      console.log(`   分析市场数: ${analyzedCount}`);
      console.log(`   发现信号数: ${signalCount}`);
      console.log(`   最佳机会数: ${this.bestOpportunities.size}`);

      // 定期保存最佳机会
      if (this.bestOpportunities.size > 0) {
        await this.saveBestOpportunities();
      }
    } catch (error) {
      console.error('❌ 数据收集错误:', error);
    }
  }

  /**
   * 启动数据收集器
   */
  async start(): Promise<void> {
    console.log('🚀 启动数据收集器');
    console.log('📝 模式: 只计算和记录，不下单');
    console.log(`⏱️  轮询间隔: ${this.pollInterval / 1000}秒`);
    console.log(`🎯 策略: 短期多因子策略（高概率机会）`);
    console.log(`   最小信心度: 65%`);
    console.log(`   最小信号强度: 60%`);
    console.log('\n');

    await this.initialize();
    this.isRunning = true;

    // 启动时立即收集一次
    await this.collectOnce();

    // 定期收集
    while (this.isRunning) {
      await new Promise(resolve => setTimeout(resolve, this.pollInterval));
      
      if (this.isRunning) {
        await this.collectOnce();
      }
    }
  }

  /**
   * 停止数据收集器
   */
  stop(): void {
    console.log('\n🛑 停止数据收集器...');
    this.isRunning = false;
    
    // 保存最终的最佳机会
    this.saveBestOpportunities().catch(console.error);
  }
}

// 主函数
async function main() {
  const collector = new DataCollector();

  // 优雅退出
  process.on('SIGINT', () => {
    console.log('\n🛑 收到 SIGINT，正在停止...');
    collector.stop();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    console.log('\n🛑 收到 SIGTERM，正在停止...');
    collector.stop();
    process.exit(0);
  });

  // 启动收集器
  await collector.start();
}

// 运行
main().catch(error => {
  console.error('❌ 致命错误:', error);
  process.exit(1);
});

