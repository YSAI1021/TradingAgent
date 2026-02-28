# TradingAgent — Portfolio Intelligence

A modern web application for portfolio tracking, investment thesis management, and AI-powered insights. Built with React, Vite, and Tailwind CSS.

## Overview

**TradingAgent** is a portfolio intelligence platform that helps investors monitor their holdings, track investment theses, and stay informed with AI-generated insights and community sentiment.

## Features

### Dashboard
- **Today's Portfolio Brief** — AI-powered summary of stock, sector, and portfolio-level movements
- **Top Movers** — Best performers in your portfolio and across the market
- **Risk Exposure** — Tech concentration, market cap diversity, and sector volatility metrics
- **Rule Triggers & Alerts** — Concentration and target alerts (e.g., concentration alerts, portfolio targets)
- **Customizable Tiles** — Show or hide sections to tailor your view

### Portfolio
- **AI Weekly Recap** — Performance summary, insights, and key drivers (tech, finance, energy)
- **Portfolio Allocation** — Interactive pie chart of holdings by allocation
- **Concentration Alerts** — Sector weight warnings (e.g., tech over 60%) and diversification recommendations
- **Current Holdings** — Table with shares, avg cost, current price, gain/loss, and allocation
- **Transaction History** — Click any holding to view purchase history and lot-level performance

### Stocks
- **Current Holdings** — Portfolio positions with price, change %, and position value
- **Watchlist** — Stocks you're tracking (separate from holdings)
- Search and add-to-watchlist actions

### Stock Detail
- Price chart and key metrics
- **AI News Themes & Sentiment** — Themes, article counts, and overall sentiment trend
- **Impact on Your Holdings** — Portfolio exposure and correlation insights
- Fundamentals and technical analysis tabs

### Thesis
- **Thesis Health Check** — Overall assessment and on-track vs. needs-review counts
- **Rule Adherence Analysis** — Compliance score, rule-by-rule breakdown, violations, patterns, and recommendations
- **Thesis Cards** — Per-stock investment thesis, entry/target/stop, progress bar
- **Clickable "Needs Review"** — Scrolls to and highlights the card requiring attention

### Community
- **AI Community Highlights** — Consensus (bullish/agree), controversy (divided/mixed), and your content performance
- **Community Feed** — Posts with likes, comments, tags
- **Trending Topics** — Popular discussions with sentiment badges
- Create-post flow

### Portfolio Copilot (Sidebar)
- Context-aware suggested prompts based on current page (Dashboard, Portfolio, Stocks, Thesis, Community)
- Chat-style input with voice and attachment options
- Auto-fill prompts on click

## Tech Stack

- **React 18** — UI
- **React Router 7** — Routing
- **Vite 6** — Build and dev server
- **Tailwind CSS 4** — Styling
- **Recharts** — Charts (pie, line)
- **Radix UI** — Accessible components
- **Lucide React** — Icons

## Getting Started

### Prerequisites

- Docker Desktop (recommended)
- Node.js 20+ (only if running without Docker)

### Run with Docker (recommended)

This repo is a small fullstack app:
- **backend**: Node/Express API on `http://localhost:3000`
- **frontend**: Vite dev server on `http://localhost:5173`

#### 1) Create a root `.env` for Docker Compose

Create `/Users/chenpeng/TradingAgent/.env` (do **not** commit secrets):

```bash
GEMINI_API_KEY=
JWT_SECRET=dev-secret-change-me
FRONTEND_URL=http://localhost:5173
VITE_API_URL=http://localhost:3000
```

Notes:
- `GEMINI_API_KEY` is optional; leaving it empty disables AI features that require it.
- `JWT_SECRET` should be changed for real deployments.

#### 2) Start the stack

```bash
docker compose up --build -d
```

#### 3) Open the app

- Frontend: `http://localhost:5173`
- Backend health (example): `http://localhost:3000/api/posts`

#### Useful commands

```bash
# Stop containers (keeps DB volume)
docker compose down

# Stop containers AND delete persisted SQLite volume
docker compose down -v

# Follow logs
docker compose logs -f backend
docker compose logs -f frontend
```

#### Where is the database?

When running via Docker Compose, SQLite is stored in a **named Docker volume**:
- **DB path in container**: `/data/trading_platform.db`
- **Volume name**: `backend-data` (see `docker-compose.yml`)

### Run without Docker (local dev)

If you prefer running services directly on your machine:

#### Backend

```bash
cd backend
npm install
export PORT=3000
export JWT_SECRET=dev-secret-change-me
export FRONTEND_URL=http://localhost:5173
export GEMINI_API_KEY=
npm start
```

#### Frontend

```bash
cd frontend
npm install
export VITE_API_URL=http://localhost:3000
npm run dev -- --host 0.0.0.0 --port 5173
```

### Build for Production

If you are using Docker, production builds are typically handled by your deployment pipeline.
For a local build of the frontend:

```bash
cd frontend
npm run build
```

Output is in `dist/`.

## Project Structure

```
backend/               # Express API + SQLite
frontend/              # React/Vite UI
frontend_old/          # Previous UI version (not the default)
docker-compose.yml     # Runs frontend + backend together

frontend/src/
├── app/
│   ├── components/    # Shared UI (cards, modals, navigation, etc.)
│   ├── hooks/         # e.g. usePortfolio, useStockQuotes
│   ├── pages/         # Dashboard, Portfolio, Thesis, Community...
│   ├── services/      # API client
│   └── utils/         # Helpers
└── main.tsx           # Entry point
```

## Data Architecture

- **usePortfolio** — Single source of truth for holdings; merges `BASE_HOLDINGS` with live quotes
- **useStockQuotes** — Fetches prices from Yahoo Finance (with fallbacks); refreshes every minute
- **Data validation** — Development-only checks for position values, totals, and allocations

---

*Original design: [Figma — Web User Journey MVP](https://www.figma.com/design/Y1aS4674karUxqbFd5s4Wg/Web-User-Journey-MVP)*
