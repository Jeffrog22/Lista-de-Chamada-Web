import { execSync } from "node:child_process";

const profile = String(process.argv[2] || "").trim().toLowerCase();

const profiles = {
  bela: {
    mode: "bela-vista",
    env: {
      VITE_ENV_NAME: "bela-vista",
      VITE_UNIT_NAME: "Bela Vista",
      VITE_API_URL: "https://lista-de-chamada-web.onrender.com",
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

if (profile !== "bela" && String(process.env.ALLOW_NON_BELA_DEPLOY || "").trim() !== "1") {
  throw new Error(
    "Deploy bloqueado para este perfil. Sao Matheus/Vila so podem ser publicados apos liberacao explicita (defina ALLOW_NON_BELA_DEPLOY=1)."
  );
}

const { mode, env } = profiles[profile];
const sharedEnv = {
  ...process.env,
  ...env,
};

execSync("npx tsc -b", { stdio: "inherit", env: sharedEnv });
execSync(`npx vite build --mode ${mode}`, { stdio: "inherit", env: sharedEnv });
