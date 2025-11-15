# Polymarket Trading Bot

自动化交易机器人，使用短期多因子策略在 Polymarket 上进行加密货币 Up/Down 15分钟市场交易。

## 功能特性

✅ **短期多因子策略**
- 动量分析（3-5周期）
- 定价偏差套利
- 波动性分析
- 成交量异常检测
- 时间因素

✅ **自动交易**
- 自动监控市场
- 自动生成交易信号
- 自动下单（EIP-712签名）
- 风险控制

✅ **数据收集**
- 可选的数据收集模式（只记录，不下单）
- 记录所有分析结果和信号

## 快速开始

### 1. 安装依赖

```bash
bun install
```

### 2. 配置环境变量

复制 `env.example` 到 `.env`：

```bash
cp env.example .env
```

#### 选项 A: 数据收集模式（推荐，不需要 API Key）

编辑 `.env`，设置：

```env
# 数据收集模式（不需要 API Key）
DATA_COLLECTION_MODE=true

# 可选：Chainlink配置
POLYGON_RPC_URL=https://polygon-rpc.com
```

#### 选项 B: 自动交易模式（需要 API Key）

编辑 `.env`，设置：

```env
# 自动交易模式
DATA_COLLECTION_MODE=false

# 必需：Polymarket API配置
POLYMARKET_API_KEY=your_api_key_here
POLYMARKET_PRIVATE_KEY=0x_your_private_key_here

# 可选：Chainlink配置
POLYGON_RPC_URL=https://polygon-rpc.com

# 交易参数（可选，有默认值）
MIN_WIN_PROBABILITY=0.60
MAX_POSITION_SIZE_USD=500
MIN_MARKET_LIQUIDITY_USD=1000
MAX_DAILY_LOSS_USD=1000
MAX_POSITIONS=5
STOP_LOSS_PERCENT=10
POLL_INTERVAL_MS=30000
```

### 3. 运行

```bash
# 自动检测模式（如果没有 API Key，自动使用数据收集模式）
bun run start

# 或明确指定数据收集模式
bun run collector
```

## Railway 部署

### 1. 连接到 Railway

```bash
railway login
railway init
```

### 2. 设置环境变量

在 Railway 项目设置中添加所有环境变量（从 `.env` 文件）。

### 3. 部署

```bash
railway up
```

### 4. 查看日志

```bash
railway logs
```

## 策略说明

### 短期多因子策略

**5个核心因子**：

1. **短期动量（40%权重）**
   - 检查最近3-5个15分钟周期的价格变化
   - 如果持续上涨 → 买入YES
   - 如果持续下跌 → 买入NO

2. **定价偏差（25%权重）**
   - 比较Polymarket价格 vs 实际概率
   - 如果YES被低估 → 买入YES（套利）
   - 如果YES被高估 → 买入NO

3. **波动性分析（15%权重）**
   - 高波动性 + 明确动量 = 强信号
   - 低波动性 = 避免交易

4. **成交量异常（10%权重）**
   - 异常高成交量可能预示方向

5. **时间因素（10%权重）**
   - 市场开始时的趋势

### 信号条件

**买入YES**：
- 动量 > 0.1%（最近上涨）
- 定价偏差 < -5%（YES被低估）OR 动量很强
- 综合评分 > 0.55
- 信心度 > 60%

**买入NO**：
- 动量 < -0.1%（最近下跌）
- 定价偏差 > 5%（YES被高估）OR 动量很强
- 综合评分 < -0.55
- 信心度 > 60%

## 文件结构

```
src/
├── index.ts                 # 入口文件（自动交易）
├── data-collector.ts        # 数据收集器（只记录，不下单）
├── trading-bot.ts           # 交易机器人
├── short-term-strategy.ts   # 短期多因子策略
├── polymarket-client.ts     # Polymarket API客户端
├── chainlink-client.ts      # Chainlink价格客户端
├── kline-client.ts          # K线数据客户端
├── risk-manager.ts          # 风险管理
├── types.ts                # 类型定义
└── config.ts               # 配置管理
```

## 文档

- [快速开始指南](QUICK_START.md)
- [自动交易设置](AUTO_TRADING_SETUP.md)
- [短期策略指南](SHORT_TERM_STRATEGY_GUIDE.md)
- [数据收集器指南](DATA_COLLECTOR.md)

## 安全提示

⚠️ **重要**：
- 永远不要提交 `.env` 文件到 Git
- 私钥必须以 `0x` 开头
- 建议使用专门的交易钱包，不要使用主钱包
- 设置合理的止损和最大亏损限制

## 许可证

MIT
