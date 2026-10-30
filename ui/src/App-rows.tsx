import {
	Cancel01Icon,
	CheckmarkCircle02Icon,
	Clock01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useLiteralMessages } from "@ryu/i18n/react";
import { Badge } from "@ryu/ui/components/badge.tsx";
import { Button } from "@ryu/ui/components/button.tsx";
import { Spinner } from "@ryu/ui/components/spinner.tsx";
import { useState } from "react";
import { KIND_LABEL, relativeTimeIso, STATUS_VARIANT } from "./App-format.ts";
import type { ApprovalRequest, Quest } from "./types.ts";
import type { useApprovals } from "./useApprovals.ts";
import type { useQuests } from "./useQuests.ts";

export function PendingRow({
	request,
	approvals,
}: {
	request: ApprovalRequest;
	approvals: ReturnType<typeof useApprovals>;
}) {
	const busy = approvals.deciding.has(request.id);
	return (
		<div className="rounded-lg bg-card">
			<div className="flex items-start justify-between gap-3 p-3">
				<div className="min-w-0">
					<div className="flex items-center gap-2">
						<p className="truncate font-medium text-sm" title={request.title}>
							{request.title}
						</p>
						<Badge variant="secondary">{KIND_LABEL[request.kind]}</Badge>
					</div>
					<p className="mt-1 text-muted-foreground text-xs">
						{request.summary}
					</p>
					{request.risk_tags.length > 0 ? (
						<div className="mt-1.5 flex flex-wrap gap-1">
							{request.risk_tags.map((tag) => (
								<Badge key={tag} variant="secondary">
									{tag}
								</Badge>
							))}
						</div>
					) : null}
				</div>
				<div className="flex shrink-0 items-center gap-1">
					<Button
						disabled={busy}
						onClick={() => {
							void approvals.approve(request.id).catch(() => undefined);
						}}
						size="sm"
					>
						{busy ? (
							<Spinner className="size-4" />
						) : (
							<HugeiconsIcon className="size-4" icon={CheckmarkCircle02Icon} />
						)}
						Approve
					</Button>
					<Button
						disabled={busy}
						onClick={() => {
							void approvals.reject(request.id).catch(() => undefined);
						}}
						size="sm"
						variant="ghost"
					>
						<HugeiconsIcon className="size-4" icon={Cancel01Icon} />
						Reject
					</Button>
				</div>
			</div>
		</div>
	);
}

// A quest the engine thinks is done, awaiting the user's yes/no. "Mark done"
// accepts the suggestion (completes the quest); "Not yet" dismisses it (the
// engine snoozes so it doesn't immediately re-suggest). Both mutate through the
// shared useQuests hook, whose success refetches the quest list so the row
// disappears; the 15s poll keeps the list live regardless.
export function TaskRow({
	quest,
	quests,
}: {
	quest: Quest;
	quests: ReturnType<typeof useQuests>;
}) {
	const [busy, setBusy] = useState<"accept" | "dismiss" | null>(null);
	const tl = useLiteralMessages();
	const suggestion = quest.suggestion;
	if (!suggestion) {
		return null;
	}

	const act = (kind: "accept" | "dismiss") => {
		setBusy(kind);
		const done =
			kind === "accept"
				? quests.acceptSuggestion(quest.id)
				: quests.dismissSuggestion(quest.id);
		done
			.catch(() => undefined)
			.finally(() => {
				setBusy(null);
			});
	};

	return (
		<div className="rounded-lg bg-card">
			<div className="flex items-start justify-between gap-3 p-3">
				<div className="min-w-0">
					<div className="flex items-center gap-2">
						<p className="truncate font-medium text-sm" title={quest.title}>
							{quest.title}
						</p>
						<Badge variant="secondary">Task</Badge>
					</div>
					<p className="mt-1 text-muted-foreground text-xs">
						{suggestion.reason}
					</p>
					<div className="mt-1.5 flex items-center gap-2 text-muted-foreground text-xs">
						<span className="rounded-full bg-muted px-2 py-0.5 font-medium">
							{tl("{confidence}% sure", { confidence: suggestion.confidence })}
						</span>
						<span>{relativeTimeIso(suggestion.suggested_at)}</span>
					</div>
				</div>
				<div className="flex shrink-0 items-center gap-1">
					<Button
						disabled={busy !== null}
						onClick={() => act("accept")}
						size="sm"
					>
						{busy === "accept" ? (
							<Spinner className="size-4" />
						) : (
							<HugeiconsIcon className="size-4" icon={CheckmarkCircle02Icon} />
						)}
						Mark done
					</Button>
					<Button
						disabled={busy !== null}
						onClick={() => act("dismiss")}
						size="sm"
						variant="ghost"
					>
						{busy === "dismiss" ? (
							<Spinner className="size-4" />
						) : (
							<HugeiconsIcon className="size-4" icon={Cancel01Icon} />
						)}
						Not yet
					</Button>
				</div>
			</div>
		</div>
	);
}

export function HistoryRow({ request }: { request: ApprovalRequest }) {
	const tl = useLiteralMessages();
	const icon =
		request.status === "approved" ? CheckmarkCircle02Icon : Cancel01Icon;
	return (
		<div className="flex items-center justify-between gap-3 rounded-lg bg-card/50 p-3">
			<div className="flex min-w-0 items-center gap-2">
				<HugeiconsIcon
					className="size-4 shrink-0 text-muted-foreground"
					icon={request.status === "expired" ? Clock01Icon : icon}
				/>
				<div className="min-w-0">
					<p
						className="truncate text-muted-foreground text-sm"
						title={request.title}
					>
						{request.title}
					</p>
					{request.note ? (
						<p
							className="truncate text-muted-foreground text-xs"
							title={request.note}
						>
							{request.note}
						</p>
					) : null}
					{request.error ? (
						<p className="truncate text-status-destructive text-xs">
							{tl("Failed: {error}", { error: request.error })}
						</p>
					) : null}
				</div>
			</div>
			<Badge variant={STATUS_VARIANT[request.status]}>{request.status}</Badge>
		</div>
	);
}
