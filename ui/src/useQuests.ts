// The data layer for the ported page's Tasks section (quest suggestion check-offs).
// The Inbox only surfaces open quests carrying a pending suggestion and lets the user
// accept (mark done) or dismiss (not yet) them, so this is a MINIMAL slice of the
// shell `apps/desktop/src/hooks/useQuests.ts` — just the list + the two suggestion
// verbs the Tasks rows call. It reuses the existing `quests:crud` bridge family (the
// Quests app already ships those verbs) rather than the shell's `@tanstack/react-query`
// (which cannot cross the sandbox boundary): local state + the `window.ryu.quests`
// bridge, a 15s poll, and a refetch after each mutation (the shell's
// `invalidateQueries` equivalent, kept live in the shell by `useQuestEvents`). Errors
// surface through the same toast the shell hook used.

import { useCallback, useEffect, useRef, useState } from "react";
import {
	acceptSuggestion as apiAcceptSuggestion,
	dismissSuggestion as apiDismissSuggestion,
	listQuests,
} from "./bridge.ts";
import { toast } from "./sileo.ts";
import type { Quest } from "./types.ts";

const REFRESH_MS = 15_000;

export interface UseQuestsResult {
	acceptSuggestion: (id: string) => Promise<Quest>;
	dismissSuggestion: (id: string) => Promise<Quest>;
	loading: boolean;
	quests: Quest[];
}

export function useQuests(): UseQuestsResult {
	const [quests, setQuests] = useState<Quest[]>([]);
	const [loading, setLoading] = useState(true);

	const aliveRef = useRef(true);

	const refresh = useCallback(async () => {
		try {
			const list = await listQuests();
			if (aliveRef.current) {
				setQuests(list);
			}
		} catch {
			// A failed quest poll leaves the last-known list; the toast below covers
			// mutation failures, and a transient list failure should not clear the UI.
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
		toast.error({ title: "Tasks", description: message });
	}, []);

	const mutate = useCallback(
		async (fn: () => Promise<Quest>) => {
			try {
				const q = await fn();
				await refresh();
				return q;
			} catch (e) {
				onError(e);
				throw e;
			}
		},
		[refresh, onError]
	);

	const acceptSuggestion = useCallback(
		(id: string) => mutate(() => apiAcceptSuggestion(id)),
		[mutate]
	);
	const dismissSuggestion = useCallback(
		(id: string) => mutate(() => apiDismissSuggestion(id)),
		[mutate]
	);

	return { acceptSuggestion, dismissSuggestion, loading, quests };
}
