import { CONFIG } from '../config.js';

/** @type {import('chart.js').Chart|null} */
let _chart = null;

/**
 * Render or replace the investment simulation line chart.
 *
 * @param {string} canvasId
 * @param {Array<{label: string, points: Array<{date:string, value:number}>, dashed?:boolean, colorOverride?:string}>} datasets
 */
export function renderSimulationChart(canvasId, datasets) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  if (_chart) {
    _chart.destroy();
    _chart = null;
  }

  const ctx = canvas.getContext('2d');

  _chart = new Chart(ctx, {
    type: 'line',
    data: {
      datasets: datasets.map((ds, i) => {
        const color = ds.colorOverride ?? CONFIG.CHART_COLORS[i % CONFIG.CHART_COLORS.length];
        return {
          label: ds.label,
          data: ds.points.map((p) => ({ x: p.date, y: +p.value.toFixed(2) })),
          borderColor: color,
          backgroundColor: color + '18',
          borderWidth: ds.dashed ? 1.5 : 2,
          borderDash: ds.dashed ? [6, 4] : [],
          fill: false,
          pointRadius: 0,
          pointHoverRadius: 5,
          tension: 0.1,
        };
      }),
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      animation: { duration: 400 },
      plugins: {
        legend: {
          labels: {
            color: '#8b949e',
            font: { size: 12 },
            boxWidth: 14,
          },
        },
        tooltip: {
          backgroundColor: '#1c2128',
          borderColor: '#30363d',
          borderWidth: 1,
          titleColor: '#e6edf3',
          bodyColor: '#8b949e',
          callbacks: {
            label: (ctx) => `  ${ctx.dataset.label}: $${ctx.parsed.y.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          },
        },
      },
      scales: {
        x: {
          type: 'time',
          time: { unit: 'month', tooltipFormat: 'MMM d, yyyy' },
          grid: { color: '#21262d' },
          ticks: { color: '#8b949e', maxTicksLimit: 10 },
        },
        y: {
          grid: { color: '#21262d' },
          ticks: {
            color: '#8b949e',
            callback: (val) => `$${Number(val).toLocaleString()}`,
          },
        },
      },
    },
  });
}
