// The data layer for the ported page's Notifications section. It exposes the SAME
// surface the shell `apps/desktop/src/hooks/useNotifications.ts` did
// (`UseNotificationsResult`), so the ported JSX calls it unchanged — but the shell's
// `@tanstack/react-query` (which cannot cross the sandbox boundary) is replaced by
// local state + the `window.ryu.notifications` bridge. The shell hook resolved the
// signed-in user id (Better Auth session) to scope the feed; here the HOST resolves
// it (the sandboxed frame has no session), so `meId` is always reported as present
// once the first list resolves. Freshness comes from a poll plus an explicit
// refetch after each mutation (the shell's `invalidateQueries` equivalent, which the
// always-mounted `useNotificationEvents` SSE stream drove in the shell). Errors
// surface through the same toast the shell hook used.
//
// Two additions over the shell hook, both for the archive system the Inbox page
// renders:
//
//   - `archived` optionally drives which list the poll/mutations refetch — omitted
//     returns all rows so the page can filter status and notification type locally.
//   - `icons` resolves each row's `source_app_id` to the SENDING app's icon tile
//     (glyph as a `data:` URL, inlined by the host), grouped by distinct sender ids
//     and keyed so a row renders the real app icon rather than a generic glyph.

import { sandboxToast as toast } from "@ryu/ui/components/sandbox-toast.ts";
import { useQuery } from "@ryu/ui/hooks/use-query.ts";
import { useCallback, useEffect, useState } from "react";
import {
	ackNotification,
	appIconTiles,
	archiveNotification,
	listNotifications,
	markNotificationRead,
	unarchiveNotification,
} from "./bridge.ts";
import type { AppNotification } from "./types.ts";

const REFRESH_MS = 15_000;
const ICON_REFRESH_MS = 60_000;

/** A resolved sender icon tile (the `window.ryu.notifications.appIcons` shape). */
export interface AppIconTile {
	background: string | null;
	glyph: string;
	name: string;
}

export interface UseNotificationsResult {
	ack: (id: string) => Promise<boolean>;
	acking: string | null;
	archive: (id: string) => Promise<void>;
	error: string | null;
	/** The sender icons for the visible rows' distinct `source_app_id`s. */
	icons: Record<string, AppIconTile>;
	loading: boolean;
	markRead: (id: string) => Promise<void>;
	meId: string | null;
	notifications: AppNotification[];
	refetch: () => Promise<void>;
	unarchive: (id: string) => Promise<void>;
}

// The host owns the session, so the sandboxed frame reports a stable non-null
// `meId` — the ported page only reads it to decide whether the feed is enabled, and
// the host always scopes the query to the signed-in user.
const HOST_SCOPED_ME = "host";

export function useNotifications(archived?: boolean): UseNotificationsResult {
	const [acking, setAcking] = useState<string | null>(null);
	const query = useQuery({
		queryKey: ["inbox-notifications", archived],
		queryFn: () =>
			archived === undefined
				? listNotifications()
				: listNotifications({ archived }),
		refetchInterval: REFRESH_MS,
	});
	const notifications = query.data ?? [];
	const loading = query.isLoading;
	const error = query.isError
		? query.error instanceof Error
			? query.error.message
			: String(query.error)
		: null;
	const refresh = query.refetch;
	const appIds = [
		...new Set(
			notifications
				.map((item) => item.source_app_id)
				.filter(
					(id): id is string => typeof id === "string" && id.trim().length > 0
				)
		),
	].sort();
	// List refreshes must not download the same icon tiles every fifteen seconds.
	// Revalidate periodically so sender icon edits still reach an open Inbox.
	const iconQuery = useQuery<Record<string, AppIconTile>>({
		queryKey: ["inbox-sender-icons", appIds],
		queryFn: () => (appIds.length ? appIconTiles(appIds) : Promise.resolve({})),
		refetchInterval: appIds.length ? ICON_REFRESH_MS : undefined,
	});
	const [icons, setIcons] = useState<Record<string, AppIconTile>>({});
	const tiles = iconQuery.data;
	useEffect(() => {
		if (!tiles) {
			return;
		}
		setIcons((previous) => {
			let next = previous;
			for (const [id, tile] of Object.entries(tiles)) {
				const old = previous[id];
				if (
					old &&
					old.glyph === tile.glyph &&
					old.background === tile.background &&
					old.name === tile.name
				) {
					continue;
				}
				if (next === previous) {
					next = { ...previous };
				}
				next[id] = tile;
			}
			return next;
		});
	}, [tiles]);
	const refreshIcons = iconQuery.refetch;
	const refetch = useCallback(async () => {
		await Promise.all([refresh(), refreshIcons()]);
	}, [refresh, refreshIcons]);

	const onError = useCallback((e: unknown) => {
		const message = e instanceof Error ? e.message : "request failed";
		toast.error({ title: "Notifications", description: message });
	}, []);

	const afterMutation = useCallback(
		async <T>(run: () => Promise<T>): Promise<T> => {
			try {
				const result = await run();
				await refresh();
				return result;
			} catch (e) {
				onError(e);
				throw e;
			}
		},
		[refresh, onError]
	);

	const markRead = useCallback(
		async (id: string) => {
			await afterMutation(() => markNotificationRead(id));
		},
		[afterMutation]
	);

	const archive = useCallback(
		async (id: string) => {
			await afterMutation(() => archiveNotification(id));
		},
		[afterMutation]
	);

	const unarchive = useCallback(
		async (id: string) => {
			await afterMutation(() => unarchiveNotification(id));
		},
		[afterMutation]
	);

	const ack = useCallback(
		async (id: string) => {
			setAcking(id);
			try {
				return await afterMutation(() => ackNotification(id));
			} finally {
				setAcking(null);
			}
		},
		[afterMutation]
	);

	return {
		ack,
		acking,
		archive,
		error,
		icons,
		loading,
		markRead,
		meId: HOST_SCOPED_ME,
		notifications,
		refetch,
		unarchive,
	};
}
