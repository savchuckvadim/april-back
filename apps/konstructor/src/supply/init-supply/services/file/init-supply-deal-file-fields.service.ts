import { Injectable } from '@nestjs/common';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { InitSupplyDto } from '../../dto/init-supply.dto';
import { SupplyReportCodeEnum } from '../../dto/supply-fields/supply-fields.dto';

/** Если в pbx поле сделки не заведено — имена из легаси-версии на питоне. */
const DEAL_FILE_FIELD_FALLBACK: Record<string, string> = {
    [SupplyReportCodeEnum.current_contract]: 'UF_CRM_CURRENT_CONTRACT',
    [SupplyReportCodeEnum.current_invoice]: 'UF_CRM_CURRENT_INVOICE',
};

const DEAL_FILE_CODES = [
    SupplyReportCodeEnum.current_contract,
    SupplyReportCodeEnum.current_invoice,
];

export type DealFileFields = Record<string, { fileData: [string, string] }>;

/**
 * Поля СДЕЛКИ с файлами договора и счёта.
 *
 * Пишем только то, что менеджер приложил в конструкторе (`dto.files`): файл,
 * пришедший как `downloadUrl`, уже лежит в этой сделке — его достаточно
 * скопировать в RPA (см. InitSupplyRpaSupplyReportFieldsService).
 */
@Injectable()
export class InitSupplyDealFileFieldsService {
    public get(dto: InitSupplyDto, portalModel: PortalModel): DealFileFields {
        const result: DealFileFields = {};
        if (!dto.files?.length) {
            return result;
        }

        for (const code of DEAL_FILE_CODES) {
            const uploaded = dto.files.find(file => file.code === code);
            if (!uploaded?.base64) {
                continue;
            }

            const dealFieldBitrixId =
                portalModel.getDealFieldBitrixIdByCode(code) ||
                DEAL_FILE_FIELD_FALLBACK[code];
            if (!dealFieldBitrixId) {
                continue;
            }

            result[dealFieldBitrixId] = {
                fileData: [uploaded.filename, uploaded.base64],
            };
        }

        return result;
    }
}
