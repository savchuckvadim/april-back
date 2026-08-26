import { EventFlowGuardService } from '../services/flow-guard/event-flow-guard.service';
import { PortalAppSettingsService } from '@lib/portal-lib/store/app-settings';
import { EventSalesFlowDto } from '../dto/event-sale-flow/event-sales-flow.dto';

/**
 * Гард продажи в POST /flow: сумма (OPPORTUNITY) и дата первой оплаты
 * обязательны ТОЛЬКО когда на портале включён чек-лист продажи
 * (checklist_sale_enabled) и есть кому создавать сделку (не lead-only).
 * Недоступные настройки не блокируют отправку.
 */
const makeGuard = (
    settings: Record<string, unknown> | Error,
): EventFlowGuardService =>
    new EventFlowGuardService({
        resolve: () =>
            settings instanceof Error
                ? Promise.reject(settings)
                : Promise.resolve(settings),
    } as unknown as PortalAppSettingsService);

const dto = (over: {
    workStatusCode?: string;
    companyId?: number;
    opportunity?: number;
    firstPayDate?: string;
}): EventSalesFlowDto =>
    ({
        domain: 'x.bitrix24.ru',
        report: {
            workStatus: {
                current: { code: over.workStatusCode ?? 'success' },
            },
        },
        context: over.companyId ? { companyId: over.companyId } : {},
        sale: {
            opportunity: over.opportunity,
            firstPayDate: over.firstPayDate,
        },
    }) as unknown as EventSalesFlowDto;

describe('EventFlowGuardService: чек-лист продажи', () => {
    const enabled = { withChecklistSale: true };

    it('включён + продажа без суммы/даты → 400', async () => {
        await expect(
            makeGuard(enabled).assertValid(dto({ companyId: 431 })),
        ).rejects.toThrow(/сумму сделки и дату/);
    });

    it('включён + сумма и дата на месте → проходит', async () => {
        await expect(
            makeGuard(enabled).assertValid(
                dto({
                    companyId: 431,
                    opportunity: 150000,
                    firstPayDate: '2026-09-01',
                }),
            ),
        ).resolves.toBeUndefined();
    });

    it('выключен на портале → сумма не требуется', async () => {
        await expect(
            makeGuard({ withChecklistSale: false }).assertValid(
                dto({ companyId: 431 }),
            ),
        ).resolves.toBeUndefined();
    });

    it('lead-only (нет company/deal) → сумма не требуется', async () => {
        await expect(
            makeGuard(enabled).assertValid(dto({})),
        ).resolves.toBeUndefined();
    });

    it('не-продажа настройки даже не читает', async () => {
        await expect(
            makeGuard(new Error('redis down')).assertValid(
                dto({ workStatusCode: 'inJob', companyId: 431 }),
            ),
        ).resolves.toBeUndefined();
    });

    it('настройки недоступны → отправка НЕ блокируется', async () => {
        await expect(
            makeGuard(new Error('redis down')).assertValid(
                dto({ companyId: 431 }),
            ),
        ).resolves.toBeUndefined();
    });
});
