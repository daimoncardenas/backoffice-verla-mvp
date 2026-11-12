"use client";

import { useEffect, useRef } from "react";

export interface TypeCount {
  label: string;
  value: number;
}

export function ActivityTypeChart({ data }: { data: TypeCount[] }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas || data.length === 0) {
      return;
    }

    let chart: { destroy: () => void } | null = null;
    let cancelled = false;
    const targetCanvas = canvas;

    async function render() {
      const {
        Chart,
        BarController,
        BarElement,
        CategoryScale,
        LinearScale,
        Tooltip,
        Legend,
      } = await import("chart.js");

      if (cancelled) {
        return;
      }

      Chart.register(
        BarController,
        BarElement,
        CategoryScale,
        LinearScale,
        Tooltip,
        Legend,
      );

      const styles = getComputedStyle(document.documentElement);
      const textColor = styles.getPropertyValue("--muted").trim() || "#8d9bb3";
      const gridColor =
        styles.getPropertyValue("--border").trim() || "rgba(148,163,184,.16)";
      const accent = styles.getPropertyValue("--accent").trim() || "#26e0c8";

      chart = new Chart(targetCanvas, {
        type: "bar",
        data: {
          labels: data.map((item) => item.label),
          datasets: [
            {
              label: "Actividades completadas",
              data: data.map((item) => item.value),
              backgroundColor: `${accent}99`,
              borderColor: accent,
              borderWidth: 1,
              borderRadius: 6,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: { duration: 450 },
          plugins: {
            legend: { labels: { color: textColor } },
          },
          scales: {
            x: {
              ticks: { color: textColor, maxRotation: 0 },
              grid: { color: gridColor },
            },
            y: {
              beginAtZero: true,
              ticks: { color: textColor, precision: 0 },
              grid: { color: gridColor },
            },
          },
        },
      });
    }

    void render();

    return () => {
      cancelled = true;
      chart?.destroy();
    };
  }, [data]);

  if (data.length === 0) {
    return null;
  }

  return (
    <div className="chart-box">
      <canvas ref={canvasRef} />
    </div>
  );
}
