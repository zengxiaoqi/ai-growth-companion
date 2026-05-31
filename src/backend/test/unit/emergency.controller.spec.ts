import { EmergencyController } from '../../src/modules/emergency/emergency.controller';

describe('EmergencyController', () => {
  let controller: EmergencyController;

  const mockEmergencyService = {
    triggerEmergencyCall: jest.fn(),
    getHistory: jest.fn(),
  };

  beforeEach(() => {
    controller = new EmergencyController(mockEmergencyService as any);
    jest.clearAllMocks();
  });

  describe('trigger', () => {
    it('should call emergencyService.triggerEmergencyCall with childId', async () => {
      const mockCall = {
        id: 1,
        childId: 1,
        parentId: 2,
        status: 'completed',
        parentPhone: '13800000001',
      };
      mockEmergencyService.triggerEmergencyCall.mockResolvedValue(mockCall);

      const result = await controller.trigger({ childId: 1 });

      expect(mockEmergencyService.triggerEmergencyCall).toHaveBeenCalledWith(1);
      expect(result).toEqual(mockCall);
    });

    it('should handle emergency call with childId 0', async () => {
      mockEmergencyService.triggerEmergencyCall.mockResolvedValue({ status: 'failed' });

      const result = await controller.trigger({ childId: 0 });

      expect(mockEmergencyService.triggerEmergencyCall).toHaveBeenCalledWith(0);
      expect(result).toEqual({ status: 'failed' });
    });
  });

  describe('getHistory', () => {
    it('should call emergencyService.getHistory with parsed childId', async () => {
      const mockHistory = [
        { id: 1, childId: 1, status: 'completed' },
        { id: 2, childId: 1, status: 'failed' },
      ];
      mockEmergencyService.getHistory.mockResolvedValue(mockHistory);

      const result = await controller.getHistory('1');

      expect(mockEmergencyService.getHistory).toHaveBeenCalledWith(1);
      expect(result).toEqual(mockHistory);
    });

    it('should return empty array when no history', async () => {
      mockEmergencyService.getHistory.mockResolvedValue([]);

      const result = await controller.getHistory('999');

      expect(mockEmergencyService.getHistory).toHaveBeenCalledWith(999);
      expect(result).toEqual([]);
    });
  });
});