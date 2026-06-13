export interface ProcessStep {
  stationName: string;
  taktTime: number;
  actualTime: number;
}

export interface AnalyzedStep extends ProcessStep {
  delay: number;
  status: "Optimal" | "Critical";
}

export function analyzeProcessData(data: ProcessStep[]) {
  let totalDelay = 0;
  let bottleneckStation: string | null = null;
  let maxDelay = 0;

  const analyzedSteps: AnalyzedStep[] = data.map((step) => {
    const delay = step.actualTime - step.taktTime;
    const isBottleneck = delay > 0;

    if (isBottleneck) {
      totalDelay += delay;
      if (delay > maxDelay) {
        maxDelay = delay;
        bottleneckStation = step.stationName;
      }
    }

    return {
      ...step,
      delay,
      status: delay <= 0 ? "Optimal" : "Critical",
    };
  });

  // Cost of waste per minute (e.g., €15 for the German Mittelstand industry average)
  const COST_PER_MINUTE = 15;
  const totalWasteCost = totalDelay * COST_PER_MINUTE;

  return {
    steps: analyzedSteps,
    summary: {
      totalDelayMetrics: totalDelay,
      criticalBottleneck: bottleneckStation || "None",
      wasteCost: totalWasteCost,
    },
  };
}
