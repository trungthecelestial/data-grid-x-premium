import FileDownloadIcon from '@mui/icons-material/FileDownload';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import type { Theme } from '@mui/material/styles';
import { useRef } from 'react';
import type { GridChartsPanelSlotProps, GridValidRowModel } from '../DataGrid.types';
import { CHART_TYPES, MAX_CHART_CATEGORIES } from '../features/charts';
import { downloadFile } from '../features/export';
import { GridChart } from './GridChart';

const CHART_WIDTH = 480;

export function GridChartsPanel<R extends GridValidRowModel = GridValidRowModel>({
  seriesColumns,
  categoryColumns,
  grouped,
  model,
  onModelChange,
  data,
  localeText,
}: GridChartsPanelSlotProps<R>) {
  const chartRef = useRef<HTMLDivElement>(null);
  const hasSeries = model.series.length > 0;
  const scatterNeedsTwo = model.type === 'scatter' && model.series.length < 2;
  const toggle = (field: string) =>
    onModelChange({
      ...model,
      series: model.series.includes(field) ? model.series.filter((item) => item !== field) : [...model.series, field],
    });

  const download = () => {
    const svg = chartRef.current?.querySelector('svg');
    if (svg) {
      const clone = svg.cloneNode(true) as SVGSVGElement;
      clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      downloadFile('chart.svg', new XMLSerializer().serializeToString(clone), 'image/svg+xml');
    }
  };

  return (
    <Box sx={{ p: 2, width: CHART_WIDTH + 32, maxWidth: '90vw' }} role="dialog" aria-label={localeText.chartsPanelTitle}>
      <Box sx={{ display: 'flex', gap: 1, mb: 1.5 }}>
        <TextField
          select
          size="small"
          label={localeText.chartsType}
          value={model.type}
          onChange={(event) => onModelChange({ ...model, type: event.target.value as typeof model.type })}
          sx={{ flex: 1 }}
        >
          {CHART_TYPES.map((type) => (
            <MenuItem key={type} value={type}>
              {localeText.chartTypeLabel(type)}
            </MenuItem>
          ))}
        </TextField>
        {!grouped && (
          <TextField
            select
            size="small"
            label={localeText.chartsCategory}
            value={model.categoryField ?? ''}
            onChange={(event) => onModelChange({ ...model, categoryField: event.target.value === '' ? undefined : event.target.value })}
            sx={{ flex: 1 }}
          >
            <MenuItem value="">{localeText.chartsAutoCategory}</MenuItem>
            {categoryColumns.map((column) => (
              <MenuItem key={column.field} value={column.field}>
                {column.headerName ?? column.field}
              </MenuItem>
            ))}
          </TextField>
        )}
      </Box>
      <Typography variant="caption" color="text.secondary">
        {localeText.chartsSeries}
      </Typography>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', columnGap: 2, mb: 1 }}>
        {seriesColumns.map((column) => (
          <FormControlLabel
            key={column.field}
            control={<Checkbox size="small" checked={model.series.includes(column.field)} onChange={() => toggle(column.field)} />}
            label={column.headerName ?? column.field}
          />
        ))}
      </Box>
      <div ref={chartRef}>
        {!hasSeries ? (
          <Typography variant="body2" color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
            {localeText.chartsNoSeries}
          </Typography>
        ) : scatterNeedsTwo ? (
          <Typography variant="body2" color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
            {localeText.chartsScatterNeedsTwo}
          </Typography>
        ) : data.categories.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
            {localeText.chartsNoData}
          </Typography>
        ) : (
          <GridChart type={model.type} data={data} width={CHART_WIDTH} ariaLabel={localeText.chartsPanelTitle} />
        )}
      </div>
      {hasSeries && model.type !== 'scatter' && model.type !== 'pie' && (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, mt: 0.5 }} aria-label="legend">
          {data.series.map((series, index) => (
            <Typography key={series.field} variant="caption" color="text.secondary">
              <Box component="span" sx={{ display: 'inline-block', width: 10, height: 10, mr: 0.5, borderRadius: '2px', bgcolor: (theme) => legendColor(theme, index) }} />
              {series.label}
            </Typography>
          ))}
        </Box>
      )}
      {data.truncated && (
        <Typography variant="caption" color="text.secondary" display="block">
          {localeText.chartsTruncated(MAX_CHART_CATEGORIES)}
        </Typography>
      )}
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 1 }}>
        <Button size="small" startIcon={<FileDownloadIcon />} disabled={!hasSeries || scatterNeedsTwo || data.categories.length === 0} onClick={download}>
          {localeText.chartsDownload}
        </Button>
      </Box>
    </Box>
  );
}

function legendColor(theme: Theme, index: number) {
  const names = ['primary', 'secondary', 'success', 'warning', 'info', 'error'] as const;
  return theme.palette[names[index % names.length] as (typeof names)[number]].main;
}
