// The Inbox (Approvals) companion root — the port of the desktop
// `pages/InboxPage.tsx`. A unified inbox: everything that wants a decision from the
// user, in one place — pending HITL approvals (approve/reject), per-user
// notifications (read + the workflow-resume ack gate), task completions the quest
// engine thinks are done (a yes/no check-off), and the softer proactive suggestions
// Shadow surfaces from screen activity.
//
// The desktop page composed four react-query-backed hooks (`useApprovals`,
// `useNotifications`, `useQuests`) + a `useQuery` over Shadow's proactive inbox, kept
// live by always-mounted SSE streams. Here the same four reads go over the
// `window.ryu` bridge (grants `approvals:crud` + `quests:crud`), each polling every
// 15s in the background plus a refetch after every mutation (the sandboxed frame
// holds no socket). The component tree below is a verbatim port; only the data layer
// (node/target/react-query → bridge) and the chat-open navigation (host verb)
// changed.

import { Shield01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useLiteralMessages } from "@ryu/i18n/react";
import { Badge } from "@ryu/ui/components/badge.tsx";
import { Button } from "@ryu/ui/components/button.tsx";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@ryu/ui/components/empty.tsx";
import { PullToRefresh } from "@ryu/ui/components/pull-to-refresh.tsx";
import { Spinner } from "@ryu/ui/components/spinner.tsx";
import { useQuery } from "@ryu/ui/hooks/use-query.ts";
import {
	filterNotifications,
	isArchivedNotification,
	type NotificationFilter,
	NotificationFilterTabs,
	notificationFilterLabel,
} from "@ryu/ui/lib/notification-filters.tsx";
import { useCallback, useState } from "react";
import {
	PERCENT,
	prefillText,
	REFETCH_MS,
	relativeTime,
	suggestionTypeLabel,
} from "./App-format.ts";
import { NotificationRow } from "./App-notification-row.tsx";
import { HistoryRow, PendingRow, TaskRow } from "./App-rows.tsx";
import { getProactiveInbox, openInChat, postFeedback } from "./bridge.ts";
import type { ProactiveSuggestion } from "./types.ts";
import { useApprovals } from "./useApprovals.ts";
import { useNotifications } from "./useNotifications.ts";
import { useQuests } from "./useQuests.ts";

export function App() {
	const tl = useLiteralMessages();
	const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());
	const [notificationFilter, setNotificationFilter] =
		useState<NotificationFilter>("all");

	const approvals = useApprovals();
	const pending = approvals.approvals.filter((a) => a.status === "pending");
	const history = approvals.approvals.filter((a) => a.status !== "pending");

	const notifications = useNotifications();
	const filteredNotifications = filterNotifications(
		notifications.notifications,
		notificationFilter
	);
	const unreadNotifications = notifications.notifications.filter(
		(n) => !(n.read_at || isArchivedNotification(n))
	).length;

	const quests = useQuests();
	// Only open quests the engine flagged as maybe-done (a pending check-off).
	const taskSuggestions = quests.quests.filter(
		(q) => q.status === "open" && q.suggestion
	);

	const { data, isLoading, refetch, isFetching } = useQuery({
		queryKey: ["proactive-inbox"],
		queryFn: () => getProactiveInbox(),
		refetchInterval: REFETCH_MS,
	});

	const handleOpen = useCallback((suggestion: ProactiveSuggestion) => {
		postFeedback({
			kind: "thumbs_up",
			suggestion_type: suggestion.suggestion_type,
		}).catch(() => undefined);
		openInChat(prefillText(suggestion)).catch(() => undefined);
	}, []);

	const handleDismiss = useCallback((suggestion: ProactiveSuggestion) => {
		postFeedback({
			kind: "dismiss",
			suggestion_type: suggestion.suggestion_type,
		}).catch(() => undefined);
		setDismissed((prev) => {
			const next = new Set(prev);
			next.add(suggestion.id);
			return next;
		});
	}, []);

	const handleRetryApprovals = useCallback(() => {
		approvals.refetch();
	}, [approvals]);

	const visible = (data ?? []).filter((s) => !dismissed.has(s.id));
	const approvalsFailed = !approvals.loading && approvals.error !== null;
	const hasApprovals =
		!approvals.loading && (pending.length > 0 || history.length > 0);
	const hasTasks = !quests.loading && taskSuggestions.length > 0;
	const hasSuggestions = !isLoading && visible.length > 0;
	const hasAnyNotifications =
		!notifications.loading && notifications.notifications.length > 0;
	const hasNotifications =
		!notifications.loading && filteredNotifications.length > 0;
	// A failed approvals load must not read as an empty inbox, so keep the empty
	// state suppressed while there is an unresolved error to surface.
	const allEmpty =
		notificationFilter === "all" &&
		!(
			approvals.loading ||
			quests.loading ||
			isLoading ||
			notifications.loading ||
			hasApprovals ||
			hasTasks ||
			hasSuggestions ||
			hasAnyNotifications ||
			approvalsFailed
		);

	const [refreshing, setRefreshing] = useState(false);
	const refreshApprovals = approvals.refetch;
	const refreshQuests = quests.refetch;
	const refreshNotifications = notifications.refetch;
	const refreshAll = useCallback(async () => {
		setRefreshing(true);
		try {
			await Promise.all([
				refreshApprovals(),
				refreshQuests(),
				refreshNotifications(),
				refetch(),
			]);
		} finally {
			setRefreshing(false);
		}
	}, [refreshApprovals, refreshQuests, refreshNotifications, refetch]);

	return (
		<PullToRefresh className="h-full" onRefresh={refreshAll}>
			<div className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6">
				<header className="flex items-center justify-between gap-3">
					<div>
						<h1 className="font-medium text-xl">Inbox</h1>
						<p className="text-muted-foreground text-sm">
							Approvals, finished tasks, and suggestions from your activity.
						</p>
					</div>
					<Button
						disabled={refreshing || isFetching}
						onClick={() => {
							void refreshAll();
						}}
						size="sm"
						variant="outline"
					>
						{refreshing || isFetching ? "Refreshing…" : "Refresh"}
					</Button>
				</header>

				{allEmpty ? (
					<div className="py-10">
						<Empty>
							<EmptyHeader>
								<EmptyMedia variant="icon">
									<HugeiconsIcon className="size-6" icon={Shield01Icon} />
								</EmptyMedia>
								<EmptyTitle>Inbox is empty</EmptyTitle>
								<EmptyDescription>
									Approvals, finished tasks, and proactive suggestions from Ryu
									will appear here.
								</EmptyDescription>
							</EmptyHeader>
						</Empty>
					</div>
				) : null}

				{/* Approvals section */}
				{approvals.loading || hasApprovals || approvalsFailed ? (
					<section className="flex flex-col gap-3">
						<div className="flex items-center justify-between">
							<h2 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
								Approvals
							</h2>
							{pending.length > 0 ? (
								<Badge variant="default">
									{tl("{count} pending", { count: String(pending.length) })}
								</Badge>
							) : null}
						</div>

						{approvals.loading ? (
							<div className="flex justify-center py-4">
								<Spinner className="size-5" />
							</div>
						) : null}

						{approvalsFailed ? (
							<div className="rounded-lg bg-card p-4">
								<p className="font-medium text-sm">Couldn't load approvals</p>
								<p className="mt-1 text-muted-foreground text-sm">
									Something went wrong reaching your approvals. Check your
									connection and try again.
								</p>
								<Button
									className="mt-3"
									onClick={handleRetryApprovals}
									size="sm"
									variant="outline"
								>
									Retry
								</Button>
							</div>
						) : null}

						{pending.length > 0 ? (
							<div className="flex flex-col gap-2">
								{pending.map((a) => (
									<PendingRow approvals={approvals} key={a.id} request={a} />
								))}
							</div>
						) : null}

						{history.length > 0 ? (
							<div className="flex flex-col gap-2">
								<p className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
									{tl("History · {count}", { count: String(history.length) })}
								</p>
								{history.map((a) => (
									<HistoryRow key={a.id} request={a} />
								))}
							</div>
						) : null}
					</section>
				) : null}

				{/* Notifications section (per-user pings + HITL notify gates) */}
				{notifications.loading ||
				hasAnyNotifications ||
				notificationFilter !== "all" ? (
					<section className="flex flex-col gap-3">
						<div className="flex flex-col gap-3">
							<div className="flex items-center justify-between gap-3">
								<h2 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
									Notifications
								</h2>
								{unreadNotifications > 0 ? (
									<Badge variant="default">
										{tl("{count} unread", {
											count: String(unreadNotifications),
										})}
									</Badge>
								) : null}
							</div>
							<NotificationFilterTabs
								ariaLabel="Filter notifications"
								className="w-full"
								items={notifications.notifications}
								onValueChange={setNotificationFilter}
								value={notificationFilter}
							/>
						</div>

						{notifications.loading ? (
							<div className="flex justify-center py-4">
								<Spinner className="size-5" />
							</div>
						) : null}

						{hasNotifications ? (
							<div className="flex flex-col gap-2">
								{filteredNotifications.map((n) => (
									<NotificationRow
										archived={isArchivedNotification(n)}
										key={n.id}
										notification={n}
										notifications={notifications}
									/>
								))}
							</div>
						) : (
							<div className="rounded-lg bg-card/50 p-4 text-center text-muted-foreground text-sm">
								{notificationFilter === "archived"
									? "Nothing archived yet — rows you archive live here."
									: notificationFilter === "unread"
										? "You’re all caught up."
										: tl("No {filter} notifications.", {
												filter:
													notificationFilterLabel(
														notificationFilter
													).toLowerCase(),
											})}
							</div>
						)}
					</section>
				) : null}

				{/* Task completions section (quest suggestions awaiting a check-off) */}
				{hasTasks ? (
					<section className="flex flex-col gap-3">
						<div className="flex items-center justify-between">
							<h2 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
								Tasks
							</h2>
							<Badge variant="default">
								{tl("{count} to review", {
									count: String(taskSuggestions.length),
								})}
							</Badge>
						</div>
						<div className="flex flex-col gap-2">
							{taskSuggestions.map((q) => (
								<TaskRow key={q.id} quest={q} quests={quests} />
							))}
						</div>
					</section>
				) : null}

				{/* Suggestions section */}
				{isLoading || hasSuggestions ? (
					<section className="flex flex-col gap-3">
						<h2 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
							Suggestions
						</h2>

						{isLoading ? (
							<p className="text-muted-foreground text-sm">Loading…</p>
						) : null}

						{hasSuggestions ? (
							<ul className="flex flex-col gap-3">
								{visible.map((suggestion) => (
									<li className="rounded-xl bg-card p-4" key={suggestion.id}>
										<p className="font-medium text-sm">{suggestion.title}</p>
										{suggestion.body ? (
											<p className="mt-1 text-muted-foreground text-sm">
												{suggestion.body}
											</p>
										) : null}
										<div className="mt-2 flex items-center gap-2 text-muted-foreground text-xs">
											<span className="rounded-full bg-muted px-2 py-0.5 font-medium">
												{suggestionTypeLabel(suggestion.suggestion_type)}
											</span>
											<span>{relativeTime(suggestion.created_at)}</span>
											<span>
												{tl("{percent}% match", {
													percent: Math.round(suggestion.confidence * PERCENT),
												})}
											</span>
										</div>
										<div className="mt-3 flex items-center justify-end gap-2">
											<Button
												onClick={() => handleDismiss(suggestion)}
												size="sm"
												variant="ghost"
											>
												Dismiss
											</Button>
											<Button onClick={() => handleOpen(suggestion)} size="sm">
												Open in chat
											</Button>
										</div>
									</li>
								))}
							</ul>
						) : null}
					</section>
				) : null}
			</div>
		</PullToRefresh>
	);
}
