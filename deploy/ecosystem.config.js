// PM2 processes for Affylitics. Every process gets the variables in /var/www/affylitics/.env.
// Start or reload:  pm2 startOrReload deploy/ecosystem.config.js --update-env && pm2 save
const fs = require("fs");

const ROOT = "/var/www/affylitics";

function loadEnv(path) {
  const env = {};
  for (const line of fs.readFileSync(path, "utf8").split("\n")) {
    // A comment needs whitespace before "#", so values may contain "#".
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=[ \t]*?(.*?)(?:\s+#.*)?\s*$/);
    if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  return env;
}

const env = loadEnv(`${ROOT}/.env`);

module.exports = {
  apps: [
    {
      name: "affylitics-api",
      cwd: `${ROOT}/services/api`,
      script: `${ROOT}/services/api/target/release/affylitics-api`,
      interpreter: "none",
      env,
      max_memory_restart: "400M",
    },
    {
      name: "affylitics-intel",
      cwd: `${ROOT}/services/intel`,
      script: `${ROOT}/services/intel/.venv/bin/uvicorn`,
      args: "app.main:app --host 127.0.0.1 --port 8200 --workers 2",
      interpreter: "none",
      env,
      max_memory_restart: "300M",
    },
    {
      name: "affylitics-worker",
      cwd: `${ROOT}/services/intel`,
      script: `${ROOT}/services/intel/.venv/bin/python`,
      args: "-m app.worker",
      interpreter: "none",
      env,
      max_memory_restart: "200M",
    },
    {
      name: "affylitics-web",
      cwd: `${ROOT}/apps/web`,
      script: "npm",
      args: "start",
      env,
      max_memory_restart: "600M",
    },
  ],
};
