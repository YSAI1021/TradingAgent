// API Service for communicating with the backend
const ENV_API_BASE_URL = (
  (import.meta.env.VITE_API_URL as string | undefined) || ""
).trim();
const IS_LOCAL_BROWSER =
  typeof window !== "undefined" &&
  (window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1");
const API_BASE_URL =
  ENV_API_BASE_URL || (IS_LOCAL_BROWSER ? "http://localhost:3000" : "");
const GEMINI_API_KEY_STORAGE = "gemini_api_key";

export interface ApiRequestConfig extends RequestInit {
  token?: string;
}

export function getStoredGeminiApiKey(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(GEMINI_API_KEY_STORAGE) || "";
}

export function setStoredGeminiApiKey(value: string): void {
  if (typeof window === "undefined") return;
  const cleaned = value.trim();
  if (!cleaned) {
    localStorage.removeItem(GEMINI_API_KEY_STORAGE);
    return;
  }
  localStorage.setItem(GEMINI_API_KEY_STORAGE, cleaned);
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
    if ((response.status === 401 || response.status === 403) && token) {
      if (typeof window !== "undefined") {
        localStorage.removeItem("auth_token");
        localStorage.removeItem("auth_user");
        window.dispatchEvent(new Event("auth:invalid-token"));
      }
    }
    const errorData = await response.json().catch(() => ({}));
    const defaultSessionError =
      response.status === 401 || response.status === 403
        ? "Session expired. Please log in again."
        : `API Error: ${response.status}`;
    throw new Error(errorData.error || defaultSessionError);
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

export interface PortfolioSnapshot {
  id: number;
  snapshot_date: string;
  total_value: number;
  total_cost: number;
  daily_return: number;
  portfolio_data?: string;
}

export async function fetchPortfolioTransactions(
  token: string,
): Promise<PortfolioTransaction[]> {
  return apiCall<PortfolioTransaction[]>("/api/portfolio/transactions", {
    method: "GET",
    token,
  });
}

export async function fetchPortfolioSnapshots(
  token: string,
  days?: number,
): Promise<PortfolioSnapshot[]> {
  const query = days ? `?days=${days}` : "";
  return apiCall<PortfolioSnapshot[]>(`/api/portfolio/snapshots${query}`, {
    method: "GET",
    token,
  });
}

export interface BenchmarkPoint {
  date: string;
  return: number; // percent since base
}

export async function fetchMarketBenchmark(
  days?: number,
): Promise<BenchmarkPoint[]> {
  const query = days ? `?days=${days}` : "";
  return apiCall<BenchmarkPoint[]>(`/api/market/benchmark${query}`, {
    method: "GET",
  });
}

export async function generateHistoricalSnapshots(
  token: string,
): Promise<{ message: string; snapshots_created: number }> {
  return apiCall<{ message: string; snapshots_created: number }>(
    "/api/portfolio/generate-historical-snapshots",
    {
      method: "POST",
      token,
    },
  );
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
  marketSymbol?: string;
  proxyUsed?: boolean;
  price: number;
  currency: string;
  marketState: string;
  previousClose: number;
  requestedDate?: string;
  priceDate?: string;
}

export async function fetchStockPrice(
  symbol: string,
  token?: string,
  date?: string,
): Promise<StockPrice> {
  const params = new URLSearchParams();
  if (date) params.set("date", date);
  const query = params.toString() ? `?${params.toString()}` : "";
  return apiCall<StockPrice>(`/api/stock/price/${symbol}${query}`, {
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

// ============== Onboarding APIs ==============

export interface OnboardingProfile {
  investorType: string;
  assetTypes: string[];
  riskTolerance: string;
  decisionHorizon: string;
  marketFocus: string;
  baselineFlags: string[];
  investmentAnchor: string;
  completedAt?: string | null;
  updatedAt?: string | null;
}

export async function fetchOnboardingProfile(
  token: string,
): Promise<OnboardingProfile> {
  return apiCall<OnboardingProfile>("/api/user/onboarding", {
    method: "GET",
    token,
  });
}

export async function saveOnboardingProfile(
  token: string,
  profile: OnboardingProfile,
): Promise<{ message: string; profile: OnboardingProfile }> {
  return apiCall<{ message: string; profile: OnboardingProfile }>(
    "/api/user/onboarding",
    {
      method: "PUT",
      token,
      body: JSON.stringify(profile),
    },
  );
}

// ============== Thesis APIs ==============

export type ThesisBucket = "Equities" | "Real Estate" | "Crypto";

export interface ThesisEquity {
  id: number;
  bucket: ThesisBucket;
  symbol: string;
  company: string;
  allocation: string;
  thesis: string;
  validity: string;
  created_at?: string;
  updated_at?: string;
}

export async function fetchThesisEquities(
  token: string,
): Promise<ThesisEquity[]> {
  return apiCall<ThesisEquity[]>("/api/thesis/equities", {
    method: "GET",
    token,
  });
}

export async function createThesisEquity(
  token: string,
  data: Omit<ThesisEquity, "id" | "created_at" | "updated_at">,
): Promise<ThesisEquity> {
  return apiCall<ThesisEquity>("/api/thesis/equities", {
    method: "POST",
    token,
    body: JSON.stringify(data),
  });
}

export async function updateThesisEquity(
  token: string,
  id: number,
  data: Omit<ThesisEquity, "id" | "created_at" | "updated_at">,
): Promise<ThesisEquity> {
  return apiCall<ThesisEquity>(`/api/thesis/equities/${id}`, {
    method: "PUT",
    token,
    body: JSON.stringify(data),
  });
}

export async function deleteThesisEquity(
  token: string,
  id: number,
): Promise<{ message: string }> {
  return apiCall<{ message: string }>(`/api/thesis/equities/${id}`, {
    method: "DELETE",
    token,
  });
}

// ============== User Rules (Thesis) APIs ==============

export type RuleCategory = "Macro" | "Earnings" | "Risk" | "Behavior";
export type RuleStatus = "Active" | "Triggered";

export interface UserRule {
  id: number;
  category: RuleCategory;
  condition: string;
  action: string;
  status: RuleStatus;
  created_at?: string;
  updated_at?: string;
}

export async function fetchUserRules(token: string): Promise<UserRule[]> {
  return apiCall<UserRule[]>("/api/user/rules", { method: "GET", token });
}

export async function createUserRule(
  token: string,
  data: Pick<UserRule, "condition" | "action" | "status">,
): Promise<UserRule> {
  return apiCall<UserRule>("/api/user/rules", {
    method: "POST",
    token,
    body: JSON.stringify(data),
  });
}

export async function updateUserRule(
  token: string,
  id: number,
  data: Pick<UserRule, "condition" | "action" | "status">,
): Promise<UserRule> {
  return apiCall<UserRule>(`/api/user/rules/${id}`, {
    method: "PUT",
    token,
    body: JSON.stringify(data),
  });
}

export async function deleteUserRule(token: string, id: number): Promise<{ message: string }> {
  return apiCall<{ message: string }>(`/api/user/rules/${id}`, {
    method: "DELETE",
    token,
  });
}

// ============== Thesis Decision Events APIs ==============

export interface DashboardStats {
  ruleAdherence: number;
  totalDecisions: number;
  honored: number;
  overrides: number;
  panicPauses: number;
  avgCoolingHours: number;
}

export async function fetchDashboardStats(
  token: string,
): Promise<DashboardStats> {
  return apiCall<DashboardStats>("/api/thesis/dashboard-stats", {
    method: "GET",
    token,
  });
}

export async function seedDecisionEvents(
  token: string,
): Promise<{ message: string; seeded: boolean }> {
  return apiCall<{ message: string; seeded: boolean }>(
    "/api/thesis/decision-events/seed",
    {
      method: "POST",
      token,
    },
  );
}

export interface DecisionEvent {
  id: number;
  event_type: "rule_honored" | "rule_override" | "panic_pause";
  rule_id: number | null;
  description: string | null;
  created_at: string;
}

export async function fetchDecisionEvents(
  token: string,
  limit = 50,
): Promise<DecisionEvent[]> {
  const params = new URLSearchParams();
  params.set("limit", String(limit));
  return apiCall<DecisionEvent[]>(`/api/thesis/decision-events?${params.toString()}`, {
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
): Promise<Post> {
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
): Promise<Post> {
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
): Promise<Comment & { username?: string }> {
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
  sentiment?: "bullish" | "bearish" | "neutral" | string;
  sentiment_confidence?: number;
  sentiment_reason?: string;
}

export async function fetchNews(ticker?: string): Promise<NewsArticle[]> {
  const normalizedTicker = ticker ? ticker.trim().toUpperCase() : "";
  const query = normalizedTicker
    ? `?stock_ticker=${encodeURIComponent(normalizedTicker)}`
    : "";
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

export interface EvidenceItem {
  ticker?: string;
  title: string;
  source?: string;
  url?: string;
  sentiment?: string;
}

export interface ChatResponse {
  success: boolean;
  message: string;
  newsUsed?: EvidenceItem[];
  detectedTickers?: string[];
}

export async function chatWithAI(
  token: string,
  messages: ChatMessage[],
): Promise<ChatResponse> {
  const apiKey = getStoredGeminiApiKey();
  return apiCall<ChatResponse>("/api/ai/chat", {
    method: "POST",
    token,
    body: JSON.stringify({
      messages,
      ...(apiKey ? { apiKey } : {}),
    }),
  });
}

export interface AISettingsResponse {
  hasGeminiApiKey: boolean;
  updatedAt?: string | null;
}

export async function fetchAISettings(
  token: string,
): Promise<AISettingsResponse> {
  return apiCall<AISettingsResponse>("/api/user/settings/ai", {
    method: "GET",
    token,
  });
}

export async function saveAISettings(
  token: string,
  geminiApiKey: string,
): Promise<{ message: string; hasGeminiApiKey: boolean; updatedAt?: string }> {
  const cleaned = geminiApiKey.trim();
  const response = await apiCall<{
    message: string;
    hasGeminiApiKey: boolean;
    updatedAt?: string;
  }>("/api/user/settings/ai", {
    method: "PUT",
    token,
    body: JSON.stringify({ geminiApiKey: cleaned }),
  });
  setStoredGeminiApiKey(cleaned);
  return response;
}
