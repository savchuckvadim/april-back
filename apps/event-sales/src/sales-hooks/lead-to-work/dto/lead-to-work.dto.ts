import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { ApiBxHookUserId } from '@/core/decorators/dto/api-bx-hook-user-id.decorator';
import {
    LEAD_WORK_KIND_VALUES,
    LeadWorkKind,
} from '../../../shared/event-title';
import { SalesHookRunRequestBaseDto } from '../../core/dto/sales-hook-run-request.dto';
import { PbxDealSalesBaseStageCode } from '@lib/portal-lib/pbx-domain/portal-deal/sales/base/const/pbx-deal-sales-base-stages.const';

/**
 * Описание параметра `workKind` — одно на вебхук робота и кнопку фрейма,
 * чтобы формулировка вида работы не разъезжалась между двумя входами.
 */
const WORK_KIND_DESCRIPTION =
    'Вид холодной работы — КТО КОГО ЖДЁТ. Решается В БИТРИКСЕ (роботом или ' +
    'кнопкой), бэкенд только переносит решение дальше. Три значения:\n\n' +
    '• `cold` — «Холодный»: клиент нас НЕ ждёт, инициатива наша, звоним ' +
    'первыми по своей базе. Заголовок задачи «Холодный обзвон {Название}» ' +
    '(фрейм читает eventType `xo`).\n\n' +
    '• `lead` — «Лид»: клиент обратился САМ, но не структурированной ' +
    'заявкой — входящий звонок, письмо, чат, открытая линия. Заголовок ' +
    '«Холодный обзвон. Лид. {Название}» (eventType `xoLead`).\n\n' +
    '• `request` — «Заявка»: клиент оставил заявку на сайте/в форме — есть ' +
    'что обсуждать предметно. Заголовок «Холодный обзвон. Заявка. ' +
    '{Название}» (eventType `xoRequest`).\n\n' +
    'ЧЕМ `cold` ОТЛИЧАЕТСЯ ОТ `lead` НА ПРАКТИКЕ (частый вопрос). Ровно ' +
    'тремя вещами: (1) слово в заголовке задачи, а через него — тип ' +
    'события во фрейме, то есть какой сценарий разговора видит менеджер; ' +
    '(2) код события в KPI-списке — «холодные» и «входящие» считаются ' +
    'раздельно; (3) `lead` и `request` считаются ВХОДЯЩЕЙ работой ' +
    '(isRequest=true) и получают метку пути заявки `op_lead_site_status` = ' +
    '«Появилась», а `cold` — нет. Всё остальное одинаково: ХО-сделка, ' +
    'задача, round-robin, таймер подтверждения и SLA непринятия работают ' +
    'во всех трёх видах.\n\n' +
    'По бизнес-смыслу `lead` ближе к `request`, чем к `cold`: в обоих ' +
    'случаях клиент уже проявил интерес и ждёт ответа — отсюда и общий ' +
    'isRequest. Отдельный вид нужен потому, что разговор с оставившим ' +
    'заявку и со звонившим «просто спросить» строится по-разному.\n\n' +
    'Вид пишется в поле лида `op_lead_work_kind` и дальше становится ' +
    'источником истины: он переживает ручные правки карточки и не зависит ' +
    'от настроек портала (в отличие от штатного SOURCE_ID).\n\n' +
    'Не передан — вид берётся из legacy-флага isRequest (Y → request, ' +
    'N → cold), а без него — автодетект по полям лида: ' +
    '`op_lead_work_kind` → поля лидогена (UF_CRM_REG_NUMBER, ' +
    'UF_CRM_LEAD_QUEST_URL) → наши метки пути → SOURCE_ID. Значение ' +
    '`undef` («Неопределён») в поле лида означает «робот не знает» и ' +
    'разбор НЕ заканчивает — бэкенд доопределяет вид по остальным ' +
    'признакам. Сам параметр `undef` не принимает: если вид неизвестен, ' +
    'просто не передавайте его.';

/**
 * Описание параметра `isRequest` — одно на оба входа. Флаг legacy: держим
 * ради роботов, настроенных до появления `workKind`, и формулировка обязана
 * честно говорить, где он слабее.
 */
const IS_REQUEST_DESCRIPTION =
    'LEGACY-признак «это ЗАЯВКА» от робота. Оставлен для роботов, ' +
    'настроенных до появления `workKind`; в новых сценариях используйте ' +
    '`workKind` — он выразительнее.\n\n' +
    'Y — считать входящей заявкой (вид работы `request`): заголовок задачи ' +
    '«Холодный обзвон. Заявка. {Название}», метка пути ' +
    '`op_lead_site_status` = «Появилась», свой код события в KPI.\n' +
    'N — считать холодным обзвоном (вид работы `cold`): заголовок ' +
    '«Холодный обзвон {Название}», метки пути не ставятся.\n\n' +
    'ОГРАНИЧЕНИЕ: флаг двоичный и третий вид работы — входящий лид ' +
    '(`lead`: клиент позвонил/написал сам, но заявки не оставлял) — им не ' +
    'выражается, такой лид уедет как «Заявка». Нужна эта разница — ' +
    'передавайте `workKind`, он главнее этого флага.\n\n' +
    'Не передан — автодетект по полям лида: `op_lead_work_kind` → поля ' +
    'лидогена (UF_CRM_REG_NUMBER, UF_CRM_LEAD_QUEST_URL) → наши метки ' +
    'пути (op_lead_site_*) → SOURCE_ID.';

/** Y/N-флаги хука в формате, который шлёт робот Битрикса. */
export const LEAD_TO_WORK_FLAG_VALUES = ['Y', 'N'] as const;
export type LeadToWorkFlag = (typeof LEAD_TO_WORK_FLAG_VALUES)[number];

/**
 * Режим стадии создаваемой сделки ОП: from_lead — зеркало стадии лида,
 * cold — «Холодная» (классический ХО), new — «Новая» (заявка, по которой
 * работа стартует с начала воронки, а не с холодного цикла).
 */
export const LEAD_TO_WORK_STAGE_MODES = ['from_lead', 'cold', 'new'] as const;
export type LeadToWorkStageMode = (typeof LEAD_TO_WORK_STAGE_MODES)[number];

/**
 * Что делать с открытыми задачами лида:
 *  - `move` — перенести с префиксом «Звонок»; открытых задач НЕ БЫЛО —
 *    поставить новую, чтобы клиент не остался без следующего шага;
 *  - `move_keep` — то же, но новую НЕ создавать. Режим МАССОВОГО ПЕРЕНОСА
 *    исторической базы (15.09.2026): там «следующий шаг» ставить не надо,
 *    а `move` на тысячах лидов без задач разом завалил бы менеджеров
 *    задачами «Звонок»;
 *  - `close` — закрыть открытые и поставить одну новую;
 *  - `none` — не трогать вовсе и новую не создавать.
 */
export const LEAD_TO_WORK_TASK_MODES = [
    'move',
    'move_keep',
    'close',
    'none',
] as const;
export type LeadToWorkTaskMode = (typeof LEAD_TO_WORK_TASK_MODES)[number];

/**
 * Query-параметры вебхука робота «лид → работа». Параметры идут в query
 * (тело занято BxWebHookDto с auth портала) — как у cold-hook.
 */
export class LeadToWorkWebhookQueryDto {
    @ApiProperty({
        description: 'Идентификатор лида Bitrix, который берётся в работу.',
        example: 42,
        type: Number,
        minimum: 1,
    })
    @IsInt()
    @Min(1)
    leadId: number;

    /**
     * Тип поля — `string` (в рантайме декоратор отдаёт число): при
     * объявленном `number` глобальный ValidationPipe с implicit conversion
     * превратит `'user_447'` в NaN до трансформации. Подробности — в
     * JSDoc `ApiBxHookUserId`. К числу приводит `buildLeadToWorkItem()`.
     *
     * Поле необязательное: без него ответственный выбирается round-robin
     * из отдела продаж (см. `department` и LeadToWorkAssigneeService).
     */
    @ApiBxHookUserId({
        description:
            'Ответственный менеджер — идентификатор пользователя Bitrix ' +
            'в формате хука (user_<id>). Не передан — выбирается ' +
            'round-robin из отдела продаж (намёк — параметр department).',
        optional: true,
    })
    responsible?: string;

    @ApiPropertyOptional({
        description:
            'Намёк на отдел продаж для round-robin выбора ответственного ' +
            '(портал с несколькими ОП). Принимает id («15», «D_15») ЛИБО ' +
            'название отдела/группы («ОП Центр») — матчинг нестрогий. ' +
            'Игнорируется, если передан responsible.',
        example: '15',
        type: String,
    })
    @IsOptional()
    @IsString()
    department?: string;

    @ApiPropertyOptional({
        description:
            'Создать компанию, если у лида её нет (название берётся из ' +
            'лида). По умолчанию N.',
        example: 'Y',
        type: String,
        enum: LEAD_TO_WORK_FLAG_VALUES,
        default: 'N',
    })
    @IsOptional()
    @IsString()
    @IsIn(LEAD_TO_WORK_FLAG_VALUES as unknown as string[])
    createCompany?: LeadToWorkFlag;

    @ApiPropertyOptional({
        description:
            'Режим стадии сделки ОП: from_lead — по зеркалу стадии лида, ' +
            'cold — «Холодная» (как холодный обзвон), new — «Новая» ' +
            '(заявка стартует с начала воронки).',
        example: 'from_lead',
        type: String,
        enum: LEAD_TO_WORK_STAGE_MODES,
        default: 'from_lead',
    })
    @IsOptional()
    @IsString()
    @IsIn(LEAD_TO_WORK_STAGE_MODES as unknown as string[])
    stageMode?: LeadToWorkStageMode;

    @ApiPropertyOptional({
        description:
            'Задачи лида: move — перенести с префиксом «Звонок» (а если ' +
            'открытых задач не было — поставить новую), move_keep — то ' +
            'же, но новую НЕ создавать (режим массового переноса ' +
            'исторической базы), close — закрыть и поставить новую, ' +
            'none — не трогать и новую не создавать.',
        example: 'move',
        type: String,
        enum: LEAD_TO_WORK_TASK_MODES,
        default: 'move',
    })
    @IsOptional()
    @IsString()
    @IsIn(LEAD_TO_WORK_TASK_MODES as unknown as string[])
    taskMode?: LeadToWorkTaskMode;

    @ApiPropertyOptional({
        description:
            'Признак ХО: при Y дополнительно создаётся ХО-сделка и задача ' +
            'называется «Холодный обзвон», как в классическом ХО-хуке.',
        example: 'N',
        type: String,
        enum: LEAD_TO_WORK_FLAG_VALUES,
        default: 'N',
    })
    @IsOptional()
    @IsString()
    @IsIn(LEAD_TO_WORK_FLAG_VALUES as unknown as string[])
    isXo?: LeadToWorkFlag;

    @ApiPropertyOptional({
        description: IS_REQUEST_DESCRIPTION,
        example: 'Y',
        type: String,
        enum: LEAD_TO_WORK_FLAG_VALUES,
    })
    @IsOptional()
    @IsString()
    @IsIn(LEAD_TO_WORK_FLAG_VALUES as unknown as string[])
    isRequest?: LeadToWorkFlag;

    @ApiPropertyOptional({
        description: WORK_KIND_DESCRIPTION,
        example: 'request',
        type: String,
        enum: LEAD_WORK_KIND_VALUES,
    })
    @IsOptional()
    @IsString()
    @IsIn(LEAD_WORK_KIND_VALUES as unknown as string[])
    workKind?: LeadWorkKind;

    @ApiPropertyOptional({
        description:
            'Дедлайн задачи «Звонок» в локали портала (DD.MM.YYYY HH:mm:ss). ' +
            'Без него новая задача создаётся без дедлайна.',
        example: '15.08.2026 10:00:00',
        type: String,
    })
    @IsOptional()
    @IsString()
    deadline?: string;

    @ApiPropertyOptional({
        description:
            'Название события — используется в названии задачи. Без него ' +
            'берётся название лида.',
        example: 'ООО Ромашка',
        type: String,
    })
    @IsOptional()
    @IsString()
    name?: string;
}

/** Тело кнопки фрейма «лид → работа». */
export class LeadToWorkRunDto extends SalesHookRunRequestBaseDto {
    @ApiProperty({
        description: 'Идентификатор лида Bitrix, который берётся в работу.',
        example: 42,
        type: Number,
        minimum: 1,
    })
    @IsInt()
    @Min(1)
    leadId: number;

    @ApiPropertyOptional({
        description:
            'Идентификатор ответственного менеджера. Не передан — ' +
            'выбирается round-robin из отдела продаж (намёк — department).',
        example: 123,
        type: Number,
        minimum: 1,
    })
    @IsOptional()
    @IsInt()
    @Min(1)
    responsible?: number;

    @ApiPropertyOptional({
        description:
            'Намёк на отдел продаж для round-robin выбора ответственного ' +
            '(id отдела). Игнорируется, если передан responsible.',
        example: '15',
        type: String,
    })
    @IsOptional()
    @IsString()
    department?: string;

    @ApiPropertyOptional({
        description:
            'Кого round-robin не должен выбрать (кнопка «Передать другому»: ' +
            'заявка не возвращается прежнему ответственному).',
        example: 447,
        type: Number,
        minimum: 1,
    })
    @IsOptional()
    @IsInt()
    @Min(1)
    excludeResponsible?: number;

    @ApiPropertyOptional({
        description:
            'Сотрудник, который САМ передал заявку: подсвеченная запись в ' +
            'истории обработки, отдел для round-robin — его отдел.',
        example: 447,
        type: Number,
        minimum: 1,
    })
    @IsOptional()
    @IsInt()
    @Min(1)
    transferredBy?: number;

    @ApiPropertyOptional({
        description: 'Создать компанию, если у лида её нет.',
        example: 'N',
        type: String,
        enum: LEAD_TO_WORK_FLAG_VALUES,
        default: 'N',
    })
    @IsOptional()
    @IsString()
    @IsIn(LEAD_TO_WORK_FLAG_VALUES as unknown as string[])
    createCompany?: LeadToWorkFlag;

    @ApiPropertyOptional({
        description: 'Режим стадии сделки ОП.',
        example: 'from_lead',
        type: String,
        enum: LEAD_TO_WORK_STAGE_MODES,
        default: 'from_lead',
    })
    @IsOptional()
    @IsString()
    @IsIn(LEAD_TO_WORK_STAGE_MODES as unknown as string[])
    stageMode?: LeadToWorkStageMode;

    @ApiPropertyOptional({
        description:
            'Что делать с открытыми задачами лида: move / close / none ' +
            '(none — не трогать и новую не создавать).',
        example: 'move',
        type: String,
        enum: LEAD_TO_WORK_TASK_MODES,
        default: 'move',
    })
    @IsOptional()
    @IsString()
    @IsIn(LEAD_TO_WORK_TASK_MODES as unknown as string[])
    taskMode?: LeadToWorkTaskMode;

    @ApiPropertyOptional({
        description: 'Признак ХО (создать ХО-сделку).',
        example: 'N',
        type: String,
        enum: LEAD_TO_WORK_FLAG_VALUES,
        default: 'N',
    })
    @IsOptional()
    @IsString()
    @IsIn(LEAD_TO_WORK_FLAG_VALUES as unknown as string[])
    isXo?: LeadToWorkFlag;

    @ApiPropertyOptional({
        description: IS_REQUEST_DESCRIPTION,
        example: 'Y',
        type: String,
        enum: LEAD_TO_WORK_FLAG_VALUES,
    })
    @IsOptional()
    @IsString()
    @IsIn(LEAD_TO_WORK_FLAG_VALUES as unknown as string[])
    isRequest?: LeadToWorkFlag;

    @ApiPropertyOptional({
        description: WORK_KIND_DESCRIPTION,
        example: 'request',
        type: String,
        enum: LEAD_WORK_KIND_VALUES,
    })
    @IsOptional()
    @IsString()
    @IsIn(LEAD_WORK_KIND_VALUES as unknown as string[])
    workKind?: LeadWorkKind;

    @ApiPropertyOptional({
        description:
            'Дедлайн задачи «Звонок» в локали портала (DD.MM.YYYY HH:mm:ss).',
        example: '15.08.2026 10:00:00',
        type: String,
    })
    @IsOptional()
    @IsString()
    deadline?: string;

    @ApiPropertyOptional({
        description: 'Название события для задачи; без него — название лида.',
        example: 'ООО Ромашка',
        type: String,
    })
    @IsOptional()
    @IsString()
    name?: string;
}

/** Элемент пачки — внутренний контракт между транспортом и use-case. */
export interface ILeadToWorkItem {
    leadId: number;
    /** Отсутствует — ответственный выбирается round-robin из отдела. */
    responsible?: number;
    /** Сырой намёк на отдел ОП для round-robin (формат тестируется). */
    department?: string;
    /**
     * Кого round-robin НЕ должен выбрать (передача/SLA: заявка не должна
     * вернуться прежнему; игнорируется при явном responsible).
     */
    excludeResponsible?: number;
    /**
     * Сотрудник САМ передал заявку (кнопка «Передать другому»): история
     * получает подсвеченную запись, отдел для round-robin — его отдел.
     */
    transferredBy?: number;
    /*
     * НАМЕРЕНИЕ — необязательное. `undefined` означает «вызывающий не
     * указал», и это ОБЯЗАНО отличаться от явно переданного значения:
     * по `undefined` мы читаем поле карточки, по значению — слушаемся
     * вызывающего. Подставь дефолт здесь — отличить стало бы нечем, и
     * поля карточки никогда бы не сработали.
     * Дефолты применяет `resolveLeadToWorkIntent()` после чтения лида.
     */
    createCompany?: LeadToWorkFlag;
    stageMode?: LeadToWorkStageMode;
    taskMode?: LeadToWorkTaskMode;
    isXo?: LeadToWorkFlag;
    /** Явный признак заявки от робота; отсутствует — автодетект по полям. */
    isRequest?: LeadToWorkFlag;
    /**
     * Вид холодной работы от Битрикса (заявка / лид / обычный ХО). Главнее
     * isRequest и автодетекта: именно он решает слово в заголовке задачи.
     */
    workKind?: LeadWorkKind;
    /**
     * ЯВНАЯ целевая стадия сделки ОП — перебивает `stageMode` и зеркало
     * стадии лида.
     *
     * Заведено 15.09.2026 под МАССОВЫЙ ПЕРЕНОС исторической базы: там
     * волна = один статус лида, целевая стадия известна заранее, и
     * гонять её через сопоставление зеркал в админке — лишняя ручная
     * работа и лишний способ ошибиться.
     *
     * ВАЖНО: при заданной стадии статус ЛИДА не трогается совсем (как и
     * при совпавшем зеркале). Без этого хук увёл бы лиды в
     * «Работа с компанией» / «Взята в работу» — а переносу запрещено
     * что-либо менять в лидах.
     *
     * Робот и кнопка фрейма поле не передают: в их DTO его нет.
     */
    dealStageCode?: PbxDealSalesBaseStageCode;
    /**
     * ПЕРЕНОСИТЬ ЛИ ДЕЛА ТАЙМЛАЙНА лида на сделку — перебивает
     * портальную настройку `lead_work_copy_activities` для ЭТОГО прогона.
     *
     * Заведено 15.09.2026 под массовый перенос: настройка портала одна
     * на всё, а таймлайн нужен только рабочим стадиям («В работе»,
     * «Демонстрация», «Возражения», «КП»). Волнам успехов и отказников
     * он не нужен — там переносится только состояние, и тащить туда
     * сотни дел значит впустую выесть лимиты портала.
     */
    copyActivities?: LeadToWorkFlag;
    /**
     * Искать открытые задачи лида ВО ВСЕХ группах, а не только в группе
     * продаж. У исторических задач группы продаж нет — её и ставит
     * перенос, — поэтому обычный фильтр их не видит.
     */
    taskAnyGroup?: LeadToWorkFlag;
    /**
     * Переносить КОММЕНТАРИИ таймлайна лида в сделку. Отдельно от
     * `copyActivities`: дела привязываются второй привязкой, комментарии
     * копируются — это разные сущности и разная цена.
     */
    copyComments?: LeadToWorkFlag;
    /** Сырой дедлайн в локали портала; отсутствует — задача без дедлайна. */
    deadline?: string;
    /** Название события; отсутствует — берётся название лида. */
    name?: string;
}

/**
 * Элемент после резолва ответственного (LeadToWorkAssigneeService):
 * flow-слой работает только с гарантированным responsible.
 */
export type ResolvedLeadToWorkItem = ILeadToWorkItem & {
    responsible: number;
} & LeadToWorkIntent;

/**
 * Намерение хука после резолва «запрос + карточка»: здесь дефолты уже
 * применены и неопределённости не осталось — флоу работают только с ним.
 */
export interface LeadToWorkIntent {
    createCompany: LeadToWorkFlag;
    stageMode: LeadToWorkStageMode;
    taskMode: LeadToWorkTaskMode;
    isXo: LeadToWorkFlag;
}

/**
 * Сборка элемента из запроса (вебхук робота / кнопка фрейма).
 *
 * Флаги намерения переносятся КАК ЕСТЬ, без дефолтов: «не передано» должно
 * дожить до `resolveLeadToWorkIntent()`, где сливается с полями карточки.
 */
export function buildLeadToWorkItem(input: {
    leadId: number;
    responsible?: string | number;
    department?: string;
    excludeResponsible?: number;
    transferredBy?: number;
    createCompany?: LeadToWorkFlag;
    stageMode?: LeadToWorkStageMode;
    taskMode?: LeadToWorkTaskMode;
    isXo?: LeadToWorkFlag;
    isRequest?: LeadToWorkFlag;
    workKind?: LeadWorkKind;
    dealStageCode?: PbxDealSalesBaseStageCode;
    copyActivities?: LeadToWorkFlag;
    taskAnyGroup?: LeadToWorkFlag;
    copyComments?: LeadToWorkFlag;
    deadline?: string;
    name?: string;
}): ILeadToWorkItem {
    const responsible =
        input.responsible === undefined || input.responsible === ''
            ? undefined
            : Number(input.responsible);
    return {
        leadId: input.leadId,
        responsible:
            responsible !== undefined && Number.isFinite(responsible)
                ? responsible
                : undefined,
        department: input.department,
        excludeResponsible: input.excludeResponsible,
        transferredBy: input.transferredBy,
        // Дефолты НЕ подставляем: см. комментарий у ILeadToWorkItem —
        // их применяет resolveLeadToWorkIntent() после чтения карточки.
        createCompany: input.createCompany,
        stageMode: input.stageMode,
        taskMode: input.taskMode,
        isXo: input.isXo,
        isRequest: input.isRequest,
        workKind: input.workKind,
        dealStageCode: input.dealStageCode,
        copyActivities: input.copyActivities,
        taskAnyGroup: input.taskAnyGroup,
        copyComments: input.copyComments,
        deadline: input.deadline,
        name: input.name,
    };
}
