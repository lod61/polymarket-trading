import 'dotenv/config';
import { loadConfig } from './config.js';
import { TradingBot } from './trading-bot.js';

async function main() {
  const config = loadConfig();

  // Validate configuration
  if (!process.env.POLYMARKET_API_KEY) {
    console.error('❌ POLYMARKET_API_KEY is not set in .env file');
    console.error('💡 Get your API key from: https://www.polymarketexchange.com/developers.html');
    process.exit(1);
  }

  if (!process.env.POLYMARKET_PRIVATE_KEY) {
    console.error('❌ POLYMARKET_PRIVATE_KEY is not set in .env file');
    console.error('💡 This is required for signing orders. Use your wallet private key.');
    console.error('⚠️  WARNING: Never share your private key!');
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




