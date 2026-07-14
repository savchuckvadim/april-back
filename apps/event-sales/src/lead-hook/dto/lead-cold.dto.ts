import { IsNumeric } from '@/core/decorators';
import { IsBxHookUserId } from '@/core/decorators/dto/bx-hook-user-id.decorator';
import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class LeadColdCallQueryDto {
    @ApiProperty({
        description:
            'Идентификатор лида Bitrix, для которого запускается полный ' +
            'event-флоу: поиск/создание компании, привязка лида к компании ' +
            'и постановка холодного звонка по компании.',
        example: 123,
        type: Number,
    })
    @IsNumeric()
    leadId: number;

    @ApiProperty({
        description:
            'Дедлайн звонка в сыром формате DD.MM.YYYY HH:mm:ss БЕЗ таймзоны. ' +
            'Трактуется как локальное время портала; конвертация в server-time ' +
            'задач (Москва) и CRM-поля выполняется в cold-флоу.',
        example: '01.07.2026 02:14:00',
        type: String,
    })
    @IsString()
    @IsNotEmpty()
    deadline: string; // raw 01.07.2026 02:14:00, локальное время портала

    @ApiProperty({
        description:
            'Ответственный за звонок — идентификатор пользователя Bitrix ' +
            'в формате hook (user_<id>). В легаси это поле `assigned`.',
        example: 'user_123',
        type: String,
    })
    @IsBxHookUserId()
    assigned: string;

    @ApiProperty({
        description: 'Название/тема холодного звонка.',
        example: 'some name',
        type: String,
    })
    @IsString()
    @IsNotEmpty()
    name: string;
}
