import { ApiProperty } from '@nestjs/swagger';
import { EResultCode } from '../interfaces/response.interface';

export class SuccessResponseDto<T = any> {
    @ApiProperty({
        description: 'Код результата операции (0 - успех)',
        example: EResultCode.SUCCESS,
        enum: EResultCode,
    })
    resultCode: EResultCode;

    @ApiProperty({
        description: 'Данные ответа',
        type: Object,
    })
    data: T;
}

export class ErrorResponseDto {
    @ApiProperty({
        description: 'Код результата операции (1 - ошибка)',
        example: EResultCode.ERROR,
        enum: EResultCode,
    })
    resultCode: EResultCode;

    @ApiProperty({
        description: 'Сообщение об ошибке',
        example: 'Bitrix App failed',
        type: String,
    })
    message: string;
}
