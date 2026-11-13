import type { Report } from "@/lib/types";
import { getTool } from "@/lib/tools";

/**
 * LinuxLens — explain Linux commands. Educational only; everything runs
 * locally with no shell access to any machine.
 */

export interface CommandEntry {
  name: string;
  synopsis: string;
  summary: string;
  category: string;
  examples: Array<{ cmd: string; what: string }>;
}

export const CATEGORIES = [
  "filesystem", "permissions", "processes", "networking",
  "users", "services", "shell", "storage", "logs",
] as const;

export type Category = (typeof CATEGORIES)[number];

export const COMMANDS: CommandEntry[] = [
  // filesystem
  { name: "ls", synopsis: "ls [-lah] [path]", summary: "List directory contents.", category: "filesystem", examples: [
    { cmd: "ls -la", what: "all files (incl. hidden) in long format with sizes" },
    { cmd: "ls -lhS", what: "human-readable sizes, largest first" },
  ] },
  { name: "cd", synopsis: "cd [dir]", summary: "Change the shell's working directory.", category: "filesystem", examples: [
    { cmd: "cd ~", what: "go to your home directory" },
    { cmd: "cd -", what: "jump back to the previous directory" },
  ] },
  { name: "cp", synopsis: "cp [-r] SRC DST", summary: "Copy files/directories (-r for recursive).", category: "filesystem", examples: [
    { cmd: "cp -r src/ backup/", what: "copy the whole src tree into backup/" },
  ] },
  { name: "mv", synopsis: "mv SRC DST", summary: "Move or rename files/directories.", category: "filesystem", examples: [
    { cmd: "mv old.txt new.txt", what: "rename a file" },
  ] },
  { name: "rm", synopsis: "rm [-rf] PATH", summary: "Delete files (-r recursive, -f force). DANGEROUS with -rf — double-check the path.", category: "filesystem", examples: [
    { cmd: "rm -rf ./build", what: "delete the ./build tree (relative path — safe-ish)" },
  ] },
  { name: "mkdir", synopsis: "mkdir [-p] DIR", summary: "Create directories (-p creates parents).", category: "filesystem", examples: [
    { cmd: "mkdir -p src/utils", what: "create nested directories at once" },
  ] },
  { name: "find", synopsis: "find PATH [-name PATTERN] [-type f]", summary: "Search the file tree by name, size, time, type…", category: "filesystem", examples: [
    { cmd: "find . -name '*.log' -mtime +7", what: "log files older than 7 days" },
    { cmd: "find . -type f -size +10M", what: "files over 10 MB" },
  ] },
  { name: "ln", synopsis: "ln [-s] TARGET LINK", summary: "Create links (-s for symbolic/soft links).", category: "filesystem", examples: [
    { cmd: "ln -s /var/log/app applog", what: "symlink to a log directory" },
  ] },
  { name: "stat", synopsis: "stat FILE", summary: "Show detailed metadata: size, permissions, timestamps, inode.", category: "filesystem", examples: [
    { cmd: "stat script.sh", what: "all metadata for script.sh" },
  ] },
  { name: "touch", synopsis: "touch FILE", summary: "Create an empty file or update its timestamp.", category: "filesystem", examples: [
    { cmd: "touch .gitkeep", what: "create an empty file to keep a dir in git" },
  ] },

  // permissions
  { name: "chmod", synopsis: "chmod MODE FILE", summary: "Change file permissions — numeric (755) or symbolic (u+x). See the mode breakdown when you run this tool.", category: "permissions", examples: [
    { cmd: "chmod 755 script.sh", what: "owner: rwx, group/others: r-x — typical for scripts" },
    { cmd: "chmod 600 id_rsa", what: "only the owner can read a private key (SSH requires this)" },
    { cmd: "chmod -R 644 static/", what: "files readable by all, writable only by owner" },
  ] },
  { name: "chown", synopsis: "chown [-R] USER[:GROUP] PATH", summary: "Change file ownership (needs root for other people's files).", category: "permissions", examples: [
    { cmd: "sudo chown -R www-data:www-data /var/www", what: "hand a web root to the web server user" },
  ] },
  { name: "umask", synopsis: "umask [MASK]", summary: "Default permission bits removed from newly created files (022 → files 644, dirs 755).", category: "permissions", examples: [
    { cmd: "umask", what: "show the current mask" },
  ] },
  { name: "sudo", synopsis: "sudo COMMAND", summary: "Run a command as root (audited, requires your password or NOPASSWD config).", category: "permissions", examples: [
    { cmd: "sudo systemctl restart nginx", what: "restart a system service" },
  ] },

  // processes
  { name: "ps", synopsis: "ps aux", summary: "Snapshot of running processes.", category: "processes", examples: [
    { cmd: "ps aux | grep node", what: "find node processes" },
  ] },
  { name: "top", synopsis: "top", summary: "Live process/CPU/memory view.", category: "processes", examples: [
    { cmd: "top -o %CPU", what: "sort by CPU usage" },
  ] },
  { name: "htop", synopsis: "htop", summary: "Interactive, colored top — easier to navigate.", category: "processes", examples: [
    { cmd: "htop", what: "browse processes, F9 to kill" },
  ] },
  { name: "kill", synopsis: "kill [-9] PID", summary: "Send a signal to a process (TERM by default, -9 = KILL as last resort).", category: "processes", examples: [
    { cmd: "kill 12345", what: "politely terminate PID 12345" },
  ] },
  { name: "nohup", synopsis: "nohup CMD &", summary: "Keep a command running after the SSH session ends.", category: "processes", examples: [
    { cmd: "nohup ./server &", what: "start server in background, immune to hangups" },
  ] },

  // networking
  { name: "ip", synopsis: "ip [addr|route|link] ...", summary: "Modern interface/route/address tool (replaces ifconfig/route).", category: "networking", examples: [
    { cmd: "ip addr show", what: "interfaces and their IP addresses" },
    { cmd: "ip route", what: "routing table" },
  ] },
  { name: "ping", synopsis: "ping HOST", summary: "ICMP echo to test reachability and latency.", category: "networking", examples: [
    { cmd: "ping -c 4 example.com", what: "send exactly 4 probes" },
  ] },
  { name: "curl", synopsis: "curl [OPTIONS] URL", summary: "HTTP client for testing APIs and endpoints.", category: "networking", examples: [
    { cmd: "curl -I https://example.com", what: "HEAD request — view response headers only" },
    { cmd: "curl -X POST -H 'Content-Type: application/json' -d '{...}' http://localhost:8000/api", what: "POST JSON to a local API" },
  ] },
  { name: "ss", synopsis: "ss [-tulpn]", summary: "Socket statistics — which ports are listening (replaces netstat).", category: "networking", examples: [
    { cmd: "ss -tulpn", what: "all listening TCP/UDP ports with owning processes" },
  ] },
  { name: "dig", synopsis: "dig [@SERVER] NAME [TYPE]", summary: "DNS lookup utility.", category: "networking", examples: [
    { cmd: "dig example.com A", what: "IPv4 addresses for example.com" },
    { cmd: "dig +short example.com MX", what: "mail servers, short output" },
  ] },
  { name: "ssh", synopsis: "ssh [-p PORT] [-i KEY] USER@HOST", summary: "Secure shell into a remote machine.", category: "networking", examples: [
    { cmd: "ssh -i ~/.ssh/id_ed25519 deploy@203.0.113.10", what: "connect with a specific key" },
  ] },
  { name: "scp", synopsis: "scp SRC USER@HOST:PATH", summary: "Copy files over SSH.", category: "networking", examples: [
    { cmd: "scp app.tar.gz deploy@server:/tmp/", what: "upload an artifact" },
  ] },
  { name: "rsync", synopsis: "rsync [-avz] SRC DEST", summary: "Efficient incremental file sync (local or over SSH).", category: "networking", examples: [
    { cmd: "rsync -avz ./dist/ deploy@server:/var/www/", what: "sync a build to a server" },
  ] },

  // users
  { name: "whoami", synopsis: "whoami", summary: "Current effective username.", category: "users", examples: [
    { cmd: "whoami", what: "print your username" },
  ] },
  { name: "id", synopsis: "id [USER]", summary: "UID, GID and group memberships.", category: "users", examples: [
    { cmd: "id deploy", what: "check which groups deploy belongs to" },
  ] },
  { name: "useradd", synopsis: "sudo useradd -m -s /bin/bash NAME", summary: "Create a user account (-m makes a home dir).", category: "users", examples: [
    { cmd: "sudo useradd -m deploy", what: "create the deploy user" },
  ] },
  { name: "passwd", synopsis: "passwd [USER]", summary: "Change a password (yours, or another user's with sudo).", category: "users", examples: [
    { cmd: "sudo passwd deploy", what: "reset deploy's password" },
  ] },

  // services
  { name: "systemctl", synopsis: "systemctl [start|stop|restart|status|enable] UNIT", summary: "Control systemd services.", category: "services", examples: [
    { cmd: "systemctl status nginx", what: "is nginx running? recent log lines included" },
    { cmd: "sudo systemctl enable --now forgekit", what: "start now AND on every boot" },
  ] },
  { name: "journalctl", synopsis: "journalctl [-u UNIT] [-f] [--since ...]", summary: "Query systemd logs.", category: "logs", examples: [
    { cmd: "journalctl -u forgekit -f", what: "follow your service's logs live" },
    { cmd: "journalctl --since '1 hour ago'", what: "logs from the last hour" },
  ] },

  // shell
  { name: "grep", synopsis: "grep [-ri] PATTERN [FILE]", summary: "Search text with patterns.", category: "shell", examples: [
    { cmd: "grep -rn 'TODO' src/", what: "all TODOs with file and line numbers" },
    { cmd: "grep -i error app.log", what: "case-insensitive error lines" },
  ] },
  { name: "sed", synopsis: "sed 's/OLD/NEW/g' FILE", summary: "Stream editor — search/replace and transforms.", category: "shell", examples: [
    { cmd: "sed -i 's/http:/https:/g' config.txt", what: "replace all http: with https: in place" },
  ] },
  { name: "awk", synopsis: "awk '{print $1}' FILE", summary: "Column-oriented text processing.", category: "shell", examples: [
    { cmd: "awk '{print $1}' access.log | sort | uniq -c | sort -rn | head", what: "top IPs hitting your server" },
  ] },
  { name: "tar", synopsis: "tar [-czf|-xzf] ARCHIVE PATH", summary: "Archive and compress (c=create, x=extract, z=gzip, f=file).", category: "shell", examples: [
    { cmd: "tar -czf app.tar.gz ./app", what: "create a gzipped archive" },
    { cmd: "tar -xzf app.tar.gz", what: "extract it" },
  ] },
  { name: "crontab", synopsis: "crontab -e | -l", summary: "Schedule recurring jobs (min hour day month weekday).", category: "shell", examples: [
    { cmd: "0 3 * * * /opt/backup.sh", what: "run backup.sh daily at 03:00" },
  ] },
  { name: "man", synopsis: "man COMMAND", summary: "The manual — press q to quit.", category: "shell", examples: [
    { cmd: "man rsync", what: "full rsync documentation" },
  ] },

  // storage
  { name: "df", synopsis: "df -h", summary: "Disk space per filesystem.", category: "storage", examples: [
    { cmd: "df -h", what: "human-readable free/used space" },
  ] },
  { name: "du", synopsis: "du -sh PATH", summary: "Disk usage of files/directories.", category: "storage", examples: [
    { cmd: "du -sh * | sort -rh | head", what: "which directory eats your disk" },
  ] },
  { name: "mount", synopsis: "mount [DEVICE PATH]", summary: "Show (or perform) filesystem mounts.", category: "storage", examples: [
    { cmd: "mount | grep ext4", what: "mounted ext4 filesystems" },
  ] },
  { name: "lsblk", synopsis: "lsblk", summary: "Block devices (disks/partitions) as a tree.", category: "storage", examples: [
    { cmd: "lsblk", what: "see disk layout at a glance" },
  ] },

  // logs
  { name: "tail", synopsis: "tail [-f] [-n N] FILE", summary: "Show the end of a file (-f follows live).", category: "logs", examples: [
    { cmd: "tail -f /var/log/nginx/error.log", what: "watch nginx errors live" },
  ] },
  { name: "dmesg", synopsis: "dmesg [-T]", summary: "Kernel ring buffer — hardware/driver messages.", category: "logs", examples: [
    { cmd: "dmesg -T | tail", what: "recent kernel events with timestamps" },
  ] },
];

let counter = 0;
function nid(): string {
  counter += 1;
  return `ll-${counter}`;
}

export interface ModeExplanation {
  numeric?: string;
  owner: string;
  group: string;
  others: string;
  special?: string;
}

export function explainChmodMode(mode: string): ModeExplanation | null {
  // Numeric, e.g. 755 (optionally 4 digits with special bit)
  if (/^[0-7]{3,4}$/.test(mode)) {
    const digits = mode.length === 4 ? mode.slice(1) : mode;
    const specialDigit = mode.length === 4 ? mode[0] : null;
    const bits = digits.split("").map(Number);
    const part = (n: number) => {
      const r = n & 4 ? "read" : null;
      const w = n & 2 ? "write" : null;
      const x = n & 1 ? "execute" : null;
      return [r, w, x].filter(Boolean).join(", ") || "no permissions";
    };
    const specialText =
      specialDigit === "4" ? "setuid (run as file owner)" :
      specialDigit === "2" ? "setgid (run as group)" :
      specialDigit === "1" ? "sticky bit (dirs: only owner may delete)" : undefined;
    return {
      numeric: `${mode} = ${digits.split("").map((d) => d).join(" ")}`,
      owner: part(bits[0]),
      group: part(bits[1]),
      others: part(bits[2]),
      special: specialText,
    };
  }

  // Symbolic, e.g. u+x, go-w, a=rw
  if (/^[ugoa]+[+\-=][rwxst]+$/.test(mode)) {
    const who = mode.match(/^[ugoa]+/)![0];
    const op = mode.match(/[+\-=]/)![0];
    const perms = mode.match(/[rwxst]+$/)![0];
    const whoText = who.split("").map((c) =>
      c === "u" ? "owner" : c === "g" ? "group" : c === "o" ? "others" : "all",
    ).join(", ");
    const permText = perms.split("").map((c) =>
      c === "r" ? "read" : c === "w" ? "write" : c === "x" ? "execute" : c === "s" ? "setuid/setgid" : "sticky",
    ).join(", ");
    return {
      owner: `symbolic mode: ${whoText} ${op === "+" ? "add" : op === "-" ? "remove" : "set exactly"}: ${permText}`,
      group: "",
      others: "",
    };
  }
  return null;
}

export interface LensResult {
  report: Report;
  match: CommandEntry | null;
  modeExplanation: ModeExplanation | null;
  warning?: string;
}

export function explainCommand(input: string): LensResult {
  counter = 0;
  const trimmed = input.trim();
  const tokens = trimmed.split(/\s+/);
  const base = (tokens[0] ?? "").toLowerCase();
  const entry = COMMANDS.find((c) => c.name === base) ?? null;

  let modeExplanation: ModeExplanation | null = null;
  let warning: string | undefined;

  if (base === "chmod") {
    const modeArg = tokens.find((t) => /^-/.test(t) === false && t !== "chmod");
    if (modeArg) {
      modeExplanation = explainChmodMode(modeArg);
      if (/^[0-7]{3,4}$/.test(modeArg) && !/^[67]4[0-4]$/.test(modeArg) && /^[0-7]{3}$/.test(modeArg) && parseInt(modeArg[2], 10) % 2 === 1) {
        const hasX = (parseInt(modeArg[0], 10) & 1) === 1;
        const target = tokens[tokens.indexOf(modeArg) + 1] ?? "";
        if (hasX && /\.(txt|md|json|ya?ml|env|log)$/i.test(target)) {
          warning = "This file looks like data (not a program) but has execute bits set — often accidental, and can be a foothold if the file is attacker-writable.";
        }
      }
    }
  }
  if (base === "rm" && /-[rf]{1,2}|--recursive|--force/.test(trimmed) && !/^\s*rm\s+-rf\s+\.(\/|$)/.test(trimmed) && !/\/(tmp|build|dist|node_modules)/.test(trimmed)) {
    warning = "rm with -rf is unforgiving. Double-check the path is relative (./build) or absolute-correct before pressing Enter.";
  }
  if (base === "chmod" && /^[0-7]{3,4}$/.test(tokens[1] ?? "") && (tokens[1]!.startsWith("777"))) {
    warning = "777 makes the file world-writable — anything running as any user can rewrite it. Almost always a mistake; 755 or 644 is usually what you want.";
  }

  const sections: Report["sections"] = [];
  let summary: string;

  if (modeExplanation) {
    const rows: Array<[string, string]> = [];
    if (modeExplanation.numeric) rows.push(["Mode", modeExplanation.numeric]);
    if (modeExplanation.owner) rows.push(["Owner (u)", modeExplanation.owner]);
    if (modeExplanation.group) rows.push(["Group (g)", modeExplanation.group]);
    if (modeExplanation.others) rows.push(["Others (o)", modeExplanation.others]);
    if (modeExplanation.special) rows.push(["Special", modeExplanation.special]);
    sections.push({ heading: "Permission breakdown", rows });
  }
  if (entry) {
    sections.push({ heading: "About " + entry.name, body: entry.summary });
    sections.push({
      heading: "Examples",
      rows: entry.examples.map((e) => [e.cmd, e.what]),
    });
    sections.push({
      heading: `Other ${entry.category} commands`,
      body: COMMANDS.filter((c) => c.category === entry.category && c.name !== entry.name).map((c) => c.name).join("  ·  "),
    });
    summary = `Explained: ${trimmed}${modeExplanation ? " (permission breakdown above)" : ""}.`;
  } else if (modeExplanation) {
    summary = "Explained the permission mode.";
  } else if (base) {
    summary = `"${base}" is not in the LinuxLens knowledge base yet. Try: ${COMMANDS.slice(0, 8).map((c) => c.name).join(", ")}… — or browse categories on the right.`;
  } else {
    summary = "Type a command above, e.g. `chmod 755 script.sh` or `journalctl -u app -f`.";
  }

  const report: Report = {
    tool: "linux-lens",
    toolLabel: getTool("linux-lens").name,
    title: "ForgeKit LinuxLens Explanation",
    generatedAt: new Date().toISOString(),
    summary,
    findings: warning
      ? [{
          id: nid(),
          severity: "medium",
          title: "Safety note",
          detail: warning,
        }]
      : [],
    sections,
    meta: { Command: trimmed.slice(0, 80) },
  };

  return { report, match: entry, modeExplanation, warning };
}

export function commandsByCategory(category: Category): CommandEntry[] {
  return COMMANDS.filter((c) => c.category === category);
}
