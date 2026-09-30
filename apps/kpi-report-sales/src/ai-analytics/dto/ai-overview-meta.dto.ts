import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Кого показывает вкладка AI (решение владельца 30.09.2026): только
 * сотрудников, чьи звонки разбирает AI, с учётом глобального фильтра
 * отчёта. Считается при каждой отдаче — зависит от фильтра запроса.
 */
export class AiOverviewScopeDto {
    @ApiProperty({
        description:
            'Список разбора звонков действует: разбор включён и в нём ' +
            'перечислены сотрудники — в строках вкладки только они. false — ' +
            'ограничения нет: разбираются все сотрудники отдела продаж, ' +
            'разбор выключен или настройка разбора не прочиталась.',
        type: Boolean,
        example: true,
    })
    pilotActive: boolean;

    @ApiProperty({
        description:
            'Сколько сотрудников в строках ответа: выбранные в фильтре ' +
            'отчёта (без фильтра — весь отдел продаж), чьи звонки разбирает ' +
            'AI, в пределах видимости пользователя. 0 при действующем списке ' +
            'разбора — в фильтре нет никого из разбора.',
        type: Number,
        example: 1,
    })
    shownManagers: number;

    @ApiProperty({
        description:
            'Сколько выбранных в фильтре отчёта сотрудников скрыто, потому ' +
            'что их звонки AI не разбирает (их нет в списке разбора). 0 — ' +
            'фильтра нет либо список разбора не действует.',
        type: Number,
        example: 7,
    })
    hiddenByPilot: number;
}

/**
 * Служебная сводка обзора: объёмы, исключения и флаги расчёта. Вынесена из
 * `ai-overview.dto.ts` по лимиту 300 строк. Поля, появившиеся без смены
 * версии ключа обзора, необязательны (кэш старой формы их не содержит);
 * scope и счётчики исключений пришли с версией ключа v5 — обязательны.
 */
export class AiOverviewMetaDto {
    @ApiProperty({
        description:
            'Звонков, обработанных AI-конвейером за период (готовые ' +
            'транскрипции), не звонки телефонии: по сотрудникам обзора и ' +
            'звонки, у которых сотрудник не сохранён.',
        type: Number,
        example: 640,
    })
    totalCalls: number;

    @ApiProperty({
        description: 'Разобранных сравнимых звонков в слое качества.',
        type: Number,
        example: 410,
    })
    analyzedCalls: number;

    @ApiProperty({
        description:
            'Разобранных AI звонков, у которых не сохранён сотрудник: в ' +
            'строки менеджеров и итоги не попали.',
        type: Number,
        example: 12,
    })
    skippedNoManager: number;

    @ApiPropertyOptional({
        description:
            'Разобранных звонков периода, исключённых из оценок как ' +
            'несопоставимые: разобран старой версией разбора (до даты ' +
            'сравнимости периода — сменилась версия промпта, рубрики или ' +
            'классификатора, старые разборы считались по другим правилам). ' +
            'Это не поломка: число падает по мере накопления разборов новой ' +
            'версии. Нет поля — обзор из кэша, собранного до появления ' +
            'счётчика.',
        type: Number,
        example: 214,
    })
    excludedBeforeComparable?: number;

    @ApiProperty({
        description:
            'Разобранных звонков короче порога длительности своего типа ' +
            '(порог портала, по умолчанию 300 с): в оценки не входят.',
        type: Number,
        example: 35,
    })
    excludedShort: number;

    @ApiProperty({
        description:
            'Разобранных звонков, которым AI не определил тип: в оценки не ' +
            'входят.',
        type: Number,
        example: 4,
    })
    excludedNoType: number;

    @ApiProperty({
        description:
            'Звонков, обработанных конвейером, но без разбора AI (разбор не ' +
            'удался или ещё не записан): в оценки не входят.',
        type: Number,
        example: 9,
    })
    excludedNoAnalysis: number;

    @ApiProperty({
        description: 'Доля other + irrelevant среди разобранных, %.',
        type: Number,
        example: 6.3,
    })
    otherSharePct: number;

    @ApiProperty({
        description: 'Несогласий (feedback disagree) за период.',
        type: Number,
        example: 3,
    })
    disagreementsCount: number;

    @ApiProperty({
        description: 'Результат отдан из кэша.',
        type: Boolean,
        example: true,
    })
    fromCache: boolean;

    @ApiProperty({
        description: 'Момент расчёта (ISO, UTC).',
        type: String,
        example: '2026-09-06T02:31:12.000Z',
    })
    generatedAt: string;

    @ApiProperty({
        description: 'Флаг confirmedOnly запроса (в Фазе 1b не применяется).',
        type: Boolean,
        example: false,
    })
    confirmedOnly: boolean;

    @ApiProperty({
        description:
            'Кого показывает вкладка: только сотрудники из разбора звонков ' +
            'с учётом фильтра отчёта. Итоги, итоги отделов, возражения и ' +
            '«год назад» считаются по тем же сотрудникам.',
        type: AiOverviewScopeDto,
    })
    scope: AiOverviewScopeDto;
}
