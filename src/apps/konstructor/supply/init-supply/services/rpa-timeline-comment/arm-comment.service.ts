import { RpaCommentHelper, RpaIconEnum } from "./lib/rpa-comment-helper.service"
import { Injectable } from "@nestjs/common"


@Injectable()
export class ArmCommentService {

    public getArmString(clientArmId: string, complectArmIds: string[]): string {
 
        if (clientArmId && complectArmIds) {
            const list = [
                { head: 'Рег. лист: ', value: clientArmId },
                { head: 'Арм ID: ', value: complectArmIds.map(armId => ` ${armId}`).join('') }
            ]
            const armString = RpaCommentHelper.getListWithBold(list)
 
            return `
            ${RpaCommentHelper.getHeaderWithIcon(RpaIconEnum.ARM, 'АРМ: ')}
            ${armString}
            `
        }


        return ''
    }





}