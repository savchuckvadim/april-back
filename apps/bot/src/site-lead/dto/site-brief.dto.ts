import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
    IsIn,
    IsNotEmpty,
    IsOptional,
    IsString,
    Matches,
    MaxLength,
} from 'class-validator';
import {
    SITE_BRIEF_KINDS,
    SITE_BRIEF_LIMITS,
    SITE_BRIEF_MAX_PARTS,
    type SiteBrief,
    type SiteBriefKind,
} from '../domain/site-brief.types';
import { SITE_LEAD_PAGE_PATTERN } from '../domain/site-lead.types';
import { trim, trimOptional } from './trim.transform';

export class SiteBriefDto implements SiteBrief {
    @ApiProperty({
        description:
            'Вид брифа: calibration — бриф калибровки AI-аналитики, call-review — бриф оценки звонка. От вида зависит тема сообщений в чате.',
        type: String,
        enum: SITE_BRIEF_KINDS,
        example: 'calibration',
    })
    @IsString()
    @IsIn(SITE_BRIEF_KINDS)
    kind!: SiteBriefKind;

    @ApiPropertyOptional({
        description:
            'Организация, указанная в анкете, — вместе с доменом портала попадает в тему каждого сообщения брифа, чтобы в чате было видно, чей он.',
        type: String,
        example: 'ООО «Ромашка»',
        maxLength: SITE_BRIEF_LIMITS.field,
    })
    @IsOptional()
    @Transform(trimOptional)
    @IsString()
    @MaxLength(SITE_BRIEF_LIMITS.field)
    company?: string;

    @ApiPropertyOptional({
        description: 'Кто заполнил анкету — с кем говорить по брифу.',
        type: String,
        example: 'Иванова Мария, РОП',
        maxLength: SITE_BRIEF_LIMITS.field,
    })
    @IsOptional()
    @Transform(trimOptional)
    @IsString()
    @MaxLength(SITE_BRIEF_LIMITS.field)
    respondent?: string;

    @ApiPropertyOptional({
        description:
            'Домен портала Битрикс24 из ответа анкеты — к какому порталу относится бриф.',
        type: String,
        example: 'romashka.bitrix24.ru',
        maxLength: SITE_BRIEF_LIMITS.field,
    })
    @IsOptional()
    @Transform(trimOptional)
    @IsString()
    @MaxLength(SITE_BRIEF_LIMITS.field)
    domain?: string;

    @ApiProperty({
        description:
            'Текст протокола анкеты: вопросы и ответы. Длинный уйдёт в чат несколькими сообщениями.',
        type: String,
        example: '1. Сколько менеджеров в отделе?\nОтвет: 6',
        maxLength: SITE_BRIEF_LIMITS.protocol,
    })
    @Transform(trim)
    @IsString()
    @IsNotEmpty()
    @MaxLength(SITE_BRIEF_LIMITS.protocol)
    protocol!: string;

    @ApiPropertyOptional({
        description:
            'Путь страницы сайта, с которой отправлен бриф. В чат не попадает — нужен для журнала сервера, если бриф не доставлен.',
        type: String,
        example: '/ai/briefs',
        maxLength: SITE_BRIEF_LIMITS.field,
    })
    @IsOptional()
    @Transform(trimOptional)
    @IsString()
    @MaxLength(SITE_BRIEF_LIMITS.field)
    @Matches(SITE_LEAD_PAGE_PATTERN, {
        message: 'Страница — путь сайта, начинается с «/»',
    })
    page?: string;
}

export class SiteBriefResponseDto {
    @ApiProperty({
        description:
            'Все части брифа приняты Telegram. Недоставленный бриф возвращает ошибку 503, а не false.',
        type: Boolean,
        example: true,
    })
    delivered!: boolean;

    @ApiProperty({
        description: 'Сколькими сообщениями бриф лёг в чат.',
        type: Number,
        example: 3,
        minimum: 1,
        maximum: SITE_BRIEF_MAX_PARTS,
    })
    parts!: number;
}
