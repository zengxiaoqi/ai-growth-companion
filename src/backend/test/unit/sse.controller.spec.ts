import { SseController } from '../../src/modules/sse/sse.controller';
import { Subject } from 'rxjs';

describe('SseController', () => {
  const subject = new Subject<any>();
  const sseService = {
    addClient: jest.fn().mockReturnValue(subject),
    removeClient: jest.fn(),
  };

  let controller: SseController;
  let mockReq: any;
  let mockRes: any;
  let closeHandler: (() => void) | null;

  beforeEach(() => {
    jest.clearAllMocks();
    closeHandler = null;
    controller = new SseController(sseService as any);

    mockReq = {
      on: jest.fn((event: string, handler: () => void) => {
        if (event === 'close') closeHandler = handler;
      }),
    };

    mockRes = {
      setHeader: jest.fn(),
      flushHeaders: jest.fn(),
      write: jest.fn(),
      end: jest.fn(),
    };
  });

  describe('GET /sse/subscribe/:userId', () => {
    it('should set SSE headers', () => {
      controller.subscribe('5', mockReq, mockRes);

      expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Type', 'text/event-stream');
      expect(mockRes.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-cache');
      expect(mockRes.setHeader).toHaveBeenCalledWith('Connection', 'keep-alive');
      expect(mockRes.setHeader).toHaveBeenCalledWith('X-Accel-Buffering', 'no');
      expect(mockRes.flushHeaders).toHaveBeenCalled();
    });

    it('should add client with numeric userId', () => {
      controller.subscribe('42', mockReq, mockRes);

      expect(sseService.addClient).toHaveBeenCalledWith(42);
    });

    it('should send initial heartbeat', () => {
      controller.subscribe('5', mockReq, mockRes);

      expect(mockRes.write).toHaveBeenCalledWith(expect.stringContaining('"type":"heartbeat"'));
    });

    it('should write events to response when subject emits', () => {
      controller.subscribe('5', mockReq, mockRes);

      const event = { type: 'notification', data: { message: 'test' } };
      subject.next(event);

      expect(mockRes.write).toHaveBeenCalledWith(`data: ${JSON.stringify(event)}\n\n`);
    });

    it('should end response when subject completes', () => {
      controller.subscribe('5', mockReq, mockRes);

      subject.complete();

      expect(mockRes.end).toHaveBeenCalled();
    });

    it('should register close handler on request', () => {
      controller.subscribe('5', mockReq, mockRes);

      expect(mockReq.on).toHaveBeenCalledWith('close', expect.any(Function));
    });

    it('should remove client on request close', () => {
      controller.subscribe('5', mockReq, mockRes);

      // Simulate client disconnect
      closeHandler?.();

      expect(sseService.removeClient).toHaveBeenCalledWith(5);
    });
  });
});
