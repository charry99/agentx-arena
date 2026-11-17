export type BinanceIdentityCheck = {
  status: "unavailable";
  available: false;
  explanation: string;
};

export function getBinanceIdentityStatus(): BinanceIdentityCheck {
  return {
    status: "unavailable",
    available: false,
    explanation:
      "Official Binance Agent ID ownership verification is unavailable. MCP authorization does not prove ownership of an Agent ID.",
  };
}
