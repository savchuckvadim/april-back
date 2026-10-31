import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import {
    ComplectDescriptionService,
    type RenderedComplectDescription,
} from '../../complect-description/services/complect-description.service';
import type { PublicDescriptionRequestDto } from '../dto/public-description.dto';
import { FixedWindowLimiter } from '../lib/fixed-window-limiter';
import { PublicLinkService } from './public-link.service';

const DESCRIPTIONS_PER_MINUTE = 30;
const MINUTE_MS = 60_000;

/**
 * Описание комплекта по публичному токену. Файл собирается тем же кодом, что и
 * во фрейме, но нигде не сохраняется: текст фронта остаётся только у того, кто
 * его прислал, и публичное хранилище не наполняется посторонними документами.
 */
@Injectable()
export class PublicDescriptionService {
    private readonly limiter = new FixedWindowLimiter(
        DESCRIPTIONS_PER_MINUTE,
        MINUTE_MS,
    );

    constructor(
        private readonly links: PublicLinkService,
        private readonly description: ComplectDescriptionService,
    ) {}

    async render(
        token: string,
        dto: PublicDescriptionRequestDto,
    ): Promise<RenderedComplectDescription> {
        await this.links.requireActive(token);
        if (!this.limiter.consume(token)) {
            throw new HttpException(
                'Слишком много запросов, повторите через минуту',
                HttpStatus.TOO_MANY_REQUESTS,
            );
        }
        return this.description.render(dto);
    }
}
