import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";

type AppErrorBoundaryState = { error: Error | null };

export default class AppErrorBoundary extends Component<
  { children: ReactNode },
  AppErrorBoundaryState
> {
  state: AppErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: unknown): AppErrorBoundaryState {
    return {
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Aplikasi gagal dimuat:", error, errorInfo);
  }

  render() {
    if (this.state.error) {
      return (
        <main className="app-runtime-state app-runtime-error" role="alert">
          <div>
            <span className="app-runtime-eyebrow">SUPER APP SMAN 7 MAROS</span>
            <h1>Aplikasi belum dapat dimuat</h1>
            <p>Terjadi kendala saat membuka aplikasi. Muat ulang halaman untuk mencoba kembali.</p>
            <details>
              <summary>Detail kendala</summary>
              <code>{this.state.error.message}</code>
            </details>
            <button type="button" onClick={() => window.location.reload()}>
              Muat ulang aplikasi
            </button>
          </div>
        </main>
      );
    }

    return this.props.children;
  }
}
