// The inbox model — ported verbatim from the desktop clients the host bridge
// reuses: `apps/desktop/src/lib/api/approvals.ts`, `.../notifications.ts`,
// `.../quests.ts`, and `.../shadow.ts` (all snake_case, mirroring Core's / Shadow's
// serde shapes). The host closures call those very desktop clients and forward the
// results unchanged over the bridge, so the app reads exactly what the desktop page
// read.

// --- Approvals (`/api/approvals/*`) ---

export type ApprovalKind =
	| "tool_call"
	| "workflow_gate"
	| "scheduled_run"
	| "trigger_run"
	| "skill_synthesis"
	| "heal_fix";

export type ApprovalStatus =
	| "pending"
	| "approved"
	| "rejected"
	| "expired"
	| "cancelled";

export interface PendingAction {
	type:
		| "scheduled_job"
		| "workflow_resume"
		| "trigger_workflow"
		| "trigger_agent"
		| "activate_skill"
		| "heal_rerun";
	[key: string]: unknown;
}

export interface ApprovalRequest {
	action?: PendingAction | null;
	agent_id?: string | null;
	conversation_id?: string | null;
	created_at: string;
	decided_at?: string | null;
	error?: string | null;
	expires_at?: string | null;
	id: string;
	kind: ApprovalKind;
	note?: string | null;
	result?: string | null;
	risk_tags: string[];
	source_ref?: string | null;
	status: ApprovalStatus;
	summary: string;
	title: string;
}

// --- Notifications (`/api/notifications/*`) ---

export interface AppNotification {
	acked: boolean;
	ack_required: boolean;
	body?: string | null;
	created_at: string;
	id: string;
	level: string;
	node_id?: string | null;
	read_at?: string | null;
	title: string;
	user_id: string;
	workflow_run_id?: string | null;
}

// --- Quests (`/api/quests/*`) — only the subset the task check-off section reads. ---

export type QuestStatus = "open" | "done" | "dismissed";

export interface Suggestion {
	confidence: number;
	evidence?: string | null;
	reason: string;
	suggested_at: string;
}

export interface Quest {
	completed_at?: string | null;
	completion_condition: string;
	created_at: string;
	detail?: string | null;
	id: string;
	last_judged_at?: string | null;
	snoozed_until?: string | null;
	status: QuestStatus;
	suggestion?: Suggestion | null;
	title: string;
	updated_at: string;
}

// --- Shadow proactive suggestions (`GET /proactive`, `POST /api/feedback`). ---

export type SuggestionDisposition = "push_now" | "inbox_only" | "drop";

export interface ProactiveSuggestion {
	body: string | null;
	confidence: number;
	created_at: number;
	disposition: SuggestionDisposition;
	id: string;
	metadata: Record<string, unknown>;
	suggestion_type: string;
	title: string;
}

/** Feedback signal posted back to Shadow when a suggestion is opened or dismissed. */
export interface FeedbackRequest {
	kind: "thumbs_up" | "thumbs_down" | "dismiss";
	suggestion_type: string;
}
