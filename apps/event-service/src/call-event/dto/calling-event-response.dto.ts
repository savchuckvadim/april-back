import { ApiProperty } from '@nestjs/swagger';

/** Ответ эндпоинта звонка (совместим с legacy `EResult`). */
export class CallingEventResponseDto {
    @ApiProperty({
        description: 'Код результата приёма хука (0 — успех)',
        example: 0,
    })
    resultCode: number;
}
