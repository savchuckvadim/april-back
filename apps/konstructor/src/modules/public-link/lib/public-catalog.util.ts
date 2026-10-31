import type { ContractDto } from '../../../dto/contract.dto';
import type {
    KonstructorInitDataDto,
    MeasureInitDto,
} from '../../../init/dto/response-init-data.dto';

/**
 * Каталог для публичной страницы: та же форма, что у init, чтобы фронт разбирал
 * её тем же адаптером. Значения, которые нужны только записи в Битрикс
 * (товар каталога, код единицы, строка портальной меры), обнулены.
 */
const withoutBitrixIds = (contract: ContractDto): ContractDto => ({
    ...contract,
    itemId: 0,
    measureCode: 0,
    portalMeasure: {
        ...contract.portalMeasure,
        bitrixId: '',
        portal_id: 0,
    },
});

const measureWithoutBitrixIds = (measure: MeasureInitDto): MeasureInitDto => ({
    ...measure,
    bitrixId: null,
    portalMeasureId: null,
});

export const toPublicCatalog = (
    init: KonstructorInitDataDto,
): KonstructorInitDataDto => ({
    ...init,
    contracts: {
        ...init.contracts,
        items: init.contracts.items.map(withoutBitrixIds),
    },
    measures: init.measures.map(measureWithoutBitrixIds),
});
