export type ChartSpec = {
  kind: "bar" | "line";
  labelColumn: string;
  labels: string[];
  series: Array<{ name: string; values: number[] }>;
};

/* Theme palette matching the app: brand teal first, then accents. */
const PALETTE = ["#2f9e97", "#f59e0b", "#8b5cf6", "#0ea5e9", "#ec4899", "#175d55", "#64748b"];
const NUMERIC_RE = /^-?[\d,]+(\.\d+)?%?$/;
const DATE_NAME_RE = /(date|month|year|day|week|quarter|time|period)/i;
const MAX_CATEGORIES = 12;

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

/* Detect whether a query result can be drawn: one label column plus at least
   one mostly-numeric column. Picks bar for categories, line for time series. */
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

  const labelColumn = columns.find((column) => (numericRatio.get(column) ?? 0) < 0.6) ?? columns[0];
  const seriesColumns = columns
    .filter((column) => column !== labelColumn && (numericRatio.get(column) ?? 0) >= 0.6)
    .slice(0, 3);
  if (seriesColumns.length === 0) return null;

  const dateish =
    DATE_NAME_RE.test(labelColumn) ||
    dataRows.filter((row) => looksLikeDate(String(row[labelColumn] ?? ""))).length / dataRows.length >= 0.7;

  return {
    kind: dateish ? "line" : "bar",
    labelColumn,
    labels: dataRows.map((row) => {
      const value = row[labelColumn];
      const text = value === null || value === undefined ? "—" : String(value);
      return text.length > 14 ? `${text.slice(0, 13)}…` : text;
    }),
    series: seriesColumns.map((column) => ({
      name: column,
      values: dataRows.map((row) => toNumber(row[column]) ?? 0)
    }))
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
  const pad = { top: 22, right: 14, bottom: 46, left: 54 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;

  const allValues = spec.series.flatMap((entry) => entry.values);
  const yMax = niceMax(Math.max(1, ...allValues));
  const rawMin = Math.min(0, ...allValues);
  const yMin = rawMin < 0 ? -niceMax(-rawMin) : 0;

  const yScale = (value: number) => pad.top + ((yMax - value) / (yMax - yMin)) * innerH;
  const zeroY = yScale(0);
  const groupW = innerW / spec.labels.length;
  const ticks = Array.from({ length: 5 }, (_, index) => yMin + ((yMax - yMin) / 4) * index);

  const showValues = spec.labels.length * spec.series.length <= 10;
  const rotateLabels = spec.labels.length > 6;
  const truncated = totalRows > spec.labels.length;

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
              const slotW = groupW / spec.series.length;
              const barW = Math.min(26, slotW * 0.62);
              return (
                <g className="transition-opacity hover:opacity-75" key={`group-${label}`}>
                  {spec.series.map((entry, seriesIndex) => {
                    const value = entry.values[groupIndex];
                    const valueY = yScale(value);
                    const top = Math.min(zeroY, valueY);
                    const barH = Math.max(Math.abs(valueY - zeroY), 0);
                    const x = groupStart + slotW * seriesIndex + (slotW - barW) / 2;
                    /* single-series bars each get their own palette color;
                       multi-series charts color by series instead */
                    const color =
                      spec.series.length === 1
                        ? PALETTE[groupIndex % PALETTE.length]
                        : PALETTE[seriesIndex % PALETTE.length];
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
          : spec.series.map((entry, seriesIndex) => {
              const color = PALETTE[seriesIndex % PALETTE.length];
              const points = entry.values.map((value, index) => ({
                x: pad.left + groupW * index + groupW / 2,
                y: yScale(value),
                value
              }));
              return (
                <g key={entry.name}>
                  {spec.series.length === 1 && points.length > 1 && (
                    <path
                      d={`${smoothPath(points)} L ${points[points.length - 1].x} ${zeroY} L ${points[0].x} ${zeroY} Z`}
                      fill={`url(#qc-fill-${seriesIndex})`}
                    />
                  )}
                  <path d={smoothPath(points)} fill="none" stroke={color} strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.4} />
                  {points.map((point, index) => (
                    <g key={index}>
                      <circle cx={point.x} cy={point.y} fill="#ffffff" r={3.4} stroke={color} strokeWidth={2}>
                        <title>{`${spec.labels[index]} · ${entry.name}: ${fullFormat.format(point.value)}`}</title>
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
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 pt-2.5 text-[11px] font-medium text-slate-500">
          {spec.series.map((entry, index) => (
            <span className="flex items-center gap-1.5" key={entry.name}>
              <span className="h-2 w-2 rounded-full" style={{ background: PALETTE[index % PALETTE.length] }} />
              {entry.name}
            </span>
          ))}
        </div>
      )}
      {truncated && (
        <p className="px-1 pt-2 text-[10.5px] text-slate-400">
          Showing first {spec.labels.length} of {totalRows} rows
        </p>
      )}
    </div>
  );
}
