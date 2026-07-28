import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { InstallCallReportSmartUseCase } from '@lib/call-lib';
import { CallReportScanUseCase } from '../use-cases/call-report-scan.use-case';
import { CallReportAnalyzeUseCase } from '../use-cases/call-report-analyze.use-case';
import {
    AnalyzeCallDto,
    InstallCallReportSmartDto,
    ScanCallsDto,
} from '../dto/call-report-request.dto';
import {
    AnalyzeCallsResponseDto,
    CallReportScanResponseDto,
    InstallCallReportSmartResponseDto,
} from '../dto/call-report-response.dto';

/**
 * AI-отчётность по звонкам: установка смарта-витрины, ручной скан
 * и ручной анализ одного звонка (смоук). Автоматика — CallReportScheduler.
 */
@ApiTags('Call Report')
@Controller('call-report')
export class CallReportController {
    constructor(
        private readonly installSmartUseCase: InstallCallReportSmartUseCase,
        private readonly scanUseCase: CallReportScanUseCase,
        private readonly analyzeUseCase: CallReportAnalyzeUseCase,
    ) {}

    @Post('install-smart')
    @HttpCode(200)
    @ApiOperation({
        summary: 'Установить смарт «AI-анализ звонков»',
        description:
            'Создаёт на портале смарт-процесс по const-конфигу и добавляет отсутствующие ' +
            'поля. Идемпотентен: после изменения состава полей достаточно вызвать повторно.',
    })
    @ApiBody({
        type: InstallCallReportSmartDto,
        description: 'Домен портала для установки.',
    })
    @ApiOkResponse({
        type: InstallCallReportSmartResponseDto,
        description: 'Результат установки: entityTypeId и статистика полей.',
    })
    async installSmart(
        @Body() dto: InstallCallReportSmartDto,
    ): Promise<InstallCallReportSmartResponseDto> {
        return this.installSmartUseCase.execute(dto.domain);
    }

    @Post('scan')
    @HttpCode(200)
    @ApiOperation({
        summary: 'Сканировать звонки домена',
        description:
            'Находит свежие длинные звонки через voximplant.statistic.get, отсеивает уже ' +
            'обработанные (dedup_key) и ставит новые в очередь CALL_REPORT. Ручной аналог крон-тика.',
    })
    @ApiBody({
        type: ScanCallsDto,
        description: 'Параметры скана (домен обязателен, пороги опциональны).',
    })
    @ApiOkResponse({
        type: CallReportScanResponseDto,
        description: 'Статистика скана: найдено/в очередь/пропущено.',
    })
    async scan(@Body() dto: ScanCallsDto): Promise<CallReportScanResponseDto> {
        return this.scanUseCase.execute(dto.domain, {
            minDurationSec: dto.minDurationSec,
            windowHours: dto.windowHours,
            maxPerRun: dto.maxPerRun,
            allowedUserIds: dto.userIds,
        });
    }

    @Post('analyze')
    @HttpCode(200)
    @ApiOperation({
        summary: 'Анализ звонков (синхронно): прямой или подбор последних',
        description:
            'Полный конвейер без очереди: транскрибация → классификация → LLM → ' +
            'персист → таймлайн. Прямой режим — задан activityId (dealId ' +
            'опционален, определяется по владельцу активности). Режим подбора — ' +
            'activityId нет: последние записи по dealId ИЛИ userId (bitrix-id ' +
            'менеджера), параметры limit / maxDurationSec / minDurationSec / ' +
            'windowHours. Уже обработанные звонки пропускаются (данные в БД). ' +
            'Для смоука и отладки; звонки обрабатываются по очереди, минутами.',
    })
    @ApiBody({
        type: AnalyzeCallDto,
        description:
            'Адрес звонка (activityId) или фильтры подбора (dealId/userId + limit).',
    })
    @ApiOkResponse({
        type: AnalyzeCallsResponseDto,
        description: 'Итоги обработки по каждому взятому звонку.',
    })
    async analyze(
        @Body() dto: AnalyzeCallDto,
    ): Promise<AnalyzeCallsResponseDto> {
        return this.analyzeUseCase.execute(dto);
    }
}
