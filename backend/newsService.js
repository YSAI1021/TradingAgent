import Parser from 'rss-parser'
import bcrypt from 'bcryptjs'
import { load as loadHtml } from 'cheerio'
import { JSDOM } from 'jsdom'
import { Readability } from '@mozilla/readability'
import db from './database.js'

const DEFAULT_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml',
}
const rssParser = new Parser({
  timeout: 8000,
  customFields: {
    item: [
      ['media:content', 'mediaContent', { keepArray: true }],
      ['media:group', 'mediaGroup', { keepArray: true }],
    ],
  },
})

const NEWS_PER_TICKER = 4
const NEWS_BOT_USERNAME = 'NewsBot'
const NEWS_BOT_EMAIL = 'newsbot@astratrade.local'
const GOOGLE_NEWS_QUERY_OVERRIDES = {
  BTC: 'Bitcoin OR BTC cryptocurrency',
  ETH: 'Ethereum OR ETH cryptocurrency',
  SOL: 'Solana OR SOL cryptocurrency',
  IBIT: 'Bitcoin ETF',
  GLD: 'Gold ETF',
  VNQ: 'Real estate ETF',
  BND: 'Bond ETF',
  IEF: 'Treasury ETF',
  DBC: 'Commodity ETF',
  USO: 'Oil ETF',
  UNG: 'Natural gas ETF',
  BIL: 'cash management ETF',
}
const YAHOO_FEED_SYMBOL_OVERRIDES = {
  BTC: 'BTC-USD',
  ETH: 'ETH-USD',
  SOL: 'SOL-USD',
}
const BLOCKED_IMAGE_HOSTS = ['news.google.com', 'lh3.googleusercontent.com', 'gstatic.com']
const BLOCKED_META_HOSTS = [
  'news.google.com',
  'google.com',
  'googleusercontent.com',
  'gstatic.com',
  'google-analytics.com',
  'googletagmanager.com',
  'googleapis.com',
  'doubleclick.net',
]
const BLOCKED_META_EXTENSIONS = [
  '.js',
  '.css',
  '.woff',
  '.woff2',
  '.ttf',
  '.svg',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
]
const getGoogleSearchQuery = (ticker) => {
  const query = GOOGLE_NEWS_QUERY_OVERRIDES[ticker] || `${ticker} stock`
  return `${query} finance`
}

const getYahooFeedSymbol = (ticker) => YAHOO_FEED_SYMBOL_OVERRIDES[ticker] || ticker

const FEED_SOURCES = [
  {
    name: 'google',
    buildUrl: (ticker) =>
      `https://news.google.com/rss/search?q=${encodeURIComponent(getGoogleSearchQuery(ticker))}&hl=en-US&gl=US&ceid=US:en`,
  },
  {
    name: 'yahoo',
    buildUrl: (ticker) =>
      `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(getYahooFeedSymbol(ticker))}&region=US&lang=en-US`,
  },
]

const sanitizeTickers = (tickers) => {
  if (!Array.isArray(tickers)) return []
  const normalized = tickers
    .map((t) => (typeof t === 'string' ? t.trim().toUpperCase() : ''))
    .filter((t) => /^[A-Z]{1,6}$/.test(t))
  return [...new Set(normalized)]
}

const ensureNewsBotUser = () => {
  let newsUser = db.prepare('SELECT id FROM users WHERE username = ?').get(NEWS_BOT_USERNAME)
  if (!newsUser) {
    const hashedPassword = bcrypt.hashSync('news-bot-system', 10)
    const result = db
      .prepare('INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)')
      .run(NEWS_BOT_USERNAME, NEWS_BOT_EMAIL, hashedPassword)
    newsUser = { id: result.lastInsertRowid }
  }
  return newsUser.id
}

const truncate = (text, max = 380) => {
  if (!text) return ''
  return text.length > max ? `${text.slice(0, max)}...` : text
}

const cleanWhitespace = (value) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '')

const tickerRegex = (ticker) => new RegExp(`(^|[^A-Z0-9])\\$?${ticker}(?=[^A-Z0-9]|$)`, 'i')
const relevanceScore = ({ title, snippet, url }, ticker) => {
  const regex = tickerRegex(ticker)
  let score = 0
  if (title && regex.test(title)) score += 3
  if (snippet && regex.test(snippet)) score += 2
  if (url && regex.test(url)) score += 1
  return score
}

const deriveSourceFromTitle = (title) => {
  if (!title) return null
  const parts = title.split(' - ')
  if (parts.length >= 2) {
    const tail = parts[parts.length - 1].trim()
    return tail || null
  }
  return null
}

const getDomainFromUrl = (url) => {
  try {
    const { hostname } = new URL(url)
    return hostname.replace(/^www\./, '')
  } catch (err) {
    return null
  }
}

const extractOriginalUrl = (link) => {
  try {
    const stripTracking = (urlObj) => {
      const paramsToDrop = [
        'oc',
        'ceid',
        'hl',
        'gl',
        'tsrc',
        '.tsrc',
        'utm_source',
        'utm_medium',
        'utm_campaign',
        'utm_term',
        'utm_content',
      ]
      paramsToDrop.forEach((param) => urlObj.searchParams.delete(param))
      const cleaned = urlObj.toString()
      return cleaned.replace(/[?&]$/, '')
    }

    const url = new URL(link)
    const redirected = url.searchParams.get('url') || url.searchParams.get('q')
    if (redirected && /^https?:\/\//i.test(redirected)) {
      try {
        return stripTracking(new URL(redirected))
      } catch (err) {
        return redirected
      }
    }
    return stripTracking(url)
  } catch (err) {
    return link
  }
}

const extractImageFromItem = (item) => {
  const enclosureUrl = item.enclosure?.url
  if (enclosureUrl && isValidImageUrl(enclosureUrl)) return enclosureUrl

  const mediaContent = Array.isArray(item.mediaContent) ? item.mediaContent : []
  const mediaFromContent = mediaContent.find((media) => media?.url && isValidImageUrl(media.url))
  if (mediaFromContent?.url) return mediaFromContent.url

  const mediaGroup = Array.isArray(item.mediaGroup) ? item.mediaGroup : []
  for (const group of mediaGroup) {
    const content = Array.isArray(group['media:content']) ? group['media:content'] : []
    const first = content.find((entry) => entry?.url && isValidImageUrl(entry.url))
    if (first?.url) return first.url
  }

  return null
}

const isValidImageUrl = (url) => {
  if (!url) return false
  try {
    const { hostname } = new URL(url)
    return !BLOCKED_IMAGE_HOSTS.some((h) => hostname.includes(h))
  } catch (err) {
    return false
  }
}

const fetchFeedForTicker = async (ticker) => {
  for (const source of FEED_SOURCES) {
    try {
      const feed = await rssParser.parseURL(source.buildUrl(ticker))
      if (feed?.items?.length) {
        return { feed, source: source.name }
      }
    } catch (err) {
      console.warn(`Feed fetch failed for ${ticker} via ${source.name}:`, err.message)
    }
  }
  return { feed: null, source: null }
}

const fetchArticleMetadata = async (url) => {
  if (!url) return {}
  const initialDomain = getDomainFromUrl(url)
  if (initialDomain === 'news.google.com') {
    return { finalUrl: url, finalDomain: initialDomain }
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 5000)
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: DEFAULT_HEADERS,
    })
    clearTimeout(timeout)
    if (!res.ok) return {}
    const html = await res.text()
    const finalUrl = res.url || url
    const finalDomain = getDomainFromUrl(finalUrl)

    const extractExternalFromGoogle = () => {
      const urls = [...html.matchAll(/https?:\/\/[^"'<>\\s]+/g)]
        .map((m) => m[0])
        .filter((u) => {
          const host = getDomainFromUrl(u)
          if (!host) return false
          if (BLOCKED_META_HOSTS.some((blocked) => host.includes(blocked))) return false
          const lower = u.toLowerCase()
          if (BLOCKED_META_EXTENSIONS.some((ext) => lower.includes(ext))) return false
          return true
        })
      return urls[0]
    }
    const externalUrl = finalDomain === 'news.google.com' ? extractExternalFromGoogle() : null
    const $ = loadHtml(html)

    const ogDesc = $('meta[property="og:description"]').attr('content')
    const twitterDesc = $('meta[name="twitter:description"]').attr('content')
    const metaDesc = $('meta[name="description"]').attr('content')
    const description = cleanWhitespace(ogDesc || twitterDesc || metaDesc)

    const ogImage = $('meta[property="og:image"]').attr('content')
    const twitterImage = $('meta[name="twitter:image"]').attr('content')
    const image = ogImage || twitterImage

    // Light content extraction: first few paragraphs
    let bodyText = ''
    $('p')
      .slice(0, 3)
      .each((_, el) => {
        const txt = cleanWhitespace($(el).text())
        if (txt) {
          bodyText += `${txt} `
        }
      })

    return {
      description: description || (bodyText ? truncate(bodyText.trim(), 420) : null),
      image,
      finalUrl,
      finalDomain,
      externalUrl,
    }
  } catch (err) {
    return {}
  } finally {
    clearTimeout(timeout)
  }
}

const fetchArticleBody = async (url) => {
  if (!url) return null
  try {
    const res = await fetch(url, {
      headers: DEFAULT_HEADERS,
      redirect: 'follow',
    })
    if (!res.ok) return null
    const html = await res.text()
    const dom = new JSDOM(html, { url })
    const reader = new Readability(dom.window.document)
    const article = reader.parse()
    if (article?.textContent) {
      return truncate(article.textContent.replace(/\s+/g, ' ').trim(), 600)
    }
    return null
  } catch (err) {
    return null
  }
}

const fetchTickerNews = async (ticker) => {
  try {
    const { feed, source: feedSource } = await fetchFeedForTicker(ticker)
    if (!feed?.items) return []

    const baseItems = feed.items.slice(0, 12).map((item) => {
      const originalUrl = extractOriginalUrl(item.link)
      const sourceDomain = getDomainFromUrl(originalUrl)
      const snippetText = cleanWhitespace(item.contentSnippet || item.content)
      const score = relevanceScore(
        { title: item.title, snippet: snippetText, url: originalUrl },
        ticker
      )
      return {
        ticker,
        title: item.title?.trim(),
        url: originalUrl,
        source:
          sourceDomain ||
          deriveSourceFromTitle(item.title) ||
          item.creator ||
          item.source ||
          (feedSource === 'yahoo' ? 'Yahoo Finance' : 'Newswire'),
        publishedAt: item.isoDate || item.pubDate || new Date().toISOString(),
        excerpt: truncate(snippetText, 420),
        imageUrl: extractImageFromItem(item),
        relevanceScore: score,
      }
    })

    const prioritized = baseItems
      .sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0))
      .filter((item) => item.relevanceScore > 0 || feedSource === 'google')
      .slice(0, NEWS_PER_TICKER)
      .map(({ relevanceScore: _drop, ...rest }) => rest)
    const candidates = prioritized.length ? prioritized : baseItems.slice(0, NEWS_PER_TICKER)

    // Enrich with live metadata (description + og:image) when available
    const enriched = await Promise.all(
      candidates.map(async (item) => {
        const meta = await fetchArticleMetadata(item.url)
        const targetUrl = meta.externalUrl || meta.finalUrl || item.url
        const domain = getDomainFromUrl(targetUrl)
        const isGooglePage = domain === 'news.google.com'
        const hasMeta = meta && Object.keys(meta).length > 0
        const preferredSource =
          domain && !isGooglePage
            ? domain
            : deriveSourceFromTitle(item.title) || item.source
        const shouldUseMeta = hasMeta && !isGooglePage
        const articleBody = shouldUseMeta ? await fetchArticleBody(targetUrl) : null
        return {
          ...item,
          url: targetUrl,
          source:
            preferredSource ||
            getDomainFromUrl(item.url) ||
            'Newswire',
          excerpt: truncate(articleBody || (shouldUseMeta && meta.description) || item.excerpt, 420),
          imageUrl:
            (shouldUseMeta && isValidImageUrl(meta.image) && meta.image) ||
            (isValidImageUrl(item.imageUrl) ? item.imageUrl : null),
        }
      })
    )

    return enriched
  } catch (error) {
    console.error(`Failed to fetch news for ${ticker}:`, error.message)
    return []
  }
}

const normalizeStoredNewsUrls = () => {
  try {
    const rows = db
      .prepare('SELECT id, news_url FROM posts WHERE is_news = 1 AND news_url IS NOT NULL')
      .all()
    const updateStmt = db.prepare('UPDATE posts SET news_url = ? WHERE id = ?')
    const clearStmt = db.prepare('UPDATE posts SET news_url = NULL, news_source = NULL WHERE id = ?')
    rows.forEach(({ id, news_url }) => {
      const cleaned = extractOriginalUrl(news_url)
      if (!cleaned) return
      const domain = getDomainFromUrl(cleaned)
      if (!domain || domain === 'new') {
        clearStmt.run(id)
        return
      }
      if (cleaned !== news_url) {
        updateStmt.run(cleaned, id)
      }
    })
    db.prepare(
      'UPDATE posts SET news_source = NULL WHERE is_news = 1 AND news_url IS NULL AND news_source IS NOT NULL'
    ).run()
  } catch (err) {
    console.error('Failed to normalize stored news URLs', err.message)
  }
}

const insertNewsPosts = async (newsItems, authorId) => {
  if (!newsItems.length) return []

  const insertStmt = db.prepare(
    `
    INSERT INTO posts (user_id, stock_ticker, title, content, is_news, news_url, news_source, news_published_at, news_image_url, sentiment, sentiment_confidence)
    VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?)
  `
  )

  const existingUrlStmt = db.prepare(
    'SELECT id FROM posts WHERE is_news = 1 AND news_url = ? LIMIT 1'
  )

  const insertedPosts = []

  for (const item of newsItems) {
    if (!item.url || !item.title) continue
    const alreadyExists = existingUrlStmt.get(item.url)
    if (alreadyExists) continue

    const summary =
      item.excerpt ||
      `News update for ${item.ticker} via ${item.source || 'Newswire'}. Read more in the source link.`

    // Skip sentiment analysis during ingestion - will be analyzed on-demand using user's API key
    const sentiment = null
    const sentimentConfidence = 0

    const result = insertStmt.run(
      authorId,
      item.ticker,
      item.title,
      summary,
      item.url,
      item.source || 'Newswire',
      item.publishedAt || new Date().toISOString(),
      item.imageUrl || null,
      sentiment,
      sentimentConfidence
    )

    const saved = db
      .prepare(
        `
      SELECT posts.*, users.username
      FROM posts
      JOIN users ON posts.user_id = users.id
      WHERE posts.id = ?
    `
      )
      .get(result.lastInsertRowid)

    insertedPosts.push(saved)
  }

  return insertedPosts
}

// Keep a bounded set of recent news per ticker (to avoid infinite growth)
const pruneOldNews = (tickers, keepPerTicker = 20) => {
  if (!tickers.length) return
  const stmt = db.prepare(
    `
    DELETE FROM posts
    WHERE id IN (
      SELECT id FROM posts
      WHERE is_news = 1
      AND stock_ticker = ?
      ORDER BY COALESCE(news_published_at, created_at) DESC
      LIMIT -1 OFFSET ?
    )
  `
  )
  tickers.forEach((ticker) => {
    try {
      stmt.run(ticker, keepPerTicker)
    } catch (err) {
      console.error('Failed pruning old news for', ticker, err.message)
    }
  })
}

export const ingestNewsForTickers = async (rawTickers) => {
  const tickers = sanitizeTickers(rawTickers).slice(0, 8)
  if (!tickers.length) {
    return { inserted: [], skipped: [], tickers: [] }
  }

  normalizeStoredNewsUrls()
  const newsUserId = ensureNewsBotUser()

  const newsPromises = tickers.map((ticker) => fetchTickerNews(ticker))
  const results = await Promise.all(newsPromises)

  const flattened = results.flat().filter(Boolean)

  // Deduplicate by URL before hitting the database
  const uniqueByUrl = new Map()
  flattened.forEach((item) => {
    if (item.url && !uniqueByUrl.has(item.url)) {
      uniqueByUrl.set(item.url, item)
    }
  })

  const deduped = Array.from(uniqueByUrl.values())
  const inserted = await insertNewsPosts(deduped, newsUserId)

  const skipped = deduped.filter(
    (item) => !inserted.find((post) => post.news_url === item.url)
  )

  pruneOldNews(tickers, 20)

  // Clean up any legacy bad thumbnails
  try {
    db.prepare(
      `
      UPDATE posts
      SET news_image_url = NULL
      WHERE is_news = 1 AND news_image_url IS NOT NULL
      AND (
        news_image_url LIKE '%news.google.com%' OR
        news_image_url LIKE '%googleusercontent.com%' OR
        news_image_url LIKE '%gstatic.com%'
      )
    `
    ).run()
  } catch (err) {
    console.error('Failed to sanitize legacy news images', err.message)
  }

  return { inserted, skipped, tickers }
}
