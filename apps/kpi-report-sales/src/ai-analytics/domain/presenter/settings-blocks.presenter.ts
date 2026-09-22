import {
    AI_MANAGER_LEVELS,
    type AiAbsencesByManager,
    type AiTargets,
} from '@lib/sales-ai-analytics';
import type {
    AiManagerAbsencesDto,
    AiTargetsDto,
} from '../../dto/ai-settings-blocks.dto';

/**
 * Текущие решения людей из настроек портала → блоки ответа `settings/get`
 * в той же форме, что принимает `settings/save`: фронт предзаполняет ими
 * форму (цели по уровням, личные цели, отсутствия), а сохраняет только
 * тронутые блоки. Записи с нечисловым managerId (битый JSON ключа)
 * отбрасываются, как и менеджеры без отрезков отсутствий.
 */
export function toTargetsDto(targets: AiTargets): AiTargetsDto {
    return {
        byLevel: AI_MANAGER_LEVELS.map(level => ({
            level,
            sales: targets.byLevel[level].sales,
            presentationsMin: targets.byLevel[level].presentationsMin,
            coldPerDay: targets.byLevel[level].coldPerDay,
        })),
        overrides: Object.entries(targets.overrides)
            .map(([managerId, sales]) => ({
                managerId: Number(managerId),
                sales,
            }))
            .filter(override => isManagerId(override.managerId)),
    };
}

export function toAbsencesDto(
    absences: AiAbsencesByManager,
): AiManagerAbsencesDto[] {
    return Object.entries(absences)
        .map(([managerId, items]) => ({
            managerId: Number(managerId),
            items: items.map(({ from, to, kind }) => ({ from, to, kind })),
        }))
        .filter(
            entry => isManagerId(entry.managerId) && entry.items.length > 0,
        );
}

/** Дата подтверждения состава: '' в настройках → null в ответе. */
export function toRosterConfirmedAt(value: string): string | null {
    return value ? value : null;
}

function isManagerId(value: number): boolean {
    return Number.isInteger(value) && value > 0;
}
