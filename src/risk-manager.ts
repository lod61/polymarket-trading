import { Position, TradingConfig, TradeSignal } from './types.js';

/**
 * Risk Management Module
 * Handles position sizing, daily loss limits, and position limits
 */
export class RiskManager {
  private config: TradingConfig;
  private dailyPnL: number = 0;
  private positions: Position[] = [];

  constructor(config: TradingConfig) {
    this.config = config;
  }

  /**
   * Check if we can open a new position
   */
  canOpenPosition(signal: TradeSignal, currentPositions: Position[]): boolean {
    // Check daily loss limit
    if (this.dailyPnL <= -this.config.maxDailyLossUsd) {
      console.log('❌ Daily loss limit reached');
      return false;
    }

    // Check position limit
    if (currentPositions.length >= this.config.maxPositions) {
      console.log('❌ Maximum positions limit reached');
      return false;
    }

    // Check if we already have a position in this market
    const existingPosition = currentPositions.find(
      p => p.marketId === signal.marketId
    );
    if (existingPosition) {
      console.log('❌ Already have a position in this market');
      return false;
    }

    // Check if position size is reasonable
    if (signal.recommendedSize < 1) {
      console.log('❌ Position size too small');
      return false;
    }

    return true;
  }

  /**
   * Adjust position size based on risk limits
   */
  adjustPositionSize(signal: TradeSignal, currentPositions: Position[]): number {
    let adjustedSize = signal.recommendedSize;

    // Cap at max position size
    adjustedSize = Math.min(adjustedSize, this.config.maxPositionSizeUsd);

    // Reduce size if we're close to daily loss limit
    const remainingLossCapacity = this.config.maxDailyLossUsd + this.dailyPnL;
    if (remainingLossCapacity < this.config.maxDailyLossUsd * 0.5) {
      adjustedSize = adjustedSize * 0.5; // Reduce size by 50%
    }

    // Reduce size if we have many positions (diversification)
    if (currentPositions.length >= this.config.maxPositions * 0.8) {
      adjustedSize = adjustedSize * 0.7;
    }

    return Math.max(adjustedSize, 1); // Minimum $1
  }

  /**
   * Update daily P&L
   */
  updateDailyPnL(pnl: number): void {
    this.dailyPnL += pnl;
  }

  /**
   * Reset daily P&L (call at start of new day)
   */
  resetDailyPnL(): void {
    this.dailyPnL = 0;
  }

  /**
   * Get current daily P&L
   */
  getDailyPnL(): number {
    return this.dailyPnL;
  }

  /**
   * Check if position should be closed due to risk
   */
  shouldClosePosition(position: Position): boolean {
    // Check stop loss
    if (position.pnlPercent <= -this.config.stopLossPercent) {
      return true;
    }

    // Check if daily loss limit would be exceeded
    if (this.dailyPnL + position.pnl <= -this.config.maxDailyLossUsd) {
      return true;
    }

    return false;
  }
}




