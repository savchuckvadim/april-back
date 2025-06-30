import { Injectable } from "@nestjs/common";
import { AddressRqItemDto, BxRqAddressDto, BxRqBankItemDto, BxRqDto } from "src/apps/konstructor/document-generate/dto/bx-rq/bx-rq.dto";
import { BX_ADDRESS_TYPE, RQ_ITEM_CODE } from "../../../../document-generate/type/bx-rq.type";
import { ClientTypeEnum } from "../../../../document-generate/type/client.type";

@Injectable()
export class InitSupplyBxrqService {



    public getBxrqValues(bxrq: BxRqDto, clientType: ClientTypeEnum): {
        inn: string;
        fullName: string;
        address: string;

    } {
        const inn = this.getInnValue(bxrq)
        const fullName = this.getFullNameValue(bxrq, clientType)
        const address = this.getAddressValue(bxrq.address)
        return {
            inn,
            fullName,
            address
        }
    }

    private getAddressValue(address: BxRqAddressDto) {
        let addressValue = ''
        address.items.forEach(item => {
            if (item.type_id === BX_ADDRESS_TYPE.PRIMARY) {
                addressValue += this.getAddressItemValue(item)
            }
            if (item.type_id === BX_ADDRESS_TYPE.REGISTERED) {
                if (!addressValue) {
                    addressValue += this.getAddressItemValue(item)
                }
            }
        })
        return addressValue
    }

    private getAddressItemValue(item: AddressRqItemDto) {
        let addressItemValue = ''
        item.fields
            .sort((a, b) => a.order - b.order)
            .forEach((field, index) => {
                if (field.value) {
                    addressItemValue += `${field.value}`
                    if (index < item.fields.length - 1) {
                        addressItemValue += ', '
                    }
                }
            })
        return addressItemValue
    }

    public getInnValue(rq: BxRqDto): string {
        let innValue = ''
        const innField = rq.fields.find(field => field.code === RQ_ITEM_CODE.INN)
        if (innField) {
            innValue = innField.value as string
        }
        return innValue

    }

    public getFullNameValue(rq: BxRqDto, clientType: ClientTypeEnum): string {
        let fullNameValue = ''
        const fullNameField = clientType === ClientTypeEnum.FIZ
            ? rq.fields.find(field => field.code === RQ_ITEM_CODE.PERSON_NAME)
            : rq.fields.find(field => field.code === RQ_ITEM_CODE.FULLNAME)

        if (fullNameField) {
            fullNameValue = fullNameField.value as string
        }
        return fullNameValue
    }



}   