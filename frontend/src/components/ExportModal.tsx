import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sun, Moon } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
  onPick: (theme: "light" | "dark") => void;
}

export function ExportModal({ open, onClose, onPick }: Props) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display">Choose PDF theme</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">All verification links remain clickable in the PDF.</p>
        <div className="grid grid-cols-2 gap-3 pt-2">
          <button onClick={() => onPick("light")}
            className="group rounded-xl border border-border p-6 bg-white text-gray-900 hover:border-gold hover:shadow-gold transition">
            <Sun className="w-8 h-8 mx-auto mb-3 text-amber-500" />
            <div className="font-display font-semibold">Plain White</div>
            <div className="text-xs text-gray-500 mt-1">Classic client-ready report</div>
          </button>
          <button onClick={() => onPick("dark")}
            className="group rounded-xl border border-border p-6 bg-[#0a0c10] text-gray-100 hover:border-gold hover:shadow-gold transition">
            <Moon className="w-8 h-8 mx-auto mb-3 text-gold" />
            <div className="font-display font-semibold">Luxury Dark</div>
            <div className="text-xs text-gray-400 mt-1">Premium brand presentation</div>
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
