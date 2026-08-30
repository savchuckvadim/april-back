import { Injectable, Logger } from '@nestjs/common';
import {
    parseQuestionnaireDisabledEventTypes,
    PortalQuestionnairesService,
} from '@lib/portal-lib/store/questionnaires';
import {
    EnumPortalAppCode,
    PortalAppSettingsService,
} from '@lib/portal-lib/store/app-settings';
import { findLostQuestionnaireAnswers } from '../../../shared/questionnaire-answers';
import { EventSalesFlowDto } from '../../dto/event-sale-flow/event-sales-flow.dto';
import { QuestionnaireSmartContext } from './side-flow-job.base';

/**
 * Загрузчик контекста портальных анкет: единственная ответственность —
 * «по отчёту отдать готовый снимок анкет либо честный null».
 *
 * Живёт отдельно от координатора сайд-flow намеренно. Координатор отвечает
 * за раскладку джобов по очередям, а чтение каталога и настроек портала —
 * это ДРУГАЯ ответственность с другими внешними зависимостями (два
 * портальных сервиса, Redis-кэш, свои режимы деградации). Держать их в
 * одном классе значило бы тащить в координатор оба инжекта ради данных,
 * которых на горячем пути обычно нет вовсе.
 *
 * Инстанса bitrix у сервиса нет и быть не должно (CLAUDE.md): инжектятся
 * только stateless-сервисы, домен приезжает аргументом.
 */
@Injectable()
export class QuestionnaireSmartContextLoader {
    private readonly logger = new Logger(QuestionnaireSmartContextLoader.name);

    constructor(
        // Портальный каталог анкет (Redis-кэш 300 с): по нему ответы
        // фрейма получают адрес поля в элементе смарта.
        private readonly questionnaires: PortalQuestionnairesService,
        // Настройки портала: выключатель анкет по типам события.
        private readonly appSettings: PortalAppSettingsService,
    ) {}

    /**
     * Каталог анкет + выключатель по типам события; null — ответов не
     * прислали (обычный случай) либо каталог недоступен.
     *
     * Горячий путь не трогаем: ни одного лишнего чтения, пока в отчёте
     * нет ни одного ответа портальной анкеты.
     */
    async loadQuestionnaireSmartContext(
        dto: EventSalesFlowDto,
    ): Promise<QuestionnaireSmartContext | null> {
        const answers = dto.questionnaireAnswers ?? [];
        if (!answers.length) return null;

        try {
            const catalog = await this.questionnaires.resolve(
                dto.domain,
                EnumPortalAppCode.eventSales,
            );
            const context: QuestionnaireSmartContext = {
                catalog,
                answers,
                disabledEventTypes: await this.resolveDisabledEventTypes(
                    dto.domain,
                ),
            };
            this.warnLostAnswers(dto.domain, context);
            return context;
        } catch (error) {
            this.logger.warn(
                `каталог анкет ${dto.domain} недоступен ` +
                    `(${(error as Error).message}) — ${answers.length} ответ(ов) ` +
                    'в элемент смарта не уедут',
            );
            return null;
        }
    }

    /**
     * Ответы, которые отбросил САМ снимок: кода нет в каталоге, анкету
     * погасил выключатель, ключ пришёл дважды.
     *
     * Раньше это был единственный путь потери ответа, о котором в логе не
     * было ни строки: снимок собирается по каталогу молча, и «куда делся
     * ответ» расследовать было нечем — а типовая причина как раз бытовая
     * (владелец правил анкету, пока менеджер её заполнял).
     *
     * Считается ОДИН раз на отчёт, до раскладки по потокам: «вопрос чужого
     * смарта» здесь не потеря (его несёт соседний поток), а два вызова
     * снимка удвоили бы каждую строку.
     */
    private warnLostAnswers(
        domain: string,
        questionnaire: QuestionnaireSmartContext,
    ): void {
        const losses = findLostQuestionnaireAnswers(questionnaire);
        if (!losses.length) return;
        this.logger.warn(
            `[questionnaire] ${domain}: ${losses.length} ответ(ов) анкеты ` +
                'в элемент смарта не уедут: ' +
                losses
                    .map(
                        loss =>
                            `${loss.key}${loss.title ? ` («${loss.title}»)` : ''}` +
                            ` — ${loss.reason}`,
                    )
                    .join('; '),
        );
    }

    /**
     * Типы события, для которых анкеты выключены настройками портала.
     *
     * Настройки недоступны — считаем, что выключателя нет: фрейм
     * анкету всё равно показал, менеджер на неё ответил, и терять
     * ответ из-за упавшего Redis хуже, чем записать его в элемент.
     */
    private async resolveDisabledEventTypes(domain: string): Promise<string[]> {
        try {
            const settings = await this.appSettings.resolve(
                domain,
                EnumPortalAppCode.eventSales,
            );
            return parseQuestionnaireDisabledEventTypes(
                settings.questionnairesDisabledEventTypes,
            );
        } catch (error) {
            this.logger.warn(
                `настройки ${domain} недоступны — выключатель анкет ` +
                    `по типам события не применён (${(error as Error).message})`,
            );
            return [];
        }
    }
}
