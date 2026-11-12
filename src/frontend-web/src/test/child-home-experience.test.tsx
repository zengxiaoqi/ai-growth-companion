import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  BigSubjectGrid,
  ChildHomeHero,
  DiscoveryCards,
  type PrimaryTask,
  type SecondaryAction,
} from '../components/ChildHomeExperience';
import { CHILD_DENSITY } from '../lib/child-theme';

const baseTask: PrimaryTask = {
  kicker: '今天先玩这个',
  title: '数字宝宝 1–5',
  meta: '一起数苹果 🍎',
  buttonLabel: '开始玩',
  onStart: vi.fn(),
};

const secondaryActions: SecondaryAction[] = [
  { label: '听小犀讲故事', emoji: '🎧', onSelect: vi.fn() },
  { label: '看看我的成就', emoji: '🏅', onSelect: vi.fn() },
];

function renderHero(overrides: Partial<ComponentProps<typeof ChildHomeHero>> = {}) {
  const onStart = vi.fn();
  const onOpenCompanion = vi.fn();
  const view = render(
    <ChildHomeHero
      userName="小明"
      task={{ ...baseTask, onStart }}
      stars={2}
      onOpenCompanion={onOpenCompanion}
      secondaryActions={secondaryActions}
      {...overrides}
    />,
  );
  return { ...view, onStart, onOpenCompanion };
}

describe('孩子端首页体验组件 · 交互', () => {
  it('首屏主任务与 AI 入口都可点，且永不出现空状态文案', async () => {
    const user = userEvent.setup();
    const { onStart, onOpenCompanion } = renderHero();

    expect(screen.getByText('嗨，小明！')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '数字宝宝 1–5' })).toBeInTheDocument();
    expect(screen.getByText('今天想先玩什么呀？')).toBeInTheDocument();
    expect(screen.queryByText(/暂无|暂时不可用/)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /开始玩/ }));
    expect(onStart).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: /和小犀说说话/ }));
    expect(onOpenCompanion).toHaveBeenCalledTimes(1);
  });

  it('探索卡始终有内置知识，点开可让小犀讲解', async () => {
    const user = userEvent.setup();
    const onOpenCompanion = vi.fn();
    const { container } = render(
      <DiscoveryCards onOpenCompanion={onOpenCompanion} density={CHILD_DENSITY[2]} />,
    );

    expect(container.querySelectorAll('.child-discover-card')).toHaveLength(5);
    await user.click(screen.getByRole('button', { name: /影子变短啦/ }));
    // 高龄档卡片会显示摘要，因此完整文案可能同时出现在卡片与弹层里
    expect(screen.getAllByText(/中午太阳升得最高/).length).toBeGreaterThan(0);
    expect(screen.getByText(/去量量自己的影子吧/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /让小犀讲给我听/ }));
    expect(onOpenCompanion).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/去量量自己的影子吧/)).not.toBeInTheDocument();
  });

  it('「换一批」会轮转探索卡顺序', async () => {
    const user = userEvent.setup();
    const { container } = render(<DiscoveryCards onOpenCompanion={vi.fn()} />);

    const firstBefore = container.querySelector('.child-discover-card b')?.textContent;
    await user.click(screen.getByRole('button', { name: /换一批/ }));
    const firstAfter = container.querySelector('.child-discover-card b')?.textContent;

    expect(firstAfter).not.toBe(firstBefore);
  });

  it('六个大图标学科按钮分别触发对应回调', async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    const onMusic = vi.fn();

    render(<BigSubjectGrid onPick={onPick} onMusic={onMusic} density={CHILD_DENSITY[1]} />);

    for (const label of ['语言', '数学', '科学', '艺术', '社会', '音乐']) {
      expect(screen.getByRole('button', { name: new RegExp(label) })).toBeInTheDocument();
    }

    await user.click(screen.getByRole('button', { name: /数学/ }));
    expect(onPick).toHaveBeenCalledWith('math');

    await user.click(screen.getByRole('button', { name: /音乐/ }));
    expect(onMusic).toHaveBeenCalledTimes(1);
    expect(onPick).toHaveBeenCalledTimes(1);
  });
});

describe('孩子端首页体验组件 · 三档年龄密度', () => {
  it('level 0：纯图形星星、66px 主按钮、无次要动作、3 张探索卡、4 学科且音乐不丢', () => {
    const low = CHILD_DENSITY[0];
    const { unmount } = renderHero({ density: low });

    expect(screen.getByText('已收集 2 / 3')).toBeInTheDocument();
    expect(screen.queryByText('今日进度')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /开始玩/ })).toHaveStyle({ minHeight: '66px' });
    expect(screen.queryByRole('button', { name: /听小犀讲故事/ })).not.toBeInTheDocument();
    expect(screen.queryByText(baseTask.meta)).not.toBeInTheDocument();
    unmount();

    const discovery = render(<DiscoveryCards onOpenCompanion={vi.fn()} density={low} />);
    expect(discovery.container.querySelectorAll('.child-discover-card')).toHaveLength(3);
    discovery.unmount();

    const subjects = render(
      <BigSubjectGrid onPick={vi.fn()} onMusic={vi.fn()} density={low} />,
    );
    expect(subjects.container.querySelectorAll('.child-subject')).toHaveLength(4);
    // 音乐是独立业务入口，低龄档裁剪学科时不能被砍掉
    expect(screen.getByRole('button', { name: /音乐/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /社会/ })).not.toBeInTheDocument();
  });

  it('level 1：进度环、56px 主按钮、1 个次要动作、4 张探索卡、6 学科', () => {
    const mid = CHILD_DENSITY[1];
    const { unmount } = renderHero({ density: mid });

    expect(screen.getByText('今日进度')).toBeInTheDocument();
    expect(screen.getByText('2/3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /开始玩/ })).toHaveStyle({ minHeight: '56px' });
    expect(screen.getByRole('button', { name: /听小犀讲故事/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /看看我的成就/ })).not.toBeInTheDocument();
    expect(screen.getByText(baseTask.meta)).toBeInTheDocument();
    unmount();

    const discovery = render(<DiscoveryCards onOpenCompanion={vi.fn()} density={mid} />);
    expect(discovery.container.querySelectorAll('.child-discover-card')).toHaveLength(4);
    discovery.unmount();

    const subjects = render(
      <BigSubjectGrid onPick={vi.fn()} onMusic={vi.fn()} density={mid} />,
    );
    expect(subjects.container.querySelectorAll('.child-subject')).toHaveLength(6);
  });

  it('level 2：任务勾选清单、48px 主按钮、2 个次要动作、5 张探索卡', () => {
    const high = CHILD_DENSITY[2];
    const { unmount } = renderHero({ density: high });

    expect(screen.getByText('今日小任务')).toBeInTheDocument();
    expect(screen.getByText('2 / 3 完成')).toBeInTheDocument();
    expect(screen.getByText('今日主线 · Lv.3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /开始玩/ })).toHaveStyle({ minHeight: '48px' });
    expect(screen.getByRole('button', { name: /听小犀讲故事/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /看看我的成就/ })).toBeInTheDocument();
    unmount();

    const discovery = render(<DiscoveryCards onOpenCompanion={vi.fn()} density={high} />);
    expect(discovery.container.querySelectorAll('.child-discover-card')).toHaveLength(5);
  });

  it('未传 density 时默认中档，组件可独立使用', () => {
    renderHero();
    expect(screen.getByText('今日进度')).toBeInTheDocument();
  });
});
