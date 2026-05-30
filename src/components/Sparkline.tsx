interface SparklineProps {
  values: number[];
  width?: number;
  height?: number;
  /** Stroke colour — pass a CSS variable like "hsl(var(--primary))". */
  stroke?: string;
  /** Fill area under line. */
  fill?: string;
  className?: string;
}

/** Tiny dependency-free SVG sparkline. */
export function Sparkline({
  values,
  width = 120,
  height = 32,
  stroke = "hsl(var(--primary))",
  fill,
  className,
}: SparklineProps) {
  if (!values.length) {
    return (
      <svg width={width} height={height} className={className}>
        <line
          x1={0}
          y1={height / 2}
          x2={width}
          y2={height / 2}
          stroke="hsl(var(--muted-foreground))"
          strokeDasharray="2 2"
          strokeOpacity={0.4}
        />
      </svg>
    );
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const stepX = values.length > 1 ? width / (values.length - 1) : width;
  const points = values.map((v, i) => {
    const x = i * stepX;
    const y = height - ((v - min) / range) * (height - 4) - 2;
    return [x, y] as const;
  });
  const path = points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const areaPath = fill
    ? `${path} L${width},${height} L0,${height} Z`
    : "";
  const last = points[points.length - 1];
  return (
    <svg width={width} height={height} className={className}>
      {areaPath && <path d={areaPath} fill={fill} opacity={0.18} />}
      <path d={path} fill="none" stroke={stroke} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last[0]} cy={last[1]} r={2.5} fill={stroke} />
    </svg>
  );
}
