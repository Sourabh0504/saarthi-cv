import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Check, ChevronsUpDown, LogOut, Menu, Sun, Moon, User as UserIcon } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { fetchHomeData, type HomeAccount } from "@/lib/api";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

function initials(name: string) {
  return name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase() || "U";
}

export function TopBar({
  accountId,
  accountName,
  theme,
  onToggleTheme,
  onOpenProfile,
  onMenu,
}: {
  accountId: string;
  accountName: string;
  theme: "dark" | "light";
  onToggleTheme: () => void;
  onOpenProfile: () => void;
  onMenu?: () => void;
}) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState<HomeAccount[] | null>(null);

  useEffect(() => {
    fetchHomeData().then((r) => setAccounts(r.accounts)).catch(() => setAccounts([]));
  }, []);

  return (
    <header className="glass-sr sticky top-0 z-30 flex h-16 items-center justify-between border-b border-sr-border px-4 sm:px-6">
      <div className="flex items-center gap-3">
        <button onClick={onMenu} aria-label="Open menu" className="flex h-9 w-9 items-center justify-center rounded-lg text-sr-muted-foreground transition-all duration-150 hover:bg-sr-accent/50 active:scale-90 lg:hidden">
          <Menu className="h-5 w-5" aria-hidden="true" />
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Switch account"
              className="hidden items-center gap-2 rounded-lg border border-sr-border bg-sr-card px-3 py-1.5 text-left transition-colors hover:bg-sr-muted sm:flex"
            >
              <div className="leading-tight">
                <p className="text-sm font-semibold text-sr-foreground">{accountName || "Select an account"}</p>
                <p className="text-[11px] text-sr-muted-foreground">Scoped workspace</p>
              </div>
              <ChevronsUpDown className="h-3.5 w-3.5 text-sr-muted-foreground" aria-hidden="true" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64">
            <DropdownMenuLabel>Switch account</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {(accounts ?? []).map((a) => (
              <DropdownMenuItem key={a.id} onClick={() => navigate({ to: "/account", search: { account_id: a.id, module: "overview" } })} className="flex items-center justify-between">
                <span className="flex flex-col">
                  <span className="text-sm font-medium">{a.name}</span>
                  <span className="text-[11px] text-muted-foreground">{a.team_name}</span>
                </span>
                {accountId === a.id && <Check className="h-4 w-4 text-primary" aria-hidden="true" />}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => navigate({ to: "/" })}>View all accounts</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex items-center gap-1.5">
        <button
          onClick={onToggleTheme}
          aria-label="Toggle theme"
          className="flex h-9 w-9 items-center justify-center rounded-lg text-sr-muted-foreground transition-all duration-150 hover:bg-sr-accent/50 hover:text-sr-foreground active:scale-90"
        >
          {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={`Account menu for ${user?.name ?? "user"}`}
              className="flex items-center gap-2 rounded-full py-1 pl-1 pr-3 transition-colors hover:bg-sr-accent/50"
            >
              <Avatar className={cn("h-8 w-8 ring-2 ring-transparent transition-all hover:ring-sr-primary/30")}>
                {user?.picture && <AvatarImage src={user.picture} alt={user.name} referrerPolicy="no-referrer" />}
                <AvatarFallback className="bg-sr-gradient-brand text-xs font-semibold text-sr-primary-foreground">{initials(user?.name ?? "U")}</AvatarFallback>
              </Avatar>
              <span className="hidden text-sm font-medium text-sr-foreground sm:inline">{user?.name}</span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <p className="font-medium">{user?.name}</p>
              <p className="text-xs font-normal text-muted-foreground">{user?.email}</p>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onOpenProfile}>
              <UserIcon className="mr-2 h-4 w-4" aria-hidden="true" /> View profile
            </DropdownMenuItem>
            <DropdownMenuItem onClick={logout} className="text-destructive focus:text-destructive">
              <LogOut className="mr-2 h-4 w-4" aria-hidden="true" /> Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
