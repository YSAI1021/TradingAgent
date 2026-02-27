import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocation } from "react-router";
import { Sparkles, Send, Plus, Mic, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import {
  chatWithAI,
  fetchUserSetting,
  type ChatMessage,
} from "@/app/services/api";
import { useAuth } from "@/app/context/AuthContext";
import { usePortfolio } from "@/app/hooks/usePortfolio";
import {
  EvidenceChips,
  type EvidenceChipItem,
} from "@/app/components/EvidenceChips";

const DASHBOARD_PROMPTS = [
  "What's driving my portfolio performance today?",
  "Should I rebalance based on today's movers?",
  "Analyze my risk exposure",
];

const PORTFOLIO_PROMPTS = [
  "Explain this week's portfolio changes",
  "What risks am I exposed to?",
  "Should I take profits from tech holdings?",
  "How does my allocation compare to benchmarks?",
];

const STOCKS_PROMPTS = [
  "Which of my stocks has the best outlook?",
  "Analyze AAPL's recent performance",
  "Should I add to my NVDA position?",
  "What's the latest news on my energy holdings?",
];

const THESIS_PROMPTS = [
  "Review my XOM investment thesis",
  "Are my thesis assumptions still valid?",
  "Should I update my stop-loss levels?",
  "Compare my thesis to current performance",
];

const COMMUNITY_PROMPTS = [
  "Summarize community sentiment on tech stocks",
  "What are top contributors saying about NVDA?",
  "How does community view my portfolio concentration?",
  "What's the controversy around energy sector?",
];

function getSuggestedPrompts(pathname: string): string[] {
  if (pathname === "/") return DASHBOARD_PROMPTS;
  if (pathname.startsWith("/portfolio")) return PORTFOLIO_PROMPTS;
  if (pathname.startsWith("/stocks") || pathname.startsWith("/stock/"))
    return STOCKS_PROMPTS;
  if (pathname.startsWith("/thesis")) return THESIS_PROMPTS;
  if (pathname.startsWith("/community")) return COMMUNITY_PROMPTS;
  return PORTFOLIO_PROMPTS;
}

function stripDisclaimers(raw: string): string {
  return raw
    .split("\n")
    .filter((line) => {
      const lower = line.toLowerCase();
      return !(
        lower.includes("not financial advice") ||
        lower.includes("can make mistakes")
      );
    })
    .join("\n")
    .trim();
}

function buildTldr(raw: string): string {
  const compact = raw.replace(/\s+/g, " ").trim();
  if (!compact) return "";
  const firstSentence = compact.match(/(.+?[.!?])(\s|$)/)?.[1] || compact;
  const trimmed = firstSentence.length > 180
    ? `${firstSentence.slice(0, 177)}...`
    : firstSentence;
  return trimmed;
}

function normalizeAssistantMessage(raw: string): string {
  const cleaned = stripDisclaimers(raw || "");
  if (!cleaned) return "I could not generate a response.";
  if (/^\s*(tl;dr|conclusion)\s*[:：]/im.test(cleaned)) return cleaned;

  const tldr = buildTldr(cleaned);
  if (!tldr) return cleaned;
  return `${cleaned}\n\n### TL;DR\n${tldr}`;
}

function renderInlineMarkdown(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, idx) => {
    if (/^\*\*[^*]+\*\*$/.test(part)) {
      return <strong key={idx}>{part.slice(2, -2)}</strong>;
    }
    return <Fragment key={idx}>{part}</Fragment>;
  });
}

function renderMessageContent(raw: string) {
  const lines = raw.split("\n");
  const nodes: ReactNode[] = [];
  let listItems: ReactNode[] = [];

  const flushList = () => {
    if (!listItems.length) return;
    nodes.push(
      <ul key={`list-${nodes.length}`} className="list-disc pl-5 space-y-1">
        {listItems}
      </ul>,
    );
    listItems = [];
  };

  lines.forEach((line, index) => {
    const text = line.trim();
    if (!text) {
      flushList();
      return;
    }

    if (/^[-*]\s+/.test(text)) {
      listItems.push(
        <li key={`li-${index}`} className="text-sm text-gray-700">
          {renderInlineMarkdown(text.replace(/^[-*]\s+/, ""))}
        </li>,
      );
      return;
    }

    flushList();

    if (/^###\s+/.test(text)) {
      nodes.push(
        <h4 key={`h4-${index}`} className="text-sm font-semibold text-gray-900 mt-1">
          {renderInlineMarkdown(text.replace(/^###\s+/, ""))}
        </h4>,
      );
      return;
    }

    if (/^##\s+/.test(text)) {
      nodes.push(
        <h3 key={`h3-${index}`} className="text-base font-semibold text-gray-900 mt-1">
          {renderInlineMarkdown(text.replace(/^##\s+/, ""))}
        </h3>,
      );
      return;
    }

    if (/^#\s+/.test(text)) {
      nodes.push(
        <h2 key={`h2-${index}`} className="text-lg font-semibold text-gray-900 mt-1">
          {renderInlineMarkdown(text.replace(/^#\s+/, ""))}
        </h2>,
      );
      return;
    }

    nodes.push(
      <p key={`p-${index}`} className="text-sm text-gray-700 leading-relaxed">
        {renderInlineMarkdown(text)}
      </p>,
    );
  });

  flushList();
  return <div className="space-y-2">{nodes}</div>;
}

interface CopilotMessage {
  role: "assistant" | "user";
  content: string;
  evidence?: EvidenceChipItem[];
}

export function AICopilotPanel() {
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [geminiApiKey, setGeminiApiKey] = useState("");
  const [showPromptPicker, setShowPromptPicker] = useState(false);
  const messagesScrollRef = useRef<HTMLDivElement | null>(null);
  const [stickToBottom, setStickToBottom] = useState(true);
  const [messages, setMessages] = useState<CopilotMessage[]>([
    {
      role: "assistant",
      content:
        "Gemini Copilot is ready.\n\n### What I can do\n- Analyze your portfolio changes\n- Summarize risks and opportunities\n- Provide source-backed answers",
    },
  ]);
  const { pathname } = useLocation();
  const { token } = useAuth();
  const { holdings } = usePortfolio();
  const suggestedPrompts = useMemo(
    () => getSuggestedPrompts(pathname),
    [pathname],
  );

  useEffect(() => {
    let cancelled = false;

    const loadGeminiKey = async () => {
      const localKey = localStorage.getItem("gemini_api_key") || "";
      if (!token) {
        if (!cancelled) setGeminiApiKey(localKey);
        return;
      }
      try {
        const res = await fetchUserSetting(token, "gemini_api_key");
        const serverKey =
          res && typeof res === "object" && "value" in res
            ? String(res.value || "")
            : "";
        if (!cancelled) setGeminiApiKey(serverKey || localKey);
      } catch {
        if (!cancelled) setGeminiApiKey(localKey);
      }
    };

    void loadGeminiKey();
    const onSettingsUpdated = () => {
      void loadGeminiKey();
    };
    window.addEventListener("settings:gemini-key-updated", onSettingsUpdated);
    return () => {
      cancelled = true;
      window.removeEventListener("settings:gemini-key-updated", onSettingsUpdated);
    };
  }, [token]);

  useEffect(() => {
    if (!stickToBottom) return;
    const node = messagesScrollRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [messages, sending, stickToBottom]);

  const handleMessagesScroll = () => {
    const node = messagesScrollRef.current;
    if (!node) return;
    const threshold = 48;
    const atBottom =
      node.scrollHeight - node.scrollTop - node.clientHeight <= threshold;
    setStickToBottom(atBottom);
  };

  const sendMessage = async (forcedInput?: string) => {
    const question = (forcedInput ?? input).trim();
    if (!question || sending) return;

    const nextMessages: CopilotMessage[] = [
      ...messages,
      { role: "user", content: question },
    ];
    setMessages(nextMessages);
    setInput("");
    setSending(true);

    try {
      const apiMessages: ChatMessage[] = nextMessages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const portfolioPayload = holdings.map((h) => ({
        symbol: h.symbol,
        shares: h.shares,
        averageCost: h.avgCost,
        currentPrice: h.currentPrice,
      }));

      const response = await chatWithAI(
        apiMessages,
        token || undefined,
        portfolioPayload,
        geminiApiKey.trim() || undefined,
      );
      const evidence =
        response.evidenceChips?.map((chip) => ({
          source: chip.source,
          evidence: chip.evidence,
          confidence: chip.confidence,
          url: chip.url,
        })) ?? [];

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: normalizeAssistantMessage(response.message || ""),
          evidence,
        },
      ]);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Request failed. Check backend availability.";
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `### Request Failed\n${message}\n\n### TL;DR\nPlease verify your Gemini API key in Settings and try again.`,
        },
      ]);
    } finally {
      setSending(false);
    }
  };

  return (
    <aside className="w-full h-full min-h-0 bg-white border-l border-gray-200 flex flex-col">
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-blue-600" />
          <h2 className="text-lg font-semibold text-gray-900">Portfolio Copilot</h2>
        </div>
        <p className="text-xs text-gray-500 mt-1">
          Ask portfolio questions and get source-backed answers.
        </p>
      </div>

      <div className="p-4 border-b border-gray-200">
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-full border border-gray-300 bg-gray-50 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100"
          onClick={() => setShowPromptPicker((v) => !v)}
        >
          Suggested Prompts
          {showPromptPicker ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </button>
        {showPromptPicker ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {suggestedPrompts.map((prompt) => (
              <button
                key={prompt}
                type="button"
                className="rounded-full border border-gray-200 bg-white px-3 py-1 text-xs text-gray-700 hover:bg-gray-50"
                onClick={() => {
                  setInput(prompt);
                  setShowPromptPicker(false);
                }}
              >
                {prompt}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div
        ref={messagesScrollRef}
        onScroll={handleMessagesScroll}
        className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 space-y-3"
      >
        {messages.map((message, idx) => (
          <div key={`${message.role}-${idx}`} className="space-y-2">
            <div
              className={
                message.role === "assistant"
                  ? "rounded-lg border border-blue-200 bg-blue-50 p-3"
                  : "rounded-lg border border-gray-200 bg-white p-3 text-sm text-gray-700 whitespace-pre-wrap"
              }
            >
              {message.role === "assistant"
                ? renderMessageContent(message.content)
                : message.content}
            </div>
            {message.role === "assistant" && message.evidence?.length ? (
              <EvidenceChips
                items={message.evidence}
                title="Sources"
                showConfidence={false}
              />
            ) : null}
          </div>
        ))}
      </div>

      <div className="p-4 border-t border-gray-200">
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 shrink-0 text-gray-500 hover:text-gray-700 hover:bg-gray-100"
            title="Add files or attachments"
            onClick={() =>
              setMessages((prev) => [
                ...prev,
                {
                  role: "assistant",
                  content:
                    "### Attachments\nAttachment upload is in preview. Use text prompts for now.",
                },
              ])
            }
          >
            <Plus className="w-4 h-4" />
          </Button>
          <input
            type="text"
            placeholder="Ask anything..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void sendMessage();
              }
            }}
            className="flex-1 px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
          />
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 shrink-0 text-gray-500 hover:text-gray-700 hover:bg-gray-100"
            title="Voice input"
            onClick={() =>
              setMessages((prev) => [
                ...prev,
                {
                  role: "assistant",
                  content:
                    "### Voice Preview\nVoice input is in preview. Please use text input for now.",
                },
              ])
            }
          >
            <Mic className="w-4 h-4" />
          </Button>
          <Button
            size="icon"
            disabled={sending}
            onClick={() => void sendMessage()}
            className="h-9 w-9 shrink-0 bg-blue-600 hover:bg-blue-700 text-white [&_svg]:text-white"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
        <p className="text-center text-xs text-gray-400 mt-2">
          Portfolio Copilot can make mistakes. Not financial advice.
        </p>
      </div>
    </aside>
  );
}
