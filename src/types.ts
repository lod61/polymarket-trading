export interface Market {
  id: string;
  question: string;
  slug: string;
  endDate: string;
  liquidity: number;
  volume: number;
  active: boolean;
}

export interface MarketPrice {
  marketId: string;
  outcome: 'YES' | 'NO';
  price: number; // 0-1 probability
  liquidity: number;
  volume24h: number;
}

export interface Order {
  marketId: string;
  outcome: 'YES' | 'NO';
  side: 'BUY' | 'SELL';
  size: number; // in USD
  price: number; // 0-1 probability
}

export interface Position {
  marketId: string;
  outcome: 'YES' | 'NO';
  size: number;
  averagePrice: number;
  currentPrice: number;
  pnl: number;
  pnlPercent: number;
}

export interface TradingConfig {
  minWinProbability: number;
  maxPositionSizeUsd: number;
  minMarketLiquidityUsd: number;
  maxSlippagePercent: number;
  maxDailyLossUsd: number;
  maxPositions: number;
  stopLossPercent: number;
  pollIntervalMs: number;
}

export interface TradeSignal {
  marketId: string;
  outcome: 'YES' | 'NO';
  probability: number;
  confidence: number;
  signalStrength?: number; // Optional signal strength (0-1)
  recommendedSize: number;
  reason: string;
}




