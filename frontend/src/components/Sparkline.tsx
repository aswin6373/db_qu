import { useId } from "react";

type Props = {
  values: number[];
  stroke?: string;
  fillFrom?: string;
  height?: number;
  className?: string;
};

export function Sparkline({ values, stroke = "#2f9e97", fillFrom = "rgba(47,158,151,0.25)", height = 44, className }: Props) {
  const rawId = useId();
  const gradientId = `spark-${rawId.replace(/[^a-z0-9]/gi, "")}`;
  const width = 100;
  const series = values.length > 0 ? values : [0, 0];
  const max = Math.max(...series, 1);
  const min = Math.min(...series, 0);
  const range = max - min || 1;
  const step = series.length > 1 ? width / (series.length - 1) : width;
  const points = series.map((value, index) => {
    const x = index * step;
    const y = height - 4 - ((value - min) / range) * (height - 10);
    return [x, y] as const;
  });
  const line = points.reduce((acc, point, index) => {
    if (index === 0) return `M ${point[0].toFixed(2)},${point[1].toFixed(2)}`;
    const prev = points[index - 1];
    const midX = ((prev[0] + point[0]) / 2).toFixed(2);
    return `${acc} Q ${midX},${prev[1].toFixed(2)} ${point[0].toFixed(2)},${point[1].toFixed(2)}`;
  }, "");
  const area = `${line} L ${width},${height} L 0,${height} Z`;
  const last = points[points.length - 1];

  return (
    <svg className={className} preserveAspectRatio="none" viewBox={`0 0 ${width} ${height}`} width="100%" height={height}>
      <defs>
        <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={fillFrom} />
          <stop offset="100%" stopColor="rgba(0,0,0,0)" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradientId})`} />
      <path d={line} fill="none" stroke={stroke} strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
      {last && <circle cx={last[0]} cy={last[1]} fill={stroke} r="2.4" />}
    </svg>
  );
}
