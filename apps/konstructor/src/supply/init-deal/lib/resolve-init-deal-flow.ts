import { SupplyInitDealFlow } from '../dto/init-deal.dto';

export interface InitDealFlowSignals {
    /** Явно переданный сценарий — перебивает всё остальное. */
    explicit?: SupplyInitDealFlow;
    /** Поле RPA «Перезаключение?» (`is_extension`). */
    isExtension: boolean | null;
    /** Заполнено ли «Предложение на будущий период». */
    hasOfferSmart: boolean;
}

/**
 * Какой это сценарий — поставка или перезаключение.
 *
 * Основной признак — флаг RPA «Перезаключение?»: им же пользователь фильтрует
 * поставки от перезаключений, так что робот и человек смотрят на одно поле.
 * Если флаг не заполнен (на портале поля нет, или заявка старая), падаем на
 * косвенный признак — заполненное «Предложение на будущий период».
 */
export const resolveInitDealFlow = (
    signals: InitDealFlowSignals,
): SupplyInitDealFlow => {
    if (signals.explicit) {
        return signals.explicit;
    }
    if (signals.isExtension !== null) {
        return signals.isExtension ? 'renewal' : 'supply';
    }
    return signals.hasOfferSmart ? 'renewal' : 'supply';
};
