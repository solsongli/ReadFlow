import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/ui/wb/Button.js";
import { safeDiagnostics } from "../../domain/diagnostics.js";

export class WorkbenchErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean; diagnostics: string; copied: boolean; copyFailed: boolean }> {
  state = { failed: false, diagnostics: "", copied: false, copyFailed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: unknown, info: ErrorInfo) { this.setState({ diagnostics: safeDiagnostics(error, info.componentStack ?? "") }); }
  render() {
    if (!this.state.failed) return this.props.children;
    return <main className="flex h-full flex-col items-center justify-center gap-4 bg-wb-bg px-8 text-wb-text" aria-label="工作台错误恢复">
      <h1 className="m-0 text-[1.5rem] font-semibold">出了点问题</h1><p className="m-0 text-[0.8125rem] text-wb-text-3">重新载入后可以继续使用 ReadFlow。</p>
      <div className="flex gap-3"><Button variant="primary" onClick={() => window.location.reload()}>重新载入</Button><Button onClick={async () => { try { await navigator.clipboard.writeText(this.state.diagnostics); this.setState({ copied: true, copyFailed: false }); } catch { this.setState({ copied: false, copyFailed: true }); } }}>复制诊断信息</Button></div>
      {this.state.copied || this.state.copyFailed ? <p role="status" className="text-[0.75rem] text-wb-text-3">{this.state.copied ? "诊断信息已复制" : "剪贴板暂不可用，可以再次点击复制。"}</p> : null}
    </main>;
  }
}
