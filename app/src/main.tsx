import { Component, ErrorInfo, ReactNode, StrictMode, useMemo } from "react";
import { createRoot } from "react-dom/client";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-phantom";
import { SolflareWalletAdapter } from "@solana/wallet-adapter-solflare";
import App from "./App";
import { RPC_URL } from "./chain";
import "@solana/wallet-adapter-react-ui/styles.css";
import "./styles.css";

class AppErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Anti-Social Network render error", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <main style={{ maxWidth: 720, margin: "80px auto", padding: 24, fontFamily: "system-ui", color: "#322b38" }}>
          <h1>The app hit a browser error.</h1>
          <p>Refresh once, then check that the browser wallet extension is enabled.</p>
          <pre style={{ whiteSpace: "pre-wrap", padding: 16, borderRadius: 12, background: "#fff1f3", color: "#9e4058" }}>{this.state.error.message}</pre>
        </main>
      );
    }
    return this.props.children;
  }
}

function Providers() {
  const configured = useMemo(() => [new PhantomWalletAdapter(), new SolflareWalletAdapter()], []);
  return (
    <ConnectionProvider endpoint={RPC_URL} config={{ commitment: "confirmed" }}>
      <WalletProvider wallets={configured} autoConnect>
        <WalletModalProvider><App /></WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}

createRoot(document.getElementById("root")!).render(<StrictMode><AppErrorBoundary><Providers /></AppErrorBoundary></StrictMode>);
