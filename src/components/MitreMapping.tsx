import { Shield, Target } from "lucide-react";

export type MitreTechnique = {
  id: string;        // e.g. "T1566.002"
  name: string;      // e.g. "Spearphishing Link"
  tactic: string;    // e.g. "Initial Access"
  description?: string;
  detection?: string;
};

export function MitreMapping({ techniques }: { techniques?: MitreTechnique[] }) {
  if (!techniques?.length) return null;
  return (
    <div className="glass rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <Target className="h-4 w-4 text-accent" />
        <div className="text-xs font-mono text-accent">MITRE ATT&CK MAPPING</div>
      </div>
      <ul className="space-y-3">
        {techniques.map((t, i) => (
          <li key={i} className="border border-border/60 rounded-lg p-3 bg-background/40">
            <div className="flex items-start justify-between gap-3 mb-1">
              <div>
                <a
                  href={`https://attack.mitre.org/techniques/${t.id.replace(".", "/")}/`}
                  target="_blank" rel="noopener noreferrer"
                  className="text-sm font-semibold text-primary hover:underline font-mono"
                >
                  {t.id}
                </a>
                <span className="text-sm font-medium ml-2">{t.name}</span>
              </div>
              <span className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded bg-accent/15 text-accent shrink-0">
                {t.tactic}
              </span>
            </div>
            {t.description && (
              <p className="text-xs text-muted-foreground leading-relaxed mt-1">{t.description}</p>
            )}
            {t.detection && (
              <div className="mt-2 flex gap-2 text-xs">
                <Shield className="h-3.5 w-3.5 text-success shrink-0 mt-0.5" />
                <span><span className="text-success font-mono">DETECT:</span> {t.detection}</span>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
