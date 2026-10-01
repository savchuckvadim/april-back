import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    IsBoolean,
    IsInt,
    IsNotEmpty,
    IsOptional,
    IsString,
    Min,
} from 'class-validator';

/**
 * Запрос ручного прогона отчёта по дублям — сейчас, без ожидания дня и
 * часа из настроек. Итог приходит в Telegram, а не в ответ ручки.
 */
export class DuplicateReportRunNowRequestDto {
    @ApiProperty({
        description:
            'Домен портала Bitrix, по которому прогнать отчёт прямо сейчас. ' +
            'Получатели, исключённые сотрудники и срок задачи — из настроек ' +
            'портала в админке.',
        type: String,
        example: 'example.bitrix24.ru',
    })
    @IsString()
    @IsNotEmpty()
    domain: string;

    @ApiPropertyOptional({
        description:
            'Только посчитать: итог прогона уходит в Telegram, файлы на Диск ' +
            'не загружаются и задачи не ставятся. Не указан — берётся ' +
            'настройка портала «Отчёт по дублям: только считать»; false — ' +
            'поставить задачи, даже если настройка включена.',
        type: Boolean,
        example: true,
    })
    @IsOptional()
    @IsBoolean()
    dryRun?: boolean;

    @ApiPropertyOptional({
        description:
            'Пробный прогон: Bitrix ID сотрудника, которому уйдёт ВЕСЬ отчёт ' +
            'портала одной задачей с Excel — посмотреть, как его увидят ' +
            'руководители. Настроенным получателям ничего не ставится, их ' +
            'прошлые задачи не закрываются, неделя не закрывается. «Только ' +
            'посчитать» при этом не действует.',
        type: Number,
        example: 1,
    })
    @IsOptional()
    @IsInt()
    @Min(1)
    previewUserId?: number;
}

/** Ответ ручного прогона: начат ли он; итог придёт в Telegram. */
export class DuplicateReportRunNowResponseDto {
    @ApiProperty({
        description:
            'true — прогон начат в фоне, итог придёт в Telegram сообщением ' +
            'крона; false — уже идёт другой прогон отчёта (крон или ручной).',
        type: Boolean,
        example: true,
    })
    started: boolean;

    @ApiProperty({
        description: 'Пояснение для человека: что будет дальше.',
        type: String,
        example: 'Прогон начат — итог придёт в Telegram через несколько минут',
    })
    message: string;
}
