export interface ProcessStep {
  stationName: string;
  taktTime: number;
  actualTime: number;
}

export interface AnalyzedStep extends ProcessStep {
  delay: number;
  status: "Optimal" | "Minor Deviation" | "Critical";
}

export interface StationAggregate {
  stationName: string;
  taktTime: number;
  avgActualTime: number;
  avgDelay: number;
  totalShifts: number;
  criticalCount: number;
  minorCount: number;
  optimalCount: number;
  isChronic: boolean; // %50+ vardiyada Critical = kalıcı/yapısal sorun
}

export interface AnalysisSummary {
  totalDelayMetrics: number;
  criticalBottleneck: string;
  bottleneckAvgDelay: number;
  bottleneckIsChronic: boolean;
  wasteCost: number;
}

export interface AnalysisResult {
  steps: AnalyzedStep[];
  stationAggregates: StationAggregate[];
  summary: AnalysisSummary;
}

// Bir istasyonun "Critical" sayılması için minimum eşik:
// - takt time'ın %15'inden fazla sapma VEYA
// - 5 dakikadan fazla mutlak sapma
// Bu, küçük ölçüm gürültüsünün yanlışlıkla "kritik" olarak işaretlenmesini önler.
function getStatus(
  delay: number,
  taktTime: number,
): "Optimal" | "Minor Deviation" | "Critical" {
  if (delay <= 0) return "Optimal";

  const percentDeviation = taktTime > 0 ? (delay / taktTime) * 100 : 0;
  const isCritical = percentDeviation > 15 || delay > 5;

  if (isCritical) return "Critical";
  return "Minor Deviation";
}

function classifySteps(data: ProcessStep[]): AnalyzedStep[] {
  return data.map((step) => {
    const delay = step.actualTime - step.taktTime;
    const status = getStatus(delay, step.taktTime);
    return {
      ...step,
      delay,
      status,
    };
  });
}

// Aynı istasyon adına sahip tüm satırları (vardiyaları) grupla ve
// ortalama/tutarlılık bazlı metrikler çıkar. Tek seferlik anomaliler
// ile kalıcı/yapısal sorunları ayırt etmek için kullanılır.
function aggregateByStation(steps: AnalyzedStep[]): StationAggregate[] {
  const groups = new Map<string, AnalyzedStep[]>();

  for (const step of steps) {
    if (!groups.has(step.stationName)) {
      groups.set(step.stationName, []);
    }
    groups.get(step.stationName)!.push(step);
  }

  const aggregates: StationAggregate[] = [];

  for (const [stationName, rows] of groups.entries()) {
    const totalShifts = rows.length;
    const taktTime = rows[0].taktTime;

    const avgActualTime =
      rows.reduce((sum, r) => sum + r.actualTime, 0) / totalShifts;
    const avgDelay = rows.reduce((sum, r) => sum + r.delay, 0) / totalShifts;

    const criticalCount = rows.filter((r) => r.status === "Critical").length;
    const minorCount = rows.filter(
      (r) => r.status === "Minor Deviation",
    ).length;
    const optimalCount = rows.filter((r) => r.status === "Optimal").length;

    aggregates.push({
      stationName,
      taktTime,
      avgActualTime: Math.round(avgActualTime * 10) / 10,
      avgDelay: Math.round(avgDelay * 10) / 10,
      totalShifts,
      criticalCount,
      minorCount,
      optimalCount,
      isChronic: criticalCount / totalShifts >= 0.5,
    });
  }

  return aggregates;
}

export function analyzeProcessData(
  data: ProcessStep[],
  costPerMinute: number = 15,
): AnalysisResult {
  const analyzedSteps = classifySteps(data);
  const stationAggregates = aggregateByStation(analyzedSteps);

  // Sadece gerçek (kritik seviyede) sapmalar toplam gecikmeye ve maliyete eklenir.
  // Minor Deviation'lar gürültü kabul edilir ve maliyete dahil edilmez.
  const totalDelay = analyzedSteps
    .filter((s) => s.status === "Critical")
    .reduce((sum, s) => sum + s.delay, 0);

  // Bottleneck seçimi: tek seferlik en yüksek delay'e göre DEĞİL,
  // önce "kronik" (vardiyaların yarısından fazlasında Critical) istasyonlar
  // arasından en yüksek ortalama delay'e göre seçilir. Kronik istasyon yoksa
  // en yüksek ortalama delay'e sahip istasyon seçilir.
  let bottleneck: StationAggregate | null = null;

  const chronicStations = stationAggregates.filter((s) => s.isChronic);
  const candidatePool =
    chronicStations.length > 0 ? chronicStations : stationAggregates;

  for (const station of candidatePool) {
    if (!bottleneck || station.avgDelay > bottleneck.avgDelay) {
      bottleneck = station;
    }
  }

  const wasteCost = totalDelay * costPerMinute;

  return {
    steps: analyzedSteps,
    stationAggregates,
    summary: {
      totalDelayMetrics: totalDelay,
      criticalBottleneck: bottleneck?.stationName || "None",
      bottleneckAvgDelay: bottleneck?.avgDelay ?? 0,
      bottleneckIsChronic: bottleneck?.isChronic ?? false,
      wasteCost,
    },
  };
}
