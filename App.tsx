import { Switch, Route, Router } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { AppShell } from "@/components/app-shell";
import { ChatPage } from "@/pages/chat";
import { MemoryPage } from "@/pages/memory";
import { ApprovalsPage } from "@/pages/approvals";
import { AuditPage } from "@/pages/audit";
import { SettingsPage } from "@/pages/settings";
import { ToolsPage } from "@/pages/tools";

function AppRouter() {
  return (
    <AppShell>
      <Switch>
        <Route path="/" component={ChatPage} />
        <Route path="/c/:id" component={ChatPage} />
        <Route path="/memory" component={MemoryPage} />
        <Route path="/approvals" component={ApprovalsPage} />
        <Route path="/audit" component={AuditPage} />
        <Route path="/tools" component={ToolsPage} />
        <Route path="/settings" component={SettingsPage} />
        <Route component={NotFound} />
      </Switch>
    </AppShell>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router hook={useHashLocation}>
          <AppRouter />
        </Router>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
