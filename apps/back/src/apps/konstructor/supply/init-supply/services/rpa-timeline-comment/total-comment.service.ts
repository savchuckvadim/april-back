import { Injectable } from '@nestjs/common';
import { InitSupplyDto } from '../../dto/init-supply.dto';
import {
    RpaCommentHelper,
    RpaIconEnum,
} from './lib/rpa-comment-helper.service';

@Injectable()
export class TotalSumCommentService {
    getTotalSumComment(dto: InitSupplyDto): string {
        let comment = '';
        // Сумма:
        // Всего за 5 мес.: 122910.00 руб.
        // В месяц: 24582.00 руб.
        const totals = dto.total;
        const total = totals[0];
        if (total && total.price) {
            const contractCoefficient = dto.contract.prepayment;
            const totalQuantity = total.price.quantity;
            const quantity = totalQuantity * contractCoefficient;
            const totalSum = Number(total.price.sum.toFixed(2));
            const totalMonthSum = Number((totalSum / totalQuantity).toFixed(2));

            const totalSumString = RpaCommentHelper.getBoldString(
                `Всего за ${quantity} мес.: ${totalSum} руб.`,
            );
            const totalMonthSumString = RpaCommentHelper.getBoldString(
                `В месяц: ${totalMonthSum} руб.`,
            );

            const paragrafName = RpaCommentHelper.getHeaderWithIcon(
                RpaIconEnum.TOTAL_SUM,
                'Сумма:',
            );
            const list = [totalSumString, totalMonthSumString];
            comment += `${paragrafName} ${RpaCommentHelper.getList(list)}`;
        }
        return comment;
    }
}
