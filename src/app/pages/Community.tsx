import { useState } from "react";
import { TrendingUp, Sparkles, ThumbsUp, ThumbsDown, MessageCircle, Bookmark, Share2, ExternalLink, Plus, Hash } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/app/components/ui/card";
import { Badge } from "@/app/components/ui/badge";
import { Avatar, AvatarFallback } from "@/app/components/ui/avatar";
import { Separator } from "@/app/components/ui/separator";
import { Button } from "@/app/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/app/components/ui/dialog";
import { Textarea } from "@/app/components/ui/textarea";
import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";

export function Community() {
  const [createPostOpen, setCreatePostOpen] = useState(false);
  const [postContent, setPostContent] = useState("");
  const [postTitle, setPostTitle] = useState("");
  const [postHashtags, setPostHashtags] = useState("");
  const posts = [
    {
      author: "Sarah Chen",
      initials: "SC",
      time: "2 hours ago",
      title: "NVDA earnings play - what's your take?",
      content: "Looking at NVDA ahead of earnings. Strong AI demand but valuation is stretched. Anyone else considering this?",
      likes: 24,
      dislikes: 2,
      comments: 12,
      tags: ["NVDA", "Earnings", "Tech"],
    },
    {
      author: "Michael Torres",
      initials: "MT",
      time: "4 hours ago",
      title: "Diversification strategy for tech-heavy portfolio",
      content: "My portfolio is 70% tech. Planning to add healthcare and utilities for balance. Thoughts on TGT and DUK?",
      likes: 18,
      dislikes: 1,
      comments: 8,
      tags: ["Diversification", "Healthcare", "Utilities"],
    },
    {
      author: "Emily Wang",
      initials: "EW",
      time: "6 hours ago",
      title: "Fed rate decision impact discussion",
      content: "With the Fed meeting tomorrow, how are you positioning your portfolio? I'm hedging with some defensive plays.",
      likes: 31,
      dislikes: 3,
      comments: 15,
      tags: ["Fed", "Macro", "Strategy"],
    },
  ];
  
  const trendingTopics = [
    { topic: "AI Stocks", posts: 147, sentiment: "Bullish" },
    { topic: "Fed Rate Decision", posts: 89, sentiment: "Mixed" },
    { topic: "Energy Sector", posts: 62, sentiment: "Neutral" },
    { topic: "Tech Earnings", posts: 54, sentiment: "Bullish" },
  ];
  
  const handleCreatePost = () => {
    // In production: submit to API
    setCreatePostOpen(false);
    setPostContent("");
    setPostTitle("");
    setPostHashtags("");
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
                onChange={(e) => setPostTitle(e.target.value)}
                className="mt-2"
              />
            </div>
            <div>
              <Label htmlFor="post-content">Content</Label>
              <Textarea
                id="post-content"
                placeholder="Share your investment ideas, analysis, or questions..."
                value={postContent}
                onChange={(e) => setPostContent(e.target.value)}
                className="mt-2 min-h-[120px]"
              />
            </div>
            <div>
              <Label htmlFor="post-hashtags" className="flex items-center gap-2">
                <Hash className="w-4 h-4" />
                Hashtags
              </Label>
              <Input
                id="post-hashtags"
                placeholder="#AAPL #earnings #tech (space-separated)"
                value={postHashtags}
                onChange={(e) => setPostHashtags(e.target.value)}
                className="mt-2"
              />
            </div>
            {postContent && (
              <div className="p-3 bg-gray-50 rounded-lg border">
                <p className="text-xs font-medium text-gray-500 mb-2">Preview</p>
                <p className="text-sm text-gray-700">{postContent}</p>
                {postHashtags && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {postHashtags.split(/\s+/).filter(Boolean).map((tag) => (
                      <Badge key={tag} variant="secondary" className="text-xs">
                        {tag.startsWith("#") ? tag : `#${tag}`}
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
            <Button onClick={handleCreatePost} disabled={!postContent.trim()}>
              Post
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
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
            <p className="text-xs font-semibold text-[#1e40af] uppercase tracking-wider mb-2">Consensus</p>
            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-gray-900">85% of community bullish on NVDA earnings</span>
                  <Badge className="bg-emerald-100 text-emerald-800 border-0">Strong agree</Badge>
                </div>
                <p className="text-sm text-gray-600 mt-2">
                  <span className="font-normal">Why it matters to you:</span> You hold 15% of portfolio in NVDA — community optimism aligns with your position.
                </p>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-gray-900">78% bullish on tech sector outlook</span>
                  <Badge className="bg-emerald-100 text-emerald-800 border-0">Agree</Badge>
                </div>
                <p className="text-sm text-gray-600 mt-2">
                  <span className="font-normal">Why it matters to you:</span> Your tech holdings represent 65% of portfolio — strong tech sentiment is favorable.
                </p>
              </div>
            </div>
          </div>

          {/* Controversy Section - neutral background */}
          <div className="p-4 bg-white rounded-lg border border-blue-500/20">
            <p className="text-xs font-semibold text-[#1e40af] uppercase tracking-wider mb-2">Controversy</p>
            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-gray-900">Community split 50/50 on TSLA valuation</span>
                  <Badge className="bg-gray-100 text-black border-0">Divided</Badge>
                </div>
                <p className="text-sm text-gray-600 mt-2">
                  <span className="font-normal">Why it matters to you:</span> You recently bought TSLA — consider reviewing due to mixed sentiment.
                </p>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-gray-900">Energy sector showing controversy (45% bullish / 55% bearish)</span>
                  <Badge className="bg-gray-100 text-black border-0">Mixed</Badge>
                </div>
                <p className="text-sm text-gray-600 mt-2">
                  <span className="font-normal">Why it matters to you:</span> Energy sector divided — watch your XOM position closely.
                </p>
              </div>
            </div>
          </div>
            
          <Separator className="bg-blue-200" />
            
          {/* Your Content Performance */}
          <div className="p-4 bg-white rounded-lg border border-blue-500/20">
            <p className="text-xs font-semibold text-[#1e40af] uppercase tracking-wider mb-2">Your Content Performance</p>
            <ul className="text-[15px] text-gray-700 space-y-2 list-disc pl-5">
              <li className="leading-relaxed">Your posts about dividend strategies received the most engagement (avg 45 likes)</li>
              <li className="leading-relaxed">Your technical analysis posts are trending — 3x more views than average</li>
              <li className="leading-relaxed">Community finds your earnings commentary most valuable</li>
            </ul>
          </div>
        </CardContent>
      </Card>
      
      <div className="grid grid-cols-3 gap-6">
        {/* Community Feed */}
        <div className="col-span-2 space-y-4">
          {posts.map((post, i) => (
            <Card key={i} className="hover:shadow-md transition-shadow cursor-pointer">
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
                <h3 className="font-semibold text-gray-900 mb-2">{post.title}</h3>
                <p className="text-sm text-gray-600 mb-3">{post.content}</p>
                
                {/* Tags */}
                <div className="flex flex-wrap gap-2 mb-3">
                  {post.tags.map((tag, j) => (
                    <Badge key={j} variant="secondary" className="text-xs">
                      {tag}
                    </Badge>
                  ))}
                </div>
                
                <Separator className="my-3" />
                
                {/* Engagement - Comment, Like, Dislike, Bookmark, Share */}
                <div className="flex items-center gap-4 text-sm text-gray-500">
                  <button className="flex items-center gap-1 hover:text-blue-600 transition-colors" title="Comment">
                    <MessageCircle className="w-4 h-4" />
                    <span>{post.comments}</span>
                  </button>
                  <button className="flex items-center gap-1 hover:text-blue-600 transition-colors" title="Like">
                    <ThumbsUp className="w-4 h-4" />
                    <span>{post.likes}</span>
                  </button>
                  <button className="flex items-center gap-1 hover:text-gray-700 transition-colors" title="Dislike">
                    <ThumbsDown className="w-4 h-4" />
                    <span>{post.dislikes}</span>
                  </button>
                  <button className="flex items-center gap-1 hover:text-blue-600 transition-colors" title="Bookmark">
                    <Bookmark className="w-4 h-4" />
                  </button>
                  <button className="flex items-center gap-1 hover:text-blue-600 transition-colors" title="Share">
                    <Share2 className="w-4 h-4" />
                  </button>
                </div>
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
                  <div key={i} className="p-3 rounded-lg border border-gray-200 hover:border-blue-300 hover:bg-blue-50 transition-colors cursor-pointer">
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
                  <span className="text-sm font-medium text-gray-900">12</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Comments</span>
                  <span className="text-sm font-medium text-gray-900">48</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Reputation</span>
                  <Badge className="bg-blue-600 border-0 text-white">
                    <TrendingUp className="w-3 h-3 mr-1" />
                    234
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}