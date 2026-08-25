import { useState } from "react";

export type ChartSpec = {
  kind: "bar" | "line";
  labelColumn: string;
  labels: string[];
  series: Array<{ name: string; values: number[] }>;
  /* indices into `series` shown by default (all when scales are comparable) */
  defaultVisible: number[];
};

/* Theme palette matching the app: brand teal first, then accents. */
const PALETTE = ["#2f9e97", "#f59e0b", "#8b5cf6", "#0ea5e9", "#ec4899", "#175d55", "#64748b"];
const NUMERIC_RE = /^-?[\d,]+(\.\d+)?%?$/;
const DATE_NAME_RE = /(date|month|year|day|week|quarter|time|period)/i;
/* columns that identify rows or mark time — never meaningful bar heights:
   ids, uuids, sequence/number columns, date/time parts, and key columns (pk/fk/uk) */
const NON_MEASURE_NAME_RE = /(^|_)(id|uuid|guid|no|num|number|seq|serial|code|year|month|day|week|quarter|date|time|period|pk|fk|uk|key)$/i;
const MAX_CATEGORIES = 12;
const MAX_SERIES = 4;
/* series whose magnitudes differ more than this are not overlaid by default */
const SCALE_RATIO_LIMIT = 25;

const compactFormat = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });
const fullFormat = new Intl.NumberFormat("en", { maximumFractionDigits: 2 });

function toNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string") {
    const trimmed = value.trim().replace(/[$€£]/g, "");
    if (!trimmed || !NUMERIC_RE.test(trimmed)) return null;
    const parsed = Number(trimmed.replace(/[,%]/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function looksLikeDate(value: string): boolean {
  return (
    /^\d{4}(-\d{2}){0,2}/.test(value) ||
    /^\d{1,2}[/.-]\d{1,2}([/.-]\d{2,4})?$/.test(value) ||
    /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(value)
  );
}

/* true for row identifiers: id-like names, or unique sequential integers (1,2,3…) */
function isIdentifier(name: string, values: unknown[]): boolean {
  if (NON_MEASURE_NAME_RE.test(name)) return true;
  const numbers = values.map(toNumber);
  if (numbers.length === 0 || numbers.some((value) => value === null || !Number.isInteger(value))) return false;
  const ints = numbers as number[];
  const unique = new Set(ints);
  const min = Math.min(...ints);
  const max = Math.max(...ints);
  return unique.size === ints.length && min <= 1 && max - min === ints.length - 1;
}

/* Detect whether a query result can be drawn: one label column plus at least
   one mostly-numeric measure column. Picks bar for categories, line for time. */
export function buildChartSpec(columns: string[], rows: Record<string, unknown>[]): ChartSpec | null {
  if (columns.length < 2 || rows.length < 2) return null;
  const dataRows = rows.slice(0, MAX_CATEGORIES);

  const numericRatio = new Map<string, number>();
  for (const column of columns) {
    let hits = 0;
    for (const row of dataRows) {
      if (toNumber(row[column]) !== null) hits += 1;
    }
    numericRatio.set(column, hits / dataRows.length);
  }

  const measureColumns = columns.filter(
    (column) =>
      (numericRatio.get(column) ?? 0) >= 0.6 && !isIdentifier(column, dataRows.map((row) => row[column]))
  );
  if (measureColumns.length === 0) return null;

  const labelColumn =
    columns.find((column) => !measureColumns.includes(column) && (numericRatio.get(column) ?? 0) < 0.6) ??
    columns.find((column) => !measureColumns.includes(column)) ??
    columns[0];
  const seriesColumns = measureColumns.filter((column) => column !== labelColumn).slice(0, MAX_SERIES);
  if (seriesColumns.length === 0) return null;

  const dateish =
    DATE_NAME_RE.test(labelColumn) ||
    dataRows.filter((row) => looksLikeDate(String(row[labelColumn] ?? ""))).length / dataRows.length >= 0.7;

  const series = seriesColumns.map((column) => ({
    name: column,
    values: dataRows.map((row) => toNumber(row[column]) ?? 0)
  }));

  /* overlay series only when their magnitudes are comparable; otherwise start
     with the first measure and let the legend bring others in */
  const maxes = series.map((entry) => Math.max(0, ...entry.values.map((value) => Math.abs(value))));
  const positiveMaxes = maxes.filter((max) => max > 0);
  const smallest = positiveMaxes.length > 0 ? Math.min(...positiveMaxes) : 0;
  const comparable = maxes.every((max) => max <= smallest * SCALE_RATIO_LIMIT);
  const defaultVisible = comparable
    ? series.map((_, index) => index)
    : [0];

  return {
    kind: dateish ? "line" : "bar",
    labelColumn,
    labels: dataRows.map((row) => {
      const value = row[labelColumn];
      const text = value === null || value === undefined ? "—" : String(value);
      return text.length > 14 ? `${text.slice(0, 13)}…` : text;
    }),
    series,
    defaultVisible
  };
}

function niceMax(value: number): number {
  if (value <= 0) return 1;
  const exponent = Math.floor(Math.log10(value));
  const base = 10 ** exponent;
  const scaled = value / base;
  const step = scaled <= 1 ? 1 : scaled <= 2 ? 2 : scaled <= 5 ? 5 : 10;
  return step * base;
}

function barPath(x: number, y: number, width: number, height: number, roundTop: boolean): string {
  const radius = Math.min(4, width / 2, height);
  if (radius <= 0) return `M ${x} ${y} h ${width} v ${height} h ${-width} Z`;
  if (roundTop) {
    return `M ${x} ${y + height} L ${x} ${y + radius} Q ${x} ${y} ${x + radius} ${y} L ${x + width - radius} ${y} Q ${x + width} ${y} ${x + width} ${y + radius} L ${x + width} ${y + height} Z`;
  }
  return `M ${x} ${y} L ${x} ${y + height - radius} Q ${x} ${y + height} ${x + radius} ${y + height} L ${x + width - radius} ${y + height} Q ${x + width} ${y + height} ${x + width} ${y + height - radius} L ${x + width} ${y} Z`;
}

function smoothPath(points: Array<{ x: number; y: number }>): string {
  if (points.length < 2) return "";
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let index = 0; index < points.length - 1; index += 1) {
    const previous = points[Math.max(0, index - 1)];
    const current = points[index];
    const next = points[index + 1];
    const after = points[Math.min(points.length - 1, index + 2)];
    const c1x = current.x + (next.x - previous.x) / 6;
    const c1y = current.y + (next.y - previous.y) / 6;
    const c2x = next.x - (after.x - current.x) / 6;
    const c2y = next.y - (after.y - current.y) / 6;
    d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${next.x} ${next.y}`;
  }
  return d;
}

export function QueryChart({ spec, totalRows }: { spec: ChartSpec; totalRows: number }) {
  const width = 640;
  const height = 300;
  const rotateLabels = spec.labels.length > 6;
  const pad = { top: 22, right: 14, bottom: 46, left: rotateLabels ? 66 : 54 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;

  const [visible, setVisible] = useState<number[] | null>(null);
  const shown = visible ?? spec.defaultVisible;
  const shownEntries = spec.series
    .map((entry, index) => ({ entry, index }))
    .filter(({ index }) => shown.includes(index));

  function toggleSeries(index: number) {
    const current = visible ?? spec.defaultVisible;
    if (current.length === 1 && current[0] === index) {
      /* clicking the only active chip brings every series back */
      setVisible(spec.series.map((_, item) => item));
    } else {
      /* selecting one chip shows only that series */
      setVisible([index]);
    }
  }

  /* scale the axis to only the visible series so toggling a legend chip
     actually reshapes the graph */
  const allValues = shownEntries.flatMap(({ entry }) => entry.values);
  const yMax = niceMax(Math.max(1, ...allValues));
  const rawMin = Math.min(0, ...allValues);
  const yMin = rawMin < 0 ? -niceMax(-rawMin) : 0;

  const yScale = (value: number) => pad.top + ((yMax - value) / (yMax - yMin)) * innerH;
  const zeroY = yScale(0);
  const groupW = innerW / spec.labels.length;
  const ticks = Array.from({ length: 5 }, (_, index) => yMin + ((yMax - yMin) / 4) * index);

  const showValues = spec.labels.length * shownEntries.length <= 10;

  const xLabel = (groupIndex: number) => {
    const center = pad.left + groupW * groupIndex + groupW / 2;
    return (
      <text
        fill="#64748b"
        fontSize={10}
        textAnchor={rotateLabels ? "end" : "middle"}
        transform={rotateLabels ? `rotate(-32 ${center + 4} ${zeroY + 16})` : undefined}
        x={rotateLabels ? center + 4 : center}
        y={zeroY + 16}
      >
        {spec.labels[groupIndex]}
      </text>
    );
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-gradient-to-b from-white to-slate-50/50 p-4">
      <svg className="h-auto w-full" role="img" viewBox={`0 0 ${width} ${height}`}>
        <defs>
          {spec.series.map((entry, index) => (
            <linearGradient key={entry.name} id={`qc-fill-${index}`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={PALETTE[index % PALETTE.length]} stopOpacity={0.26} />
              <stop offset="100%" stopColor={PALETTE[index % PALETTE.length]} stopOpacity={0.02} />
            </linearGradient>
          ))}
        </defs>

        {/* horizontal gridlines + y-axis labels */}
        {ticks.map((tick) => (
          <g key={tick}>
            <line
              stroke={tick === 0 ? "#cbd5e1" : "#e2e8f0"}
              strokeDasharray={tick === 0 ? undefined : "3 4"}
              strokeWidth={1}
              x1={pad.left}
              x2={width - pad.right}
              y1={yScale(tick)}
              y2={yScale(tick)}
            />
            <text fill="#94a3b8" fontSize={10} textAnchor="end" x={pad.left - 8} y={yScale(tick) + 3.5}>
              {compactFormat.format(tick)}
            </text>
          </g>
        ))}

        {spec.kind === "bar"
          ? spec.labels.map((label, groupIndex) => {
              const groupStart = pad.left + groupIndex * groupW;
              const slotW = groupW / shownEntries.length;
              const barW = Math.min(26, slotW * 0.62);
              return (
                <g className="transition-opacity hover:opacity-75" key={`group-${label}`}>
                  {shownEntries.map(({ entry, index }) => {
                    const value = entry.values[groupIndex];
                    const valueY = yScale(value);
                    const top = Math.min(zeroY, valueY);
                    const barH = Math.max(Math.abs(valueY - zeroY), 0);
                    const x = groupStart + slotW * shownEntries.findIndex((item) => item.index === index) + (slotW - barW) / 2;
                    /* single-series bars each get their own palette color;
                       multi-series charts color by series instead */
                    const color =
                      shownEntries.length === 1
                        ? PALETTE[groupIndex % PALETTE.length]
                        : PALETTE[index % PALETTE.length];
                    return (
                      <g key={entry.name}>
                        <path d={barPath(x, top, barW, barH, value >= 0)} fill={color}>
                          <title>{`${label} · ${entry.name}: ${fullFormat.format(value)}`}</title>
                        </path>
                        {showValues && barH > 2 && (
                          <text
                            fill="#64748b"
                            fontSize={9.5}
                            fontWeight={600}
                            textAnchor="middle"
                            x={x + barW / 2}
                            y={value >= 0 ? top - 5 : top + barH + 11}
                          >
                            {compactFormat.format(value)}
                          </text>
                        )}
                      </g>
                    );
                  })}
                  {xLabel(groupIndex)}
                </g>
              );
            })
          : shownEntries.map(({ entry, index }) => {
              const color = PALETTE[index % PALETTE.length];
              const points = entry.values.map((value, pointIndex) => ({
                x: pad.left + groupW * pointIndex + groupW / 2,
                y: yScale(value),
                value
              }));
              return (
                <g key={entry.name}>
                  {shownEntries.length === 1 && points.length > 1 && (
                    <path
                      d={`${smoothPath(points)} L ${points[points.length - 1].x} ${zeroY} L ${points[0].x} ${zeroY} Z`}
                      fill={`url(#qc-fill-${index})`}
                    />
                  )}
                  <path d={smoothPath(points)} fill="none" stroke={color} strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.4} />
                  {points.map((point, pointIndex) => (
                    <g key={pointIndex}>
                      <circle cx={point.x} cy={point.y} fill="#ffffff" r={3.4} stroke={color} strokeWidth={2}>
                        <title>{`${spec.labels[pointIndex]} · ${entry.name}: ${fullFormat.format(point.value)}`}</title>
                      </circle>
                      {showValues && (
                        <text fill="#64748b" fontSize={9.5} fontWeight={600} textAnchor="middle" x={point.x} y={point.y - 9}>
                          {compactFormat.format(point.value)}
                        </text>
                      )}
                    </g>
                  ))}
                </g>
              );
            })}

        {/* x labels for line charts (drawn once, not per series) */}
        {spec.kind === "line" && spec.labels.map((_, groupIndex) => <g key={`x-${groupIndex}`}>{xLabel(groupIndex)}</g>)}
      </svg>

      {spec.series.length > 1 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1 pt-2.5 text-[11px] font-medium">
          {spec.series.map((entry, index) => {
            const active = shown.includes(index);
            const color = PALETTE[index % PALETTE.length];
            return (
              <button
                className={`flex items-center gap-1.5 rounded-md px-1.5 py-0.5 transition ${
                  active ? "text-slate-600" : "text-slate-400 opacity-50 hover:opacity-90"
                }`}
                key={entry.name}
                onClick={() => toggleSeries(index)}
                title={active && shown.length === 1 ? "Show all" : `Show ${entry.name}`}
                type="button"
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={active ? { background: color } : { boxShadow: `inset 0 0 0 1.5px ${color}` }}
                />
                {entry.name}
              </button>
            );
          })}
        </div>
      )}
      {totalRows > spec.labels.length && (
        <p className="px-1 pt-2 text-[10.5px] text-slate-400">
          Showing first {spec.labels.length} of {totalRows} rows
        </p>
      )}
    </div>
  );
}
