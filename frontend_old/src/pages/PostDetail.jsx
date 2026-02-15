import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useTimezone } from '../context/TimezoneContext'
import { api } from '../services/api'
import TradingViewWidget from '../components/TradingViewWidget'
import TimezoneToggle from '../components/TimezoneToggle'
import { formatDate } from '../utils/dateFormatter'
import './PostDetail.css'

// Helper function to build comment tree
const buildCommentTree = (comments) => {
  const commentMap = {}
  const rootComments = []

  // First pass: create a map of all comments
  comments.forEach((comment) => {
    commentMap[comment.id] = { ...comment, replies: [] }
  })

  // Second pass: build the tree structure
  comments.forEach((comment) => {
    if (comment.parent_comment_id) {
      // This is a reply, add it to its parent's replies
      if (commentMap[comment.parent_comment_id]) {
        commentMap[comment.parent_comment_id].replies.push(commentMap[comment.id])
      }
    } else {
      // This is a root comment
      rootComments.push(commentMap[comment.id])
    }
  })

  return rootComments
}

// Comment component with nested replies
function CommentThread({
  comment,
  postId,
  user,
  token,
  onCommentDeleted,
  onReplyAdded,
  level = 0,
  timezone,
}) {
  const [showReplyForm, setShowReplyForm] = useState(false)
  const [replyContent, setReplyContent] = useState('')
  const [error, setError] = useState('')
  const [showReplies, setShowReplies] = useState(false)
  const [commentAuthorBadges, setCommentAuthorBadges] = useState([])

  useEffect(() => {
    const loadCommentAuthorBadges = async () => {
      try {
        const badges = await api.getUserBadgesById(token, comment.user_id)
        setCommentAuthorBadges(badges)
      } catch (err) {
        console.error('Error loading comment author badges:', err)
      }
    }
    loadCommentAuthorBadges()
  }, [comment.user_id, token])

  const handleReply = async (e) => {
    e.preventDefault()
    if (!replyContent.trim()) return

    try {
      const response = await api.createComment(token, postId, replyContent, comment.id)
      if (response.error) {
        setError(response.error)
      } else {
        setReplyContent('')
        setShowReplyForm(false)
        onReplyAdded(response)
      }
    } catch (err) {
      setError('Failed to post reply')
    }
  }

  const handleDelete = async () => {
    if (window.confirm('Are you sure you want to delete this comment?')) {
      try {
        await api.deleteComment(token, comment.id)
        onCommentDeleted(comment.id)
      } catch (err) {
        console.error('Failed to delete comment:', err)
      }
    }
  }

  const replyCount = comment.replies ? comment.replies.length : 0

  return (
    <div className={`comment-thread level-${level}`}>
      <div className="comment-card">
        <div className="comment-header">
          <div className="comment-author-info">
            <span className="comment-author">{comment.username}</span>
            {commentAuthorBadges.length > 0 && (
              <div className="comment-author-badges">
                {commentAuthorBadges.slice(0, 2).map((badge) => {
                  const isAdmin = badge.name === 'Admin'
                  const isLevel = badge.badge_type === 'level'
                  return (
                    <span
                      key={badge.id}
                      className={`badge-mini ${isAdmin ? 'admin' : ''} ${isLevel ? 'level' : ''}`}
                      title={badge.description}
                      style={
                        !isAdmin
                          ? {
                              borderColor: badge.color,
                              backgroundColor: isLevel ? '#fef3c7' : '#f8fafc',
                            }
                          : {}
                      }
                    >
                      <span
                        className="badge-mini-icon"
                        style={!isAdmin ? { color: badge.color } : {}}
                      >
                        {badge.icon}
                      </span>
                      <span className="badge-mini-name">{badge.name}</span>
                    </span>
                  )
                })}
              </div>
            )}
          </div>
          <span className="comment-date">
            {formatDate(comment.created_at, timezone)}
          </span>
        </div>
        <div className="comment-body-indent">
          <div className="comment-body">
            <p className="comment-content">{comment.content}</p>
            <div className="comment-actions">
              <button
                onClick={() => setShowReplyForm(!showReplyForm)}
                className="reply-btn"
                title={showReplyForm ? 'Cancel' : 'Reply'}
              >
                {showReplyForm ? (
                  <>× Cancel</>
                ) : (
                  <>
                    <i className="far fa-comment"></i> Reply
                  </>
                )}
              </button>
              {replyCount > 0 && (
                <button
                  onClick={() => setShowReplies(!showReplies)}
                  className="toggle-replies-btn"
                  title={showReplies ? 'Hide replies' : 'Show replies'}
                >
                  {showReplies ? '▼' : '▶'} {replyCount} {replyCount === 1 ? 'reply' : 'replies'}
                </button>
              )}
              {user.id === comment.user_id && (
                <button onClick={handleDelete} className="delete-comment-btn" title="Delete">
                  × Delete
                </button>
              )}
            </div>
          </div>

          {showReplyForm && (
            <form onSubmit={handleReply} className="reply-form">
              <textarea
                value={replyContent}
                onChange={(e) => setReplyContent(e.target.value)}
                placeholder="Write a reply..."
                rows="2"
                required
              />
              {error && <div className="error-message">{error}</div>}
              <div className="form-actions">
                <button type="button" onClick={handleReply} className="submit-reply-btn">
                  Post
                </button>
              </div>
            </form>
          )}
        </div>
      </div>

      {/* Render nested replies */}
      {showReplies && comment.replies && comment.replies.length > 0 && (
        <div className="comment-replies">
          {comment.replies.map((reply) => (
            <CommentThread
              key={reply.id}
              comment={reply}
              postId={postId}
              user={user}
              token={token}
              onCommentDeleted={onCommentDeleted}
              onReplyAdded={onReplyAdded}
              level={level + 1}
              timezone={timezone}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default function PostDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user, token } = useAuth()
  const { timezone } = useTimezone()

  const [post, setPost] = useState(null)
  const [comments, setComments] = useState([])
  const [newComment, setNewComment] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [authorBadges, setAuthorBadges] = useState([])
  const isNews = !!post?.is_news
  const displayDate = post ? post.news_published_at || post.created_at : null
  const [brokenLogos, setBrokenLogos] = useState({})
  const logoUrlForTicker = (ticker) =>
    ticker ? `https://storage.googleapis.com/iex/api/logos/${ticker.toUpperCase()}.png` : null

  useEffect(() => {
    loadPost()
    loadComments()
  }, [id])

  const loadPost = async () => {
    try {
      const data = await api.getPost(id)
      if (data.error) {
        setError(data.error)
      } else {
        setPost(data)
        // Load author badges
        try {
          const badges = await api.getUserBadgesById(token, data.user_id)
          setAuthorBadges(badges)
        } catch (err) {
          console.error('Error loading author badges:', err)
        }
      }
    } catch (err) {
      setError('Failed to load post')
    } finally {
      setLoading(false)
    }
  }

  const loadComments = async () => {
    try {
      const data = await api.getComments(id)
      setComments(data)
    } catch (err) {
      console.error('Failed to load comments:', err)
    }
  }

  const handleSubmitComment = async (e) => {
    e.preventDefault()
    if (!newComment.trim()) return

    try {
      const response = await api.createComment(token, id, newComment, null)
      if (response.error) {
        setError(response.error)
      } else {
        setComments([...comments, response])
        setNewComment('')
      }
    } catch (err) {
      setError('Failed to post comment')
    }
  }

  const handlePostComment = (e) => {
    e.preventDefault()
    handleSubmitComment(e)
  }

  const handleCommentDeleted = (commentId) => {
    setComments(comments.filter((c) => c.id !== commentId && c.parent_comment_id !== commentId))
  }

  const handleReplyAdded = (newReply) => {
    setComments([...comments, newReply])
  }

  const handleDeletePost = async () => {
    if (window.confirm('Are you sure you want to delete this post?')) {
      try {
        await api.deletePost(token, id)
        navigate('/')
      } catch (err) {
        setError('Failed to delete post')
      }
    }
  }

  if (loading) {
    return <div className="loading">Loading...</div>
  }

  if (error || !post) {
    return (
      <div className="error-container">
        <h2>Error</h2>
        <p>{error || 'Post not found'}</p>
        <button onClick={() => navigate('/')}>Back to Home</button>
      </div>
    )
  }

  return (
    <div className="page-shell">
      <div className="bg-grid" />
      <div className="bg-lines" />
      <div className="bg-glow glow-1" />
      <div className="bg-glow glow-2" />
      <div className="bg-glow glow-3" />

      <div className="post-detail-container">
        <header className="header">
          <h1>AstraTrade</h1>
          <div className="header-actions">
            <TimezoneToggle />
            <button onClick={() => navigate('/')} className="back-btn">
              ← Back
            </button>
            <span>Welcome, {user.username}</span>
          </div>
        </header>

      <div className="detail-content">
        {/* Stock Information Section - only show if post has a stock ticker */}
        {post.stock_ticker && (
          <div className="stock-section">
            <div className="stock-header">
              <h2>${post.stock_ticker}</h2>
              <span className="stock-label">Stock Information</span>
            </div>
            <div className="tradingview-container">
              <TradingViewWidget symbol={post.stock_ticker} height="800" />
            </div>
          </div>
        )}

        {/* Post Content Section */}
        <div className="post-section">
          <div className="post-content-wrapper">
            <div className="post-meta-strip">
              {isNews ? (
                <span className="post-category-badge news-badge">News Drop</span>
              ) : post.stock_ticker ? (
                <span className="post-category-badge">{`$${post.stock_ticker}`}</span>
              ) : (
                <span className="chitchat-badge">Chitchat</span>
              )}
              {isNews && post.news_source && (
                <span className="news-source-chip">Source: {post.news_source}</span>
              )}
              {isNews && post.news_url && (
                <a
                  className="news-link"
                  href={post.news_url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Read full article →
                </a>
              )}
            </div>
            {isNews && (
              <>
                {post.news_image_url &&
                !post.news_image_url.includes('googleusercontent.com') &&
                !post.news_image_url.includes('news.google.com') &&
                !post.news_image_url.includes('gstatic.com') ? (
                  <div className="news-hero">
                    <img src={post.news_image_url} alt="" loading="lazy" />
                  </div>
                ) : logoUrlForTicker(post.stock_ticker) && !brokenLogos[post.stock_ticker] ? (
                  <div className="news-hero logo">
                    <img
                      src={logoUrlForTicker(post.stock_ticker)}
                      alt={`${post.stock_ticker} logo`}
                      loading="lazy"
                      onError={() =>
                        setBrokenLogos((prev) => ({ ...prev, [post.stock_ticker]: true }))
                      }
                    />
                  </div>
                ) : (
                  <div className="news-hero placeholder">
                    <div className="news-hero-initial">
                      {(post.stock_ticker || post.title || 'N').slice(0, 1)}
                    </div>
                    <div className="news-hero-meta">
                      <span>{post.news_source || 'News'}</span>
                      {post.stock_ticker && <span>${post.stock_ticker}</span>}
                    </div>
                  </div>
                )}
              </>
            )}
            <div className="post-header">
              <div className="author-info">
                <span className="author-name">{post.username}</span>
                {authorBadges.length > 0 && (
                  <div className="author-badges">
                    {authorBadges.slice(0, 3).map((badge) => {
                      const isAdmin = badge.name === 'Admin'
                      const isLevel = badge.badge_type === 'level'
                      return (
                        <span
                          key={badge.id}
                          className={`badge-mini ${isAdmin ? 'admin' : ''} ${isLevel ? 'level' : ''}`}
                          title={badge.description}
                          style={
                            !isAdmin
                              ? {
                                  borderColor: badge.color,
                                  backgroundColor: isLevel ? '#fef3c7' : '#f8fafc',
                                }
                              : {}
                          }
                        >
                          <span
                            className="badge-mini-icon"
                            style={!isAdmin ? { color: badge.color } : {}}
                          >
                            {badge.icon}
                          </span>
                          <span className="badge-mini-name">{badge.name}</span>
                        </span>
                      )
                    })}
                  </div>
                )}
              </div>
              <div className="post-timestamp">
                {displayDate && formatDate(displayDate, timezone)}
              </div>
              <h1 className="post-title">{post.title}</h1>
            </div>

            <div className="post-body">{post.content}</div>

            <div className="post-actions">
              {user.id === post.user_id && (
                <button onClick={handleDeletePost} className="delete-post-btn">
                  × Delete
                </button>
              )}
            </div>

            <form onSubmit={handleSubmitComment} className="comment-form-box">
              <textarea
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder="Write a comment..."
                rows="2"
                required
              />
              <div className="form-actions">
                <button type="submit" className="submit-comment-btn">
                  Post
                </button>
              </div>
            </form>
          </div>

          {/* Comments Section */}
          <div className="comments-section">
            <h2>Comments ({comments.length})</h2>

            <div className="comments-list">
              {comments.length === 0 ? (
                <p className="no-comments">No comments yet. Be the first to comment!</p>
              ) : (
                buildCommentTree(comments).map((comment) => (
                  <CommentThread
                    key={comment.id}
                    comment={comment}
                    postId={id}
                    user={user}
                    token={token}
                    onCommentDeleted={handleCommentDeleted}
                    onReplyAdded={handleReplyAdded}
                    timezone={timezone}
                  />
                ))
              )}
            </div>
          </div>
        </div>
      </div>
      </div>
    </div>
  )
}
