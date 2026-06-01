import { SseService } from '../../src/modules/sse/sse.service';
import { Subject } from 'rxjs';

describe('SseService', () => {
  let service: SseService;

  beforeEach(() => {
    service = new SseService();
  });

  describe('addClient', () => {
    it('should create a new Subject for a user and return it', () => {
      const subject = service.addClient(1);
      expect(subject).toBeInstanceOf(Subject);
    });

    it('should return the same Subject for the same user on repeated calls', () => {
      const subject1 = service.addClient(1);
      const subject2 = service.addClient(1);
      expect(subject1).toBe(subject2);
    });

    it('should create different Subjects for different users', () => {
      const subject1 = service.addClient(1);
      const subject2 = service.addClient(2);
      expect(subject1).not.toBe(subject2);
    });
  });

  describe('removeClient', () => {
    it('should complete and remove a client', () => {
      const subject = service.addClient(1);
      const completeSpy = jest.spyOn(subject, 'complete');

      service.removeClient(1);

      expect(completeSpy).toHaveBeenCalled();
    });

    it('should do nothing for non-existent user', () => {
      expect(() => service.removeClient(999)).not.toThrow();
    });

    it('should not send events to removed client', () => {
      const subject = service.addClient(1);
      const nextSpy = jest.spyOn(subject, 'next');

      service.removeClient(1);
      service.sendToUser(1, 'test', { msg: 'hello' });

      // Subject is completed but next() still works after complete() in RxJS
      // The real signal is that it's removed — sendToUser can't find it
      expect(nextSpy).not.toHaveBeenCalled();
    });
  });

  describe('sendToUser', () => {
    it('should send event to a connected client', () => {
      const subject = service.addClient(1);
      const nextSpy = jest.spyOn(subject, 'next');

      service.sendToUser(1, 'notification', { title: 'Hello' });

      expect(nextSpy).toHaveBeenCalledWith({
        type: 'notification',
        data: { title: 'Hello' },
      });
    });

    it('should do nothing for non-existent user', () => {
      expect(() =>
        service.sendToUser(999, 'test', {}),
      ).not.toThrow();
    });
  });

  describe('broadcast', () => {
    it('should send event to all connected clients', () => {
      const sub1 = service.addClient(1);
      const sub2 = service.addClient(2);
      const spy1 = jest.spyOn(sub1, 'next');
      const spy2 = jest.spyOn(sub2, 'next');

      service.broadcast('announcement', { text: 'Hello everyone' });

      expect(spy1).toHaveBeenCalledWith({
        type: 'announcement',
        data: { text: 'Hello everyone' },
      });
      expect(spy2).toHaveBeenCalledWith({
        type: 'announcement',
        data: { text: 'Hello everyone' },
      });
    });

    it('should not throw when no clients are connected', () => {
      expect(() => service.broadcast('test', {})).not.toThrow();
    });
  });
});