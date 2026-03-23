# GOLDPHUNDV2 — Gold Dashboard V2

Advanced XAUUSD market intelligence platform featuring the Gold Logic AI engine with 30-indicator analysis, multi-timeframe scoring, and real-time MT5 bridge integration.

## Features

### Gold Logic AI Engine (V2)
- **30 Technical Indicators** across 5 categories: Trend, Momentum, Volatility, Structure, Macro
- **Master Bias Classification**: STRONG_BUY, BUY, NEUTRAL, SELL, STRONG_SELL
- **Market Regime Detection**: TREND, RANGE, BREAKOUT, COMPRESSION, REVERSAL_RISK, EVENT_RISK
- **Trade Quality Grading**: A+, A, B, C, NO_TRADE
- **Multi-Timeframe Alignment**: M5, M10, M15, H1, H4 scoring
- **Scenario Planning**: Bull path, Bear path, and No-trade conditions with targets

### Dashboard Views
- **Overview Tab**: Real-time trading execution, signal summary, factor matrix, positions management
- **Gold V2 Tab**: Full Gold Logic AI intelligence panel with indicator agreement matrix
- **Spectre Tab**: Alternative analysis engine with Ichimoku, Squeeze, Smart Money, Fibonacci confluence

### MT5 Integration
- Real-time market data via PhundBridge EA
- Trade execution support (paper/live modes)
- Position management
- Account monitoring

### Technical Stack
- **Framework**: Next.js 15 with React 19
- **Language**: TypeScript
- **Database**: Supabase
- **Deployment**: Vercel-ready
- **Notifications**: Telegram integration

## Quick Start

### Prerequisites
- Node.js 18+
- npm or yarn
- Supabase account (for data persistence)
- MT5 terminal with OX Securities (for live data)

### Installation

```bash
# Clone the repository
git clone https://github.com/SeanCFAFinlay/GOLDPHUNDV2.git
cd GOLDPHUNDV2

# Install dependencies
npm install

# Copy environment template
cp .env.example .env.local

# Configure environment variables (see .env.example)

# Start development server
npm run dev
```

### Environment Variables

Create `.env.local` with:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Telegram (optional)
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_CHAT_ID=your_chat_id

# Trade Mode: disabled | alert_only | paper | live
TRADE_MODE=paper
```

## Deployment

### Vercel (Recommended)

1. Push to GitHub
2. Import project in Vercel
3. Configure environment variables
4. Deploy

```bash
# Build for production
npm run build

# Start production server
npm start
```

### Manual Build

```bash
npm run build
npm start
```

## MT5 Setup

See [SETUP.md](./SETUP.md) for detailed MT5 configuration instructions.

1. Install PhundBridge EA in MT5
2. Attach to XAUUSD M10 chart
3. Configure API endpoint to your deployment URL
4. Verify connection in dashboard

## API Routes

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/dashboard/state` | GET | Full dashboard state with Gold Logic AI |
| `/api/spectre` | GET | Spectre engine analysis |
| `/api/mt5/heartbeat` | POST | MT5 connection heartbeat |
| `/api/mt5/account` | POST | Account data update |
| `/api/mt5/market` | POST | Market data ingestion |
| `/api/mt5/execution` | POST | Trade execution results |
| `/api/trade/manual` | POST | Manual trade execution |

## Gold Logic AI Indicator Stack

### Trend (10 indicators)
EMA 9, EMA 21, EMA 50, EMA 200, SMA 200, MACD Line, MACD Histogram, ADX, +DI/-DI, SuperTrend

### Momentum (8 indicators)
RSI, Stochastic %K/%D, CCI, ROC, Momentum, Williams %R, TSI

### Volatility (6 indicators)
ATR, NATR, Bollinger Band Width, Bollinger %B, Keltner Width, Donchian Width

### Structure (6 indicators)
VWAP Distance, Z-Score, Pivot Distance, Ichimoku Cloud, Parabolic SAR, Linear Regression

### Macro (4 indicators)
DXY Delta 10m/30m, US10Y Delta 10m/30m (requires live macro feed)

## License

Private - All rights reserved

## Version

**V2.0.0** — Gold Dashboard V2 with Gold Logic AI Engine
