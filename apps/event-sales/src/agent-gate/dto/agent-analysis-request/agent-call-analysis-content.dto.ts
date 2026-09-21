import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
    IsArray,
    IsBoolean,
    IsNotEmpty,
    IsOptional,
    IsString,
    ValidateNested,
} from 'class-validator';
import { AgentCallAnalysisClassificationDto } from './agent-call-analysis-classification.dto';
import { AgentFiveKItemsDto, AgentHvostStepsDto } from './agent-checklists.dto';
import { AgentObjectionDto } from './agent-objection.dto';
import { AgentSectionAnalysisDto } from './agent-section-analysis.dto';

/**
 * Второй слой AgentCallAnalysisDto (содержание разбора) — класс разрезан
 * наследованием по лимиту файла, набор полей прежний.
 */

/**
 * Содержание разбора: резюме, потребности, презентация, «хвост» и «5К»,
 * сверка с отчётом, продукты, возражения, разделы рубрики, речь и
 * рекомендации. Не самостоятельный DTO — слой AgentCallAnalysisDto.
 */
export class AgentCallAnalysisContentDto extends AgentCallAnalysisClassificationDto {
    @ApiProperty({
        description: 'Итоговое резюме звонка от агента (своими скиллами).',
        example: 'Проведена презентация системы Гарант для ЛПР...',
        type: String,
    })
    @IsString()
    @IsNotEmpty()
    summary: string;

    @ApiProperty({
        description: 'Выявлены ли потребности клиента в разговоре.',
        example: true,
        type: Boolean,
    })
    @IsBoolean()
    needsFound: boolean;

    @ApiPropertyOptional({
        description: 'Список выявленных потребностей клиента.',
        example: ['Судебная практика по 44-ФЗ', 'Проверка контрагентов'],
        type: [String],
    })
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    needs?: string[];

    @ApiProperty({
        description: 'Была ли проведена презентация продукта.',
        example: true,
        type: Boolean,
    })
    @IsBoolean()
    presentationDone: boolean;

    @ApiPropertyOptional({
        description:
            'Пройден ли «хвост» после демонстрации (вопросы ценности, кто ' +
            'будет работать, цена комплекта, механизм решения, дата звонка ' +
            'по решению). Только для презентаций/решений; null — не применимо.',
        example: true,
        type: Boolean,
        nullable: true,
    })
    @IsOptional()
    @IsBoolean()
    hvostDone?: boolean | null;

    @ApiPropertyOptional({
        description:
            'Разбор прохождения «хвоста» по 4 этапам (отдельная запись в ' +
            'таймлайн элемента). null — не применимо.',
        example: '1. Вопросы ценности — ✓ …',
        type: String,
        nullable: true,
    })
    @IsOptional()
    @IsString()
    hvostAnalysis?: string | null;

    @ApiPropertyOptional({
        description:
            'Гранулярный «хвост» по вопросам чеклиста менеджера (КП, ' +
            'наполнение, цена, дата решения, согласование даты). ' +
            'Итог hvostDone пересчитывается кодом из этих пунктов.',
        type: AgentHvostStepsDto,
        nullable: true,
    })
    @IsOptional()
    @ValidateNested()
    @Type(() => AgentHvostStepsDto)
    hvostSteps?: AgentHvostStepsDto | null;

    @ApiPropertyOptional({
        description:
            'Закрыты ли все 5К после встречи (Клиент/Компания/Коллеги/' +
            'Конкурент/Критерии выбора). Только для презентаций/решений; ' +
            'null — не применимо.',
        example: false,
        type: Boolean,
        nullable: true,
    })
    @IsOptional()
    @IsBoolean()
    fiveKDone?: boolean | null;

    @ApiPropertyOptional({
        description:
            'Разбор покрытия 5К по каждой «К» (отдельная запись в таймлайн ' +
            'элемента). null — не применимо.',
        example: 'Клиент — хочет ускорить поиск практики …',
        type: String,
        nullable: true,
    })
    @IsOptional()
    @IsString()
    fiveKAnalysis?: string | null;

    @ApiPropertyOptional({
        description:
            'Гранулярные 5К по вопросам чеклиста менеджера (9 подвопросов: ' +
            'клиент ×3, компания ×3, коллеги, конкурент, критерии выбора). ' +
            'Итог fiveKDone пересчитывается кодом из этих пунктов.',
        type: AgentFiveKItemsDto,
        nullable: true,
    })
    @IsOptional()
    @ValidateNested()
    @Type(() => AgentFiveKItemsDto)
    fiveKItems?: AgentFiveKItemsDto | null;

    @ApiPropertyOptional({
        description:
            'Сверка разбора звонка с отчётом менеджера (заполняет крон ' +
            'сверки, Фаза 4) — отдельная запись в таймлайн элемента.',
        example: 'Менеджер отметил 5К закрытым, в звонке не выяснены Коллеги…',
        type: String,
        nullable: true,
    })
    @IsOptional()
    @IsString()
    reportComparison?: string | null;

    @ApiPropertyOptional({
        description: 'Какие продукты предлагались в разговоре.',
        example: ['Гарант Универсал', 'Гарант Консалтинг'],
        type: [String],
    })
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    productsOffered?: string[];

    @ApiPropertyOptional({
        description:
            'Возражения клиента и их отработка (с разбором, как к возражению пришли).',
        type: [AgentObjectionDto],
    })
    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => AgentObjectionDto)
    objections?: AgentObjectionDto[];

    @ApiPropertyOptional({
        description:
            'Разбор по формализованным разделам разговора (приветствие, потребности, ' +
            'презентация, возражения, цена, закрытие, отказы): актуальность + оценка + ' +
            'разбор + рекомендации по каждому.',
        type: [AgentSectionAnalysisDto],
    })
    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => AgentSectionAnalysisDto)
    sections?: AgentSectionAnalysisDto[];

    @ApiPropertyOptional({
        description:
            'Анализ речи менеджера: структура спича, «свойство-связка-выгода» в ' +
            'презентации, темп, слова-паразиты, заученность.',
        example:
            'Презентация без связок «что это даёт вам»: перечислялись функции без выгод...',
        type: String,
    })
    @IsOptional()
    @IsString()
    speechAnalysis?: string;

    @ApiPropertyOptional({
        description: 'Рекомендации менеджеру по итогам звонка.',
        example: [
            'Отправить сравнение с КонсультантПлюс',
            'Позвонить в четверг',
        ],
        type: [String],
    })
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    recommendations?: string[];
}
