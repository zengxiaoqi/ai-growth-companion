# 国内教育网站对接方案调研报告

> 调研日期：2026-07-21
> 项目：灵犀伴学（Lingxi Learning Companion）
> 目的：获取官方教材资源 + 支持用户上传文件

---

## 目录

1. [国家中小学智慧教育平台 (basic.smartedu.cn)](#1-国家中小学智慧教育平台)
2. [人民教育出版社 (pep.com.cn)](#2-人民教育出版社)
3. [国家教育资源公共服务平台 (eduyun.cn)](#3-国家教育资源公共服务平台)
4. [其他教材来源](#4-其他教材来源)
5. [用户上传文件技术方案](#5-用户上传文件技术方案)
6. [接入建议优先级](#6-接入建议优先级)

---

## 1. 国家中小学智慧教育平台

| 项目 | 内容 |
|------|------|
| **URL** | https://basic.smartedu.cn/tchMaterial |
| **上级平台** | https://www.smartedu.cn |
| **运营方** | 教育部 |

### 1.1 是否公开 API

**无官方公开 API。** 但平台存在可用的数据接口（非官方），已被多个开源项目逆向解析：

- **入口数据文件**：`https://s-file-2.ykt.cbern.com.cn/zxx/ndrs/resources/tch_material/version/data_version.json`
  - 返回一个 JSON，包含 `urls` 字段（逗号分隔的多个数据 URL 列表）
- **资源数据接口**：访问上述 urls 可获取所有教材的完整元数据（含 ID、标题、语言、创建时间、更新时间、标签、分辨率、大小等）
- **PDF 下载地址**：`https://r3-ndr.ykt.cbern.com.cn/edu_product/esp/assets/{book_id}.pkg/pdf.pdf`
  - 早期可直接下载，后续增加了鉴权（需要 `X-ND-AUTH` 或 `accessToken` 参数）
  - 鉴权 token 在用户登录后，可从 localStorage 中提取 `ND_UC_AUTH-{sdpAppId}&ncet-xedu&token` → 解析 → `access_token`

### 1.2 教材形式

- **教材**：PDF 格式（可直接下载整本教材）
- **课件**：PPT、Word、PDF 格式
- **视频/音频**：m3u8 格式（流媒体）
- 教材内容为扫描版/电子版 PDF，清晰度较高

### 1.3 反爬限制

| 限制类型 | 详情 |
|---------|------|
| **登录要求** | 查看教材内容需要登录（但可通过爬虫绕过） |
| **鉴权机制** | 2024年8月升级后，PDF 下载需要 `X-ND-AUTH` 或 `accessToken` 参数 |
| **Cookie 校验** | 需要携带登录后的 Cookie/Session |
| **Referer 校验** | 需要正确的 Referer 头 |
| **User-Agent** | 需要模拟浏览器 UA |
| **频率限制** | 存在一定限流，但未发现严格的 IP 封禁 |
| **CORS** | 跨域限制存在 |

### 1.4 教材版本更新频率

- 教材版本随教育部统编教材更新周期更新（2024年8月进行了大规模修订）
- 教材资源数据接口中的 `update_time` 字段可追踪版本变化
- 2024版义务教育统编教材做了较大修订，需要留意版本差异

### 1.5 爬取难度评估

| 维度 | 评分（1-5，5最难） |
|------|------------------|
| 数据获取 | ⭐⭐⭐ |
| 反爬对抗 | ⭐⭐⭐⭐ |
| 稳定性 | ⭐⭐⭐ |
| 法律风险 | ⭐⭐（官方平台，但未经授权批量下载可能违反服务条款） |

### 1.6 推荐接入方式

**方案 A：前端直链引用（推荐，合法合规）**
- 直接嵌入官方平台链接，用户点击跳转至 `basic.smartedu.cn` 浏览
- 无法律风险，但用户需要跳转浏览器

**方案 B：后端缓存 + 鉴权代理**
- 后端维护一个登录态池，通过鉴权代理下载 PDF
- 使用开源工具 `smartedu-dl-go` 或 `tchMaterial-parser` 作为参考实现
- 已注册用户通过本地 Session 获取 accessToken，后端代理下载
- 缺点：需要维护登录态，技术复杂度高

**方案 C：仅索引元数据**
- 使用公开数据接口获取教材列表和元数据
- 用户点击后引导至官方平台查看原版
- 折中方案，兼顾用户体验和合规性

---

## 2. 人民教育出版社

| 项目 | 内容 |
|------|------|
| **官网** | https://www.pep.com.cn |
| **电子教材** | https://book.pep.com.cn |
| **产品中心** | https://www.pep.com.cn/products/jc |
| **运营方** | 人民教育出版社 |

### 2.1 是否提供电子版下载

**是。** 人教社在 `book.pep.com.cn` 提供电子教材在线阅读，但**不直接提供 PDF 下载**。

### 2.2 教材形式

- **在线浏览**：每页以 JPG 图片形式展示
- **页面结构**：`https://book.pep.com.cn/{book_id}/mobile/index.html`
- 通过浏览器阅读器翻页，每页加载对应 JPG 图片
- 图片命名规则可通过 JS 配置解析获取

### 2.3 是否有 API 接口

**无官方 API。** 但存在可用的内部接口：

- 页面通过 `config.js` 加载教材配置，包含每页的图片 URL 模板
- 图片 URL 格式示例：`https://book.pep.com.cn/{book_id}/files/mobile/{page_number}.jpg`
- 社区已有 Tampermonkey 油猴脚本（`pep-pdf-download.user.js`）可一键下载所有 JPG 并合成为 PDF

### 2.4 目录结构与 ChinaTextbook 一致性

**基本一致。** ChinaTextbook 项目中的人教版教材目录结构与 pep.com.cn 官方教材对应关系如下：

```
ChinaTextbook 目录结构：
小学/数学/人教版/义务教育教科书·数学一年级上册.pdf

对应的教材分类：
- 小学 → 1-6年级
- 初中 → 7-9年级
- 高中 → 必修/选修
- 教材版本：人教版、北师大版、苏教版、北京版、华师大版、鲁教版、冀教版、浙教版等
```

ChinaTextbook 的目录结构可以作为参考，但它收集的是**旧版 PDF**，新版修订后的教材可能未收录。

### 2.5 爬取难度评估

| 维度 | 评分（1-5，5最难） |
|------|------------------|
| 数据获取 | ⭐⭐ |
| 反爬对抗 | ⭐⭐（无反爬，但无直接 PDF 下载） |
| 稳定性 | ⭐⭐⭐⭐ |
| 法律风险 | ⭐⭐⭐⭐（人教社版权保护意识强） |

### 2.6 推荐接入方式

**方案 A：官方链接跳转（推荐）**
- 直接链接到 `https://book.pep.com.cn/{book_id}/mobile/index.html`
- 用户通过浏览器在线阅读

**方案 B：服务端爬取转 PDF（需谨慎）**
- 参考 `pep-pdf-download.user.js` 油猴脚本，后端实现 JPG 抓取 + PDF 合并
- 仅用于内部缓存，不对外分发
- 法律风险较高，建议仅用于教学研究目的

---

## 3. 国家教育资源公共服务平台

| 项目 | 内容 |
|------|------|
| **URL** | https://www.eduyun.cn |
| **运营方** | 教育部 |

### 3.1 是否有教育资源 API

**无公开 API。** 该平台目前主要提供教育资源导航和展示功能，主要子模块包括：

- 资源服务
- 全国中小学实验教学服务平台
- 职业教育数字资源（教材）交流展示平台
- E路护航·E路平安（网络安全教育）

### 3.2 访问限制

- **不需要教育网身份**，普通互联网可访问
- 部分资源可能需要教师身份认证
- 平台内容与 basic.smartedu.cn 有部分重叠
- 整体来看，该平台更偏向资源导航，而非直接的教材下载渠道

### 3.3 推荐接入方式

**不建议作为主要教材来源。** 理由：
- 资源分散，没有统一的教材下载接口
- 内容与 basic.smartedu.cn 重叠
- 无 API 支持，爬取成本高
- 可在「教育资源导航」中作为补充信息来源

---

## 4. 其他教材来源

### 4.1 开源教材集合

#### 4.1.1 ChinaTextbook（⭐ 46K+ Stars）

| 项目 | 内容 |
|------|------|
| **GitHub** | https://github.com/TapXWorld/ChinaTextbook |
| **内容** | 小学→大学全学科 PDF 教材 |
| **大小** | 约 38GB |
| **版本** | 人教版、北师大版、苏教版、北京版等 8 种主流版本 |
| **格式** | PDF（超过 50MB 的文件被拆分为 35MB 片段，附合并工具） |
| **更新** | 138 commits，持续更新中 |

**⚠️ 法律风险提醒：**
- GitHub Issue #236 明确指出，未经授权发布教材 PDF 可能侵犯著作权
- 2024年义务教育统编教材已做全面修订，ChinaTextbook 中的部分教材可能不是最新版本
- **建议：** 仅作为参考，不要直接对外分发，应引导用户使用官方渠道

#### 4.1.2 其他开源项目

| 项目 | 语言 | 用途 |
|------|------|------|
| [smartedu-dl-go](https://github.com/hantang/smartedu-dl-go) | Go | 智慧教育平台教材、课件、视频下载（GUI） |
| [tchMaterial-parser](https://github.com/happycola233/tchMaterial-parser) | - | 智慧教育平台教材解析工具 |
| [smartedu-download](https://github.com/52beijixing/smartedu-download) | Python | 支持视频、教材、课件下载 |
| [FlyEduDownloader](https://github.com/cjhdevact/FlyEduDownloader) | - | 智慧教育平台下载器 |
| [smart-app](https://github.com/vultur/smart-app) | - | 智慧教育平台客户端 |

### 4.2 学科网开放平台

| 项目 | 内容 |
|------|------|
| **URL** | https://open.xkw.com |
| **类型** | 商业 K12 教育资源开放平台 |
| **资源** | 超千万试题、试卷、视频资源 |
| **形式** | API、SDK、SaaS 多种模式 |
| **客户** | 中国移动、智谱 AI、vivo、佳能等 |

**特点：**
- 有完善的 API 文档和接入流程
- 提供试题、试卷、视频、教辅等资源
- 支持搜题、智能组卷、知识点标注等
- 已为数百家企业提供 3 年服务
- **缺点：** 商业平台，需要付费合作

**推荐指数：⭐⭐⭐⭐**（作为备选题库/教辅资源）

### 4.3 2020年疫情期间教材免费下载汇总

2020年教育部曾发布《中小学国家课程教材电子版链接》，汇总了各出版社的教材下载链接，包含：
- 人教社：http://bp.pep.com.cn/jc/
- 北师大出版社：http://www.100875.com.cn
- 外研社：http://k12.sflep.com
- 华东师大出版社：http://s.ecnupress.com.cn
- 及各地方出版社下载链接

**注意：** 这些链接可能已过期或不再维护，不能作为稳定来源依赖。

---

## 5. 用户上传文件技术方案

### 5.1 Flutter 端文件选择

#### 推荐方案：file_picker

```dart
import 'package:file_picker/file_picker.dart';

// 选择单个文件
FilePickerResult? result = await FilePicker.platform.pickFiles(
  type: FileType.custom,
  allowedExtensions: ['pdf', 'doc', 'docx', 'txt', 'jpg', 'png'],
  allowMultiple: false,  // 或 true 支持多选
);

if (result != null) {
  PlatformFile file = result.files.first;
  // file.path  - 文件路径
  // file.name  - 文件名
  // file.size  - 文件大小（字节）
  // file.extension - 文件扩展名
}
```

**特性：**
- 支持 Android / iOS / Linux / macOS / Windows / Web
- 支持文件类型过滤（`allowedExtensions`）
- 支持单选/多选
- 返回文件路径、名称、大小、扩展名等信息

#### 备选：dio + MultipartFile

```dart
import 'package:dio/dio.dart';

// 上传文件
FormData formData = FormData.fromMap({
  'file': await MultipartFile.fromFile(
    file.path,
    filename: file.name,
  ),
  'description': '用户上传的教材',
});

Response response = await Dio().post(
  'https://api.lingxi.com/upload',
  data: formData,
  onSendProgress: (int sent, int total) {
    // 上传进度回调
    print('$sent / $total');
  },
);
```

### 5.2 后端上传处理（Node.js）

#### 推荐：Multer（Express 中间件）

```javascript
const multer = require('multer');
const path = require('path');

// 存储配置
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');  // 临时存储目录
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

// 文件过滤
const fileFilter = (req, file, cb) => {
  const allowedMimes = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/jpeg',
    'image/png',
  ];
  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('不支持的文件类型'), false);
  }
};

// 上传中间件
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 50 * 1024 * 1024,  // 50MB 限制
    files: 5,  // 单次最多 5 个文件
  },
  fileFilter: fileFilter,
});
```

#### 文件校验流程

```
接收文件 → MIME 类型校验 → 文件扩展名校验 → 
文件大小校验 → 恶意文件扫描（ClamAV）→ 
PDF 完整性校验（pdf-parse 检查文件头）→ 
存储到持久化存储 → 写入数据库记录
```

#### 持久化存储方案

| 方案 | 优点 | 缺点 | 适用场景 |
|------|------|------|---------|
| **本地磁盘** | 简单、直接 | 扩展性差、备份难 | 开发/小规模 |
| **阿里云 OSS** | 高可用、CDN 加速 | 费用 | 生产环境推荐 |
| **腾讯云 COS** | 同 OSS | 费用 | 生产环境备选 |
| **MinIO（自建）** | 开源、S3 兼容 | 需要运维 | 自建部署 |
| **AWS S3** | 成熟稳定 | 境外访问延迟 | 海外部署 |

**推荐方案：** 阿里云 OSS（国内用户访问优）+ MinIO（本地缓存/开发环境）

### 5.3 异步处理队列

#### 推荐：BullMQ（基于 Redis）

```javascript
const { Queue, Worker } = require('bullmq');

const connection = {
  host: 'localhost',
  port: 6379,
};

// 文件处理队列
const fileQueue = new Queue('file-processing', { connection });

// 添加任务
await fileQueue.add('process-upload', {
  fileId: 'xxx',
  userId: 'ou_xxx',
  originalName: '数学教材.pdf',
  storagePath: '/uploads/xxx.pdf',
  size: 1024000,
}, {
  attempts: 3,                    // 重试次数
  backoff: { type: 'exponential', delay: 1000 },  // 指数退避
  removeOnComplete: { age: 3600 * 24 },  // 完成后保留 24h
});

// 工作进程
const worker = new Worker('file-processing', async (job) => {
  const { fileId, storagePath } = job.data;
  
  // 1. PDF 解析（提取页数、文本内容等）
  // 2. OCR 处理（如需要）
  // 3. 生成缩略图
  // 4. 更新数据库状态
  
  console.log(`处理文件 ${fileId} 完成`);
}, { connection, concurrency: 3 });  // 并发 3 个任务

worker.on('completed', (job) => {
  console.log(`任务 ${job.id} 完成`);
});

worker.on('failed', (job, err) => {
  console.error(`任务 ${job.id} 失败:`, err);
});
```

#### 队列设计

```
队列名称                  用途                    优先级
─────────────────────────────────────────────────────
file-processing           PDF 解析/OCR/缩略图   高
file-export               PDF 导出/合并          低
file-cleanup              临时文件清理           低
notification              上传完成通知          中
```

### 5.4 文件大小限制和并发控制

| 限制项 | 建议值 | 说明 |
|--------|--------|------|
| 单文件上限 | 50MB | 教材 PDF 通常 10-50MB |
| 单次上传数量 | 10 个 | 避免一次性大量上传 |
| 总上传限速 | 100MB/min | 基于用户粒度限流 |
| 并发上传数 | 3 个/用户 | 避免连接数耗尽 |
| 并发队列处理 | 3-5 个 Worker | 根据服务器资源调整 |
| 存储空间配额 | 500MB/用户 | 可弹性调整 |

#### 实现方案

```javascript
// 基于用户粒度的速率限制
const rateLimit = require('express-rate-limit');

const uploadLimiter = rateLimit({
  windowMs: 60 * 1000,  // 1 分钟
  max: 3,               // 最多 3 次上传
  keyGenerator: (req) => req.user.id,
  message: '上传过于频繁，请稍后再试',
});
```

---

## 6. 接入建议优先级

### 第一优先级：ChinaTextbook（开源缓存）

| 维度 | 评分 |
|------|------|
| 接入成本 | ⭐⭐⭐⭐⭐ |
| 内容覆盖 | ⭐⭐⭐⭐⭐ |
| 法律风险 | ⭐⭐⭐ |
| 稳定性 | ⭐⭐⭐ |

**建议：** `git clone` 到本地服务器，作为内部教材缓存。**不对外分发**，仅用于 AI 解析和内容索引。用户阅读时引导至官方平台。

### 第二优先级：国家中小学智慧教育平台

| 维度 | 评分 |
|------|------|
| 接入成本 | ⭐⭐⭐ |
| 内容覆盖 | ⭐⭐⭐⭐⭐ |
| 法律风险 | ⭐⭐⭐⭐ |
| 稳定性 | ⭐⭐⭐⭐ |

**建议：**
- 元数据层：使用公开数据接口获取教材列表（无需登录）
- 内容层：需要登录态才能下载，可作为后端代理服务
- 与 ChinaTextbook 互为补充（官方最新版 vs 开源缓存版）

### 第三优先级：人民教育出版社电子教材

| 维度 | 评分 |
|------|------|
| 接入成本 | ⭐⭐⭐ |
| 内容覆盖 | ⭐⭐⭐（仅人教版） |
| 法律风险 | ⭐⭐⭐ |
| 稳定性 | ⭐⭐⭐⭐⭐ |

**建议：**
- 仅做人教版教材的补充来源
- 页面跳转方式最稳妥
- 如需 PDF 离线，参考油猴脚本实现服务端 JPG→PDF 工具

### 第四优先级：学科网开放平台

| 维度 | 评分 |
|------|------|
| 接入成本 | ⭐⭐（需要商业合作） |
| 内容覆盖 | ⭐⭐⭐⭐（试题/教辅丰富） |
| 法律风险 | ⭐⭐⭐⭐⭐（合规） |
| 稳定性 | ⭐⭐⭐⭐⭐ |

**建议：** 作为题库和教辅资源的补充。如果产品需要「搜题」「智能组卷」等功能，这是最佳选择。

### 第五优先级：国家教育资源公共服务平台

**不建议作为主要来源。** 内容重叠且无 API。

---

## 附录：参考资料

### 开源工具
- [smartedu-dl-go](https://github.com/hantang/smartedu-dl-go) - Go 实现的智慧教育平台下载器
- [tchMaterial-parser](https://github.com/happycola233/tchMaterial-parser) - 教材解析工具
- [smartedu-download](https://github.com/52beijixing/smartedu-download) - Python 下载器
- [pep-pdf-download.user.js](https://gist.github.com/helloint/974a3598b19a99db5d251b0025bf1e90) - 人教社教材下载油猴脚本
- [ChinaTextbook](https://github.com/TapXWorld/ChinaTextbook) - 开源教材集合

### 技术博客
- [国家中小学智慧教育平台教材PDF下载爬虫 - 博客园](https://www.cnblogs.com/amnotgcs/p/17898415.html)
- [Greasyfork - 智慧教育平台电子课本下载脚本](https://greasyfork.org/zh-CN/scripts/461957)

### 官方平台
- https://basic.smartedu.cn - 国家中小学智慧教育平台
- https://book.pep.com.cn - 人教社电子教材
- https://www.pep.com.cn - 人民教育出版社
- https://www.eduyun.cn - 国家教育资源公共服务平台
- https://open.xkw.com - 学科网开放平台
- https://www.smartedu.cn - 国家智慧教育公共服务平台

---

*报告结束*