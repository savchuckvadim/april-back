import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { InstallCallReportSmartUseCase } from '@lib/call-lib';
import { CallReportScanUseCase } from '../use-cases/call-report-scan.use-case';
import { CallReportAnalyzeUseCase } from '../use-cases/call-report-analyze.use-case';
import { CallRevisionService } from '../services/call-revision.service';
import { PresentationAuditService } from '../services/presentation-audit.service';
import { PresentationPlanFactService } from '../services/presentation-plan-fact.service';
import {
    AnalyzeCallDto,
    InstallCallReportSmartDto,
    PresentationAuditRequestDto,
    PresentationPlanFactRequestDto,
    ReviseCallsDto,
    ScanCallsDto,
} from '../dto/call-report-request.dto';
import {
    AnalyzeCallsResponseDto,
    CallReportScanResponseDto,
    InstallCallReportSmartResponseDto,
    PresentationAuditResponseDto,
    PresentationPlanFactResponseDto,
    ReviseCallsResponseDto,
} from '../dto/call-report-response.dto';

const REVISOR_DEFAULT_WINDOW_HOURS = 24;
const REVISOR_DEFAULT_MAX_ENTITIES = 20;

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
        private readonly revisionService: CallRevisionService,
        private readonly presentationAudit: PresentationAuditService,
        private readonly planFact: PresentationPlanFactService,
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
            createSmartItem: dto.createSmartItem,
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

    @Post('revise')
    @HttpCode(200)
    @ApiOperation({
        summary: 'Ночная ревизия по сущностям (синхронно, ручной запуск)',
        description:
            'Второй такт анализа (Фаза 3): для каждой сделки/лида с разборами ' +
            'звонков за окно собирает свежие разборы + историю + паспорт CRM, ' +
            'запрашивает LLM-свод (невыполненные обещания, рекомендации по ' +
            'сделке, риски) и записывает его в последний смарт-элемент и ' +
            'таймлайн сущности. Ручной аналог ночного крона ' +
            'CallRevisionScheduler (23:30 МСК) — для смоука на ограниченных ' +
            'данных; выполняется синхронно, на сущность уходит один LLM-запрос.',
    })
    @ApiBody({
        type: ReviseCallsDto,
        description: 'Домен и границы прогона (окно, лимит сущностей).',
    })
    @ApiOkResponse({
        type: ReviseCallsResponseDto,
        description:
            'Статистика ревизии: сущностей найдено/обработано/с ошибками.',
    })
    async revise(@Body() dto: ReviseCallsDto): Promise<ReviseCallsResponseDto> {
        const to = new Date();
        const from = new Date(
            to.getTime() -
                (dto.windowHours ?? REVISOR_DEFAULT_WINDOW_HOURS) *
                    60 *
                    60 *
                    1000,
        );
        return this.revisionService.runForDomain(
            dto.domain,
            from,
            to,
            dto.maxEntities ?? REVISOR_DEFAULT_MAX_ENTITIES,
        );
    }

    @Post('presentation-audit')
    @HttpCode(200)
    @ApiOperation({
        summary: 'Сверка по презентациям (синхронно, ручной запуск)',
        description:
            'Фаза 4: для каждого свежего разбора презентации/решения читает ' +
            'отчёт менеджера из полей сделки («ОП Хвост», «ОП Пять К», ' +
            '«ОП Комментарии после презентаций») и сверяет с разбором одним ' +
            'LLM-вызовом. Итог — «⚖️ Сверка с отчётом менеджера» в таймлайн ' +
            'смарт-элемента; при расхождении — дубль в таймлайн сделки. ' +
            'Идемпотентно (ais type=presentation-audit). Ручной аналог ' +
            'утреннего крона PresentationAuditScheduler (08:00 МСК).',
    })
    @ApiBody({
        type: PresentationAuditRequestDto,
        description: 'Домен и границы прогона.',
    })
    @ApiOkResponse({
        type: PresentationAuditResponseDto,
        description: 'Счётчики: кандидатов/сверено/расхождений.',
    })
    async presentationAuditRun(
        @Body() dto: PresentationAuditRequestDto,
    ): Promise<PresentationAuditResponseDto> {
        const to = new Date();
        const from = new Date(
            to.getTime() - (dto.windowHours ?? 30) * 60 * 60 * 1000,
        );
        return this.presentationAudit.runForDomain(
            dto.domain,
            from,
            to,
            dto.maxEntities ?? 20,
        );
    }

    @Post('presentation-plan-fact')
    @HttpCode(200)
    @ApiOperation({
        summary: 'План-факт по презентациям (синхронно, ручной запуск)',
        description:
            'Планы презентаций из списка КПИ (тип события «Презентация», ' +
            'действие «План», дата события в окне) сопоставляются с фактами: ' +
            'AI-разбором звонка-презентации того же менеджера/сделки рядом по ' +
            'времени либо done-записью КПИ. Итог по каждому плану: ' +
            'подтверждён звонком / отчёт без звонка / пропущен. При наличии ' +
            'проблем — дайджест в телеграм. Ручной аналог утреннего крона ' +
            '(идёт после сверки по презентациям, тот же тумблер).',
    })
    @ApiBody({
        type: PresentationPlanFactRequestDto,
        description: 'Домен и окно поиска планов.',
    })
    @ApiOkResponse({
        type: PresentationPlanFactResponseDto,
        description: 'Счётчики и судьба каждого плана.',
    })
    async presentationPlanFactRun(
        @Body() dto: PresentationPlanFactRequestDto,
    ): Promise<PresentationPlanFactResponseDto> {
        const to = new Date();
        const from = new Date(
            to.getTime() - (dto.windowHours ?? 30) * 60 * 60 * 1000,
        );
        return this.planFact.runForDomain(dto.domain, from, to);
    }
}
