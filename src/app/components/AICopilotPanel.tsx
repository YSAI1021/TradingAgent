import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router";
import {
  FileImage,
  Mic,
  Plus,
  Send,
  Shield,
  Smartphone,
  Sparkles,
} from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { Badge } from "@/app/components/ui/badge";
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
  "Summarize community sentiment on tech stocks with evidence",
  "What are top contributors saying about NVDA?",
  "How does community view my portfolio concentration?",
  "What's the controversy around energy sector?",
];

function getSuggestedPrompts(pathname: string): string[] {
  if (pathname === "/") return DASHBOARD_PROMPTS;
  if (pathname.startsWith("/portfolio")) return PORTFOLIO_PROMPTS;
  if (pathname.startsWith("/stocks") || pathname.startsWith("/stock/")) return STOCKS_PROMPTS;
  if (pathname.startsWith("/thesis")) return THESIS_PROMPTS;
  if (pathname.startsWith("/community")) return COMMUNITY_PROMPTS;
  return PORTFOLIO_PROMPTS;
}

interface CopilotMessage {
  role: "assistant" | "user";
  content: string;
  evidence?: EvidenceChipItem[];
}

function getPageSeed(pathname: string): { content: string; evidence: EvidenceChipItem[] } {
  if (pathname === "/") {
    return {
      content:
        "AI Brief generated: portfolio performance is primarily driven by tech exposure, while concentration risk is rising. Consider a light rebalance review.",
      evidence: [
        {
          source: "Portfolio Holdings",
          evidence: "AAPL/MSFT carry high portfolio weight and are the main contributors to today's move.",
          confidence: "High",
        },
        {
          source: "Market News",
          evidence: "In the last 24 hours, earnings-related tech coverage is concentrated and sentiment is broadly positive.",
          confidence: "Medium",
        },
      ],
    };
  }

  if (pathname.startsWith("/portfolio")) {
    return {
      content:
        "AI Brief generated: this week's return was led by tech, while energy dragged performance. Review single-sector exposure.",
      evidence: [
        {
          source: "Portfolio Return",
          evidence: "Weekly gains were mostly driven by positive moves in AAPL and MSFT.",
          confidence: "High",
        },
        {
          source: "Sector Exposure",
          evidence: "Tech allocation remains above target, increasing downside sensitivity during pullbacks.",
          confidence: "High",
        },
      ],
    };
  }

  if (pathname.startsWith("/stocks") || pathname.startsWith("/stock/")) {
    return {
      content:
        "AI Brief generated: single-stock analysis now combines price action, news context, and portfolio exposure. Prioritize high-correlation risk.",
      evidence: [
        {
          source: "Price Action",
          evidence: "Recent movement is highly synchronized with related large-cap tech names.",
          confidence: "Medium",
        },
        {
          source: "News Retrieval",
          evidence: "Recent relevant news for this symbol has been retrieved and included in the summary.",
          confidence: "Medium",
        },
      ],
    };
  }

  if (pathname.startsWith("/thesis")) {
    return {
      content:
        "AI Brief generated: thesis health is generally stable, but execution discipline drift is present. Adjust rule triggers first.",
      evidence: [
        {
          source: "Thesis Tracker",
          evidence: "Some holdings are near stop-loss/review thresholds and require updated assumptions and triggers.",
          confidence: "High",
        },
        {
          source: "Behavior Log",
          evidence: "Rule adherence drops during high-volatility periods, reducing return consistency.",
          confidence: "Medium",
        },
      ],
    };
  }

  return {
    content:
      "AI Brief generated: community views show both consensus and disagreement versus your current holdings. Focus on controversy in high-weight positions.",
    evidence: [
      {
        source: "Community Posts",
        evidence: "NVDA and broader tech topics have high discussion volume with generally bullish tone.",
        confidence: "Medium",
      },
      {
        source: "Portfolio Match",
        evidence: "Your highest-weight positions overlap with the most debated community topics.",
        confidence: "Medium",
      },
    ],
  };
}

function buildAssistantReply(pathname: string, question: string): CopilotMessage {
  const seed = getPageSeed(pathname);
  return {
    role: "assistant",
    content: `Analyzed your question "${question}" using Google Gemini + RAG. ${seed.content} (Evidence Mode enabled).`,
    evidence: seed.evidence,
  };
}

export function AICopilotPanel() {
  const [input, setInput] = useState("");
  const { pathname } = useLocation();
  const suggestedPrompts = useMemo(() => getSuggestedPrompts(pathname), [pathname]);
  const [messages, setMessages] = useState<CopilotMessage[]>([]);

  useEffect(() => {
    const seed = getPageSeed(pathname);
    setMessages([{ role: "assistant", content: seed.content, evidence: seed.evidence }]);
  }, [pathname]);

  const handleSend = () => {
    const question = input.trim();
    if (!question) return;

    setMessages((prev) => [
      ...prev,
      { role: "user", content: question },
      buildAssistantReply(pathname, question),
    ]);
    setInput("");
  };

  return (
    <aside className="w-96 bg-white border-l border-gray-200 flex flex-col">
      {/* Header */}
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <Sparkles className="w-6 h-6 text-blue-600" />
          <h2 className="text-xl font-semibold text-gray-900">Portfolio Copilot</h2>
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
            Gemini API + RAG
          </Badge>
          <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
            Evidence Mode ON
          </Badge>
        </div>
      </div>
      
      {/* Suggested Prompts */}
      <div className="p-6 border-b border-gray-200">
        <h3 className="text-sm font-medium text-gray-700 mb-3">Suggested prompts</h3>
        <div className="space-y-2">
          {suggestedPrompts.map((prompt, i) => (
            <button
              key={i}
              className="w-full text-left px-3 py-2 rounded-lg border border-gray-200 hover:border-blue-300 hover:bg-blue-50 transition-colors text-sm text-gray-700"
              onClick={() => setInput(prompt)}
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
            {message.role === "assistant" && message.evidence && (
              <EvidenceChips items={message.evidence} />
            )}
          </div>
        ))}

        <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-600 mb-2">
            Research Tracks
          </p>
          <div className="space-y-2 text-xs text-gray-700">
            <div className="flex items-start gap-2">
              <Shield className="w-4 h-4 mt-0.5 text-blue-600" />
              <span>Data Privacy: Minimized portfolio-data transfer and isolated storage are built into Copilot design.</span>
            </div>
            <div className="flex items-start gap-2">
              <Smartphone className="w-4 h-4 mt-0.5 text-blue-600" />
              <span>Mobile feasibility: Prioritize short responses and evidence summaries to reduce first-screen wait time.</span>
            </div>
            <div className="flex items-start gap-2">
              <FileImage className="w-4 h-4 mt-0.5 text-blue-600" />
              <span>Multimodal exploration: Keep voice input and report-screenshot upload entry points for future expansion.</span>
            </div>
          </div>
        </div>
      </div>
      
      {/* Input Box with Attach, Mic, and Disclaimer */}
      <div className="p-4 border-t border-gray-200">
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 shrink-0 text-gray-500 hover:text-gray-700 hover:bg-gray-100"
            title="Add files or attachments"
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
                handleSend();
              }
            }}
            className="flex-1 px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
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
            onClick={handleSend}
            className="h-9 w-9 shrink-0 bg-blue-600 hover:bg-blue-700 text-white [&_svg]:text-white"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
        <p className="text-center text-xs text-gray-400 mt-2">
          Portfolio Copilot (Gemini + RAG) can make mistakes. Not financial advice.
        </p>
      </div>
    </aside>
  );
}
