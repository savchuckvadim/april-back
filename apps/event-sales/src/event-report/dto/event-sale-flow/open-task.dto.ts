import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { IsNumeric } from '@/core/decorators/dto/string-to-number-transform-validate.decorator';
import { EnumTaskEventType } from './task.dto';

/**
 * ОТКРЫТОЕ дело клиента — компактный снимок задачи обзвона.
 *
 * Зачем поле в контракте, а не догрузка на бэке:
 *  1. Вид события (`eventType`) определяется РАЗБОРОМ ЗАГОЛОВКА задачи, и
 *     разбирает его фрейм (см. `EnumTaskEventType`). Бэк по данным задачи
 *     тип не угадывает — это осознанное правило домена, а не упущение.
 *  2. Список открытых дел у фрейма УЖЕ есть: он рисует его на экране.
 *     Отдельный `tasks.task.list` в init-батче отчёта — лишняя команда и
 *     лишняя латентность ради данных, которые уже пришли с клиентом.
 *
 * Присылать нужно ВСЕ открытые дела клиента, включая ту задачу, по которой
 * идёт отчёт: бэк сам исключит её по `currentTask.id`. Список пустой —
 * честное «других дел нет»; поле не прислано вовсе — прежнее поведение
 * (даты пишутся планом вслепую).
 */
export class OpenEventTaskDto {
    @ApiProperty({
        description: 'Идентификатор задачи Bitrix.',
        type: Number,
        example: 777,
    })
    @IsNumeric()
    id: number;

    @ApiProperty({
        description:
            'Тип события задачи — тот же алфавит, что у `currentTask.eventType`.',
        enum: EnumTaskEventType,
        example: EnumTaskEventType.PRESENTATION,
    })
    @IsEnum(EnumTaskEventType)
    eventType: EnumTaskEventType;

    @ApiPropertyOptional({
        description:
            'Дедлайн дела. Принимается ISO 8601 со смещением (как отдаёт ' +
            'портал — на фронте это `EventTask.deadlineRaw`) либо ' +
            '`DD.MM.YYYY HH:mm:ss` в локали портала. Человекочитаемую строку ' +
            'слать НЕЛЬЗЯ: она не разбирается и дело выпадет из расчёта.',
        type: String,
        example: '2026-08-05T15:00:00+03:00',
    })
    @IsOptional()
    @IsString()
    deadline?: string;

    @ApiPropertyOptional({
        description:
            'Название (тема) дела — попадает в «Тему следующего звонка», ' +
            'если именно это дело окажется ближайшим.',
        type: String,
        example: 'ООО Ромашка',
    })
    @IsOptional()
    @IsString()
    name?: string;

    @ApiPropertyOptional({
        description: 'Ответственный за дело.',
        type: Number,
        example: 81,
    })
    @IsOptional()
    @IsNumeric()
    responsibleId?: number;
}
