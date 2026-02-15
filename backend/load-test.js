const API_BASE = process.env.API_BASE || 'http://localhost:3000'
const NUM_USERS = parseInt(process.env.NUM_USERS) || 50

let metrics = {
  requests: { total: 0, success: 0, failed: 0 },
  responseTimes: [],
  errors: {}
}

async function auth(username, password) {
  let res = await fetch(`${API_BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  })
  
  if (!res.ok) {
    res = await fetch(`${API_BASE}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, email: `${username}@test.com`, password })
    })
  }
  
  const data = await res.json()
  return data.token
}

async function request(url, method, token, body) {
  const start = Date.now()
  metrics.requests.total++
  
  try {
    const res = await fetch(`${API_BASE}${url}`, {
      method,
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: body ? JSON.stringify(body) : undefined
    })
    
    metrics.responseTimes.push(Date.now() - start)
    
    if (res.ok) {
      metrics.requests.success++
      return await res.json()
    } else {
      metrics.requests.failed++
      const status = res.status
      if (!metrics.errors[status]) metrics.errors[status] = 0
      metrics.errors[status]++
    }
  } catch (err) {
    metrics.requests.failed++
    if (!metrics.errors['network']) metrics.errors['network'] = 0
    metrics.errors['network']++
  }
  return null
}

async function loadTest(token) {
  for (let i = 0; i < 100; i++) {
    await request('/api/posts', 'POST', token, {
      title: `Post ${Date.now()}`,
      content: 'Test',
      tickers: ['AAPL']
    })
    
    await request('/api/portfolio/transactions', 'POST', token, {
      symbol: 'AAPL',
      transaction_type: 'buy',
      shares: Math.floor(Math.random() * 10) + 1,
      price: Math.random() * 200 + 100
    })
    
    await request('/api/portfolio', 'GET', token)
  }
}

async function raceTest(token) {
  const portfolio = await request('/api/portfolio', 'GET', token)
  const initial = portfolio?.portfolio?.find(p => p.symbol === 'AAPL')?.total_shares || 0
  
  const promises = []
  for (let i = 0; i < 20; i++) {
    promises.push(request('/api/portfolio/transactions', 'POST', token, {
      symbol: 'AAPL',
      transaction_type: 'buy',
      shares: 10,
      price: 150
    }))
  }
  
  await Promise.all(promises)
  await new Promise(r => setTimeout(r, 1000))
  
  const final = await request('/api/portfolio', 'GET', token)
  const actual = final?.portfolio?.find(p => p.symbol === 'AAPL')?.total_shares || 0
  const expected = initial + 200
  
  return { expected, actual, consistent: expected === actual }
}

async function main() {
  console.log('Concurrency Test Suite')
  console.log(`Users: ${NUM_USERS}`)
  console.log('')
  
  console.log('Creating test users...')
  const tokens = []
  for (let i = 1; i <= NUM_USERS; i++) {
    const token = await auth(`loadtest_${i}`, 'Test123!')
    if (token) tokens.push(token)
  }
  console.log(`Created ${tokens.length} users\n`)
  
  console.log('Running load test...')
  const start = Date.now()
  await Promise.all(tokens.map(t => loadTest(t)))
  const elapsed = (Date.now() - start) / 1000
  
  console.log('\nLoad Test Results:')
  console.log(`Time: ${elapsed.toFixed(2)}s`)
  console.log(`Requests: ${metrics.requests.total}`)
  console.log(`Success: ${metrics.requests.success} (${((metrics.requests.success/metrics.requests.total)*100).toFixed(2)}%)`)
  console.log(`Failed: ${metrics.requests.failed} (${((metrics.requests.failed/metrics.requests.total)*100).toFixed(2)}%)`)
  console.log(`Throughput: ${(metrics.requests.total/elapsed).toFixed(2)} req/s`)
  
  const sorted = metrics.responseTimes.sort((a,b) => a-b)
  const avg = sorted.reduce((a,b) => a+b) / sorted.length
  console.log(`\nResponse Times:`)
  console.log(`Avg: ${avg.toFixed(2)}ms`)
  console.log(`p50: ${sorted[Math.floor(sorted.length*0.5)]}ms`)
  console.log(`p95: ${sorted[Math.floor(sorted.length*0.95)]}ms`)
  console.log(`Max: ${sorted[sorted.length-1]}ms`)
  
  if (Object.keys(metrics.errors).length > 0) {
    console.log('\nErrors:')
    Object.entries(metrics.errors).forEach(([type, count]) => {
      console.log(`${type}: ${count}`)
    })
  }
  
  console.log('\nRunning race condition test...')
  const raceResult = await raceTest(tokens[0])
  console.log(`Expected: ${raceResult.expected}`)
  console.log(`Actual: ${raceResult.actual}`)
  console.log(`Status: ${raceResult.consistent ? 'PASS' : 'FAIL - Race condition detected'}`)
}

main().catch(console.error)
