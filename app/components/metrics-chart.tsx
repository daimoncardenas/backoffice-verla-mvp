"use client";

import { useEffect, useRef } from "react";

import type { MetricGroup } from "../lib/types";

export function MetricsChart({ groups }: { groups: MetricGroup[] }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas || groups.length === 0) {
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
      const accentTwo =
        styles.getPropertyValue("--accent-2").trim() || "#7c5cff";

      chart = new Chart(targetCanvas, {
        type: "bar",
        data: {
          labels: groups.map((group) => group.goal_name),
          datasets: [
            {
              label: "Objetivo",
              data: groups.map((group) => group.target_value),
              backgroundColor: `${accentTwo}66`,
              borderColor: accentTwo,
              borderWidth: 1,
              borderRadius: 6,
            },
            {
              label: "Real",
              data: groups.map((group) => group.actual_value),
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
            legend: {
              labels: { color: textColor, boxWidth: 10, boxHeight: 10 },
            },
            tooltip: { enabled: true },
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
  }, [groups]);

  if (groups.length === 0) {
    return null;
  }

  return (
    <div className="chart-box">
      <canvas ref={canvasRef} />
    </div>
  );
}
