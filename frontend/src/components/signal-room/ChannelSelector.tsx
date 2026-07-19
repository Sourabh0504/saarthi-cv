import { cn } from "@/lib/utils";

export interface SelectableChannel {
  id: string;
  name: string;
}

export function ChannelSelector({ channels, value, onChange }: { channels: SelectableChannel[]; value: string; onChange: (id: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {channels.map((ch) => (
        <button
          key={ch.id}
          onClick={() => onChange(ch.id)}
          className={cn(
            "rounded-lg border px-3 py-1.5 text-sm font-medium transition-all active:scale-95",
            value === ch.id ? "border-sr-primary bg-sr-primary/10 text-sr-primary" : "border-sr-border bg-sr-card text-sr-muted-foreground hover:text-sr-foreground",
          )}
        >
          {ch.name}
        </button>
      ))}
    </div>
  );
}
