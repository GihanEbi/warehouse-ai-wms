"use client";

import { useRouter } from "next/navigation";
import { Check, ShieldAlert, UserRound } from "lucide-react";
import { toast } from "sonner";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useCurrentUser, useData } from "@/hooks/use-wms";
import { useWmsStore } from "@/stores/wms-store";
import { ROLE_LABELS } from "@/lib/constants";
import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";

export function UserMenu() {
  const router = useRouter();
  const user = useCurrentUser();
  const data = useData();
  const setCurrentUser = useWmsStore((s) => s.setCurrentUser);
  if (!user) return null;
  const switchable = data.users.filter((u) => u.status === "active");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        data-testid="user-menu"
        aria-label="User menu"
        className="flex items-center gap-2 rounded-lg p-0.5 pr-1 outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 sm:pr-2"
      >
        <Avatar className="size-7">
          <AvatarFallback className="bg-primary-soft text-[11px] font-semibold text-primary">{initials(user.name)}</AvatarFallback>
        </Avatar>
        <span className="hidden text-left leading-tight md:block">
          <span className="block max-w-32 truncate text-xs font-medium">{user.name}</span>
          <span className="block text-[10px] text-muted-foreground" data-testid="current-role">{ROLE_LABELS[user.role]}</span>
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <div className="px-2 py-1.5">
          <p className="truncate text-sm font-medium">{user.name}</p>
          <p className="truncate text-xs text-muted-foreground">{user.email}</p>
        </div>
        <DropdownMenuItem onClick={() => router.push(`/users/${user.id}`)}>
          <UserRound /> My profile
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <div className="px-2 pt-1 pb-1 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">Switch demo user</div>
        <div className="max-h-56 overflow-y-auto" role="group" aria-label="Switch demo user">
          {switchable.map((u) => (
            <DropdownMenuItem
              key={u.id}
              data-testid={`switch-user-${u.role}`}
              onClick={() => {
                setCurrentUser(u.id);
                toast.info(`Now viewing as ${u.name} (${ROLE_LABELS[u.role]})`);
              }}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">{u.name}</span>
                <span className="block text-[11px] text-muted-foreground">{ROLE_LABELS[u.role]}</span>
              </span>
              <Check className={cn("size-4 text-primary", u.id !== user.id && "invisible")} />
            </DropdownMenuItem>
          ))}
        </div>
        <DropdownMenuSeparator />
        <div className="flex gap-2 px-2 py-1.5 text-[11px] text-muted-foreground">
          <ShieldAlert className="mt-0.5 size-3.5 shrink-0" />
          Simulated role behaviour for demos — not real authentication or security.
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
