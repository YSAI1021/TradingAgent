import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

type PromptRequest = {
  id: number;
  text: string;
  submit: boolean;
};

type CopilotContextValue = {
  pendingPrompt: PromptRequest | null;
  sendPrompt: (text: string, options?: { submit?: boolean }) => void;
  consumePendingPrompt: () => void;
};

const CopilotContext = createContext<CopilotContextValue | undefined>(undefined);

export function CopilotProvider({ children }: { children: React.ReactNode }) {
  const [pendingPrompt, setPendingPrompt] = useState<PromptRequest | null>(null);

  const sendPrompt = useCallback(
    (text: string, options?: { submit?: boolean }) => {
      const cleaned = text.trim();
      if (!cleaned) return;
      setPendingPrompt({
        id: Date.now() + Math.floor(Math.random() * 1000),
        text: cleaned,
        submit: options?.submit ?? true,
      });
    },
    [],
  );

  const consumePendingPrompt = useCallback(() => {
    setPendingPrompt(null);
  }, []);

  const value = useMemo(
    () => ({
      pendingPrompt,
      sendPrompt,
      consumePendingPrompt,
    }),
    [pendingPrompt, sendPrompt, consumePendingPrompt],
  );

  return (
    <CopilotContext.Provider value={value}>{children}</CopilotContext.Provider>
  );
}

export function useCopilot() {
  const context = useContext(CopilotContext);
  if (!context) {
    throw new Error("useCopilot must be used within CopilotProvider");
  }
  return context;
}
