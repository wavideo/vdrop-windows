import { spawn } from "node:child_process";

const rendererPort = 4173;
const rendererUrl = `http://127.0.0.1:${rendererPort}`;

function spawnProcess(command, args, options = {}) {
  const child = spawn(command, args, {
    stdio: "inherit",
    shell: false,
    ...options,
  });
  child.on("exit", code => {
    if (code && code !== 0) {
      process.exitCode = code;
    }
  });
  return child;
}

async function waitForRenderer(url, timeoutMs = 30000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // retry
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
const electronCmd = process.platform === "win32" ? "node_modules/.bin/electron.cmd" : "node_modules/.bin/electron";

const renderer = spawnProcess(npmCmd, ["run", "dev:web"], { env: process.env });

process.on("exit", () => {
  renderer.kill();
});

await waitForRenderer(rendererUrl);

const electron = spawnProcess(electronCmd, ["."], {
  env: {
    ...process.env,
    VITE_DEV_SERVER_URL: rendererUrl,
  },
});

process.on("SIGINT", () => {
  renderer.kill("SIGINT");
  electron.kill("SIGINT");
  process.exit(0);
});

process.on("SIGTERM", () => {
  renderer.kill("SIGTERM");
  electron.kill("SIGTERM");
  process.exit(0);
});

electron.on("exit", code => {
  renderer.kill();
  process.exit(code ?? 0);
});

