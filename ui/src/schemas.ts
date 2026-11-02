import { z } from "zod";
import type {
	AppNotification,
	ApprovalRequest,
	ProactiveSuggestion,
	Quest,
} from "./types.ts";

export const inboxJsonSchema = z.json();
const extra = inboxJsonSchema.optional();
const optionalText = z.string().nullish();
export const pendingActionSchema = z
	.object({
		type: z.enum([
			"tool_call",
			"scheduled_job",
			"workflow_resume",
			"trigger_workflow",
			"trigger_agent",
			"activate_skill",
			"heal_rerun",
		]),
	})
	.catchall(extra);
const approvalProjection = z
	.object({
		action: pendingActionSchema.nullish(),
		agent_id: optionalText,
		conversation_id: optionalText,
		created_at: z.string(),
		decided_at: optionalText,
		error: optionalText,
		expires_at: optionalText,
		id: z.string(),
		kind: z.enum([
			"tool_call",
			"workflow_gate",
			"scheduled_run",
			"trigger_run",
			"skill_synthesis",
			"heal_fix",
		]),
		note: optionalText,
		result: optionalText,
		risk_tags: z.array(z.string()),
		source_ref: optionalText,
		status: z.enum(["pending", "approved", "rejected", "expired", "cancelled"]),
		summary: z.string(),
		title: z.string(),
	})
	.catchall(extra);
export const approvalSchema = z.custom<ApprovalRequest>(
	(value) => approvalProjection.safeParse(value).success
);
export const approvalListSchema = z.custom<ApprovalRequest[]>(
	(value) => z.array(approvalSchema).safeParse(value).success
);
const notificationProjection = z
	.object({
		ack_required: z.boolean(),
		acked: z.boolean(),
		archived_at: optionalText,
		body: optionalText,
		created_at: z.string(),
		id: z.string(),
		level: z.string(),
		node_id: optionalText,
		read_at: optionalText,
		source_app_id: optionalText,
		title: z.string(),
		user_id: z.string(),
		workflow_run_id: optionalText,
	})
	.catchall(extra);
export const notificationSchema = z.custom<AppNotification>(
	(value) => notificationProjection.safeParse(value).success
);
export const notificationListSchema = z.custom<AppNotification[]>(
	(value) => z.array(notificationSchema).safeParse(value).success
);
const questProjection = z
	.object({
		completed_at: optionalText,
		completion_condition: z.string(),
		created_at: z.string(),
		detail: optionalText,
		id: z.string(),
		last_judged_at: optionalText,
		snoozed_until: optionalText,
		status: z.enum(["open", "done", "dismissed"]),
		suggestion: z
			.object({
				confidence: z.number(),
				evidence: optionalText,
				reason: z.string(),
				suggested_at: z.string(),
			})
			.catchall(extra)
			.nullish(),
		title: z.string(),
		updated_at: z.string(),
	})
	.catchall(extra);
export const questSchema = z.custom<Quest>(
	(value) => questProjection.safeParse(value).success
);
export const questListSchema = z.custom<Quest[]>(
	(value) => z.array(questSchema).safeParse(value).success
);
type InboxMetadata = Record<string, z.output<typeof inboxJsonSchema>>;
const metadataProjection = z.record(z.string(), inboxJsonSchema);
const metadataSchema = z.custom<InboxMetadata>((value) => {
	if (!metadataProjection.safeParse(value).success) {
		return false;
	}
	return Object.getOwnPropertyNames(value).every(
		(key) =>
			inboxJsonSchema.safeParse(
				Object.getOwnPropertyDescriptor(value, key)?.value
			).success
	);
});
const proactiveProjection = z
	.object({
		body: z.string().nullable(),
		confidence: z.number(),
		created_at: z.number(),
		disposition: z.enum(["push_now", "inbox_only", "drop"]),
		id: z.string(),
		metadata: metadataSchema,
		suggestion_type: z.string(),
		title: z.string(),
	})
	.catchall(extra);
export const proactiveSchema = z.custom<ProactiveSuggestion>(
	(value) => proactiveProjection.safeParse(value).success
);
export const proactiveListSchema = z.custom<ProactiveSuggestion[]>(
	(value) => z.array(proactiveSchema).safeParse(value).success
);
export const notificationSendSchema = z
	.object({ notification_id: z.string(), target_user_id: z.string() })
	.catchall(extra);
export const notificationAckSchema = z.boolean();
export const feedbackSchema = z.boolean();
export const appIconTileSchema = z
	.object({
		background: z.string().nullable(),
		glyph: z.string(),
		name: z.string(),
	})
	.catchall(extra);
export type InboxJson = z.output<typeof inboxJsonSchema>;

export type AppIconTile = z.output<typeof appIconTileSchema>;
export type AppIconTiles = Record<string, AppIconTile>;
const iconTilesProjection = z.record(z.string(), appIconTileSchema);
export const appIconTilesSchema = z.custom<AppIconTiles>((value) => {
	if (!iconTilesProjection.safeParse(value).success) {
		return false;
	}
	return Object.getOwnPropertyNames(value).every(
		(key) =>
			appIconTileSchema.safeParse(
				Object.getOwnPropertyDescriptor(value, key)?.value
			).success
	);
});

export const inboxMutationErrorSchema = z.preprocess(
	(error) => (error instanceof Error ? error.message : "request failed"),
	z.string()
);
