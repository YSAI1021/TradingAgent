const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000'

const CONFIG = {
  numUsers: 50,
  sessionsPerUser: { min: 2, max: 10 },
  clickProbabilityA: 0.60,
  clickProbabilityB: 0.45,
  actionDelay: { min: 500, max: 2000 },
  tests: ['button_color_test', 'homepage_layout_test'],
}

const randomDelay = (min, max) => {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const generateUsername = (index) => {
  const adjectives = ['happy', 'clever', 'brave', 'swift', 'bright', 'cool', 'wise', 'bold']
  const nouns = ['trader', 'investor', 'analyst', 'bull', 'bear', 'whale', 'eagle', 'tiger']
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)]
  const noun = nouns[Math.floor(Math.random() * nouns.length)]
  return `${adj}_${noun}_${index}`
}

const createUser = async (username) => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username,
        email: `${username}@test.com`,
        password: 'Test123!',
      }),
    })

    if (!response.ok) {
      const loginResponse = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          password: 'Test123!',
        }),
      })

      if (!loginResponse.ok) {
        throw new Error('Login failed')
      }

      const loginData = await loginResponse.json()
      return loginData.token
    }

    const data = await response.json()
    return data.token
  } catch (error) {
    console.error(`Error with user ${username}:`, error.message)
    return null
  }
}

const getTestAssignments = async (token) => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/ab-tests/assignments`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      throw new Error('Failed to get assignments')
    }

    const data = await response.json()
    return data.assignments
  } catch (error) {
    console.error('Error getting assignments:', error.message)
    return {}
  }
}

const viewPage = async (token) => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/home-data`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    })

    return response.ok
  } catch (error) {
    return false
  }
}

const clickButton = async (token, testId) => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/button-click`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ testId }),
    })

    return response.ok
  } catch (error) {
    return false
  }
}

const exploreStocks = async (token) => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/explore-stocks`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    })

    return response.ok
  } catch (error) {
    return false
  }
}

const simulateSession = async (token, username, sessionNum) => {
  console.log(`Session ${sessionNum} for ${username}`)

  const assignments = await getTestAssignments(token)
  await sleep(randomDelay(CONFIG.actionDelay.min, CONFIG.actionDelay.max))

  const viewSuccess = await viewPage(token)
  if (!viewSuccess) return

  await sleep(randomDelay(CONFIG.actionDelay.min, CONFIG.actionDelay.max))

  for (const testId of CONFIG.tests) {
    const variation = assignments[testId]?.variation

    if (!variation) continue

    let clickProbability = 0.5
    if (testId === 'button_color_test') {
      clickProbability = variation === 'A' ? CONFIG.clickProbabilityA : CONFIG.clickProbabilityB
    } else if (testId === 'homepage_layout_test') {
      clickProbability = variation === 'A' ? 0.55 : 0.42
    }

    const willClick = Math.random() < clickProbability

    if (willClick) {
      console.log(`  User clicks (variation ${variation})`)

      if (testId === 'button_color_test') {
        await clickButton(token, testId)
      } else if (testId === 'homepage_layout_test') {
        await exploreStocks(token)
      }

      await sleep(randomDelay(CONFIG.actionDelay.min, CONFIG.actionDelay.max))
    }
  }
}

const runSimulation = async () => {
  console.log('Starting simulation')
  console.log(`Users: ${CONFIG.numUsers}`)
  console.log(`Click rate A: ${CONFIG.clickProbabilityA * 100}%`)
  console.log(`Click rate B: ${CONFIG.clickProbabilityB * 100}%`)
  console.log('')

  for (let i = 1; i <= CONFIG.numUsers; i++) {
    const username = generateUsername(i)
    console.log(`User ${i}/${CONFIG.numUsers}: ${username}`)

    const token = await createUser(username)
    if (!token) {
      console.log('  Failed to authenticate')
      continue
    }

    const numSessions = randomDelay(
      CONFIG.sessionsPerUser.min,
      CONFIG.sessionsPerUser.max
    )

    for (let session = 1; session <= numSessions; session++) {
      await simulateSession(token, username, session)
      await sleep(randomDelay(500, 1500))
    }

    await sleep(randomDelay(200, 500))
  }

  console.log('\nSimulation complete')
  console.log('Check analytics: GET /api/ab-tests/analytics')
}

runSimulation().catch((error) => {
  console.error('Simulation failed:', error)
  process.exit(1)
})
