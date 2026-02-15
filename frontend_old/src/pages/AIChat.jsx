import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { api } from '../services/api'
import ReactMarkdown from 'react-markdown'
import './AIChat.css'

function AIChat() {
  const { user, token } = useAuth()
  const navigate = useNavigate()
  const [messages, setMessages] = useState([])
  const [inputMessage, setInputMessage] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [hasApiKey, setHasApiKey] = useState(false)
  const messagesEndRef = useRef(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  // Check for API key on mount and when returning from settings
  useEffect(() => {
    const checkApiKey = () => {
      const apiKey = localStorage.getItem('geminiApiKey')
      setHasApiKey(!!apiKey)
    }

    checkApiKey()

    // Also check when window regains focus (returning from settings)
    window.addEventListener('focus', checkApiKey)
    return () => window.removeEventListener('focus', checkApiKey)
  }, [])

  useEffect(() => {
    const welcomeMessage = {
      role: 'assistant',
      content: `Hello ${user?.username || 'there'}! I'm your AI Trading Assistant. I can help you with:

• Stock analysis and market insights
• Portfolio management advice
• Trading strategies and education
• Risk management guidance
• Market trends and news

How can I assist you today?

*Disclaimer: I provide educational information only, not financial advice. Always do your own research (DYOR) before making investment decisions.*`,
    }
    setMessages([welcomeMessage])
  }, [user])

  const handleSendMessage = async (e) => {
    e.preventDefault()

    if (!inputMessage.trim()) return

    const apiKey = localStorage.getItem('geminiApiKey')
    if (!apiKey) {
      setError('Please set your API key in Settings first.')
      return
    }

    const userMessage = {
      role: 'user',
      content: inputMessage.trim(),
    }

    setMessages((prev) => [...prev, userMessage])
    setInputMessage('')
    setIsLoading(true)
    setError('')

    try {
      const response = await api.chatWithAI(token, [...messages, userMessage], apiKey)

      if (response.success) {
        const aiMessage = {
          role: 'assistant',
          content: response.message,
          newsUsed: response.newsUsed || [],
          detectedTickers: response.detectedTickers || [],
        }
        setMessages((prev) => [...prev, aiMessage])
      } else {
        setError(response.message || 'Failed to get response')
        const errorMessage = {
          role: 'assistant',
          content: response.message || 'Sorry, I encountered an error. Please try again.',
        }
        setMessages((prev) => [...prev, errorMessage])
      }
    } catch (err) {
      console.error('Chat error:', err)
      const errorMsg = 'Failed to send message. Please try again.'
      setError(errorMsg)

      const errorMessage = {
        role: 'assistant',
        content: errorMsg,
      }
      setMessages((prev) => [...prev, errorMessage])
    } finally {
      setIsLoading(false)
    }
  }

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage(e)
    }
  }

  const clearChat = () => {
    const welcomeMessage = {
      role: 'assistant',
      content: `Chat cleared! How can I help you today?

*Reminder: I provide educational information only, not financial advice.*`,
    }
    setMessages([welcomeMessage])
    setError('')
  }

  const suggestedPrompts = [
    'What stocks should I consider for long-term investment?',
    'How can I diversify my portfolio?',
    'Explain the difference between value and growth stocks',
    'What are the risks of investing in tech stocks?',
    'How do I analyze a company\'s financial health?',
  ]

  const handleSuggestedPrompt = (prompt) => {
    setInputMessage(prompt)
  }

  return (
    <div className="ai-chat-shell">
      <div className="bg-grid"></div>
      <div className="bg-lines"></div>
      <div className="bg-glow">
        <div className="glow-1"></div>
        <div className="glow-2"></div>
        <div className="glow-3"></div>
      </div>

      {/* API Key Required Overlay */}
      {!hasApiKey && (
        <div className="api-key-overlay">
          <div className="api-key-overlay-content">
            <div className="overlay-icon">🔐</div>
            <h2>API Key Required</h2>
            <p>Please configure your Gemini API key in Profile Settings to use the AI Assistant</p>
            <button onClick={() => navigate('/profile')} className="go-to-settings-btn">
              Go to Profile Settings
            </button>
          </div>
        </div>
      )}

      <div className="ai-chat-container">
        <div className="ai-chat-header">
          <div className="header-top">
            <button onClick={() => navigate('/')} className="back-btn">
              ← Back to Home
            </button>
          </div>
          <h1>AI Trading Assistant</h1>
          <p>Get personalized trading insights and education</p>
          <button onClick={clearChat} className="clear-chat-btn">
            Clear Chat
          </button>
        </div>

        {error && <div className="chat-error">{error}</div>}

        <div className="chat-messages">
          {messages.map((message, index) => (
            <div
              key={index}
              className={`message ${message.role === 'user' ? 'user-message' : 'ai-message'}`}
            >
              <div className="message-avatar">{message.role === 'user' ? '👤' : '🤖'}</div>
              <div className="message-content">
                {message.role === 'assistant' && message.newsUsed && message.newsUsed.length > 0 && (
                  <div className="news-indicator">
                    <span className="news-badge">📰 {message.newsUsed.length} news source{message.newsUsed.length > 1 ? 's' : ''} referenced</span>
                  </div>
                )}
                <div className="message-text">
                  {message.role === 'assistant' ? (
                    <ReactMarkdown>{message.content}</ReactMarkdown>
                  ) : (
                    message.content.split('\n').map((line, i) => (
                      <span key={i}>
                        {line}
                        {i < message.content.split('\n').length - 1 && <br />}
                      </span>
                    ))
                  )}
                </div>
                {message.role === 'assistant' && message.newsUsed && message.newsUsed.length > 0 && (
                  <div className="message-sources">
                    <div className="sources-header">Sources:</div>
                    <div className="sources-list">
                      {message.newsUsed.map((news, newsIndex) => (
                        <a
                          key={newsIndex}
                          href={news.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`source-link sentiment-${news.sentiment || 'neutral'}`}
                        >
                          <span className="source-ticker">${news.ticker}</span>
                          <span className="source-title">{news.title}</span>
                          <span className="source-name">{news.source}</span>
                          {news.sentiment && news.sentiment !== 'neutral' && (
                            <span className={`source-sentiment ${news.sentiment}`}>
                              {news.sentiment === 'bullish' ? '📈 Bullish' : '📉 Bearish'}
                            </span>
                          )}
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="message ai-message">
              <div className="message-avatar">🤖</div>
              <div className="message-content">
                <div className="typing-indicator">
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {messages.length === 1 && (
          <div className="suggested-prompts">
            <h3>Suggested Questions:</h3>
            <div className="prompts-grid">
              {suggestedPrompts.map((prompt, index) => (
                <button key={index} onClick={() => handleSuggestedPrompt(prompt)} className="prompt-button">
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}

        <form onSubmit={handleSendMessage} className="chat-input-form">
          <textarea
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Ask me anything about trading, stocks, or your portfolio..."
            className="chat-input"
            rows="3"
            disabled={isLoading || !hasApiKey}
          />
          <button type="submit" className="send-button" disabled={isLoading || !inputMessage.trim() || !hasApiKey}>
            {isLoading ? 'Sending...' : 'Send'}
          </button>
        </form>

        <div className="chat-disclaimer">
          AI responses are for educational purposes only. Not financial advice. Always DYOR.
        </div>
      </div>
    </div>
  )
}

export default AIChat
