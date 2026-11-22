import * as fs from 'fs';
import * as net from 'net';
import * as os from 'os';
import * as path from 'path';
import {
  InstanceBusyError,
  InstanceLockHeldError,
  acquireInstanceLock,
  announcePortOwner,
  isProcessAlive,
  isWorkerActive,
  markWorkerInactive,
  onWorkerActivated,
  probePort,
  releaseInstanceLock,
  waitForExclusiveAccess,
  workerSnapshot,
} from '../../src/common/instance-guard';

/**
 * 这些用例钉的不是"工具函数好不好用"，而是三条会静默出事的性质：
 *  1. 同一时刻只允许一个进程写锁（O_EXCL，不是先读后写）
 *  2. 死进程留下的锁必须能被接管，否则一次 kill -9 就再也起不来
 *  3. 没拿到端口归属的进程不能认领任务（队列的闸门依赖这一条）
 */
describe('instance-guard', () => {
  let dir: string;
  let lockFile: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'instance-guard-'));
    lockFile = path.join(dir, 'nested', '.instance.json');
  });

  afterEach(() => {
    releaseInstanceLock();
    // 恢复"单测默认视为唯一实例"的初值，避免用例之间互相污染
    announcePortOwner(0);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const writeLock = (payload: Record<string, unknown>) => {
    fs.mkdirSync(path.dirname(lockFile), { recursive: true });
    fs.writeFileSync(lockFile, JSON.stringify(payload), 'utf8');
  };

  it('首次获取即成功，并把 pid/port/token 落到磁盘', () => {
    const result = acquireInstanceLock({ port: 3001, file: lockFile });

    const onDisk = JSON.parse(fs.readFileSync(lockFile, 'utf8'));
    expect(onDisk.pid).toBe(process.pid);
    expect(onDisk.port).toBe(3001);
    expect(onDisk.token).toBe(result.lock.token);
  });

  it('同进程重复获取复用同一把锁（热重载/多模块初始化）', () => {
    const first = acquireInstanceLock({ port: 3001, file: lockFile });
    const second = acquireInstanceLock({ port: 3001, file: lockFile });
    expect(second.lock.token).toBe(first.lock.token);
  });

  it('活进程持锁时拒绝，并把持有者信息带回去', () => {
    // 用当前 pid 模拟"另一个还活着的实例"：pid 真实存在，token 不是我们的
    writeLock({
      pid: process.pid,
      port: 3001,
      startedAt: '2026-11-22T00:00:00.000Z',
      token: 'someone-else',
    });

    let caught: InstanceLockHeldError | null = null;
    try {
      acquireInstanceLock({ port: 3001, file: lockFile });
    } catch (error) {
      caught = error as InstanceLockHeldError;
    }

    expect(caught).toBeInstanceOf(InstanceLockHeldError);
    expect(caught?.owner?.pid).toBe(process.pid);
    expect(caught?.owner?.token).toBe('someone-else');
    // 不能动别人的锁
    expect(JSON.parse(fs.readFileSync(lockFile, 'utf8')).token).toBe('someone-else');
  });

  it('死进程留下的锁会被接管（kill -9 之后还能起来）', () => {
    writeLock({ pid: 2147483646, port: 3001, startedAt: '', token: 'dead-owner' });

    acquireInstanceLock({ port: 3001, file: lockFile });
    expect(JSON.parse(fs.readFileSync(lockFile, 'utf8')).pid).toBe(process.pid);
  });

  it('锁文件被写坏时视为陈旧，直接重建', () => {
    fs.mkdirSync(path.dirname(lockFile), { recursive: true });
    fs.writeFileSync(lockFile, '{ not json', 'utf8');

    acquireInstanceLock({ port: 3001, file: lockFile });
    expect(JSON.parse(fs.readFileSync(lockFile, 'utf8')).pid).toBe(process.pid);
  });

  it('pid 探测：自己活着，0 与不可能存在的 pid 判死', () => {
    expect(isProcessAlive(process.pid)).toBe(true);
    // pid<=0 会变成"给进程组发信号"，必须直接判死而不是拿去探测
    expect(isProcessAlive(0)).toBe(false);
    expect(isProcessAlive(-1)).toBe(false);
    expect(isProcessAlive(2147483646)).toBe(false);
  });

  it('释放锁后文件消失，且不会误删别人刚写的锁', () => {
    acquireInstanceLock({ port: 3001, file: lockFile });
    expect(fs.existsSync(lockFile)).toBe(true);
    releaseInstanceLock();
    expect(fs.existsSync(lockFile)).toBe(false);

    // 拿到锁之后文件被别人覆盖（token 变了）→ 释放时不能删，
    // 否则会把后继进程的锁一起清掉，两个实例都以为自己独占
    acquireInstanceLock({ port: 3001, file: lockFile });
    writeLock({ pid: 424242, port: 3001, startedAt: '', token: 'successor' });
    releaseInstanceLock();
    expect(fs.existsSync(lockFile)).toBe(true);
    expect(JSON.parse(fs.readFileSync(lockFile, 'utf8')).token).toBe('successor');
  });

  it('端口探测：有监听者为 true，无人监听为 false', async () => {
    const server = net.createServer();
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;

    expect(await probePort(port, '127.0.0.1')).toBe(true);
    await new Promise<void>((resolve) => server.close(() => resolve()));
    expect(await probePort(port, '127.0.0.1')).toBe(false);
  });

  describe('等待独占访问（watch 换班）', () => {
    /** 拿一个当前没人监听的端口：先绑 0 再关掉 */
    const freePort = async (): Promise<number> => {
      const server = net.createServer();
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      await new Promise<void>((resolve) => server.close(() => resolve()));
      return port;
    };

    it('端口被占时抛 port 原因，而不是笼统失败', async () => {
      const server = net.createServer();
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;

      let caught: InstanceBusyError | null = null;
      try {
        await waitForExclusiveAccess({ port, host: '127.0.0.1', timeoutMs: 0, file: lockFile });
      } catch (error) {
        caught = error as InstanceBusyError;
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }

      expect(caught).toBeInstanceOf(InstanceBusyError);
      expect(caught?.reason).toBe('port');
      expect(caught?.port).toBe(port);
    });

    it('端口空闲但锁被活进程持有时抛 lock 原因', async () => {
      const port = await freePort();
      writeLock({ pid: process.pid, port, startedAt: '', token: 'alive-owner' });

      let caught: InstanceBusyError | null = null;
      try {
        await waitForExclusiveAccess({ port, host: '127.0.0.1', timeoutMs: 0, file: lockFile });
      } catch (error) {
        caught = error as InstanceBusyError;
      }

      expect(caught).toBeInstanceOf(InstanceBusyError);
      expect(caught?.reason).toBe('lock');
      expect(caught?.owner?.token).toBe('alive-owner');
    });

    it('前一个进程释放端口后能接上（watch 热重启的实际路径）', async () => {
      const port = await freePort();
      // 旧进程此刻还占着端口
      const predecessor = net.createServer();
      await new Promise<void>((resolve) => predecessor.listen(port, '127.0.0.1', resolve));
      setTimeout(() => predecessor.close(), 200);

      const startedAt = Date.now();
      const result = await waitForExclusiveAccess({
        port,
        host: '127.0.0.1',
        timeoutMs: 3000,
        pollMs: 50,
        file: lockFile,
      });

      // 关键不是"能成功"，而是"等过了旧进程释放的那一刻"——
      // 不等就会在 watch 重启时把自己挡在门外
      expect(Date.now() - startedAt).toBeGreaterThanOrEqual(150);
      expect(result.lock.pid).toBe(process.pid);
    });
  });

  describe('认领闸门', () => {
    it('默认（单测环境）视为唯一实例', () => {
      expect(isWorkerActive()).toBe(true);
    });

    it('未宣告端口前不活跃，宣告后回调恰好触发一次', () => {
      markWorkerInactive();
      expect(isWorkerActive()).toBe(false);

      const listener = jest.fn();
      onWorkerActivated(listener);
      expect(listener).not.toHaveBeenCalled();

      announcePortOwner(3001);
      expect(isWorkerActive()).toBe(true);
      expect(listener).toHaveBeenCalledTimes(1);

      // 已经激活的情况下，后订阅者应立即执行而不是等待下一次事件
      const late = jest.fn();
      onWorkerActivated(late);
      expect(late).toHaveBeenCalledTimes(1);
    });

    it('快照反映端口归属与锁持有者', () => {
      acquireInstanceLock({ port: 3001, file: lockFile });
      announcePortOwner(3001);
      const snapshot = workerSnapshot();
      expect(snapshot.pid).toBe(process.pid);
      expect(snapshot.port).toBe(3001);
      expect(snapshot.active).toBe(true);
      expect(snapshot.lockHolder?.pid).toBe(process.pid);
    });
  });
});
