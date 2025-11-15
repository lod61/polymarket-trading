# Polymarket API 设置指南

## API 概述

Polymarket 使用两套 API：

1. **Market Data API** (公开，无需认证)
   - 用于获取市场数据、价格、流动性等
   - 端点: `https://gamma-api.polymarket.com`
   - 无需 API key

2. **CLOB Trading API** (需要认证)
   - 用于下单、查询持仓、取消订单等
   - 端点: `https://clob.polymarket.com`
   - 需要 API key 和私钥签名

## 设置步骤

### 1. 获取 API 访问权限

访问 [Polymarket Developers](https://www.polymarketexchange.com/developers.html) 申请 API 访问权限。

### 2. 配置环境变量

复制 `env.example` 为 `.env`：

```bash
cp env.example .env
```

编辑 `.env` 文件：

```env
# Market Data API (公开，无需配置)
POLYMARKET_DATA_API_URL=https://gamma-api.polymarket.com

# Trading API (需要申请)
POLYMARKET_API_KEY=your_api_key_here
POLYMARKET_API_URL=https://clob.polymarket.com
POLYMARKET_PRIVATE_KEY=your_private_key_here
```

### 3. 安装依赖

```bash
bun install
```

### 4. 实现订单签名

Polymarket 使用 EIP-712 标准进行订单签名。你需要：

1. 安装 `ethers.js`：
```bash
bun add ethers
```

2. 实现签名逻辑（参考 `src/signing.ts`）

3. 更新 `src/polymarket-client.ts` 中的 `signOrder` 方法

### 5. 测试连接

运行机器人（只读模式，不交易）：

```bash
bun run dev
```

## API 端点参考

### Market Data API (公开)

#### 获取市场列表
```
GET https://gamma-api.polymarket.com/markets
Query Parameters:
  - closed: boolean (false = 只获取开放市场)
  - category: string (crypto, politics, etc.)
  - limit: number (默认 100)
```

#### 获取市场详情
```
GET https://gamma-api.polymarket.com/markets/{marketId}
```

#### 获取订单簿
```
GET https://clob.polymarket.com/book?token_id={tokenId}
```

### Trading API (需要认证)

#### 下单
```
POST https://clob.polymarket.com/orders
Headers:
  Authorization: Bearer {api_key}
Body:
  {
    token_id: string,
    side: "buy" | "sell",
    price: string (价格，单位：cents, 0-10000),
    size: string (数量，单位：tokens),
    nonce: string,
    expiration: number (Unix timestamp),
    signature: string (EIP-712 signature)
  }
```

#### 查询持仓
```
GET https://clob.polymarket.com/positions
Headers:
  Authorization: Bearer {api_key}
```

#### 查询订单
```
GET https://clob.polymarket.com/orders
Headers:
  Authorization: Bearer {api_key}
```

#### 取消订单
```
DELETE https://clob.polymarket.com/orders/{orderId}
Headers:
  Authorization: Bearer {api_key}
```

## 重要注意事项

### 1. 订单签名

Polymarket 使用 EIP-712 标准签名。你需要：

- 使用你的钱包私钥
- 按照 Polymarket 的签名格式签名
- 包含所有必需字段（nonce, expiration 等）

### 2. 价格格式

- **Market Data API**: 价格是概率 (0-1) 或百分比 (0-100)
- **Trading API**: 价格是 cents (0-10000)，其中 10000 = 100% = $1.00

转换公式：
```typescript
// 概率转价格 (cents)
const priceInCents = Math.round(probability * 10000);

// 价格 (cents) 转概率
const probability = priceInCents / 10000;
```

### 3. 数量格式

- **Market Data API**: 数量通常是 USD
- **Trading API**: 数量是 tokens

转换公式：
```typescript
// USD 转 tokens
const tokens = Math.floor((usdAmount * 10000) / priceInCents);

// Tokens 转 USD
const usdAmount = (tokens * priceInCents) / 10000;
```

### 4. Token ID

每个市场的结果（YES/NO）都有唯一的 token ID。你需要：

1. 从市场数据中获取 token ID
2. 使用 token ID 进行交易

### 5. 测试环境

建议先在测试环境或小额资金上测试：

- 使用最小仓位
- 监控每笔交易
- 检查 API 响应

## 故障排除

### 问题：API 返回 401 Unauthorized

**解决方案**：
- 检查 API key 是否正确
- 确认 API key 有交易权限
- 检查请求头格式

### 问题：订单签名失败

**解决方案**：
- 确认私钥格式正确（0x 开头）
- 检查签名格式是否符合 EIP-712
- 确认 domain 和 types 正确

### 问题：Token ID 找不到

**解决方案**：
- 确认市场 ID 正确
- 检查市场是否还有效
- 查看 API 响应中的 tokens 字段

### 问题：价格/数量格式错误

**解决方案**：
- 确认价格单位（概率 vs cents）
- 确认数量单位（USD vs tokens）
- 检查转换公式

## 参考资源

- [Polymarket API 文档](https://docs.polymarket.com/)
- [Polymarket Data SDK](https://polymarket-data.com/)
- [EIP-712 标准](https://eips.ethereum.org/EIPS/eip-712)
- [ethers.js 文档](https://docs.ethers.io/)

## 安全提示

⚠️ **重要**：

1. **永远不要提交私钥到 Git**
   - 确保 `.env` 在 `.gitignore` 中
   - 使用环境变量管理私钥

2. **使用只读权限测试**
   - 先用只读 API 测试
   - 确认逻辑正确后再启用交易

3. **限制资金**
   - 设置合理的最大仓位
   - 设置每日亏损限制

4. **监控交易**
   - 记录所有交易
   - 设置告警机制




