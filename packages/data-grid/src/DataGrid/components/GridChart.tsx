import Box from '@mui/material/Box';
import { useTheme } from '@mui/material/styles';
import type { GridChartData, GridChartType } from '../DataGrid.types';
import { formatChartNumber, getNiceTicks } from '../features/charts';

export interface GridChartProps {
  type: GridChartType;
  data: GridChartData;
  width?: number;
  height?: number;
  /** Names the chart for screen readers. */
  ariaLabel?: string;
}

const MARGIN = { top: 12, right: 16, bottom: 44, left: 56 };

/** Draws `data` as SVG in the given chart type. It reads colors from the MUI theme. */
export function GridChart({ type, data, width = 480, height = 280, ariaLabel }: GridChartProps) {
  const theme = useTheme();
  const palette = [
    theme.palette.primary.main,
    theme.palette.secondary.main,
    theme.palette.success.main,
    theme.palette.warning.main,
    theme.palette.info.main,
    theme.palette.error.main,
  ];
  const color = (index: number) => palette[index % palette.length] as string;
  const axisColor = theme.palette.divider;
  const textColor = theme.palette.text.secondary;

  const svgProps = {
    role: 'img',
    'aria-label': ariaLabel,
    viewBox: `0 0 ${width} ${height}`,
    width: '100%',
    style: { maxWidth: width, display: 'block' },
    'data-chart-type': type,
  } as const;

  if (type === 'pie') {
    return <PieChart data={data} svgProps={svgProps} width={width} height={height} color={color} />;
  }
  if (type === 'scatter') {
    return <ScatterChart data={data} svgProps={svgProps} width={width} height={height} color={color} axisColor={axisColor} textColor={textColor} />;
  }

  const horizontal = type === 'bar';
  const plot = {
    x: MARGIN.left,
    y: MARGIN.top,
    width: width - MARGIN.left - MARGIN.right,
    height: height - MARGIN.top - MARGIN.bottom,
  };
  const all = data.series.flatMap((series) => series.values.filter((value): value is number => value !== null));
  const ticks = getNiceTicks(Math.min(0, ...all), Math.max(0, ...all));
  const min = ticks[0] as number;
  const max = ticks[ticks.length - 1] as number;
  const span = max - min || 1;
  const count = data.categories.length;

  // value -> pixel along the value axis, category index -> pixel along the category axis.
  const valuePos = (value: number) => (horizontal ? plot.x + ((value - min) / span) * plot.width : plot.y + plot.height - ((value - min) / span) * plot.height);
  const band = (horizontal ? plot.height : plot.width) / Math.max(1, count);
  const categoryCenter = (index: number) => (horizontal ? plot.y : plot.x) + band * index + band / 2;
  const zero = valuePos(0);
  const seriesCount = Math.max(1, data.series.length);
  const barSize = (band * 0.8) / seriesCount;
  // Skip category labels so they do not overlap.
  const labelEvery = Math.max(1, Math.ceil(count / (horizontal ? plot.height / 14 : plot.width / 56)));

  return (
    <Box component="svg" {...svgProps}>
      {ticks.map((tick) => {
        const position = valuePos(tick);
        return horizontal ? (
          <g key={tick}>
            <line x1={position} x2={position} y1={plot.y} y2={plot.y + plot.height} stroke={axisColor} />
            <text x={position} y={plot.y + plot.height + 14} textAnchor="middle" fontSize={11} fill={textColor}>
              {formatChartNumber(tick)}
            </text>
          </g>
        ) : (
          <g key={tick}>
            <line x1={plot.x} x2={plot.x + plot.width} y1={position} y2={position} stroke={axisColor} />
            <text x={plot.x - 6} y={position + 4} textAnchor="end" fontSize={11} fill={textColor}>
              {formatChartNumber(tick)}
            </text>
          </g>
        );
      })}
      {data.categories.map((category, index) =>
        index % labelEvery === 0 ? (
          horizontal ? (
            <text key={index} x={plot.x - 6} y={categoryCenter(index) + 4} textAnchor="end" fontSize={11} fill={textColor}>
              {truncate(category)}
            </text>
          ) : (
            <text key={index} x={categoryCenter(index)} y={plot.y + plot.height + 16} textAnchor="middle" fontSize={11} fill={textColor}>
              {truncate(category)}
            </text>
          )
        ) : null,
      )}

      {(type === 'column' || type === 'bar') &&
        data.series.map((series, seriesIndex) =>
          series.values.map((value, index) => {
            if (value === null) {
              return null;
            }
            const offset = categoryCenter(index) - (band * 0.8) / 2 + barSize * seriesIndex;
            const end = valuePos(value);
            const rect = horizontal
              ? { x: Math.min(zero, end), y: offset, width: Math.abs(end - zero), height: barSize }
              : { x: offset, y: Math.min(zero, end), width: barSize, height: Math.abs(end - zero) };
            return (
              <rect key={`${series.field}-${index}`} {...rect} fill={color(seriesIndex)} data-series={series.field}>
                <title>{`${series.label}, ${data.categories[index]}: ${formatChartNumber(value)}`}</title>
              </rect>
            );
          }),
        )}

      {(type === 'line' || type === 'area') &&
        data.series.map((series, seriesIndex) => {
          const segments = toSegments(series.values, (index) => categoryCenter(index), valuePos);
          return (
            <g key={series.field} data-series={series.field}>
              {type === 'area' &&
                segments.map((segment, segmentIndex) => (
                  <path
                    key={segmentIndex}
                    d={`M${segment[0]?.x},${zero} ${segment.map((point) => `L${point.x},${point.y}`).join(' ')} L${segment[segment.length - 1]?.x},${zero} Z`}
                    fill={color(seriesIndex)}
                    fillOpacity={0.2}
                  />
                ))}
              {segments.map((segment, segmentIndex) => (
                <polyline
                  key={segmentIndex}
                  points={segment.map((point) => `${point.x},${point.y}`).join(' ')}
                  fill="none"
                  stroke={color(seriesIndex)}
                  strokeWidth={2}
                />
              ))}
              {segments.flat().map((point) => (
                <circle key={point.index} cx={point.x} cy={point.y} r={3} fill={color(seriesIndex)}>
                  <title>{`${series.label}, ${data.categories[point.index]}: ${formatChartNumber(point.value)}`}</title>
                </circle>
              ))}
            </g>
          );
        })}

      <line
        x1={horizontal ? zero : plot.x}
        x2={horizontal ? zero : plot.x + plot.width}
        y1={horizontal ? plot.y : zero}
        y2={horizontal ? plot.y + plot.height : zero}
        stroke={textColor}
      />
    </Box>
  );
}

function truncate(label: string) {
  return label.length > 10 ? `${label.slice(0, 9)}…` : label;
}

/** Runs of consecutive non-null values, so a missing value breaks the line instead of dropping it to zero. */
function toSegments(values: readonly (number | null)[], x: (index: number) => number, y: (value: number) => number) {
  const segments: { x: number; y: number; index: number; value: number }[][] = [];
  let current: { x: number; y: number; index: number; value: number }[] = [];
  values.forEach((value, index) => {
    if (value === null) {
      if (current.length > 0) {
        segments.push(current);
        current = [];
      }
      return;
    }
    current.push({ x: x(index), y: y(value), index, value });
  });
  if (current.length > 0) {
    segments.push(current);
  }
  return segments;
}

type SharedProps = {
  data: GridChartData;
  width: number;
  height: number;
  color: (index: number) => string;
  svgProps: Record<string, unknown>;
};

function PieChart({ data, width, height, color, svgProps }: SharedProps) {
  const series = data.series[0];
  const slices = (series?.values ?? []).flatMap((value, index) => (value !== null && value > 0 ? [{ value, index }] : []));
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  const radius = Math.min(width, height) / 2 - 12;
  const cx = width / 2;
  const cy = height / 2;
  let angle = -Math.PI / 2;
  return (
    <Box component="svg" {...svgProps}>
      {slices.map((slice) => {
        const sweep = (slice.value / total) * Math.PI * 2;
        const start = angle;
        angle += sweep;
        const title = (
          <title>{`${data.categories[slice.index]}: ${formatChartNumber(slice.value)} (${((slice.value / total) * 100).toFixed(1)}%)`}</title>
        );
        if (slices.length === 1) {
          return (
            <circle key={slice.index} cx={cx} cy={cy} r={radius} fill={color(slice.index)}>
              {title}
            </circle>
          );
        }
        const [x1, y1] = [cx + radius * Math.cos(start), cy + radius * Math.sin(start)];
        const [x2, y2] = [cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)];
        return (
          <path
            key={slice.index}
            d={`M${cx},${cy} L${x1},${y1} A${radius},${radius} 0 ${sweep > Math.PI ? 1 : 0} 1 ${x2},${y2} Z`}
            fill={color(slice.index)}
            stroke="white"
            strokeWidth={1}
          >
            {title}
          </path>
        );
      })}
    </Box>
  );
}

function ScatterChart({
  data,
  width,
  height,
  color,
  svgProps,
  axisColor,
  textColor,
}: SharedProps & { axisColor: string; textColor: string }) {
  const [xs, ys] = [data.series[0], data.series[1]];
  const points = (xs?.values ?? []).flatMap((x, index) => {
    const y = ys?.values[index];
    return x !== null && y !== null && y !== undefined ? [{ x, y, index }] : [];
  });
  const plot = { x: MARGIN.left, y: MARGIN.top, width: width - MARGIN.left - MARGIN.right, height: height - MARGIN.top - MARGIN.bottom };
  const xTicks = getNiceTicks(Math.min(...points.map((point) => point.x), 0), Math.max(...points.map((point) => point.x), 0));
  const yTicks = getNiceTicks(Math.min(...points.map((point) => point.y), 0), Math.max(...points.map((point) => point.y), 0));
  const [xMin, xMax] = [xTicks[0] as number, xTicks[xTicks.length - 1] as number];
  const [yMin, yMax] = [yTicks[0] as number, yTicks[yTicks.length - 1] as number];
  const px = (value: number) => plot.x + ((value - xMin) / (xMax - xMin || 1)) * plot.width;
  const py = (value: number) => plot.y + plot.height - ((value - yMin) / (yMax - yMin || 1)) * plot.height;
  return (
    <Box component="svg" {...svgProps}>
      {yTicks.map((tick) => (
        <g key={`y${tick}`}>
          <line x1={plot.x} x2={plot.x + plot.width} y1={py(tick)} y2={py(tick)} stroke={axisColor} />
          <text x={plot.x - 6} y={py(tick) + 4} textAnchor="end" fontSize={11} fill={textColor}>{formatChartNumber(tick)}</text>
        </g>
      ))}
      {xTicks.map((tick) => (
        <g key={`x${tick}`}>
          <line x1={px(tick)} x2={px(tick)} y1={plot.y} y2={plot.y + plot.height} stroke={axisColor} />
          <text x={px(tick)} y={plot.y + plot.height + 16} textAnchor="middle" fontSize={11} fill={textColor}>{formatChartNumber(tick)}</text>
        </g>
      ))}
      <text x={plot.x + plot.width / 2} y={height - 6} textAnchor="middle" fontSize={11} fill={textColor}>{xs?.label}</text>
      <text transform={`translate(12 ${plot.y + plot.height / 2}) rotate(-90)`} textAnchor="middle" fontSize={11} fill={textColor}>{ys?.label}</text>
      {points.map((point) => (
        <circle key={point.index} cx={px(point.x)} cy={py(point.y)} r={4} fill={color(0)} fillOpacity={0.8}>
          <title>{`${data.categories[point.index]}: ${formatChartNumber(point.x)}, ${formatChartNumber(point.y)}`}</title>
        </circle>
      ))}
    </Box>
  );
}
