import { Injectable, Logger } from '@nestjs/common';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import { PBXService } from '@/modules/pbx';
import { PbxPresentationSmartService } from '@lib/portal-lib/pbx/pbx-presentation-smart';
import { PbxSmartItemFieldsService } from '@lib/portal-lib/pbx/smart-item-fields';
import {
    SideFlowBaseDealResolver,
    SideFlowTaskBinderService,
} from '../../shared/side-flow';
import { PresentationFlowJobData } from '../dto/presentation-flow-job.dto';
import { PresentationFlowResult } from '../constants/presentation-flow.const';
import {
    PRES_FLOW,
    PresentationFlowRun,
} from '../types/presentation-flow-run.type';
import { PresElementWriterService } from '../services/pres-element-writer.service';

dayjs.extend(utc);
dayjs.extend(timezone);

const CRM_DATETIME_FORMAT = 'DD.MM.YYYY HH:mm:ss';

/**
 * Сайд-flow презентаций: элементы смарта «Презентации» создаются/закрываются
 * ОТДЕЛЬНОЙ очередью после основного event-report (см.
 * PresentationFlowJobData). Полное зеркало ZprFlowUseCase — сознательно.
 *
 * Use-case делает РОВНО четыре вещи (остальное — подсервисы):
 *  1. self-gate: смарт не установлен → тихий skip, основной flow не заметил
 *     (презентация продолжает жить сделкой воронки «ОП Презентации»);
 *  2. подготовка прогона: bitrix/portal по домену, дотяжка базовой сделки,
 *     живые поля элемента (только когда есть ответы анкеты);
 *  3. роутинг plan/report — вся запись в PresElementWriterService;
 *  4. привязка элемента к задаче (UF_CRM_TASK) по результату.
 *
 * Что умеет элемент, чего не умеет сделка: своя история комментариев,
 * СВОЙ снимок анкеты «5К»/«Хвост» на каждую презентацию, раздельные
 * «назначил»/«провёл», счётчик переносов.
 */
@Injectable()
export class PresentationFlowUseCase {
    private readonly logger = new Logger(PresentationFlowUseCase.name);

    constructor(
        private readonly pbx: PBXService,
        private readonly presentationSmart: PbxPresentationSmartService,
        private readonly smartItemFields: PbxSmartItemFieldsService,
        // Привязка элемента к задаче и дотяжка базовой сделки — общие с
        // очередью ЗПР: правило одно, и чиниться оно должно один раз.
        // Инстанс Битрикса эти сервисы получают АРГУМЕНТОМ, своего не
        // держат (правило CLAUDE.md про this.bitrix и race condition).
        private readonly taskBinder: SideFlowTaskBinderService,
        private readonly baseDealResolver: SideFlowBaseDealResolver,
    ) {}

    async handle(
        job: PresentationFlowJobData,
    ): Promise<PresentationFlowResult> {
        const info = await this.presentationSmart.resolveInfo(job.domain);
        if (!info) {
            /*
             * Смарта нет — ответов портальной анкеты в этом джобе тоже не
             * может быть: вопрос без установленного смарта компиляция
             * каталога выбрасывает, и до фрейма он не доезжает. Приехали
             * вопреки — это ПОТЕРЯ ответов менеджера, а не рядовой
             * пропуск: debug в проде выключен, и такая потеря была бы
             * полностью беззвучной. Пустой джоб остаётся на debug —
             * портал без смарта штатно даёт его на каждом отчёте.
             */
            const lost = job.answers?.length ?? 0;
            if (lost) {
                this.logger.warn(
                    `[presentation-flow] ${job.domain}: смарт pres_sales не ` +
                        `установлен — ${lost} ответ(ов) портальной анкеты ` +
                        'записать некуда, джоб пропущен',
                );
            } else {
                this.logger.debug(
                    `[presentation-flow] ${job.domain}: смарт pres_sales не установлен — пропуск`,
                );
            }
            return { action: 'skipped', elementId: null };
        }

        const { bitrix, PortalModel: portal } = await this.pbx.init(job.domain);
        const tz = portal.getTimezone();
        const now = dayjs().tz(tz).format(CRM_DATETIME_FORMAT);

        // Дотяжка: базовую сделку мог создать ЭТОТ ЖЕ отчёт — на момент
        // постановки джоба числового id не было (в батче она `$result[...]`).
        // Джоб выполняется после батча, сделка уже существует — находим её
        // по компании и работаем как с обычной.
        const resolved: PresentationFlowJobData = {
            ...job,
            baseDealId:
                job.baseDealId ??
                (await this.baseDealResolver.resolve(bitrix, portal, {
                    flow: PRES_FLOW,
                    domain: job.domain,
                    companyId: job.companyId,
                    responsibleId: job.responsibleId,
                })),
        };

        const run: PresentationFlowRun = {
            bitrix,
            portal,
            info,
            job: resolved,
            tz,
            now,
            // Живые поля читаем ТОЛЬКО когда ответы есть: у подавляющего
            // большинства отчётов портальных анкет нет, и лишний вызов
            // Битрикса им ни к чему.
            itemFields: resolved.answers?.length
                ? await this.smartItemFields.resolveFields(
                      resolved.domain,
                      info.entityTypeId,
                  )
                : null,
        };

        const writer = new PresElementWriterService(bitrix, portal);
        const result =
            resolved.kind === 'plan'
                ? await writer.createPlanned(run)
                : await writer.closeReported(run);

        /*
         * Элемент ↔ задача (зеркало zpr-flow): задача получает привязку
         * `T{hex}_{id}` в UF_CRM_TASK — тогда элемент виден из карточки
         * задачи штатным полем.
         *
         * План привязывается к задаче, СОЗДАННОЙ этим же отчётом:
         * `planTaskId` приезжает из `$result[add_task]` того же батча, и
         * раньше этой ветки не было вовсе — запланированный элемент
         * оставался без задачи до следующего отчёта. Отчёт (в том числе
         * перенос — задача та же, она переносится) привязывается к
         * задаче, ПО КОТОРОЙ отчитались.
         *
         * Нужного id нет (спонтанный отчёт без задачи; план, у которого
         * задачи в батче не было) — привязки просто нет, как и раньше:
         * это украшение, а не инвариант, и джоб из-за него не падает.
         */
        const linkedTaskId =
            resolved.kind === 'plan' ? resolved.planTaskId : resolved.taskId;
        if (linkedTaskId && result.elementId) {
            await this.taskBinder.bind(
                bitrix,
                linkedTaskId,
                info.entityTypeId,
                result.elementId,
                PRES_FLOW,
            );
        }
        return result;
    }
}
