import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches } from 'class-validator';
import {
    SUPPORT_GUIDE_CHECK_STATUSES,
    SupportGuide,
    SupportGuideCheck,
    SupportGuideCheckStatus,
    SupportGuideLink,
    SupportGuideSection,
} from '../../support-guide.types';

export class SupportGuideQueryDto {
    @ApiPropertyOptional({
        description:
            'Портал открытой линии без протокола. Не указан — первый портал с ' +
            'включённым мониторингом, иначе april-dev.bitrix24.ru.',
        type: String,
        example: 'april-dev.bitrix24.ru',
    })
    @IsOptional()
    @IsString()
    @Matches(/^[a-z0-9.-]+$/i, {
        message: 'domain — адрес портала без протокола',
    })
    domain?: string;
}

export class SupportGuideLinkDto implements SupportGuideLink {
    @ApiProperty({
        description: 'Подпись ссылки.',
        type: String,
        example: 'Настройки «Поддержка» портала линии',
    })
    title: string;

    @ApiProperty({
        description: 'Путь админки или внешний адрес.',
        type: String,
        example: '/portal/7/app-settings',
    })
    href: string;
}

export class SupportGuideCheckDto implements SupportGuideCheck {
    @ApiProperty({
        description: 'Код пункта чек-листа.',
        type: String,
        example: 'line_id',
    })
    key: string;

    @ApiProperty({
        description: 'Что должно быть сделано.',
        type: String,
        example: 'Указан номер линии',
    })
    title: string;

    @ApiProperty({
        description:
            'done — сделано, todo — не сделано, manual — админка проверить не может, ' +
            'как проверить — в подсказке.',
        type: String,
        enum: SUPPORT_GUIDE_CHECK_STATUSES,
        example: 'todo',
    })
    status: SupportGuideCheckStatus;

    @ApiProperty({
        description: 'Что сделать или как проверить (markdown).',
        type: String,
        example: '«Поддержка Апрель» на april-dev — линия 9.',
    })
    hint: string;

    @ApiPropertyOptional({
        description: 'Где это делается; null — ссылки нет.',
        type: SupportGuideLinkDto,
        nullable: true,
    })
    link: SupportGuideLinkDto | null;
}

export class SupportGuideSectionDto implements SupportGuideSection {
    @ApiProperty({
        description: 'Код раздела.',
        type: String,
        example: 'concept',
    })
    key: string;

    @ApiProperty({
        description: 'Заголовок раздела.',
        type: String,
        example: 'Концепция',
    })
    title: string;

    @ApiProperty({
        description:
            'Текст раздела (markdown: заголовки, списки, таблицы, код).',
        type: String,
        example: '## Кто где работает',
    })
    markdown: string;
}

export class SupportGuideResponseDto implements SupportGuide {
    @ApiProperty({
        description: 'Портал открытой линии.',
        type: String,
        example: 'april-dev.bitrix24.ru',
    })
    lineDomain: string;

    @ApiPropertyOptional({
        description: 'Портал линии в базе April; null — его там нет.',
        type: Number,
        nullable: true,
        example: 7,
    })
    portalId: number | null;

    @ApiProperty({
        description: 'Суть системы поддержки в двух-трёх предложениях.',
        type: String,
    })
    summary: string;

    @ApiProperty({
        description:
            'Что осталось, чтобы заработало: живой статус по настройкам портала линии.',
        type: [SupportGuideCheckDto],
    })
    checklist: SupportGuideCheckDto[];

    @ApiProperty({
        description:
            'Разделы: концепция, как пользоваться, алгоритм, ключи, что не сделано.',
        type: [SupportGuideSectionDto],
    })
    sections: SupportGuideSectionDto[];

    @ApiProperty({
        description: 'Смежные разделы и внешние ссылки.',
        type: [SupportGuideLinkDto],
    })
    links: SupportGuideLinkDto[];
}
