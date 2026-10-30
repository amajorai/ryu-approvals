import {
	Archive01Icon,
	ArchiveRestoreIcon,
	Notification01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Badge } from "@ryu/ui/components/badge.tsx";
import { Button } from "@ryu/ui/components/button.tsx";
import { Spinner } from "@ryu/ui/components/spinner.tsx";
import { safeMediaUrl } from "@ryu/ui/lib/safe-media-url.ts";
import type { CSSProperties } from "react";
import { relativeTimeIso } from "./App-format.ts";
import type { AppNotification } from "./types.ts";
import type { useNotifications } from "./useNotifications.ts";

const NOTIFICATION_LEVEL_VARIANT = new Map(
	Object.entries({
		error: "destructive",
		warning: "secondary",
		info: "outline",
		success: "outline",
	} satisfies Record<
		string,
		"default" | "secondary" | "destructive" | "outline"
	>)
);

/**
 * The sender's icon tile for a notification row: the SENDING APP's real glyph
 * (a `data:` URL inlined by the host, so it survives the frame's
 * `img-src data: blob:` CSP) on the app's plate, falling back to a deterministic
 * monogram when the app is unknown or ships no art.
 */
interface AppIconStyle extends CSSProperties {
	"--source-app-background": string;
}
function NotificationAppIcon({
	name,
	notification,
	notifications,
}: {
	name: string | null;
	notification: AppNotification;
	notifications: ReturnType<typeof useNotifications>;
}) {
	const tile = notification.source_app_id
		? notifications.icons[notification.source_app_id]
		: undefined;
	const tileStyle: AppIconStyle | undefined = tile?.background
		? { "--source-app-background": tile.background }
		: undefined;
	if (tile?.glyph) {
		return (
			<span
				aria-label={tile.name}
				className="app-source-icon flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-xl"
				style={tileStyle}
			>
				{safeMediaUrl(tile.glyph) ? (
					<img
						alt=""
						className="size-5"
						src={safeMediaUrl(tile.glyph) ?? undefined}
					/>
				) : null}
			</span>
		);
	}
	// Unknown / no-art sender: a deterministic monogram seeded from the app id so
	// the row still reads as that app rather than one repeated glyph.
	const seed = (notification.source_app_id ?? name ?? notification.id)
		.replace(/^@?ryu\//, "")
		.replace(/^@/, "")
		.replace(/[^a-z0-9]/gi, "")
		.slice(0, 2)
		.toUpperCase();
	return (
		<span
			aria-label={tile?.name ?? name ?? "Ryu"}
			className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted font-medium text-muted-foreground text-xs"
		>
			{seed || "RY"}
		</span>
	);
}

// One inbox notification. Clicking an unread row marks it read (the "open"
// action). A HITL notify gate (ack_required && !acked) also shows an Ack button
// that resumes the suspended workflow run once the gate policy is met; live rows
// can be archived, archived rows restored. All mutate through the shared
// useNotifications hook, whose success refetches the notifications list so the
// row updates. The poll keeps the list live regardless.
export function NotificationRow({
	archived,
	notification,
	notifications,
}: {
	archived: boolean;
	notification: AppNotification;
	notifications: ReturnType<typeof useNotifications>;
}) {
	const unread = !notification.read_at;
	const showAck = notification.ack_required && !notification.acked;
	const acking = notifications.acking === notification.id;
	const levelVariant =
		NOTIFICATION_LEVEL_VARIANT.get(notification.level) ?? "outline";
	const appName = notification.source_app_id
		? (notifications.icons[notification.source_app_id]?.name ?? null)
		: null;

	const handleOpen = () => {
		if (unread) {
			notifications.markRead(notification.id).catch(() => undefined);
		}
	};

	return (
		<div
			className={`rounded-lg bg-card ${unread && !archived ? "" : "opacity-75"}`}
		>
			<div className="flex items-start justify-between gap-3 p-3">
				<div className="flex min-w-0 items-start gap-3">
					<NotificationAppIcon
						name={appName}
						notification={notification}
						notifications={notifications}
					/>
					<Button
						className="h-auto min-w-0 flex-1 shrink flex-col items-stretch justify-start whitespace-normal break-words text-left"
						onClick={handleOpen}
						type="button"
						variant="ghost"
					>
						<div className="flex items-center gap-2">
							{unread && !archived ? (
								<span
									aria-label="Unread"
									className="size-1.5 shrink-0 rounded-full bg-primary"
								/>
							) : null}
							<p
								className="truncate font-medium text-sm"
								title={notification.title}
							>
								{notification.title}
							</p>
							<Badge variant={levelVariant}>{notification.level}</Badge>
						</div>
						{notification.body ? (
							<p className="mt-1 text-muted-foreground text-xs">
								{notification.body}
							</p>
						) : null}
						<div className="mt-1.5 flex items-center gap-2 text-muted-foreground text-xs">
							{appName ? <span>{appName}</span> : null}
							<span>{relativeTimeIso(notification.created_at)}</span>
							{notification.acked ? <span>Acknowledged</span> : null}
						</div>
					</Button>
				</div>
				<div className="flex shrink-0 items-center gap-1">
					{showAck ? (
						<Button
							className="shrink-0"
							disabled={acking}
							onClick={() => {
								notifications.ack(notification.id).catch(() => undefined);
							}}
							size="sm"
						>
							{acking ? (
								<Spinner className="size-4" />
							) : (
								<HugeiconsIcon className="size-4" icon={Notification01Icon} />
							)}
							Ack
						</Button>
					) : null}
					{archived ? (
						<Button
							aria-label="Restore to inbox"
							className="shrink-0"
							onClick={() => {
								notifications.unarchive(notification.id).catch(() => undefined);
							}}
							size="icon"
							variant="ghost"
						>
							<HugeiconsIcon className="size-4" icon={ArchiveRestoreIcon} />
						</Button>
					) : (
						<Button
							aria-label="Archive"
							className="shrink-0"
							onClick={() => {
								notifications.archive(notification.id).catch(() => undefined);
							}}
							size="icon"
							variant="ghost"
						>
							<HugeiconsIcon className="size-4" icon={Archive01Icon} />
						</Button>
					)}
				</div>
			</div>
		</div>
	);
}
