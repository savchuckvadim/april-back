import { IsBxHookUserId } from '@/core/decorators/dto/bx-hook-user-id.decorator';
import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsString } from 'class-validator';

export enum EnumColdCallEntityType {
    COMPANY = 'company',
    CONTACT = 'contact',
    DEAL = 'deal',
    LEAD = 'lead',
}
export enum EnumColdCallIsTmc {
    Y = 'Y',
    N = 'N',
}
export class ColdCallQueryDto {
    @ApiProperty({
        description:
            'Тип CRM-сущности Bitrix, к которой привязан холодный звонок ' +
            '(компания, контакт, сделка или лид).',
        example: 'company',
        enum: EnumColdCallEntityType,
        type: String,
    })
    @IsEnum(EnumColdCallEntityType)
    entityType: EnumColdCallEntityType;

    @ApiProperty({
        description:
            'Идентификатор сущности Bitrix, по которой создаётся холодный звонок.',
        example: 'some entity id',
        type: String,
    })
    @IsString()
    entityId: string;

    @ApiProperty({
        description:
            'Ответственный за звонок — идентификатор пользователя Bitrix ' +
            'в формате hook (user_<id>).',
        example: 'user_123',
        type: String,
    })
    @IsBxHookUserId()
    responsible: string;

    @ApiProperty({
        description:
            'Создатель/постановщик звонка — идентификатор пользователя Bitrix ' +
            'в формате hook (user_<id>).',
        example: 'user_123',
        type: String,
    })
    @IsBxHookUserId()
    created: string;

    @ApiProperty({
        description:
            'Дедлайн звонка в сыром формате DD.MM.YYYY HH:mm:ss БЕЗ таймзоны. ' +
            'Трактуется как локальное время портала (PortalModel.getTimezone). ' +
            'Конвертация в server-time задач (Москва) и CRM-поля выполняется ' +
            'через PortalDeadline на стороне use-case.',
        example: '01.07.2026 02:14:00',
        type: String,
    })
    @IsString()
    deadline: string; // raw 01.07.2026 02:14:00, локальное время портала

    @ApiProperty({
        description: 'Название/тема холодного звонка.',
        example: 'some name',
        type: String,
    })
    @IsString()
    name: string;

    @ApiProperty({
        description:
            'Признак работы с ТМЦ (телемаркетинговый центр -те кто назначают заявки на презентации): ' +
            'Y — да, N — нет.',
        example: EnumColdCallIsTmc.Y,
        enum: EnumColdCallIsTmc,
        type: String,
    })
    @IsEnum(EnumColdCallIsTmc)
    isTmc: EnumColdCallIsTmc;
}
