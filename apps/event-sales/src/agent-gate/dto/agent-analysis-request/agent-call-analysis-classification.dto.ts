import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
    IsArray,
    IsBoolean,
    IsIn,
    IsInt,
    IsOptional,
    IsString,
    Matches,
    Max,
    Min,
    ValidateNested,
} from 'class-validator';
import {
    CALL_REPORT_CALL_TYPE_CODES,
    CALL_REPORT_COMPETITOR_CODES,
    CALL_REPORT_INTERLOCUTOR_CODES,
    CALL_REPORT_OBJECTION_CODES,
    CALL_REPORT_REFUSAL_CODES,
    CALL_REPORT_RISK_FLAG_CODES,
    CALL_REPORT_SENTIMENT_CODES,
    CALL_REPORT_SPECIALIST_CODES,
    CallReportCompetitorCode,
    CallReportInterlocutorCode,
    CallReportObjectionCode,
    CallReportRefusalCode,
    CallReportRiskFlagCode,
    CallReportSentimentCode,
    CallReportSpecialistCode,
} from '@lib/call-lib';
import { AgentDialogTurnDto } from './agent-dialog-turn.dto';
import { AgentNextStepDto } from './agent-next-step.dto';

/**
 * Первый слой AgentCallAnalysisDto (классификация и сигналы разговора) —
 * класс разрезан наследованием по лимиту файла, набор полей прежний.
 */

/** Встроенные типы звонков — из конфига смарта call-report. */
export const AGENT_CALL_TYPES = CALL_REPORT_CALL_TYPE_CODES;

/**
 * Тип звонка агента — string, а не union встроенных кодов: реестр типов
 * (kind call-type-registry) может добавлять общие и клиентские типы.
 * Полный набор доступных кодов агент получает в пакете звонка
 * (typeProfiles).
 */
export type AgentCallType = string;

/**
 * Классификация и сигналы разговора: тип звонка, собеседник, тон,
 * следующий шаг, диалог, цена/конкуренты/риски/отказ и метрики речи.
 * Не самостоятельный DTO — базовый слой AgentCallAnalysisDto.
 */
export class AgentCallAnalysisClassificationDto {
    @ApiProperty({
        description:
            'Код типа звонка, определённый агентом: встроенные коды ' +
            '(cold/call/presentation/decision/payment/other) либо код из ' +
            'реестра типов (пакет звонка несёт typeProfiles со всеми ' +
            'доступными кодами). Неизвестный смарту код не попадёт в ' +
            'enum-поле CALL_TYPE элемента (graceful), но сохранится в БД.',
        example: 'presentation',
        type: String,
    })
    @IsString()
    @Matches(/^[a-z][a-z0-9_-]*$/, {
        message: 'callType: слаг вида cold / renewal-call',
    })
    callType: AgentCallType;

    @ApiPropertyOptional({
        description:
            'Тип звонка, уточнённый синтезом разбора по всему разговору ' +
            '(классификатор видел выжимку). Применяется кодом, если ' +
            'классификатор был неуверен или поставил «другое».',
        example: 'presentation',
        type: String,
        nullable: true,
    })
    @IsOptional()
    @IsString()
    callTypeRefined?: string | null;

    @ApiPropertyOptional({
        description: 'По каким признакам разговора синтез определил тип.',
        example: 'менеджер показал систему и назначил дату решения',
        type: String,
        nullable: true,
    })
    @IsOptional()
    @IsString()
    callTypeReason?: string | null;

    @ApiPropertyOptional({
        description:
            'Итоговый статус звонка: результативный или нет (был контакт и продвижение).',
        example: true,
        type: Boolean,
    })
    @IsOptional()
    @IsBoolean()
    productive?: boolean;

    @ApiPropertyOptional({
        description:
            'С кем в итоге говорили: ЛПР / пользователь / секретарь / другое. ' +
            'Для холодных звонков «вышел на ЛПР» — мера успеха.',
        enum: CALL_REPORT_INTERLOCUTOR_CODES,
        example: 'lpr',
    })
    @IsOptional()
    @IsString()
    @IsIn(CALL_REPORT_INTERLOCUTOR_CODES as unknown as string[])
    interlocutorRole?: CallReportInterlocutorCode;

    @ApiPropertyOptional({
        description:
            'Специальность собеседника по лексике разговора (бухгалтер / ' +
            'юрист / кадровик / руководитель / другой) — под неё подбирается ' +
            'карта демонстрации. null — явных признаков в разговоре нет.',
        enum: CALL_REPORT_SPECIALIST_CODES,
        example: 'accountant',
        nullable: true,
    })
    @IsOptional()
    @IsString()
    @IsIn(CALL_REPORT_SPECIALIST_CODES as unknown as string[])
    specialist?: CallReportSpecialistCode | null;

    @ApiPropertyOptional({
        description: 'Общий тон клиента в разговоре.',
        enum: CALL_REPORT_SENTIMENT_CODES,
        example: 'neutral',
    })
    @IsOptional()
    @IsString()
    @IsIn(CALL_REPORT_SENTIMENT_CODES as unknown as string[])
    sentiment?: CallReportSentimentCode;

    @ApiPropertyOptional({
        description:
            'Следующий шаг по итогам звонка — ключевой предиктор сделки.',
        type: AgentNextStepDto,
    })
    @IsOptional()
    @ValidateNested()
    @Type(() => AgentNextStepDto)
    nextStep?: AgentNextStepDto;

    @ApiPropertyOptional({
        description:
            'Транскрипт, размеченный по ролям (реплики по порядку). ' +
            'Бэк рендерит его диалогом в таймлайн смарт-элемента и кладёт ' +
            'размеченную версию в поля транскрипта вместо сырого текста.',
        type: [AgentDialogTurnDto],
    })
    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => AgentDialogTurnDto)
    dialog?: AgentDialogTurnDto[];

    @ApiPropertyOptional({
        description: 'Обсуждалась ли цена в разговоре.',
        example: false,
        type: Boolean,
    })
    @IsOptional()
    @IsBoolean()
    priceDiscussed?: boolean;

    @ApiPropertyOptional({
        description:
            'Упомянутые конкуренты по закрытому справочнику (для win-loss трендов).',
        enum: CALL_REPORT_COMPETITOR_CODES,
        isArray: true,
        example: ['consultant'],
    })
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    @IsIn(CALL_REPORT_COMPETITOR_CODES as unknown as string[], { each: true })
    competitors?: CallReportCompetitorCode[];

    @ApiPropertyOptional({
        description:
            'Категории всех возражений звонка по закрытому справочнику ' +
            '(дублирует objections[].category для фильтров смарта).',
        enum: CALL_REPORT_OBJECTION_CODES,
        isArray: true,
        example: ['price', 'need'],
    })
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    @IsIn(CALL_REPORT_OBJECTION_CODES as unknown as string[], { each: true })
    objectionCategories?: CallReportObjectionCode[];

    @ApiPropertyOptional({
        description:
            'Риск-флаги для немедленного внимания руководителя: обещание, ' +
            'конфликт, нарушение регламента, сильный негатив клиента.',
        enum: CALL_REPORT_RISK_FLAG_CODES,
        isArray: true,
        example: [],
    })
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    @IsIn(CALL_REPORT_RISK_FLAG_CODES as unknown as string[], { each: true })
    riskFlags?: CallReportRiskFlagCode[];

    @ApiPropertyOptional({
        description:
            'Категория отказа при провале: рыночная (цена/конкурент/нет решения) ' +
            'или исполнительская (квалификация/исполнение).',
        enum: CALL_REPORT_REFUSAL_CODES,
        example: 'execution_issue',
    })
    @IsOptional()
    @IsString()
    @IsIn(CALL_REPORT_REFUSAL_CODES as unknown as string[])
    refusalCategory?: CallReportRefusalCode;

    @ApiPropertyOptional({
        description:
            'ПРИЧИНА ОТКАЗА СЛОВАМИ КЛИЕНТА — то, что реально прозвучало в ' +
            'разговоре (не код справочника): «работают с Консультантом, ' +
            'договор до декабря». Нужна для сверки с полем причины отказа ' +
            'в карточке: менеджер закрывает сделку отказом и часто не ' +
            'заполняет поле, а разбор причину слышал. null — отказа в ' +
            'разговоре не было или причина не прозвучала.',
        example: 'Работают с «Консультантом», договор оплачен до декабря.',
        type: String,
        nullable: true,
    })
    @IsOptional()
    @IsString()
    refusalReason?: string | null;

    @ApiPropertyOptional({
        description:
            'Доля речи менеджера в %, по словам транскрипта (норма 40-60, >65 — флаг).',
        example: 52,
        type: Number,
        minimum: 0,
        maximum: 100,
    })
    @IsOptional()
    @IsInt()
    @Min(0)
    @Max(100)
    talkRatioPct?: number;

    @ApiPropertyOptional({
        description: 'Число содержательных вопросов менеджера за звонок.',
        example: 9,
        type: Number,
        minimum: 0,
    })
    @IsOptional()
    @IsInt()
    @Min(0)
    questionsCount?: number;
}
