import { useState, useEffect, useMemo } from "react";
import {
  TrendingUp,
  Sparkles,
  MessageCircle,
  ExternalLink,
  Plus,
  Hash,
  Loader2,
  AlertCircle,
  Trash2,
  Edit2,
  Eye,
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
  fetchAllowedTags,
  fetchTrendingTopics,
  Post,
  Comment,
  ActivitySummary,
} from "@/app/services/api";
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
  const [createPostOpen, setCreatePostOpen] = useState(false);
  const [postContent, setPostContent] = useState("");
  const [postTitle, setPostTitle] = useState("");
  const [postHashtags, setPostHashtags] = useState<string[]>([]);
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
  const [editHashtags, setEditHashtags] = useState<string[]>([]);

  const [allowedHashtags, setAllowedHashtags] = useState<string[]>([]);
  const [tagSearch, setTagSearch] = useState("");
  const [editLoading, setEditLoading] = useState(false);
  const [activitySummary, setActivitySummary] =
    useState<ActivitySummary | null>(null);
  const [activityLoading, setActivityLoading] = useState(false);

  // Fetch posts on mount
  useEffect(() => {
    if (!token) return;
    loadPosts();
  }, [token]);

  // Load allowed tags from backend
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const tags = await fetchAllowedTags();
        if (cancelled) return;
        setAllowedHashtags(tags || []);
      } catch (err) {
        console.warn("Failed to load allowed tags", err);
        setAllowedHashtags([]);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!token) return;
    loadActivity();
  }, [token]);

  // Listen for global updates from other parts of the app (posts/comments created elsewhere)
  useEffect(() => {
    if (!token) return;

    const onCommunityUpdated = (e: Event) => {
      try {
        const ev = e as CustomEvent<any>;
        // Always reload the post list and activity summary
        loadPosts();
        loadActivity();

        // If a comment was created on an open post, refresh its comments
        const detail = ev?.detail;
        if (detail?.type?.includes("comment") && detail?.postId) {
          if (commentsOpen === detail.postId) {
            loadComments(detail.postId);
          }
        }
      } catch (err) {
        console.warn("community-updated handler error", err);
      }
    };

    window.addEventListener(
      "community-updated",
      onCommunityUpdated as EventListener,
    );
    return () =>
      window.removeEventListener(
        "community-updated",
        onCommunityUpdated as EventListener,
      );
  }, [token, commentsOpen]);

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
        likes: Math.floor(Math.random() * 50),
        dislikes: Math.floor(Math.random() * 5),
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

  const [trendingTopics, setTrendingTopics] = useState<
    Array<{ topic: string; posts: number; sentiment?: string }>
  >([]);

  // Load trending topics from backend (top 4 stock tickers by post count)
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const t = await fetchTrendingTopics();
        if (cancelled) return;
        if (Array.isArray(t) && t.length > 0) {
          setTrendingTopics(t);
        } else {
          setTrendingTopics([
            { topic: "AI Stocks", posts: 0, sentiment: "Bullish" },
            { topic: "Market News", posts: 0, sentiment: "Mixed" },
            { topic: "Energy Sector", posts: 0 },
            { topic: "Tech Earnings", posts: 0, sentiment: "Bullish" },
          ]);
        }
      } catch (err) {
        console.warn("Failed to load trending topics", err);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const displayedTags = useMemo(() => {
    const q = tagSearch.trim().toLowerCase();
    if (q) return allowedHashtags.filter((t) => t.toLowerCase().includes(q));

    // Prefer trendingTopics mapped to hashtag format if available
    if (Array.isArray(trendingTopics) && trendingTopics.length > 0) {
      const mapped = trendingTopics
        .map((tt) => {
          const match = allowedHashtags.find(
            (a) => a.replace(/^#/, "").toLowerCase() === tt.topic.toLowerCase(),
          );
          return match || `#${tt.topic}`;
        })
        .filter(Boolean);
      // ensure uniqueness and limit to 4
      return Array.from(new Set(mapped)).slice(0, 4);
    }

    return allowedHashtags.slice(0, 4);
  }, [allowedHashtags, tagSearch, trendingTopics]);

  // News and posts display controls
  const [newsExpanded, setNewsExpanded] = useState(false);
  const [postsExpanded, setPostsExpanded] = useState(false);

  const newsPosts = useMemo(() => posts.filter((p) => p.is_news), [posts]);
  const otherPosts = useMemo(() => posts.filter((p) => !p.is_news), [posts]);

  const handleCreatePost = async () => {
    if (!token || !postContent.trim() || !postTitle.trim()) return;

    setCreating(true);
    try {
      // Extract ticker from selected hashtags if any (e.g., #AAPL)
      const tickerTag = postHashtags.find((t) => /^#[A-Z]{1,5}$/.test(t));
      const ticker = tickerTag ? tickerTag.substring(1) : undefined;

      await createPost(token, {
        title: postTitle,
        content: postContent,
        stock_ticker: ticker,
      });

      // Reset form and reload posts
      setPostTitle("");
      setPostContent("");
      setPostHashtags([]);
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
    setEditHashtags(post.stock_ticker ? [`#${post.stock_ticker}`] : []);
  };

  const handleUpdatePost = async () => {
    if (!token || !editTitle.trim() || !editContent.trim()) return;

    setEditLoading(true);
    try {
      const tickerTag = editHashtags.find((t) => /^#[A-Z]{1,5}$/.test(t));
      const ticker = tickerTag ? tickerTag.substring(1) : undefined;

      await updatePost(token, editPostId!, {
        title: editTitle,
        content: editContent,
        stock_ticker: ticker,
      });

      setEditPostId(null);
      setEditTitle("");
      setEditContent("");
      setEditHashtags([]);
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
                className="mt-2 min-h-[120px]"
              />
            </div>
            <div>
              <Label className="flex items-center gap-2">
                <Hash className="w-4 h-4" />
                Hashtags (pick from list)
              </Label>
              <div className="mt-2">
                <Input
                  placeholder="Search tags"
                  value={tagSearch}
                  onChange={(e) => setTagSearch(e.target.value)}
                  className="mb-2"
                />
                <div className="flex flex-wrap gap-2">
                  {displayedTags.map((tag) => {
                    const selected = postHashtags.includes(tag);
                    return (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => {
                          setPostHashtags((prev) =>
                            prev.includes(tag)
                              ? prev.filter((tt) => tt !== tag)
                              : [...prev, tag],
                          );
                        }}
                        className={`px-2 py-1 rounded text-xs border ${
                          selected
                            ? "bg-blue-600 text-white border-blue-600"
                            : "bg-white text-gray-700 border-gray-200"
                        }`}
                      >
                        {tag}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
            {postContent && (
              <div className="p-3 bg-gray-50 rounded-lg border">
                <p className="text-xs font-medium text-gray-500 mb-2">
                  Preview
                </p>
                <p className="text-sm text-gray-700">{postContent}</p>
                {postHashtags && postHashtags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {postHashtags.map((tag) => (
                      <Badge key={tag} variant="secondary" className="text-xs">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                )}
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
            >
              <ExternalLink className="w-3 h-3 mr-1" />
              Sources
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Consensus Section - neutral background */}
          <div className="p-4 bg-white rounded-lg border border-blue-500/20">
            <p className="text-xs font-semibold text-[#1e40af] uppercase tracking-wider mb-2">
              Consensus
            </p>
            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-gray-900">
                    85% of community bullish on NVDA earnings
                  </span>
                  <Badge className="bg-emerald-100 text-emerald-800 border-0">
                    Strong agree
                  </Badge>
                </div>
                <p className="text-sm text-gray-600 mt-2">
                  <span className="font-normal">Why it matters to you:</span>{" "}
                  You hold 15% of portfolio in NVDA — community optimism aligns
                  with your position.
                </p>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-gray-900">
                    78% bullish on tech sector outlook
                  </span>
                  <Badge className="bg-emerald-100 text-emerald-800 border-0">
                    Agree
                  </Badge>
                </div>
                <p className="text-sm text-gray-600 mt-2">
                  <span className="font-normal">Why it matters to you:</span>{" "}
                  Your tech holdings represent 65% of portfolio — strong tech
                  sentiment is favorable.
                </p>
              </div>
            </div>
          </div>

          {/* Controversy Section - neutral background */}
          <div className="p-4 bg-white rounded-lg border border-blue-500/20">
            <p className="text-xs font-semibold text-[#1e40af] uppercase tracking-wider mb-2">
              Controversy
            </p>
            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-gray-900">
                    Community split 50/50 on TSLA valuation
                  </span>
                  <Badge className="bg-gray-100 text-black border-0">
                    Divided
                  </Badge>
                </div>
                <p className="text-sm text-gray-600 mt-2">
                  <span className="font-normal">Why it matters to you:</span>{" "}
                  You recently bought TSLA — consider reviewing due to mixed
                  sentiment.
                </p>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-gray-900">
                    Energy sector showing controversy (45% bullish / 55%
                    bearish)
                  </span>
                  <Badge className="bg-gray-100 text-black border-0">
                    Mixed
                  </Badge>
                </div>
                <p className="text-sm text-gray-600 mt-2">
                  <span className="font-normal">Why it matters to you:</span>{" "}
                  Energy sector divided — watch your XOM position closely.
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
                Your posts about dividend strategies received the most
                engagement (avg 45 likes)
              </li>
              <li className="leading-relaxed">
                Your technical analysis posts are trending — 3x more views than
                average
              </li>
              <li className="leading-relaxed">
                Community finds your earnings commentary most valuable
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

          {/* News posts (company/news feed) */}
          {newsPosts.length > 0 && (
            <Card className="mb-4">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5" />
                  Company News
                  <Badge className="ml-auto bg-gray-100 text-gray-800">{newsPosts.length} items</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {(newsExpanded ? newsPosts : newsPosts.slice(0, 4)).map((post) => (
                    <a
                      key={post.id}
                      href={post.news_url || '#'}
                      target="_blank"
                      rel="noreferrer"
                      className="block p-3 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium text-gray-900">{post.title}</p>
                          <p className="text-xs text-gray-500">{post.news_source || ''} • {post.news_published_at ? new Date(post.news_published_at).toLocaleString() : ''}</p>
                        </div>
                      </div>
                    </a>
                  ))}

                  {newsPosts.length > 4 && (
                    <div className="pt-2">
                      <Button
                        variant="default"
                        className="border-gray-300 text-gray-900 hover:bg-gray-50"
                        onClick={() => setNewsExpanded((v) => !v)}
                      >
                        {newsExpanded ? "Show less" : `Display more (${newsPosts.length - 4})`}
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Posts List */}
          {(() => {
            const visible = postsExpanded ? otherPosts : otherPosts.slice(0, 3);
            return (
              <>
                {visible.map((post) => (
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

                {otherPosts.length > 3 && (
                  <div className="flex justify-center pt-4">
                    <Button
                      variant="default"
                      className="border-gray-300 text-gray-900 hover:bg-gray-50"
                      onClick={() => setPostsExpanded((v) => !v)}
                    >
                      {postsExpanded ? "Show less" : `Display more (${otherPosts.length - 3})`}
                    </Button>
                  </div>
                )}
              </>
            );
          })()}
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
                    ) : activitySummary ? (
                      activitySummary.posts
                    ) : (
                      0
                    )}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Comments</span>
                  <span className="text-sm font-medium text-gray-900">
                    {activityLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin text-gray-500" />
                    ) : activitySummary ? (
                      activitySummary.comments
                    ) : (
                      0
                    )}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Reputation</span>
                  <Badge className="bg-blue-600 border-0 text-white">
                    <TrendingUp className="w-3 h-3 mr-1" />
                    {activityLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin inline-block align-text-bottom text-white" />
                    ) : activitySummary ? (
                      activitySummary.activityPoints
                    ) : (
                      0
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
              <Label className="flex items-center gap-2">
                <Hash className="w-4 h-4" />
                Hashtags (pick from list)
              </Label>
              <div className="mt-2">
                <Input
                  placeholder="Search tags"
                  value={tagSearch}
                  onChange={(e) => setTagSearch(e.target.value)}
                  className="mb-2"
                />
                <div className="flex flex-wrap gap-2">
                  {displayedTags.map((tag) => {
                    const selected = editHashtags.includes(tag);
                    return (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => {
                          setEditHashtags((prev) =>
                            prev.includes(tag)
                              ? prev.filter((tt) => tt !== tag)
                              : [...prev, tag],
                          );
                        }}
                        className={`px-2 py-1 rounded text-xs border ${
                          selected
                            ? "bg-blue-600 text-white border-blue-600"
                            : "bg-white text-gray-700 border-gray-200"
                        }`}
                      >
                        {tag}
                      </button>
                    );
                  })}
                </div>
              </div>
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
    </div>
  );
}
