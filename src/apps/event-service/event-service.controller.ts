// import { Body, Controller, Post } from '@nestjs/common';
// import { EventServiceService } from './event-service.service';
// import { CallingEventDto } from './dto/calling-event.dto';

// @Controller('event-service')
// export class EventServiceController {
//   constructor(private readonly eventServiceService: EventServiceService) {}

//   @Post()
//   async handleEvent(@Body() callingEvent: CallingEventDto) {
//     const {
//       factCountIshodCommun,
//       eduCount,
//       presCount,
//     } = await this.eventServiceService.processEvent(callingEvent);

//     await this.eventServiceService.processSmartReport(callingEvent);

//     return {
//       resultCode: 0,
//       result: '123',
//     };
//   }
// }
