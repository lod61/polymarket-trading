# Railway 部署指南

## 快速部署

### 1. 安装 Railway CLI

```bash
# macOS
brew install railway

# 或使用 npm
npm i -g @railway/cli
```

### 2. 登录 Railway

```bash
railway login
```

### 3. 初始化项目

```bash
railway init
```

### 4. 设置环境变量

在 Railway 项目设置中添加以下环境变量：

**必需**：
- `POLYMARKET_API_KEY` - Polymarket API Key
- `POLYMARKET_PRIVATE_KEY` - 钱包私钥（必须以 `0x` 开头）

**可选**：
- `POLYGON_RPC_URL` - Polygon RPC URL（默认: https://polygon-rpc.com）
- `MIN_WIN_PROBABILITY` - 最小胜率（默认: 0.60）
- `MAX_POSITION_SIZE_USD` - 最大仓位（默认: 500）
- `MIN_MARKET_LIQUIDITY_USD` - 最小流动性（默认: 1000）
- `MAX_DAILY_LOSS_USD` - 最大每日亏损（默认: 1000）
- `MAX_POSITIONS` - 最大持仓数（默认: 5）
- `STOP_LOSS_PERCENT` - 止损百分比（默认: 10）
- `POLL_INTERVAL_MS` - 轮询间隔（默认: 30000）

### 5. 部署

```bash
railway up
```

### 6. 查看日志

```bash
railway logs
```

## 部署模式

### 自动交易模式（默认）

使用 `bun run start`，会自动交易。

### 数据收集模式

如果只想收集数据不下单，可以：

1. 在 Railway 项目设置中设置环境变量：
   ```
   RAILWAY_START_COMMAND=bun run collector
   ```

2. 或者修改 `railway.json`：
   ```json
   {
     "deploy": {
       "startCommand": "bun run collector"
     }
   }
   ```

## 监控和维护

### 查看实时日志

```bash
railway logs --follow
```

### 重启服务

```bash
railway restart
```

### 查看服务状态

在 Railway Dashboard 中查看服务状态和资源使用情况。

## 注意事项

1. **环境变量安全**
   - 永远不要在代码中硬编码 API Key 或私钥
   - 使用 Railway 的环境变量功能
   - 定期轮换密钥

2. **资源限制**
   - Railway 免费版有资源限制
   - 监控内存和 CPU 使用情况
   - 考虑升级到付费计划以获得更多资源

3. **错误处理**
   - 机器人会自动重启（配置了 `restartPolicyType: "ON_FAILURE"`）
   - 检查日志以了解错误原因
   - 设置告警通知

4. **数据备份**
   - 如果使用数据收集模式，定期备份 `data/` 目录
   - 考虑使用 Railway 的持久化存储

## 故障排除

### 问题：部署失败

**检查**：
- Bun 是否正确安装（Railway 会自动安装）
- 环境变量是否正确设置
- 代码是否有语法错误

### 问题：服务无法启动

**检查**：
- 查看日志：`railway logs`
- 确认所有必需的环境变量都已设置
- 检查 API Key 和私钥格式是否正确

### 问题：没有找到市场

**检查**：
- 网络连接是否正常
- API 是否可访问
- 当前时间是否有活跃市场

### 问题：订单失败

**检查**：
- API Key 是否有交易权限
- 私钥格式是否正确（必须以 `0x` 开头）
- 账户余额是否充足
- 查看详细错误日志

## 更新部署

```bash
# 拉取最新代码
git pull

# 重新部署
railway up
```

## 回滚

如果新版本有问题，可以在 Railway Dashboard 中回滚到之前的版本。

