import { ApiProperty } from '@nestjs/swagger';
import {
    CABINET_GUIDE_CHECK_STATUSES,
    type CabinetGuide,
    type CabinetGuideCheck,
    type CabinetGuideCheckStatus,
    type CabinetGuideCounters,
    type CabinetGuideLink,
    type CabinetGuideSection,
} from '../guide/cabinet-guide.types';

export class CabinetGuideLinkDto implements CabinetGuideLink {
    @ApiProperty({
        description: 'Подпись ссылки.',
        type: String,
        example: 'Клиенты',
    })
    title!: string;

    @ApiProperty({
        description: 'Путь админки или внешний адрес.',
        type: String,
        example: '/client',
    })
    href!: string;
}

export class CabinetGuideCheckDto implements CabinetGuideCheck {
    @ApiProperty({
        description: 'Код пункта чек-листа.',
        type: String,
        example: 'bot-token',
    })
    key!: string;

    @ApiProperty({
        description: 'Что проверяется — по-русски.',
        type: String,
        example: 'Клиентский Telegram-бот',
    })
    title!: string;

    @ApiProperty({
        description:
            'done — сделано, todo — не сделано, manual — админка проверить не может (как — в подсказке).',
        enum: CABINET_GUIDE_CHECK_STATUSES,
        example: 'done',
    })
    status!: CabinetGuideCheckStatus;

    @ApiProperty({
        description: 'Что сделать или как проверить. Markdown.',
        type: String,
        example: 'Telegram узнал бота: @AprilReportBot.',
    })
    hint!: string;

    @ApiProperty({
        description: 'Куда идти, чтобы сделать пункт; null — ссылки нет.',
        type: CabinetGuideLinkDto,
        nullable: true,
    })
    link!: CabinetGuideLinkDto | null;
}

export class CabinetGuideSectionDto implements CabinetGuideSection {
    @ApiProperty({
        description: 'Код раздела.',
        type: String,
        example: 'telegram',
    })
    key!: string;

    @ApiProperty({
        description: 'Заголовок вкладки.',
        type: String,
        example: 'Telegram',
    })
    title!: string;

    @ApiProperty({
        description: 'Текст раздела. Markdown (подмножество GFM).',
        type: String,
        example: '## Telegram\n\nУ April три бота…',
    })
    markdown!: string;
}

export class CabinetGuideCountersDto implements CabinetGuideCounters {
    @ApiProperty({
        description: 'Порталов в базе.',
        type: Number,
        example: 120,
    })
    portals!: number;

    @ApiProperty({
        description: 'Порталов, привязанных к организации.',
        type: Number,
        example: 40,
    })
    portalsWithClient!: number;

    @ApiProperty({
        description: 'Порталов, у кабинета которых есть владелец.',
        type: Number,
        example: 12,
    })
    portalsWithOwner!: number;

    @ApiProperty({
        description: 'Активных участников кабинетов (владельцы и участники).',
        type: Number,
        example: 35,
    })
    members!: number;

    @ApiProperty({
        description: 'Заявок из Битрикс24, ждущих подтверждения.',
        type: Number,
        example: 2,
    })
    pending!: number;

    @ApiProperty({
        description: 'Привязанных Telegram-чатов.',
        type: Number,
        example: 18,
    })
    telegramBindings!: number;
}

export class CabinetGuideDto implements CabinetGuide {
    @ApiProperty({
        description: 'Суть кабинета в двух-трёх предложениях.',
        type: String,
        example: 'Кабинет клиента — личный кабинет организации-клиента April…',
    })
    summary!: string;

    @ApiProperty({
        description:
            'Сколько подключено; null — таблицы кабинета ещё не созданы.',
        type: CabinetGuideCountersDto,
        nullable: true,
    })
    counters!: CabinetGuideCountersDto | null;

    @ApiProperty({
        description: 'Что осталось, чтобы кабинет заработал.',
        type: [CabinetGuideCheckDto],
    })
    checklist!: CabinetGuideCheckDto[];

    @ApiProperty({
        description: 'Разделы путеводителя по порядку вкладок.',
        type: [CabinetGuideSectionDto],
    })
    sections!: CabinetGuideSectionDto[];

    @ApiProperty({
        description: 'Смежные страницы.',
        type: [CabinetGuideLinkDto],
    })
    links!: CabinetGuideLinkDto[];
}
