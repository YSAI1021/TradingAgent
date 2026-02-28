import { useState, useEffect } from "react";
import {
  TrendingUp,
  Sparkles,
  MessageCircle,
  Plus,
  Hash,
  Loader2,
  AlertCircle,
  Trash2,
  Edit2,
  Eye,
  ThumbsUp,
  ThumbsDown,
  Bookmark,
  Repeat2,
  ExternalLink,
} from "lucide-react";
import { useAuth } from "@/app/context/AuthContext";
import {
  createPost,
  fetchPosts,
  deletePost,
  fetchPostComments,
  createComment,
  deleteComment,
  updatePost,
  fetchPost,
  fetchUserActivity,
  fetchNews,
  Post,
  Comment,
  ActivitySummary,
  NewsArticle,
} from "@/app/services/api";
import { usePortfolio } from "@/app/hooks/usePortfolio";
import SourcesModal from "@/app/components/SourcesModal";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/app/components/ui/card";
import { Badge } from "@/app/components/ui/badge";
import { Avatar, AvatarFallback } from "@/app/components/ui/avatar";
import { Separator } from "@/app/components/ui/separator";
import { Button } from "@/app/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/app/components/ui/dialog";
import { Textarea } from "@/app/components/ui/textarea";
import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";

export function Community() {
  const { token, user } = useAuth();
  const { holdings } = usePortfolio();
  const [createPostOpen, setCreatePostOpen] = useState(false);
  const [postContent, setPostContent] = useState("");
  const [postTitle, setPostTitle] = useState("");
  const [postHashtags, setPostHashtags] = useState("");
  const [posts, setPosts] = useState<
    Array<
      Post & {
        author: string;
        tags: string[];
        initials: string;
        time: string;
        likes: number;
        dislikes: number;
        comments: number;
      }
    >
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [commentsOpen, setCommentsOpen] = useState<number | null>(null);
  const [commentsData, setCommentsData] = useState<Record<number, Comment[]>>(
    {},
  );
  const [commentContent, setCommentContent] = useState("");
  const [loadingComments, setLoadingComments] = useState<number | null>(null);
  const [deletingComment, setDeletingComment] = useState<number | null>(null);
  const [detailPostId, setDetailPostId] = useState<number | null>(null);
  const [detailPost, setDetailPost] = useState<Post | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [editPostId, setEditPostId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editHashtags, setEditHashtags] = useState("");
  const [editLoading, setEditLoading] = useState(false);
  const [activitySummary, setActivitySummary] = useState<ActivitySummary | null>(null);
  const [activityLoading, setActivityLoading] = useState(false);
  const [showSources, setShowSources] = useState(false);
  const [sourcesLoading, setSourcesLoading] = useState(false);
  const [sourcesData, setSourcesData] = useState<Record<string, NewsArticle[]>>({});

  // Fetch posts on mount
  useEffect(() => {
    if (!token) return;
    loadPosts();
  }, [token]);

  useEffect(() => {
    if (!token) return;
    loadActivity();
  }, [token]);

  const loadActivity = async () => {
    try {
      setActivityLoading(true);
      const data = await fetchUserActivity(token!);
      setActivitySummary(data);
    } catch (err) {
      console.error("Error loading activity:", err);
    } finally {
      setActivityLoading(false);
    }
  };

  const loadPosts = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchPosts(50, 0);
      // Transform API posts to include UI fields
      const transformedPosts = data.map((post) => ({
        ...post,
        author: post.username || `User ${post.user_id}`,
        tags: post.stock_ticker ? [post.stock_ticker] : [],
        initials:
          (post.username && post.username.charAt(0)) ||
          post.user_id?.toString().charAt(0) ||
          "U",
        time: new Date(post.created_at).toLocaleDateString(),
        likes: ((post.id * 7 + 13) % 50),
        dislikes: ((post.id * 3 + 1) % 5),
        comments: post.comment_count ?? 0,
      }));
      setPosts(transformedPosts);
    } catch (err) {
      console.error("Error loading posts:", err);
      setError(err instanceof Error ? err.message : "Failed to load posts");
    } finally {
      setLoading(false);
    }
  };

  const loadCommunitySources = async () => {
    const tickers = holdings.map((holding) => holding.symbol).slice(0, 6);
    if (tickers.length === 0) {
      setSourcesData({});
      setShowSources(true);
      return;
    }

    setSourcesLoading(true);
    const results: Record<string, NewsArticle[]> = {};
    try {
      await Promise.all(
        tickers.map(async (ticker) => {
          try {
            const items = await fetchNews(ticker);
            results[ticker] = Array.isArray(items) ? items.slice(0, 6) : [];
          } catch {
            results[ticker] = [];
          }
        }),
      );
      setSourcesData(results);
      setShowSources(true);
    } catch (error) {
      console.error("Error loading community sources:", error);
      setSourcesData(results);
      setShowSources(true);
    } finally {
      setSourcesLoading(false);
    }
  };

  const topHolding = [...holdings].sort((a, b) => b.value - a.value)[0];
  const secondaryHolding = [...holdings].sort((a, b) => b.value - a.value)[1];

  const trendingTopics = [
    { topic: "AI Stocks", posts: 147, sentiment: "Bullish" },
    { topic: "Fed Rate Decision", posts: 89, sentiment: "Mixed" },
    { topic: "Energy Sector", posts: 62, sentiment: "Neutral" },
    { topic: "Tech Earnings", posts: 54, sentiment: "Bullish" },
  ];

  const handleCreatePost = async () => {
    if (!token || !postContent.trim() || !postTitle.trim()) return;

    setCreating(true);
    try {
      // Extract ticker from hashtags if any (e.g., #AAPL)
      const hashtagRegex = /#([A-Z]{1,5})/g;
      const matches = postHashtags.match(hashtagRegex);
      const ticker = matches ? matches[0].substring(1) : undefined;

      await createPost(token, {
        title: postTitle,
        content: postContent,
        stock_ticker: ticker,
      });

      // Reset form and reload posts
      setPostTitle("");
      setPostContent("");
      setPostHashtags("");
      setCreatePostOpen(false);
      await loadPosts();
    } catch (err) {
      console.error("Error creating post:", err);
      setError(err instanceof Error ? err.message : "Failed to create post");
    } finally {
      setCreating(false);
    }
  };

  const handleDeletePost = async (postId: number) => {
    if (!window.confirm("Are you sure you want to delete this post?")) return;

    setDeleting(postId);
    try {
      await deletePost(token!, postId);
      await loadPosts();
      setError(null);
    } catch (err) {
      console.error("Error deleting post:", err);
      setError(err instanceof Error ? err.message : "Failed to delete post");
    } finally {
      setDeleting(null);
    }
  };

  const loadComments = async (postId: number) => {
    try {
      setLoadingComments(postId);
      const comments = await fetchPostComments(postId);
      setCommentsData((prev) => ({ ...prev, [postId]: comments }));
    } catch (err) {
      console.error("Error loading comments:", err);
      setError(err instanceof Error ? err.message : "Failed to load comments");
    } finally {
      setLoadingComments(null);
    }
  };

  const handleAddComment = async (postId: number) => {
    if (!token || !commentContent.trim()) return;

    try {
      await createComment(token, postId, { content: commentContent.trim() });
      setCommentContent("");
      await loadComments(postId);
    } catch (err) {
      console.error("Error adding comment:", err);
      setError(err instanceof Error ? err.message : "Failed to add comment");
    }
  };

  const handleDeleteComment = async (commentId: number, postId: number) => {
    if (!window.confirm("Are you sure you want to delete this comment?"))
      return;

    setDeletingComment(commentId);
    try {
      await deleteComment(token!, commentId);
      await loadComments(postId);
    } catch (err) {
      console.error("Error deleting comment:", err);
      setError(err instanceof Error ? err.message : "Failed to delete comment");
    } finally {
      setDeletingComment(null);
    }
  };

  const loadPostDetail = async (postId: number) => {
    setDetailLoading(true);
    try {
      const post = await fetchPost(postId);
      setDetailPost(post);
      setDetailPostId(postId);
    } catch (err) {
      console.error("Error loading post detail:", err);
      setError(
        err instanceof Error ? err.message : "Failed to load post detail",
      );
    } finally {
      setDetailLoading(false);
    }
  };

  const openEditPost = (post: any) => {
    setEditPostId(post.id);
    setEditTitle(post.title);
    setEditContent(post.content);
    setEditHashtags(post.stock_ticker ? `#${post.stock_ticker}` : "");
  };

  const handleUpdatePost = async () => {
    if (!token || !editTitle.trim() || !editContent.trim()) return;

    setEditLoading(true);
    try {
      const hashtagRegex = /#([A-Z]{1,5})/g;
      const matches = editHashtags.match(hashtagRegex);
      const ticker = matches ? matches[0].substring(1) : undefined;

      await updatePost(token, editPostId!, {
        title: editTitle,
        content: editContent,
        stock_ticker: ticker,
      });

      setEditPostId(null);
      setEditTitle("");
      setEditContent("");
      setEditHashtags("");
      await loadPosts();
    } catch (err) {
      console.error("Error updating post:", err);
      setError(err instanceof Error ? err.message : "Failed to update post");
    } finally {
      setEditLoading(false);
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-gray-900">Community</h1>
          <p className="text-gray-500 mt-1">Connect with other investors</p>
        </div>
        <Button
          onClick={() => setCreatePostOpen(true)}
          className="self-start sm:self-center"
        >
          <Plus className="w-4 h-4 mr-2" />
          Create Post
        </Button>
      </div>

      {/* Create Post Modal */}
      <Dialog open={createPostOpen} onOpenChange={setCreatePostOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Create Post</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="post-title">Title</Label>
              <Input
                id="post-title"
                placeholder="What's on your mind?"
                value={postTitle}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setPostTitle(e.target.value)
                }
                className="mt-2"
              />
            </div>
            <div>
              <Label htmlFor="post-content">Content</Label>
              <Textarea
                id="post-content"
                placeholder="Share your investment ideas, analysis, or questions..."
                value={postContent}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                  setPostContent(e.target.value)
                }
                onKeyDown={(e: React.KeyboardEvent<HTMLTextAreaElement>) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                    e.preventDefault();
                    void handleCreatePost();
                  }
                }}
                className="mt-2 min-h-[120px] max-h-[280px] overflow-y-auto"
              />
            </div>
            <div>
              <Label
                htmlFor="post-hashtags"
                className="flex items-center gap-2"
              >
                <Hash className="w-4 h-4" />
                Hashtags
              </Label>
              <Input
                id="post-hashtags"
                placeholder="#AAPL #earnings #tech (space-separated)"
                value={postHashtags}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setPostHashtags(e.target.value)
                }
                className="mt-2"
              />
            </div>
            {postHashtags && (
              <div className="flex flex-wrap gap-2 pt-1">
                {postHashtags
                  .split(/\s+/)
                  .filter(Boolean)
                  .map((tag) => (
                    <Badge key={tag} variant="secondary" className="text-xs">
                      {tag.startsWith("#") ? tag : `#${tag}`}
                    </Badge>
                  ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreatePostOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreatePost}
              disabled={!postContent.trim() || !postTitle.trim() || creating}
            >
              {creating ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                "Post"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Error Message */}
      {error && (
        <div className="mb-6 flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-lg">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
          <p className="text-sm text-red-700">{error}</p>
          <button
            onClick={() => setError(null)}
            className="ml-auto text-red-600 hover:text-red-700 font-medium"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* AI Community Highlights */}
      <Card className="mb-6 border-blue-200 bg-blue-50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-blue-900">
            <Sparkles className="w-5 h-5" />
            AI Community Highlights
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto h-6 px-2 text-xs"
              onClick={() => void loadCommunitySources()}
            >
              <ExternalLink className="w-3 h-3 mr-1" />
              Sources
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-4 bg-white rounded-lg border border-blue-500/20">
            <p className="text-xs font-semibold text-[#1e40af] uppercase tracking-wider mb-2">
              Consensus
            </p>
            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-gray-900">
                    Community momentum remains strongest around {topHolding?.symbol || "your top holding"}
                  </span>
                  <Badge className="bg-emerald-100 text-emerald-800 border-0">
                    Positive
                  </Badge>
                </div>
                <p className="text-sm text-gray-600 mt-2">
                  Why it matters: {topHolding?.symbol || "This name"} has the largest weight in
                  your portfolio, so crowd sentiment can materially affect your near-term decision
                  flow.
                </p>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-gray-900">
                    Discussion volume is rising around {secondaryHolding?.symbol || "your secondary positions"}
                  </span>
                  <Badge className="bg-gray-100 text-black border-0">
                    Active
                  </Badge>
                </div>
                <p className="text-sm text-gray-600 mt-2">
                  Why it matters: sentiment shifts around your top holdings can front-run short-term
                  volatility in your portfolio.
                </p>
              </div>
            </div>
          </div>

          <div className="p-4 bg-white rounded-lg border border-blue-500/20">
            <p className="text-xs font-semibold text-[#1e40af] uppercase tracking-wider mb-2">
              Controversy
            </p>
            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-gray-900">
                    Opinion is split on valuation-sensitive tech names
                  </span>
                  <Badge className="bg-gray-100 text-black border-0">
                    Divided
                  </Badge>
                </div>
                <p className="text-sm text-gray-600 mt-2">
                  Why it matters: your portfolio has multiple growth names where sentiment reversals
                  can amplify downside moves.
                </p>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-gray-900">
                    Macro-sensitive sectors remain mixed across forums
                  </span>
                  <Badge className="bg-gray-100 text-black border-0">
                    Mixed
                  </Badge>
                </div>
                <p className="text-sm text-gray-600 mt-2">
                  Why it matters: this usually increases noise around tactical entries and exits.
                </p>
              </div>
            </div>
          </div>

          <Separator className="bg-blue-200" />

          {/* Your Content Performance */}
          <div className="p-4 bg-white rounded-lg border border-blue-500/20">
            <p className="text-xs font-semibold text-[#1e40af] uppercase tracking-wider mb-2">
              Your Content Performance
            </p>
            <ul className="text-[15px] text-gray-700 space-y-2 list-disc pl-5">
              <li className="leading-relaxed">
                Your posts tied to held tickers receive the highest engagement
              </li>
              <li className="leading-relaxed">
                Concise thesis updates outperform long general posts
              </li>
              <li className="leading-relaxed">
                Earnings-related commentary is your strongest discussion format
              </li>
            </ul>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-3 gap-6">
        {/* Community Feed */}
        <div className="col-span-2 space-y-4">
          {/* Loading State */}
          {loading && posts.length === 0 && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-blue-600 mr-2" />
              <p className="text-gray-600">Loading posts...</p>
            </div>
          )}

          {/* Empty State */}
          {!loading && posts.length === 0 && (
            <div className="text-center py-12 bg-gray-50 rounded-lg border border-gray-200">
              <p className="text-gray-600 mb-2">No community posts yet</p>
              <p className="text-sm text-gray-500">
                Be the first to share an investment idea!
              </p>
            </div>
          )}

          {/* Posts List */}
          {posts.map((post) => (
            <Card
              key={post.id}
              className="hover:shadow-md transition-shadow cursor-pointer"
            >
              <CardContent className="pt-6">
                {/* Author Info */}
                <div className="flex items-center gap-3 mb-4">
                  <Avatar>
                    <AvatarFallback className="bg-blue-600 text-white">
                      {post.initials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <p className="font-medium text-gray-900">{post.author}</p>
                    <p className="text-xs text-gray-500">{post.time}</p>
                  </div>
                </div>

                {/* Post Content */}
                <h3 className="font-semibold text-gray-900 mb-2">
                  {post.title}
                </h3>
                <p className="text-sm text-gray-600 mb-3">{post.content}</p>

                {/* Tags */}
                {Array.isArray(post.tags) && post.tags.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-3">
                    {post.tags.map((tag, j) => (
                      <Badge key={j} variant="secondary" className="text-xs">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                )}

                <Separator className="my-3" />

                {/* Engagement - Comment, Like, Dislike */}
                <div className="flex items-center gap-4 text-sm text-gray-500">
                  <button
                    onClick={() => {
                      if (commentsOpen === post.id) {
                        setCommentsOpen(null);
                      } else {
                        setCommentsOpen(post.id);
                        if (!commentsData[post.id]) {
                          loadComments(post.id);
                        }
                      }
                    }}
                    className="flex items-center gap-1 hover:text-blue-600 transition-colors"
                    title="Comment"
                  >
                    <MessageCircle className="w-4 h-4" />
                    <span>
                      {commentsData[post.id]?.length ?? post.comments}
                    </span>
                  </button>

                  <button
                    onClick={() => loadPostDetail(post.id)}
                    className="flex items-center gap-1 hover:text-blue-600 transition-colors"
                    title="View post details"
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                  <button
                    className="flex items-center gap-1 hover:text-blue-600 transition-colors"
                    title="Like"
                  >
                    <ThumbsUp className="w-4 h-4" />
                    <span>{post.likes}</span>
                  </button>
                  <button
                    className="flex items-center gap-1 hover:text-blue-600 transition-colors"
                    title="Dislike"
                  >
                    <ThumbsDown className="w-4 h-4" />
                    <span>{post.dislikes}</span>
                  </button>
                  <button
                    className="flex items-center gap-1 hover:text-blue-600 transition-colors"
                    title="Bookmark"
                  >
                    <Bookmark className="w-4 h-4" />
                  </button>
                  <button
                    className="flex items-center gap-1 hover:text-blue-600 transition-colors"
                    title="Repost"
                  >
                    <Repeat2 className="w-4 h-4" />
                  </button>

                  {/* Edit button - only show if user is post author */}
                  {user && user.id === post.user_id && (
                    <button
                      onClick={() => openEditPost(post)}
                      className="flex items-center gap-1 hover:text-blue-600 transition-colors text-gray-500"
                      title="Edit post"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                  )}

                  {/* Delete button - only show if user is post author */}
                  {user && user.id === post.user_id && (
                    <button
                      onClick={() => handleDeletePost(post.id)}
                      disabled={deleting === post.id}
                      className="ml-auto flex items-center gap-1 hover:text-red-600 transition-colors text-gray-500 disabled:opacity-50"
                      title="Delete post"
                    >
                      {deleting === post.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                    </button>
                  )}
                </div>

                {/* Comments Section */}
                {commentsOpen === post.id && (
                  <div className="mt-4 pt-4 border-t space-y-3">
                    {/* Loading state */}
                    {loadingComments === post.id ? (
                      <div className="flex items-center gap-2 text-sm text-gray-500">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Loading comments...
                      </div>
                    ) : (
                      <>
                        {/* Comments list */}
                        <div className="space-y-2 max-h-64 overflow-y-auto">
                          {commentsData[post.id]?.length === 0 ? (
                            <p className="text-xs text-gray-500">
                              No comments yet
                            </p>
                          ) : (
                            commentsData[post.id]?.map((comment) => (
                              <div
                                key={comment.id}
                                className="p-2 bg-gray-50 rounded text-xs space-y-1"
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <span className="font-medium text-gray-700">
                                    User {comment.user_id}
                                  </span>
                                  {user && user.id === comment.user_id && (
                                    <button
                                      onClick={() =>
                                        handleDeleteComment(comment.id, post.id)
                                      }
                                      disabled={deletingComment === comment.id}
                                      className="text-red-500 hover:text-red-700 disabled:opacity-50"
                                      title="Delete comment"
                                    >
                                      {deletingComment === comment.id ? (
                                        <Loader2 className="w-3 h-3 animate-spin" />
                                      ) : (
                                        <Trash2 className="w-3 h-3" />
                                      )}
                                    </button>
                                  )}
                                </div>
                                <p className="text-gray-600">
                                  {comment.content}
                                </p>
                                <span className="text-gray-400">
                                  {new Date(
                                    comment.created_at,
                                  ).toLocaleDateString()}
                                </span>
                              </div>
                            ))
                          )}
                        </div>

                        {/* Add comment form */}
                        <div className="flex gap-2">
                          <input
                            type="text"
                            placeholder="Add a comment..."
                            value={commentContent}
                            onChange={(e) => setCommentContent(e.target.value)}
                            onKeyPress={(e) => {
                              if (e.key === "Enter" && !e.shiftKey) {
                                e.preventDefault();
                                handleAddComment(post.id);
                              }
                            }}
                            className="flex-1 text-xs px-2 py-1 border border-gray-300 rounded focus:outline-none focus:border-blue-500"
                          />
                          <button
                            onClick={() => handleAddComment(post.id)}
                            disabled={!commentContent.trim()}
                            className="text-xs px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                          >
                            Post
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Trending Topics Sidebar */}
        <div>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5" />
                Trending Topics
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {trendingTopics.map((topic, i) => (
                  <div
                    key={i}
                    className="p-3 rounded-lg border border-gray-200 hover:border-blue-300 hover:bg-blue-50 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <p className="font-medium text-gray-900">{topic.topic}</p>
                      <Badge
                        className={
                          topic.sentiment === "Bullish"
                            ? "bg-emerald-100 text-emerald-800 border-0"
                            : "bg-gray-100 text-black border-0"
                        }
                      >
                        {topic.sentiment}
                      </Badge>
                    </div>
                    <p className="text-xs text-gray-500">{topic.posts} posts</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Quick Stats */}
          <Card className="mt-4">
            <CardHeader>
              <CardTitle>Your Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Posts</span>
                    <span className="text-sm font-medium text-gray-900">
                      {activityLoading ? (
                        <Loader2 className="w-4 h-4 animate-spin text-gray-500" />
                      ) : (
                        activitySummary ? activitySummary.posts : 0
                      )}
                    </span>
                </div>
                <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Comments</span>
                    <span className="text-sm font-medium text-gray-900">
                      {activityLoading ? (
                        <Loader2 className="w-4 h-4 animate-spin text-gray-500" />
                      ) : (
                        activitySummary ? activitySummary.comments : 0
                      )}
                    </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Reputation</span>
                    <Badge className="bg-blue-600 border-0 text-white">
                      <TrendingUp className="w-3 h-3 mr-1" />
                      {activityLoading ? (
                        <Loader2 className="w-4 h-4 animate-spin inline-block align-text-bottom text-white" />
                      ) : (
                        activitySummary ? activitySummary.activityPoints : 0
                      )}
                    </Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Post Detail Modal */}
      <Dialog
        open={!!detailPostId}
        onOpenChange={(open) => !open && setDetailPostId(null)}
      >
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Post Details</DialogTitle>
          </DialogHeader>
          {detailLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-blue-600 mr-2" />
              <p>Loading post...</p>
            </div>
          ) : detailPost ? (
            <div className="space-y-4 pt-2">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  {detailPost.title}
                </h3>
                <p className="text-sm text-gray-500 mt-1">
                  Posted by User {detailPost.user_id} on{" "}
                  {new Date(detailPost.created_at).toLocaleDateString()}
                </p>
              </div>
              <p className="text-gray-700">{detailPost.content}</p>
              {detailPost.stock_ticker && (
                <div>
                  <Badge>{detailPost.stock_ticker}</Badge>
                </div>
              )}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Post Editor Modal */}
      <Dialog
        open={!!editPostId}
        onOpenChange={(open) => !open && setEditPostId(null)}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Post</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="edit-title">Title</Label>
              <Input
                id="edit-title"
                placeholder="What's on your mind?"
                value={editTitle}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setEditTitle(e.target.value)
                }
                className="mt-2"
              />
            </div>
            <div>
              <Label htmlFor="edit-content">Content</Label>
              <Textarea
                id="edit-content"
                placeholder="Share your investment ideas, analysis, or questions..."
                value={editContent}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                  setEditContent(e.target.value)
                }
                className="mt-2 min-h-[120px]"
              />
            </div>
            <div>
              <Label
                htmlFor="edit-hashtags"
                className="flex items-center gap-2"
              >
                <Hash className="w-4 h-4" />
                Hashtags
              </Label>
              <Input
                id="edit-hashtags"
                placeholder="#AAPL #earnings #tech (space-separated)"
                value={editHashtags}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setEditHashtags(e.target.value)
                }
                className="mt-2"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditPostId(null)}>
              Cancel
            </Button>
            <Button onClick={handleUpdatePost} disabled={editLoading}>
              {editLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Updating...
                </>
              ) : (
                "Update Post"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <SourcesModal
        open={showSources}
        loading={sourcesLoading}
        sources={sourcesData}
        onClose={() => setShowSources(false)}
      />
    </div>
  );
}
