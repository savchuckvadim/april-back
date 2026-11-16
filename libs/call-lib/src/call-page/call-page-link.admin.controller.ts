import { Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import {
    ApiNotFoundResponse,
    ApiOkResponse,
    ApiOperation,
    ApiParam,
    ApiTags,
} from '@nestjs/swagger';
import { TranscriptionStoreService } from '../transcription/services/transcription.store.service';
import { CallPageLinkService } from './call-page-link.service';
import { CallPageLinkDto } from './dto/call-page-link.dto';

const TRANSCRIPTION_PARAM = {
    name: 'transcriptionId',
    type: String,
    description: 'Номер расшифровки звонка (колонка «№» в списке расшифровок).',
    example: '2437933',
} as const;

/**
 * Ссылка на страницу разбора звонка (`admin/call-page`): получить ссылку
 * звонка и отозвать её. Ссылка открывается без входа, поэтому отзыв нужен
 * на случай, если она ушла не тому: после отзыва прежняя ссылка перестаёт
 * открываться, а в ответе приходит новая.
 */
@ApiTags('Admin Call Page')
@Controller('admin/call-page')
export class AdminCallPageLinkController {
    constructor(
        private readonly links: CallPageLinkService,
        private readonly transcriptions: TranscriptionStoreService,
    ) {}

    @ApiOperation({
        summary: 'Ссылка на страницу разбора звонка',
        description:
            'Действующая ссылка звонка — та же, что пишется в карточку разбора и ' +
            'в сделку. Годится и для звонков, разобранных до появления страницы.',
    })
    @ApiParam(TRANSCRIPTION_PARAM)
    @ApiOkResponse({ type: CallPageLinkDto })
    @ApiNotFoundResponse({ description: 'Расшифровки с таким номером нет.' })
    @Get(':transcriptionId/link')
    async link(
        @Param('transcriptionId') transcriptionId: string,
    ): Promise<CallPageLinkDto> {
        const row = await this.transcriptions.findPipelineById(transcriptionId);
        return { url: await this.links.urlFor(row.id) };
    }

    @ApiOperation({
        summary: 'Отозвать ссылку на страницу разбора звонка',
        description:
            'Прежняя ссылка звонка перестаёт открываться сразу. В ответе — новая ' +
            'ссылка: в карточке разбора и в сделке останется старая, новую нужно ' +
            'передать тем, кому страница нужна.',
    })
    @ApiParam(TRANSCRIPTION_PARAM)
    @ApiOkResponse({ type: CallPageLinkDto })
    @ApiNotFoundResponse({ description: 'Расшифровки с таким номером нет.' })
    @Post(':transcriptionId/revoke')
    @HttpCode(200)
    async revoke(
        @Param('transcriptionId') transcriptionId: string,
    ): Promise<CallPageLinkDto> {
        const row = await this.transcriptions.findPipelineById(transcriptionId);
        await this.links.revoke(row.id, row.domain ?? '');
        return { url: await this.links.urlFor(row.id) };
    }
}
