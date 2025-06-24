export type UnitSystem = 'imperial' | 'metric';

export interface ImperialMetrics {
  feet: number;
  inches: number;
  pounds: number;
}

export interface MetricMetrics {
  height: number; // cm
  weight: number; // kg
}

export function imperialToMetric(imperial: ImperialMetrics): MetricMetrics {
  return {
    height: Math.round((imperial.feet * 12 + imperial.inches) * 2.54),
    weight: Math.round(imperial.pounds * 0.453592),
  };
}

export function metricToImperial(metric: MetricMetrics): ImperialMetrics {
  const totalInches = metric.height / 2.54;
  return {
    feet: Math.floor(totalInches / 12),
    inches: Math.round(totalInches % 12),
    pounds: Math.round(metric.weight / 0.453592),
  };
} 