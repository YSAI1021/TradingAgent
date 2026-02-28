import { GoogleGenerativeAI } from '@google/generative-ai'

// Initialize Google Gemini client
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '')

const GEMINI_PLACEHOLDER_KEY = 'YOUR_GEMINI_API_KEY'

const sanitizeApiKey = (value) => {
  if (!value) return ''
  const trimmed = String(value).trim()
  return trimmed.replace(/^['"]|['"]$/g, '')
}

const isConfiguredApiKey = (key) => {
  if (!key) return false
  if (key === GEMINI_PLACEHOLDER_KEY) return false
  // Gemini keys from AI Studio currently start with "AIza"
  return key.startsWith('AIza') && key.length >= 30
}

const resolveGeminiApiKey = (requestApiKey) => {
  const cleanedRequestKey = sanitizeApiKey(requestApiKey)
  const cleanedEnvKey = sanitizeApiKey(process.env.GEMINI_API_KEY)

  if (isConfiguredApiKey(cleanedRequestKey)) {
    return cleanedRequestKey
  }
  if (isConfiguredApiKey(cleanedEnvKey)) {
    return cleanedEnvKey
  }
  return ''
}

/**
 * Common stock ticker patterns for extraction
 */
const COMMON_TICKERS = [
  'AAPL', 'MSFT', 'GOOGL', 'GOOG', 'AMZN', 'META', 'NVDA', 'TSLA', 'AMD', 'INTC',
  'JPM', 'BAC', 'GS', 'MS', 'C', 'WFC', 'V', 'MA', 'AXP', 'BLK',
  'JNJ', 'UNH', 'PFE', 'ABBV', 'TMO', 'MRK', 'LLY', 'BMY',
  'XOM', 'CVX', 'COP', 'SLB', 'OXY',
  'PG', 'KO', 'PEP', 'WMT', 'HD', 'MCD', 'NKE', 'SBUX', 'DIS',
  'NFLX', 'PYPL', 'ADBE', 'CSCO', 'CRM', 'ORCL',
  'RIVN', 'LCID', 'NIO', 'XPEV', 'SHOP', 'SQ', 'COIN', 'HOOD', 'PLTR'
]

/**
 * Extract stock tickers from a message
 * @param {string} message - User message
 * @returns {string[]} Array of detected tickers
 */
export const extractTickers = (message) => {
  if (!message) return []

  const tickers = new Set()
  const upperMessage = message.toUpperCase()

  // Match $TICKER pattern
  const dollarPattern = /\$([A-Z]{1,5})\b/g
  let match
  while ((match = dollarPattern.exec(upperMessage)) !== null) {
    tickers.add(match[1])
  }

  // Match common tickers mentioned directly
  COMMON_TICKERS.forEach(ticker => {
    // Use word boundary matching
    const regex = new RegExp(`\\b${ticker}\\b`, 'i')
    if (regex.test(message)) {
      tickers.add(ticker)
    }
  })

  // Match company names to tickers
  const companyMappings = {
    'apple': 'AAPL',
    'microsoft': 'MSFT',
    'google': 'GOOGL',
    'alphabet': 'GOOGL',
    'amazon': 'AMZN',
    'meta': 'META',
    'facebook': 'META',
    'nvidia': 'NVDA',
    'tesla': 'TSLA',
    'amd': 'AMD',
    'intel': 'INTC',
    'netflix': 'NFLX',
    'paypal': 'PYPL',
    'adobe': 'ADBE',
    'cisco': 'CSCO',
    'salesforce': 'CRM',
    'oracle': 'ORCL',
    'jpmorgan': 'JPM',
    'goldman': 'GS',
    'morgan stanley': 'MS',
    'bank of america': 'BAC',
    'visa': 'V',
    'mastercard': 'MA',
    'disney': 'DIS',
    'starbucks': 'SBUX',
    'nike': 'NKE',
    'walmart': 'WMT',
    'home depot': 'HD',
    'coca-cola': 'KO',
    'coca cola': 'KO',
    'pepsi': 'PEP',
    'pepsico': 'PEP',
    'exxon': 'XOM',
    'chevron': 'CVX',
    'rivian': 'RIVN',
    'lucid': 'LCID',
    'nio': 'NIO',
    'shopify': 'SHOP',
    'coinbase': 'COIN',
    'robinhood': 'HOOD',
    'palantir': 'PLTR',
  }

  const lowerMessage = message.toLowerCase()
  for (const [company, ticker] of Object.entries(companyMappings)) {
    if (lowerMessage.includes(company)) {
      tickers.add(ticker)
    }
  }

  return Array.from(tickers).slice(0, 5) // Limit to 5 tickers
}

/**
 * AI Trading Assistant - Chat with Google Gemini
 * @param {Array} messages - Chat history
 * @param {Object} context - User context (portfolio, preferences)
 * @param {string} apiKey - User-provided Gemini API key
 * @returns {Object} AI response
 */
export const chatWithAI = async ({ messages, context = {}, apiKey }) => {
  try {
    // Check if API key exists (use provided key or fallback to env)
    const geminiApiKey = resolveGeminiApiKey(apiKey)
    if (!geminiApiKey) {
      return {
        success: false,
        error: 'Gemini API key not configured',
        message: 'Gemini API key is missing or placeholder. Set a real GEMINI_API_KEY in backend/.env (not YOUR_GEMINI_API_KEY) or provide a valid apiKey from the client, then restart the backend.',
      }
    }

    // Create a new GoogleGenerativeAI instance with the provided API key
    const userGenAI = new GoogleGenerativeAI(geminiApiKey)

    // Build system prompt with user context
    const systemPrompt = buildSystemPrompt(context)

    // Get Gemini model (using gemini-2.0-flash for chat)
    const model = userGenAI.getGenerativeModel({ model: 'gemini-2.0-flash' })

    // Filter out any leading assistant messages (like welcome messages)
    const filteredMessages = messages.filter((msg, index) => {
      if (msg.role === 'user') return true
      const hasUserBefore = messages.slice(0, index).some((m) => m.role === 'user')
      return hasUserBefore
    })

    // If only one user message, use simple generation
    if (filteredMessages.length === 1 && filteredMessages[0].role === 'user') {
      const result = await model.generateContent(systemPrompt + '\n\nUser question: ' + filteredMessages[0].content)
      const response = await result.response
      const aiMessage = response.text()

      return {
        success: true,
        message: aiMessage,
      }
    }

    // For conversation with history, use chat mode
    const conversationHistory = []

    let firstUserFound = false
    for (const msg of filteredMessages) {
      if (msg.role === 'user' && !firstUserFound) {
        conversationHistory.push({
          role: 'user',
          parts: [{ text: systemPrompt + '\n\nUser question: ' + msg.content }],
        })
        firstUserFound = true
      } else {
        conversationHistory.push({
          role: msg.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: msg.content }],
        })
      }
    }

    // Start chat with history (excluding last message)
    const chat = model.startChat({
      history: conversationHistory.slice(0, -1),
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 1000,
      },
    })

    // Send the last message
    const lastMessage = conversationHistory[conversationHistory.length - 1]
    const result = await chat.sendMessage(lastMessage.parts[0].text)
    const response = await result.response
    const aiMessage = response.text()

    return {
      success: true,
      message: aiMessage,
    }
  } catch (error) {
    console.error('Gemini chat error:', error)

    const errorMessage = String(error?.message || '').toLowerCase()
    const statusCode = Number(error?.status || 0)

    if (
      (statusCode === 403 && errorMessage.includes('reported as leaked')) ||
      errorMessage.includes('api key not valid') ||
      errorMessage.includes('invalid api key')
    ) {
      return {
        success: false,
        error: 'Gemini API key is blocked or invalid',
        message:
          'The Gemini API key is blocked (for example: leaked/revoked) or invalid. Create a new key in Google AI Studio and update GEMINI_API_KEY in backend/.env.',
      }
    }

    if (errorMessage.includes('api key')) {
      return {
        success: false,
        error: 'Invalid Gemini API key',
        message: 'Gemini API key validation failed. Update GEMINI_API_KEY in backend/.env or provide a valid key from the client.',
      }
    }

    if (errorMessage.includes('quota') || statusCode === 429) {
      return {
        success: false,
        error: 'Gemini quota exceeded',
        message: 'AI service is temporarily unavailable. Please try again later.',
      }
    }

    return {
      success: false,
      error: error.message || 'Unknown error',
      message: 'Sorry, I encountered an error. Please try again.',
    }
  }
}

/**
 * Build system prompt with detailed user context
 */
const buildSystemPrompt = (context) => {
  let prompt = `You are an intelligent AI trading assistant for a stock trading platform.
Your role is to help users with:
- Stock analysis and personalized recommendations based on their portfolio
- Portfolio management advice
- Market trends and insights
- Trading strategies and education
- Risk management guidance

Guidelines:
- Be professional, helpful, and educational
- Always include disclaimers that this is not financial advice
- Encourage users to do their own research (DYOR)
- Focus on education rather than specific buy/sell recommendations
- Be cautious and highlight risks in trading
- IMPORTANT: When giving recommendations, consider the user's CURRENT PORTFOLIO holdings listed below
- IMPORTANT: When relevant news is provided below, USE IT to support your analysis with specific citations
- When citing news, mention the source and provide context from the article
- Respect data privacy: never expose private portfolio details that are not needed to answer the question
- Evidence Mode is mandatory: end each response with 2-4 compact evidence bullets in this format:
  Source | Evidence | Confidence (High/Medium/Low)
`

  // Add detailed portfolio context if available
  if (context.portfolio && context.portfolio.length > 0) {
    prompt += `\n\n=== USER'S CURRENT PORTFOLIO ===`

    let totalValue = 0
    let totalCost = 0

    context.portfolio.forEach((h) => {
      const value = h.shares * (h.currentPrice || h.averageCost)
      const cost = h.shares * h.averageCost
      const gain = value - cost
      const gainPct = cost > 0 ? ((gain / cost) * 100).toFixed(2) : 0

      totalValue += value
      totalCost += cost

      prompt += `\n- ${h.symbol}: ${h.shares} shares @ $${h.averageCost.toFixed(2)} avg cost`
      if (h.currentPrice) {
        prompt += ` (current: $${h.currentPrice.toFixed(2)}, ${gain >= 0 ? '+' : ''}${gainPct}%)`
      }
    })

    const totalGain = totalValue - totalCost
    const totalGainPct = totalCost > 0 ? ((totalGain / totalCost) * 100).toFixed(2) : 0

    prompt += `\n\nPortfolio Summary:`
    prompt += `\n- Total Cost: $${totalCost.toFixed(2)}`
    prompt += `\n- Total Value: $${totalValue.toFixed(2)}`
    prompt += `\n- Overall Return: ${totalGain >= 0 ? '+' : ''}$${totalGain.toFixed(2)} (${totalGainPct}%)`
    prompt += `\n- Number of holdings: ${context.portfolio.length}`

    // Analyze portfolio composition
    const sectors = {}
    context.portfolio.forEach((h) => {
      const sector = classifyStock(h.symbol)
      sectors[sector] = (sectors[sector] || 0) + 1
    })
    prompt += `\n- Sector exposure: ${Object.entries(sectors).map(([s, c]) => `${s}(${c})`).join(', ')}`

    prompt += `\n\nWhen giving advice, SPECIFICALLY reference the user's holdings above and consider:`
    prompt += `\n- Their current sector diversification`
    prompt += `\n- Which positions are profitable vs at a loss`
    prompt += `\n- Portfolio concentration risks`
    prompt += `\n=== END PORTFOLIO ===\n`
  } else {
    prompt += `\n\nNote: This user has NO current portfolio holdings. Recommend they start building a diversified portfolio.\n`
  }

  // Add news context if available
  if (context.news && context.news.length > 0) {
    prompt += `\n\n=== RECENT NEWS FOR RELEVANT STOCKS ===`
    prompt += `\nUse the following retrieved news context (RAG) to support your analysis. Cite sources when referencing this information.\n`

    context.news.forEach((article, index) => {
      prompt += `\n[${index + 1}] ${article.stock_ticker ? `$${article.stock_ticker}` : 'General'}`
      prompt += `\n   Title: ${article.title}`
      prompt += `\n   Source: ${article.news_source || 'News'}`
      if (article.sentiment && article.sentiment !== 'neutral') {
        prompt += `\n   Sentiment: ${article.sentiment} (${Math.round((article.sentiment_confidence || 0) * 100)}% confidence)`
      }
      if (article.content) {
        prompt += `\n   Summary: ${article.content.substring(0, 200)}${article.content.length > 200 ? '...' : ''}`
      }
      if (article.news_url) {
        prompt += `\n   URL: ${article.news_url}`
      }
      prompt += `\n`
    })

    prompt += `\n=== END NEWS ===`
    prompt += `\n\nWhen referencing news in your response:`
    prompt += `\n- Cite the source by name (e.g., "According to [Source]...")`
    prompt += `\n- Mention the sentiment if relevant`
    prompt += `\n- Provide the article URL for users to read more`
    prompt += `\n- Include confidence labels (High/Medium/Low) in the final evidence bullets`
  }

  prompt += `\nAlways remind users that you provide educational information only, not financial advice.`

  return prompt
}

/**
 * Simple stock sector classification
 */
const classifyStock = (symbol) => {
  const sectors = {
    Technology: ['AAPL', 'MSFT', 'GOOGL', 'GOOG', 'META', 'NVDA', 'AMD', 'INTC', 'CRM', 'ORCL', 'ADBE', 'CSCO'],
    'E-Commerce': ['AMZN', 'SHOP', 'EBAY', 'ETSY', 'BABA', 'JD'],
    'Electric Vehicles': ['TSLA', 'RIVN', 'LCID', 'NIO', 'XPEV'],
    Finance: ['JPM', 'BAC', 'GS', 'MS', 'C', 'WFC', 'V', 'MA', 'AXP', 'BLK'],
    Healthcare: ['JNJ', 'UNH', 'PFE', 'ABBV', 'TMO', 'MRK', 'LLY', 'BMY'],
    Consumer: ['PG', 'KO', 'PEP', 'WMT', 'HD', 'MCD', 'NKE', 'SBUX', 'DIS'],
    Energy: ['XOM', 'CVX', 'COP', 'SLB', 'OXY'],
    Telecom: ['VZ', 'T', 'TMUS'],
  }

  for (const [sector, symbols] of Object.entries(sectors)) {
    if (symbols.includes(symbol.toUpperCase())) {
      return sector
    }
  }
  return 'Other'
}

/**
 * Analyze news sentiment using AI
 * @param {string} title - News title
 * @param {string} content - News content
 * @param {string} stockTicker - Related stock ticker
 * @param {string} apiKey - User-provided API key (optional, falls back to env)
 * @returns {Object} Sentiment analysis result
 */
export const analyzeNewsSentiment = async (title, content, stockTicker = null, apiKey = null) => {
  try {
    const geminiApiKey = resolveGeminiApiKey(apiKey)
    if (!geminiApiKey) {
      return { sentiment: 'neutral', confidence: 0 }
    }

    const userGenAI = new GoogleGenerativeAI(geminiApiKey)
    const model = userGenAI.getGenerativeModel({ model: 'gemini-2.0-flash' })

    const prompt = `Analyze the sentiment of this financial news article for stock investors.
${stockTicker ? `Related stock: ${stockTicker}` : ''}

Title: ${title}

Content: ${content ? content.substring(0, 500) : title}

Respond with ONLY a JSON object in this exact format (no markdown, no explanation):
{"sentiment": "bullish" or "bearish" or "neutral", "confidence": 0.0 to 1.0}

Rules:
- "bullish" = positive news that could drive stock price UP (good earnings, new products, partnerships, growth)
- "bearish" = negative news that could drive stock price DOWN (losses, lawsuits, layoffs, recalls)
- "neutral" = news with no clear positive or negative impact
- confidence = how confident you are (0.5 = unsure, 1.0 = very confident)`

    const result = await model.generateContent(prompt)
    const response = await result.response
    const text = response.text().trim()

    // Parse JSON response
    try {
      // Remove any markdown code blocks if present
      const jsonText = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
      const parsed = JSON.parse(jsonText)

      // Validate sentiment value
      const validSentiments = ['bullish', 'bearish', 'neutral']
      if (!validSentiments.includes(parsed.sentiment)) {
        parsed.sentiment = 'neutral'
      }

      // Validate confidence
      parsed.confidence = Math.max(0, Math.min(1, parseFloat(parsed.confidence) || 0.5))

      return parsed
    } catch (parseError) {
      console.error('Failed to parse sentiment response:', text)
      // Try to extract sentiment from text
      const lowerText = text.toLowerCase()
      if (lowerText.includes('bullish')) return { sentiment: 'bullish', confidence: 0.6 }
      if (lowerText.includes('bearish')) return { sentiment: 'bearish', confidence: 0.6 }
      return { sentiment: 'neutral', confidence: 0.5 }
    }
  } catch (error) {
    console.error('Sentiment analysis error:', error)
    return { sentiment: 'neutral', confidence: 0 }
  }
}

export default { chatWithAI, analyzeNewsSentiment, extractTickers }
