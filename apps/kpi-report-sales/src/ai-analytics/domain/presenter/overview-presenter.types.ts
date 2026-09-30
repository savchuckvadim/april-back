import type { OverviewSources } from '../assembler/overview-model.types';
import type { LevelPassport } from './level.util';
import type { ReadinessStageSources } from './readiness-stages.util';

/**
 * Источники презентера: контракт обзора плюс паспорта месячных снапшотов
 * (уровень и стаж строки) и ступени Фазы 4. Поля не в `OverviewSources`:
 * тот контракт правит соседний поток (приём `OverviewYoySnapshots`).
 */
export interface OverviewPresenterSources extends OverviewSources {
    passports?: ReadonlyMap<string, LevelPassport>;
    /** Ступени Фазы 4 (L4/L5): свежие снапшоты и флаги портала, как у /settings. */
    stageSources?: ReadinessStageSources;
}
