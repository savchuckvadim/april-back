import { SubscribeMessage } from '@nestjs/websockets';

export function WsEvent(event: string) {
  return SubscribeMessage(event);
}