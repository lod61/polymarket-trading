import { TradingConfig } from './types.js';

export function loadConfig(): TradingConfig {
  return {
    minWinProbability: parseFloat(process.env.MIN_WIN_PROBABILITY || '0.60'),
    maxPositionSizeUsd: parseFloat(process.env.MAX_POSITION_SIZE_USD || '100'),
    minMarketLiquidityUsd: parseFloat(process.env.MIN_MARKET_LIQUIDITY_USD || '1000'),
    maxSlippagePercent: parseFloat(process.env.MAX_SLIPPAGE_PERCENT || '2'),
    maxDailyLossUsd: parseFloat(process.env.MAX_DAILY_LOSS_USD || '500'),
    maxPositions: parseInt(process.env.MAX_POSITIONS || '5', 10),
    stopLossPercent: parseFloat(process.env.STOP_LOSS_PERCENT || '10'),
    pollIntervalMs: parseInt(process.env.POLL_INTERVAL_MS || '5000', 10),
  };
}

export const API_CONFIG = {
  apiKey: process.env.POLYMARKET_API_KEY || '',
  baseUrl: process.env.POLYMARKET_API_URL || 'https://clob.polymarket.com',
  dataApiUrl: process.env.POLYMARKET_DATA_API_URL || 'https://gamma-api.polymarket.com',
};

