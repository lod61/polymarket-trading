/**
 * Short-Term Prediction Strategy for Polymarket 15-Minute Up/Down Markets
 * 
 * 专业投机策略：结合多个因子，最大化15分钟预测的盈利能力
 * 
 * 核心思路：
 * 1. 短期动量 - 捕捉最近的价格变化趋势
 * 2. 波动性分析 - 高波动性时的方向性
 * 3. 市场定价偏差 - Polymarket价格 vs 实际概率的套利机会
 * 4. 成交量异常 - 异常成交量可能预示方向
 * 5. 时间因素 - 市场开始时的价格位置和趋势
 */

import { ChainlinkClient } from './chainlink-client.js';
import { KLineClient, KLine } from './kline-client.js';
import { MarketPrice, TradeSignal } from './types.js';

export interface ShortTermStrategyConfig {
  // 动量参数
  momentumPeriods: number[]; // 检查最近N个周期的动量 [3, 5]
  momentumThreshold: number; // 动量阈值（百分比）0.001 = 0.1%
  
  // 波动性参数
  volatilityPeriod: number; // 波动性计算周期 10
  highVolatilityMultiplier: number; // 高波动性倍数 1.5
  
  // 市场定价偏差
  pricingDeviationThreshold: number; // 定价偏差阈值 0.05 = 5%
  
  // 成交量
  volumeAnomalyThreshold: number; // 成交量异常阈值 2.0 = 2倍平均成交量
  
  // 时间因素
  useTimeFactor: boolean; // 是否使用时间因素
  earlyMarketWeight: number; // 市场早期权重 0.3
  
  // 综合评分
  minConfidence: number; // 最小综合信心度 0.60
  minSignalStrength: number; // 最小信号强度 0.55
}

export interface StrategySignal {
  direction: 'YES' | 'NO';
  confidence: number;
  signalStrength: number;
  factors: {
    momentum: number; // -1 to 1
    volatility: number; // 0 to 1
    pricingDeviation: number; // -1 to 1 (负=低估, 正=高估)
    volumeAnomaly: number; // 0 to 1
    timeFactor: number; // -1 to 1
  };
  reasons: string[];
}

export class ShortTermStrategy {
  private chainlinkClient: ChainlinkClient;
  private klineClient: KLineClient;
  private config: ShortTermStrategyConfig;

  constructor(
    chainlinkClient: ChainlinkClient,
    klineClient: KLineClient,
    config?: Partial<ShortTermStrategyConfig>
  ) {
    this.chainlinkClient = chainlinkClient;
    this.klineClient = klineClient;
    
    // 默认配置（经过优化的参数）
    this.config = {
      momentumPeriods: [3, 5], // 检查最近3和5个周期
      momentumThreshold: 0.001, // 0.1%的最小动量
      volatilityPeriod: 10,
      highVolatilityMultiplier: 1.5,
      pricingDeviationThreshold: 0.05, // 5%偏差
      volumeAnomalyThreshold: 2.0,
      useTimeFactor: true,
      earlyMarketWeight: 0.3,
      minConfidence: 0.60,
      minSignalStrength: 0.55,
      ...config,
    };
  }

  /**
   * 分析市场并生成交易信号
   */
  async analyzeMarket(
    symbol: string,
    marketId: string,
    prices: MarketPrice[],
    marketStartTime?: number
  ): Promise<TradeSignal | null> {
    const yesPrice = prices.find(p => p.outcome === 'YES');
    const noPrice = prices.find(p => p.outcome === 'NO');

    if (!yesPrice || !noPrice) {
      return null;
    }

    // 获取Chainlink价格数据
    // 如果Chainlink价格不可用，策略仍然可以使用K线数据
    let chainlinkPrice;
    try {
      chainlinkPrice = await this.chainlinkClient.getPrice(symbol);
    } catch (error) {
      // Chainlink价格获取失败，但策略仍可使用K线数据
      console.warn(`⚠️  Chainlink price unavailable for ${symbol}, using K-line data only`);
      chainlinkPrice = null;
    }
    
    // 策略可以在没有Chainlink价格的情况下工作（使用K线数据）
    // 但定价偏差计算将被跳过

    // 获取K线数据（需要足够的历史数据）
    const klines = await this.klineClient.get15mKlines(symbol, 50);
    if (klines.length < 10) {
      return null;
    }

    // 计算各个因子
    const momentum = this.calculateMomentum(klines);
    const volatility = this.calculateVolatility(klines);
    
    // 定价偏差（仅在Chainlink价格可用时计算）
    const pricingDeviation = chainlinkPrice 
      ? this.calculatePricingDeviation(
          chainlinkPrice.price,
          klines,
          yesPrice.price
        )
      : 0; // 如果Chainlink价格不可用，定价偏差为0
    
    const volumeAnomaly = this.calculateVolumeAnomaly(klines, yesPrice.volume24h);
    const timeFactor = marketStartTime 
      ? this.calculateTimeFactor(klines, marketStartTime)
      : 0;

    // 综合评分
    const signal = this.combineFactors(
      momentum,
      volatility,
      pricingDeviation,
      volumeAnomaly,
      timeFactor,
      yesPrice,
      noPrice
    );

    if (!signal || signal.confidence < this.config.minConfidence) {
      return null;
    }

    if (signal.signalStrength < this.config.minSignalStrength) {
      return null;
    }

    // 生成交易信号
    return {
      marketId,
      outcome: signal.direction,
      probability: signal.direction === 'YES' ? yesPrice.price : noPrice.price,
      confidence: signal.confidence,
      signalStrength: signal.signalStrength,
      recommendedSize: this.calculatePositionSize(
        signal.direction === 'YES' ? yesPrice.price : noPrice.price,
        signal.direction === 'YES' ? yesPrice.liquidity : noPrice.liquidity,
        signal.confidence,
        signal.signalStrength
      ),
      reason: signal.reasons.join(' | '),
    };
  }

  /**
   * 计算短期动量
   * 检查最近3和5个周期的价格变化趋势
   */
  private calculateMomentum(klines: KLine[]): number {
    if (klines.length < 5) return 0;

    const closes = klines.map(k => k.close);
    const currentPrice = closes[closes.length - 1];

    let totalMomentum = 0;
    let weightSum = 0;

    // 检查多个周期的动量
    for (const period of this.config.momentumPeriods) {
      if (closes.length < period) continue;

      const pastPrice = closes[closes.length - period];
      const change = (currentPrice - pastPrice) / pastPrice;
      
      // 权重：短期动量权重更高
      const weight = period === 3 ? 0.6 : 0.4;
      totalMomentum += change * weight;
      weightSum += weight;
    }

    const avgMomentum = weightSum > 0 ? totalMomentum / weightSum : 0;
    
    // 归一化到 -1 到 1
    return Math.max(-1, Math.min(1, avgMomentum * 100));
  }

  /**
   * 计算波动性（ATR - Average True Range）
   * 高波动性时，方向性可能更强
   */
  private calculateVolatility(klines: KLine[]): number {
    if (klines.length < this.config.volatilityPeriod) return 0;

    const period = this.config.volatilityPeriod;
    const recentKlines = klines.slice(-period);
    
    // 计算True Range
    const trueRanges: number[] = [];
    for (let i = 1; i < recentKlines.length; i++) {
      const prev = recentKlines[i - 1];
      const curr = recentKlines[i];
      
      const tr1 = curr.high - curr.low;
      const tr2 = Math.abs(curr.high - prev.close);
      const tr3 = Math.abs(curr.low - prev.close);
      
      trueRanges.push(Math.max(tr1, tr2, tr3));
    }

    const atr = trueRanges.reduce((a, b) => a + b, 0) / trueRanges.length;
    const avgPrice = recentKlines.reduce((sum, k) => sum + k.close, 0) / recentKlines.length;
    const volatility = atr / avgPrice;

    // 归一化：如果波动性 > 平均波动性的1.5倍，认为是高波动性
    const avgVolatility = volatility; // 简化：使用当前波动性
    const normalizedVolatility = Math.min(1, volatility / (avgVolatility * this.config.highVolatilityMultiplier));

    return normalizedVolatility;
  }

  /**
   * 计算市场定价偏差
   * 比较Polymarket价格 vs 基于Chainlink价格的实际概率
   */
  private calculatePricingDeviation(
    currentPrice: number,
    klines: KLine[],
    polymarketYesPrice: number
  ): number {
    if (klines.length < 5) return 0;

    // 基于最近价格趋势估算实际概率
    const recentKlines = klines.slice(-5);
    const prices = recentKlines.map(k => k.close);
    
    // 计算趋势：如果最近价格上涨，YES概率应该更高
    const priceChange = (prices[prices.length - 1] - prices[0]) / prices[0];
    
    // 估算实际概率（简化模型）
    // 如果价格上涨0.1%，YES概率应该约50.1%
    const estimatedActualProbability = 0.5 + (priceChange * 10); // 放大系数
    const estimatedActualProbabilityClamped = Math.max(0.3, Math.min(0.7, estimatedActualProbability));

    // 计算偏差
    const deviation = polymarketYesPrice - estimatedActualProbability;
    
    // 归一化到 -1 到 1
    // 负值 = Polymarket低估了YES概率（买入机会）
    // 正值 = Polymarket高估了YES概率（卖出或买入NO）
    return Math.max(-1, Math.min(1, deviation * 2));
  }

  /**
   * 计算成交量异常
   * 异常高的成交量可能预示方向性
   */
  private calculateVolumeAnomaly(klines: KLine[], currentVolume24h: number): number {
    if (klines.length < 5) return 0;

    // 计算平均成交量（如果有）
    const volumes = klines
      .slice(-10)
      .map(k => k.volume || 0)
      .filter(v => v > 0);

    if (volumes.length === 0) return 0;

    const avgVolume = volumes.reduce((a, b) => a + b, 0) / volumes.length;
    
    // 检查当前成交量是否异常
    if (avgVolume === 0) return 0;
    
    const volumeRatio = currentVolume24h / (avgVolume * 24 * 4); // 转换为15分钟平均
    
    // 如果成交量 > 2倍平均，认为是异常
    const anomaly = Math.min(1, volumeRatio / this.config.volumeAnomalyThreshold);
    
    return anomaly;
  }

  /**
   * 计算时间因素
   * 市场开始时的价格位置和趋势
   */
  private calculateTimeFactor(klines: KLine[], marketStartTime: number): number {
    if (klines.length < 3) return 0;

    const now = Date.now();
    const timeSinceStart = (now - marketStartTime) / (1000 * 60); // 分钟

    // 如果市场刚开始（前5分钟），权重更高
    if (timeSinceStart < 5) {
      const recentKlines = klines.slice(-3);
      const prices = recentKlines.map(k => k.close);
      const trend = (prices[prices.length - 1] - prices[0]) / prices[0];
      
      // 归一化到 -1 到 1
      return Math.max(-1, Math.min(1, trend * 100)) * this.config.earlyMarketWeight;
    }

    return 0;
  }

  /**
   * 综合所有因子，生成最终信号
   */
  private combineFactors(
    momentum: number,
    volatility: number,
    pricingDeviation: number,
    volumeAnomaly: number,
    timeFactor: number,
    yesPrice: MarketPrice,
    noPrice: MarketPrice
  ): StrategySignal | null {
    const factors = {
      momentum,
      volatility,
      pricingDeviation,
      volumeAnomaly,
      timeFactor,
    };

    const reasons: string[] = [];

    // 1. 动量信号（权重最高：40%）
    let momentumScore = 0;
    if (Math.abs(momentum) > this.config.momentumThreshold) {
      momentumScore = momentum;
      reasons.push(`动量: ${(momentum * 100).toFixed(2)}% (${momentum > 0 ? '上涨' : '下跌'})`);
    }

    // 2. 波动性增强（权重：15%）
    // 高波动性时，如果动量明确，增强信号
    const volatilityBoost = volatility > 0.5 ? 1.2 : 1.0;

    // 3. 定价偏差（权重：25%）
    // 如果Polymarket低估了概率，这是套利机会
    let pricingScore = 0;
    if (Math.abs(pricingDeviation) > this.config.pricingDeviationThreshold) {
      pricingScore = -pricingDeviation; // 负偏差 = 买入机会
      if (pricingDeviation < 0) {
        reasons.push(`定价偏差: YES被低估${(Math.abs(pricingDeviation) * 100).toFixed(1)}%`);
      } else {
        reasons.push(`定价偏差: YES被高估${(pricingDeviation * 100).toFixed(1)}%`);
      }
    }

    // 4. 成交量异常（权重：10%）
    // 异常成交量可能预示方向，但需要结合其他信号
    const volumeBoost = volumeAnomaly > 0.5 ? 1.1 : 1.0;
    if (volumeAnomaly > 0.5) {
      reasons.push(`成交量异常: ${(volumeAnomaly * 100).toFixed(0)}%`);
    }

    // 5. 时间因素（权重：10%）
    const timeScore = timeFactor;
    if (Math.abs(timeFactor) > 0.1) {
      reasons.push(`时间因素: ${timeFactor > 0 ? '早期上涨' : '早期下跌'}`);
    }

    // 综合评分
    const combinedScore = 
      momentumScore * 0.40 * volatilityBoost +
      pricingScore * 0.25 +
      timeScore * 0.10 +
      (momentumScore * volumeBoost - momentumScore) * 0.10; // 成交量增强动量

    // 确定方向
    const direction: 'YES' | 'NO' = combinedScore > 0 ? 'YES' : 'NO';
    
    // 计算信号强度（0-1）
    const signalStrength = Math.min(1, Math.abs(combinedScore));
    
    // 计算信心度
    // 基础信心度 = 信号强度
    // 增强因素：
    // - 多个因子一致
    // - 高波动性 + 明确动量
    // - 定价偏差明显
    
    let confidence = signalStrength;
    
    // 因子一致性加分
    const factorAgreement = this.calculateFactorAgreement(factors, direction);
    confidence += factorAgreement * 0.2;
    
    // 高波动性 + 明确动量加分
    if (volatility > 0.6 && Math.abs(momentum) > 0.002) {
      confidence += 0.1;
      reasons.push('高波动性+明确动量');
    }
    
    // 定价偏差明显加分
    if (Math.abs(pricingDeviation) > 0.1) {
      confidence += 0.1;
    }
    
    confidence = Math.min(1, confidence);

    // 检查最小阈值
    if (signalStrength < this.config.minSignalStrength) {
      return null;
    }

    return {
      direction,
      confidence,
      signalStrength,
      factors,
      reasons,
    };
  }

  /**
   * 计算因子一致性
   */
  private calculateFactorAgreement(
    factors: StrategySignal['factors'],
    direction: 'YES' | 'NO'
  ): number {
    const expectedSign = direction === 'YES' ? 1 : -1;
    
    let agreement = 0;
    let count = 0;

    // 动量一致性
    if (Math.abs(factors.momentum) > 0.001) {
      const momentumSign = factors.momentum > 0 ? 1 : -1;
      if (momentumSign === expectedSign) agreement += 0.3;
      count++;
    }

    // 定价偏差一致性
    if (Math.abs(factors.pricingDeviation) > 0.05) {
      const pricingSign = factors.pricingDeviation < 0 ? 1 : -1; // 负偏差=买入YES
      if (pricingSign === expectedSign) agreement += 0.3;
      count++;
    }

    // 时间因素一致性
    if (Math.abs(factors.timeFactor) > 0.1) {
      const timeSign = factors.timeFactor > 0 ? 1 : -1;
      if (timeSign === expectedSign) agreement += 0.2;
      count++;
    }

    return count > 0 ? agreement / count : 0;
  }

  /**
   * 计算仓位大小
   */
  private calculatePositionSize(
    probability: number,
    liquidity: number,
    confidence: number,
    signalStrength: number
  ): number {
    // 基础仓位
    const baseSize = 100;

    // 根据信心度调整
    const confidenceMultiplier = confidence;

    // 根据信号强度调整
    const strengthMultiplier = signalStrength;

    // 根据概率调整（但不要过度依赖概率）
    // 如果概率很高但信号很强，可能意味着市场已经定价
    const probabilityMultiplier = probability > 0.7 ? 0.8 : 1.0; // 高概率时降低仓位

    const size = baseSize * confidenceMultiplier * strengthMultiplier * probabilityMultiplier;

    // 流动性限制（不超过5%）
    const maxSize = Math.min(size, liquidity * 0.05);

    // 最小和最大限制
    return Math.max(50, Math.min(maxSize, 500));
  }
}

