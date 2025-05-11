import { BitrixApiFactoryService } from "src/modules/bitrix/core/queue/bitrix-api.factory.service";
import { Injectable } from "@nestjs/common";
import { PortalService } from "src/modules/portal/portal.service";
import { PortalModel } from "src/modules/portal/services/portal.model";
import { BitrixApiQueueApiService } from "src/modules/bitrix/core/queue/bitrix-queue-api.service";
import { EBXEntity, EBxMethod, EBxNamespace } from "src/modules/bitrix/core";
import { ApiProperty } from "@nestjs/swagger";


export class ContactCreateDto {
    @ApiProperty({
        type: String,
        description: 'Domain of the portal',
        example: 'example.com',
    })
    domain: string;
    @ApiProperty({
        type: Number,
        description: 'Company ID',
        example: 1,
    })
    companyId: number;
}
@Injectable()
export class ContactsCreateUseCase {
    protected bitrixApi: BitrixApiQueueApiService
    protected portal: PortalModel
    constructor(
        private readonly bitrixApiFactory: BitrixApiFactoryService,
        private readonly portalService: PortalService,

    ) { }

    async create(data: ContactCreateDto) {
        this.portal = await this.portalService.getModelByDomain(data.domain);
        this.bitrixApi = this.bitrixApiFactory.create(this.portal.getPortal());


        const fakeContact = {
            ASSIGNED_BY_ID: 1,
            COMPANY_ID: data.companyId,
            NAME: '1234567890',
        }

        const fakeOrders = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
            21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40,
            41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60,
            61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79, 80
        ]
        fakeOrders.forEach((item, index) => {


            const contactCommandCode = `${EBxNamespace.CRM}.${EBXEntity.CONTACT}.${EBxMethod.ADD}.${item}_${index}`

            this.bitrixApi.addCmdBatchType(
                contactCommandCode,
                EBxNamespace.CRM,
                EBXEntity.CONTACT,
                EBxMethod.ADD,
                {
                    fields: {
                        ...fakeContact

                    }

                }
            )
        })

        const result = await this.bitrixApi.callBatchWithConcurrency(1)
        return result

    }
}