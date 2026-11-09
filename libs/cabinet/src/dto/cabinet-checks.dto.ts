import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, MaxLength } from 'class-validator';
import type { ChannelCheckResult } from '../admin/cabinet-channel-check.service';
import type {
    MailCheckResult,
    MailTransportStatus,
} from '../admin/cabinet-mail-check.service';

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

export class CabinetMailCheckResultDto
    extends CabinetCheckResultDto
    implements MailCheckResult
{
    @ApiProperty({
        description:
            'Сетевая диагностика, если соединиться не удалось: во что резолвится ' +
            'SMTP-хост, открыты ли порты 465/587 с сервера и что поменять.',
        type: [String],
        example: [
            'smtp.mail.ru → 94.100.180.160',
            'порт 465: нет ответа (закрыт или режется по пути)',
            'порт 587: открыт',
            'Порт 587 открыт — поставьте MAIL_PORT=587 (465 — SSL, 587 — STARTTLS) в корневом .env и пересоздайте admin и pbx.',
        ],
    })
    details!: string[];
}

export class CabinetMailStatusDto implements MailTransportStatus {
    @ApiProperty({
        description: 'Почта настроена: задан MAIL_HOST.',
        type: Boolean,
        example: true,
    })
    configured!: boolean;

    @ApiProperty({
        description: 'SMTP-сервер (MAIL_HOST).',
        type: String,
        nullable: true,
        example: 'smtp.mail.ru',
    })
    host!: string | null;

    @ApiProperty({
        description: 'Порт (MAIL_PORT): 465 — SSL, 587 — STARTTLS.',
        type: Number,
        nullable: true,
        example: 465,
    })
    port!: number | null;

    @ApiProperty({
        description: 'Шифрование сразу при соединении (порт 465).',
        type: Boolean,
        example: true,
    })
    secure!: boolean;

    @ApiProperty({
        description: 'Логин ящика (MAIL_LOGIN).',
        type: String,
        nullable: true,
        example: 'april-app@mail.ru',
    })
    login!: string | null;

    @ApiProperty({
        description: 'Пароль задан (MAIL_PASSWORD); сам пароль не отдаётся.',
        type: Boolean,
        example: true,
    })
    passwordSet!: boolean;

    @ApiProperty({
        description:
            'Адрес отправителя писем (SMTP_FROM или адрес по умолчанию).',
        type: String,
        example: 'april-app@mail.ru',
    })
    from!: string;

    @ApiProperty({
        description: 'Что в настройке почты не так — по-русски.',
        type: [String],
        example: [],
    })
    warnings!: string[];
}
