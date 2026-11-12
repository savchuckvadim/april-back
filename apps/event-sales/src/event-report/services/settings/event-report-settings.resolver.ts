import { Injectable, Logger } from '@nestjs/common';
import {
    EnumPortalAppCode,
    parseUserIds,
    PortalAppSettingsService,
} from '@lib/portal-lib/store/app-settings';
import {
    DEFAULT_FIELD_POLICY_SETTINGS,
    DEFAULT_STAGE_RULE_SETTINGS,
    EventFieldPolicySettings,
    EventStageRuleSettings,
} from '../entity/field-policy';
import {
    DEFAULT_POST_FAIL_SETTINGS,
    EventPostFailSettings,
} from '../post-fail/post-fail.settings';

/**
 * Настройки портала, которые читает отчёт менеджера, — одним сервисом на
 * оба потока (отдел продаж и ТМЦ).
 *
 * Правило деградации у каждого чтения своё и описано у метода: политики
 * полей и стадий при недоступных настройках работают на ДЕФОЛТАХ СХЕМЫ
 * (дефолт и есть штатное поведение, упавший Redis не повод писать в
 * карточку заведомо врущие даты), а чек-листы задач и пост-отказ считаются
 * ВЫКЛЮЧЕННЫМИ (их включение меняет вид задач и владельца компании у всех
 * менеджеров — «по умолчанию выключено» здесь осознанная страховка).
 *
 * Инстанса bitrix у сервиса нет: читаются только настройки по домену.
 */
@Injectable()
export class EventReportSettingsResolver {
    private readonly logger = new Logger(EventReportSettingsResolver.name);

    constructor(private readonly appSettings: PortalAppSettingsService) {}

    /** Гейт чек-листов задач (`task_checklist_enabled`, по умолчанию ВЫКЛ). */
    async taskChecklistEnabled(domain: string): Promise<boolean> {
        const settings = await this.read(domain, 'чек-листы задач выключены');
        return Boolean(settings?.withTaskChecklist);
    }

    /** Классы поведения полей карточки (ось следующего события, сброс на финале). */
    async fieldPolicy(domain: string): Promise<EventFieldPolicySettings> {
        const settings = await this.read(
            domain,
            'политики полей на дефолтах схемы',
        );
        if (!settings) return DEFAULT_FIELD_POLICY_SETTINGS;
        return {
            calculatedNextEvent: Boolean(settings.withCalculatedNextEvent),
            resetOnFinal: Boolean(settings.withFinalFieldsReset),
        };
    }

    /** Правила стадий основной воронки (`refine_stage_on_plan_enabled`). */
    async stageRule(domain: string): Promise<EventStageRuleSettings> {
        const settings = await this.read(
            domain,
            'правила стадий на дефолтах схемы',
        );
        if (!settings) return DEFAULT_STAGE_RULE_SETTINGS;
        return {
            refineStageOnPlan: Boolean(settings.withRefineStageOnPlan),
        };
    }

    /**
     * Пост-отказ: включён ли, кому передать компанию, в какое строковое
     * поле компании писать дату.
     */
    async postFail(domain: string): Promise<EventPostFailSettings> {
        const settings = await this.read(
            domain,
            'пост-отказ на дефолтах схемы',
        );
        if (!settings) return DEFAULT_POST_FAIL_SETTINGS;
        const assignUserId = Number(settings.postFailAssignUserId);
        const dateTextField = settings.postFailCompanyDateTextField;
        return {
            enabled: Boolean(settings.withPostFail),
            assignUserId:
                Number.isInteger(assignUserId) && assignUserId > 0
                    ? assignUserId
                    : 0,
            companyDateTextField:
                typeof dateTextField === 'string' ? dateTextField.trim() : '',
        };
    }

    /**
     * Сотрудники-боты обзвона (`xo_start_bot_user_ids`): их открытую
     * основную сделку забирает отчитавшийся менеджер. Настройки недоступны —
     * пусто: перехвата нет, отчёт работает по правилу «чужое не трогаем».
     */
    async botOwnerIds(domain: string): Promise<number[]> {
        const settings = await this.read(domain, 'перехвата у ботов нет');
        const raw = settings?.xoStartBotUserIds;
        return parseUserIds(typeof raw === 'string' ? raw : '');
    }

    /**
     * Чтение настроек приложения «Звонки»; недоступны — null и warning с
     * тем, на что это повлияло. Отчёт важнее настроек: падать здесь нельзя.
     */
    private async read(
        domain: string,
        consequence: string,
    ): Promise<Record<string, unknown> | null> {
        try {
            return (await this.appSettings.resolve(
                domain,
                EnumPortalAppCode.eventSales,
            )) as Record<string, unknown>;
        } catch (error) {
            this.logger.warn(
                `настройки ${domain} недоступны — ${consequence} ` +
                    `(${(error as Error).message})`,
            );
            return null;
        }
    }
}
