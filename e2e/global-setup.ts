import { execSync } from "node:child_process";

// Reset the local seed data so every run starts from the same state.
export default function globalSetup() {
  execSync("npm run seed", { stdio: "inherit" });
}
