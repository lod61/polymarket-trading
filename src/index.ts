import 'dotenv/config';
import { loadConfig } from './config.js';
import { TradingBot } from './trading-bot.js';
import { DataCollector } from './data-collector.js';

async function main() {
  // Check if running in data collection mode (no API key required)
  const isDataCollectionMode = process.env.DATA_COLLECTION_MODE === 'true' || 
                                !process.env.POLYMARKET_API_KEY ||
                                !process.env.POLYMARKET_PRIVATE_KEY;

  if (isDataCollectionMode) {
    console.log('📊 运行模式: 数据收集模式（只记录，不下单）');
    console.log('💡 此模式不需要 API Key，使用公开 API\n');
    
    const collector = new DataCollector();

    // Handle graceful shutdown
    process.on('SIGINT', () => {
      console.log('\n🛑 Received SIGINT, shutting down gracefully...');
      collector.stop();
      process.exit(0);
    });

    process.on('SIGTERM', () => {
      console.log('\n🛑 Received SIGTERM, shutting down gracefully...');
      collector.stop();
      process.exit(0);
    });

    // Start collector
    await collector.start();
    return;
  }

  // Trading mode (requires API key)
  const config = loadConfig();

  // Validate configuration
  if (!process.env.POLYMARKET_API_KEY) {
    console.error('❌ POLYMARKET_API_KEY is not set in .env file');
    console.error('💡 Get your API key from: https://www.polymarketexchange.com/developers.html');
    console.error('\n💡 或者设置 DATA_COLLECTION_MODE=true 来运行数据收集模式（不需要 API Key）');
    process.exit(1);
  }

  if (!process.env.POLYMARKET_PRIVATE_KEY) {
    console.error('❌ POLYMARKET_PRIVATE_KEY is not set in .env file');
    console.error('💡 This is required for signing orders. Use your wallet private key.');
    console.error('⚠️  WARNING: Never share your private key!');
    console.error('\n💡 或者设置 DATA_COLLECTION_MODE=true 来运行数据收集模式（不需要 API Key）');
    process.exit(1);
  }

  console.log('✅ Configuration validated');
  console.log(`📊 Strategy: Short-Term Multi-Factor Strategy`);
  console.log(`🔐 API Key: ${process.env.POLYMARKET_API_KEY.substring(0, 8)}...`);
  console.log(`🔐 Private Key: ${process.env.POLYMARKET_PRIVATE_KEY.substring(0, 6)}...\n`);

  const bot = new TradingBot(config);

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n🛑 Received SIGINT, shutting down gracefully...');
    bot.stop();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    console.log('\n🛑 Received SIGTERM, shutting down gracefully...');
    bot.stop();
    process.exit(0);
  });

  // Start bot
  await bot.start();
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});




