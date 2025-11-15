# 自动交易设置指南

## 概述

交易机器人已集成**短期多因子策略**，可以自动监控市场、生成信号并下单。

## 功能特性

✅ **短期多因子策略**
- 动量分析（3-5周期）
- 定价偏差套利
- 波动性分析
- 成交量异常检测
- 时间因素

✅ **自动下单**
- 自动检测交易信号
- 自动计算仓位大小
- 自动执行订单
- 风险控制

✅ **持仓管理**
- 自动跟踪持仓
- 自动检查退出信号
- 自动止损/止盈

## 设置步骤

### 1. 安装依赖

```bash
# 确保安装了ethers.js用于订单签名
bun add ethers
```

### 2. 配置环境变量

编辑 `.env` 文件：

```env
# Polymarket API配置
POLYMARKET_API_KEY=your_api_key_here
POLYMARKET_PRIVATE_KEY=0x your_private_key_here  # 必须！用于签名订单
POLYMARKET_API_URL=https://clob.polymarket.com

# Chainlink配置（可选，用于价格验证）
POLYGON_RPC_URL=https://polygon-rpc.com

# 交易配置
MIN_WIN_PROBABILITY=0.60        # 最小胜率60%
MAX_POSITION_SIZE_USD=500      # 最大单笔仓位$500
MIN_MARKET_LIQUIDITY_USD=1000   # 最小市场流动性$1000
MAX_DAILY_LOSS_USD=1000        # 最大每日亏损$1000
MAX_POSITIONS=5                # 最大同时持仓数
STOP_LOSS_PERCENT=10           # 止损10%
POLL_INTERVAL_MS=30000         # 每30秒检查一次
```

### 3. 获取API密钥和私钥

1. **API Key**: 访问 [Polymarket Developers](https://www.polymarketexchange.com/developers.html)
2. **Private Key**: 你的钱包私钥（用于签名订单）
   - ⚠️ **重要**: 私钥必须以 `0x` 开头
   - ⚠️ **安全**: 永远不要提交私钥到Git

### 4. 运行交易机器人

```bash
# 启动自动交易机器人
bun run src/index.ts
```

## 工作流程

### 1. 市场监控

机器人每30秒（可配置）：
- 获取所有活跃的Up/Down 15m市场
- 过滤流动性 > $1000的市场
- 提取加密货币符号（BTC, ETH, XRP等）

### 2. 信号生成

对每个市场：
- 获取Chainlink价格数据
- 计算K线数据（15分钟）
- 运行短期多因子策略：
  - 计算动量（3-5周期）
  - 分析定价偏差
  - 检查波动性
  - 检测成交量异常
  - 考虑时间因素

### 3. 风险检查

如果生成信号：
- ✅ 检查信心度 ≥ 60%
- ✅ 检查信号强度 ≥ 55%
- ✅ 检查仓位限制
- ✅ 检查每日亏损限制
- ✅ 检查最大持仓数

### 4. 自动下单

如果通过所有检查：
- 📤 计算最优仓位大小
- 📤 创建订单
- 📤 签名订单（EIP-712）
- 📤 提交到Polymarket CLOB API
- 📦 跟踪持仓

### 5. 持仓管理

持续监控：
- 📊 更新持仓P&L
- 🔄 检查退出信号（止损/止盈）
- 📤 自动平仓

## 策略配置

### 默认配置（平衡型）

```typescript
{
  minConfidence: 0.60,           // 最小60%信心度
  minSignalStrength: 0.55,       // 最小55%信号强度
  momentumPeriods: [3, 5],       // 检查3和5周期动量
  momentumThreshold: 0.001,      // 0.1%最小动量
}
```

### 保守配置

```typescript
{
  minConfidence: 0.65,           // 提高到65%
  minSignalStrength: 0.60,       // 提高到60%
  momentumThreshold: 0.002,     // 提高到0.2%
}
```

### 激进配置

```typescript
{
  minConfidence: 0.55,           // 降低到55%
  minSignalStrength: 0.50,       // 降低到50%
  momentumThreshold: 0.0005,    // 降低到0.05%
}
```

## 日志输出示例

```
🚀 Starting Polymarket Trading Bot...
📊 Strategy: Short-Term Multi-Factor Strategy
   - Momentum (3-5 periods)
   - Pricing Deviation (Arbitrage)
   - Volatility Analysis
   - Volume Anomaly Detection
   - Time Factor
💰 Max position size: $500
🛡️  Max daily loss: $1000
⏱️  Poll interval: 30000ms
🎯 Min confidence: 60.0%

[2025-11-15T...] 🔄 Checking markets...
📈 Found 25 active markets
🎯 Found 8 active Up/Down 15m markets

📊 Signal detected: 动量: 0.25% (上涨) | 定价偏差: YES被低估3.2%
   Market: 681890
   Outcome: YES
   Probability: 48.5%
   Confidence: 65.2%
   💰 Position size: $125.50

📤 Placing order...
   Market: Bitcoin Up or Down - November 15, 8:45AM-9:00AM ET
   Side: BUY YES
   Size: $125.50
   Price: 48.50%
   ✅ Order placed successfully!
   Order ID: 0x1234...
   📦 Position tracked: YES @ 48.50%
```

## 安全注意事项

### ⚠️ 重要警告

1. **私钥安全**
   - 永远不要提交私钥到Git
   - 使用环境变量管理
   - 定期轮换密钥

2. **资金管理**
   - 先用小资金测试
   - 设置合理的止损
   - 监控每日亏损

3. **API限制**
   - 注意API调用频率
   - 避免过度交易
   - 监控订单状态

4. **测试环境**
   - 先在测试环境测试
   - 验证订单签名
   - 确认策略有效性

## 故障排除

### 问题：订单签名失败

**解决方案**：
```bash
# 1. 安装ethers.js
bun add ethers

# 2. 检查私钥格式
# 私钥必须以 0x 开头，64个字符
# 例如: 0x1234567890abcdef...

# 3. 检查私钥是否正确
echo $POLYMARKET_PRIVATE_KEY | head -c 10
# 应该显示: 0x
```

### 问题：API返回401错误

**解决方案**：
- 检查 `POLYMARKET_API_KEY` 是否正确
- 确认API key有交易权限
- 检查请求头格式

### 问题：没有生成信号

**可能原因**：
- 市场流动性不足
- 信心度或信号强度不够
- Chainlink价格数据不可用

**解决方案**：
- 降低 `MIN_WIN_PROBABILITY`
- 检查Chainlink连接
- 查看日志了解原因

### 问题：订单被拒绝

**可能原因**：
- 订单签名无效
- 价格已变化（滑点）
- 流动性不足
- 市场已关闭

**解决方案**：
- 检查订单签名
- 使用更小的仓位
- 检查市场状态

## 监控建议

### 1. 日志监控

```bash
# 运行并保存日志
bun run src/index.ts 2>&1 | tee trading.log
```

### 2. 关键指标

- 信号生成频率
- 订单成功率
- 平均持仓时间
- 胜率
- 平均收益

### 3. 告警设置

建议设置告警：
- 每日亏损超过限制
- 连续多次订单失败
- API错误率过高

## 优化建议

### 1. 参数调优

根据实际表现调整：
- 信心度阈值
- 信号强度阈值
- 仓位大小
- 止损/止盈

### 2. 策略优化

- 添加更多过滤条件
- 优化因子权重
- 添加机器学习模型

### 3. 风险管理

- 动态调整仓位
- 根据市场波动调整策略
- 添加更多风险检查

## 下一步

1. ✅ 配置环境变量
2. ✅ 安装依赖（ethers.js）
3. ✅ 测试连接
4. ✅ 小资金测试
5. ✅ 监控表现
6. ✅ 优化参数

---

**重要**: 先用小资金测试，验证策略有效性后再加大仓位。交易有风险，请谨慎操作。

