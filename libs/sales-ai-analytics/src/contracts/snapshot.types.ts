import { MetricValue } from '../model/metric';
import { AnalysisVersions } from './versions.types';

/**
 * Заготовка Фазы 2: снапшот навыков менеджера за период (месяц/окно),
 * из которого строятся ряды трендов и досье. Метрики — по кодам
 * (раздел рубрики, ребро воронки, доля чек-листа), значения — MetricValue.
 */
export interface SkillSnapshot {
    domain: string;
    managerId: string;
    /** Ключ периода: 'YYYY-MM' или 'YYYY-Www'. */
    periodKey: string;
    versions: AnalysisVersions;
    metrics: Record<string, MetricValue>;
}
