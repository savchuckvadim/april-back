import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    AI_ANALYTICS_BUCKETS,
    AI_ANALYTICS_TONES,
    AiAnalyticsBucket,
    AiAnalyticsTone,
    CALL_REPORT_CALL_TYPE_CODES,
    CallReportCallTypeCode,
} from '@lib/portal-lib/pbx/pbx-aicall-smart';
import { AiRequestBaseDto } from './ai-request-base.dto';
import { AiManagerAbsencesDto, AiTargetsDto } from './ai-settings-blocks.dto';
import { AiAnalyticsEnvelopeDto } from './ai-response-envelope.dto';
import { ReadinessDto } from './readiness.dto';

/** Запрос настроек витрины. */
export class AiSettingsGetRequestDto extends AiRequestBaseDto {}

/** Тип звонка из карты алфавитов AI_ANALYTICS_EVENT_KINDS (подвкладка). */
export class AiCallTypeDto {
    @ApiProperty({
        description: 'Код AI-типа звонка (классификатор разбора).',
        enum: CALL_REPORT_CALL_TYPE_CODES,
        example: 'presentation',
    })
    code: CallReportCallTypeCode;

    @ApiProperty({
        description: 'Подпись подвкладки/столбца.',
        type: String,
        example: 'Презентация',
    })
    title: string;

    @ApiProperty({
        description: 'Тон UI (реестр tones пакета april-ui).',
        enum: AI_ANALYTICS_TONES,
        example: 'event-pres',
    })
    tone: AiAnalyticsTone;

    @ApiProperty({
        description:
            'Корзина оценок (contact/presentation/closing); null — тип не ' +
            'участвует в оценках.',
        enum: AI_ANALYTICS_BUCKETS,
        nullable: true,
        example: 'presentation',
    })
    bucket: AiAnalyticsBucket | null;

    @ApiProperty({
        description:
            'Главный KPI-код event_type для заголовочной цифры; null — нет.',
        type: String,
        nullable: true,
        example: 'presentation_uniq',
    })
    kpiPrimaryEventTypeCode: string | null;
}

/** Настройки и готовность витрины (план, 6.2). */
export class AiAnalyticsSettingsDto {
    @ApiProperty({
        description:
            'AI-аналитика ОП включена на портале (ai_analytics_enabled).',
        type: Boolean,
        example: true,
    })
    enabled: boolean;

    @ApiProperty({
        description:
            'Есть ли разборы звонков за последние 30 дней (конвейер работает). ' +
            'false при enabled → режим kpi-only.',
        type: Boolean,
        example: true,
    })
    pipelineEnabled: boolean;

    @ApiProperty({
        description:
            'Аудит и калибровка данных по порталу разрешены ' +
            '(ai_analytics_audit_enabled): админ-ручка аудита и месячный ' +
            'снапшот. Не зависит от enabled.',
        type: Boolean,
        example: false,
    })
    auditEnabled: boolean;

    @ApiProperty({
        description: 'Алерты РОПу в день звонка включены.',
        type: Boolean,
        example: false,
    })
    alertsEnabled: boolean;

    @ApiProperty({
        description: 'Утренний разбор менеджерам включён.',
        type: Boolean,
        example: false,
    })
    digestEnabled: boolean;

    @ApiProperty({ description: 'Готовность витрины.', type: ReadinessDto })
    readiness: ReadinessDto;

    @ApiProperty({
        description: 'Типы звонков (подвкладки) из карты алфавитов.',
        type: [AiCallTypeDto],
    })
    callTypes: AiCallTypeDto[];

    @ApiProperty({
        description:
            'Дата (YYYY-MM-DD), с которой разборы сопоставимы по версиям; пусто — нет данных.',
        type: String,
        example: '2026-09-05',
    })
    comparableFrom: string;

    @ApiProperty({
        description: 'Bitrix-id РОПов (ai_analytics_rop_user_ids).',
        type: [Number],
        example: [447, 512],
    })
    ropUserIds: number[];

    @ApiProperty({
        description:
            'Менеджер без роли руководителя видит витрину по себе ' +
            '(ai_analytics_self_view_enabled). false — читающие ручки ' +
            '(pulse, agenda, overview, attention, by-type, feedback/list) ' +
            'отвечают ему 403, фронт скрывает вкладку; settings/get доступна ' +
            'всем. На push-рассылки менеджеру не влияет.',
        type: Boolean,
        example: false,
    })
    selfViewEnabled: boolean;

    @ApiProperty({
        description:
            'План дня в утреннем дайджесте менеджера и ручка plan/daily ' +
            '(ai_analytics_daily_plan_enabled).',
        type: Boolean,
        example: false,
    })
    dailyPlanEnabled: boolean;

    @ApiProperty({
        description:
            'Bitrix-id адресатов сводного утреннего дайджеста по всем ' +
            'менеджерам портала (ai_analytics_digest_all_user_ids); пусто — ' +
            'сводный дайджест не отправляется.',
        type: [String],
        example: ['447'],
    })
    digestAllUserIds: string[];

    @ApiProperty({
        description:
            'Согласие портала на обезличенный пул порталов ' +
            '(ai_analytics_pool_opt_in).',
        type: Boolean,
        example: false,
    })
    poolOptIn: boolean;

    @ApiProperty({
        description:
            'Дата согласия на пул в ISO 8601 (ai_analytics_pool_consent_at); ' +
            'null — не задана.',
        type: String,
        nullable: true,
        example: null,
    })
    poolConsentAt: string | null;

    @ApiProperty({
        description:
            'Эксперименты на портале включены ' +
            '(ai_analytics_experiments_enabled): «фокус недели» и далее.',
        type: Boolean,
        example: false,
    })
    experimentsEnabled: boolean;

    @ApiProperty({
        description:
            'Текущие цели по уровням и личные цели менеджеров ' +
            '(ai_analytics_targets) в форме блока settings/save — для ' +
            'предзаполнения формы настроек; sales = null у уровня — медиана ' +
            'полосы стажа.',
        type: AiTargetsDto,
    })
    targets: AiTargetsDto;

    @ApiProperty({
        description:
            'Текущие отсутствия менеджеров (ai_analytics_absences), только ' +
            'менеджеры с отрезками, в форме блока settings/save.',
        type: [AiManagerAbsencesDto],
    })
    absences: AiManagerAbsencesDto[];

    @ApiProperty({
        description:
            'Дата подтверждения состава руководителем ' +
            '(ai_analytics_roster_confirmed_at, YYYY-MM-DD); null — состав не ' +
            'подтверждён (причина готовности roster-not-confirmed).',
        type: String,
        nullable: true,
        example: '2026-09-01',
    })
    rosterConfirmedAt: string | null;
}

export class AiSettingsResponseDto extends AiAnalyticsEnvelopeDto {
    @ApiPropertyOptional({
        description: 'Настройки и готовность (при status = ready).',
        type: AiAnalyticsSettingsDto,
    })
    data?: AiAnalyticsSettingsDto;
}
