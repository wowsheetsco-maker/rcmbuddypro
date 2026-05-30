import { Construction } from "lucide-react";
import AppLayout from "@/components/AppLayout";

interface PlaceholderPageProps {
  title: string;
  description?: string;
}

export default function PlaceholderPage({ title, description }: PlaceholderPageProps) {
  return (
    <AppLayout>
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <Construction className="h-12 w-12 text-muted-foreground/40 mb-4" />
        <h1 className="text-2xl font-display text-foreground mb-2">{title}</h1>
        <p className="text-sm text-muted-foreground max-w-md">
          {description || "This module is under development and will be available soon."}
        </p>
      </div>
    </AppLayout>
  );
}
