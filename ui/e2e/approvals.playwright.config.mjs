import { fileURLToPath } from "node:url";
import { defineConfig } from "@playwright/test";
export default defineConfig({
	testDir: fileURLToPath(new URL(".", import.meta.url)),
	testMatch: "approvals-decisions.spec.mjs",
	globalSetup: fileURLToPath(
		new URL("./approvals-global-setup.mjs", import.meta.url)
	),
	workers: 1,
	fullyParallel: false,
	use: {
		baseURL: "http://127.0.0.1:5851",
		viewport: { width: 1440, height: 960 },
		screenshot: "only-on-failure",
		trace: "retain-on-failure",
	},
	webServer: {
		command: "bun run vite --host 127.0.0.1 --port 5851 --strictPort",
		cwd: fileURLToPath(new URL("..", import.meta.url)),
		url: "http://127.0.0.1:5851",
		reuseExistingServer: false,
	},
});
