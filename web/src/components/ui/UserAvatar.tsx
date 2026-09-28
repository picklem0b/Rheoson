import { UserAvatar as ClerkUserAvatar } from "@clerk/clerk-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuthStore } from "@/store/auth.store";
import { isClerkEnabled } from "@/lib/constants";
import { cn } from "@/lib/utils";

/**
 * The one avatar component every surface renders.
 *
 * Clerk mode renders Clerk's own <UserAvatar /> (opens the Clerk account
 * popover on click, styling controlled by Clerk). Local/dev mode — or any
 * consumer that passes `interactive={false}` — renders the shadcn Avatar
 * with the app's initials-on-gradient fallback so the two modes are
 * visually identical.
 */

const AVATAR_GRADIENTS = [
  "from-violet-600 to-fuchsia-500",
  "from-blue-600 to-cyan-500",
  "from-emerald-600 to-teal-500",
  "from-rose-600 to-pink-500",
  "from-amber-600 to-orange-500",
];

function getGradient(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++)
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_GRADIENTS[Math.abs(hash) % AVATAR_GRADIENTS.length];
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return (parts[0]?.[0] ?? "U").toUpperCase();
}

export default function UserAvatar({
  name,
  imageUrl,
  size = "md",
  shape = "circle",
  className,
  interactive,
}: {
  /** Display name — initials derive from it, and the gradient is stable per name. */
  name?: string | null;
  imageUrl?: string | null;
  size?: "sm" | "md" | "lg" | "xl";
  shape?: "circle" | "rounded";
  className?: string;
  /**
   * Whether clicking opens Clerk's account popover. Defaults to true only
   * in Clerk mode; rows that navigate elsewhere pass false explicitly.
   */
  interactive?: boolean;
}) {
  const user = useAuthStore((s) => s.user);
  const resolvedName = name ?? user?.username ?? "Your account";
  const resolvedImage = imageUrl ?? user?.image_url ?? null;
  const clerk = isClerkEnabled();
  const isInteractive = interactive ?? clerk;

  if (clerk && isInteractive) {
    // Clerk's <UserAvatar /> accepts only appearance/rounded — sizing goes
    // through the elements.avatarBox selector, not className.
    const boxSize =
      size === "sm" ? "2rem" : size === "lg" ? "3rem" : size === "xl" ? "4rem" : "2.5rem";
    return (
      <ClerkUserAvatar
        appearance={{
          elements: {
            avatarBox: `width: ${boxSize}; height: ${boxSize};`,
          },
        }}
        rounded={shape === "circle"}
      />
    );
  }

  const initials = getInitials(resolvedName);
  const gradient = getGradient(resolvedName);

  return (
    <Avatar size={size} shape={shape} className={className}>
      {resolvedImage ? (
        <AvatarImage src={resolvedImage} alt={resolvedName} />
      ) : null}
      <AvatarFallback
        className={cn(
          "bg-gradient-to-br text-[13px] font-black text-white shadow-md",
          gradient,
          shape === "rounded" && "rounded-xl",
        )}
      >
        {initials}
      </AvatarFallback>
    </Avatar>
  );
}
