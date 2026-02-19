import { useMemo, useState } from "react";
import { useLocation } from "react-router";
import { Sparkles, Send, Plus, Mic } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { chatWithAI, type ChatMessage } from "@/app/services/api";
import { useAuth } from "@/app/context/AuthContext";
import { usePortfolio } from "@/app/hooks/usePortfolio";
import { EvidenceChips, type EvidenceChipItem } from "@/app/components/EvidenceChips";

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

interface CopilotMessage {
  role: "assistant" | "user";
  content: string;
  evidence?: EvidenceChipItem[];
}

export function AICopilotPanel() {
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [messages, setMessages] = useState<CopilotMessage[]>([
    {
      role: "assistant",
      content:
        "Gemini Copilot is ready. Ask a portfolio question and I will return an answer with evidence chips.",
    },
  ]);
  const { pathname } = useLocation();
  const { token } = useAuth();
  const { holdings } = usePortfolio();
  const suggestedPrompts = useMemo(
    () => getSuggestedPrompts(pathname),
    [pathname],
  );

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

      const response = await chatWithAI(apiMessages, token || undefined, portfolioPayload);
      const evidence =
        response.evidenceChips?.map((chip) => ({
          source: chip.source,
          evidence: chip.evidence,
          confidence: chip.confidence,
        })) ?? [];

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: response.message || "No AI response was returned.",
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
          content: `Copilot request failed: ${message}`,
        },
      ]);
    } finally {
      setSending(false);
    }
  };

  return (
    <aside className="w-96 bg-white border-l border-gray-200 flex flex-col">
      {/* Header */}
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <Sparkles className="w-6 h-6 text-blue-600" />
          <h2 className="text-xl font-semibold text-gray-900">
            Portfolio Copilot
          </h2>
        </div>
        <p className="text-sm text-gray-500 mt-1">Your investment assistant</p>
      </div>

      {/* Suggested Prompts */}
      <div className="p-6 border-b border-gray-200">
        <h3 className="text-sm font-medium text-gray-700 mb-3">
          Suggested prompts
        </h3>
        <div className="space-y-2">
          {suggestedPrompts.map((prompt, i) => (
            <button
              key={i}
              className="w-full text-left px-3 py-2 rounded-lg border border-gray-200 hover:border-blue-300 hover:bg-blue-50 transition-colors text-sm text-gray-700"
              onClick={() => {
                setInput(prompt);
                void sendMessage(prompt);
              }}
            >
              {prompt}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
        {messages.map((message, idx) => (
          <div key={`${message.role}-${idx}`} className="space-y-2">
            <div
              className={
                message.role === "assistant"
                  ? "rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-gray-700"
                  : "rounded-lg border border-gray-200 bg-white p-3 text-sm text-gray-700"
              }
            >
              {message.content}
            </div>
            {message.role === "assistant" && message.evidence?.length ? (
              <EvidenceChips items={message.evidence} />
            ) : null}
          </div>
        ))}
      </div>

      {/* Input Box with Attach, Mic, and Disclaimer */}
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
                  content: "Attachment upload is not enabled yet. Text chat is active.",
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
                  content: "Voice input is in preview. Please use text input for now.",
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
