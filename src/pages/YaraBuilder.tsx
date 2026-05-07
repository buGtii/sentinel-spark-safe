import { useMemo, useState } from "react";
import { Copy, FileCode } from "lucide-react";
import { toast } from "sonner";
import { addXp } from "@/lib/gamify";

export default function YaraBuilder() {
  const [name, setName] = useState("Suspicious_Sample");
  const [author, setAuthor] = useState("CyberSmart");
  const [desc, setDesc] = useState("Auto-generated rule");
  const [strings, setStrings] = useState("malicious_string\nC2 callback: 192.168.1.1\nDownload payload");
  const [hashes, setHashes] = useState("");
  const [condition, setCondition] = useState<"any" | "all" | "2of">("any");

  const rule = useMemo(() => {
    const lines = strings.split("\n").map(s => s.trim()).filter(Boolean);
    const stringDecls = lines.map((s, i) => `        $s${i + 1} = "${s.replace(/"/g, '\\"')}" ascii wide nocase`).join("\n");
    const hashLines = hashes.split("\n").map(h => h.trim()).filter(Boolean);
    const hashImport = hashLines.length ? "import \"hash\"\n\n" : "";
    const hashCond = hashLines.map(h => {
      const algo = h.length === 32 ? "md5" : h.length === 40 ? "sha1" : "sha256";
      return `hash.${algo}(0, filesize) == "${h.toLowerCase()}"`;
    });
    const cond = condition === "any" ? "any of ($s*)" : condition === "all" ? "all of ($s*)" : "2 of ($s*)";
    const fullCond = hashCond.length ? `(${cond}) or (${hashCond.join(" or ")})` : cond;
    return `${hashImport}rule ${name.replace(/\s+/g, "_")}
{
    meta:
        author = "${author}"
        description = "${desc}"
        date = "${new Date().toISOString().slice(0, 10)}"

    strings:
${stringDecls || "        $s1 = \"placeholder\""}

    condition:
        ${fullCond}
}`;
  }, [name, author, desc, strings, hashes, condition]);

  return (
    <div className="space-y-4">
      <header>
        <p className="text-xs font-mono text-primary">DETECTION ENGINEERING</p>
        <h1 className="text-2xl font-bold">YARA rule builder</h1>
        <p className="text-sm text-muted-foreground">Generate ready-to-deploy YARA rules from indicators in seconds.</p>
      </header>

      <div className="glass rounded-2xl p-4 space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Rule name" className="bg-background/40 border border-border rounded-xl px-3 py-2 text-sm" />
          <input value={author} onChange={e => setAuthor(e.target.value)} placeholder="Author" className="bg-background/40 border border-border rounded-xl px-3 py-2 text-sm" />
        </div>
        <input value={desc} onChange={e => setDesc(e.target.value)} placeholder="Description" className="w-full bg-background/40 border border-border rounded-xl px-3 py-2 text-sm" />
        <div>
          <label className="text-xs text-muted-foreground">Strings (one per line)</label>
          <textarea value={strings} onChange={e => setStrings(e.target.value)} rows={4} className="w-full bg-background/40 border border-border rounded-xl px-3 py-2 font-mono text-xs" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">File hashes (MD5/SHA1/SHA256, one per line, optional)</label>
          <textarea value={hashes} onChange={e => setHashes(e.target.value)} rows={2} className="w-full bg-background/40 border border-border rounded-xl px-3 py-2 font-mono text-xs" />
        </div>
        <div className="flex gap-2 text-xs">
          {(["any", "2of", "all"] as const).map(c => (
            <button key={c} onClick={() => setCondition(c)} className={`px-3 py-1.5 rounded-lg border ${condition === c ? "bg-primary text-primary-foreground border-primary" : "border-border"}`}>{c.replace("2of", "2 of strings")}</button>
          ))}
        </div>
      </div>

      <div className="glass rounded-2xl p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2 text-sm font-semibold"><FileCode className="h-4 w-4 text-primary" /> Generated rule</div>
          <button onClick={() => { navigator.clipboard.writeText(rule); toast.success("Copied YARA rule"); addXp(10, "Built YARA rule"); }} className="text-xs text-primary flex items-center gap-1"><Copy className="h-3 w-3" /> Copy</button>
        </div>
        <pre className="text-[11px] font-mono whitespace-pre-wrap bg-background/40 rounded-xl p-3 overflow-x-auto">{rule}</pre>
      </div>
    </div>
  );
}
