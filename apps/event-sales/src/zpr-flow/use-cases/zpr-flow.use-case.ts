import { Injectable, Logger } from '@nestjs/common';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import { PBXService } from '@/modules/pbx';
import { PbxZprSmartService } from '@lib/portal-lib/pbx/pbx-zpr-smart';
import { PbxSmartItemFieldsService } from '@lib/portal-lib/pbx/smart-item-fields';
import {
    SideFlowBaseDealResolver,
    SideFlowKpiRowBinderService,
    SideFlowName,
    SideFlowTaskBinderService,
} from '../../shared/side-flow';
import { ZprFlowJobData } from '../dto/zpr-flow-job.dto';
import { ZprFlowResult } from '../constants/zpr-flow.const';
import { ZprFlowRun } from '../types/zpr-flow-run.type';
import { ZprElementWriterService } from '../services/zpr-element-writer.service';

dayjs.extend(utc);
dayjs.extend(timezone);

const CRM_DATETIME_FORMAT = 'DD.MM.YYYY HH:mm:ss';
/**
 * Имя потока для общих сервисов раздела: они логируют под ним, и канал
 * снова грепается по потоку — как до переезда правил в shared/side-flow.
 */
const FLOW: SideFlowName = 'zpr-flow';

/**
 * Сайд-flow ЗПР: элементы смарта «Звонки По решению» создаются/закрываются
 * ОТДЕЛЬНОЙ очередью после основного event-report (см. ZprFlowJobData).
 *
 * Здесь только оркестрация одного прогона: gate по установке смарта,
 * инициализация портала, сборка {@link ZprFlowRun}, роутинг план/отчёт и
 * привязка получившегося элемента к задаче. Вся работа с полями и записью
 * живёт в подсервисах `services/` — они создаются как
 * `new ZprElementWriterService(bitrix, portal)`, а НЕ инжектятся: инстанс
 * Битрикса привязан к домену портала, и общее поле дало бы race condition
 * между порталами (правило CLAUDE.md).
 *
 * Self-gated: смарт не установлен на портале (resolveInfo → null) — джоб
 * молча завершён, основной flow ничего не заметил.
 */
@Injectable()
export class ZprFlowUseCase {
    private readonly logger = new Logger(ZprFlowUseCase.name);

    constructor(
        private readonly pbx: PBXService,
        private readonly zprSmart: PbxZprSmartService,
        private readonly smartItemFields: PbxSmartItemFieldsService,
        // Привязка элемента к задаче и дотяжка базовой сделки — общие с
        // очередью презентаций: правило одно, чиниться должно один раз.
        private readonly taskBinder: SideFlowTaskBinderService,
        private readonly baseDeal: SideFlowBaseDealResolver,
        private readonly kpiRowBinder: SideFlowKpiRowBinderService,
    ) {}

    async handle(job: ZprFlowJobData): Promise<ZprFlowResult> {
        const info = await this.zprSmart.resolveInfo(job.domain);
        if (!info) return this.skipWithoutSmart(job);

        const { bitrix, PortalModel: portal } = await this.pbx.init(job.domain);
        const tz = portal.getTimezone();
        const now = dayjs().tz(tz).format(CRM_DATETIME_FORMAT);

        // Дотяжка: базовую сделку мог создать ЭТОТ ЖЕ отчёт — на момент
        // постановки джоба числового id не было (в батче она `$result[...]`).
        // Джоб выполняется после батча, сделка уже существует — находим её
        // по компании и работаем как с обычной.
        const resolved: ZprFlowJobData = {
            ...job,
            baseDealId:
                job.baseDealId ??
                (await this.baseDeal.resolve(bitrix, portal, {
                    flow: FLOW,
                    domain: job.domain,
                    companyId: job.companyId,
                    responsibleId: job.responsibleId,
                })),
        };

        const run: ZprFlowRun = {
            bitrix,
            portal,
            info,
            job: resolved,
            tz,
            now,
            // Живые поля читаем ТОЛЬКО когда ответы есть: у подавляющего
            // большинства отчётов портальных анкет нет.
            itemFields: resolved.answers?.length
                ? await this.smartItemFields.resolveFields(
                      resolved.domain,
                      info.entityTypeId,
                  )
                : null,
        };

        const writer = new ZprElementWriterService(bitrix, portal);
        const result =
            resolved.kind === 'plan'
                ? await writer.createPlanned(run, ['plan'])
                : await writer.closeReported(run);

        const taskId = await this.bindToTask(run, result);

        // Обратная ссылка в строки KPI/History этого отчёта: плановый
        // элемент — в план-строки, отчётный — в отчётные (координатор уже
        // разложил их по назначению в job.kpiRows). Ошибки не роняют джоб.
        if (result.elementId && resolved.kpiRows?.length) {
            await this.kpiRowBinder.append(
                bitrix,
                resolved.kpiRows,
                info.entityTypeId,
                result.elementId,
                FLOW,
            );
        }

        this.logger.log(
            `[zpr-flow] ${resolved.domain}: ${resolved.kind} → ${result.action}`,
            {
                telegram: true,
                domain: resolved.domain,
                operationId: resolved.operationId ?? null,
                kind: resolved.kind,
                action: result.action,
                elementId: result.elementId,
                planTaskId: resolved.planTaskId ?? null,
                boundTaskId: taskId,
            },
        );
        return result;
    }

    /**
     * Элемент ↔ задача (вопрос владельца 25.08): задача получает привязку
     * `T{hex}_{id}` в UF_CRM_TASK — сущности смарта находятся из задачи
     * штатным полем, без дотяжек.
     *
     * К КАКОЙ задаче: план привязывается к задаче, СОЗДАННОЙ этим же
     * отчётом (`planTaskId`, её id приехал из `$result[add_task]` того же
     * батча), отчёт и перенос — к задаче, ПО КОТОРОЙ отчитались
     * (`taskId`; на переносе она та же самая, поэтому ветка одна).
     * Раньше план не привязывался вовсе и ждал своего закрытия следующим
     * отчётом — до тех пор задача о своём элементе не знала.
     *
     * @returns задача, к которой привязали, или null (привязки не было).
     */
    private async bindToTask(
        run: ZprFlowRun,
        result: ZprFlowResult,
    ): Promise<number | null> {
        const { job, info, bitrix } = run;
        const taskId = (job.kind === 'plan' ? job.planTaskId : job.taskId) ?? 0;
        if (!taskId || !result.elementId) return null;
        await this.taskBinder.bind(
            bitrix,
            taskId,
            info.entityTypeId,
            result.elementId,
            FLOW,
        );
        return taskId;
    }

    /**
     * Смарта нет — ответов портальной анкеты в этом джобе тоже не
     * может быть: вопрос без установленного смарта компиляция
     * каталога выбрасывает. Приехали вопреки — это ПОТЕРЯ ответов
     * менеджера, а не рядовой пропуск: debug в проде выключен, и
     * такая потеря была бы полностью беззвучной. Пустой джоб
     * остаётся на debug — портал без смарта штатно даёт его на
     * каждом отчёте.
     */
    private skipWithoutSmart(job: ZprFlowJobData): ZprFlowResult {
        const lost = job.answers?.length ?? 0;
        if (lost) {
            this.logger.warn(
                `[zpr-flow] ${job.domain}: смарт zpr_sales не установлен — ` +
                    `${lost} ответ(ов) портальной анкеты записать некуда, ` +
                    'джоб пропущен',
            );
        } else {
            this.logger.debug(
                `[zpr-flow] ${job.domain}: смарт zpr_sales не установлен — пропуск`,
            );
        }
        return { action: 'skipped', elementId: null };
    }
}
