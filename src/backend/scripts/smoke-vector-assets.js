/**
 * 素材解析冒烟测试：验证「主题 → 主体素材」的映射是否符合预期。
 * 用法：node dist 编译后执行 node scripts/smoke-vector-assets.js
 */
process.env.OPENVERSE_IMAGE_API_URL = 'http://127.0.0.1:1/'; // 断网，确保只测本地与矢量库

const { VisualAssetService } = require('../dist/modules/learning/visual-asset.service');

const CASES = [
  { topic: '认识老虎', scene: { title: '大老虎', narration: '老虎身上有条纹', assetKey: 'tiger', action: 'idle' } },
  { topic: '认识狮子', scene: { title: '狮子', narration: '狮子有金色的鬃毛', assetKey: 'lion', action: 'idle' } },
  { topic: '小熊猫找家', scene: { title: '熊猫', narration: '熊猫爱吃竹子', assetKey: 'panda', action: 'idle' } },
  { topic: '认识水果', scene: { title: '苹果', narration: '这是一个红红的苹果', assetKey: 'topic', assetTags: ['fruit'] } },
  { topic: '交通工具', scene: { title: '小汽车', narration: '小汽车开在路上', assetKey: 'topic' } },
  { topic: '水去哪里了', scene: { title: '水循环', narration: '太阳把水晒热，水变成水汽', assetKey: 'topic', habitat: 'river' } },
  { topic: '数一数', scene: { title: '数数', narration: '一个一个数出来', assetKey: 'topic', domain: 'math' } },
];

(async () => {
  const service = new VisualAssetService();
  for (const item of CASES) {
    const plan = await service.resolveSceneVisualAssets(item.scene, item.topic);
    const main = plan.mainCharacter;
    console.log(
      [
        item.topic.padEnd(8),
        'provider=' + plan.sourceProvider.padEnd(11),
        'role=' + String(main && main.role).padEnd(9),
        'src=' + String(main && main.staticPath),
        'bg=' + String(plan.background && plan.background.role),
        'quality=' + plan.qualityScore,
      ].join(' '),
    );
  }

  // ---- 视觉关系图：脏输入必须被挡在渲染器之外 ----
  const { normalizeSceneGraph } = require('../dist/modules/learning/video/scene-graph');

  const GRAPH_CASES = [
    {
      name: '合法 cycle + 重复 id + 缺 subject',
      raw: {
        relation: 'cycle',
        nodes: [
          { id: 'a', label: '太阳', subject: '太阳' },
          { id: 'a', label: '云', subject: '白云' },
          { label: '雨', subject: '雨' },
          { label: '空', subject: '' },
        ],
      },
    },
    { name: '非法 relation', raw: { relation: 'timeline', nodes: [{ subject: 'a' }, { subject: 'b' }] } },
    {
      name: 'compare 超过 2 个节点（应截断）',
      raw: { relation: 'compare', nodes: [{ subject: '石头' }, { subject: '皮球' }, { subject: '木块' }] },
    },
    { name: 'group 只有 2 个节点（不足下限）', raw: { relation: 'group', nodes: [{ subject: '水果' }, { subject: '苹果' }] } },
    { name: '全部节点为空', raw: { relation: 'chain', nodes: [{}, { subject: '' }] } },
    { name: '缺 relation', raw: { nodes: [{ subject: 'a' }, { subject: 'b' }] } },
  ];

  for (const item of GRAPH_CASES) {
    const graph = normalizeSceneGraph(item.raw);
    console.log(
      'graph '.padEnd(8) +
        item.name.padEnd(34) +
        '→ ' +
        (graph
          ? 'relation=' + graph.relation + ' nodes=' + graph.nodes.map((n) => n.id + ':' + n.label).join(',')
          : 'null(已拒绝)'),
    );
  }

  const water = normalizeSceneGraph({
    relation: 'cycle',
    caption: '水转一圈又回来了',
    nodes: [
      { id: 'n1', label: '太阳', subject: '太阳', role: 'place' },
      { id: 'n2', label: '水汽', subject: '水蒸气', role: 'abstract' },
      { id: 'n3', label: '白云', subject: '白云', role: 'object' },
      { id: 'n4', label: '雨滴', subject: '雨', role: 'object' },
    ],
  });
  const icons = await service.resolveGraphIcons(water, '水去哪里了');
  console.log('graph_icons ' + JSON.stringify(icons));
  console.log('graph_icon_hit=' + Object.keys(icons).length + '/' + water.nodes.length);
})();
