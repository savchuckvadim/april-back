import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

/**
 * Гранулярные чек-листы «Хвост» и «5К» — вынесены из общего файла
 * контракта агента (лимит файла); имена и декораторы прежние.
 */

/**
 * Гранулярный «Хвост» глазами AI — пять блоков анкеты менеджера.
 *
 * Состав переписан 01.09.2026 вслед за анкетой: было три галочки («КП
 * предложено», «наполнение озвучено», «цена озвучена») и две даты, стало
 * пять смысловых блоков. Пункты ОБЯЗАНЫ совпадать с анкетой менеджера —
 * иначе сверка «что сказал менеджер против того, что услышал AI» считается
 * по разным шкалам, а еженедельный отчёт показывает проценты по вопросам,
 * которых в анкете больше нет.
 */
export class AgentHvostStepsDto {
    @ApiPropertyOptional({
        description:
            'ЖЕЛАНИЕ РАБОТАТЬ С ГАРАНТОМ: впечатление, что запомнилось, с чем хотел бы работать',
        example: true,
        type: Boolean,
        nullable: true,
    })
    @IsOptional()
    @IsBoolean()
    desire?: boolean | null;

    @ApiPropertyOptional({
        description:
            'ЧТО ПРЕДЛОЖИЛИ: кому нужна СПС, какое наполнение и цену озвучили',
        example: true,
        type: Boolean,
        nullable: true,
    })
    @IsOptional()
    @IsBoolean()
    offered?: boolean | null;

    @ApiPropertyOptional({
        description: 'РЕАКЦИЯ НА ЦЕНУ: как клиент отреагировал',
        example: false,
        type: Boolean,
        nullable: true,
    })
    @IsOptional()
    @IsBoolean()
    priceReaction?: boolean | null;

    @ApiPropertyOptional({
        description:
            'ПРОЦЕСС ПРИНЯТИЯ РЕШЕНИЯ: кто и как решает, контакты коллег',
        example: true,
        type: Boolean,
        nullable: true,
    })
    @IsOptional()
    @IsBoolean()
    decisionProcess?: boolean | null;

    @ApiPropertyOptional({
        description:
            'ВЫХОД НА РЕШЕНИЕ: готовность продвигать, направленные документы, о чём договорились',
        example: true,
        type: Boolean,
        nullable: true,
    })
    @IsOptional()
    @IsBoolean()
    decisionWay?: boolean | null;
}

/**
 * Гранулярные «5К» глазами AI — пять блоков анкеты менеджера вместо
 * прежних девяти вопросов.
 */
export class AgentFiveKItemsDto {
    @ApiPropertyOptional({
        description:
            'КЛИЕНТ: задачи, что важно отслеживать, какой функционал важен',
        example: true,
        type: Boolean,
        nullable: true,
    })
    @IsOptional()
    @IsBoolean()
    client?: boolean | null;

    @ApiPropertyOptional({
        description:
            'КОМПАНИЯ: сфера, структура, как принимается решение, кто влияет',
        example: true,
        type: Boolean,
        nullable: true,
    })
    @IsOptional()
    @IsBoolean()
    company?: boolean | null;

    @ApiPropertyOptional({
        description:
            'КОЛЛЕГИ: бухгалтерия, кадры, охрана труда, правовые вопросы',
        example: false,
        type: Boolean,
        nullable: true,
    })
    @IsOptional()
    @IsBoolean()
    colleagues?: boolean | null;

    @ApiPropertyOptional({
        description: 'КОНКУРЕНТ: чья СПС, срок договора, цена, чего не хватает',
        example: true,
        type: Boolean,
        nullable: true,
    })
    @IsOptional()
    @IsBoolean()
    competitor?: boolean | null;

    @ApiPropertyOptional({
        description:
            'КРИТЕРИИ ВЫБОРА: что ещё предлагают, на что смотрит при выборе',
        example: true,
        type: Boolean,
        nullable: true,
    })
    @IsOptional()
    @IsBoolean()
    criteria?: boolean | null;
}
