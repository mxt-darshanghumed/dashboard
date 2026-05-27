import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const execFileP = promisify(execFile);

export interface LocalWorkInfo {
  repoName: string;
  repoPath: string;
  branch: string;
  baseBranch: string;
  commitsAhead: number;
  isCurrentBranch: boolean;
  committedDiffStat: string;
  committedDiff: string;
  uncommittedStatus: string;
  uncommittedDiff: string;
}

const DEFAULT_BASES = ["develop", "main", "master"];
const MAX_DIFF_CHARS = 5000;

let cachedRepos: string[] | null = null;

function getReposRoot(): string | null {
  const explicit = process.env.LOCAL_REPOS_ROOT;
  if (explicit) return explicit;
  const home = process.env.USERPROFILE ?? process.env.HOME;
  if (!home) return null;
  const candidate = path.join(home, "IdeaProjects");
  return candidate;
}

async function discoverRepos(): Promise<string[]> {
  if (cachedRepos) return cachedRepos;
  const root = getReposRoot();
  if (!root || !existsSync(root)) {
    console.log(`[localGit] repos root not found: ${root ?? "(unset)"}`);
    cachedRepos = [];
    return [];
  }
  try {
    const entries = await readdir(root, { withFileTypes: true });
    const repos: string[] = [];
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      const full = path.join(root, e.name);
      if (existsSync(path.join(full, ".git"))) repos.push(full);
    }
    cachedRepos = repos;
    console.log(`[localGit] discovered ${repos.length} git repos under ${root}`);
    return repos;
  } catch (err) {
    console.log(`[localGit] discovery failed: ${err}`);
    cachedRepos = [];
    return [];
  }
}

export function clearLocalReposCache() {
  cachedRepos = null;
}

async function git(repoPath: string, args: string[]): Promise<string> {
  try {
    const { stdout } = await execFileP("git", ["-C", repoPath, ...args], {
      maxBuffer: 16 * 1024 * 1024,
      windowsHide: true,
    });
    return stdout;
  } catch {
    return "";
  }
}

async function findBranchForTicket(repoPath: string, ticketKey: string): Promise<string | null> {
  const out = await git(repoPath, ["branch", "--list", `*${ticketKey}*`]);
  const lines = out.split("\n").map((l) => l.replace(/^[\*\s]+/, "").trim()).filter(Boolean);
  if (lines[0]) return lines[0];

  const remoteOut = await git(repoPath, ["branch", "-r", "--list", `*${ticketKey}*`]);
  const remoteLines = remoteOut.split("\n").map((l) => l.trim()).filter(Boolean);
  return remoteLines[0] ?? null;
}

async function detectBaseBranch(repoPath: string): Promise<string> {
  for (const candidate of DEFAULT_BASES) {
    const out = await git(repoPath, ["rev-parse", "--verify", "--quiet", candidate]);
    if (out.trim()) return candidate;
  }
  return DEFAULT_BASES[0];
}

export async function findLocalWorkForTicket(ticketKey: string): Promise<LocalWorkInfo[]> {
  const repos = await discoverRepos();
  if (repos.length === 0) return [];

  const all = await Promise.all(
    repos.map(async (repoPath): Promise<LocalWorkInfo | null> => {
      const branch = await findBranchForTicket(repoPath, ticketKey);
      if (!branch) return null;

      const baseBranch = await detectBaseBranch(repoPath);

      const [aheadStr, committedDiffStat, committedDiffRaw, currentBranchRaw] = await Promise.all([
        git(repoPath, ["rev-list", "--count", `${baseBranch}..${branch}`]),
        git(repoPath, ["diff", "--stat", `${baseBranch}...${branch}`]),
        git(repoPath, ["diff", `${baseBranch}...${branch}`, "--no-color"]),
        git(repoPath, ["rev-parse", "--abbrev-ref", "HEAD"]),
      ]);

      const isCurrentBranch = currentBranchRaw.trim() === branch;
      let uncommittedStatus = "";
      let uncommittedDiff = "";
      if (isCurrentBranch) {
        uncommittedStatus = await git(repoPath, ["status", "--short"]);
        uncommittedDiff = await git(repoPath, ["diff", "HEAD", "--no-color"]);
      }

      return {
        repoName: path.basename(repoPath),
        repoPath,
        branch,
        baseBranch,
        commitsAhead: parseInt(aheadStr.trim(), 10) || 0,
        isCurrentBranch,
        committedDiffStat: committedDiffStat.slice(0, 2500),
        committedDiff: committedDiffRaw.slice(0, MAX_DIFF_CHARS),
        uncommittedStatus,
        uncommittedDiff: uncommittedDiff.slice(0, MAX_DIFF_CHARS),
      };
    })
  );

  const results = all.filter((x): x is LocalWorkInfo => x !== null);
  if (results.length > 0) {
    console.log(
      `[localGit] ${ticketKey}: ${results.map((r) => `${r.repoName}@${r.branch} +${r.commitsAhead}${r.uncommittedStatus ? " uncommitted" : ""}`).join(", ")}`
    );
  } else {
    console.log(`[localGit] ${ticketKey}: no local branch found across ${repos.length} repos`);
  }
  return results;
}
