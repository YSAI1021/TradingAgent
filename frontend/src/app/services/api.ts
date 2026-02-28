// API Service for communicating with the backend
const API_BASE_URL =
  (import.meta.env.VITE_API_URL as string) || "http://localhost:3000";
const AUTH_TOKEN_STORAGE_KEY = "auth_token";
const AUTH_USER_STORAGE_KEY = "auth_user";

export class ApiError extends Error {
  status: number;
  details: Record<string, unknown>;

  constructor(
    message: string,
    status: number,
    details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
  }
}

export interface ApiRequestConfig extends RequestInit {
  token?: string;
}

function shouldClearAuthSession(
  status: number,
  errorData: Record<string, unknown>,
): boolean {
  if (status !== 401 && status !== 403) return false;
  const message = `${String(errorData.error || "")} ${String(errorData.message || "")}`.toLowerCase();
  return (
    message.includes("invalid or expired token") ||
    message.includes("access token required") ||
    message.includes("jwt")
  );
}

function clearAuthSession(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
  localStorage.removeItem(AUTH_USER_STORAGE_KEY);
  window.dispatchEvent(new CustomEvent("auth:invalid-token"));
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
    const errorData = (await response.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;

    if (token && shouldClearAuthSession(response.status, errorData)) {
      clearAuthSession();
    }

    const message =
      String(errorData.error || "") ||
      String(errorData.message || "") ||
      `API Error: ${response.status}`;
    throw new ApiError(message, response.status, errorData);
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
  fundamentals?: {
    marketCap: number | null;
    trailingPE: number | null;
    forwardPE: number | null;
    fiftyTwoWeekHigh: number | null;
    fiftyTwoWeekLow: number | null;
    averageDailyVolume3Month: number | null;
  } | null;
}

export interface StockChartPoint {
  timestamp: number;
  close: number;
}

export interface StockChartResponse {
  symbol: string;
  range: string;
  interval: string;
  previousClose: number | null;
  points: StockChartPoint[];
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

export async function fetchStockChart(
  symbol: string,
  range: string,
  interval: string,
): Promise<StockChartResponse> {
  const query = new URLSearchParams({ range, interval }).toString();
  return apiCall<StockChartResponse>(
    `/api/stock/chart/${encodeURIComponent(symbol)}?${query}`,
    {
      method: "GET",
    },
  );
}

export async function fetchHistoricalClose(
  symbol: string,
  date: string,
  token?: string,
): Promise<{ symbol: string; date: string; close: number; actualDate: string }> {
  const query = new URLSearchParams({ date }).toString();
  return apiCall<{ symbol: string; date: string; close: number; actualDate: string }>(
    `/api/stock/close/${encodeURIComponent(symbol)}?${query}`,
    {
      method: "GET",
      token,
    },
  );
}

// Fetch allowed tags for posts
export async function fetchAllowedTags(): Promise<string[]> {
  return apiCall<string[]>(`/api/tags`, { method: "GET" });
}

// Search symbols via backend proxy to Yahoo
export interface SymbolSearchResult {
  symbol: string;
  name?: string;
  exchange?: string;
}

export async function searchStockSymbols(
  query: string,
): Promise<SymbolSearchResult[]> {
  const q = encodeURIComponent(query);
  return apiCall<SymbolSearchResult[]>(`/api/stock/search?q=${q}`, {
    method: "GET",
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
  sentiment?: "bullish" | "bearish" | "neutral" | string;
  sentiment_confidence?: number;
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

export interface TrendingTopic {
  topic: string;
  posts: number;
  sentiment?: string;
}

export async function fetchTrendingTopics(): Promise<TrendingTopic[]> {
  return apiCall<TrendingTopic[]>(`/api/trending_topics`, { method: "GET" });
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
  const res = await apiCall("/api/posts", {
    method: "POST",
    token,
    body: JSON.stringify(data),
  });

  try {
    window.dispatchEvent(
      new CustomEvent("community-updated", {
        detail: { type: "post_created", postId: res.post_id },
      }),
    );
  } catch (e) {
    // ignore (non-browser envs)
  }

  return res;
}

export async function updatePost(
  token: string,
  postId: number,
  data: CreatePostRequest,
): Promise<{ message: string }> {
  const res = await apiCall(`/api/posts/${postId}`, {
    method: "PUT",
    token,
    body: JSON.stringify(data),
  });

  try {
    window.dispatchEvent(
      new CustomEvent("community-updated", {
        detail: { type: "post_updated", postId },
      }),
    );
  } catch (e) {
    // ignore
  }

  return res;
}

export async function deletePost(
  token: string,
  postId: number,
): Promise<{ message: string }> {
  const res = await apiCall(`/api/posts/${postId}`, {
    method: "DELETE",
    token,
  });

  try {
    window.dispatchEvent(
      new CustomEvent("community-updated", {
        detail: { type: "post_deleted", postId },
      }),
    );
  } catch (e) {
    // ignore
  }

  return res;
}

// ============== Comments APIs ==============

export interface Comment {
  id: number;
  post_id: number;
  user_id: number;
  username?: string;
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
  const res = await apiCall(`/api/posts/${postId}/comments`, {
    method: "POST",
    token,
    body: JSON.stringify(data),
  });

  try {
    window.dispatchEvent(
      new CustomEvent("community-updated", {
        detail: { type: "comment_created", postId },
      }),
    );
  } catch (e) {
    // ignore
  }

  return res;
}

export async function deleteComment(
  token: string,
  commentId: number,
): Promise<{ message: string }> {
  const res = await apiCall(`/api/comments/${commentId}`, {
    method: "DELETE",
    token,
  });

  try {
    window.dispatchEvent(
      new CustomEvent("community-updated", {
        detail: { type: "comment_deleted", commentId },
      }),
    );
  } catch (e) {
    // ignore
  }

  return res;
}

// ============== News APIs ==============

export interface NewsArticle extends Post {
  news_url: string;
  news_source: string;
  news_published_at: string;
}

export async function fetchNews(ticker?: string): Promise<NewsArticle[]> {
  const query = ticker ? `?stock_ticker=${encodeURIComponent(ticker)}` : "";
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

export interface EvidenceChip {
  source: string;
  evidence: string;
  confidence: "High" | "Medium" | "Low";
  url?: string | null;
}

export interface ChatResponse {
  success: boolean;
  message: string;
  newsUsed?: Array<{
    ticker?: string;
    title?: string;
    source?: string;
    url?: string;
    sentiment?: string;
    confidence?: number;
  }>;
  detectedTickers?: string[];
  newsCount?: number;
  evidenceMode?: boolean;
  evidenceChips?: EvidenceChip[];
  rag?: {
    enabled: boolean;
    retrievedDocuments: number;
    retrievedTickers: string[];
  };
}

export async function chatWithAI(
  messages: ChatMessage[],
  token?: string,
  portfolio?: Array<{
    symbol: string;
    shares: number;
    averageCost: number;
    currentPrice?: number;
  }>,
  apiKey?: string,
): Promise<ChatResponse> {
  const payload = JSON.stringify({ messages, portfolio, apiKey });

  // Keep Copilot stable even when auth tokens rotate/expire:
  // use the public copilot endpoint with explicit portfolio payload.
  // This avoids triggering global auth invalidation from /api/ai/chat failures.
  void token;
  return apiCall<ChatResponse>("/api/ai/copilot", {
    method: "POST",
    body: payload,
  });
}

// ============== Theses APIs ==============
export interface ThesisRecord {
  id?: number;
  symbol: string;
  name?: string;
  thesis?: string;
  entry?: number;
  target?: number;
  stop?: number;
  tags?: string[];
  status?: string;
  last_updated?: string;
}

export async function fetchTheses(token: string): Promise<ThesisRecord[]> {
  return apiCall<ThesisRecord[]>(`/api/theses`, {
    method: "GET",
    token,
  });
}

export async function createThesis(
  token: string,
  data: ThesisRecord,
): Promise<ThesisRecord> {
  return apiCall<ThesisRecord>(`/api/theses`, {
    method: "POST",
    token,
    body: JSON.stringify(data),
  });
}

export async function updateThesis(
  token: string,
  id: number,
  data: Partial<ThesisRecord>,
): Promise<ThesisRecord> {
  return apiCall<ThesisRecord>(`/api/theses/${id}`, {
    method: "PUT",
    token,
    body: JSON.stringify(data),
  });
}

export async function deleteThesis(
  token: string,
  id: number,
): Promise<{ message: string }> {
  return apiCall<{ message: string }>(`/api/theses/${id}`, {
    method: "DELETE",
    token,
  });
}

// ============== User Settings APIs ==============
export async function fetchUserSetting(
  token: string,
  key?: string,
): Promise<any> {
  const q = key ? `?key=${encodeURIComponent(key)}` : "";
  return apiCall<any>(`/api/user/settings${q}`, {
    method: "GET",
    token,
  });
}

export async function saveUserSetting(
  token: string,
  key: string,
  value: any,
): Promise<{ message: string }> {
  return apiCall<{ message: string }>(`/api/user/settings`, {
    method: "POST",
    token,
    body: JSON.stringify({ key, value }),
  });
}

// ============== Watchlist APIs ==============
export async function fetchWatchlist(token: string): Promise<string[]> {
  return apiCall<string[]>(`/api/watchlist`, { method: "GET", token });
}

export async function addWatchlistItem(
  token: string,
  symbol: string,
): Promise<{ message: string; symbol?: string }>
{
  return apiCall(`/api/watchlist`, {
    method: "POST",
    token,
    body: JSON.stringify({ symbol }),
  });
}

export async function deleteWatchlistItem(
  token: string,
  symbol: string,
): Promise<{ message: string; symbol?: string }>
{
  return apiCall(`/api/watchlist/${encodeURIComponent(symbol)}`, {
    method: "DELETE",
    token,
  });
}
