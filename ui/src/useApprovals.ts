// The data layer for the ported page's Approvals section. It exposes the SAME
// surface the shell `apps/desktop/src/hooks/useApprovals.ts` did
// (`UseApprovalsResult`, plus a `refetch` for the Retry button that replaces the
// shell's `queryClient.invalidateQueries(["approvals"])`), so the ported JSX calls
// it unchanged — but the shell's `@tanstack/react-query` (which cannot cross the
// sandbox boundary) is replaced by the shared query hook + the `window.ryu.approvals` bridge.
// Freshness comes from a 15s poll plus an explicit refetch after every mutation (the
// shell's `invalidateQueries` equivalent). Errors surface through the same toast the
// shell hook used (`sileo.error` → host toast). Liveness the shell got from the
// always-mounted `useApprovalEvents` SSE stream is approximated here by the poll (the
// sandboxed frame holds no socket).

import { sandboxToast as toast } from "@ryu/ui/components/sandbox-toast.ts";
import { useQuery } from "@ryu/ui/hooks/use-query.ts";
import { useCallback, useState } from "react";
import { approveApproval, listApprovals, rejectApproval } from "./bridge.ts";
import type { ApprovalRequest } from "./types.ts";

const REFRESH_MS = 15_000;

export interface UseApprovalsResult {
	approvals: ApprovalRequest[];
	approve: (id: string, note?: string) => Promise<ApprovalRequest>;
	deciding: string | null;
	error: string | null;
	loading: boolean;
	refetch: () => Promise<void>;
	reject: (id: string, note?: string) => Promise<ApprovalRequest>;
}

export function useApprovals(): UseApprovalsResult {
	const [deciding, setDeciding] = useState<string | null>(null);
	const query = useQuery({
		queryKey: ["inbox-approvals"],
		queryFn: listApprovals,
		refetchInterval: REFRESH_MS,
	});
	const approvals = query.data ?? [];
	const loading = query.isLoading;
	const error = query.isError
		? query.error instanceof Error
			? query.error.message
			: String(query.error)
		: null;
	const refresh = query.refetch;
	const refetch = refresh;

	const onError = useCallback((e: unknown) => {
		const message = e instanceof Error ? e.message : "request failed";
		toast.error({ title: "Approvals", description: message });
	}, []);

	const decide = useCallback(
		async (
			id: string,
			fn: () => Promise<ApprovalRequest>
		): Promise<ApprovalRequest> => {
			setDeciding(id);
			try {
				const result = await fn();
				await refresh();
				return result;
			} catch (e) {
				onError(e);
				throw e;
			} finally {
				setDeciding(null);
			}
		},
		[refresh, onError]
	);

	const approve = useCallback(
		(id: string, note?: string) => decide(id, () => approveApproval(id, note)),
		[decide]
	);

	const reject = useCallback(
		(id: string, note?: string) => decide(id, () => rejectApproval(id, note)),
		[decide]
	);

	return { approvals, approve, deciding, error, loading, refetch, reject };
}
