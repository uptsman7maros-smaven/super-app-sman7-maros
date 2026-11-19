import { lazy, Suspense } from "react";
import AppErrorBoundary from "./AppErrorBoundary";

const App = lazy(() => import("../App"));

export default function AppBootstrap() {
  return (
    <AppErrorBoundary>
      <Suspense fallback={<main className="app-runtime-state" role="status">Memuat Super App...</main>}>
        <App />
      </Suspense>
    </AppErrorBoundary>
  );
}
