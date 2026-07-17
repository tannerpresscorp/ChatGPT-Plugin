import { z } from "zod";

import catalogJson from "./catalogs/tanner-press-cad-reference-v1.json" with { type: "json" };

export const disciplineSchema = z.enum(["architectural", "civil", "electrical", "mechanical"]);
export type Discipline = z.infer<typeof disciplineSchema>;

const catalogRecordSchema = z.object({
  discipline: disciplineSchema,
  element: z.string().min(1),
  layer: z.string().min(1),
  color: z.number().int().min(1).max(255),
  linetype: z.string().min(1),
  lineweight_mm: z.number().positive(),
}).strict();

const catalogSchema = z.object({
  name: z.literal("Tanner Press CAD Reference Catalog"),
  version: z.literal(1),
  source: z.literal("Tanner Press CAD Reference Catalog v1"),
  records: z.array(catalogRecordSchema).min(1),
}).strict();

const catalog = catalogSchema.parse(catalogJson);

export interface CadAnswer {
  [key: string]: unknown;
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

export const CATALOG_SOURCE = catalog.source;

export function normalizeElement(value: string): string {
  return value.trim().toLowerCase().replace(/[-_]+/g, " ").replace(/\s+/g, " ");
}

const recordsByKey = new Map<string, (typeof catalog.records)[number]>();

for (const record of catalog.records) {
  const key = `${record.discipline}:${normalizeElement(record.element)}`;
  if (recordsByKey.has(key)) {
    throw new Error(`Duplicate CAD reference catalog entry: ${key}`);
  }
  recordsByKey.set(key, record);
}

export function recommendStandard(discipline: Discipline, element: string): CadAnswer {
  const normalizedElement = normalizeElement(element);
  const match = recordsByKey.get(`${discipline}:${normalizedElement}`);

  if (!match) {
    return {
      recommendation: `No Tanner Press reference recommendation is available for ${discipline} ${normalizedElement}. Review the project requirements or consult the project CAD manager.`,
      discipline,
      element: normalizedElement,
      layer: null,
      color: null,
      linetype: null,
      lineweight_mm: null,
      standard_found: false,
      source: CATALOG_SOURCE,
    };
  }

  return {
    recommendation: `Recommended reference settings for ${discipline} ${normalizedElement}: layer ${match.layer}, color ${match.color}, ${match.linetype} linetype, and ${match.lineweight_mm.toFixed(2)} mm lineweight.`,
    discipline,
    element: normalizedElement,
    layer: match.layer,
    color: match.color,
    linetype: match.linetype,
    lineweight_mm: match.lineweight_mm,
    standard_found: true,
    source: CATALOG_SOURCE,
  };
}
