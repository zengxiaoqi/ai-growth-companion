/**
 * A minimal 3-4 years old counting game used as the reviewed static build.
 * It never touches the network, storage, cookies or parent DOM.
 * The only way out is window.LingxiGame.complete() provided by the fixed bridge.
 */
(function () {
  'use strict';

  var ROUNDS = [3, 5, 4];
  var BUBBLE_COUNT = 8;
  var state = {
    session: null,
    round: 0,
    lit: 0,
    correct: 0,
    totalErrors: 0,
    roundErrors: 0,
    startedAt: 0,
    locked: false,
    autoplay: false,
    done: false,
    results: []
  };
  var el = {};

  function byId(id) { return document.getElementById(id); }

  function init(detail) {
    el.prompt = byId('prompt');
    el.board = byId('board');
    el.feedback = byId('feedback');
    el.step = byId('step');
    el.count = byId('count');
    state.session = detail || {};
    state.startedAt = Date.now();
    /* PoC-only hook: lets headless Chromium finish the game without a human click. */
    state.autoplay = /[?&]autoplay=1/.test(window.location.search);
    renderRound();
    if (state.autoplay) setTimeout(autoplayStep, 40);
  }

  function autoplayStep() {
    if (!state.autoplay || state.done) return;
    if (!state.locked) {
      var buttons = el.board.querySelectorAll('button.bubble');
      for (var i = 0; i < buttons.length; i++) {
        if (!buttons[i].disabled && buttons[i].textContent === '★') {
          buttons[i].click();
          break;
        }
      }
    }
    setTimeout(autoplayStep, 40);
  }

  function starIndexes(target) {
    var all = [];
    var i;
    for (i = 0; i < BUBBLE_COUNT; i++) all.push(i);
    for (i = all.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = all[i];
      all[i] = all[j];
      all[j] = tmp;
    }
    return all.slice(0, target);
  }

  function renderRound() {
    var target = ROUNDS[state.round];
    var stars = {};
    starIndexes(target).forEach(function (i) { stars[i] = true; });

    state.lit = 0;
    state.roundErrors = 0;
    state.locked = false;
    el.prompt.textContent = '请点亮 ' + target + ' 颗星星泡泡';
    el.step.textContent = '第 ' + (state.round + 1) + ' 关 / 共 ' + ROUNDS.length + ' 关';
    el.count.textContent = '已点亮 0 个';
    el.feedback.textContent = '';
    el.board.textContent = '';

    for (var i = 0; i < BUBBLE_COUNT; i++) {
      var isStar = Boolean(stars[i]);
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'bubble';
      btn.textContent = isStar ? '★' : '○';
      btn.setAttribute('aria-label', isStar ? '星星泡泡' : '普通泡泡');
      btn.addEventListener('click', (function (node, star) {
        return function () { onBubble(node, star); };
      })(btn, isStar));
      el.board.appendChild(btn);
    }
  }

  function onBubble(node, isStar) {
    if (state.locked || node.disabled) return;
    if (isStar) {
      node.disabled = true;
      node.classList.add('lit');
      state.lit += 1;
      el.count.textContent = '已点亮 ' + state.lit + ' 个';
      if (state.lit >= ROUNDS[state.round]) finishRound();
      return;
    }
    state.roundErrors += 1;
    state.totalErrors += 1;
    node.classList.add('shake');
    el.feedback.textContent = '这个不是星星泡泡，再找找看';
    setTimeout(function () { node.classList.remove('shake'); }, 400);
  }

  function finishRound() {
    state.locked = true;
    var clean = state.roundErrors === 0;
    if (clean) state.correct += 1;
    state.results.push({
      round: state.round + 1,
      target: ROUNDS[state.round],
      errors: state.roundErrors,
      clean: clean
    });
    el.feedback.textContent = clean ? '太棒了，全部找对！' : '完成啦，下一关继续加油';
    window.LingxiGame.progress({
      correctAnswers: state.correct,
      totalQuestions: ROUNDS.length
    });
    setTimeout(function () {
      state.round += 1;
      if (state.round < ROUNDS.length) renderRound();
      else complete();
    }, 900);
  }

  function complete() {
    state.done = true;
    var total = ROUNDS.length;
    var score = Math.round((state.correct / total) * 100);
    window.LingxiGame.complete({
      score: score,
      correctAnswers: state.correct,
      totalQuestions: total,
      timeSpent: Math.round((Date.now() - state.startedAt) / 1000),
      interactionData: {
        buildUuid: 'count-bubbles',
        version: 1,
        bridgeHash: state.session.bridgeHash || null,
        ageGroup: '3-4',
        domain: 'math',
        totalErrors: state.totalErrors,
        rounds: state.results
      }
    });
    el.prompt.textContent = '全部完成！';
    el.board.textContent = '';
    el.count.textContent = '已点亮 ' + state.lit + ' 个';
    el.feedback.textContent = '得分 ' + score + ' 分，家长可以在记录里看到哦';
  }

  window.addEventListener('lingxi:init', function (event) { init(event.detail); });
})();
