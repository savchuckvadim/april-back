import { Body, Controller, HttpCode, Post, UseInterceptors } from '@nestjs/common';
import { QueuePingDto } from './dto/queue.dto';
import { QueuePingDispatchService } from './queue/queue-ping.dispatch.service';

@Controller('queue')
export class QueuePingController {
  constructor(
    private readonly job: QueuePingDispatchService

  ) { }


  @Post('ping')
  @HttpCode(200)
  @UseInterceptors()
  async ping(@Body() dto: QueuePingDto) {
    return await this.job.dispatch(dto)
  }
}
