import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, MaxLength } from 'class-validator';
import type { ChannelCheckResult } from '../admin/cabinet-channel-check.service';

export class CabinetMailTestDto {
    @ApiProperty({
        description: 'Адрес, на который отправить тестовое письмо.',
        type: String,
        example: 'savchuckvadim@gmail.com',
    })
    @IsEmail({}, { message: 'Укажите email, например name@example.ru' })
    @MaxLength(255)
    email!: string;
}

export class CabinetCheckResultDto implements ChannelCheckResult {
    @ApiProperty({
        description:
            'Канал работает: письмо принято SMTP / сообщение доставлено.',
        type: Boolean,
        example: true,
    })
    ok!: boolean;

    @ApiProperty({
        description: 'Что произошло и что сделать — по-русски.',
        type: String,
        example:
            'Письмо отправлено на name@example.ru — проверьте ящик (и папку «Спам»).',
    })
    message!: string;
}
