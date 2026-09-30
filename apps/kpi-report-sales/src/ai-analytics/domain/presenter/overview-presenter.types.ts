import type { MinDurationSecByType } from '@lib/sales-ai-analytics';
import type { OverviewSources } from '../assembler/overview-model.types';
import type { LevelPassport } from './level.util';
import type { ReadinessStageSources } from './readiness-stages.util';

/**
 * Периметр обзора из AiManagerScopeResolver (фильтр отчёта ∩ список
 * разбора звонков) — то, что не восстановить по самим managerIds.
 */
export interface OverviewScopeSource {
    /** Список разбора действует (разбор включён, список непуст). */
    pilotActive: boolean;
    /** Сотрудников явного фильтра, скрытых списком разбора. */
    hiddenByPilot: number;
}

/**
 * Источники презентера: контракт обзора плюс паспорта месячных снапшотов
 * (уровень и стаж строки), ступени Фазы 4, периметр строк и порог
 * длительности портала. Поля не в `OverviewSources`: тот контракт правит
 * соседний поток (приём `OverviewYoySnapshots`).
 */
export interface OverviewPresenterSources extends OverviewSources {
    passports?: ReadonlyMap<string, LevelPassport>;
    /** Ступени Фазы 4 (L4/L5): свежие снапшоты и флаги портала, как у /settings. */
    stageSources?: ReadinessStageSources;
    /**
     * Периметр строк: задан — строки и lite-строки звонков режутся ровно по
     * managerIds (фильтр ∩ список разбора; звонки без сотрудника остаются
     * для meta.skippedNoManager), итоги, итоги отделов, возражения, «год
     * назад» и медиана команды — по тем же людям. Не задан — прежнее
     * объединение ростера с менеджерами матрицы (ручные сборки и фикстуры).
     */
    scope?: OverviewScopeSource;
    /**
     * Порог «короткого» звонка портала по типам (portalMinDurationByType —
     * тот же, что у пульса); не задан — дефолт матрицы 300 с.
     */
    minDurationSecByType?: MinDurationSecByType;
}
