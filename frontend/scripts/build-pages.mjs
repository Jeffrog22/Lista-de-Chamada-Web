import { execSync } from "node:child_process";

const profile = String(process.argv[2] || "").trim().toLowerCase();

const profiles = {
  bela: {
    mode: "bela-vista",
    env: {
      VITE_ENV_NAME: "bela-vista-mirror",
      VITE_UNIT_NAME: "Piscina Bela Vista",
    },
  },
  sao: {
    mode: "sao-matheus",
    env: {
      VITE_ENV_NAME: "piloto-sao-matheus",
      VITE_UNIT_NAME: "Sao Matheus",
    },
  },
  vila: {
    mode: "vila",
    env: {
      VITE_ENV_NAME: "piloto-vila-joao-xxiii",
      VITE_UNIT_NAME: "Vila Joao XXIII",
    },
  },
};

if (!profiles[profile]) {
  const options = Object.keys(profiles).join(", ");
  throw new Error(`Perfil invalido: ${profile || "(vazio)"}. Use: ${options}`);
}

const { mode, env } = profiles[profile];
const sharedEnv = {
  ...process.env,
  ...env,
};

execSync("npx tsc -b", { stdio: "inherit", env: sharedEnv });
execSync(`npx vite build --mode ${mode}`, { stdio: "inherit", env: sharedEnv });
