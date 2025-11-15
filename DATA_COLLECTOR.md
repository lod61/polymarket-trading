# 数据收集器使用指南

## 概述

数据收集器 (`src/data-collector.ts`) 是一个**只计算和记录，不下单**的工具。它使用真实 API 数据，分析市场并寻找最大概率能盈利的机会，将所有分析结果记录到文件中。

## 功能特性

✅ **真实数据**: 使用真实的 Polymarket API 和 Chainlink 数据  
✅ **只计算**: 不下单，只分析和记录  
✅ **持续运行**: 可以运行一整晚收集数据  
✅ **详细记录**: 记录所有分析结果、因子得分、信号等  
✅ **最佳机会**: 自动识别并保存最佳交易机会  

## 快速开始

```bash
# 启动数据收集器（无需 API Key，使用公开 API）
bun run src/data-collector.ts
```

## 数据文件

所有数据保存在 `data/` 目录下：

- **`analysis-records.jsonl`**: 所有分析记录（JSON Lines 格式）
  - 每行一个 JSON 对象
  - 包含市场信息、价格、因子得分、信号等

- **`signals.jsonl`**: 只包含有信号的分析记录
  - 过滤出所有生成交易信号的市场

- **`best-opportunities.json`**: 最佳机会摘要
  - 按信心度排序的前50个最佳机会
  - JSON 格式，便于查看

## 记录格式

每条记录包含以下信息：

```json
{
  "timestamp": "2025-11-15T23:00:00.000Z",
  "marketId": "market-id",
  "slug": "btc-updown-15m-1763214300",
  "question": "Bitcoin Up or Down - 15 minute",
  "symbol": "btc",
  "yesPrice": 0.45,
  "noPrice": 0.55,
  "liquidity": 5000,
  "volume24h": 10000,
  "signal": {
    "outcome": "YES",
    "probability": 0.45,
    "confidence": 0.72,
    "signalStrength": 0.68,
    "recommendedSize": 150.5,
    "reason": "动量: 13.81% (上涨) | 定价偏差: YES被低估13.9%"
  },
  "factors": {
    "momentum": 0.1381,
    "volatility": 0.6667,
    "pricingDeviation": -0.1383,
    "volumeAnomaly": 0.0001,
    "timeFactor": 0.0287
  },
  "chainlinkPrice": 95000,
  "klineData": {
    "count": 50,
    "firstPrice": 95190,
    "lastPrice": 96472.5,
    "priceChange": 1.35
  },
  "marketStartTime": 1763214300000,
  "marketEndTime": 1763215200000
}
```

## 策略配置

数据收集器使用**高概率策略配置**：

- **最小信心度**: 65%
- **最小信号强度**: 60%
- **动量阈值**: 0.1%
- **定价偏差阈值**: 5%

这些设置确保只记录**最大概率能盈利**的机会。

## 运行参数

### 轮询间隔

默认每30秒轮询一次。可以在代码中修改：

```typescript
private pollInterval: number = 30000; // 30秒
```

### 最小流动性

只分析流动性 >= $1000 的市场：

```typescript
m.liquidity >= 1000
```

## 使用方法

### 1. 启动收集器

```bash
bun run src/data-collector.ts
```

### 2. 让它在后台运行

```bash
# 使用 nohup（Linux/Mac）
nohup bun run src/data-collector.ts > collector.log 2>&1 &

# 或使用 screen
screen -S collector
bun run src/data-collector.ts
# 按 Ctrl+A 然后 D 分离会话
```

### 3. 查看实时输出

```bash
# 如果使用 nohup
tail -f collector.log

# 如果使用 screen
screen -r collector
```

### 4. 停止收集器

```bash
# 如果在前台运行，按 Ctrl+C

# 如果使用 nohup，找到进程并杀死
ps aux | grep "data-collector"
kill <PID>

# 如果使用 screen
screen -r collector
# 然后按 Ctrl+C
```

## 数据分析

### 查看最佳机会

```bash
# 查看最佳机会摘要
cat data/best-opportunities.json | jq '.[0:10]'

# 查看所有信号
cat data/signals.jsonl | jq '.signal.confidence' | sort -rn | head -20
```

### 统计信息

```bash
# 统计总记录数
wc -l data/analysis-records.jsonl

# 统计信号数
wc -l data/signals.jsonl

# 统计最佳机会数
cat data/best-opportunities.json | jq 'length'
```

### 分析特定市场

```bash
# 查找特定市场的所有记录
cat data/analysis-records.jsonl | jq 'select(.slug | contains("btc-updown-15m"))'

# 查找高信心度的信号
cat data/signals.jsonl | jq 'select(.signal.confidence > 0.7)'
```

## 输出示例

```
🚀 启动数据收集器
📝 模式: 只计算和记录，不下单
⏱️  轮询间隔: 30秒
🎯 策略: 短期多因子策略（高概率机会）
   最小信心度: 65%
   最小信号强度: 60%

📁 数据目录: /path/to/data
📝 记录文件: /path/to/data/analysis-records.jsonl
📊 信号文件: /path/to/data/signals.jsonl

======================================================================
🕐 11/15/2025, 11:00:00 PM
======================================================================
📊 获取活跃市场...
✅ 找到 6 个活跃的Up/Down 15m市场

✅ 发现信号: btc-updown-15m-1763214300
   方向: YES
   信心度: 72.3%
   信号强度: 68.5%
   推荐仓位: $150.50
   原因: 动量: 13.81% (上涨) | 定价偏差: YES被低估13.9%

📈 本轮分析完成:
   分析市场数: 6
   发现信号数: 1
   最佳机会数: 1

💾 已保存 1 个最佳机会到 data/best-opportunities.json
```

## 注意事项

1. **API 限制**: 注意 API 请求频率，避免过于频繁
2. **磁盘空间**: 长时间运行会产生大量数据，确保有足够磁盘空间
3. **网络连接**: 需要稳定的网络连接访问 API
4. **数据备份**: 定期备份 `data/` 目录

## 明早接入 API

当准备好接入真实 API 进行交易时：

1. 查看 `data/best-opportunities.json` 了解最佳机会
2. 分析 `data/signals.jsonl` 中的信号质量
3. 根据数据调整策略参数
4. 使用 `src/index.ts` 启动自动交易机器人

## 故障排除

**问题**: 没有找到活跃市场

**解决**: 
- 检查网络连接
- 确认当前时间是否有活跃的15分钟市场
- 检查 API 是否可访问

**问题**: 没有生成信号

**解决**:
- 这是正常的，策略有严格的阈值
- 降低阈值会看到更多信号（但可能降低质量）
- 查看 `analysis-records.jsonl` 了解为什么没有信号

**问题**: 数据文件太大

**解决**:
- 定期清理旧数据
- 只保留 `signals.jsonl` 和 `best-opportunities.json`
- 使用日志轮转工具

