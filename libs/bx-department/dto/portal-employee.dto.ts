import { ApiProperty } from '@nestjs/swagger';
import type { PortalEmployee } from '../lib/portal-employees.util';

/** Сотрудник портала для выбора в настройках админки. */
export class PortalEmployeeDto implements PortalEmployee {
    @ApiProperty({
        description: 'Bitrix-id сотрудника — то, что сохраняется в настройке.',
        type: Number,
        example: 447,
    })
    id: number;

    @ApiProperty({
        description:
            'Фамилия и имя из профиля Битрикса; без имени — «Сотрудник {id}».',
        type: String,
        example: 'Савчук Вадим',
    })
    name: string;

    @ApiProperty({
        description: 'Должность из профиля; null — не заполнена.',
        type: String,
        nullable: true,
        example: 'Руководитель отдела продаж',
    })
    position: string | null;

    @ApiProperty({
        description:
            'Названия отделов сотрудника по структуре портала (может быть ' +
            'несколько; пусто — сотрудник вне структуры).',
        type: [String],
        example: ['Отдел продаж'],
    })
    departments: string[];
}
