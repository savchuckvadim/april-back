import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { Transform } from 'class-transformer';
import {
    AiAnalyticsAuditAbout,
    AiAnalyticsAuditAboutItem,
    AiAnalyticsAuditAboutSection,
} from '../../audit/ai-analytics-audit.about';

/** Один считаемый показатель отчёта аудита. */
export class AiAnalyticsAuditAboutItemDto implements AiAnalyticsAuditAboutItem {
    @ApiProperty({
        description: 'Ключ показателя в структурированном отчёте report.',
        example: 'coverage',
    })
    code: string;

    @ApiProperty({
        description: 'Название показателя.',
        example: 'Покрытие менеджера по месяцам',
    })
    title: string;

    @ApiProperty({
        description: 'Что именно считается и зачем.',
        example: 'Доля звонков с заполненным user_id по месяцам…',
    })
    description: string;
}

/** Раздел markdown-отчёта и правило его чтения. */
export class AiAnalyticsAuditAboutSectionDto
    implements AiAnalyticsAuditAboutSection
{
    @ApiProperty({ description: 'Номер раздела в отчёте (1–8).', example: 1 })
    order: number;

    @ApiProperty({
        description: 'Заголовок раздела.',
        example: 'Покрытие user_id по месяцам',
    })
    title: string;

    @ApiProperty({
        description: 'Как читать раздел и какие выводы из него делать.',
        example:
            'Месяцы с покрытием < 95 % не годятся для сравнения менеджеров.',
    })
    howToRead: string;
}

/**
 * Самоописание аудита — тот же текст, что в Swagger и README; UI админки
 * показывает его рядом с формой запуска и результатом.
 */
export class AiAnalyticsAuditAboutDto implements AiAnalyticsAuditAbout {
    @ApiProperty({
        description: 'Название аудита.',
        example: 'Аудит данных AI-аналитики отдела продаж',
    })
    title: string;

    @ApiProperty({
        description: 'Зачем нужен аудит и какое решение по нему принимается.',
    })
    purpose: string;

    @ApiProperty({
        description: 'Источники данных (только таблицы БД приложения).',
        type: [String],
    })
    sources: string[];

    @ApiProperty({
        description: 'Границы: чего аудит не делает.',
        type: [String],
    })
    notDoing: string[];

    @ApiProperty({
        description: 'Считаемые показатели — ключи структурированного отчёта.',
        type: [AiAnalyticsAuditAboutItemDto],
    })
    computes: AiAnalyticsAuditAboutItemDto[];

    @ApiProperty({
        description: 'Разделы markdown-отчёта и правила их чтения.',
        type: [AiAnalyticsAuditAboutSectionDto],
    })
    resultSections: AiAnalyticsAuditAboutSectionDto[];

    @ApiProperty({
        description:
            'Правило автоматической рекомендации по порогам (с константами кода).',
    })
    recommendationRule: string;

    @ApiProperty({ description: 'Где и как хранится результат.' })
    storage: string;

    @ApiProperty({
        description: 'Кто может запускать и какой признак портала нужен.',
    })
    access: string;

    @ApiProperty({
        description: 'Способы запуска: ручка, снапшот, крон, CLI.',
        type: [String],
    })
    howToRun: string[];
}

/** Состояние признака аудита на портале. */
export class AiAnalyticsAuditPortalStatusDto {
    @ApiProperty({
        description: 'Домен портала.',
        example: 'april.bitrix24.ru',
    })
    domain: string;

    @ApiProperty({
        description:
            'AI-аналитика ОП включена на портале (ai_analytics_enabled): ' +
            'общий рубильник витрины и рассылок. UI показывает его рядом с ' +
            'признаком аудита.',
        example: true,
    })
    aiAnalyticsEnabled: boolean;

    @ApiProperty({
        description:
            'Признак ai_analytics_audit_enabled в настройках kpi-sales: ' +
            'true — аудит по порталу разрешён (ручка и крон), false — ' +
            'ручка ответит 403, крон портал пропустит.',
        example: true,
    })
    auditEnabled: boolean;

    @ApiProperty({
        description:
            'Дата последнего снапшота аудита (ISO), null — снапшотов нет.',
        example: '2026-09-01T01:10:00.000Z',
        nullable: true,
        type: String,
    })
    lastSnapshotAt: string | null;
}

/** Ответ GET admin/ai-analytics/audit/about. */
export class AiAnalyticsAuditAboutResponseDto {
    @ApiProperty({
        description:
            'Самоописание аудита (что делает, что считает, как читать).',
        type: AiAnalyticsAuditAboutDto,
    })
    about: AiAnalyticsAuditAboutDto;

    @ApiProperty({
        description:
            'Состояние портала, если передан domain: признак разрешения и ' +
            'дата последнего снапшота. null — domain не передан.',
        type: AiAnalyticsAuditPortalStatusDto,
        nullable: true,
    })
    portal: AiAnalyticsAuditPortalStatusDto | null;
}

/** Запрос самоописания (domain необязателен). */
export class AiAnalyticsAuditAboutQueryDto {
    @ApiProperty({
        description:
            'Домен портала — чтобы вместе с описанием получить признак ' +
            'разрешения аудита и дату последнего снапшота.',
        example: 'april.bitrix24.ru',
        required: false,
    })
    @IsOptional()
    @IsString()
    @IsNotEmpty({ message: 'domain не может быть пустым' })
    @Transform(({ value }: { value: unknown }) =>
        typeof value === 'string' ? value.trim().toLowerCase() : value,
    )
    domain?: string;
}
