import { Injectable } from "@nestjs/common";
import { BxRqDto } from "../dto/bx-rq/bx-rq.dto";
import { ClientTypeEnum } from "../type/client.type";
import { ADDRESS_RQ_ITEM_CODE, BX_ADDRESS_TYPE, RQ_ITEM_CODE } from "../type/bx-rq.type";

@Injectable()
export class DocumentClientBxRqService {

    public getClientRq(clientRq: BxRqDto, clientType: ClientTypeEnum): string[] {
        const result = [];
        let fullname = '________________________________________';
        let inn = '________________________________________';

        if (clientType === ClientTypeEnum.FIZ) {
            return this.prepareClientFizRq(clientRq);
        } else {
            fullname = clientRq.fields.find(fld => fld.code === RQ_ITEM_CODE.FULLNAME)?.value as string || fullname as string;
        }
        inn = `ИНН: ${clientRq.fields.find(fld => fld.code === RQ_ITEM_CODE.INN)?.value || inn}`;
        return [fullname, inn];
    }

    private prepareClientFizRq(clientRq: BxRqDto): string[] {
        const result: string[] = [];
        let fullname = '________________________________________';
        let inn = '________________________________________';

        fullname = clientRq.fields.find(fld => fld.code === RQ_ITEM_CODE.PERSON_NAME)?.value as string || fullname;



        const innValue = clientRq.fields.find(fld => fld.code === RQ_ITEM_CODE.INN)?.value;

        inn = `ИНН: ${innValue || inn}`;
        result.push(inn);

        let documentType = '_____________________________';
        const documentTypeValue = clientRq.fields.find(fld => fld.code === RQ_ITEM_CODE.DOCUMENT)?.value as string;
        documentType = documentTypeValue ? documentTypeValue : `Документ: ${documentType}`;
        result.push(documentType);
        let docSeries = '_____________________________';
        const docSeriesValue = clientRq.fields.find(fld => fld.code === RQ_ITEM_CODE.DOCUMENT_SERIES)?.value;
        docSeries = `Серия: ${docSeriesValue || docSeries}`;
        result.push(docSeries);
        let docNumber = '_____________________________';
        const docNumberValue = clientRq.fields.find(fld => fld.code === RQ_ITEM_CODE.DOCUMENT_NUMBER)?.value;
        docNumber = `Номер: ${docNumberValue || docNumber}`;
        result.push(docNumber);
        let docDate = '_____________________________';
        const docDateValue = clientRq.fields.find(fld => fld.code === RQ_ITEM_CODE.DOCUMENT_DATE)?.value;
        docDate = `Документ выдан: ${docDate || docDate}`;
        const issuedByValue = clientRq.fields.find(fld => fld.code === RQ_ITEM_CODE.ISSUED_BY)?.value;
        docDate = issuedByValue ? `${docDate}, ${issuedByValue}` : docDate;
        result.push(docDate);
        let depCode = '_____________________________';
        const depCodeValue = clientRq.fields.find(fld => fld.code === RQ_ITEM_CODE.DEPARTMENT_CODE)?.value;
        depCode = `Код подразделения: ${depCodeValue || depCode}`;
        result.push(depCode);
        let phone = '_____________________________';
        const phoneValue = clientRq.fields.find(fld => fld.code === RQ_ITEM_CODE.PHONE)?.value;
        phone = `Телефон: ${phoneValue || phone}`;
        result.push(phone);
        let address = this.getAddressString(clientRq);
        result.push(address);
        return result;
    }

    private getAddressString(clientRq: BxRqDto): string {
        let address = '';
        clientRq.address.items.forEach(addresType => {
            if (addresType.anchor_id === BX_ADDRESS_TYPE.REGISTERED) {
                addresType.fields.forEach(field => {
                    if (field.code === ADDRESS_RQ_ITEM_CODE.ADDRESS_POSTAL_CODE) {
                        address += field.value + ', ';
                    } else {
                        address += field.value + ', ';
                    }
                })
            }
        })
        return address || 'Адрес: ________________________________________';
    }
}

