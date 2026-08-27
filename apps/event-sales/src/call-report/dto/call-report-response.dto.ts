import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { InstallCallReportSmartResult } from '@lib/call-lib';
import { CallReportScanResult } from '../use-cases/call-report-scan.use-case';
import { CallReportPipelineResult } from '../use-cases/call-report-pipeline.use-case';
import { CallRevisionDomainResult } from '../services/call-revision.service';
import { PresentationAuditDomainResult } from '../services/presentation-audit.service';
import {
    PresentationPlanFactResult,
    PresentationPlanItem,
} from '../services/presentation-plan-fact.service';

/** Результат установки смарт-процесса «AI-анализ звонков». */
export class InstallCallReportSmartResponseDto
    implements InstallCallReportSmartResult
{
    @ApiProperty({
        description: 'entityTypeId смарт-процесса на портале.',
        example: 128,
        type: Number,
    })
    entityTypeId: number;

    @ApiProperty({
        description:
            'true — тип создан этим вызовом; false — уже существовал (идемпотентный повтор).',
        example: true,
        type: Boolean,
    })
    created: boolean;

    @ApiProperty({
        description: 'UF-имена полей, добавленных этим вызовом.',
        example: ['UF_CRM_128_SUMMARY'],
        type: [String],
    })
    fieldsAdded: string[];

    @ApiProperty({
        description: 'UF-имена полей, которые уже существовали.',
        example: ['UF_CRM_128_ACTIVITY_ID'],
        type: [String],
    })
    fieldsExisting: string[];

    @ApiProperty({
        description: 'UF-имена полей, которые не удалось создать (см. логи).',
        example: [],
        type: [String],
    })
    fieldsFailed: string[];
}

/** Результат скана звонков домена. */
export class CallReportScanResponseDto implements CallReportScanResult {
    @ApiProperty({
        description: 'Домен портала, по которому выполнен скан.',
        example: 'april-garant.bitrix24.ru',
        type: String,
    })
    domain: string;

    @ApiProperty({
        description:
            'Сколько звонков вернул voximplant.statistic.get по фильтру (длительность + окно).',
        example: 14,
        type: Number,
    })
    found: number;

    @ApiProperty({
        description:
            'Сколько звонков уже обработано ранее (дедуп по dedup_key).',
        example: 9,
        type: Number,
    })
    alreadyProcessed: number;

    @ApiProperty({
        description:
            'Сколько звонков пропущено: активность принадлежит не сделке (lead/contact — вне MVP).',
        example: 2,
        type: Number,
    })
    skippedNonDeal: number;

    @ApiProperty({
        description: 'Сколько звонков пропущено из-за отсутствия аудиофайла.',
        example: 1,
        type: Number,
    })
    skippedNoAudio: number;

    @ApiProperty({
        description:
            'Сколько звонков пропущено: звонивший не входит в отдел продаж ' +
            '(bx-department; отключается env CALL_REPORT_SALES_ONLY=0).',
        example: 3,
        type: Number,
    })
    skippedNotSales: number;

    @ApiProperty({
        description: 'Сколько звонков поставлено в очередь на обработку.',
        example: 2,
        type: Number,
    })
    enqueued: number;

    @ApiPropertyOptional({
        description:
            'Выборка телефонии оказалась НЕПОЛНОЙ: упёрлись в потолок строк ' +
            'или Битрикс не отдал страницу. Часть звонков этот проход не ' +
            'увидел — сузьте окно, задайте список сотрудников или поднимите ' +
            'maxRows. Сопровождается алертом в телеграм.',
        example: false,
        type: Boolean,
    })
    truncated?: boolean;

    @ApiPropertyOptional({
        description:
            'Сколько звонков всего подходит под фильтр по данным Битрикса ' +
            '(поле total ответа). null — Битрикс не сообщил. Сравнение с ' +
            '«найдено» показывает, была ли обрезка.',
        example: 37,
        type: Number,
        nullable: true,
    })
    totalByFilter?: number | null;
}

/** Результат синхронного анализа одного звонка. */
export class AnalyzeCallResponseDto implements CallReportPipelineResult {
    @ApiProperty({
        description: 'ID строки транскрипции в БД (transcriptions).',
        example: '42',
        type: String,
    })
    transcriptionId: string;

    @ApiProperty({
        description: 'Каким транскрибатором обработан звонок.',
        example: 'yandex',
        type: String,
    })
    provider: string;

    @ApiProperty({
        description: 'Сохранено ли GigaChat-резюме в ais.',
        example: true,
        type: Boolean,
    })
    resumeSaved: boolean;

    @ApiProperty({
        description: 'Сохранены ли GigaChat-рекомендации в ais.',
        example: true,
        type: Boolean,
    })
    recomendationSaved: boolean;

    @ApiProperty({
        description:
            'Тип звонка от дешёвого классификатора (cold / call / presentation / ' +
            'decision / payment / other); null — классификация выключена или не удалась.',
        example: 'cold',
        type: String,
        nullable: true,
    })
    callType: string | null;
}

/** Итог обработки одного звонка в пакетном /analyze. */
export class AnalyzeCallItemDto {
    @ApiProperty({
        description: 'ID активности-звонка.',
        example: 781614,
        type: Number,
    })
    activityId: number;

    @ApiProperty({
        description: 'ID сделки звонка.',
        example: 12345,
        type: Number,
    })
    dealId: number;

    @ApiProperty({
        description: 'Итог: done — обработан, error — ошибка (см. error).',
        enum: ['done', 'error'],
        example: 'done',
    })
    status: 'done' | 'error';

    @ApiPropertyOptional({
        description: 'ID строки транскрипции (при status=done).',
        example: '42',
        type: String,
    })
    transcriptionId?: string;

    @ApiPropertyOptional({
        description: 'Каким транскрибатором обработан звонок.',
        example: 'bitrix-vibecode',
        type: String,
    })
    provider?: string;

    @ApiPropertyOptional({
        description: 'Тип звонка от классификатора (null — не определён).',
        example: 'cold',
        type: String,
        nullable: true,
    })
    callType?: string | null;

    @ApiPropertyOptional({
        description: 'Сохранено ли резюме в ais.',
        example: true,
        type: Boolean,
    })
    resumeSaved?: boolean;

    @ApiPropertyOptional({
        description: 'Сохранены ли рекомендации в ais.',
        example: true,
        type: Boolean,
    })
    recomendationSaved?: boolean;

    @ApiPropertyOptional({
        description:
            'ID базового смарт-элемента «AI-анализ звонков» ' +
            '(запрос с createSmartItem=true); null — смарт не установлен ' +
            'или создание не удалось (детали в логах).',
        example: 512,
        type: Number,
        nullable: true,
    })
    smartItemId?: number | null;

    @ApiPropertyOptional({
        description:
            'Bitrix-id менеджера звонка (PORTAL_USER_ID из voximplant) — ' +
            'видно, чьи звонки реально взялись в работу.',
        example: 222,
        type: Number,
    })
    userId?: number;

    @ApiPropertyOptional({
        description: 'Текст ошибки (при status=error).',
        example: 'No audio files in activity 781614',
        type: String,
    })
    error?: string;
}

/**
 * Результат /call-report/analyze: прямой режим (activityId) даёт один
 * элемент results; режим подбора (dealId/userId + limit) — до limit
 * элементов, обработанных синхронно по очереди.
 */
export class AnalyzeCallsResponseDto {
    @ApiProperty({
        description: 'Домен портала.',
        example: 'april-garant.bitrix24.ru',
        type: String,
    })
    domain: string;

    @ApiProperty({
        description:
            'Режим запуска: direct — по activityId; selection — подбор ' +
            'последних записей по dealId/userId; department — dealId/userId ' +
            'не переданы, менеджеры определены автоматически из отдела ' +
            'продаж портала (bx-department, см. salesUserIds).',
        enum: ['direct', 'selection', 'department'],
        example: 'selection',
    })
    mode: 'direct' | 'selection' | 'department';

    @ApiPropertyOptional({
        description:
            'Режим department: bitrix-id менеджеров отдела продаж, ' +
            'найденных через bx-department (все сотрудники ОП, включая ' +
            'вложенные подразделения) — их звонки и подбираются.',
        example: [7, 174, 222],
        type: [Number],
    })
    salesUserIds?: number[];

    @ApiProperty({
        description:
            'Сколько кандидатов нашлось в voximplant после фильтров ' +
            '(в direct-режиме всегда 1).',
        example: 6,
        type: Number,
    })
    found: number;

    @ApiProperty({
        description: 'Пропущено: уже обработаны ранее (данные уже в БД).',
        example: 2,
        type: Number,
    })
    skippedAlreadyProcessed: number;

    @ApiProperty({
        description: 'Пропущено: активность не принадлежит сделке.',
        example: 1,
        type: Number,
    })
    skippedNonDeal: number;

    @ApiProperty({
        description: 'Пропущено: у активности нет аудиозаписи.',
        example: 0,
        type: Number,
    })
    skippedNoAudio: number;

    @ApiProperty({
        description: 'Итоги обработки взятых в работу звонков.',
        type: [AnalyzeCallItemDto],
    })
    results: AnalyzeCallItemDto[];
}

/** Итог ночной ревизии домена (Фаза 3: свод по сущностям). */
export class ReviseCallsResponseDto implements CallRevisionDomainResult {
    @ApiProperty({
        description: 'Домен портала, по которому выполнена ревизия.',
        example: 'april-garant.bitrix24.ru',
        type: String,
    })
    domain: string;

    @ApiProperty({
        description:
            'Сколько сущностей (сделок/лидов) имели разборы звонков в окне ревизии.',
        example: 7,
        type: Number,
    })
    entitiesTotal: number;

    @ApiProperty({
        description:
            'Сколько сущностей отревизировано: свод записан в смарт-элемент и таймлайн.',
        example: 6,
        type: Number,
    })
    entitiesRevised: number;

    @ApiProperty({
        description:
            'Сколько сущностей пропущено из-за ошибок (детали в логах) — попадут в следующий прогон.',
        example: 1,
        type: Number,
    })
    entitiesFailed: number;
}

/** Итог сверки по презентациям (Фаза 4: отчёт менеджера vs разбор). */
export class PresentationAuditResponseDto
    implements PresentationAuditDomainResult
{
    @ApiProperty({
        description: 'Домен портала.',
        example: 'gsr.bitrix24.ru',
        type: String,
    })
    domain: string;

    @ApiProperty({
        description:
            'Кандидатов: разборов презентаций/решений в окне без выполненной сверки.',
        example: 4,
        type: Number,
    })
    candidates: number;

    @ApiProperty({
        description: 'Сверено (записи в таймлайн элемента).',
        example: 4,
        type: Number,
    })
    audited: number;

    @ApiProperty({
        description:
            'Из них с расхождениями (дубль сверки ушёл в таймлайн сделки).',
        example: 1,
        type: Number,
    })
    mismatched: number;

    @ApiProperty({
        description: 'Пропущено: уже сверено ранее (идемпотентность).',
        example: 2,
        type: Number,
    })
    skippedDone: number;

    @ApiProperty({
        description:
            'С ошибками (детали в логах) — попадут в следующий прогон.',
        example: 0,
        type: Number,
    })
    failed: number;
}

/** Судьба одного плана презентации в план-факте. */
export class PresentationPlanFactItemDto implements PresentationPlanItem {
    @ApiProperty({
        description: 'ID записи-плана в списке КПИ.',
        example: '9001',
        type: String,
    })
    recordId: string;

    @ApiProperty({
        description: 'Название записи (заголовок события).',
        example: 'Презентация План. ООО Ромашка',
        type: String,
    })
    name: string;

    @ApiProperty({
        description: 'Дата события плана (как в списке).',
        example: '14.08.2026',
        type: String,
        nullable: true,
    })
    eventDate: string | null;

    @ApiProperty({
        description: 'Bitrix-id ответственного менеджера.',
        example: '187',
        type: String,
        nullable: true,
    })
    responsibleId: string | null;

    @ApiProperty({
        description:
            'Итог: confirmed — презентация подтверждена AI-разбором звонка; ' +
            'reported-only — менеджер отчитался записью «Проведено», но ' +
            'звонка-презентации в разборах нет; missed — ни звонка, ни отчёта.',
        enum: ['confirmed', 'reported-only', 'missed'],
        example: 'missed',
    })
    status: 'confirmed' | 'reported-only' | 'missed';
}

/** Итог план-факта по презентациям одного домена. */
export class PresentationPlanFactResponseDto
    implements PresentationPlanFactResult
{
    @ApiProperty({
        description: 'Домен портала.',
        example: 'gsr.bitrix24.ru',
        type: String,
    })
    domain: string;

    @ApiProperty({
        description:
            'Планов презентаций в окне (записи КПИ «Презентация / План»).',
        example: 6,
        type: Number,
    })
    planned: number;

    @ApiProperty({
        description: 'Подтверждено AI-разбором звонка-презентации.',
        example: 4,
        type: Number,
    })
    confirmed: number;

    @ApiProperty({
        description: 'Отчёт «Проведено» есть, звонок-презентация не найден.',
        example: 1,
        type: Number,
    })
    reportedOnly: number;

    @ApiProperty({
        description: 'Пропущено: ни звонка, ни отчёта.',
        example: 1,
        type: Number,
    })
    missed: number;

    @ApiProperty({
        description: 'Судьба каждого плана.',
        type: [PresentationPlanFactItemDto],
    })
    items: PresentationPlanFactItemDto[];
}

/** Итог недельного Excel-отчёта: что собрали, куда положили, кому ушло. */
export class CallReportWeeklyResponseDto {
    @ApiProperty({
        description: 'Домен портала.',
        example: 'alfacentr.bitrix24.ru',
        type: String,
    })
    domain: string;

    @ApiProperty({
        description: 'Начало периода отчёта (ISO).',
        example: '2026-08-20T16:00:00.000Z',
        type: String,
    })
    from: string;

    @ApiProperty({
        description: 'Конец периода отчёта (ISO).',
        example: '2026-08-27T16:00:00.000Z',
        type: String,
    })
    to: string;

    @ApiProperty({
        description: 'Сколько звонков попало в файл.',
        example: 143,
        type: Number,
    })
    calls: number;

    @ApiProperty({
        description:
            'ID файла на Диске Битрикса; null — файл не загрузился ' +
            '(причина в логе и телеграм-алерте).',
        example: 8891,
        type: Number,
        nullable: true,
    })
    fileId: number | null;

    @ApiProperty({
        description: 'Ссылка на файл, если Битрикс её вернул.',
        example: 'https://alfacentr.bitrix24.ru/disk/showFile/8891/',
        type: String,
        nullable: true,
    })
    fileUrl: string | null;

    @ApiProperty({
        description:
            'Кому доставлен отчёт (bitrix-id: из настроек портала либо ' +
            'переданные в запросе).',
        example: [12, 25],
        type: [Number],
    })
    notifiedUserIds: number[];

    @ApiProperty({
        description:
            'Каким способом ушёл отчёт: chat (файл в личный чат), task ' +
            '(задача с файлом), notify (уведомление со ссылкой). ' +
            'null — получателей не было.',
        example: 'chat',
        type: String,
        nullable: true,
    })
    delivery: string | null;
}
