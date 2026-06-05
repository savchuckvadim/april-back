import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class FailDto {
    @ApiProperty({
        description:
            'Дата постановки задачи на пост-фейл обработку (ISO 8601). ' +
            'Используется при планировании повторного касания по проигранной сделке.',
        type: String,
        example: '2026-06-10T10:00:00+03:00',
    })
    @IsString()
    postFailDate: string;
}
