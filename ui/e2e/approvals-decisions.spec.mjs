import path from "node:path";
import { expect, test } from "@playwright/test";

const proof = process.env.RYU_APPS_STORE_PROOF_DIR;
if (!(proof && path.isAbsolute(proof))) {
	throw new Error("Fresh absolute RYU_APPS_STORE_PROOF_DIR required");
}
const seed = [
	{
		id: "approval-approve",
		action: { type: "tool_call", tool_id: "files.write", arguments: {} },
		title: "Update release notes",
		summary: "Update the reviewed release notes.",
		kind: "tool_call",
		risk_tags: ["writes-files"],
		status: "pending",
		created_at: "2026-09-28T10:00:00.000Z",
	},
	{
		id: "approval-reject",
		title: "Send customer update",
		summary: "Send the reviewed draft.",
		kind: "workflow_gate",
		risk_tags: ["external-send"],
		status: "pending",
		created_at: "2026-09-28T10:01:00.000Z",
	},
];
test.afterEach(async ({ page }, testInfo) => {
	await testInfo.attach("production-entry-diagnostics", {
		body: JSON.stringify(
			{
				...page.__approvalDiagnostics,
				entry: await page
					.locator("#ryu-plugin-root")
					.innerHTML()
					.catch((error) => `Unavailable: ${error.message}`),
				fixture: await page
					.evaluate(() => window.__approvalProof)
					.catch((error) => `Unavailable: ${error.message}`),
			},
			null,
			2
		),
		contentType: "application/json",
	});
});
test.beforeEach(async ({ page }) => {
	await page.addInitScript(
		({ seed }) => {
			const durable = JSON.parse(
				sessionStorage.getItem("approval-proof") ??
					JSON.stringify({ records: seed, transitions: 0 })
			);
			const fixture = {
				durable,
				calls: [],
				unsupported: [],
				toasts: [],
				refuseDecision: false,
				refuseAfterAck: false,
				refuseList: false,
				hold: false,
				releases: {},
			};
			window.__approvalProof = fixture;
			const unsupported = (method) => {
				fixture.unsupported.push(method);
				throw new Error(`Unsupported ${method}`);
			};
			const family = (methods, name) =>
				new Proxy(methods, {
					get(target, key) {
						return key in target
							? target[key]
							: () => unsupported(`${name}.${String(key)}`);
					},
				});
			const decide = async (input, status) => {
				fixture.calls.push({ method: status, input });
				if (fixture.refuseDecision) {
					fixture.refuseDecision = false;
					throw new Error("Decision refused by fixture");
				}
				if (fixture.hold) {
					await new Promise((resolve) => {
						fixture.releases[input.id] = resolve;
					});
				}
				const record = durable.records.find((item) => item.id === input.id);
				if (record?.status !== "pending") {
					throw new Error("Approval already decided or unknown");
				}
				Object.assign(record, {
					status,
					decided_at: "2026-09-28T10:10:00.000Z",
					note: input.note,
				});
				durable.transitions += 1;
				sessionStorage.setItem("approval-proof", JSON.stringify(durable));
				if (fixture.refuseAfterAck) {
					fixture.refuseAfterAck = false;
					fixture.refuseList = true;
				}
				return structuredClone(record);
			};
			window.ryu = family(
				{
					// RyuAppShell feature-detects this optional capability. This fixture does
					// not grant i18n; unknown methods remain rejected by the strict proxy.
					i18n: undefined,
					context: null,
					approvals: family(
						{
							list: async () => {
								if (fixture.refuseList) {
									fixture.refuseList = false;
									throw new Error("Readback unavailable");
								}
								return structuredClone(durable.records);
							},
							approve: (input) => decide(input, "approved"),
							reject: (input) => decide(input, "rejected"),
						},
						"approvals"
					),
					notifications: family(
						{ list: async () => [], appIcons: async () => ({}) },
						"notifications"
					),
					quests: family({ list: async () => [] }, "quests"),
					suggestions: family({ list: async () => [] }, "suggestions"),
					shell: family({ subscribeTheme: () => ({ dispose() {} }) }, "shell"),
				},
				"host"
			);
		},
		{ seed }
	);
});
async function finish(page, filename, expected) {
	await page.reload();
	await expect(page.getByText("History ·", { exact: false })).toBeVisible();
	await expect(
		page.getByRole("button", { name: "Refresh", exact: true })
	).toBeEnabled();
	expect(await page.evaluate(() => window.__approvalProof.durable)).toEqual(
		expected
	);
	expect(await page.evaluate(() => window.__approvalProof.unsupported)).toEqual(
		[]
	);
	await page.screenshot({ path: path.join(proof, filename), fullPage: true });
}
for (const scenario of ["refusal", "concurrency", "readback"]) {
	test(`${scenario}: exact decision and durable reload`, async ({ page }) => {
		const errors = [];
		const unexpectedOrigins = [];
		const failedRequests = [];
		const badResponses = [];
		const consoleErrors = [];
		page.__approvalDiagnostics = {
			errors,
			unexpectedOrigins,
			failedRequests,
			badResponses,
			consoleErrors,
		};
		page.on("pageerror", (error) => errors.push(error.message));
		page.on("console", (message) => {
			if (message.type() === "error") {
				consoleErrors.push(message.text());
			}
		});
		page.on("requestfailed", (request) =>
			failedRequests.push({
				url: request.url(),
				error: request.failure()?.errorText,
			})
		);
		page.on("response", (response) => {
			if (response.status() >= 400) {
				badResponses.push({ url: response.url(), status: response.status() });
			}
		});
		await page.route("**/*", async (route) => {
			const url = new URL(route.request().url());
			if (
				(url.protocol === "http:" || url.protocol === "https:") &&
				url.origin !== "http://127.0.0.1:5851"
			) {
				unexpectedOrigins.push(url.origin);
				await route.abort();
				return;
			}
			await route.continue();
		});
		await page.goto("/");
		const approve = page.getByRole("button", { name: "Approve", exact: true });
		await expect(approve).toHaveCount(2);
		if (scenario === "refusal") {
			await page.evaluate(() => {
				window.__approvalProof.refuseDecision = true;
			});
			await approve.first().click();
			await expect(
				page.getByText("Decision refused by fixture", { exact: true })
			).toBeVisible();
			await expect(approve.first()).toBeEnabled();
			expect(await page.evaluate(() => window.__approvalProof.durable)).toEqual(
				{ records: seed, transitions: 0 }
			);
			await approve.first().click();
			await expect(approve).toHaveCount(1);
			expect(
				await page.evaluate(() =>
					JSON.parse(JSON.stringify(window.__approvalProof.calls))
				)
			).toEqual([
				{ method: "approved", input: { id: seed[0].id } },
				{ method: "approved", input: { id: seed[0].id } },
			]);
		} else if (scenario === "readback") {
			await page.evaluate(() => {
				window.__approvalProof.refuseAfterAck = true;
			});
			await approve.first().click();
			await expect(
				page.getByText("Couldn't load approvals", { exact: true })
			).toBeVisible();
			expect(
				await page.evaluate(() => window.__approvalProof.durable.transitions)
			).toBe(1);
			await page.getByRole("button", { name: "Retry", exact: true }).click();
			await expect(
				page.getByText("Couldn't load approvals", { exact: true })
			).toHaveCount(0);
			await expect(approve).toHaveCount(1);
			expect(
				await page.evaluate(() => window.__approvalProof.calls.length)
			).toBe(1);
		} else {
			const row = (title) =>
				page
					.locator(".rounded-lg.bg-card")
					.filter({ has: page.getByText(title, { exact: true }) });
			const firstRow = row(seed[0].title);
			const secondRow = row(seed[1].title);
			const firstApprove = firstRow.getByRole("button", { name: /Approve$/ });
			const secondApprove = secondRow.getByRole("button", { name: /Approve$/ });
			await page.evaluate(() => {
				window.__approvalProof.hold = true;
			});
			await firstApprove.click();
			await secondApprove.click();
			await expect(firstApprove).toBeDisabled();
			await expect(secondApprove).toBeDisabled();
			await expect(
				firstRow.getByRole("button", { name: "Reject", exact: true })
			).toBeDisabled();
			await expect(
				secondRow.getByRole("button", { name: "Reject", exact: true })
			).toBeDisabled();
			expect(
				await page.evaluate(() => window.__approvalProof.durable.transitions)
			).toBe(0);
			expect(
				await page.evaluate(() =>
					window.__approvalProof.calls.map((call) => call.input.id)
				)
			).toEqual(seed.map((record) => record.id));
			await page.evaluate(
				(id) => window.__approvalProof.releases[id](),
				seed[1].id
			);
			await expect(
				secondRow.getByRole("button", { name: /Approve$/ })
			).toHaveCount(0);
			await expect(firstApprove).toBeDisabled();
			await expect(
				firstRow.getByRole("button", { name: "Reject", exact: true })
			).toBeDisabled();
			await page.evaluate(
				(id) => window.__approvalProof.releases[id](),
				seed[0].id
			);
			await expect(
				firstRow.getByRole("button", { name: /Approve$/ })
			).toHaveCount(0);
		}
		const expected = {
			records: seed.map((record, index) =>
				index === 0 || scenario === "concurrency"
					? {
							...record,
							status: "approved",
							decided_at: "2026-09-28T10:10:00.000Z",
						}
					: record
			),
			transitions: scenario === "concurrency" ? 2 : 1,
		};
		expect(
			await page.evaluate(() =>
				JSON.parse(sessionStorage.getItem("approval-proof"))
			)
		).toEqual(expected);
		expect(
			await page.evaluate(() => window.__approvalProof.unsupported)
		).toEqual([]);
		await finish(page, `approvals-${scenario}-readback.png`, expected);
		expect(errors).toEqual([]);
		expect(unexpectedOrigins).toEqual([]);
		expect(failedRequests).toEqual([]);
		expect(badResponses).toEqual([]);
		expect(consoleErrors).toEqual([]);
	});
}
