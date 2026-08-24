type Props = {
  values: number[];
  stroke?: string;
  fillFrom?: string;
  height?: number;
  className?: string;
};

export function Sparkline({ values, stroke = "#2f9e97", fillFrom = "rgba(47,158,151,0.25)", height = 44, className }: Props) {
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
  const line = points.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
  const area = `${line} ${width},${height} 0,${height}`;
  const gradientId = `spark-${stroke.replace(/[^a-z0-9]/gi, "")}`;

  return (
    <svg className={className} preserveAspectRatio="none" viewBox={`0 0 ${width} ${height}`} width="100%" height={height}>
      <defs>
        <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={fillFrom} />
          <stop offset="100%" stopColor="rgba(0,0,0,0)" />
        </linearGradient>
      </defs>
      <polygon fill={`url(#${gradientId})`} points={area} />
      <polyline fill="none" points={line} stroke={stroke} strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
      {points.length > 0 && (
        <circle cx={points[points.length - 1][0]} cy={points[points.length - 1][1]} fill={stroke} r="2.4" />
      )}
    </svg>
  );
}
