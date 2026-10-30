import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Initials avatar used across tasks, users and activity lists. */
export function UserAvatar({
  name,
  size = "sm",
  className,
}: {
  name: string;
  size?: "default" | "sm" | "lg";
  className?: string;
}) {
  return (
    <Avatar size={size} className={className}>
      <AvatarFallback
        className={cn(
          "bg-primary-soft font-semibold text-primary",
          size === "lg" ? "text-sm" : "text-[10px]",
        )}
      >
        {initials(name)}
      </AvatarFallback>
    </Avatar>
  );
}
