// A tiny toast shim standing in for the shell's `sileo` toast library, which
// depends on shell React context/portals unavailable in the sandbox. Renders a
// self-contained, auto-dismissing toast into a fixed corner container. Same call
// surface the ported page uses: `toast.success({ title, description })` /
// `toast.error({ title })` / `toast.info({ title, description })`.

type ToastKind = "error" | "success" | "info";

interface ToastArgs {
	title: string;
	description?: string;
}

const CONTAINER_ID = "ryu-toast-container";

function container(): HTMLElement | null {
	if (typeof document === "undefined") {
		return null;
	}
	let el = document.getElementById(CONTAINER_ID);
	if (!el) {
		el = document.createElement("div");
		el.id = CONTAINER_ID;
		el.style.cssText =
			"position:fixed;bottom:16px;right:16px;z-index:2147483647;display:flex;flex-direction:column;gap:8px;pointer-events:none;";
		document.body.appendChild(el);
	}
	return el;
}

const BORDERS: Record<ToastKind, string> = {
	error: "#ef4444",
	success: "#22c55e",
	info: "#3b82f6",
};

function show(kind: ToastKind, args: ToastArgs) {
	const root = container();
	if (!root) {
		return;
	}
	const toast = document.createElement("div");
	toast.style.cssText = `pointer-events:auto;max-width:22rem;padding:10px 12px;border-radius:10px;border:1px solid var(--border,#3f3f46);border-left:3px solid ${BORDERS[kind]};background:var(--popover,#18181b);color:var(--foreground,#fafafa);font-size:13px;box-shadow:0 8px 24px rgba(0,0,0,.35);opacity:0;transition:opacity .15s ease;`;

	const title = document.createElement("div");
	title.style.cssText = "font-weight:500;";
	title.textContent = args.title;
	toast.appendChild(title);

	if (args.description) {
		const desc = document.createElement("div");
		desc.style.cssText = "margin-top:2px;opacity:.75;font-size:12px;";
		desc.textContent = args.description;
		toast.appendChild(desc);
	}

	root.appendChild(toast);
	requestAnimationFrame(() => {
		toast.style.opacity = "1";
	});
	setTimeout(() => {
		toast.style.opacity = "0";
		setTimeout(() => toast.remove(), 200);
	}, 3200);
}

export const toast = {
	error: (args: ToastArgs) => show("error", args),
	success: (args: ToastArgs) => show("success", args),
	info: (args: ToastArgs) => show("info", args),
};
