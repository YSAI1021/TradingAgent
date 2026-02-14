#!/usr/bin/env node
/**
 * One-time script to update sentiment for all existing news articles
 * Run: node scripts/update-sentiment.js
 */

import 'dotenv/config'
import db from '../database.js'
import { analyzeNewsSentiment } from '../aiService.js'

const BATCH_SIZE = 10
const DELAY_MS = 1000 // Delay between batches to avoid rate limiting

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function updateAllSentiment() {
  console.log('🔄 Starting sentiment update for all news articles...\n')

  // Check if API key is configured
  if (!process.env.GEMINI_API_KEY) {
    console.error('❌ Error: GEMINI_API_KEY not found in .env file')
    process.exit(1)
  }

  // Get all news articles that need sentiment update
  const newsToUpdate = db
    .prepare(
      `
      SELECT id, stock_ticker, title, content, sentiment
      FROM posts
      WHERE is_news = 1
        AND (sentiment IS NULL OR sentiment = 'neutral' OR sentiment = '')
      ORDER BY created_at DESC
    `
    )
    .all()

  console.log(`📰 Found ${newsToUpdate.length} news articles to analyze\n`)

  if (newsToUpdate.length === 0) {
    console.log('✅ All news articles already have sentiment!')
    process.exit(0)
  }

  const updateStmt = db.prepare(
    'UPDATE posts SET sentiment = ?, sentiment_confidence = ? WHERE id = ?'
  )

  let updatedCount = 0
  let errorCount = 0
  let neutralCount = 0

  // Process in batches
  for (let i = 0; i < newsToUpdate.length; i += BATCH_SIZE) {
    const batch = newsToUpdate.slice(i, i + BATCH_SIZE)
    console.log(`\n📦 Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(newsToUpdate.length / BATCH_SIZE)}`)

    for (const news of batch) {
      try {
        process.stdout.write(`  Analyzing: ${news.title.substring(0, 50)}... `)

        const analysis = await analyzeNewsSentiment(news.title, news.content, news.stock_ticker)

        if (analysis.sentiment && analysis.sentiment !== 'neutral') {
          updateStmt.run(analysis.sentiment, analysis.confidence, news.id)
          updatedCount++
          console.log(`${analysis.sentiment === 'bullish' ? '📈' : '📉'} ${analysis.sentiment} (${(analysis.confidence * 100).toFixed(0)}%)`)
        } else {
          neutralCount++
          console.log('⚪ neutral')
        }
      } catch (err) {
        errorCount++
        console.log(`❌ Error: ${err.message}`)
      }
    }

    // Delay between batches to avoid rate limiting
    if (i + BATCH_SIZE < newsToUpdate.length) {
      console.log(`  ⏳ Waiting ${DELAY_MS}ms before next batch...`)
      await sleep(DELAY_MS)
    }
  }

  console.log('\n' + '='.repeat(50))
  console.log('📊 Summary:')
  console.log(`   ✅ Updated: ${updatedCount} (bullish/bearish)`)
  console.log(`   ⚪ Neutral: ${neutralCount}`)
  console.log(`   ❌ Errors: ${errorCount}`)
  console.log(`   📰 Total processed: ${newsToUpdate.length}`)
  console.log('='.repeat(50))
  console.log('\n✨ Done!')
}

updateAllSentiment().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
