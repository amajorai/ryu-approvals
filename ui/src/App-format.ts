import {
	activeLocale,
	formatRelativeTime,
	translate as tl,
} from "@ryu/i18n/core";
import type {
	ApprovalRequest,
	ApprovalStatus,
	ProactiveSuggestion,
} from "./types.ts";

const SECONDS_PER_MINUTE = 60;
export const REFETCH_MS = 30_000;
export const PERCENT = 100;
const MS_PER_SECOND = 1000;

export const KIND_LABEL = {
	tool_call: "Action",
	workflow_gate: "Review step",
	scheduled_run: "Scheduled task",
	trigger_run: "Automatic task",
	skill_synthesis: "Learned skill",
	heal_fix: "Auto-fix",
} satisfies Record<ApprovalRequest["kind"], string>;

// Friendly labels for the free-form suggestion category slugs Shadow emits.
const SUGGESTION_TYPE_LABEL = new Map(
	Object.entries({
		action: "Action",
		reminder: "Reminder",
		follow_up: "Follow-up",
		note: "Note",
		summary: "Summary",
	})
);

const WORD_SEPARATOR = /[_\s-]+/;

// Turn a machine slug (e.g. "follow_up") into friendly Title Case for display.
export function suggestionTypeLabel(type: string): string {
	const known = SUGGESTION_TYPE_LABEL.get(type);
	if (known) {
		return known;
	}
	const words = type.split(WORD_SEPARATOR).filter(Boolean);
	if (words.length === 0) {
		return "Suggestion";
	}
	return words
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
		.join(" ");
}

export const STATUS_VARIANT = {
	pending: "default",
	approved: "secondary",
	rejected: "destructive",
	expired: "outline",
	cancelled: "outline",
} satisfies Record<
	ApprovalStatus,
	"default" | "secondary" | "destructive" | "outline"
>;

/** "just now", "5m ago", "2h ago" in the language the Companion shows. */
export function relativeTime(
	createdAtSeconds: number,
	now = Date.now()
): string {
	const at = createdAtSeconds * MS_PER_SECOND;
	if (now - at < SECONDS_PER_MINUTE * MS_PER_SECOND) {
		return tl("just now");
	}
	return formatRelativeTime(activeLocale(), at, {
		now,
		numeric: "always",
		style: "narrow",
	});
}

// Quest suggestions carry an RFC3339 timestamp (suggested_at), not the epoch
// seconds Shadow uses, so parse to seconds before reusing relativeTime.
export function relativeTimeIso(iso: string): string {
	const ms = Date.parse(iso);
	if (Number.isNaN(ms)) {
		return "";
	}
	return relativeTime(ms / MS_PER_SECOND);
}

export function prefillText(suggestion: ProactiveSuggestion): string {
	const body = suggestion.body?.trim() ?? "";
	return body.length > 0 ? body : suggestion.title;
}
