import { Injectable } from '@nestjs/common';

@Injectable()
export class EventSalesService {
    getHello(): string {
        return 'Hello World!';
    }
}
