import { Injectable } from '@nestjs/common';
import { Subject, Subscription } from 'rxjs';

interface SSEEvent {
  type: string;
  data: any;
}

@Injectable()
export class SseService {
  private readonly clients: Map<number, Subject<SSEEvent>> = new Map();

  addClient(userId: number): Subject<SSEEvent> {
    if (!this.clients.has(userId)) {
      this.clients.set(userId, new Subject<SSEEvent>());
    }
    return this.clients.get(userId)!;
  }

  removeClient(userId: number): void {
    const subject = this.clients.get(userId);
    if (subject) {
      subject.complete();
      this.clients.delete(userId);
    }
  }

  sendToUser(userId: number, type: string, data: any): void {
    const subject = this.clients.get(userId);
    if (subject) {
      subject.next({ type, data });
    }
  }

  broadcast(type: string, data: any): void {
    this.clients.forEach((subject) => {
      subject.next({ type, data });
    });
  }
}
