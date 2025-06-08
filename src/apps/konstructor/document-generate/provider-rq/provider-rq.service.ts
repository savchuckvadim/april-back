import { Injectable } from "@nestjs/common";
import { RqEntity } from "src/modules/portal-konstructor/provider";

@Injectable()
export class ProviderRqService {

    getRq(rq: RqEntity): string[] {
        return [
            rq.name,
            rq.position,
            rq.phone,
            rq.email,
        ];
    }

}