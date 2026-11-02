import { mkdir } from "node:fs/promises";
import path from "node:path";

export default async function setup() {
	const proof = process.env.RYU_APPS_STORE_PROOF_DIR;
	if (!(proof && path.isAbsolute(proof))) {
		throw new Error("Fresh absolute RYU_APPS_STORE_PROOF_DIR required");
	}
	// Runs once per invocation, not again when Playwright restarts a failed worker.
	await mkdir(proof);
}
