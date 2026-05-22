import { Card } from "@/components/ui/card";
import { AlertCircle } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center">
      <Card className="max-w-md p-6">
        <div className="flex items-center gap-2 mb-2">
          <AlertCircle className="w-5 h-5 text-destructive" />
          <h1 className="text-lg font-semibold">Not found</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          The route you requested has no handler. Check the sidebar for available views.
        </p>
      </Card>
    </div>
  );
}
