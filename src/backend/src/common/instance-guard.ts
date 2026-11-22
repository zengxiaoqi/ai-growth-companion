/**
 * 单实例守门员
 *
 * 背景（真实事故）：`nest start --watch` 重启时旧进程没有退干净，新进程拿不到
 * 3001（EADDRINUSE）却没有立刻退出。两个进程各自持有一份内存库和一条队列
 * 定时器，于是出现三种"静默失败"：
 *
 *  1. 僵尸进程手里有定时器，但没有 socket —— 家长在页面上点的任务落在另一个
 *     进程的库里，僵尸永远看不到，任务一直 pending，页面永远 0%。
 *  2. 新进程在 listen 之前就已经跑了 OnModuleInit —— 队列定时器开始认领，
 *     同时 `resetOrphanedProcessingTasks()` 把**正在渲染的任务**打回 pending，
 *     一次重启就让 attemptCount 白涨一格。
 *  3. 谁在跑队列无法从外部观察到，只能猜，只能人工清理。
 *
 * 这里给出一条结构性约束，而不是靠记性：
 *
 *   只有**成功绑定 HTTP 端口**的进程才可以认领出片任务。
 *
 * 具体分三层，缺一层都还会漏：
 *  - 启动前探测端口 + 加锁（`acquireInstanceLock` / `probePort`）：抢不到就在
 *    构造 Nest 应用之前退出，定时器根本不会被创建。
 *  - 运行期身份闸门（`isWorkerActive`）：即使定时器已经起来，没拿到"端口归属"
 *    信号之前也不认领、不复位僵尸任务。
 *  - 进程级兜底（`installProcessGuards`）：未处理的 Promise 拒绝 / 未捕获异常
 *    立刻退出并释放锁，不要再留一个"看起来还活着"的进程。
 *
 * 锁文件只是**提示性**的：真正的资源是端口。锁的作用是让"谁在跑"这件事有
 * 据可查，以及在端口还没起来的那几百毫秒里挡住第二个进程。
 */
import * as fs from 'fs';
import * as net from 'net';
import * as path from 'path';
import { randomUUID } from 'crypto';

/** 抢占失败时愿意等多久。8s 覆盖 `nest start --watch` 杀旧进程 + 起新进程的间隙 */
export const DEFAULT_WAIT_MS = 8000;

export type InstanceLock = {  pid: number;
  port: number;
  startedAt: string;
  /** 同进程重入判据：热重载/测试里会重复 acquire，pid 相同不代表是同一个持有者 */
  token: string;
};

export type AcquireResult = { lock: InstanceLock; file: string };

/**
 * 锁被活进程持有。
 *
 * 用异常而不是 `{ok:false}` 返回值：项目 tsconfig 里 strictNullChecks 是关的，
 * 布尔判别联合在这里不会被收窄，调用方写 `if (!result.ok)` 之后依然拿不到
 * `owner` 字段（TS2339）。抛异常让"抢占失败"变成一条不可能被忽略的路径。
 */
export class InstanceLockHeldError extends Error {
  constructor(
    readonly owner: InstanceLock | null,
    readonly file: string,
  ) {
    super(
      `实例锁被占用: pid=${owner?.pid ?? '?'}, port=${owner?.port ?? '?'}, file=${file}`,
    );
    this.name = 'InstanceLockHeldError';
  }
}

type GuardState = {
  token: string | null;
  file: string | null;
  owned: InstanceLock | null;
  workerActive: boolean;
  port: number | null;
  activatedAt: string | null;
};

const state: GuardState = {
  token: null,
  file: null,
  owned: null,
  // 单测不经过 bootstrap：jest 会设 NODE_ENV=test，此时默认视为唯一实例，
  // 否则所有队列用例都会卡在闸门上（它们直接 new 服务，不跑 main.ts）。
  workerActive: process.env.NODE_ENV === 'test',
  port: null,
  activatedAt: null,
};

const activationListeners: Array<() => void> = [];
let processGuardsInstalled = false;
let exitHookInstalled = false;

/** 锁文件默认落在 storage/（已 gitignore），可用 INSTANCE_LOCK_FILE 覆盖 */
export function defaultLockFile(): string {
  const override = (process.env.INSTANCE_LOCK_FILE || '').trim();
  if (override) return path.resolve(override);
  return path.join(process.cwd(), 'storage', '.instance.json');
}

/**
 * pid 是否还活着。
 * pid<=0 一律判死：`process.kill(0, 0)` 是"给整个进程组发信号"，在 Windows 上
 * 语义更混乱，绝不能拿它当存活探测。
 */
export function isProcessAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error: any) {
    // EPERM = 进程存在但没权限发信号，仍算活着
    return error?.code === 'EPERM';
  }
}

function readLock(file: string): InstanceLock | null {
  try {
    const raw = fs.readFileSync(file, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const pid = Number(parsed.pid);
    if (!Number.isFinite(pid)) return null;
    return {
      pid,
      port: Number(parsed.port) || 0,
      startedAt: typeof parsed.startedAt === 'string' ? parsed.startedAt : '',
      token: typeof parsed.token === 'string' ? parsed.token : '',
    };
  } catch {
    return null;
  }
}

/**
 * 取得单实例锁。
 *
 * 用 `wx`（O_EXCL）创建，Windows 与 POSIX 上都是原子操作 —— 先读后写会留下
 * TOCTOU 窗口，两个进程同时启动时都能读到"没有锁"。
 */
export function acquireInstanceLock(options: {
  port: number;
  file?: string;
}): AcquireResult {
  const file = options.file ? path.resolve(options.file) : defaultLockFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });

  const lock: InstanceLock = {
    pid: process.pid,
    port: options.port,
    startedAt: new Date().toISOString(),
    token: randomUUID(),
  };

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const fd = fs.openSync(file, 'wx');
      try {
        fs.writeFileSync(fd, JSON.stringify(lock, null, 2), 'utf8');
      } finally {
        fs.closeSync(fd);
      }
      state.token = lock.token;
      state.file = file;
      state.owned = lock;
      // 只在第一次注册：反复 acquire（watch 热重启、单测）会堆叠 exit 监听器，
      // 超过 10 个就报 MaxListenersExceededWarning
      if (!exitHookInstalled) {
        exitHookInstalled = true;
        process.once('exit', releaseInstanceLock);
      }
      return { lock, file };
    } catch (error: any) {
      if (error?.code !== 'EEXIST') throw error;

      const owner = readLock(file);

      // 同进程重复获取：热重载、测试里多次调用都属于这种，直接复用
      if (owner && owner.pid === process.pid && owner.token && owner.token === state.token) {
        return { lock: owner, file };
      }

      const stale = !owner || !isProcessAlive(owner.pid);
      if (!stale) throw new InstanceLockHeldError(owner, file);

      // 陈旧锁（进程已死或文件被写坏）：清掉重试一次。只在第一次尝试时清，
      // 第二次再 EEXIST 说明有别人刚建了新锁，那是有活人的信号。
      if (attempt === 0) {
        try {
          fs.unlinkSync(file);
        } catch {
          /* 别人抢先删了也一样 */
        }
        continue;
      }
      throw new InstanceLockHeldError(readLock(file), file);
    }
  }

  throw new InstanceLockHeldError(readLock(file), file);
}

/**
 * 抢占失败：端口被占，或锁被活进程持有。
 * reason='port' 说明另一个后端真的在服务；reason='lock' 说明还没绑端口但已持有锁。
 */
export class InstanceBusyError extends Error {
  constructor(
    readonly reason: 'port' | 'lock',
    readonly owner: InstanceLock | null,
    readonly file: string | null,
    readonly port: number,
  ) {
    super(
      reason === 'port'
        ? `端口 ${port} 已被占用`
        : `实例锁被进程 ${owner?.pid ?? '?'} 持有（port=${owner?.port ?? '?'}, file=${file ?? '?'}）`,
    );
    this.name = 'InstanceBusyError';
  }
}

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * 等到"既能绑端口、又能拿到锁"为止，最多等 timeoutMs。
 *
 * 为什么要等而不是立刻失败：`nest start --watch` 的换班是"杀旧进程 + 起新进程"
 * 两条独立的异步动作，新进程常常在旧进程还没释放端口/锁的那几百毫秒里就启动了。
 * 立刻失败会让开发服务器在每次改代码后起不来——这比原来的静默僵尸更难用。
 *
 * 等待期间**只做只读探测和一次原子创建尝试**，不会去杀谁的进程、也不会删活锁。
 * 真正的第二个实例仍然会被挡住，只是误差 8 秒，并且报错信息更加明确。
 */
export async function waitForExclusiveAccess(options: {
  port: number;
  host?: string;
  timeoutMs?: number;
  file?: string;
  pollMs?: number;
}): Promise<AcquireResult> {
  const port = options.port;
  const host = options.host || '0.0.0.0';
  // NaN 必须挡掉：`Date.now() >= deadline` 在 deadline 是 NaN 时永远为 false，
  // 等待循环会变成无超时的死循环（INSTANCE_WAIT_MS 写错一个字符就能触发）
  const timeoutMs =
    typeof options.timeoutMs === 'number' && Number.isFinite(options.timeoutMs)
      ? Math.max(0, options.timeoutMs)
      : DEFAULT_WAIT_MS;
  const pollMs = Math.max(50, options.pollMs ?? 250);
  const file = options.file ? path.resolve(options.file) : defaultLockFile();
  const deadline = Date.now() + timeoutMs;

  for (;;) {
    const busy = await probePort(port, host);
    if (!busy) {
      try {
        return acquireInstanceLock({ port, file });
      } catch (error) {
        if (!(error instanceof InstanceLockHeldError)) throw error;
        if (Date.now() >= deadline) {
          throw new InstanceBusyError('lock', error.owner, error.file, port);
        }
      }
    } else if (Date.now() >= deadline) {
      throw new InstanceBusyError('port', null, file, port);
    }

    if (Date.now() >= deadline) throw new InstanceBusyError('port', null, file, port);
    await delay(pollMs);
  }
}

/**
 * 探测端口是否已被占用。
 *
 * 启动前先探一次，是为了在**构造 Nest 应用之前**就发现问题：一旦
 * `NestFactory.create` 跑起来，所有 OnModuleInit 都已经生效（定时器启动、
 * 僵尸任务复位），此时再失败退出就已经产生副作用了。
 */
export function probePort(port: number, host = '0.0.0.0', timeoutMs = 800): Promise<boolean> {
  // 监听 0.0.0.0 时连 127.0.0.1 才能命中；连 0.0.0.0 在部分平台会被拒
  const target = host === '0.0.0.0' || host === '::' || !host ? '127.0.0.1' : host;
  return new Promise<boolean>((resolve) => {
    const socket = net.connect({ port, host: target });
    let settled = false;
    const done = (busy: boolean) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(busy);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
  });
}

/**
 * 宣告本进程已绑定端口 —— 从这一刻起才可以认领任务。
 * 必须由 main.ts 在 `await app.listen()` 成功之后调用。
 */
export function announcePortOwner(port: number): void {
  state.port = port;
  state.activatedAt = new Date().toISOString();
  state.workerActive = true;

  // 端口号可能来自 PORT 环境变量覆盖，回写锁文件让外部能对上
  if (state.file && state.owned && state.owned.port !== port) {
    state.owned = { ...state.owned, port };
    try {
      fs.writeFileSync(state.file, JSON.stringify(state.owned, null, 2), 'utf8');
    } catch {
      /* 锁文件写不进去不影响运行，端口归属已经确立 */
    }
  }

  const pending = activationListeners.splice(0, activationListeners.length);
  for (const listener of pending) {
    try {
      listener();
    } catch {
      /* 单个监听器失败不能影响其他监听器 */
    }
  }
}

/** 本进程当前是否有资格认领任务 */
export function isWorkerActive(): boolean {
  return state.workerActive;
}

/**
 * 等"本进程拿到端口"这个事件。
 * 队列服务是在 listen 之前初始化的，所以它只能订阅，不能假设。
 */
export function onWorkerActivated(listener: () => void): void {
  if (state.workerActive) {
    listener();
    return;
  }
  activationListeners.push(listener);
}

/**
 * 主动交还认领资格（不删锁）。
 * 用途：优雅停机前停止认领；测试里模拟"没抢到端口的进程"。
 */
export function markWorkerInactive(): void {
  state.workerActive = false;
}

/** 供 /api/health 暴露，让"谁在跑队列"变成可观察的量 */
export function workerSnapshot(): {
  pid: number;
  port: number | null;
  active: boolean;
  activatedAt: string | null;
  lockFile: string | null;
  lockHolder: InstanceLock | null;
} {
  return {
    pid: process.pid,
    port: state.port,
    active: state.workerActive,
    activatedAt: state.activatedAt,
    lockFile: state.file,
    lockHolder: state.file ? readLock(state.file) : null,
  };
}

/** 释放锁。只删自己写的那个文件，避免误删后继进程的锁。 */
export function releaseInstanceLock(): void {
  const file = state.file;
  const owned = state.owned;
  state.workerActive = false;
  state.file = null;
  state.owned = null;
  state.token = null;
  if (!file || !owned) return;
  try {
    const current = readLock(file);
    if (current && current.token && current.token !== owned.token) return;
    fs.unlinkSync(file);
  } catch {
    /* 已经不存在就是目标状态 */
  }
}

/**
 * 进程级兜底。
 *
 * 没有这两个 handler 时，`bootstrap()` 里 listen 失败会变成未处理的 Promise
 * 拒绝：Node 22 默认会退出，但退出是"抛完就走"，既不释放锁也不写清楚原因；
 * 而在被 `nest start --watch` 包一层时更容易留下半死进程。这里的取舍很明确：
 * **一个连不上端口的后端进程没有任何存在价值**，宁可立刻退。
 */
export function installProcessGuards(options?: { onFatal?: (error: unknown) => void }): void {
  if (processGuardsInstalled) return;
  processGuardsInstalled = true;

  const fatal = (kind: string, error: unknown) => {
    try {
      options?.onFatal?.(error);
    } catch {
      /* 兜底日志失败不影响退出 */
    }
    // eslint-disable-next-line no-console
    console.error(`[instance-guard] ${kind}, exiting:`, error);
    releaseInstanceLock();
    process.exit(1);
  };

  process.on('unhandledRejection', (reason) => fatal('unhandledRejection', reason));
  process.on('uncaughtException', (error) => fatal('uncaughtException', error));
}
