import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
    IsIn,
    IsOptional,
    IsString,
    Matches,
    MaxLength,
} from 'class-validator';
import {
    SITE_LEAD_KINDS,
    SITE_LEAD_LIMITS,
    SITE_LEAD_PAGE_PATTERN,
    type SiteLead,
    type SiteLeadKind,
} from '../domain/site-lead.types';
import { trimOptional } from './trim.transform';

export class SiteLeadDto implements SiteLead {
    @ApiProperty({
        description:
            'Вид заявки: demo — запись на демо, callback — обратный звонок с формы сайта, offer — просьба прислать КП на почту. От вида зависит заголовок сообщения в чате.',
        type: String,
        enum: SITE_LEAD_KINDS,
        example: 'demo',
    })
    @IsString()
    @IsIn(SITE_LEAD_KINDS)
    kind!: SiteLeadKind;

    @ApiPropertyOptional({
        description:
            'Как обращаться к человеку, оставившему заявку: имя из формы сайта.',
        type: String,
        example: 'Ирина',
        maxLength: SITE_LEAD_LIMITS.name,
    })
    @IsOptional()
    @Transform(trimOptional)
    @IsString()
    @MaxLength(SITE_LEAD_LIMITS.name)
    name?: string;

    @ApiPropertyOptional({
        description:
            'Телефон для обратного звонка в любой записи. Нужен телефон из десяти цифр или корректная почта (проверяет контроллер); сомнительный второй контакт не отклоняет заявку, а уходит в чат с пометкой.',
        type: String,
        example: '+7 (900) 123-45-67',
        maxLength: SITE_LEAD_LIMITS.phone,
    })
    @IsOptional()
    @Transform(trimOptional)
    @IsString()
    @MaxLength(SITE_LEAD_LIMITS.phone)
    phone?: string;

    @ApiPropertyOptional({
        description:
            'Электронная почта: для заявки «КП на почту» — единственный контакт. Нужна корректная почта или телефон из десяти цифр (проверяет контроллер).',
        type: String,
        example: 'irina@example.ru',
        maxLength: SITE_LEAD_LIMITS.email,
    })
    @IsOptional()
    @Transform(trimOptional)
    @IsString()
    @MaxLength(SITE_LEAD_LIMITS.email)
    email?: string;

    @ApiPropertyOptional({
        description:
            'Компания и город посетителя — помогают подготовиться к звонку.',
        type: String,
        example: 'ООО «Пример», Воронеж',
        maxLength: SITE_LEAD_LIMITS.company,
    })
    @IsOptional()
    @Transform(trimOptional)
    @IsString()
    @MaxLength(SITE_LEAD_LIMITS.company)
    company?: string;

    @ApiPropertyOptional({
        description:
            'Свободный комментарий: что посетитель хочет увидеть или обсудить, сколько у него менеджеров.',
        type: String,
        example: 'Интересует AI-разбор звонков',
        maxLength: SITE_LEAD_LIMITS.comment,
    })
    @IsOptional()
    @Transform(trimOptional)
    @IsString()
    @MaxLength(SITE_LEAD_LIMITS.comment)
    comment?: string;

    @ApiProperty({
        description:
            'Путь страницы сайта, с которой отправлена заявка, — по нему видно, что человек читал.',
        type: String,
        example: '/platform/ai',
        maxLength: SITE_LEAD_LIMITS.page,
    })
    @IsString()
    @MaxLength(SITE_LEAD_LIMITS.page)
    @Matches(SITE_LEAD_PAGE_PATTERN, {
        message: 'Страница — путь сайта, начинается с «/»',
    })
    page!: string;
}

export class SiteLeadResponseDto {
    @ApiProperty({
        description:
            'Заявка принята Telegram и лежит в чате заявок. Недоставленная заявка возвращает ошибку 503, а не false.',
        type: Boolean,
        example: true,
    })
    delivered!: boolean;
}
