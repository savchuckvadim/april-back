import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, Min, ValidateIf } from 'class-validator';
import {
    APP_PART_CODES,
    APP_WIDGET_CODES,
    AppPartCode,
    AppWidgetCode,
} from '@lib/portal-lib/store/app-settings';
import { CabinetAdminPortalCard } from '../admin/cabinet-admin.service';
import { CabinetAppStatus } from '../admin/cabinet-app-status.service';
import { CabinetMemberDto } from './cabinet-member.dto';
import { CabinetTelegramBindingDto } from './cabinet-telegram.dto';

export class CabinetAttachClientDto {
    @ApiProperty({
        description:
            'ID организации-клиента (clients.id), к которой привязать портал; null — отвязать (только если у портала нет участников кабинета). Поле обязательно: пустое тело портал не отвязывает.',
        type: Number,
        example: 5,
        nullable: true,
    })
    // null — осознанная отвязка; отсутствие поля — ошибка валидации.
    @ValidateIf((_dto, value) => value !== null)
    @IsInt({ message: 'Укажите ID организации-клиента или null' })
    @Min(1)
    clientId!: number | null;
}

export class CabinetAppStatusDto implements CabinetAppStatus {
    @ApiProperty({
        description: 'Приложение April установлено на портале и не удалено.',
        type: Boolean,
        example: true,
    })
    installed!: boolean;

    @ApiPropertyOptional({
        description:
            'Статус установки: installed — готово, error — сбой шага (см. раздел «Установки»); пусто — не устанавливали.',
        type: String,
        example: 'installed',
        nullable: true,
    })
    installStatus!: string | null;

    @ApiPropertyOptional({
        description: 'Когда установили (ISO).',
        type: String,
        example: '2026-11-08T09:00:00.000Z',
        nullable: true,
    })
    installedAt!: string | null;

    @ApiPropertyOptional({
        description: 'Когда удалили с портала (ISO); пусто — не удаляли.',
        type: String,
        example: null,
        nullable: true,
    })
    uninstalledAt!: string | null;

    @ApiProperty({
        description:
            'Чем бэкенд ходит в портал: webhook — вебхук, app — токен приложения, auto — приложение, если установлено.',
        type: String,
        example: 'webhook',
    })
    bitrixAuthMode!: string;

    @ApiProperty({
        description: 'Включённые части приложения.',
        type: String,
        isArray: true,
        enum: APP_PART_CODES,
        example: ['sales'],
    })
    enabledParts!: AppPartCode[];

    @ApiProperty({
        description:
            'Виджеты, которые ставит «Обновить виджеты» (настройка app_widgets). Пусто — привязки не трогаются.',
        type: String,
        isArray: true,
        enum: APP_WIDGET_CODES,
        example: ['event-sales', 'konstructor'],
    })
    widgets!: AppWidgetCode[];
}

export class CabinetAdminPortalCardDto implements CabinetAdminPortalCard {
    @ApiProperty({ description: 'ID портала.', type: Number, example: 12 })
    portalId!: number;

    @ApiPropertyOptional({
        description: 'Домен портала Битрикс24.',
        type: String,
        example: 'company.bitrix24.ru',
        nullable: true,
    })
    domain!: string | null;

    @ApiPropertyOptional({
        description: 'ID организации-клиента портала; пусто — не привязан.',
        type: Number,
        example: 5,
        nullable: true,
    })
    clientId!: number | null;

    @ApiPropertyOptional({
        description: 'Название организации-клиента.',
        type: String,
        example: 'ООО «Гарант-Сервис»',
        nullable: true,
    })
    organization!: string | null;

    @ApiPropertyOptional({
        description:
            'Допуск портала: approved / pending / blocked; пусто — действующий портал.',
        type: String,
        example: 'approved',
        nullable: true,
    })
    approvalStatus!: string | null;

    @ApiProperty({
        description: 'Приложение April на портале: установка, режим, виджеты.',
        type: CabinetAppStatusDto,
    })
    app!: CabinetAppStatusDto;

    @ApiProperty({
        description:
            'Участники кабинета портала, включая заявки и снятые доступы.',
        type: [CabinetMemberDto],
    })
    members!: CabinetMemberDto[];

    @ApiProperty({
        description: 'Действующие привязки Telegram на портале.',
        type: [CabinetTelegramBindingDto],
    })
    telegram!: CabinetTelegramBindingDto[];
}
