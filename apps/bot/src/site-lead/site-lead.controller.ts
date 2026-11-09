import {
    BadRequestException,
    Body,
    Controller,
    HttpCode,
    HttpException,
    HttpStatus,
    Post,
    ServiceUnavailableException,
    UseGuards,
} from '@nestjs/common';
import {
    ApiBadRequestResponse,
    ApiBody,
    ApiHeader,
    ApiOkResponse,
    ApiOperation,
    ApiServiceUnavailableResponse,
    ApiTags,
    ApiTooManyRequestsResponse,
    ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { hasReachableContact } from './domain/site-lead.contact';
import type { SiteLeadSubmitResult } from './domain/site-lead.types';
import { SiteBriefDto, SiteBriefResponseDto } from './dto/site-brief.dto';
import { SiteLeadDto, SiteLeadResponseDto } from './dto/site-lead.dto';
import {
    SITE_LEAD_KEY_HEADER,
    SiteLeadKeyGuard,
} from './guards/site-lead-key.guard';
import { SiteLeadService } from './site-lead.service';

/**
 * Приём заявок и брифов с форм сайта April. Зовёт только сервер сайта — с
 * ключом (SiteLeadKeyGuard); браузер ходит в Next-маршруты сайта, адрес
 * этого приложения ему не виден. От ботов и потока с одного адреса сайт
 * защищается сам (ловушка, повторы, лимит на посетителя), здесь — проверка
 * полей и общий потолок в минуту как предохранитель чата.
 */
@ApiTags('Site Lead')
@ApiHeader({
    name: SITE_LEAD_KEY_HEADER,
    description:
        'Ключ сервера сайта (SITE_LEAD_API_KEY): без него заявка не принимается.',
    required: true,
})
@ApiUnauthorizedResponse({
    description: 'Нет ключа сервера сайта или он неверный.',
})
@ApiTooManyRequestsResponse({
    description:
        'Слишком много отправок за минуту — предохранитель чата от потока.',
})
@ApiServiceUnavailableResponse({
    description:
        'Telegram не принял сообщение, бот или ключ сайта не настроены, либо это сервер-зеркало — не доставлено.',
})
@UseGuards(SiteLeadKeyGuard)
@Controller('site-lead')
export class SiteLeadController {
    constructor(private readonly leads: SiteLeadService) {}

    @Post()
    @HttpCode(200)
    @ApiOperation({
        summary: 'Заявка с сайта в Telegram-чат заявок',
        description:
            'Принимает заявку с формы сайта April (демо, обратный звонок, КП на почту) и отправляет её ботом поддержки в Telegram-чат «April Client». Отвечает успехом, только когда Telegram принял сообщение; иначе 503 — сайт покажет посетителю телефон для связи.',
    })
    @ApiBody({
        type: SiteLeadDto,
        description:
            'Вид заявки, поля формы и путь страницы, с которой она отправлена.',
    })
    @ApiOkResponse({
        type: SiteLeadResponseDto,
        description: 'Заявка доставлена в Telegram-чат заявок.',
    })
    @ApiBadRequestResponse({
        description:
            'Поля не прошли проверку или нет ни телефона из десяти цифр, ни корректной почты — связаться не с кем.',
    })
    async submit(@Body() dto: SiteLeadDto): Promise<SiteLeadResponseDto> {
        if (!hasReachableContact(dto)) {
            throw new BadRequestException(
                'Нужен телефон из десяти цифр или корректная почта',
            );
        }
        this.assertDelivered(await this.leads.submit(dto));
        return { delivered: true };
    }

    @Post('brief')
    @HttpCode(200)
    @ApiOperation({
        summary: 'Бриф с сайта в Telegram-чат заявок',
        description:
            'Принимает бриф анкеты сайта (калибровка AI-аналитики, оценка звонка) и отправляет протокол в Telegram-чат «April Client» — длинный несколькими сообщениями с номерами частей. Успех — только когда Telegram принял все части; иначе 503, и сайт предложит повторить.',
    })
    @ApiBody({
        type: SiteBriefDto,
        description: 'Вид брифа, реквизиты из анкеты и текст протокола.',
    })
    @ApiOkResponse({
        type: SiteBriefResponseDto,
        description: 'Бриф доставлен в Telegram-чат заявок.',
    })
    async submitBrief(
        @Body() dto: SiteBriefDto,
    ): Promise<SiteBriefResponseDto> {
        const { status, parts } = await this.leads.submitBrief(dto);
        this.assertDelivered(status);
        return { delivered: true, parts };
    }

    /** Недоставленное — ошибкой с кодом, а не «delivered: false» с 200. */
    private assertDelivered(result: SiteLeadSubmitResult): void {
        if (result === 'throttled') {
            throw new HttpException(
                'Слишком много отправок — попробуйте через минуту',
                HttpStatus.TOO_MANY_REQUESTS,
            );
        }
        if (result === 'failed') {
            throw new ServiceUnavailableException('Не доставлено в Telegram');
        }
    }
}
