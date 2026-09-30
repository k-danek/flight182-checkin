(function () {
  'use strict';

  const screens = {
    checkin: document.getElementById('screen-checkin'),
    goods: document.getElementById('screen-goods'),
    question: document.getElementById('screen-question'),
    loading: document.getElementById('screen-loading'),
    result: document.getElementById('screen-result'),
  };

  function showScreen(key) {
    Object.values(screens).forEach((el) => el.classList.remove('active'));
    screens[key].classList.add('active');
  }

  let characters = [];
  let questions = [];
  let currentIndex = 0;
  let playerName = '';
  // running totals per character id; playstyle = points from playstyle
  // questions, strong = number of 3-point hits (both used as tie-breaks)
  let scores = {};
  let playstyle = {};
  let strong = {};
  // Relation to the Sabbat from the variant question. The GM maps it to
  // the character's variant (on the card); it is not shown to the player.
  let relation = '';

  function loadData() {
    // no-cache: always revalidate, so edits to the data show up on a normal reload
    return Promise.all([
      fetch('data/characters.json', { cache: 'no-cache' }).then((r) => r.json()),
      fetch('data/questions.json', { cache: 'no-cache' }).then((r) => r.json()),
    ]).then(([charData, qData]) => {
      characters = charData.characters;
      questions = qData.questions;
      resetState();
    });
  }

  function renderQuestion() {
    const q = questions[currentIndex];
    document.getElementById('progress-label').textContent =
      'Question ' + (currentIndex + 1) + ' of ' + questions.length;
    document.getElementById('question-text').textContent = q.text;

    const container = document.getElementById('answers-container');
    container.innerHTML = '';
    q.answers.forEach((answer) => {
      const btn = document.createElement('button');
      btn.className = 'answer';
      btn.type = 'button';
      btn.textContent = answer.text;
      if (answer.hint) {
        const hint = document.createElement('span');
        hint.className = 'hint';
        hint.textContent = answer.hint;
        btn.appendChild(hint);
      }
      btn.addEventListener('click', () => selectAnswer(answer));
      container.appendChild(btn);
    });

    showScreen('question');
  }

  function selectAnswer(answer) {
    if (answer.relation) relation = answer.relation;
    Object.keys(answer.scores || {}).forEach((charId) => {
      const pts = answer.scores[charId];
      scores[charId] = (scores[charId] || 0) + pts;
      if (questions[currentIndex].playstyle) {
        playstyle[charId] = (playstyle[charId] || 0) + pts;
      }
      if (pts >= 3) {
        strong[charId] = (strong[charId] || 0) + 1;
      }
    });

    currentIndex += 1;
    if (currentIndex < questions.length) {
      renderQuestion();
    } else {
      finish();
    }
  }

  function rankedCharacterIds() {
    // Must match tools/check_questionnaire.py: total, then playstyle points,
    // then 3-point hits, then characters.json order (Array sort is stable).
    return characters
      .map((c) => c.id)
      .sort((a, b) =>
        (scores[b] || 0) - (scores[a] || 0) ||
        (playstyle[b] || 0) - (playstyle[a] || 0) ||
        (strong[b] || 0) - (strong[a] || 0));
  }

  // A character can look different depending on the variant question
  // (e.g. the Hero's name and portrait); by_relation holds those overrides.
  function findCharacter(id) {
    const c = characters.find((ch) => ch.id === id);
    if (!c) return c;
    return Object.assign({}, c, (c.by_relation || {})[relation] || {});
  }

  function setFullname(id, character) {
    const el = document.getElementById(id);
    el.textContent = character.fullname ? 'Name: ' + character.fullname : '';
    el.hidden = !character.fullname;
  }

  function finish() {
    showScreen('loading');

    const backendUrl = (window.CONFIG && window.CONFIG.BACKEND_URL) || '';

    if (!backendUrl) {
      const ranked = rankedCharacterIds();
      showResult(findCharacter(ranked[0]), findCharacter(ranked[1]), { reassigned: false, saved: false });
      return;
    }

    fetch(backendUrl, {
      method: 'POST',
      // text/plain avoids a CORS preflight against Apps Script's web app.
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ player: playerName, scores: scores, ranked: rankedCharacterIds(), relation: relation }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (!data || !data.ok) {
          throw new Error('backend rejected the submission');
        }
        showResult(findCharacter(data.characterId), findCharacter(data.backupId), {
          reassigned: !!data.reassigned,
          saved: true,
        });
      })
      .catch((err) => {
        console.error('Backend submission failed, falling back to local result:', err);
        const ranked = rankedCharacterIds();
        showResult(findCharacter(ranked[0]), findCharacter(ranked[1]), {
          reassigned: false,
          saved: false,
          error: true,
        });
      });
  }

  function setPortrait(id, character) {
    const img = document.getElementById(id);
    if (character.portrait) {
      img.src = character.portrait;
      img.alt = 'Portrait: ' + character.name;
      img.hidden = false;
    } else {
      img.removeAttribute('src');
      img.hidden = true;
    }
  }

  // Airline style: SURNAME/GIVEN NAMES, nicknames dropped, "Dr." moved to the end.
  function passengerName(character) {
    let s = (character.fullname || character.name).replace(/["“][^"”]*["”]/g, '').replace(/\s+/g, ' ').trim();
    let title = '';
    const dr = s.match(/^Dr\.?\s+/i);
    if (dr) {
      title = ' DR';
      s = s.slice(dr[0].length);
    }
    const parts = s.split(' ');
    const surname = parts.pop();
    return ((parts.length ? surname + '/' + parts.join(' ') : surname) + title).toUpperCase();
  }

  // The SEQ number on the boarding pass encodes the relation, so the GM can
  // read the variant off a screenshot even if the result was not saved.
  // Decode: characters/questionnaire-roster.json ("seq_codes").
  const SEQ_CODES = { fanatic: '041', expression: '117', family: '063', resource: '089', enemy: '152' };

  function setBoardingPass(character) {
    const el = document.getElementById('result-pass');
    const pass = character.pass;
    const dl = document.getElementById('bp-download');
    if (!pass) {
      el.hidden = true;
      dl.hidden = true;
      return;
    }
    document.getElementById('bp-name').textContent = passengerName(character);
    document.getElementById('bp-class').textContent = pass.class;
    document.getElementById('bp-seat').textContent = pass.seat;
    document.getElementById('bp-zone').textContent = pass.zone;
    document.getElementById('bp-seq').textContent = SEQ_CODES[relation] || '000';
    el.hidden = false;
    dl.hidden = false;
  }

  // Saves the boarding pass as a PNG (html2canvas, loaded from cdnjs).
  function downloadBoardingPass() {
    const el = document.getElementById('result-pass');
    const btn = document.getElementById('bp-download');
    if (typeof window.html2canvas !== 'function') {
      alert('The download needs an internet connection. Take a screenshot of the boarding pass instead.');
      return;
    }
    btn.disabled = true;
    window.html2canvas(el, { scale: 2, backgroundColor: null })
      .then((canvas) => new Promise((resolve) => canvas.toBlob(resolve, 'image/png')))
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'AI182-boarding-pass-' + document.getElementById('bp-seat').textContent + '.png';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      })
      .catch((err) => {
        console.error('Boarding pass download failed:', err);
        alert('Could not create the image. Take a screenshot of the boarding pass instead.');
      })
      .finally(() => { btn.disabled = false; });
  }

  document.getElementById('bp-download').addEventListener('click', downloadBoardingPass);

  function showResult(character, backup, meta) {
    setPortrait('result-portrait', character);
    document.getElementById('result-name').textContent = character.name;
    document.getElementById('result-clan').textContent = character.clan;
    document.getElementById('result-seat').textContent = character.seat;
    setFullname('result-fullname', character);
    document.getElementById('result-teaser').textContent = character.teaser;
    document.getElementById('result-playstyle').textContent = 'Playstyle: ' + character.playstyle;
    document.getElementById('result-strength').textContent = 'Biggest strength: ' + character.strength;
    setBoardingPass(character);

    const backupEl = document.getElementById('result-backup');
    if (backup) {
      setPortrait('backup-portrait', backup);
      document.getElementById('backup-name').textContent = backup.name;
      document.getElementById('backup-clan').textContent = backup.clan;
      document.getElementById('backup-playstyle').textContent = backup.playstyle;
      document.getElementById('backup-seat').textContent = backup.seat;
      setFullname('backup-fullname', backup);
      document.getElementById('backup-teaser').textContent = backup.teaser;
      document.getElementById('backup-strength').textContent = 'Biggest strength: ' + backup.strength;
      backupEl.open = false;
      backupEl.hidden = false;
    } else {
      backupEl.hidden = true;
    }

    const noteEl = document.getElementById('result-note');
    if (meta.reassigned) {
      noteEl.textContent =
        'Your top match was already claimed by another player, so you got your next-best available fit.';
      noteEl.style.display = 'block';
      noteEl.classList.add('warn');
    } else {
      noteEl.style.display = 'none';
    }

    const saveNoteEl = document.getElementById('result-save-note');
    if (meta.error) {
      saveNoteEl.textContent =
        'Could not reach the results backend, so this result was not saved. Tell your GM directly.';
      saveNoteEl.style.display = 'block';
    } else if (!meta.saved) {
      saveNoteEl.textContent = 'Local test mode: this result was not saved anywhere.';
      saveNoteEl.style.display = 'block';
    } else {
      saveNoteEl.style.display = 'none';
    }

    showScreen('result');
  }

  function resetState() {
    currentIndex = 0;
    scores = {};
    playstyle = {};
    strong = {};
    relation = '';
    characters.forEach((c) => { scores[c.id] = 0; });
  }

  // Not real security: anyone reading the page source can see it. It only
  // keeps strangers who stumble on the URL out of the quiz.
  const BOOKING_REF = 'fiesta60';

  document.getElementById('checkin-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const surname = document.getElementById('surname').value.trim();
    const ref = document.getElementById('booking-ref').value.trim().toLowerCase();
    const errorEl = document.getElementById('checkin-error');
    const errorText = document.getElementById('checkin-error-text');
    if (!surname || ref !== BOOKING_REF) {
      errorText.textContent = surname
        ? 'The booking reference could not be found in the system. Check your details and try again.'
        : 'Enter your surname and booking reference.';
      errorEl.hidden = false;
      return;
    }
    errorEl.hidden = true;
    playerName = surname;
    showScreen('goods');
  });

  const goodsAck = document.getElementById('goods-ack');
  const goodsBtn = document.getElementById('goods-btn');
  goodsAck.addEventListener('change', () => { goodsBtn.disabled = !goodsAck.checked; });
  goodsBtn.addEventListener('click', () => {
    resetState();
    renderQuestion();
  });

  document.getElementById('restart-btn').addEventListener('click', () => {
    resetState();
    goodsAck.checked = false;
    goodsBtn.disabled = true;
    showScreen('checkin');
  });

  const statusEl = document.getElementById('backend-status');

  loadData()
    .then(() => {
      const backendUrl = (window.CONFIG && window.CONFIG.BACKEND_URL) || '';
      statusEl.textContent = backendUrl
        ? ''
        : 'Local test mode — results are not being saved. Configure BACKEND_URL in config.js to save results.';
    })
    .catch((err) => {
      console.error(err);
      statusEl.textContent = 'Could not load questionnaire data.';
    });
})();
