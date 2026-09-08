/**
 * Перекладка DTO сохранения настроек в доменные блоки и обратно в
 * JSON-строки ключей схемы (план Фазы 2, §3.3).
 *
 * Одно правило нормализации на весь поток: и «что было», и «что стало»
 * проходят через **те же парсеры lib**. Иначе первое сохранение показало бы
 * разницу там, где поменялся лишь порядок ключей, и зря сдвинуло бы
 * `comparableFrom`.
 */
import {
    parseAiAbsences,
    parseAiDefinitions,
    parseAiEvents,
    parseAiHypothesis,
    parseAiLevels,
    parseAiManagerParams,
    parseAiModelParams,
    parseAiScoring,
    parseAiTargets,
    parseRosterConfirmedAt,
} from '@lib/sales-ai-analytics/settings/ai-settings.parse';
import type { AiSettingsClaim } from '@lib/sales-ai-analytics/settings/ai-settings.sanity';
import type {
    AiManagerParams,
    AiPortalEvent,
    AiPortalSettingsBlocks,
    AiSettingsKeyName,
    AiSettingsRaw,
} from '@lib/sales-ai-analytics/settings/ai-settings.types';
import type { AiAnalyticsPortalSettings } from '../loaders/settings.loader';
import type { AiManagerParamsDto } from '../../dto/ai-settings-manager.dto';
import type { AiSettingsSaveRequestDto } from '../../dto/ai-settings-save.dto';

/** Настройки портала → десять блоков Фазы 2 (без флагов и календаря). */
export function blocksOf(
    settings: AiAnalyticsPortalSettings,
): AiPortalSettingsBlocks {
    return {
        levels: settings.levels,
        targets: settings.targets,
        absences: settings.absences,
        modelParams: settings.modelParams,
        managerParams: settings.managerParams,
        definitions: settings.definitions,
        events: settings.events,
        scoring: settings.scoring,
        hypothesis: settings.hypothesis,
        rosterConfirmedAt: settings.rosterConfirmedAt,
    };
}

/** Массив «managerId + значение» → запись, ожидаемая настройкой. */
function byManagerId<TItem extends { managerId: number }, TValue>(
    items: readonly TItem[] | undefined,
    pick: (item: TItem) => TValue,
): Record<string, TValue> | undefined {
    if (!items) return undefined;
    return Object.fromEntries(
        items.map(item => [String(item.managerId), pick(item)]),
    );
}

/** DTO слоя менеджера → значения без managerId (он уходит в ключ записи). */
function managerParamsOf(item: AiManagerParamsDto): AiManagerParams {
    const params: AiManagerParams = {};
    if (item.fteShare !== undefined) params.fteShare = item.fteShare;
    if (item.targetOverride !== undefined) {
        params.targetOverride = item.targetOverride;
    }
    if (item.trainingMinPresentations !== undefined) {
        params.trainingMinPresentations = item.trainingMinPresentations;
    }
    if (item.excludeFromNorms !== undefined) {
        params.excludeFromNorms = item.excludeFromNorms;
    }
    if (item.alertsMuted !== undefined) params.alertsMuted = item.alertsMuted;
    if (item.digestEnabled !== undefined) {
        params.digestEnabled = item.digestEnabled;
    }
    if (item.mentorUserId !== undefined) {
        params.mentorUserId = item.mentorUserId;
    }
    if (item.workweek !== undefined) params.workweek = item.workweek;
    if (item.timeZone !== undefined) params.timeZone = item.timeZone;
    return params;
}

/** DTO → заявка на изменение: значения ещё не проверены на диапазоны. */
export function toClaim(dto: AiSettingsSaveRequestDto): AiSettingsClaim {
    const claim: AiSettingsClaim = {};
    if (dto.levels) {
        claim.levels = dto.levels.map(level => ({
            managerId: level.managerId,
            level: level.level,
            since: level.since ?? null,
            source: 'manual' as const,
        }));
    }
    if (dto.targets) {
        claim.targets = {
            byLevel: Object.fromEntries(
                dto.targets.byLevel.map(target => [
                    target.level,
                    {
                        sales: target.sales ?? null,
                        presentationsMin: target.presentationsMin,
                        coldPerDay: target.coldPerDay,
                    },
                ]),
            ) as AiPortalSettingsBlocks['targets']['byLevel'],
            overrides:
                byManagerId(
                    dto.targets.overrides,
                    item => item.sales ?? null,
                ) ?? {},
        };
    }
    const absences = byManagerId(dto.absences, item => item.items);
    if (absences) claim.absences = absences;
    const managerParams = byManagerId(dto.managerParams, managerParamsOf);
    if (managerParams) claim.managerParams = managerParams;
    if (dto.definitions) {
        const { minDurationSecByType, ...rest } = dto.definitions;
        claim.definitions = {
            ...rest,
            ...(minDurationSecByType
                ? {
                      minDurationSecByType: Object.fromEntries(
                          minDurationSecByType.map(item => [
                              item.callType,
                              item.seconds,
                          ]),
                      ),
                  }
                : {}),
        };
    }
    if (dto.events) claim.events = dto.events.map(event => ({ ...event }));
    if (dto.modelParams) {
        claim.modelParams = Object.fromEntries(
            dto.modelParams.map(param => [param.code, param.value]),
        );
    }
    if (dto.scoring) claim.scoring = dto.scoring;
    if (dto.hypothesis) {
        claim.hypothesis = {
            pairs: dto.hypothesis.pairs,
            since: dto.hypothesis.since ?? '',
            author: dto.hypothesis.author ?? '',
        };
    }
    if (dto.rosterConfirmedAt !== undefined) {
        claim.rosterConfirmedAt = dto.rosterConfirmedAt;
    }
    return claim;
}

/** Bitrix-id менеджеров, упомянутых в заявке — для проверки периметра. */
export function claimManagerIds(claim: AiSettingsClaim): string[] {
    return [
        ...new Set([
            ...(claim.levels ?? []).map(level => String(level.managerId)),
            ...Object.keys(claim.absences ?? {}),
            ...Object.keys(claim.managerParams ?? {}),
            ...Object.keys(claim.targets?.overrides ?? {}),
        ]),
    ];
}

/** Заявка поверх текущих блоков; нормализация — парсерами lib. */
export function mergeBlocks(
    current: AiPortalSettingsBlocks,
    claim: AiSettingsClaim,
    extraEvents: readonly AiPortalEvent[] = [],
): AiPortalSettingsBlocks {
    const json = (value: unknown): string => JSON.stringify(value);
    const events = [...(claim.events ?? current.events), ...extraEvents];
    return {
        levels: claim.levels
            ? parseAiLevels(json(claim.levels))
            : current.levels,
        targets: claim.targets
            ? parseAiTargets(json(claim.targets))
            : current.targets,
        absences: claim.absences
            ? parseAiAbsences(json(claim.absences))
            : current.absences,
        modelParams: claim.modelParams
            ? parseAiModelParams(json(claim.modelParams))
            : current.modelParams,
        managerParams: claim.managerParams
            ? parseAiManagerParams(json(claim.managerParams))
            : current.managerParams,
        definitions: claim.definitions
            ? parseAiDefinitions(
                  json({
                      ...definitionsPayload(current),
                      ...claim.definitions,
                  }),
              )
            : current.definitions,
        events: parseAiEvents(json(events)),
        scoring: claim.scoring
            ? parseAiScoring(json(claim.scoring))
            : current.scoring,
        hypothesis:
            claim.hypothesis !== undefined
                ? parseAiHypothesis(json(claim.hypothesis))
                : current.hypothesis,
        rosterConfirmedAt:
            claim.rosterConfirmedAt !== undefined
                ? parseRosterConfirmedAt(claim.rosterConfirmedAt)
                : current.rosterConfirmedAt,
    };
}

/** Хранимая форма определений: `hotStageCode` выводится, а не хранится. */
function definitionsPayload(
    blocks: AiPortalSettingsBlocks,
): Record<string, unknown> {
    const stored: Record<string, unknown> = { ...blocks.definitions };
    delete stored.hotStageCode;
    return stored;
}

/** Блоки → JSON-строки ключей схемы (то, что ляжет в настройки портала). */
export function serializeBlocks(blocks: AiPortalSettingsBlocks): AiSettingsRaw {
    return {
        levels: JSON.stringify(blocks.levels),
        targets: JSON.stringify(blocks.targets),
        absences: JSON.stringify(blocks.absences),
        modelParams: JSON.stringify(blocks.modelParams),
        managerParams: JSON.stringify(blocks.managerParams),
        definitions: JSON.stringify(definitionsPayload(blocks)),
        events: JSON.stringify(blocks.events),
        scoring: JSON.stringify(blocks.scoring),
        hypothesis: blocks.hypothesis ? JSON.stringify(blocks.hypothesis) : '',
        rosterConfirmedAt: blocks.rosterConfirmedAt,
    };
}

/** Ключи, значение которых действительно изменилось. */
export function changedKeys(
    before: AiSettingsRaw,
    after: AiSettingsRaw,
): AiSettingsKeyName[] {
    return (Object.keys(after) as AiSettingsKeyName[]).filter(
        name => before[name] !== after[name],
    );
}
