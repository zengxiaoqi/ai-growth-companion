# 诗词模块修复与完善 Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Fix search box visibility, add type-based search filtering, fix broken game backend/frontend data contracts, and polish all poetry game UIs with TTS integration and child-friendly design.

**Architecture:** The poetry module has a NestJS backend (poetry.service.ts + poetry-game.service.ts) serving a read-only 376K-poem SQLite DB, and a Flutter frontend (6 screens + poetry_service.dart). The core problem is a **complete data contract mismatch** between backend game APIs and frontend models — games are non-functional. We fix this by aligning the backend to produce the JSON shapes the frontend already expects, then add the missing UI features.

**Tech Stack:** NestJS + TypeORM + SQLite (backend), Flutter + Provider + Dio (frontend), GameTtsHelper mixin for voice feedback.

---

## Current Context

### Files involved

**Backend (NestJS):**
- `src/backend/src/modules/poetry/poetry.controller.ts` — search/list/random endpoints
- `src/backend/src/modules/poetry/poetry.service.ts` — search with searchType param
- `src/backend/src/modules/poetry/poetry-game.controller.ts` — game endpoints
- `src/backend/src/modules/poetry/poetry-game.service.ts` — game logic (generates wrong JSON shape)
- `src/backend/src/modules/poetry/entities/poem.entity.ts` — Poem entity
- `src/backend/test/unit/poetry.service.spec.ts` — existing tests
- `src/backend/test/unit/poetry-game.service.spec.ts` — existing tests (test wrong contract)

**Frontend (Flutter):**
- `src/frontend/lib/screens/poetry/poetry_home_screen.dart` — search box bug, no type filter
- `src/frontend/lib/screens/poetry/poetry_detail_screen.dart` — detail page
- `src/frontend/lib/screens/poetry/poetry_game_screen.dart` — game hub
- `src/frontend/lib/screens/poetry/fill_blank_game_screen.dart` — expects wrong JSON
- `src/frontend/lib/screens/poetry/flying_flower_game_screen.dart` — sends `keyword`, backend expects `char`
- `src/frontend/lib/screens/poetry/solitaire_game_screen.dart` — expects options[] + correctIndex
- `src/frontend/lib/services/poetry_service.dart` — data models + API calls
- `src/frontend/lib/screens/games/game_tts_helper.dart` — TTS mixin (not used by poetry games)
- `src/frontend/lib/theme/app_theme.dart` — app theme (transparent AppBar)

### Key findings from codebase exploration

1. **Search text invisible**: `poetry_home_screen.dart:146` — `style: TextStyle(color: Colors.white)` on a transparent AppBar (theme sets `backgroundColor: Colors.transparent`). White on light background = invisible.
2. **Search type not exposed**: Backend `poetry.service.ts:76` already supports `searchType` = title/content/author/all, but frontend `poetry_home_screen.dart:102` calls `searchPoems(query: query)` with no type — always 'all'. No dynasty or poem-type search either.
3. **Game data contract completely broken**:
   - FillBlank: Backend returns `{poemId, title, author, dynasty, fullContent, blankedContent, blanks: [{position, answer}]}`. Frontend expects `{poemId, title, authorName, dynastyName, lines: [], blankIndices: [], answers: [], candidates: [], appreciation}`.
   - FlyingFlower: Backend returns `{char, poems: [{id, title, author, line}]}`. Frontend expects `{keyword, entries: [{poemId, title, authorName, dynastyName, line, fullContent}]}`.
   - Solitaire: Backend returns `{poem: {id, title, author, dynasty}, prevLine, line}`. Frontend expects `{poemId, title, authorName, dynastyName, currentLine, options: [], correctIndex}`. **No options at all in backend!**
4. **Param name mismatch**: Frontend sends `keyword` (`poetry_service.dart:243`), backend expects `char` (`poetry-game.controller.ts:22`).
5. **Database has 13 poem types**: 其他(99370), 七言绝句(87073), 七言律诗(69546), 五言律诗(69227), 宋词(21374), 五言绝句(17929), 元曲(10890), 五代词(543), 诗经(305), 楚辞(65), 乐府诗(26), 论语(20), 四书五经(14). 7 dynasties: 五代, 元, 先秦, 唐, 宋, 清, 魏晋.

### Approach

Fix backend game service to produce the JSON shape the frontend already expects (avoid touching frontend models minimally). Then add search type filtering UI, fix the white text bug, integrate TTS, and polish UI.

---

## Task 1: Fix search box text color (white → visible)

**Objective:** Make search input text visible in the AppBar.

**Files:**
- Modify: `src/frontend/lib/screens/poetry/poetry_home_screen.dart:138-148`

**Step 1: Fix text and hint colors**

Replace the TextField in the AppBar:
```dart
// BEFORE (lines 138-148):
TextField(
  controller: _searchController,
  autofocus: true,
  decoration: const InputDecoration(
    hintText: '搜索诗词...',
    border: InputBorder.none,
    hintStyle: TextStyle(color: Colors.white70),
  ),
  style: const TextStyle(color: Colors.white),
  onChanged: _search,
)

// AFTER:
TextField(
  controller: _searchController,
  autofocus: true,
  decoration: InputDecoration(
    hintText: '搜索诗词...',
    border: InputBorder.none,
    hintStyle: TextStyle(color: Theme.of(context).colorScheme.onSurface.withOpacity(0.4)),
  ),
  style: TextStyle(color: Theme.of(context).colorScheme.onSurface),
  onChanged: (value) {
    _search(value, _selectedSearchType);
  },
)
```

**Step 2: Verify build**
Run: `cd src/frontend && flutter analyze lib/screens/poetry/poetry_home_screen.dart`
Expected: No errors

**Step 3: Commit**
```bash
git add src/frontend/lib/screens/poetry/poetry_home_screen.dart
git commit -m "fix: poetry search box text color invisible on transparent AppBar"
```

---

## Task 2: Add search type filter to backend (dynasty + poem_type)

**Objective:** Backend search supports searching by dynasty name and poem type (体裁).

**Files:**
- Modify: `src/backend/src/modules/poetry/poetry.service.ts:76-106`
- Modify: `src/backend/src/modules/poetry/poetry.controller.ts:31-39`
- Test: `src/backend/test/unit/poetry.service.spec.ts`

**Step 1: Add dynasty and type search branches**

In `poetry.service.ts`, update the `search` method:
```typescript
// Add after the 'author' branch (line 87):
} else if (searchType === 'dynasty') {
  qb.where('dynasty.name LIKE :query', { query: `%${query}%` });
} else if (searchType === 'poem_type') {
  qb.where('poem.type LIKE :query', { query: `%${query}%` });
}
```

**Step 2: Add endpoint to get distinct poem types**

In `poetry.controller.ts`, add before the `:id` route:
```typescript
// 获取诗词体裁列表
@Get('types')
async findTypes() {
  return this.poetryService.findTypes();
}
```

In `poetry.service.ts`, add method:
```typescript
// 获取所有诗词体裁
async findTypes() {
  const result = await this.poemRepository
    .createQueryBuilder('poem')
    .select('poem.type', 'type')
    .addSelect('COUNT(*)', 'count')
    .where('poem.type IS NOT NULL')
    .groupBy('poem.type')
    .orderBy('count', 'DESC')
    .getRawMany();
  return result;
}
```

**Step 3: Add frontend service method for types**

In `poetry_service.dart`, add to `PoetryService`:
```dart
/// 获取诗词体裁列表
Future<List<Map<String, dynamic>>> getTypes() async {
  try {
    final response = await _apiService.dio.get('/poetry/types');
    return (response.data as List)
        .map((e) => Map<String, dynamic>.from(e))
        .toList();
  } catch (e) {
    _log.severe('获取诗词体裁列表失败: $e');
    rethrow;
  }
}
```

**Step 4: Update frontend search to pass searchType**

In `poetry_home_screen.dart`, update `_search` to accept searchType:
```dart
// State fields:
String _selectedSearchType = 'all'; // all, title, content, author, dynasty, poem_type

Future<void> _search(String query, String searchType) async {
  if (query.isEmpty) {
    setState(() {
      _isSearching = false;
      _searchResults = [];
    });
    return;
  }
  setState(() => _isSearching = true);
  try {
    final result = await _poetryService.searchPoems(query: query, searchType: searchType);
    setState(() => _searchResults = result.list);
  } catch (e) {
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('搜索失败: $e')),
      );
    }
  }
}
```

Update the `onChanged` callback in the TextField to pass `_selectedSearchType`.

**Step 5: Write failing test for dynasty/poem_type search**

In `poetry.service.spec.ts`, add to the `describe('search')` block:
```typescript
it('should search by dynasty name', async () => {
  await service.search('唐', 'dynasty');
  expect(qbChain.where).toHaveBeenCalledWith('dynasty.name LIKE :query', {
    query: '%唐%',
  });
});

it('should search by poem type', async () => {
  await service.search('五言', 'poem_type');
  expect(qbChain.where).toHaveBeenCalledWith('poem.type LIKE :query', {
    query: '%五言%',
  });
});
```

**Step 6: Run tests**
Run: `cd src/backend && npx jest --testPathPattern poetry.service.spec --verbose`
Expected: All search tests pass

**Step 7: Commit**
```bash
git add src/backend/src/modules/poetry/poetry.service.ts src/backend/src/modules/poetry/poetry.controller.ts src/backend/test/unit/poetry.service.spec.ts src/frontend/lib/services/poetry_service.dart
git commit -m "feat: add dynasty and poem_type search + types endpoint"
```

---

## Task 3: Add search type filter UI (dropdown chips)

**Objective:** User can pick search type (全部/标题/内容/作者/朝代/体裁) from a chip row.

**Files:**
- Modify: `src/frontend/lib/screens/poetry/poetry_home_screen.dart`

**Step 1: Add search type state and chip row**

In `_PoetryHomeScreenState`, add:
```dart
final List<MapEntry<String, String>> _searchTypes = [
  MapEntry('all', '全部'),
  MapEntry('title', '标题'),
  MapEntry('content', '内容'),
  MapEntry('author', '作者'),
  MapEntry('dynasty', '朝代'),
  MapEntry('poem_type', '体裁'),
];
```

**Step 2: Build search type selector**

When `_isSearching` is true, show a horizontal chip row below the AppBar:
```dart
// In build(), wrap body in Column:
if (_isSearching)
  Container(
    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
    child: SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Row(
        children: _searchTypes.map((entry) {
          final isSelected = _selectedSearchType == entry.key;
          return Padding(
            padding: const EdgeInsets.only(right: 8),
            child: FilterChip(
              label: Text(entry.value),
              selected: isSelected,
              onSelected: (selected) {
                if (selected) {
                  setState(() => _selectedSearchType = entry.key);
                  if (_searchController.text.isNotEmpty) {
                    _search(_searchController.text, entry.key);
                  }
                }
              },
            ),
          );
        }).toList(),
      ),
    ),
  ),
```

**Step 3: Verify build**
Run: `cd src/frontend && flutter analyze lib/screens/poetry/poetry_home_screen.dart`
Expected: No errors

**Step 4: Commit**
```bash
git add src/frontend/lib/screens/poetry/poetry_home_screen.dart
git commit -m "feat: add search type filter chips to poetry home"
```

---

## Task 4: Fix backend fill-blank game to match frontend contract

**Objective:** Backend `generateFillBlank` returns JSON shape that `FillBlankGame.fromJson` expects.

**Files:**
- Modify: `src/backend/src/modules/poetry/poetry-game.service.ts:39-101`
- Modify: `src/backend/src/modules/poetry/poetry-game.controller.ts:13`
- Test: `src/backend/test/unit/poetry-game.service.spec.ts`

**Frontend expects (from `FillBlankGame.fromJson`):**
```json
{
  "poemId": 1,
  "title": "静夜思",
  "authorName": "李白",
  "dynastyName": "唐",
  "lines": ["床前明月光", "疑是地上霜", "举头望明月", "低头思故乡"],
  "blankIndices": [2, 7, 12, 17],
  "answers": ["明", "地", "明", "故"],
  "candidates": ["明", "地", "故", "霜", "月", "光"],
  "appreciation": null
}
```

**Step 1: Rewrite `generateFillBlank` method**

In `poetry-game.service.ts`:
```typescript
async generateFillBlank(difficulty: 'easy' | 'medium' | 'hard' = 'medium') {
  // Retry up to 3 times to find a poem with enough content
  for (let attempt = 0; attempt < 3; attempt++) {
    const poem = await this.poemRepository
      .createQueryBuilder('poem')
      .leftJoinAndSelect('poem.author', 'author')
      .leftJoinAndSelect('poem.dynasty', 'dynasty')
      .orderBy('RANDOM()')
      .limit(1)
      .getOne();

    if (!poem) return null;

    const lines = poem.content.split('\n').filter((l) => l.trim());
    // Flatten content to get char positions across lines
    const allChars: { lineIdx: number; charIdx: number; char: string; globalIdx: number }[] = [];
    let globalIdx = 0;
    for (let li = 0; li < lines.length; li++) {
      for (let ci = 0; ci < lines[li].length; ci++) {
        const ch = lines[li][ci];
        if (/[\u4e00-\u9fa5]/.test(ch)) {
          allChars.push({ lineIdx: li, charIdx: ci, char: ch, globalIdx: globalIdx });
        }
        globalIdx++;
      }
      globalIdx++; // for newline
    }

    if (allChars.length < 5) continue;

    const blankCount = difficulty === 'easy' ? 2 : difficulty === 'medium' ? 3 : 5;
    const actualBlankCount = Math.min(blankCount, Math.floor(allChars.length / 3));

    // Randomly select positions
    const shuffled = [...allChars].sort(() => Math.random() - 0.5);
    const selected = shuffled.slice(0, actualBlankCount).sort((a, b) => a.globalIdx - b.globalIdx);

    const blankIndices = selected.map(s => s.globalIdx);
    const answers = selected.map(s => s.char);

    // Generate candidates: answers + distractors from the poem
    const distractors = allChars
      .filter(c => !selected.includes(c))
      .sort(() => Math.random() - 0.5)
      .slice(0, Math.max(3, answers.length))
      .map(c => c.char);
    const candidates = [...new Set([...answers, ...distractors])]
      .sort(() => Math.random() - 0.5);

    return {
      poemId: poem.id,
      title: poem.title,
      authorName: poem.author?.name || '佚名',
      dynastyName: poem.dynasty?.name || '',
      lines,
      blankIndices,
      answers,
      candidates,
      appreciation: null as string | null,
    };
  }
  return null;
}
```

**Step 2: Add difficulty query param support**

In `poetry-game.controller.ts`, update:
```typescript
@Get('fill-blank')
async getFillBlank(@Query('difficulty') difficulty: 'easy' | 'medium' | 'hard' = 'medium') {
  return this.gameService.generateFillBlank(difficulty);
}
```
(Already correct — just verifying.)

**Step 3: Update backend tests**

Rewrite the fill-blank tests in `poetry-game.service.spec.ts` to match the new contract:
```typescript
it('should generate a fill-blank question matching frontend contract', async () => {
  const result = await service.generateFillBlank('medium');
  expect(result).not.toBeNull();
  expect(result.poemId).toBe(1);
  expect(result.title).toBe('静夜思');
  expect(result.authorName).toBe('李白');
  expect(result.dynastyName).toBe('唐');
  expect(result.lines).toBeDefined();
  expect(result.lines.length).toBeGreaterThan(0);
  expect(result.blankIndices).toBeDefined();
  expect(result.blankIndices.length).toBeGreaterThan(0);
  expect(result.answers).toBeDefined();
  expect(result.answers.length).toBe(result.blankIndices.length);
  expect(result.candidates).toBeDefined();
  expect(result.candidates.length).toBeGreaterThanOrEqual(result.answers.length);
});

it('should have all answers present in candidates', async () => {
  const result = await service.generateFillBlank('easy');
  result.answers.forEach((answer: string) => {
    expect(result.candidates).toContain(answer);
  });
});

it('should hide 2 characters on easy', async () => {
  const result = await service.generateFillBlank('easy');
  expect(result.blankIndices.length).toBe(2);
});
```

**Step 4: Run tests**
Run: `cd src/backend && npx jest --testPathPattern poetry-game.service.spec --verbose`
Expected: All tests pass

**Step 5: Commit**
```bash
git add src/backend/src/modules/poetry/poetry-game.service.ts src/backend/test/unit/poetry-game.service.spec.ts
git commit -m "fix: align fill-blank game backend contract with frontend model"
```

---

## Task 5: Fix backend flying-flower game to match frontend contract

**Objective:** Backend `getFlyingFlower` returns JSON shape that `FlyingFlowerGame.fromJson` expects, and controller accepts `keyword` param.

**Files:**
- Modify: `src/backend/src/modules/poetry/poetry-game.service.ts:106-139`
- Modify: `src/backend/src/modules/poetry/poetry-game.controller.ts:21-24`
- Test: `src/backend/test/unit/poetry-game.service.spec.ts`

**Frontend expects (from `FlyingFlowerGame.fromJson`):**
```json
{
  "keyword": "月",
  "entries": [
    {
      "poemId": 1,
      "title": "静夜思",
      "authorName": "李白",
      "dynastyName": "唐",
      "line": "床前明月光",
      "fullContent": "床前明月光\n疑是地上霜\n举头望明月\n低头思故乡"
    }
  ]
}
```

**Step 1: Fix controller param name**

In `poetry-game.controller.ts`:
```typescript
@Get('flying-flower')
async getFlyingFlower(@Query('keyword') keyword?: string) {
  return this.gameService.getFlyingFlower(keyword);
}
```

**Step 2: Rewrite `getFlyingFlower` method**

In `poetry-game.service.ts`:
```typescript
async getFlyingFlower(keyword?: string) {
  const commonChars = ['月', '花', '风', '雪', '春', '秋', '山', '水', '云', '雨', '日', '夜'];
  const targetChar = keyword || commonChars[Math.floor(Math.random() * commonChars.length)];

  const poems = await this.poemRepository
    .createQueryBuilder('poem')
    .leftJoinAndSelect('poem.author', 'author')
    .leftJoinAndSelect('poem.dynasty', 'dynasty')
    .where('poem.content LIKE :char', { char: `%${targetChar}%` })
    .orderBy('RANDOM()')
    .limit(10)
    .getMany();

  if (poems.length === 0) return null;

  const entries = poems.map((poem) => {
    const lines = poem.content.split('\n').filter((l) => l.trim());
    const matchingLine = lines.find((line) => line.includes(targetChar)) || lines[0];
    return {
      poemId: poem.id,
      title: poem.title,
      authorName: poem.author?.name || '佚名',
      dynastyName: poem.dynasty?.name || '',
      line: matchingLine,
      fullContent: poem.content,
    };
  });

  return {
    keyword: targetChar,
    entries,
  };
}
```

**Step 3: Update backend tests**

```typescript
describe('getFlyingFlower', () => {
  beforeEach(() => {
    qbChain.getMany.mockResolvedValue([mockPoem]);
    qbChain.leftJoinAndSelect.mockReturnThis();
    qbChain.where.mockReturnThis();
    qbChain.orderBy.mockReturnThis();
    qbChain.limit.mockReturnThis();
  });

  it('should return entries matching frontend contract', async () => {
    const result = await service.getFlyingFlower('月');
    expect(result).not.toBeNull();
    expect(result.keyword).toBe('月');
    expect(result.entries).toBeDefined();
    expect(result.entries.length).toBe(1);
    expect(result.entries[0].poemId).toBe(1);
    expect(result.entries[0].title).toBe('静夜思');
    expect(result.entries[0].authorName).toBe('李白');
    expect(result.entries[0].dynastyName).toBe('唐');
    expect(result.entries[0].line).toContain('月');
    expect(result.entries[0].fullContent).toBeDefined();
  });
});
```

**Step 4: Run tests**
Run: `cd src/backend && npx jest --testPathPattern poetry-game.service.spec --verbose`
Expected: All tests pass

**Step 5: Commit**
```bash
git add src/backend/src/modules/poetry/poetry-game.service.ts src/backend/src/modules/poetry/poetry-game.controller.ts src/backend/test/unit/poetry-game.service.spec.ts
git commit -m "fix: align flying-flower game backend contract + fix keyword param"
```

---

## Task 6: Fix backend solitaire game to match frontend contract

**Objective:** Backend `getSolitaire` returns JSON shape that `SolitaireGame.fromJson` expects — with options[] and correctIndex.

**Files:**
- Modify: `src/backend/src/modules/poetry/poetry-game.service.ts:144-173`
- Test: `src/backend/test/unit/poetry-game.service.spec.ts`

**Frontend expects (from `SolitaireGame.fromJson`):**
```json
{
  "poemId": 1,
  "title": "静夜思",
  "authorName": "李白",
  "dynastyName": "唐",
  "currentLine": "床前明月光",
  "options": ["疑是地上霜", "wrong option 1", "wrong option 2", "wrong option 3"],
  "correctIndex": 0
}
```

**Step 1: Rewrite `getSolitaire` method**

In `poetry-game.service.ts`:
```typescript
async getSolitaire(lastChar?: string) {
  // Get a random poem with at least 2 lines
  let poem: Poem | null = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    let query = this.poemRepository
      .createQueryBuilder('poem')
      .leftJoinAndSelect('poem.author', 'author')
      .leftJoinAndSelect('poem.dynasty', 'dynasty');

    if (lastChar) {
      query = query.where('poem.content LIKE :char', { char: `${lastChar}%` });
    }

    const candidate = await query.orderBy('RANDOM()').limit(1).getOne();
    if (candidate) {
      const lines = candidate.content.split('\n').filter((l) => l.trim());
      if (lines.length >= 2) {
        poem = candidate;
        break;
      }
    }
  }

  if (!poem) return null;

  const lines = poem.content.split('\n').filter((l) => l.trim());
  const firstLine = lines[0];
  const secondLine = lines[1];

  // Generate 3 wrong options from other random poems
  const wrongPoems = await this.poemRepository
    .createQueryBuilder('poem')
    .where('poem.id != :id', { id: poem.id })
    .orderBy('RANDOM()')
    .limit(5)
    .getMany();

  const wrongOptions: string[] = [];
  for (const wp of wrongPoems) {
    const wpLines = wp.content.split('\n').filter((l) => l.trim());
    if (wpLines.length > 0) {
      // Pick a random line that's not the same as the correct answer
      const candidateLine = wpLines[Math.floor(Math.random() * wpLines.length)];
      if (candidateLine !== secondLine && !wrongOptions.includes(candidateLine)) {
        wrongOptions.push(candidateLine);
      }
      if (wrongOptions.length >= 3) break;
    }
  }

  // If we couldn't get enough wrong options, skip
  if (wrongOptions.length < 3) return null;

  // Shuffle options
  const options = [secondLine, ...wrongOptions].sort(() => Math.random() - 0.5);
  const correctIndex = options.indexOf(secondLine);

  return {
    poemId: poem.id,
    title: poem.title,
    authorName: poem.author?.name || '佚名',
    dynastyName: poem.dynasty?.name || '',
    currentLine: firstLine,
    options,
    correctIndex,
  };
}
```

**Step 2: Update backend tests**

```typescript
describe('getSolitaire', () => {
  beforeEach(() => {
    qbChain.getOne.mockResolvedValue(mockPoem);
    qbChain.getMany.mockResolvedValue([]);
    qbChain.leftJoinAndSelect.mockReturnThis();
    qbChain.where.mockReturnThis();
    qbChain.andWhere.mockReturnThis();
    qbChain.orderBy.mockReturnThis();
    qbChain.limit.mockReturnThis();
  });

  it('should return solitaire matching frontend contract', async () => {
    // Need wrong poems for distractors
    const wrongPoems = [
      { id: 2, content: '春眠不觉晓\n处处闻啼鸟', author: null, dynasty: null, title: '春晓' } as Poem,
      { id: 3, content: '白日依山尽\n黄河入海流', author: null, dynasty: null, title: '登鹳雀楼' } as Poem,
      { id: 4, content: '红豆生南国\n春来发几枝', author: null, dynasty: null, title: '相思' } as Poem,
    ];
    // First getOne returns our poem, then getMany returns wrong poems
    qbChain.getOne.mockResolvedValueOnce(mockPoem);
    qbChain.getMany.mockResolvedValueOnce(wrongPoems);

    const result = await service.getSolitaire();
    expect(result).not.toBeNull();
    expect(result.poemId).toBe(1);
    expect(result.title).toBe('静夜思');
    expect(result.authorName).toBe('李白');
    expect(result.dynastyName).toBe('唐');
    expect(result.currentLine).toBe('床前明月光');
    expect(result.options).toBeDefined();
    expect(result.options.length).toBe(4);
    expect(result.options).toContain('疑是地上霜');
    expect(result.correctIndex).toBeGreaterThanOrEqual(0);
    expect(result.correctIndex).toBeLessThan(4);
    expect(result.options[result.correctIndex]).toBe('疑是地上霜');
  });
});
```

**Step 3: Run tests**
Run: `cd src/backend && npx jest --testPathPattern poetry-game.service.spec --verbose`
Expected: All tests pass

**Step 4: Commit**
```bash
git add src/backend/src/modules/poetry/poetry-game.service.ts src/backend/test/unit/poetry-game.service.spec.ts
git commit -m "fix: align solitaire game backend contract with options + correctIndex"
```

---

## Task 7: Integrate GameTtsHelper into fill-blank game screen

**Objective:** Add voice feedback to the fill-blank game.

**Files:**
- Modify: `src/frontend/lib/screens/poetry/fill_blank_game_screen.dart`

**Step 1: Add TTS mixin**

```dart
import '../../screens/games/game_tts_helper.dart';

class _FillBlankGameScreenState extends State<FillBlankGameScreen>
    with SingleTickerProviderStateMixin, GameTtsHelper {

  @override
  void dispose() {
    disposeTts();
    _controller.dispose();
    super.dispose();
  }
```

**Step 2: Speak on game load and answer**

In `_loadGame` after setting `_game`:
```dart
Future.microtask(() => speak('填字游戏，选择正确的字填入空白处'));
```

In `_checkAnswer`, after setting state:
```dart
if (isCorrect) {
  Future.microtask(() => speak('答对了！'));
} else {
  Future.microtask(() => speak('答错了，再试一次'));
}
```

In `_buildCompletionCard`:
```dart
// Speak the score
Future.microtask(() => speak('完成！答对${correct}题，共${total}题'));
```

**Step 3: Add TTS toggle button to AppBar actions**
```dart
actions: [
  buildTtsToggleButton(),
  IconButton(
    icon: const Icon(Icons.refresh),
    onPressed: _loadGame,
    tooltip: '换一题',
  ),
],
```

**Step 4: Verify build**
Run: `cd src/frontend && flutter analyze lib/screens/poetry/fill_blank_game_screen.dart`
Expected: No errors

**Step 5: Commit**
```bash
git add src/frontend/lib/screens/poetry/fill_blank_game_screen.dart
git commit -m "feat: add TTS voice feedback to fill-blank game"
```

---

## Task 8: Integrate GameTtsHelper into solitaire game screen

**Objective:** Add voice feedback to the solitaire game.

**Files:**
- Modify: `src/frontend/lib/screens/poetry/solitaire_game_screen.dart`

**Step 1: Add TTS mixin**

```dart
import '../../screens/games/game_tts_helper.dart';

class _SolitaireGameScreenState extends State<SolitaireGameScreen>
    with SingleTickerProviderStateMixin, GameTtsHelper {

  @override
  void dispose() {
    disposeTts();
    _controller.dispose();
    super.dispose();
  }
```

**Step 2: Speak current line on load**

In `_loadGame`, after setting `_game`:
```dart
Future.microtask(() => speak('请接下一句：${_game!.currentLine}'));
```

**Step 3: Speak on answer selection**

In `_selectOption`:
```dart
if (index == _game!.correctIndex) {
  Future.microtask(() => speak('答对了！正确答案是：${_game!.options[_game!.correctIndex]}'));
} else {
  Future.microtask(() => speak('答错了，正确答案是：${_game!.options[_game!.correctIndex]}'));
}
```

**Step 4: Add TTS toggle to AppBar**

Replace the score/actions row:
```dart
actions: [
  buildTtsToggleButton(),
  // existing score display...
  IconButton(
    icon: const Icon(Icons.refresh),
    onPressed: _loadGame,
    tooltip: '换一题',
  ),
],
```

**Step 5: Verify build**
Run: `cd src/frontend && flutter analyze lib/screens/poetry/solitaire_game_screen.dart`
Expected: No errors

**Step 6: Commit**
```bash
git add src/frontend/lib/screens/poetry/solitaire_game_screen.dart
git commit -m "feat: add TTS voice feedback to solitaire game"
```

---

## Task 9: Integrate GameTtsHelper into flying-flower game screen

**Objective:** Add voice feedback to the flying-flower game.

**Files:**
- Modify: `src/frontend/lib/screens/poetry/flying_flower_game_screen.dart`

**Step 1: Add TTS mixin**

```dart
import '../../screens/games/game_tts_helper.dart';

class _FlyingFlowerGameScreenState extends State<FlyingFlowerGameScreen>
    with SingleTickerProviderStateMixin, GameTtsHelper {

  @override
  void dispose() {
    disposeTts();
    _controller.dispose();
    _keywordController.dispose();
    super.dispose();
  }
```

**Step 2: Speak results**

In `_search`, after setting `_game`:
```dart
if (_game != null && _game!.entries.isNotEmpty) {
  Future.microtask(() => speak('找到${_game!.entries.length}首包含"${_game!.keyword}"的诗词'));
}
```

**Step 3: Add TTS toggle to AppBar**
```dart
appBar: AppBar(
  title: const Text('飞花令'),
  backgroundColor: const Color(0xFF6A1B9A),
  foregroundColor: Colors.white,
  elevation: 0,
  actions: [
    buildTtsToggleButton(),
  ],
),
```

**Step 4: Verify build**
Run: `cd src/frontend && flutter analyze lib/screens/poetry/flying_flower_game_screen.dart`
Expected: No errors

**Step 5: Commit**
```bash
git add src/frontend/lib/screens/poetry/flying_flower_game_screen.dart
git commit -m "feat: add TTS voice feedback to flying-flower game"
```

---

## Task 10: Add difficulty selector to fill-blank game

**Objective:** User can pick easy/medium/hard difficulty.

**Files:**
- Modify: `src/frontend/lib/screens/poetry/fill_blank_game_screen.dart`
- Modify: `src/frontend/lib/services/poetry_service.dart` (add difficulty param)

**Step 1: Add difficulty param to service**

In `poetry_service.dart`, update `fetchFillBlankGame`:
```dart
Future<FillBlankGame> fetchFillBlankGame({String difficulty = 'medium'}) async {
  try {
    final response = await _apiService.dio.get(
      '/poetry/game/fill-blank',
      queryParameters: {'difficulty': difficulty},
    );
    return FillBlankGame.fromJson(response.data);
  } catch (e) {
    _log.severe('获取填字游戏失败: $e');
    rethrow;
  }
}
```

**Step 2: Add difficulty state and selector UI**

In `_FillBlankGameScreenState`:
```dart
String _difficulty = 'medium';

// In AppBar actions or as a dropdown below the title:
PopupMenuButton<String>(
  icon: const Icon(Icons.tune),
  tooltip: '难度',
  onSelected: (value) {
    setState(() => _difficulty = value);
    _loadGame();
  },
  itemBuilder: (context) => [
    const PopupMenuItem(value: 'easy', child: Text('简单 (2空)')),
    const PopupMenuItem(value: 'medium', child: Text('中等 (3空)')),
    const PopupMenuItem(value: 'hard', child: Text('困难 (5空)')),
  ],
),
```

**Step 3: Pass difficulty to loadGame**

```dart
final game = await _poetryService.fetchFillBlankGame(difficulty: _difficulty);
```

**Step 4: Verify build**
Run: `cd src/frontend && flutter analyze lib/screens/poetry/fill_blank_game_screen.dart`
Expected: No errors

**Step 5: Commit**
```bash
git add src/frontend/lib/screens/poetry/fill_blank_game_screen.dart src/frontend/lib/services/poetry_service.dart
git commit -m "feat: add difficulty selector to fill-blank game"
```

---

## Task 11: Polish poetry home screen with search type chips and UI improvements

**Objective:** Apply child-friendly design from app_theme to poetry home, use consistent styling.

**Files:**
- Modify: `src/frontend/lib/screens/poetry/poetry_home_screen.dart`

**Step 1: Apply themed colors to poem cards**

Use `AppTheme` colors for the poem card type badge:
```dart
// Replace hardcoded colorScheme references with AppTheme-aware styling:
Container(
  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
  decoration: BoxDecoration(
    color: const Color(0xFF7EC8E3).withOpacity(0.15), // soft blue
    borderRadius: BorderRadius.circular(12),
  ),
  child: Text(
    poem.type ?? '',
    style: const TextStyle(fontSize: 12, color: Color(0xFF1565C0)),
  ),
),
```

**Step 2: Add dynasty badge to poem cards**

Show dynasty as a colored chip:
```dart
if (poem.dynasty != null)
  Container(
    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
    decoration: BoxDecoration(
      color: const Color(0xFFFFB6C1).withOpacity(0.2),
      borderRadius: BorderRadius.circular(8),
    ),
    child: Text(
      poem.dynasty!.name,
      style: const TextStyle(fontSize: 11, color: Color(0xFF8B2500)),
    ),
  ),
```

**Step 3: Verify build**
Run: `cd src/frontend && flutter analyze lib/screens/poetry/poetry_home_screen.dart`
Expected: No errors

**Step 4: Commit**
```bash
git add src/frontend/lib/screens/poetry/poetry_home_screen.dart
git commit -m "feat: polish poetry home with themed cards and dynasty badges"
```

---

## Task 12: Verify end-to-end with backend + frontend build

**Objective:** All changes work together, backend tests pass, Flutter builds.

**Step 1: Run backend tests**
Run: `cd src/backend && npx jest --testPathPattern poetry --verbose`
Expected: All poetry tests pass

**Step 2: Run flutter analyze**
Run: `cd src/frontend && flutter analyze lib/screens/poetry/ lib/services/poetry_service.dart`
Expected: No errors

**Step 3: Restart backend and test API**
Run: `sudo systemctl restart lingxi-backend && sleep 3 && curl -s http://localhost:3001/api/poetry/game/fill-blank?difficulty=easy | python3 -m json.tool | head -20`
Expected: JSON with `poemId`, `lines`, `blankIndices`, `answers`, `candidates` fields

Run: `curl -s "http://localhost:3001/api/poetry/game/flying-flower?keyword=月" | python3 -m json.tool | head -20`
Expected: JSON with `keyword`, `entries` fields

Run: `curl -s http://localhost:3001/api/poetry/game/solitaire | python3 -m json.tool | head -20`
Expected: JSON with `currentLine`, `options`, `correctIndex` fields

Run: `curl -s "http://localhost:3001/api/poetry/search?q=唐&type=dynasty" | python3 -m json.tool | head -5`
Expected: Search results filtered by dynasty

Run: `curl -s http://localhost:3001/api/poetry/types | python3 -m json.tool`
Expected: List of poem types with counts

**Step 4: Build Flutter Web**
Run: `cd src/frontend && flutter build web`
Expected: Build succeeds

**Step 5: Commit any remaining fixes**
```bash
git add -A
git commit -m "test: verify end-to-end poetry module fixes"
```

---

## Risks & Tradeoffs

1. **Backend game tests need complete rewrite** — The existing tests test the old (wrong) contract. We must rewrite them to match the new contract. This is expected, not a regression.
2. **Solitaire wrong options may be limited** — If the DB returns too few poems with ≥2 lines, `getSolitaire` may return null. The retry loop (5 attempts) mitigates this, but on very small result sets it could fail. Acceptable for 376K poems.
3. **`withOpacity` deprecation** — Flutter 3.41 deprecates `withOpacity()` in favor of `withValues(alpha:)`. The existing code already uses `withOpacity` in many places. We keep consistency but may need to migrate later.
4. **TTS on Web** — `TtsService` uses Edge TTS via backend. On Flutter Web (Safari), TTS may behave differently. Need to verify in actual deployment, but the mixin handles failures gracefully.

## Open Questions

1. Should the search type chips persist across searches (remember last selection)? → Yes, current plan keeps `_selectedSearchType` in state.
2. Should game scores be persisted to backend? → Not in this plan scope. Can add later via reward/points module integration.
3. Should difficulty be selectable for solitaire too? → Not currently — solitaire difficulty is implicit in the poem randomness. Can add later.
