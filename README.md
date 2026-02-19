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

- Node.js 18+
- npm or pnpm

### Install and Run

```bash
npm install
npm run dev
```

Then open [http://localhost:5173](http://localhost:5173).

### Build for Production

```bash
npm run build
```

Output is in `dist/`.

## Project Structure

```
src/
├── app/
│   ├── components/     # Shared UI (cards, modals, navigation, etc.)
│   ├── data/          # Portfolio and transaction mock data
│   ├── hooks/         # usePortfolio, useStockQuotes
│   ├── pages/         # Dashboard, Portfolio, Stocks, Stock, Thesis, Community
│   ├── routes.ts      # Route configuration
│   └── utils/         # Data validation and helpers
├── styles/            # Tailwind and theme
└── main.tsx           # Entry point
```

## Data Architecture

- **usePortfolio** — Single source of truth for holdings; merges `BASE_HOLDINGS` with live quotes
- **useStockQuotes** — Fetches prices from Yahoo Finance (with fallbacks); refreshes every minute
- **Data validation** — Development-only checks for position values, totals, and allocations

---

*Original design: https://trading-agent-yale.vercel.app/*
