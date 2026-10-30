"use client";

import { MoreHorizontal } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

export interface RowAction {
  key: string;
  label: string;
  icon?: LucideIcon;
  onClick: () => void;
  destructive?: boolean;
  disabled?: boolean;
  hidden?: boolean;
}

/** Overflow menu used in table rows; swallows clicks so the row link does not fire. */
export function RowActions({ actions, label = "Actions" }: { actions: RowAction[]; label?: string }) {
  const visible = actions.filter((a) => !a.hidden);
  return (
    <div onClick={(e) => e.stopPropagation()} className="flex justify-end">
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={label} data-testid="row-actions" />}>
          <MoreHorizontal />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-40">
          {visible.map((a) => (
            <DropdownMenuItem
              key={a.key}
              variant={a.destructive ? "destructive" : "default"}
              disabled={a.disabled}
              onClick={a.onClick}
              data-testid={`action-${a.key}`}
            >
              {a.icon && <a.icon />}
              {a.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
