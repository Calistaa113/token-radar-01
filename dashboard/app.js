// Token Radar's dashboard: it reads window.RADAR (written beside dashboard/ by main.ts) and
// renders the ranked board, a filterable table, and a per-protocol detail drawer showing the
// model's own inputs and the protocol's farm plan. No network: every byte shown is in data.js.
(function () {
  "use strict";

  const DATA = window.RADAR;
  if (!DATA) { return; }
  const app = document.getElementById('board');
  const state = { q: '', category: 'all', chain: 'all', wl: false, tab: 'pre-token', sort: 'implied', dir: -1, selected: null };

  const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) { return 'n/a'; }
    const abs = Math.abs(n);
    if (abs >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (abs >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (abs >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    const plain = usd.format(n);
    return plain;
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) { return 'n/a'; }
    return `${n > 0 ? '+' : ''}${n.toFixed(2)}%`;
  }
  function fmtAge(days) {
    if (days === null || days === undefined) { return 'unknown'; }
    if (days >= 365) return `${(days / 365).toFixed(1)}y`;
    return `${Math.max(0, Math.round(days))}d`;
  }
  // The model in one function: the page recomputes a row from the snapshot figures and checks
  // the number board.json carries, so the page and the board visibly share one arithmetic.
  function impliedOf(r, m) {
    const growth = Math.min(m.growth_cap, Math.max(m.growth_floor, r.change_7d === null || r.change_7d === undefined ? 0 : r.change_7d));
    const growthMult = 1 + (growth / 100) * m.growth_weight;
    const age = r.age_days === null || r.age_days === undefined ? m.unknown_age_days : r.age_days;
    const maturity = m.maturity_floor + (Math.min(Math.max(age, 0), m.maturity_days) / m.maturity_days) * m.maturity_range;
    const youth = r.age_days === null || r.age_days === undefined || r.age_days >= m.youth_days ? 1 : m.youth_floor + (1 - m.youth_floor) * (r.age_days / m.youth_days);
    return Math.max(1, Math.round(r.tvl_usd * m.base_multiple * growthMult * maturity * youth));
  }

  function el(tag, attrs) {
    const elem = document.createElement(tag);
    if (attrs !== undefined && attrs !== null) {
      Object.keys(attrs).forEach((key) => {
        if (key === 'class') elem.className = attrs[key];
        else if (key === 'text') elem.textContent = attrs[key];
        else if (key === 'html') elem.innerHTML = attrs[key];
        else if (key.slice(0, 2) === 'on') elem.addEventListener(key.slice(2), attrs[key]);
        else if (attrs[key] !== null && attrs[key] !== undefined) elem.setAttribute(key, attrs[key]);
      });
    }
    for (let i = 2; i < arguments.length; i++) {
      const kid = arguments[i];
      if (kid === null || kid === undefined) continue;
      if (Array.isArray(kid)) kid.forEach((c) => { if (c) elem.appendChild(c); });
      else if (typeof kid === 'string') elem.appendChild(document.createTextNode(kid));
      else elem.appendChild(kid);
    }
    return elem;
  }

  // The farm plan is the same derivation main.ts writes to board.json: category, chains, TVL and
  // age decide the action, the second action, the capital, the gas and the hold. No name is special-cased.
  function chainOf(proto) { return proto.chains && proto.chains.length > 0 ? proto.chains[0] : 'its main chain'; }
  function capitalFor(proto) {
    if (proto.tvl_usd >= 5e9) return 250;
    if (proto.tvl_usd >= 1e9) return 150;
    if (proto.tvl_usd >= 1e8) return 100;
    return 50;
  }
  function gasFor(proto) {
    const ch = ((proto.chains && proto.chains[0]) || '').toLowerCase();
    if (ch.indexOf('ethereum') >= 0) return 6;
    if (ch.indexOf('bitcoin') >= 0) return 3;
    if (ch === '') return 2;
    return 1;
  }
  function holdDaysFor(d) {
    if (d === null || d === undefined) return 30;
    if (d < 180) return 60;
    if (d < 365) return 45;
    return 30;
  }
  function actionFor(p, cap, ch) {
    const cat = (p.category || '').toLowerCase();
    const nm = p.name;
    if (cat.indexOf('lend') >= 0 || cat.indexOf('cdp') >= 0 || cat.indexOf('collateral') >= 0) return 'Supply $' + cap + ' of USDC to ' + nm + ' on ' + ch + ' and keep the position open.';
    if (cat.indexOf('dex') >= 0 || cat.indexOf('yield') >= 0 || cat.indexOf('leveraged farm') >= 0) return 'Provide $' + cap + ' of liquidity to ' + nm + "'s main pool on " + ch + ' and keep the position open.';
    if (cat.indexOf('bridge') >= 0) return 'Bridge $' + cap + ' of USDC to ' + ch + ' through ' + nm + ' and use the bridged funds in its app.';
    if (cat.indexOf('staking') >= 0 || cat.indexOf('restak') >= 0) return "Stake $" + cap + " of the chain's staking asset through " + nm + ' and keep the receipt.';
    if (cat.indexOf('perpetual') >= 0 || cat.indexOf('derivative') >= 0) return 'Deposit $' + cap + ' of USDC as margin on ' + nm + ' and open one small hedge.';
    if (cat.indexOf('prediction') >= 0) return 'Fund $' + cap + ' and place one market position on ' + nm + '.';
    if (cat.indexOf('curator') >= 0 || cat.indexOf('allocator') >= 0) return 'Deposit $' + cap + ' into a ' + nm + ' vault on ' + ch + ' and keep the shares.';
    if (cat.indexOf('stable') >= 0) return 'Mint or deposit $' + cap + ' of the stable asset through ' + nm + ' on ' + ch + '.';
    if (cat.indexOf('rwa') >= 0) return "Mint $" + cap + " of the protocol's yield asset on " + ch + ' and hold it.';
    if (cat.indexOf('insurance') >= 0) return 'Buy $' + cap + ' of cover from ' + nm + ' on ' + ch + ' and keep the policy.';
    return 'Deposit $' + cap + ' of USDC into ' + nm + ' on ' + ch + ' and keep the position open.';
  }
  function secondActionFor(p, cap) {
    const cat = (p.category || '').toLowerCase();
    const nm = p.name;
    const bit = Math.max(10, Math.round(cap / 5));
    if (cat.indexOf('lend') >= 0 || cat.indexOf('cdp') >= 0 || cat.indexOf('collateral') >= 0) return 'Borrow $' + bit + ' against the supply on ' + nm + ' and repay it the same week.';
    if (cat.indexOf('dex') >= 0 || cat.indexOf('yield') >= 0 || cat.indexOf('leveraged farm') >= 0) return 'Swap $' + bit + ' through ' + nm + "'s main pool once, in either direction.";
    if (cat.indexOf('bridge') >= 0) return 'Bridge $' + bit + ' back through ' + nm + ' so the round trip is on record.';
    if (cat.indexOf('staking') >= 0 || cat.indexOf('restak') >= 0) return 'Claim or restake the staking rewards ' + nm + ' pays, even if the amount is small.';
    if (cat.indexOf('perpetual') >= 0 || cat.indexOf('derivative') >= 0) return 'Close the hedge on ' + nm + ' and open a fresh one half the size.';
    if (cat.indexOf('prediction') >= 0) return 'Settle one market position on ' + nm + ' and open another on a different market.';
    if (cat.indexOf('curator') >= 0 || cat.indexOf('allocator') >= 0) return 'Move $' + bit + ' between two ' + nm + ' vaults instead of adding new funds.';
    if (cat.indexOf('rwa') >= 0) return 'Redeem $' + bit + ' of the yield asset and mint it back the same week.';
    return 'Do one more on-chain action on ' + nm + ', such as a swap, a vote or a claim, in a different week from the first.';
  }
  function stepText(step) {
    let out = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (out.length > 600) out = out.slice(0, 596) + '...';
    if (out.length < 20) out = out + " Hold the position and check the protocol's own page.";
    return out;
  }
  function farmSteps(p) {
    const ch = chainOf(p);
    const cap = capitalFor(p);
    const g = gasFor(p);
    const days = holdDaysFor(p.age_days);
    return [
      { text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', cost: 'under $' + (g + 2) + ' of gas for the first transaction', time: '5 minutes' },
      { text: actionFor(p, cap, ch), cost: '$' + cap + ' of capital and about $' + g + ' of gas', time: '15 minutes to set up' },
      { text: secondActionFor(p, cap), cost: 'about $' + g + ' of gas', time: '10 minutes' },
      { text: 'Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.', cost: 'about $' + g + ' of gas a week', time: '10 minutes a week' },
      { text: 'Hold the position for at least ' + days + ' days so the activity is counted in more than one snapshot.', cost: 'the $' + cap + ' stays in the position', time: days + ' days' },
      { text: "Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.", cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
      { text: 'Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.', cost: 'nothing but the log', time: '5 minutes' }
    ].map(stepText);
  }

  function readHash() {
    const raw = window.location.hash.replace(/^#/, '');
    if (!raw) return;
    const qs = new URLSearchParams(raw);
    if (qs.get('q')) state.q = qs.get('q');
    if (qs.get('p')) state.selected = qs.get('p');
    if (qs.get('category')) state.category = qs.get('category');
    if (qs.get('chain')) state.chain = qs.get('chain');
    if (qs.get('wl') === '1') state.wl = true;
    if (qs.get('tab')) state.tab = qs.get('tab');
  }
  function writeHash() {
    const qs = new URLSearchParams();
    if (state.q) qs.set('q', state.q);
    if (state.category !== 'all') qs.set('category', state.category);
    if (state.chain !== 'all') qs.set('chain', state.chain);
    if (state.wl) qs.set('wl', '1');
    if (state.tab !== 'pre-token') qs.set('tab', state.tab);
    if (state.selected) qs.set('p', state.selected);
    const str = qs.toString();
    if (str) window.history.replaceState(null, '', '#' + str);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function rows() {
    const query = state.q.trim().toLowerCase();
    return DATA.rows.filter((row) => {
      if (state.category !== 'all' && row.category !== state.category) return false;
      if (state.chain !== 'all' && !(row.chains || []).some((c) => c === state.chain)) return false;
      if (state.wl && !row.watchlist) return false;
      if (!query) return true;
      const text = [row.name, row.slug, row.category, (row.chains || []).join(' ')].join(' ').toLowerCase();
      return text.indexOf(query) >= 0;
    });
  }
  function sortedRows(list) {
    const sortKey = state.sort;
    return list.slice().sort((a, b) => {
      let aVal;
      let bVal;
      if (sortKey === 'name') { aVal = a.name.toLowerCase(); bVal = b.name.toLowerCase(); }
      else if (sortKey === 'tvl') { aVal = a.tvl_usd; bVal = b.tvl_usd; }
      else if (sortKey === 'growth') { aVal = a.change_7d === null ? -Infinity : a.change_7d; bVal = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (sortKey === 'age') { aVal = a.age_days === null ? Infinity : a.age_days; bVal = b.age_days === null ? Infinity : b.age_days; }
      else { aVal = a.implied_value_usd; bVal = b.implied_value_usd; }
      if (aVal < bVal) return -state.dir;
      if (aVal > bVal) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' }, el('span', { class: 'mark' }), el('span', { class: 'brand-name', text: 'Token Radar' })),
      el('div', { class: 'top-meta' },
        el('span', { text: `Snapshot ${DATA.as_of}` }),
        el('span', { text: 'DefiLlama protocol index' }),
        el('span', { text: `${DATA.model_version} model` })
      )
    );
  }

  function lede() {
    return el('section', { class: 'lede' },
      el('div', null,
        el('h1', { text: `${DATA.watchlist_size} watchlist protocols, ranked by implied value` }),
        el('p', { text: `The watchlist is the floor: every protocol with at least $${Math.round(DATA.floor_usd / 1e6)}M of TVL and no token on record. The early radar adds ${DATA.early_size} launchable protocols below that floor. Wrapped, staked and bridged products are left out: their token already trades. Implied value is a model, not a promise.` })
      ),
      el('div', { class: 'facts' },
        el('div', { class: 'fact' }, el('span', { text: 'Watchlist covered' }), el('b', { text: `${DATA.watchlist_size} / ${DATA.watchlist_size}` })),
        el('div', { class: 'fact' }, el('span', { text: 'Pre-token rows scored' }), el('b', { text: String(DATA.board_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Early rows below the floor' }), el('b', { text: String(DATA.early_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Live-token protocols set aside' }), el('b', { text: String(DATA.live_size) }))
      )
    );
  }

  function controls() {
    const cats = Array.from(new Set(DATA.rows.map((r) => r.category || 'Other'))).sort();
    const chns = Array.from(new Set(DATA.rows.reduce((acc, r) => acc.concat(r.chains || []), []))).sort();
    const searchBox = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    searchBox.addEventListener('input', () => { state.q = searchBox.value; writeHash(); render(); });
    const catSel = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      cats.map((c) => el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null }))
    );
    catSel.addEventListener('change', () => { state.category = catSel.value; writeHash(); render(); });
    const chainSel = el('select', { id: 'chain', 'aria-label': 'Filter by chain' },
      el('option', { value: 'all', text: 'All chains' }),
      chns.map((c) => el('option', { value: c, text: c, selected: c === state.chain ? 'selected' : null }))
    );
    chainSel.addEventListener('change', () => { state.chain = chainSel.value; writeHash(); render(); });
    const wlBtn = el('button', { class: 'toggle', type: 'button', 'aria-pressed': state.wl ? 'true' : 'false', text: 'Watchlist only', onclick: () => { state.wl = !state.wl; writeHash(); render(); } });
    const preBtn = el('button', { type: 'button', 'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token', onclick: () => { state.tab = 'pre-token'; writeHash(); render(); } });
    const liveBtn = el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live token', onclick: () => { state.tab = 'live'; writeHash(); render(); } });
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), searchBox),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), catSel),
      el('div', { class: 'field' }, el('label', { for: 'chain', text: 'Chain' }), chainSel),
      wlBtn,
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'Token status' }), el('div', { class: 'tabs' }, preBtn, liveBtn)),
      el('span', { class: 'count', text: state.tab === 'pre-token' ? rows().length + ' rows shown' : DATA.live.length + ' live-token protocols' })
    );
  }

  function sortHeader(k, txt) {
    return el('th', { scope: 'col' },
      el('button', { type: 'button', onclick: () => { if (state.sort === k) state.dir = -state.dir; else { state.sort = k; state.dir = -1; } render(); } },
        txt,
        state.sort === k ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' v' : ' ^' }) : null
      )
    );
  }

  function boardTable() {
    const shown = sortedRows(rows());
    if (shown.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another category to see the board again.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: () => { state.q = ''; state.category = 'all'; state.chain = 'all'; state.wl = false; writeHash(); render(); } })
      ));
    }
    const top = shown[0].implied_value_usd || 1;
    const tbody = el('tbody');
    shown.forEach((r) => {
      const g = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      const gClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      const rowEl = el('tr', {
        'class': r.rank <= 3 ? 'top3' : null,
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: () => { openDetail(r.slug); },
        onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num' }, el('span', { class: 'rank-badge', text: String(r.rank) })),
        el('td', null, el('div', { class: 'name' },
          el('b', { text: r.name }),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') + (r.watchlist ? ' - watchlist' : '') })
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + gClass, text: g }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / top) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) })
        )),
        el('td', null, el('span', { class: 'pill', text: 'no token' }))
      );
      tbody.appendChild(rowEl);
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Launchable pre-token protocols, strongest implied value first. Select a row for its model and farm plan.' }),
          el('thead', null, el('tr', null,
            sortHeader('implied', 'Rank'),
            sortHeader('name', 'Protocol'),
            sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7d'),
            sortHeader('age', 'Age'),
            sortHeader('implied', 'Implied value'),
            el('th', { scope: 'col', text: 'Token' })
          )),
          tbody
        )
      )
    );
  }

  function liveTable() {
    const tbody = el('tbody');
    DATA.live.forEach((r) => {
      tbody.appendChild(el('tr', null,
        el('td', { class: 'num', text: 'live' }),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', null, el('span', { class: 'pill live', text: 'already trades' }))
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Token live: these protocols already trade, so their market cap is a fact, not a model. They are set aside from the pre-token ranking.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Status' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }), el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'Token' }))),
          tbody
        )
      )
    );
  }

  function modelPanel() {
    const model = DATA.model;
    return el('section', { class: 'panel model' },
      el('h2', { text: 'How implied value is computed' }),
      el('p', { class: 'sub', text: 'Every row is scored by one function of the snapshot figures. No protocol name is special-cased, and no row is hand-picked.' }),
      el('div', { class: 'formula' },
        'implied = round( tvl_usd x ' + model.base_multiple + ' x (1 + clamp(change_7d, ' + model.growth_floor + ', ' + model.growth_cap + ') / 100 x ' + model.growth_weight + ') x (' + model.maturity_floor + ' + min(age_days, ' + model.maturity_days + ') / ' + model.maturity_days + ' x ' + model.maturity_range + ') x youth(age_days) )'
      ),
      el('p', { class: 'sub', text: 'TVL and seven-day growth come from the snapshot. Age is the time since the protocol was first listed, the best record of how long it has run with no token; an unlisted age uses ' + model.unknown_age_days + ' days. A protocol listed under ' + model.youth_days + ' days ago is discounted toward ' + model.youth_floor + ', so a sudden TVL spike does not top the board. Wrapped, staked and bridged products are left out of the ranking entirely: their token already trades.' })
    );
  }

  const dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', () => { state.selected = null; writeHash(); });

  function openDetail(id) {
    const r = DATA.rows.filter((row) => row.slug === id)[0];
    if (!r) return;
    state.selected = id;
    writeHash();
    dialog.textContent = '';
    const plan = farmSteps(r);
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'brand-name', text: 'Rank ' + r.rank + ' of ' + DATA.board_size + (r.watchlist ? ' - watchlist' : '') }),
        el('h2', { id: 'detail-title', text: r.name }),
        el('p', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.join(', ') : 'an unnamed chain') })
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: () => { dialog.close(); } })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Implied value' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'TVL' }), el('b', { class: 'num', text: fmtUsd(r.tvl_usd) })),
        el('div', null, el('span', { text: 'Seven-day growth' }), el('b', { class: 'num', text: fmtPct(r.change_7d) })),
        el('div', null, el('span', { text: 'Age with no token' }), el('b', { class: 'num', text: fmtAge(r.age_days) })),
        el('div', null, el('span', { text: 'Growth multiplier' }), el('b', { class: 'num', text: String(r.growth_multiplier) })),
        el('div', null, el('span', { text: 'Maturity multiplier' }), el('b', { class: 'num', text: String(r.maturity_multiplier) })),
        el('div', null, el('span', { text: 'Youth multiplier' }), el('b', { class: 'num', text: String(r.youth_multiplier) })),
        el('div', null, el('span', { text: 'Implied value' }), el('b', { class: 'num', text: fmtUsd(r.implied_value_usd) }))
      ),
      el('p', { class: 'sub', text: 'Model ' + DATA.model_version + ': the same function scores every protocol. The page recomputes this row as ' + fmtUsd(impliedOf(r, DATA.model)) + (impliedOf(r, DATA.model) === r.implied_value_usd ? ', the same number board.json carries.' : ', which differs from the board: the data would be stale.') + ' This is an estimate, not a price.' })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan' }),
      el('ol', { class: 'steps' }, plan.map((s) => {
        const cut = s.indexOf(' Cost: ');
        const head = cut >= 0 ? s.slice(0, cut) : s;
        const rest = cut >= 0 ? s.slice(cut + 1) : '';
        return el('li', null, el('b', { text: head }), el('span', { class: 'cost', text: rest }));
      }))
    ));
    dialog.appendChild(el('p', { class: 'note', text: 'This protocol records no token in the snapshot, so the plan farms a launch that may never come. Never pay to claim, and never trust a link that is not the protocol\u2019s own.' }));
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function render() {
    app.textContent = '';
    const wrap = el('div', { class: 'shell' });
    wrap.appendChild(header());
    wrap.appendChild(lede());
    wrap.appendChild(controls());
    wrap.appendChild(state.tab === 'pre-token' ? boardTable() : liveTable());
    if (state.tab === 'pre-token') wrap.appendChild(modelPanel());
    app.appendChild(wrap);
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) app.appendChild(dialog);
    if (state.selected) openDetail(state.selected);
  }

  readHash();
  render();
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });
})();
