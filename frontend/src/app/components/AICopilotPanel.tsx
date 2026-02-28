import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router";
import {
  AlertCircle,
  ArrowDown,
  ChevronDown,
  ExternalLink,
  Loader2,
  Mic,
  Plus,
  Send,
  Settings2,
  Sparkles,
} from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/app/components/ui/dialog";
import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
import { useAuth } from "@/app/context/AuthContext";
import { useCopilot } from "@/app/context/CopilotContext";
import {
  chatWithAI,
  ChatMessage,
  EvidenceItem,
  fetchAISettings,
  getStoredGeminiApiKey,
  setStoredGeminiApiKey,
  saveAISettings,
} from "@/app/services/api";

const DASHBOARD_PROMPTS = [
  "What should I do this week based on my portfolio?",
  "Summarize key changes in my holdings and risk exposure.",
  "Which position needs the most attention right now?",
];

const PORTFOLIO_PROMPTS = [
  "Explain this week's portfolio changes and top drivers.",
  "What are my biggest concentration risks right now?",
  "Should I rebalance my portfolio this week?",
];

const STOCKS_PROMPTS = [
  "Give me a full analysis on NVDA and how it relates to my portfolio.",
  "Should I add AMD given my current holdings and thesis?",
  "Run a deep analysis on PANW and whether it fits my portfolio thesis.",
];

const THESIS_PROMPTS = [
  "Find decision patterns in my recent thesis updates and how to improve.",
  "Which active rule is at highest risk of being broken?",
  "Where is my thesis inconsistent with my current positions?",
];

const COMMUNITY_PROMPTS = [
  "Summarize community sentiment tailored to my holdings.",
  "What are the top debates affecting my current portfolio?",
  "How should I use community signals without overreacting?",
];

function getSuggestedPrompts(pathname: string): string[] {
  if (pathname === "/") return DASHBOARD_PROMPTS;
  if (pathname.startsWith("/portfolio")) return PORTFOLIO_PROMPTS;
  if (pathname.startsWith("/stocks") || pathname.startsWith("/stock/")) return STOCKS_PROMPTS;
  if (pathname.startsWith("/thesis")) return THESIS_PROMPTS;
  if (pathname.startsWith("/community")) return COMMUNITY_PROMPTS;
  return DASHBOARD_PROMPTS;
}

type LocalMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  evidence?: EvidenceItem[];
};

function sanitizeAssistantText(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/^#{1,6}\s*/gm, "")
    .trim();
}

function formatAssistantReply(rawText: string): string {
  const cleaned = sanitizeAssistantText(rawText);
  if (!cleaned) return "Summary: No response generated.\n\nTL;DR: Please retry.";

  const sentenceList = cleaned
    .replace(/\n+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const firstSentence = sentenceList[0] || cleaned;
  const wordCount = cleaned.split(/\s+/).filter(Boolean).length;

  let formatted = cleaned;
  if (wordCount > 170 || sentenceList.length > 8) {
    const summary =
      firstSentence.length > 180 ? `${firstSentence.slice(0, 177)}...` : firstSentence;
    const bullets = sentenceList
      .slice(1, 4)
      .map((line) => (line.length > 150 ? `${line.slice(0, 147)}...` : line));

    formatted = [
      `Summary: ${summary}`,
      ...(bullets.length > 0 ? ["", "Key points:", ...bullets.map((line) => `- ${line}`)] : []),
    ].join("\n");
  }

  if (/(^|\n)\s*(TL;DR|Conclusion)\s*:/i.test(formatted)) return formatted;
  const tldr = firstSentence.length > 160 ? `${firstSentence.slice(0, 157)}...` : firstSentence;
  return `${formatted}\n\nTL;DR: ${tldr}`;
}

export function AICopilotPanel() {
  const { token } = useAuth();
  const { pathname } = useLocation();
  const { pendingPrompt, consumePendingPrompt } = useCopilot();

  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [messages, setMessages] = useState<LocalMessage[]>([]);
  const [showPrompts, setShowPrompts] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [apiKeyDraft, setApiKeyDraft] = useState(getStoredGeminiApiKey());
  const [savingKey, setSavingKey] = useState(false);
  const [hasApiKey, setHasApiKey] = useState(false);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [sourcesItems, setSourcesItems] = useState<EvidenceItem[]>([]);
  const [stickToBottom, setStickToBottom] = useState(true);

  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestedPrompts = useMemo(() => getSuggestedPrompts(pathname), [pathname]);
  const hasConversation = messages.some((msg) => msg.role === "user");

  useEffect(() => {
    if (!token) return;
    fetchAISettings(token)
      .then((settings) => {
        setHasApiKey(Boolean(settings.hasGeminiApiKey || getStoredGeminiApiKey()));
      })
      .catch(() => {
        setHasApiKey(Boolean(getStoredGeminiApiKey()));
      });
  }, [token]);

  useEffect(() => {
    if (!pendingPrompt) return;
    setInput(pendingPrompt.text);
    if (pendingPrompt.submit) {
      void sendMessage(pendingPrompt.text);
    }
    consumePendingPrompt();
  }, [pendingPrompt]);

  useEffect(() => {
    if (!listRef.current || !stickToBottom) return;
    listRef.current.scrollTo({
      top: listRef.current.scrollHeight,
      behavior: "auto",
    });
  }, [messages, isLoading, stickToBottom]);

  const onMessagesScroll = () => {
    const el = listRef.current;
    if (!el) return;
    const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setStickToBottom(distanceToBottom < 48);
  };

  const sendMessage = async (overrideText?: string) => {
    const content = (overrideText ?? input).trim();
    if (!content || isLoading) return;
    if (!token) {
      setError("Please log in to use Portfolio Copilot.");
      return;
    }

    if (!hasApiKey && !getStoredGeminiApiKey()) {
      setError("Set your Gemini API key in Add Key before chatting.");
      setSettingsOpen(true);
      return;
    }

    const userMessage: LocalMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      content,
    };
    const nextMessages = [...messages, userMessage];
    const historyPayload: ChatMessage[] = nextMessages.map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));

    setStickToBottom(true);
    setMessages(nextMessages);
    setInput("");
    setError("");
    setIsLoading(true);

    try {
      const response = await chatWithAI(token, historyPayload);
      if (!response.success) {
        throw new Error(response.message || "Failed to get AI response");
      }
      const formatted = formatAssistantReply(response.message);
      setMessages((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          role: "assistant",
          content: formatted,
          evidence: response.newsUsed || [],
        },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to get AI response");
    } finally {
      setIsLoading(false);
    }
  };

  const saveApiKey = async () => {
    const cleaned = apiKeyDraft.trim();
    if (!cleaned) {
      setError("Gemini API key cannot be empty.");
      return;
    }

    // Always persist locally so users can chat even if backend sync fails.
    setStoredGeminiApiKey(cleaned);
    setHasApiKey(true);
    setSettingsOpen(false);
    setError("");

    if (!token) {
      return;
    }

    setSavingKey(true);
    try {
      await saveAISettings(token, cleaned);
    } catch (err) {
      setError(
        err instanceof Error
          ? `Saved locally. Cloud sync failed: ${err.message}`
          : "Saved locally. Cloud sync failed.",
      );
    } finally {
      setSavingKey(false);
    }
  };

  return (
    <aside className="relative h-full min-h-0 bg-white border-l border-gray-200 flex flex-col">
      <div className="px-4 py-4 border-b border-gray-200">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-blue-600" />
            <h2 className="text-lg font-semibold text-gray-900">Portfolio Copilot</h2>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-xs"
            onClick={() => setSettingsOpen(true)}
          >
            <Settings2 className="w-4 h-4 mr-1" />
            Add Key
          </Button>
        </div>
        <p className="text-xs text-gray-500 mt-1">AI briefings grounded in your portfolio holdings and investment theses.</p>
        {!hasApiKey && (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
            <p className="text-xs text-amber-800">
              Gemini API key not set.
            </p>
            <Button
              size="sm"
              className="mt-2 h-7 text-xs"
              onClick={() => setSettingsOpen(true)}
            >
              Add Key
            </Button>
          </div>
        )}
      </div>

      {!hasConversation && (
        <div className="px-4 py-3 border-b border-gray-200">
          <button
            className="inline-flex items-center gap-2 rounded-full border border-gray-200 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
            onClick={() => setShowPrompts((prev) => !prev)}
          >
            Suggested Prompts
            <ChevronDown className={`h-3 w-3 transition-transform ${showPrompts ? "rotate-180" : ""}`} />
          </button>
          {showPrompts && (
            <div className="mt-3 space-y-2">
              {suggestedPrompts.map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => {
                    setShowPrompts(false);
                    void sendMessage(prompt);
                  }}
                  className="w-full text-left rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 transition-colors hover:border-blue-300 hover:bg-blue-50"
                >
                  {prompt}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div
        ref={listRef}
        className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 py-4 space-y-3"
        onScroll={onMessagesScroll}
      >
        {messages.map((message) => (
          <div key={message.id} className={message.role === "assistant" ? "mr-3" : "ml-10"}>
            <div
              className={`rounded-xl px-3 py-2 text-sm whitespace-pre-wrap break-words ${
                message.role === "assistant"
                  ? "bg-gray-100 text-gray-900"
                  : "bg-blue-600 text-white"
              }`}
            >
              {message.content}
            </div>
            {message.role === "assistant" && Array.isArray(message.evidence) && message.evidence.length > 0 && (
              <button
                onClick={() => {
                  setSourcesItems(message.evidence || []);
                  setSourcesOpen(true);
                }}
                className="mt-2 inline-flex items-center gap-1 rounded-full border border-gray-300 bg-white px-3 py-1 text-xs text-gray-700 hover:bg-gray-50"
              >
                <ExternalLink className="w-3 h-3" />
                Sources ({message.evidence.length})
              </button>
            )}
          </div>
        ))}

        {isLoading && (
          <div className="mr-3 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600">
            <span className="inline-flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Thinking...
            </span>
          </div>
        )}
      </div>

      {!stickToBottom && messages.length > 0 && (
        <div className="absolute bottom-[88px] right-4 z-10">
          <Button
            variant="outline"
            size="sm"
            className="h-8 rounded-full shadow-sm bg-white"
            onClick={() => {
              setStickToBottom(true);
              if (!listRef.current) return;
              listRef.current.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
            }}
          >
            <ArrowDown className="h-3.5 w-3.5 mr-1" />
            Latest
          </Button>
        </div>
      )}

      <div className="border-t border-gray-200 px-3 py-3">
        {error && (
          <div className="mb-2 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-2 py-2 text-xs text-red-700">
            <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
            {error}
          </div>
        )}
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 shrink-0 text-gray-500 hover:text-gray-700 hover:bg-gray-100"
            title="Add attachments"
          >
            <Plus className="w-4 h-4" />
          </Button>
          <input
            ref={inputRef}
            type="text"
            placeholder="Ask Portfolio Copilot..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void sendMessage();
              }
            }}
            className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 shrink-0 text-gray-500 hover:text-gray-700 hover:bg-gray-100"
            title="Voice input"
          >
            <Mic className="w-4 h-4" />
          </Button>
          <Button
            size="icon"
            className="h-9 w-9 shrink-0 bg-blue-600 hover:bg-blue-700 text-white [&_svg]:text-white"
            onClick={() => void sendMessage()}
            disabled={isLoading}
            title="Send"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
        <p className="mt-2 text-center text-xs text-gray-400">
          Portfolio Copilot can make mistakes. Not financial advice.
        </p>
      </div>

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Key</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Label htmlFor="gemini-api-key">Gemini API Key</Label>
            <Input
              id="gemini-api-key"
              type="password"
              value={apiKeyDraft}
              placeholder="AIza..."
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setApiKeyDraft(e.target.value)}
            />
            <p className="text-xs text-gray-500">
              This key is strictly used for Portfolio Copilot analysis and is not exposed in any scenario.
            </p>
          </div>
          <div className="flex items-center justify-end gap-2">
            <Button variant="outline" onClick={() => setSettingsOpen(false)} disabled={savingKey}>
              Cancel
            </Button>
            <Button onClick={() => void saveApiKey()} disabled={savingKey}>
              {savingKey ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={sourcesOpen} onOpenChange={setSourcesOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Sources</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-1">
            {sourcesItems.length === 0 && (
              <p className="text-sm text-gray-500">No sources available for this response.</p>
            )}
            {sourcesItems.map((item, index) => (
              <a
                key={`${item.url || item.title}-${index}`}
                href={item.url || "#"}
                target="_blank"
                rel="noreferrer"
                className="block rounded-lg border border-gray-200 px-3 py-3 hover:bg-gray-50"
              >
                <p className="text-sm font-medium text-gray-900">{item.title}</p>
                <p className="mt-1 text-xs text-gray-500">
                  {[item.ticker, item.source, item.sentiment].filter(Boolean).join(" • ")}
                </p>
              </a>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </aside>
  );
}
