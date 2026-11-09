import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    OWNER_REPORT_TONES,
    type OwnerReportTone,
} from '@lib/sales-ai-analytics';
import {
    AiOwnerReportAttentionDto,
    AiOwnerReportGlossaryItemDto,
} from './ai-owner-report-reading.dto';
import {
    AiOwnerReportCrmFunnelDto,
    AiOwnerReportFunnelDto,
    AiOwnerReportPresentationsDto,
} from './ai-owner-report-funnel.dto';
import { AiOwnerReportOverviewDto } from './ai-owner-report-overview.dto';
import {
    AiOwnerReportIssuesDto,
    AiOwnerReportManagementDto,
    AiOwnerReportManagerDto,
    AiOwnerReportMetricDto,
    AiOwnerReportObjectionsDto,
} from './ai-owner-report-sections.dto';

export * from './ai-owner-report-sections.dto';
export * from './ai-owner-report-reading.dto';
export * from './ai-owner-report-overview.dto';
export * from './ai-owner-report-funnel.dto';

/**
 * Текст отчёта собственнику в ответе ручки `ai-analytics/owner-report`:
 * готовые русские фразы по разделам, числа уже отформатированы. Фронт и
 * PDF раскладывают структуру, ничего не считая.
 */

export class AiOwnerReportTileDto {
    @ApiProperty({
        description: 'Код плитки.',
        type: String,
        example: 'cold_advanced',
    })
    code: string;

    @ApiProperty({
        description: 'Число крупно.',
        type: String,
        example: '11 %',
    })
    value: string;

    @ApiProperty({
        description: 'Подпись под числом.',
        type: String,
        example: 'холодных звонков дошли до показа, доступа или предложения',
    })
    label: string;

    @ApiPropertyOptional({
        description: 'Сравнение с прошлым периодом; null — сравнения нет.',
        type: String,
        nullable: true,
        example: 'меньше на 5 пунктов',
    })
    compare: string | null;

    @ApiProperty({
        description:
            'Цвет плитки по порогам доли: good — хорошо, warn — внимание, bad — плохо, neutral — без оценки.',
        enum: OWNER_REPORT_TONES,
        example: 'warn',
    })
    tone: OwnerReportTone;
}

export class AiOwnerReportLeakDto {
    @ApiProperty({
        description: 'Код утечки.',
        type: String,
        example: 'postponed_no_date',
    })
    code: string;

    @ApiProperty({ description: 'Название.', type: String })
    title: string;

    @ApiProperty({ description: 'Масштаб словами.', type: String })
    scale: string;

    @ApiPropertyOptional({
        description: 'Деньги словами; null — не считаются.',
        type: String,
        nullable: true,
    })
    money: string | null;

    @ApiProperty({
        description: 'Природа: процесс, навык или оба.',
        type: String,
    })
    nature: string;

    @ApiProperty({ description: 'Что сделать.', type: String })
    action: string;

    @ApiProperty({ description: 'Абзац утечки.', type: String })
    text: string;

    @ApiProperty({
        description: 'Кто написал абзац.',
        enum: ['template', 'model'],
        example: 'model',
    })
    source: 'template' | 'model';

    @ApiProperty({
        type: [String],
        description: 'Ссылки на карточки разборов-примеров.',
    })
    exampleLinks: string[];
}

export class AiOwnerReportTextDto {
    @ApiProperty({ description: 'Заголовок отчёта.', type: String })
    title: string;

    @ApiProperty({
        description: 'Период словами.',
        type: String,
        example: '1–31 октября 2026',
    })
    periodLabel: string;

    @ApiProperty({ type: [AiOwnerReportTileDto], description: 'Плитки шапки.' })
    tiles: AiOwnerReportTileDto[];

    @ApiProperty({
        type: [AiOwnerReportAttentionDto],
        description:
            'На что обратить внимание: до четырёх пунктов с действием.',
    })
    attention: AiOwnerReportAttentionDto[];

    @ApiProperty({
        type: [String],
        description: 'Резюме для собственника, абзацы.',
    })
    summary: string[];

    @ApiProperty({
        description: 'Кто написал резюме.',
        enum: ['template', 'model'],
    })
    summarySource: 'template' | 'model';

    @ApiProperty({
        type: AiOwnerReportOverviewDto,
        description: 'Общая картина.',
    })
    overview: AiOwnerReportOverviewDto;

    @ApiProperty({
        type: AiOwnerReportFunnelDto,
        description:
            'Воронка по разговорам: холодный вход → показ → после показа и КП, согласие на счёт.',
    })
    funnel: AiOwnerReportFunnelDto;

    @ApiPropertyOptional({
        type: AiOwnerReportCrmFunnelDto,
        nullable: true,
        description:
            'Воронка по CRM: показы → счета → договоры; null — данных CRM за период нет.',
    })
    crmFunnel: AiOwnerReportCrmFunnelDto | null;

    @ApiProperty({
        type: AiOwnerReportPresentationsDto,
        description: 'Презентации: качество показов и что из него выходит.',
    })
    presentations: AiOwnerReportPresentationsDto;

    @ApiProperty({
        type: [AiOwnerReportLeakDto],
        description: 'Где теряем продажи.',
    })
    leaks: AiOwnerReportLeakDto[];

    @ApiProperty({
        type: AiOwnerReportManagementDto,
        description: 'Как управляется отдел.',
    })
    management: AiOwnerReportManagementDto;

    @ApiProperty({
        type: AiOwnerReportObjectionsDto,
        description: 'Возражения.',
    })
    objections: AiOwnerReportObjectionsDto;

    @ApiProperty({
        type: AiOwnerReportIssuesDto,
        description: 'Сбои не по вине разговора.',
    })
    issues: AiOwnerReportIssuesDto;

    @ApiProperty({
        type: [AiOwnerReportMetricDto],
        description: 'Метрики для контроля.',
    })
    controlMetrics: AiOwnerReportMetricDto[];

    @ApiProperty({
        type: [AiOwnerReportManagerDto],
        description: 'Сотрудники.',
    })
    managers: AiOwnerReportManagerDto[];

    @ApiProperty({ type: [String], description: 'Методология и ограничения.' })
    methodology: string[];

    @ApiProperty({
        type: [AiOwnerReportGlossaryItemDto],
        description:
            'Словарь терминов отчёта для читателя, который видит его впервые.',
    })
    glossary: AiOwnerReportGlossaryItemDto[];
}
