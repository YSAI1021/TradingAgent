// API Service for communicating with the backend
const API_BASE_URL =
  (import.meta.env.VITE_API_URL as string) || "http://localhost:3000";

export interface ApiRequestConfig extends RequestInit {
  token?: string;
}

// Helper function to make authenticated API calls
async function apiCall<T>(
  endpoint: string,
  config: ApiRequestConfig = {},
): Promise<T> {
  const { token, ...fetchConfig } = config;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (fetchConfig.headers) {
    const existingHeaders = fetchConfig.headers as Record<string, string>;
    Object.assign(headers, existingHeaders);
  }

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...fetchConfig,
    headers,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `API Error: ${response.status}`);
  }

  return response.json();
}

// ============== Portfolio APIs ==============

export interface PortfolioHolding {
  symbol: string;
  shares: number;
  averageCost: number;
}

export async function fetchPortfolioSummary(
  token: string,
): Promise<PortfolioHolding[]> {
  return apiCall<PortfolioHolding[]>("/api/portfolio/summary", {
    method: "GET",
    token,
  });
}

export interface PortfolioTransaction {
  id: number;
  user_id: number;
  symbol: string;
  transaction_type: "buy" | "sell";
  shares: number;
  price_per_share: number;
  transaction_date: string;
  created_at: string;
}

export async function fetchPortfolioTransactions(
  token: string,
): Promise<PortfolioTransaction[]> {
  return apiCall<PortfolioTransaction[]>("/api/portfolio/transactions", {
    method: "GET",
    token,
  });
}

export interface AddTransactionRequest {
  symbol: string;
  transaction_type: "buy" | "sell";
  shares: number;
  price_per_share: number;
  transaction_date?: string;
}

export async function addPortfolioTransaction(
  token: string,
  transaction: AddTransactionRequest,
): Promise<{ message: string }> {
  return apiCall("/api/portfolio/transactions", {
    method: "POST",
    token,
    body: JSON.stringify(transaction),
  });
}

export async function deletePortfolioTransaction(
  token: string,
  transactionId: number,
): Promise<{ message: string }> {
  return apiCall(`/api/portfolio/transactions/${transactionId}`, {
    method: "DELETE",
    token,
  });
}

// ============== Stock Price API ==============

export interface StockPrice {
  symbol: string;
  price: number;
  currency: string;
  marketState: string;
  previousClose: number;
}

export async function fetchStockPrice(
  symbol: string,
  token?: string,
): Promise<StockPrice> {
  return apiCall<StockPrice>(`/api/stock/price/${symbol}`, {
    method: "GET",
    token,
  });
}

// ============== Auth APIs ==============

export interface SignupRequest {
  username: string;
  email: string;
  password: string;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface AuthResponse {
  token: string;
  user: {
    id: number;
    username: string;
    email: string;
    created_at: string;
    activity_points?: number;
    login_streak?: number;
  };
}

export async function signup(data: SignupRequest): Promise<AuthResponse> {
  return apiCall("/api/auth/signup", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function login(data: LoginRequest): Promise<AuthResponse> {
  return apiCall("/api/auth/login", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

// ============== User Activity APIs ==============

export interface ActivitySummary {
  activityPoints: number;
  loginStreak: number;
  lastLoginDate: string;
  posts: number;
  comments: number;
  transactions: number;
  uniqueStocks: number;
}

export async function fetchUserActivity(
  token: string,
): Promise<ActivitySummary> {
  return apiCall<ActivitySummary>("/api/user/activity", {
    method: "GET",
    token,
  });
}

// ============== Posts/Community APIs ==============

export interface Post {
  id: number;
  user_id: number;
  username?: string;
  stock_ticker?: string;
  title: string;
  content: string;
  is_news: boolean;
  news_url?: string;
  news_source?: string;
  news_published_at?: string;
  news_image_url?: string;
  created_at: string;
  updated_at: string;
  comment_count?: number;
}

export async function fetchPosts(
  limit?: number,
  offset?: number,
): Promise<Post[]> {
  const params = new URLSearchParams();
  if (limit) params.append("limit", String(limit));
  if (offset) params.append("offset", String(offset));

  const query = params.toString() ? `?${params.toString()}` : "";
  return apiCall<Post[]>(`/api/posts${query}`, {
    method: "GET",
  });
}

export async function fetchPost(postId: number): Promise<Post> {
  return apiCall<Post>(`/api/posts/${postId}`, {
    method: "GET",
  });
}

export interface CreatePostRequest {
  stock_ticker?: string;
  title: string;
  content: string;
}

export async function createPost(
  token: string,
  data: CreatePostRequest,
): Promise<{ message: string; post_id: number }> {
  return apiCall("/api/posts", {
    method: "POST",
    token,
    body: JSON.stringify(data),
  });
}

export async function updatePost(
  token: string,
  postId: number,
  data: CreatePostRequest,
): Promise<{ message: string }> {
  return apiCall(`/api/posts/${postId}`, {
    method: "PUT",
    token,
    body: JSON.stringify(data),
  });
}

export async function deletePost(
  token: string,
  postId: number,
): Promise<{ message: string }> {
  return apiCall(`/api/posts/${postId}`, {
    method: "DELETE",
    token,
  });
}

// ============== Comments APIs ==============

export interface Comment {
  id: number;
  post_id: number;
  user_id: number;
  parent_comment_id?: number;
  content: string;
  created_at: string;
}

export async function fetchPostComments(postId: number): Promise<Comment[]> {
  return apiCall<Comment[]>(`/api/posts/${postId}/comments`, {
    method: "GET",
  });
}

export interface CreateCommentRequest {
  content: string;
  parent_comment_id?: number;
}

export async function createComment(
  token: string,
  postId: number,
  data: CreateCommentRequest,
): Promise<{ message: string; comment_id: number }> {
  return apiCall(`/api/posts/${postId}/comments`, {
    method: "POST",
    token,
    body: JSON.stringify(data),
  });
}

export async function deleteComment(
  token: string,
  commentId: number,
): Promise<{ message: string }> {
  return apiCall(`/api/comments/${commentId}`, {
    method: "DELETE",
    token,
  });
}

// ============== News APIs ==============

export interface NewsArticle extends Post {
  news_url: string;
  news_source: string;
  news_published_at: string;
}

export async function fetchNews(ticker?: string): Promise<NewsArticle[]> {
  const query = ticker ? `?ticker=${ticker}` : "";
  return apiCall<NewsArticle[]>(`/api/news${query}`, {
    method: "GET",
  });
}

export async function ingestNews(
  token: string,
  tickers: string[],
): Promise<{ inserted_count?: number; skipped_count?: number }> {
  return apiCall(`/api/news/ingest`, {
    method: "POST",
    token,
    body: JSON.stringify({ tickers }),
  });
}

// ============== AI Chat APIs ==============

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatResponse {
  success: boolean;
  message: string;
  newsUsed?: string[];
  detectedTickers?: string[];
}

export async function chatWithAI(
  token: string,
  messages: ChatMessage[],
): Promise<ChatResponse> {
  return apiCall<ChatResponse>("/api/ai/chat", {
    method: "POST",
    token,
    body: JSON.stringify({ messages }),
  });
}
