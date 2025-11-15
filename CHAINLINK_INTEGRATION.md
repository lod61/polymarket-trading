# Chainlink 数据集成说明

## 概述

已集成 Chainlink 数据流作为价格验证和参考数据源，特别是对于加密货币相关的 Polymarket 市场。

参考: [Chainlink Data Streams - SOL/USD](https://data.chain.link/streams/sol-usd)

## 功能

### 1. 价格验证
- 对比 Polymarket 价格与 Chainlink 实时价格
- 识别价格差异和套利机会
- 提高交易信号的置信度

### 2. 支持的加密货币
- BTC (Bitcoin)
- ETH (Ethereum)
- SOL (Solana)
- XRP (Ripple)
- DOGE (Dogecoin)
- MATIC (Polygon)
- AVAX (Avalanche)
- LINK (Chainlink)
- ADA (Cardano)
- DOT (Polkadot)

### 3. 自动识别
系统会自动从市场问题中提取加密货币符号：
- "Bitcoin above $100k?" → BTC
- "Ethereum hits $5,000?" → ETH
- "Solana price $200?" → SOL

## 使用方法

### 启用 Chainlink 验证

在创建策略时启用 Chainlink 验证：

```typescript
import { TradingStrategy } from './strategy.js';
import { loadConfig } from './config.js';

const config = loadConfig();
const strategy = new TradingStrategy(config, true); // 启用 Chainlink 验证
```

### 在交易机器人中启用

```typescript
import { TradingBot } from './trading-bot.js';
import { loadConfig } from './config.js';

const config = loadConfig();
const bot = new TradingBot(config, true); // 启用 Chainlink 验证
```

## 工作原理

### 1. 价格获取流程

```
市场问题 → 提取加密货币符号 → 查询 Chainlink 价格 → 对比 Polymarket 价格 → 调整置信度
```

### 2. 置信度调整

- **高置信度 + 价格一致**: 置信度 × 1.1（提高）
- **高置信度 + 价格不一致**: 置信度 × 0.8（降低）
- **无法验证**: 保持原置信度

### 3. 套利机会识别

当 Chainlink 价格与 Polymarket 价格存在显著差异时：
- 如果 Chainlink 显示价格 > 目标价，但 Polymarket YES 概率 < 60% → 买入 YES
- 如果 Chainlink 显示价格 < 目标价，但 Polymarket YES 概率 > 40% → 卖出 YES（或买入 NO）

## API 集成方式

### 方式 1: Chainlink Price Feeds (On-Chain) ⭐ 推荐

使用 Chainlink Price Feeds 智能合约直接从链上获取价格：

```typescript
import { ethers } from 'ethers';
import { ChainlinkOnChainClient } from './chainlink-client-onchain.js';

const provider = new ethers.JsonRpcProvider('https://polygon-rpc.com');
const client = new ChainlinkOnChainClient(provider);
const price = await client.getPrice('BTC');
```

**优点**:
- 数据直接来自链上，最可靠
- 无需 API key
- 实时数据

**缺点**:
- 需要 RPC 连接
- 需要 ethers.js

### 方式 2: Chainlink Data Streams API

Chainlink Data Streams 提供 REST API（需要 API key）：
- 参考: https://data.chain.link/streams/sol-usd

### 方式 3: 第三方聚合器

使用聚合 Chainlink 数据的第三方服务：
- CoinGecko (uses Chainlink data)
- CoinMarketCap
- 其他 DeFi 数据聚合器

## 当前实现状态

⚠️ **注意**: 当前实现使用占位符，需要完成实际集成：

1. **符号提取**: ✅ 已完成
2. **目标价格提取**: ✅ 已完成  
3. **价格获取**: ⚠️ 需要实现（见上方方式）

建议使用**方式 1（On-Chain）**，因为：
- 最可靠
- 数据直接来自 Chainlink
- 无需依赖第三方 API

## 配置

### 环境变量

无需额外配置，Chainlink API 是公开的。

### 阈值设置

在 `price-validator.ts` 中可以调整：
- `thresholdPercent`: 价格差异阈值（默认 5%）
- 置信度计算基于价格差异和流动性

## 示例

### 示例 1: 价格验证

```typescript
import { ChainlinkClient } from './chainlink-client.js';

const client = new ChainlinkClient();
const price = await client.getPrice('SOL');

if (price) {
  console.log(`SOL price: $${price.price}`);
  console.log(`Source: ${price.source}`);
  console.log(`Timestamp: ${new Date(price.timestamp).toISOString()}`);
}
```

### 示例 2: 批量获取价格

```typescript
const prices = await client.getPrices(['BTC', 'ETH', 'SOL']);
prices.forEach((price, symbol) => {
  console.log(`${symbol}: $${price.price}`);
});
```

### 示例 3: 市场验证

```typescript
import { PriceValidator } from './price-validator.js';

const validator = new PriceValidator();
const result = await validator.validateMarket(market, prices);

if (result.confidence === 'high' && !result.isValid) {
  console.log('⚠️  Price discrepancy detected!');
  console.log(`Chainlink: $${result.chainlinkPrice?.price}`);
  console.log(`Difference: ${result.difference.toFixed(2)}%`);
}
```

## 注意事项

### 1. API 限制
- Chainlink API 是公开的，但可能有速率限制
- 建议添加请求间隔（已实现：100ms）

### 2. 数据延迟
- Chainlink 数据可能有轻微延迟
- 对于高频交易，考虑数据新鲜度

### 3. 市场类型
- 仅对加密货币价格市场有效
- 其他类型市场（政治、体育等）无法验证

### 4. 价格格式
- 需要从市场问题中提取目标价格
- 支持格式：`$100k`, `$100,000`, `$100K` 等

## 故障排除

### 问题：无法获取 Chainlink 价格

**可能原因**：
1. 网络连接问题
2. API 端点变更
3. 不支持的加密货币符号

**解决方案**：
- 检查网络连接
- 查看控制台错误信息
- 确认加密货币符号是否正确

### 问题：价格差异过大

**可能原因**：
1. Chainlink 数据延迟
2. Polymarket 价格已更新
3. 市场流动性不足

**解决方案**：
- 调整 `thresholdPercent` 阈值
- 检查数据时间戳
- 验证市场流动性

## 未来改进

1. **更多数据源**: 集成 CoinGecko、CoinMarketCap 等
2. **历史数据**: 使用 Chainlink 历史数据验证
3. **实时订阅**: WebSocket 连接获取实时更新
4. **多源聚合**: 聚合多个数据源提高准确性

## 参考资源

- [Chainlink Data Streams](https://data.chain.link/)
- [Chainlink Documentation](https://docs.chain.link/)
- [Polymarket Resolution](https://docs.polymarket.com/)

