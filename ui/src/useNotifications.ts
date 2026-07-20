// The data layer for the ported page's Notifications section. It exposes the SAME
// surface the shell `apps/desktop/src/hooks/useNotifications.ts` did
// (`UseNotificationsResult`), so the ported JSX calls it unchanged — but the shell's
// `@tanstack/react-query` (which cannot cross the sandbox boundary) is replaced by
// local state + the `window.ryu.notifications` bridge. The shell hook resolved the
// signed-in user id (Better Auth session) to scope the feed; here the HOST resolves
// it (the sandboxed frame has no session), so `meId` is always reported as present
// once the first list resolves. Freshness comes from a 15s poll plus an explicit
// refetch after each mutation (the shell's `invalidateQueries` equivalent, which the
// always-mounted `useNotificationEvents` SSE stream drove in the shell). Errors
// surface through the same toast the shell hook used.

import { useCallback, useEffect, useRef, useState } from "react";
import {
	ackNotification,
	listNotifications,
	markNotificationRead,
} from "./bridge.ts";
import { toast } from "./sileo.ts";
import type { AppNotification } from "./types.ts";

const REFRESH_MS = 15_000;

export interface UseNotificationsResult {
	ack: (id: string) => Promise<boolean>;
	acking: string | null;
	error: string | null;
	loading: boolean;
	meId: string | null;
	markRead: (id: string) => Promise<void>;
	notifications: AppNotification[];
}

// The host owns the session, so the sandboxed frame reports a stable non-null
// `meId` — the ported page only reads it to decide whether the feed is enabled, and
// the host always scopes the query to the signed-in user.
const HOST_SCOPED_ME = "host";

export function useNotifications(): UseNotificationsResult {
	const [notifications, setNotifications] = useState<AppNotification[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [acking, setAcking] = useState<string | null>(null);

	const aliveRef = useRef(true);

	const refresh = useCallback(async () => {
		try {
			const list = await listNotifications();
			if (aliveRef.current) {
				setNotifications(list);
				setError(null);
			}
		} catch (e) {
			if (aliveRef.current) {
				setError(e instanceof Error ? e.message : String(e));
			}
		} finally {
			if (aliveRef.current) {
				setLoading(false);
			}
		}
	}, []);

	useEffect(() => {
		aliveRef.current = true;
		refresh();
		const t = setInterval(() => refresh(), REFRESH_MS);
		return () => {
			aliveRef.current = false;
			clearInterval(t);
		};
	}, [refresh]);

	const onError = useCallback((e: unknown) => {
		const message = e instanceof Error ? e.message : "request failed";
		toast.error({ title: "Notifications", description: message });
	}, []);

	const markRead = useCallback(
		async (id: string) => {
			try {
				await markNotificationRead(id);
				await refresh();
			} catch (e) {
				onError(e);
				throw e;
			}
		},
		[refresh, onError]
	);

	const ack = useCallback(
		async (id: string) => {
			setAcking(id);
			try {
				const resumed = await ackNotification(id);
				await refresh();
				return resumed;
			} catch (e) {
				onError(e);
				throw e;
			} finally {
				setAcking(null);
			}
		},
		[refresh, onError]
	);

	return {
		ack,
		acking,
		error,
		loading,
		meId: HOST_SCOPED_ME,
		markRead,
		notifications,
	};
}
