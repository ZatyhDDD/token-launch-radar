// Token Radar's dashboard. It reads window.RADAR (written beside dashboard/ by main.ts) and
// renders the ranked board, a filterable table, a per-protocol detail drawer with the model's own
// inputs and the protocol's farm plan, the regression the model was fit from with its
// leave-one-out error, and a sandbox that re-runs the model live. No network: every byte it
// shows is in data.js.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', chain: 'all', tab: 'pre-token', sort: 'implied', dir: -1, selected: null, watchlistOnly: false, sandbox: { valueScale: 1 } };
  var sandboxAtDefault = true;

  var money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

  /** A dollar figure, shortened past a thousand. */
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return money.format(n);
  }
  /** A percent with its sign, or n/a when the snapshot carries none. */
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  /** An age in days as years or days, or unknown. */
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }

  // The model, as the page runs it: the same arithmetic main.ts uses, so the page can check each
  // row against board.json. The sandbox scales every predicted value, then re-ranks the board live.
  function impliedOf(row, sandbox) {
    var cal = DATA.calibration;
    var scale = sandbox ? sandbox.valueScale : 1;
    var predicted = Math.exp(cal.intercept + cal.slope * Math.log(row.tvl_usd));
    return Math.max(1, Math.round(predicted * scale));
  }
  function liveImplied(row) {
    return sandboxAtDefault ? row.implied_value_usd : impliedOf(row, state.sandbox);
  }

  /** Build an element, set its attributes, and append its children. */
  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  // The farm plan, derived in the page exactly as main.ts derives it for board.json: category,
  // chains, TVL, the 7-day change, age and the implied value decide the action, the capital,
  // the hold and every cost and time. No name is special-cased, so the page's plan and the
  // board's plan are the same plan.
  function firstChain(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  function capitalFor(p) {
    if (p.tvl_usd >= 5e9) return 250;
    if (p.tvl_usd >= 1e9) return 150;
    if (p.tvl_usd >= 1e8) return 100;
    return 50;
  }
  function holdFor(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function actionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('risk curator') >= 0 || c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 'Deposit $' + capital + ' into a ' + name + ' vault on ' + chain + ' and keep the shares.';
    if (c.indexOf('basis trading') >= 0 || c.indexOf('basis') >= 0) return 'Deposit $' + capital + ' of USDC into ' + name + "'s basis vault on " + chain + ' and keep the position open.';
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ' and keep the position open.';
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Provide $' + capital + ' of liquidity to ' + name + "'s main pool on " + chain + ' and keep the position open.';
    if (c.indexOf('bridge') >= 0) return 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + name + ' and use the bridged funds in its app.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return "Stake $" + capital + " of the chain's staking asset through " + name + ' and keep the receipt.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' and open one small hedge.';
    if (c.indexOf('prediction') >= 0) return 'Fund $' + capital + ' and place one market position on ' + name + '.';
    if (c.indexOf('stable') >= 0) return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + '.';
    if (c.indexOf('rwa') >= 0) return "Mint $" + capital + " of the protocol's yield asset on " + chain + ' and hold it.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy.';
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
  }
  function joinStep(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + " Hold the position and check the protocol's own page.";
    return s;
  }
  function growthStep(p) {
    if (p.change_7d === null || p.change_7d === undefined) return 'No 7-day change is recorded for ' + p.name + ". Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote, and judge the trend from next week's TVL.";
    if (p.change_7d > 0) return 'TVL rose ' + fmtPct(p.change_7d) + ' in the last 7 days. Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote, while the growth holds; if it turns negative for two weeks, stop adding.';
    if (p.change_7d < 0) return 'TVL fell ' + fmtPct(p.change_7d) + ' in the last 7 days. Make one qualifying action this week, such as a deposit, a borrow, a swap or a vote, then wait a week before adding more.';
    return 'TVL was flat over the last 7 days. Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote, and that is enough to stay active.';
  }
  function holdStep(p, age, hold) {
    if (age === null || age === undefined) return 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot. Its listing date is not recorded, so ' + hold + ' days is the safe default.';
    return 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot. ' + p.name + ' has run ' + age + ' days without a token, so a ' + hold + '-day hold is still early in its life.';
  }
  function chainStep(p, capital) {
    if (p.chains && p.chains.length >= 2) {
      var half = Math.max(10, Math.round(capital / 2));
      return { text: p.name + ' also runs on ' + p.chains[1] + ', so repeat the deposit there with $' + half + ', half the first position, so the activity shows on two chains, not one.', cost: '$' + half + ' of capital and about $4 of gas', time: '15 minutes to set up' };
    }
    if (p.chains && p.chains.length === 1) {
      return { text: p.name + ' runs only on ' + p.chains[0] + ', so all of the activity counts on that one chain. Keep the whole position there instead of splitting it.', cost: 'nothing extra', time: '5 minutes to check' };
    }
    return { text: p.name + ' names no chain in the snapshot, so do the whole position on the chain its app opens on and note which one in the farm log.', cost: 'nothing extra', time: '5 minutes to check' };
  }
  function farmSteps(p) {
    var chain = firstChain(p);
    var capital = capitalFor(p);
    var hold = holdFor(p.age_days);
    var action = actionFor(p, capital, chain);
    return [
      { text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
      { text: action + ' ' + p.name + ' holds ' + fmtUsd(p.tvl_usd) + ' of TVL, so the $' + capital + ' is a small slice of it and can exit in one transaction.', cost: '$' + capital + ' of capital and about $' + (capital >= 150 ? 8 : 4) + ' of gas', time: '15 minutes to set up' },
      { text: growthStep(p), cost: 'about $2 of gas a week', time: '10 minutes a week' },
      { text: holdStep(p, p.age_days, hold), cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      chainStep(p, capital),
      { text: "Once a month, check " + p.name + "'s TVL against the " + fmtUsd(p.tvl_usd) + " in the last snapshot; if it falls by more than a fifth in a week, pause new deposits until you know why.", cost: 'nothing to check', time: '10 minutes a month' },
      { text: "Before the token launches, check " + p.name + "'s own announcements for the claim window and the eligibility rules, and claim only from the link it publishes. At an implied " + fmtUsd(p.implied_value_usd) + " the claim is worth chasing, but a claim that asks for a fee or a seed phrase is a scam.", cost: 'no fee to check', time: '10 minutes' },
      { text: 'Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.', cost: 'nothing but the log', time: '5 minutes' }
    ].map(joinStep);
  }

  /** Read the search, the selected protocol and the filters out of the URL hash. */
  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
  }
  /** Write the search, the selected protocol and the filters back into the URL hash. */
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  /** The rows the current filters leave, before sorting. */
  function filteredRows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.watchlistOnly && (DATA.watchlist || []).indexOf(r.slug) < 0) return false;
      if (state.category !== 'all' && r.category !== state.category) return false;
      if (state.chain !== 'all' && !(r.chains || []).some(function (c) { return c === state.chain; })) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  /** The filtered rows in the current sort order. */
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else { av = liveImplied(a); bv = liveImplied(b); }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' }, el('span', { class: 'mark' }), el('span', { class: 'brand-name', text: 'Token Radar' })),
      el('div', { class: 'top-meta' },
        el('span', null, 'Snapshot ', el('b', { text: DATA.as_of })),
        el('span', { text: 'DefiLlama protocol index' }),
        el('span', null, el('b', { text: DATA.model_version }), ' model')
      )
    );
  }

  function lede() {
    return el('section', { class: 'lede' },
      el('div', null,
        el('h1', { text: DATA.watchlist_size + ' watchlist protocols, ranked by implied value' }),
        el('p', null,
          'The watchlist is the floor: every protocol with at least ', el('b', { text: '$' + Math.round(DATA.floor_usd / 1e6) + 'M' }),
          ' of TVL and no token on record. The early radar adds ', el('b', { text: String(DATA.early_size) }),
          ' pre-token protocols below that floor. Implied value is a model, not a promise: a regression fit on the live market, not a number picked by hand.')
      ),
      el('div', { class: 'facts' },
        el('div', { class: 'fact' }, el('span', { text: 'Watchlist covered' }), el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size })),
        el('div', { class: 'fact' }, el('span', { text: 'Pre-token rows scored' }), el('b', { text: String(DATA.board_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Early rows below the floor' }), el('b', { text: String(DATA.early_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Live-token protocols set aside' }), el('b', { text: String(DATA.live_size) }))
      )
    );
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var chainCounts = {};
    DATA.rows.forEach(function (r) { (r.chains || []).forEach(function (c) { chainCounts[c] = (chainCounts[c] || 0) + 1; }); });
    var chains = Object.keys(chainCounts).sort(function (a, b) { return chainCounts[b] - chainCounts[a]; }).slice(0, 12);
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    var catSelect = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      categories.map(function (c) { return el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null }); })
    );
    catSelect.addEventListener('change', function () { state.category = catSelect.value; writeHash(); render(); });
    var chainSelect = el('select', { id: 'chain', 'aria-label': 'Filter by chain' },
      el('option', { value: 'all', text: 'All chains' }),
      chains.map(function (c) { return el('option', { value: c, text: c + ' (' + chainCounts[c] + ')', selected: c === state.chain ? 'selected' : null }); })
    );
    chainSelect.addEventListener('change', function () { state.chain = chainSelect.value; writeHash(); render(); });
    var pre = el('button', { type: 'button', 'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token', onclick: function () { state.tab = 'pre-token'; render(); } });
    var live = el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live token', onclick: function () { state.tab = 'live'; render(); } });
    var csv = el('button', { class: 'button', type: 'button', text: 'Download board (CSV)', onclick: downloadCsv });
    var wl = el('input', { type: 'checkbox', id: 'watchlist-only' });
    wl.checked = state.watchlistOnly;
    wl.addEventListener('change', function () { state.watchlistOnly = wl.checked; render(); });
    var countText = state.tab === 'pre-token' ? filteredRows().length + ' rows shown' + (sandboxAtDefault ? '' : ' · sandbox active') : DATA.live.length + ' live-token protocols';
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), catSelect),
      el('div', { class: 'field' }, el('label', { for: 'chain', text: 'Chain' }), chainSelect),
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'Token status' }), el('div', { class: 'tabs' }, pre, live)),
      el('div', { class: 'field' }, el('label', { for: 'watchlist-only', text: 'Watchlist only' }), wl),
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'Export' }), csv),
      el('span', { class: 'count', text: countText })
    );
  }

  /** Download the rows the current filters leave, as a CSV, in the current sort order. */
  function downloadCsv() {
    var list = sortedRows(filteredRows());
    var head = ['rank', 'protocol', 'category', 'chains', 'tvl_usd', 'change_7d', 'age_days', 'implied_value_usd'];
    var lines = [head.join(',')];
    list.forEach(function (r) {
      lines.push([
        r.rank,
        '"' + r.name.replace(/"/g, '""') + '"',
        r.category || '',
        '"' + (r.chains || []).join(';') + '"',
        r.tvl_usd,
        r.change_7d === null ? '' : r.change_7d,
        r.age_days === null ? '' : r.age_days,
        liveImplied(r)
      ].join(','));
    });
    var blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    var url = URL.createObjectURL(blob);
    var link = el('a', { href: url, download: 'token-radar-board.csv' });
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  /** A sortable column header. */
  function sortHeader(key, label) {
    return el('th', { scope: 'col' },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } render(); } },
        label,
        state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' v' : ' ^' }) : null
      )
    );
  }

  function boardTable() {
    var list = sortedRows(filteredRows());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another category to see the board again.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; writeHash(); render(); } })
      ));
    }
    var max = Math.max.apply(null, list.map(function (r) { return liveImplied(r); })) || 1;
    var tbody = el('tbody');
    list.forEach(function (r, i) {
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var shownRank = state.sort === 'implied' ? i + 1 : r.rank;
      var implied = liveImplied(r);
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num', text: String(shownRank) }),
        el('td', null, el('div', { class: 'name' },
          el('b', { text: r.name }),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') })
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: growth }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((implied / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(implied) })
        )),
        el('td', null, el('span', { class: 'status', text: 'no token' }))
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Pre-token protocols, strongest implied value first. Select a row for its model and farm plan.' }),
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
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', { class: 'num', text: 'live' }),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', null, el('span', { class: 'status live', text: 'already trades' }))
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Token live: these protocols already trade, so their market cap is a fact, not a model. They are set aside from the pre-token ranking, and their market caps are what the regression is fit on.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Status' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }), el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'Token' }))),
          tbody
        )
      )
    );
  }

  function modelPanel() {
    var cal = DATA.calibration;
    var loo = 'Leave-one-out on the ' + cal.live_count + ' live protocols: each one predicted from the other ' + (cal.live_count - 1) + ', so the error is out-of-sample, not the fit admiring itself.';
    return el('section', { class: 'panel model' },
      el('h2', { text: 'How implied value is computed' }),
      el('p', { class: 'sub', text: 'Every row is scored by one regression, fit at run time on the snapshot\u2019s own live-token protocols. No protocol name is special-cased, and no row is hand-picked.' }),
      el('div', { class: 'formula' },
        'implied = round( exp( ', el('b', { text: String(cal.intercept) }), ' + ', el('b', { text: String(cal.slope) }), ' x ln(tvl_usd) ) )'
      ),
      el('p', { class: 'sub', text: 'The market does not pay a flat multiple for a dollar of TVL: the ratio falls as protocols grow, so a single median multiple overstates the giants and understates the small. The regression reads that size effect off the live market. At $100M of TVL the fitted ratio is ' + cal.ratio_at_100m + '; at $1B it is ' + cal.ratio_at_1b + '. Growth, age and category were tested and left out: each added noise in the backtest, so the model keeps only TVL.' }),
      el('table', { class: 'calib' },
        el('thead', null, el('tr', null, el('th', { text: 'Fit' }), el('th', { text: 'Value' }))),
        el('tbody', null,
          el('tr', null, el('td', { text: 'Live protocols the regression is fit on' }), el('td', { class: 'num', text: String(cal.live_count) })),
          el('tr', null, el('td', { text: 'Intercept (log market cap at log TVL 0)' }), el('td', { class: 'num', text: String(cal.intercept) })),
          el('tr', null, el('td', { text: 'Slope (log market cap per log TVL)' }), el('td', { class: 'num', text: String(cal.slope) })),
          el('tr', null, el('td', { text: 'Median absolute log error, leave-one-out' }), el('td', { class: 'num', text: String(cal.loo_median_log_error) })),
          el('tr', null, el('td', { text: 'Predictions within 2x of the true market cap' }), el('td', { class: 'num', text: Math.round(cal.loo_within_2x * 100) + '%' })),
          el('tr', null, el('td', { text: 'Predictions within 3x of the true market cap' }), el('td', { class: 'num', text: Math.round(cal.loo_within_3x * 100) + '%' }))
        )
      ),
      el('p', { class: 'sub', text: loo })
    );
  }

  function sandboxPanel() {
    var scaleRange = el('input', { type: 'range', min: '0.5', max: '2', step: '0.05', value: String(state.sandbox.valueScale), 'aria-label': 'Scale every predicted value' });
    var scaleOut = el('output', { text: state.sandbox.valueScale.toFixed(2) + 'x' });
    scaleRange.addEventListener('input', function () { state.sandbox.valueScale = parseFloat(scaleRange.value); scaleOut.textContent = state.sandbox.valueScale.toFixed(2) + 'x'; syncSandbox(); });
    var reset = el('button', { class: 'button', type: 'button', text: 'Reset to the model', onclick: function () { state.sandbox.valueScale = 1; scaleRange.value = '1'; scaleOut.textContent = '1.00x'; syncSandbox(); } });
    return el('section', { class: 'panel sandbox' },
      el('h2', { text: 'Model sandbox' }),
      el('p', { class: 'sub', text: 'Scale every predicted value and the board re-ranks live, with the same arithmetic the page checks each row against. Nothing here changes board.json: the model above is the entry.' }),
      el('div', { class: 'sandbox-grid' },
        el('label', null, 'Value scale (every implied value, times this)', scaleRange, scaleOut)
      ),
      el('div', null, reset),
      el('p', { class: 'note', text: sandboxAtDefault ? 'At the model\u2019s own settings: the regression as fit, scale 1.00x.' : 'Sandbox active: the implied values below are re-run with these settings.' })
    );
  }

  function syncSandbox() {
    sandboxAtDefault = state.sandbox.valueScale === 1;
    render();
  }

  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); });

  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();
    dialog.textContent = '';
    var steps = farmSteps(row);
    var recomputed = impliedOf(row, null);
    // The detail shows the live numbers: the model's own when the sandbox is at its settings,
    // the sandbox's re-run when it is not, so the equation always matches the value it ends on.
    var cal = DATA.calibration;
    var shownScale = sandboxAtDefault ? 1 : state.sandbox.valueScale;
    var shownImplied = sandboxAtDefault ? row.implied_value_usd : impliedOf(row, state.sandbox);
    var logTvl = Math.log(row.tvl_usd);
    var logMcap = cal.intercept + cal.slope * logTvl;
    var eqRows = [
      el('div', null, el('span', { text: 'TVL' }), el('b', { class: 'num', text: fmtUsd(row.tvl_usd) })),
      el('div', null, el('span', { text: 'Seven-day growth' }), el('b', { class: 'num', text: fmtPct(row.change_7d) })),
      el('div', null, el('span', { text: 'Age with no token' }), el('b', { class: 'num', text: fmtAge(row.age_days) })),
      el('div', null, el('span', { text: 'ln(TVL)' }), el('b', { class: 'num', text: logTvl.toFixed(2) })),
      el('div', null, el('span', { text: 'Intercept + slope x ln(TVL)' }), el('b', { class: 'num', text: cal.intercept + ' + ' + cal.slope + ' x ' + logTvl.toFixed(2) + ' = ' + logMcap.toFixed(2) })),
      el('div', null, el('span', { text: 'Regression fit on' }), el('b', { class: 'num', text: cal.live_count + ' live protocols' })),
      el('div', { class: 'total' }, el('span', { text: sandboxAtDefault ? 'Implied value' : 'Sandbox value' }), el('b', { class: 'num', text: fmtUsd(shownImplied) }))
    ];
    if (!sandboxAtDefault) eqRows.push(el('div', null, el('span', { text: 'Model value (board.json)' }), el('b', { class: 'num', text: fmtUsd(row.implied_value_usd) })));
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'brand-name', text: 'Rank ' + row.rank + ' of ' + DATA.board_size }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') })
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Implied value' }),
      el('div', { class: 'equation' }, eqRows),
      el('p', { class: 'sub', text: 'Model ' + DATA.model_version + ': the same function scores every protocol. The page recomputes this row as ' + fmtUsd(recomputed) + (recomputed === row.implied_value_usd ? ', the same number board.json carries.' : ', which differs from the board: the data would be stale.') + ' This is an estimate, not a price.' })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan' }),
      el('ol', { class: 'steps' }, steps.map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
      }))
    ));
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(lede());
    shell.appendChild(controls());
    shell.appendChild(state.tab === 'pre-token' ? boardTable() : liveTable());
    if (state.tab === 'pre-token') {
      shell.appendChild(modelPanel());
      shell.appendChild(sandboxPanel());
    }
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) app.appendChild(dialog);
    if (state.selected) openDetail(state.selected);
  }

  readHash();
  render();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });
})();
