import { EBXEntity, EBxMethod, EBxNamespace } from "src/modules/bitrix/core";
import { Contact, MigrateToBxDto } from "../../dto/migrate-to-bx.dto";
import { GsrMigrateBitrixAbstract } from "./gsr-migrate-bitrix-abstract.service";
import { IField } from "src/modules/portal/interfaces/portal.interface";


export class GsrMigrateBitrixContactService extends GsrMigrateBitrixAbstract {
    private isValidEmail(email: string): boolean {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i;
        return emailRegex.test(email.trim());
    }
    getContactCommand(element: MigrateToBxDto, companyCommandCode: string): string[] {
        const contactCodes = [] as string[]
        element.contacts.forEach((contact, index) => {

            const contactCommandCode = `${EBxNamespace.CRM}.${EBXEntity.CONTACT}.${EBxMethod.ADD}.${element.id}_${index}`

            const hlPfieldBitrixId = this.portal.getContactFieldBitrixId('ork_hotline_count')
            const skapPfieldBitrixId = this.portal.getContactFieldBitrixId('ork_skap_count')
            const chkField = this.portal.getContactField('ork_chk_garant')
            let chkFieldBitrixId = ''
            let chekFieldValue: number | undefined
            if (chkField) {
                chkFieldBitrixId = this.portal.getFieldBitrixId(chkField)
            }

            if (chkFieldBitrixId && chkField) {
                chekFieldValue = this.getChFieldItem(contact, chkField)
            }
            const chkFieldBxValue = {}
            if (chkFieldBitrixId && chekFieldValue) {
                chkFieldBxValue[chkFieldBitrixId] = chekFieldValue
            }

            const email = contact.email?.trim();

            const emailField = this.isValidEmail(email)
                ? [{ VALUE: email, TYPE: 'WORK' }]
                : []; // ← пустой массив, Bitrix проглоти

            this.bitrix.batch.contact.set(
                contactCommandCode,

                {

                    ASSIGNED_BY_ID: this.userId,
                    COMPANY_ID: `$result[${companyCommandCode}]`,
                    NAME: contact.name,
                    COMMENTS: this.getComment(contact),
                    PHONE: [
                        {
                            VALUE: contact.phone,
                            TYPE: 'WORK'
                        }
                    ],
                    EMAIL: emailField,
                    POST: contact.position,
                    [hlPfieldBitrixId]: contact.conmtactGl,
                    [skapPfieldBitrixId]: contact.contactSkap,
                    ...chkFieldBxValue



                }
            )
            contactCodes.push(contactCommandCode)
        });
        return contactCodes
    }
    private getComment(contact: Contact) {

        let comment = ' <br><b>Имя</b> ' + contact.name + '   </br> ' +
            ' <br><b>Телефон</b> ' + contact.phone + '   </br>  ' +
            ' <br><b>Email</b> ' + contact.email + '   </br>  ' +
            ' <br><b>Должность</b> ' + contact.position + '   </br> '

        if (contact.communicationsRate) {
            comment += ' <br><b>Частота коммуникаций</b> ' + contact.communicationsRate + '   </br> '
        }
        if (contact.contactFirstEdu) {
            comment += ' <br><b>Вводное Обучение</b> ' + contact.contactFirstEdu + '   </br> '
        }
        if (contact.contactFirstEduComment) {
            comment += ' <br><b>Вводное Обучение комментарий</b> ' + contact.contactFirstEduComment + '   </br> '
        }
        if (contact.contactEdu) {
            comment += ' <br><b>Вводное Обучение</b> ' + contact.contactEdu + '   </br> '
        }
        if (contact.contactEduComment) {
            comment += ' <br><b>Вводное Обучение комментарий</b> ' + contact.contactEduComment + '   </br> '
        }
        if (contact.contactExamination) {
            comment += ' <br><b>Проверка</b> ' + contact.contactExamination + '   </br> '
        }
        if (contact.contactQualification) {
            comment += ' <br><b>Звонок по качеству</b> ' + contact.contactQualification + '   </br> '
        }
        if (contact.contactSkap) {
            comment += ' <br><b>Скап</b> ' + contact.contactSkap + '   </br> '
        }
        if (contact.conmtactGl) {
            comment += ' <br><b>ГЛ</b> ' + contact.conmtactGl + '   </br> '
        }
        if (contact.contactGarantClub) {
            comment += ' <br><b>ЧК Гарант</b> ' + contact.contactGarantClub + '   </br> '
        }



        return comment

    }

    private getChFieldItem(contact: Contact, field: IField): number | undefined {
        let code = 'chk_garant_no'
        if (contact.contactGarantClub === 'состоит') {
            code = 'chk_garant_yes'
        }

        const item = this.portal.getFieldItemByCode(field, code)

        return item?.bitrixId

    }
}
