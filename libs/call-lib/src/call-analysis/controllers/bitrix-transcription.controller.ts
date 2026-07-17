import {
    Body,
    Controller,
    Get,
    HttpCode,
    HttpStatus,
    Logger,
    Param,
    Post,
} from '@nestjs/common';
import {
    ApiOkResponse,
    ApiOperation,
    ApiParam,
    ApiTags,
} from '@nestjs/swagger';
import {
    BitrixTranscriptionRequestDto,
    BitrixTranscriptionResponseDto,
} from '../dto/bitrix-transcription.dto';
import { StartBitrixTranscriptionUseCase } from '../use-cases/start-bitrix-transcription.use-case';
import { GetBitrixTranscriptionResultUseCase } from '../use-cases/get-bitrix-transcription-result.use-case';

@ApiTags('Транскрибация (Bitrix Vibecode)')
@Controller('transcription-bitrix')
export class BitrixTranscriptionController {
    private readonly logger = new Logger(BitrixTranscriptionController.name);

    constructor(
        private readonly startUseCase: StartBitrixTranscriptionUseCase,
        private readonly getResultUseCase: GetBitrixTranscriptionResultUseCase,
    ) {}

    @Post()
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary:
            'Запустить транскрибацию аудиофайла через Bitrix Vibecode Whisper. Возвращает taskId для поллинга.',
    })
    @ApiOkResponse({
        description:
            'Задача поставлена в очередь. taskId используется для опроса GET /transcription-bitrix/:taskId.',
        type: BitrixTranscriptionResponseDto,
    })
    async start(
        @Body() dto: BitrixTranscriptionRequestDto,
    ): Promise<BitrixTranscriptionResponseDto> {
        try {
            return await this.startUseCase.execute(dto);
        } catch (error) {
            this.logger.error('Error starting bitrix transcription:', error);
            throw error;
        }
    }

    @Get(':taskId')
    @ApiOperation({
        summary:
            'Получить статус и (если готов) результат транскрибации по taskId.',
    })
    @ApiParam({
        name: 'taskId',
        description: 'ID задачи транскрибации, возвращённый при POST.',
        type: String,
        example: 'bitrix_transcribe_1716468234567',
    })
    @ApiOkResponse({
        description:
            'Текущий статус задачи + расшифровка если status=done или текст ошибки если status=error.',
        type: BitrixTranscriptionResponseDto,
    })
    async getResult(
        @Param('taskId') taskId: string,
    ): Promise<BitrixTranscriptionResponseDto> {
        return this.getResultUseCase.execute(taskId);
    }
}
