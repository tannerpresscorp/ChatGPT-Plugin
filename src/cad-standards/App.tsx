import { useApp } from "@modelcontextprotocol/ext-apps/react";
import type { App as McpApp } from "@modelcontextprotocol/ext-apps";
import { Check, CircleAlert, DraftingCompass, Layers3, Ruler } from "lucide-react";
import { useState } from "react";

type Discipline = "architectural" | "civil" | "electrical" | "mechanical";

interface CadStandardResult {
  recommendation: string;
  discipline: Discipline;
  element: string;
  layer: string | null;
  color: number | null;
  linetype: string | null;
  lineweight_mm: number | null;
  standard_found: boolean;
  source: string;
}

const disciplineLabel: Record<Discipline, string> = {
  architectural: "Architectural",
  civil: "Civil",
  electrical: "Electrical",
  mechanical: "Mechanical",
};

function ValueCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="value-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export default function App() {
  const [data, setData] = useState<CadStandardResult | null>(null);

  const { app, error } = useApp({
    appInfo: { name: "CAD Standards", version: "1.0.0" },
    capabilities: {},
    onAppCreated: (createdApp: McpApp) => {
      createdApp.ontoolresult = (result) => {
        setData(result.structuredContent as unknown as CadStandardResult);
      };
    },
  });

  if (error) {
    return <div className="state-card error">Unable to connect to the CAD standards app.</div>;
  }

  if (!app || !data) {
    return (
      <div className="state-card">
        <DraftingCompass aria-hidden="true" />
        <span>{app ? "Checking the standard…" : "Connecting…"}</span>
      </div>
    );
  }

  return (
    <main className="cad-shell">
      <header className="hero">
        <div className="hero-mark"><DraftingCompass aria-hidden="true" /></div>
        <div>
          <p className="eyebrow">CAD standards assistant</p>
          <h1>{data.element}</h1>
          <p>{disciplineLabel[data.discipline]}</p>
        </div>
        <div className={data.standard_found ? "status found" : "status missing"}>
          {data.standard_found ? <Check aria-hidden="true" /> : <CircleAlert aria-hidden="true" />}
          {data.standard_found ? "Approved" : "Review needed"}
        </div>
      </header>

      <section className="recommendation">
        <Layers3 aria-hidden="true" />
        <p>{data.recommendation}</p>
      </section>

      <section className="values" aria-label="Layer standard values">
        <ValueCard label="Layer" value={data.layer ?? "—"} />
        <ValueCard label="Color" value={data.color?.toString() ?? "—"} />
        <ValueCard label="Linetype" value={data.linetype ?? "—"} />
        <ValueCard
          label="Lineweight"
          value={data.lineweight_mm == null ? "—" : `${data.lineweight_mm.toFixed(2)} mm`}
        />
      </section>

      <footer>
        <Ruler aria-hidden="true" />
        <span>Source: {data.source}</span>
      </footer>
    </main>
  );
}
