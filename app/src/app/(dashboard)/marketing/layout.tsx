import { MarketingProvider } from "./context";

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return <MarketingProvider>{children}</MarketingProvider>;
}
