/* ===== CONSTANTS ===== */
const SUGGESTED_AUTHORS = [
  'Charlotte Link','Hera Lind','Diana Gabaldon',
  'Jodi Picoult','Guillaume Musso','Karen Swan','Joy Fielding',
];
// Genres that are too generic to be useful for recommendations
const SKIP_GENRES = new Set([
  // Too generic to be useful — Google Books uses these as catch-alls
  'Fiction','Juvenile Fiction','Nonfiction','Juvenile Nonfiction',
  'Literary Collections','Literary Criticism','General','Short Stories','Classics',
]);

// German genre name → API query. "NEW:" prefix = free-text + orderBy=newest + langRestrict=de
const GENRE_API_MAP = {
  'Liebesroman':         'romance Liebesroman',
  'Historischer Roman':  'historical fiction Historischer Roman',
  'Krimi':               'Krimi Kriminalroman crime',
  'Kriminalroman':       'Kriminalroman crime detective',
  'Thriller':            'Thriller suspense',
  'Biografie':           'Biografie biography memoir',
  'Humor':               'Humor comedy',
  'Science Fiction':     'Science Fiction',
  'Fantasy':             'Fantasy',
  'Drama':               'Drama Roman',
  'Abenteuer':           'Abenteuer adventure',
  'Horror':              'Horror',
  'Romantasy':           'Romantasy romantic fantasy',
  'Spiegel-Bestseller':  'SPIEGEL',
  'Neuerscheinungen':    'NEWREL',
};
// English genre names from Google Books API categories → mapped to API query
const GENRE_EN_MAP = {
  'Romance':                   'romance Liebesroman',
  'Crime Fiction':              'Krimi crime',
  'Mystery & Detective':        'Krimi mystery detective',
  'Mystery':                    'Krimi mystery',
  'Thriller':                   'Thriller suspense',
  'Historical Fiction':         'Historischer Roman historical fiction',
  'Biography & Autobiography':  'Biografie biography',
  'History':                    'Geschichte history',
  'Science Fiction':            'Science Fiction',
  'Fantasy':                    'Fantasy',
  'Horror':                     'Horror',
  'Humor':                      'Humor comedy',
  'Adventure':                  'Abenteuer adventure',
  'Drama':                      'Drama Roman',
  'Literary Fiction':           'Roman Literatur',
  "Women's Fiction":            'Frauenroman romance',
  'Suspense':                   'Thriller suspense',
  'Love Stories':               'Liebesroman romance',
};
function genreForApi(g) { return GENRE_API_MAP[g] || GENRE_EN_MAP[g] || g; }

// Returns true if a Google Books item matches the target language.
// For 'de': permissive (no language tag = assume German, many DE books lack it).
// For 'en': strict (must have language === 'en').
function matchesLang(i, lang) {
  const l = i.volumeInfo?.language;
  if (lang === 'de') return !l || l === 'de';
  return l === lang;
}

// Normalize a book title for deduplication: lowercase, strip parentheticals + punctuation
function normTitle(t) {
  return String(t||'').toLowerCase()
    .replace(/\s*[\(\[].+?[\)\]]/g, '')   // strip (parentheses)
    .replace(/\s+[-:—–|]\s+.+$/, '')       // strip subtitle after ": " or " - " etc.
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
// Deduplicate raw Google Books API items by title; prefer items with a cover.
function dedupeRaw(items) {
  const seen = new Map();
  const result = [];
  for (const i of items) {
    const key = normTitle(i.volumeInfo?.title || '');
    if (!key) continue;
    if (!seen.has(key)) { seen.set(key, result.length); result.push(i); }
    else {
      const idx = seen.get(key);
      if (i.volumeInfo?.imageLinks?.thumbnail && !result[idx].volumeInfo?.imageLinks?.thumbnail) result[idx] = i;
    }
  }
  return result;
}
// Deduplicate already-mapped book objects by title.
function dedupeBooks(books) {
  const seen = new Set();
  return books.filter(b => { const k = normTitle(b.title||''); if (!k||seen.has(k)) return false; seen.add(k); return true; });
}
// Limit to max N books per author (prevents one author flooding suggestions).
function limitPerAuthor(books, max = 2) {
  const counts = {};
  return books.filter(b => {
    const a = (b.authors?.[0]||'unknown').toLowerCase();
    counts[a] = (counts[a]||0) + 1;
    return counts[a] <= max;
  });
}

// Current bestselling authors per genre — kept up to date with trending names.
// Used to fetch their NEWEST books (last 3 years) for genre suggestions.
const GENRE_AUTHORS = {
  'Krimi':               ['Nele Neuhaus', 'Sebastian Fitzek', 'Klaus-Peter Wolf', 'Donna Leon'],
  'Kriminalroman':       ['Nele Neuhaus', 'Sebastian Fitzek', 'Klaus-Peter Wolf'],
  'Crime Fiction':       ['Nele Neuhaus', 'Sebastian Fitzek', 'Ursula Poznanski'],
  'Mystery & Detective': ['Nele Neuhaus', 'Ursula Poznanski', 'Donna Leon'],
  'Mystery':             ['Nele Neuhaus', 'Ursula Poznanski', 'Klaus-Peter Wolf'],
  'Thriller':            ['Sebastian Fitzek', 'Marc Elsberg', 'Harlan Coben', 'James Patterson'],
  'Suspense':            ['Sebastian Fitzek', 'Marc Elsberg', 'Harlan Coben'],
  'Liebesroman':         ['Colleen Hoover', 'Emily Henry', 'Hannah Grace', 'Mona Kasten', 'Ali Hazelwood'],
  'Romance':             ['Colleen Hoover', 'Emily Henry', 'Hannah Grace', 'Ali Hazelwood'],
  'Love Stories':        ['Colleen Hoover', 'Emily Henry', 'Jojo Moyes'],
  "Women's Fiction":     ['Colleen Hoover', 'Emily Henry', 'Jojo Moyes', 'Liane Moriarty'],
  'Romantasy':           ['Rebecca Yarros', 'Sarah J. Maas', 'Jennifer L. Armentrout', 'Holly Black', 'Alexis Hall'],
  'Fantasy':             ['Brandon Sanderson', 'Leigh Bardugo', 'Travis Baldree', 'V.E. Schwab'],
  'Historical Fiction':  ['Philippa Gregory', 'Ken Follett', 'Kristin Hannah', 'Lisa See'],
  'Historischer Roman':  ['Ken Follett', 'Philippa Gregory', 'Rebecca Gablé', 'Kristin Hannah'],
  'Science Fiction':     ['Andy Weir', 'Blake Crouch', 'Martha Wells', 'Andreas Eschbach'],
  'Horror':              ['Stephen King', 'Paul Tremblay', 'Riley Sager', 'Joe Hill'],
  'Humor':               ['Hape Kerkeling', 'Bastian Sick', 'Eckart von Hirschhausen'],
  'Drama':               ['Jojo Moyes', 'Liane Moriarty', 'Kristin Hannah', 'Picoult Jodi'],
  'Literary Fiction':    ['Juli Zeh', 'Daniel Kehlmann', 'Ferdinand von Schirach', 'Benedict Wells'],
  'Abenteuer':           ['Frank Schätzing', 'Ken Follett', 'Andy Weir'],
  'Adventure':           ['Frank Schätzing', 'Ken Follett', 'Andy Weir'],
  'Biografie':           ['Prince Harry', 'Britney Spears', 'Michelle Obama', 'Hape Kerkeling'],
  'Biography & Autobiography': ['Prince Harry', 'Britney Spears', 'Michelle Obama'],
  'Health & Fitness':    ['Giulia Enders', 'Bas Kast', 'Eckart von Hirschhausen'],
  'Self-Help':           ['Brené Brown', 'Mark Manson', 'Eckart von Hirschhausen'],
  'Body, Mind & Spirit': ['Giulia Enders', 'Bas Kast', 'Brené Brown'],
};

/* ===== STATE ===== */
const S = {
  code:                  null,
  authors:               [],
  books:                 {},
  genreStats:            {},
  expandedBook:          null,
  editingBook:           null,
  bookFilter:            'alle',
  selectedRating:        null,
  selectedReadYear:      null,
  selectedDiscoverGenre: null,
  favSearch:             '',
  wishlist:              [],
  newReleasesAll:        [],
  suggestions:           [],
  authorBookFilter:      {},
  dismissedAuthors:      new Set(),
  customSuggestedAuthors: [],
};

/* ===== FIREBASE ===== */
let db = null;
function initFirebase() {
  try { firebase.initializeApp(window.FIREBASE_CONFIG); db = firebase.firestore(); return true; }
  catch(e) { console.error('Firebase init failed', e); return false; }
}
function col(path) { return db.collection(`buecherwelt/${S.code}/${path}`); }

async function loadAllData() {
  const [authSnap, genreSnap, wishSnap] = await Promise.all([
    col('authors').orderBy('addedAt').get(),
    col('meta').doc('genres').get(),
    col('wishlist').orderBy('addedAt').get(),
  ]);
  S.authors    = authSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  S.genreStats = genreSnap.exists ? genreSnap.data() : {};
  S.wishlist   = wishSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const snaps  = await Promise.all(S.authors.map(a => col('books').where('authorId','==',a.id).get()));
  S.books = {};
  S.authors.forEach((a,i) => { S.books[a.id] = snaps[i].docs.map(d => ({ id: d.id, ...d.data() })); });
}

async function saveAuthor(a)       { await col('authors').doc(a.id).set(a); }
async function saveBook(b)         { await col('books').doc(b.id).set(b); }
async function updateBook(id,up)   { await col('books').doc(id).update(up); }
async function updateAuthorMeta(id,up) { await col('authors').doc(id).update(up); }
async function saveGenreStats(s)   { await col('meta').doc('genres').set(s); }
async function saveWishItem(w)     { await col('wishlist').doc(w.id).set(w); }
async function deleteWishItem(id)  { await col('wishlist').doc(id).delete(); }
async function deleteAuthorFromDb(authorId) {
  const books = S.books[authorId] || [];
  await Promise.all(books.map(b => col('books').doc(b.id).delete()));
  await col('authors').doc(authorId).delete();
}

let _deleteTimer = null;
let _deletePending = null;

function startDeleteAuthor(authorId, name) {
  if (_deleteTimer) { clearTimeout(_deleteTimer); commitDelete(); }
  const authorObj = S.authors.find(a => a.id===authorId);
  _deletePending = { authorId, author: authorObj };
  // Hide from Autoren tab but keep books/ratings in Bücher tab
  if (authorObj) authorObj.hidden = true;
  renderAutoren(); renderAlleBuecher(); renderFavoriten();
  showDeleteToast(name);
  _deleteTimer = setTimeout(commitDelete, 5000);
}

function undoDelete() {
  if (!_deletePending) return;
  clearTimeout(_deleteTimer); _deleteTimer = null;
  const authorObj = S.authors.find(a => a.id===_deletePending.authorId);
  if (authorObj) authorObj.hidden = false;
  _deletePending = null;
  hideDeleteToast();
  renderAutoren(); renderAlleBuecher(); renderFavoriten();
}

async function commitDelete() {
  if (!_deletePending) return;
  const {authorId} = _deletePending;
  _deletePending = null; _deleteTimer = null;
  hideDeleteToast();
  // Keep books & ratings — just mark author as hidden in Firebase
  try { await col('authors').doc(authorId).update({ hidden: true }); } catch(e) { console.error(e); }
}

function showDeleteToast(name) {
  const t = document.getElementById('delete-toast');
  document.getElementById('delete-toast-name').textContent = name;
  t.classList.remove('hidden');
  t.classList.add('visible');
}
function hideDeleteToast() {
  const t = document.getElementById('delete-toast');
  t.classList.remove('visible');
  setTimeout(()=>t.classList.add('hidden'), 300);
}



/* ===== GOOGLE BOOKS API ===== */
const API = 'https://www.googleapis.com/books/v1/volumes';
const BOOKS_KEY = 'AIzaSyD50NVJzvuje5QWECItyUBAu3wbBsWB0_s';
async function fetchJson(url) { const r = await fetch(url + (url.includes('?') ? '&' : '?') + 'key=' + BOOKS_KEY); if (!r.ok) throw new Error(r.status); return r.json(); }

/* ===== INLINE AUTHOR SEARCH ===== */
let _inlineAuthorTimer = null;
function debouncedInlineAuthorSearch(v) {
  const clear = document.getElementById('ias-clear');
  const res   = document.getElementById('inline-author-results');
  if (clear) clear.classList.toggle('hidden', !v.trim());
  if (!v.trim()) { res.classList.add('hidden'); res.innerHTML=''; return; }
  res.classList.remove('hidden');
  res.innerHTML = '<p class="btr-status">Suche …</p>';
  clearTimeout(_inlineAuthorTimer);
  _inlineAuthorTimer = setTimeout(() => _doInlineAuthorSearch(v.trim()), 420);
}

async function _doInlineAuthorSearch(q) {
  const res = document.getElementById('inline-author-results');
  try {
    const data = await fetchJson(`${API}?q=inauthor:${encodeURIComponent('"'+q+'"')}&maxResults=20&fields=items(volumeInfo(authors,imageLinks))`);
    const seen = new Map();
    (data.items||[]).forEach(item => (item.volumeInfo?.authors||[]).forEach(n => {
      if (!seen.has(n)) seen.set(n, item.volumeInfo?.imageLinks?.thumbnail||null);
    }));
    const ql = q.toLowerCase();
    const matched = [...seen.entries()]
      .filter(([n]) => n.toLowerCase().includes(ql) || ql.split(' ').every(w => n.toLowerCase().includes(w)))
      .slice(0,8);
    if (!matched.length) { res.innerHTML = '<p class="btr-status">Keine Ergebnisse – anderen Namen versuchen?</p>'; return; }
    res.innerHTML = matched.map(([name, img]) => {
      const already = S.authors.some(a => !a.hidden && a.name.toLowerCase() === name.toLowerCase());
      const av = img ? `<img class="author-result-avatar" src="${img.replace('http://','https://')}" alt="">` : `<div class="author-result-ph">✍️</div>`;
      return `<div class="author-result ${already?'already-added':''}">
        ${av}<div><div class="author-result-name">${esc(name)}</div></div>
        ${already ? `<span class="already-label">✓ Gespeichert</span>`
                  : `<button class="author-result-add" data-name="${esc(name)}" data-img="${esc(img||'')}">+ Hinzufügen</button>`}
      </div>`;
    }).join('');
    res.onclick = e => {
      const btn = e.target.closest('.author-result-add');
      if (!btn) return;
      addAuthor(btn.dataset.name, btn.dataset.img || null);
      clearInlineAuthorSearch();
    };
  } catch { res.innerHTML = '<p class="btr-status">Fehler – bitte nochmal versuchen.</p>'; }
}

function clearInlineAuthorSearch() {
  const input = document.getElementById('inline-author-search');
  const res   = document.getElementById('inline-author-results');
  const clear = document.getElementById('ias-clear');
  if (input) input.value = '';
  if (res)   { res.classList.add('hidden'); res.innerHTML = ''; }
  if (clear) clear.classList.add('hidden');
}

function renderInlineSuggestedChips() {
  const container = document.getElementById('inline-suggested-chips');
  if (!container) return;
  // Custom (from Discover) first, then default list — no duplicates
  const allSuggestions = [...new Set([...S.customSuggestedAuthors, ...SUGGESTED_AUTHORS])];
  const visible = allSuggestions.filter(n => !S.dismissedAuthors.has(n));
  const hasDismissed = S.dismissedAuthors.size > 0 || S.customSuggestedAuthors.some(n => S.dismissedAuthors.has(n));
  container.innerHTML = visible.map(name => {
    const added = S.authors.some(a => !a.hidden && a.name.toLowerCase()===name.toLowerCase());
    if (added) return `<button class="suggested-chip" disabled data-name="${esc(name)}">✓ ${esc(name)}</button>`;
    return `<button class="suggested-chip has-x" data-name="${esc(name)}">
      <span class="chip-name">${esc(name)}</span>
      <span class="chip-sep"></span>
      <span class="chip-x" onclick="event.stopPropagation();dismissSuggestedAuthor('${esc(name)}')">✕</span>
    </button>`;
  }).join('') + (hasDismissed ? `<button class="author-tips-reset" onclick="resetDismissedAuthors()">Zurücksetzen</button>` : '');
  container.onclick = e => {
    if (e.target.classList.contains('chip-x')) return;
    const btn = e.target.closest('button[data-name]');
    if (!btn || btn.disabled) return;
    addAuthor(btn.dataset.name, null);
  };
}

async function fetchBooksForAuthor(name, lang = 'de') {
  const data = await fetchJson(`${API}?q=inauthor:${encodeURIComponent('"'+name+'"')}&maxResults=40&orderBy=newest&langRestrict=${lang}`);
  const last  = name.split(' ').slice(-1)[0].toLowerCase();
  return dedupeRaw((data.items||[])
    .filter(i => matchesLang(i, lang) && (i.volumeInfo?.authors||[]).some(a => a.toLowerCase().includes(last))))
    .map(i => ({
      id: i.id, googleId: i.id,
      title:   i.volumeInfo?.title   || 'Unbekannt',
      subtitle:i.volumeInfo?.subtitle|| '',
      authors: i.volumeInfo?.authors || [name],
      coverId: i.volumeInfo?.imageLinks?.thumbnail?.replace('http://','https://')||null,
      year:   (i.volumeInfo?.publishedDate||'').slice(0,4),
      genres:   i.volumeInfo?.categories||[],
      language: i.volumeInfo?.language || lang,
      description: stripHtml(i.volumeInfo?.description||'').slice(0,500),
      rating: null, note:'', isFavorite:false, isNew:false, addedAt:Date.now(),
    }));
}

async function switchAuthorLang(authorId, lang) {
  const author = S.authors.find(a => a.id === authorId);
  if (!author || author.lang === lang) return;
  showLoading(`Bücher auf ${lang === 'de' ? 'Deutsch' : 'Englisch'} werden geladen …`);
  try {
    const newBooks = await fetchBooksForAuthor(author.name, lang);
    const withAuth = newBooks.map(b => ({...b, authorId, id:`${authorId}_${b.googleId}`}));
    // Remove old books from Firebase
    const oldBooks = S.books[authorId] || [];
    await Promise.all(oldBooks.map(b => col('books').doc(b.id).delete()));
    // Save new books
    await Promise.all(withAuth.map(b => saveBook(b)));
    // Update author lang + genres
    author.lang = lang;
    author.genres = [...new Set(newBooks.flatMap(b=>b.genres))].slice(0,5);
    await updateAuthorMeta(authorId, { lang: author.lang, genres: author.genres });
    S.books[authorId] = withAuth;
    renderAutoren(); renderAlleBuecher(); renderFavoriten();
  } catch(e) { console.error(e); alert('Fehler beim Laden – bitte nochmal versuchen.'); }
  finally { hideLoading(); }
}

async function checkNewBooksForAuthor(author) {
  const lang = author.lang || 'de';
  const cutoffYear = new Date().getFullYear() - 1;
  const last = author.name.split(' ').slice(-1)[0].toLowerCase();
  const data  = await fetchJson(`${API}?q=inauthor:${encodeURIComponent('"'+author.name+'"')}&maxResults=20&orderBy=newest&langRestrict=${lang}`);
  return dedupeRaw((data.items||[])
    .filter(i => {
      const yr = parseInt((i.volumeInfo?.publishedDate||'').slice(0,4));
      const authorsOk = (i.volumeInfo?.authors||[]).some(a=>a.toLowerCase().includes(last));
      return yr && yr >= cutoffYear && authorsOk && matchesLang(i, lang);
    }))
    .map(i => ({ id:i.id, googleId:i.id, title:i.volumeInfo?.title||'?',
      authors:i.volumeInfo?.authors||[author.name],
      coverId:i.volumeInfo?.imageLinks?.thumbnail?.replace('http://','https://')||null,
      year:(i.volumeInfo?.publishedDate||'').slice(0,4),
      genres:i.volumeInfo?.categories||[], authorName:author.name, authorId:author.id }));
}

// Maps raw Google Books items → our book objects
function mapBookItems(items) {
  return items.map(i => ({
    id:i.id, title:i.volumeInfo?.title||'?', authors:i.volumeInfo?.authors||[],
    coverId:i.volumeInfo?.imageLinks?.thumbnail?.replace('http://','https://')||null,
    year:(i.volumeInfo?.publishedDate||'').slice(0,4),
    description:stripHtml(i.volumeInfo?.description||'').slice(0,500),
  }));
}

// Shared helper: fetch books for a genre, sorted newest first.
// Fetch recent bestselling books for a genre.
// Strategy: search "Bestseller + {genre keyword}" — returns books Google Books
// knows are bestsellers in that category, newest first.
async function fetchBooksForGenre(apiQuery, genreName = '') {
  const cutoff = new Date().getFullYear() - 4; // last 4 years
  // Map genre to a good search keyword (shorter than full API query)
  const GENRE_KEYWORD = {
    'Thriller':'Thriller','Krimi':'Krimi','Kriminalroman':'Krimi',
    'Liebesroman':'Liebesroman','Romance':'Romance','Romantasy':'Romantasy',
    'Fantasy':'Fantasy','Horror':'Horror','Science Fiction':'Science Fiction',
    'Historischer Roman':'Historischer Roman','Historical Fiction':'Historical Fiction',
    'Biografie':'Biografie','Biography & Autobiography':'Biografie',
    'Humor':'Humor','Drama':'Roman','Abenteuer':'Abenteuer',
    'Literary Fiction':'Literatur','Self-Help':'Ratgeber','Health & Fitness':'Gesundheit',
  };
  const keyword = GENRE_KEYWORD[genreName] || (apiQuery.startsWith('NEW:') ? apiQuery.slice(4) : apiQuery);

  // Two parallel searches: Spiegel-Bestseller + genre, and general bestseller + genre
  const [d1, d2] = await Promise.all([
    fetchJson(`${API}?q=${encodeURIComponent('"Spiegel-Bestseller" '+keyword)}&langRestrict=de&orderBy=newest&maxResults=30`)
      .then(d=>d.items||[]).catch(()=>[]),
    fetchJson(`${API}?q=${encodeURIComponent('Bestseller '+keyword)}&langRestrict=de&orderBy=newest&maxResults=30`)
      .then(d=>d.items||[]).catch(()=>[]),
  ]);

  const seen = new Set();
  const merged = [...d1, ...d2].filter(i => {
    if (seen.has(i.id)) return false;
    seen.add(i.id);
    const yr = parseInt((i.volumeInfo?.publishedDate||'').slice(0,4));
    return !yr || yr >= cutoff;
  }).sort((a,b)=>{
    const ya=parseInt((a.volumeInfo?.publishedDate||'0').slice(0,4))||0;
    const yb=parseInt((b.volumeInfo?.publishedDate||'0').slice(0,4))||0;
    return yb-ya;
  });

  return limitPerAuthor(dedupeBooks(mapBookItems(merged.slice(0,24))));
}

// Build a reverse lookup: author name (lowercase) → genres they appear in GENRE_AUTHORS
function buildAuthorGenreMap() {
  const map = {};
  for (const [genre, authors] of Object.entries(GENRE_AUTHORS)) {
    for (const author of authors) {
      (map[author.toLowerCase()] = map[author.toLowerCase()] || []).push(genre);
    }
  }
  return map;
}

// Genres that have a meaningful search mapping (used to filter out bad Google tags)
function isKnownGenre(g) {
  return !!(GENRE_API_MAP[g] || GENRE_EN_MAP[g] || GENRE_AUTHORS[g]);
}

// "Für dich" — author-similarity based on liked/favorited books
async function fetchPersonalizedSuggestions() {
  const knownAuthors = new Set(S.authors.map(a => a.name.toLowerCase()));
  const ownedGoogleIds = new Set();
  S.authors.forEach(a => (S.books[a.id]||[]).forEach(b => ownedGoogleIds.add(b.googleId)));

  const likedAuthors = S.authors.filter(a =>
    (S.books[a.id]||[]).some(b => b.rating === 'liked' || b.isFavorite)
  );

  if (likedAuthors.length > 0) {
    // Step 1: find similar authors via GENRE_AUTHORS similarity map
    const authorGenreMap = buildAuthorGenreMap();
    const sugAuthors = [];
    const seen = new Set();
    for (const a of likedAuthors) {
      const genres = authorGenreMap[a.name.toLowerCase()] || [];
      const bookGenres = [];
      (S.books[a.id]||[]).filter(b => b.rating==='liked'||b.isFavorite).forEach(b =>
        (b.genres||[]).filter(g => !SKIP_GENRES.has(g) && GENRE_AUTHORS[g]).forEach(g => bookGenres.push(g))
      );
      for (const genre of [...new Set([...genres, ...bookGenres])]) {
        for (const sug of (GENRE_AUTHORS[genre] || [])) {
          if (!seen.has(sug.toLowerCase()) && !knownAuthors.has(sug.toLowerCase())) {
            seen.add(sug.toLowerCase()); sugAuthors.push({ name: sug, because: a.name });
          }
        }
      }
    }
    if (sugAuthors.length > 0) {
      const books = [];
      for (const { name: sugName, because } of sugAuthors.slice(0, 5)) {
        try {
          const ab = await fetchBooksForAuthor(sugName, 'de');
          ab.filter(b => !ownedGoogleIds.has(b.googleId)).slice(0, 3)
            .forEach(b => books.push({ ...b, _because: because }));
        } catch {}
        if (books.length >= 16) break;
      }
      if (books.length >= 3) return books.slice(0, 16);
    }

    // Step 2: author-similarity failed → use genres from LIKED books only,
    // but only genres we know how to search (filters out bad Google tags like "Health & Fitness")
    const likedGenres = {};
    likedAuthors.forEach(a => {
      (S.books[a.id]||[]).filter(b => b.rating==='liked'||b.isFavorite).forEach(b => {
        (b.genres||[]).filter(g => !SKIP_GENRES.has(g) && isKnownGenre(g)).forEach(g => {
          likedGenres[g] = (likedGenres[g] || 0) + 1;
        });
      });
    });
    const topLikedGenres = Object.entries(likedGenres).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([g])=>g);
    if (topLikedGenres.length > 0) {
      const books = [];
      const because = likedAuthors[0]?.name;
      for (const genre of topLikedGenres) {
        const gb = await fetchBooksForGenre(genreForApi(genre), genre);
        gb.filter(b => !knownAuthors.has((b.authors?.[0]||'').toLowerCase()) && !ownedGoogleIds.has(b.googleId))
          .slice(0, 6).forEach(b => books.push({ ...b, _because: because }));
        if (books.length >= 16) break;
      }
      if (books.length >= 3) return limitPerAuthor(dedupeBooks(books)).slice(0, 16);
    }
  }

  // No liked books at all → show current popular German fiction
  return fetchNeuerscheinungen();
}

async function fetchGenreSuggestions(stats) {
  // Used when a specific genre is selected — only genres with known mappings to avoid bad tags
  let top = Object.entries(stats).filter(([g])=>!SKIP_GENRES.has(g) && isKnownGenre(g))
    .sort((a,b)=>b[1]-a[1]).slice(0,3).map(([g])=>g);
  if (!top.length) top = ['Krimi', 'Liebesroman', 'Thriller'];
  const books = [];
  const knownAuthors = new Set(S.authors.map(a => a.name.toLowerCase()));
  const ownedGoogleIds = new Set();
  S.authors.forEach(a => (S.books[a.id]||[]).forEach(b => ownedGoogleIds.add(b.googleId)));
  for (const genre of top) {
    const genreBooks = await fetchBooksForGenre(genreForApi(genre), genre);
    genreBooks
      .filter(b => !knownAuthors.has((b.authors?.[0]||'').toLowerCase()) && !ownedGoogleIds.has(b.googleId))
      .forEach(b => books.push(b));
    if (books.length >= 16) break;
  }
  return dedupeBooks(books).slice(0,16);
}

/* ===== BOOK TITLE SEARCH ===== */
let _bookTimer = null;
function onBookTitleInput(v) {
  document.getElementById('bts-clear').classList.toggle('hidden', !v.trim());
  const res = document.getElementById('book-title-results');
  if (!v.trim()) { res.classList.add('hidden'); res.innerHTML=''; return; }
  res.classList.remove('hidden');
  res.innerHTML = '<p class="btr-status">Suche …</p>';
  clearTimeout(_bookTimer);
  _bookTimer = setTimeout(() => searchBookByTitle(v.trim()), 420);
}

function clearBookTitleSearch() {
  document.getElementById('book-title-search').value='';
  document.getElementById('book-title-results').classList.add('hidden');
  document.getElementById('book-title-results').innerHTML='';
  document.getElementById('bts-clear').classList.add('hidden');
}

async function searchBookByTitle(query) {
  const res = document.getElementById('book-title-results');
  const ql  = query.toLowerCase();
  const local = [];
  S.authors.forEach(a => (S.books[a.id]||[]).forEach(b => {
    if (b.title.toLowerCase().includes(ql)) local.push({...b, _authorName:a.name, _local:true});
  }));
  let api = [];
  try {
    const data = await fetchJson(`${API}?q=${encodeURIComponent(query)}&maxResults=8&fields=items(id,volumeInfo(title,authors,imageLinks,publishedDate))`);
    api = (data.items||[]).map(i => ({
      id:i.id, title:i.volumeInfo?.title||'', _local:false,
      _authorName:(i.volumeInfo?.authors||[])[0]||'',
      coverId:i.volumeInfo?.imageLinks?.thumbnail?.replace('http://','https://')||null,
      year:(i.volumeInfo?.publishedDate||'').slice(0,4),
    })).filter(b => b.title.toLowerCase().includes(ql)||query.length<5);
  } catch {}
  const seen = new Set(local.map(b=>b.title.toLowerCase()));
  const all  = [...local, ...api.filter(b=>!seen.has(b.title.toLowerCase()))].slice(0,9);
  if (!all.length) { res.innerHTML='<p class="btr-status">Keine Treffer gefunden.</p>'; return; }
  res.innerHTML = all.map(book => {
    const savedAuthor    = S.authors.find(a => a.name.toLowerCase()===(book._authorName||'').toLowerCase());
    const bookAlreadySaved = savedAuthor && (S.books[savedAuthor.id]||[]).some(b => b.googleId===book.id);
    const isRated        = book._local && !!book.rating;
    const cov            = book.coverId ? `<img class="btr-cover" src="${book.coverId}" alt="" loading="lazy">` : `<div class="btr-cover-ph">📖</div>`;
    const onWish         = !book._local && S.wishlist.some(w => w.googleId===book.id);
    let badge = '';
    if (book._local || bookAlreadySaved) {
      badge = `<span class="btr-saved">${isRated?ratingEmoji(book.rating)+' Bewertet':'✓ In Liste'}</span>`;
    } else {
      const wishBtn  = `<button class="btn-wish-sm${onWish?' on-wish':''}" data-gid="${esc(book.id)}" data-title="${esc(book.title)}" data-author="${esc(book._authorName||'')}" data-cover="${esc(book.coverId||'')}" data-year="${esc(book.year||'')}" onclick="event.stopPropagation();addToWishlistFromBtn(this)">${onWish?'✓🛒':'🛒'}</button>`;
      // Always show "+ Buch" — use data-attrs to avoid &-encoding issues in onclick
      const actionBtn = book._authorName
        ? `<button class="btn-add-from-search" data-gid="${esc(book.id)}" data-title="${esc(book.title)}" data-author="${esc(book._authorName||'')}" data-cover="${esc(book.coverId||'')}" data-year="${esc(book.year||'')}" onclick="event.stopPropagation();addBookDirectFromBtn(this)">+ Buch</button>`
        : '';
      badge = `<div class="btr-badge-row">${actionBtn}${wishBtn}</div>`;
    }
    return `<div class="btr-item${isRated?' already-read':''}" ${(book._local||bookAlreadySaved) ? `onclick="jumpToBook('${book.authorId||savedAuthor?.id}','${book._local?book.id:(savedAuthor?.id+'_'+book.id)}')"` : ''}>
      ${cov}<div class="btr-info"><div class="btr-title">${esc(book.title)}</div><div class="btr-author">${esc(book._authorName)}${book.year?' · '+book.year:''}</div></div>${badge}
    </div>`;
  }).join('');
}

function jumpToBook(authorId, bookId) {
  clearBookTitleSearch();
  const card = document.getElementById(`author-${authorId}`);
  if (card && !card.classList.contains('expanded')) card.classList.add('expanded');
  setTimeout(() => { toggleBookExpand(authorId, bookId); document.getElementById(`bc-${bookId}`)?.scrollIntoView({behavior:'smooth',block:'center'}); }, 100);
}
async function addAuthorFromSearch(name) { await addAuthor(name, null); }

async function addBookToExistingAuthor(googleId, title, authorName, coverId, year) {
  const author = S.authors.find(a => a.name.toLowerCase()===authorName.toLowerCase());
  if (!author) return;
  const bookId = `${author.id}_${googleId}`;
  const existingInAuthor = (S.books[author.id]||[]).find(b => b.id===bookId);
  if (existingInAuthor) {
    if (existingInAuthor.hiddenFromList) {
      // Book was removed — restore it
      existingInAuthor.hiddenFromList = false;
      await updateBook(bookId, { hiddenFromList: false });
      renderAutoren(); renderAlleBuecher();
      clearBookTitleSearch();
      switchTab('buecher');
      setTimeout(() => document.getElementById(`li-${bookId}`)?.scrollIntoView({behavior:'smooth',block:'center'}), 200);
    } else {
      jumpToBook(author.id, bookId);
    }
    return;
  }
  const lang    = author.lang || 'de';
  const newBook = {
    id: bookId, googleId, authorId: author.id,
    title, subtitle: '', authors: [authorName],
    coverId: coverId||null, year, genres: [],
    language: lang, description: '',
    rating: null, note: '', isFavorite: false, isNew: true, addedAt: Date.now(),
  };
  await saveBook(newBook);
  if (!S.books[author.id]) S.books[author.id] = [];
  S.books[author.id].push(newBook);
  renderAutoren(); renderAlleBuecher();
  clearBookTitleSearch();
  if (!author.hidden) {
    switchTab('autoren');
    setTimeout(() => {
      const card = document.getElementById(`author-${author.id}`);
      if (card && !card.classList.contains('expanded')) card.classList.add('expanded');
      setTimeout(() => document.getElementById(`bc-${bookId}`)?.scrollIntoView({behavior:'smooth',block:'center'}), 300);
    }, 100);
  } else {
    switchTab('buecher');
    setTimeout(() => document.getElementById(`li-${bookId}`)?.scrollIntoView({behavior:'smooth',block:'center'}), 200);
  }
}

function addBookDirectFromBtn(btn) {
  addBookDirect(btn.dataset.gid, btn.dataset.title, btn.dataset.author, btn.dataset.cover, btn.dataset.year);
}

// Adds a book directly to Bücher — creates a hidden author if needed (not shown in Autoren tab)
async function addBookDirect(googleId, title, authorName, coverId, year) {
  // If author already saved (visible or hidden), add book to them
  const existing = S.authors.find(a => a.name.toLowerCase()===authorName.toLowerCase());
  if (existing) { await addBookToExistingAuthor(googleId, title, authorName, coverId, year); return; }
  // Create hidden author so book appears in Bücher but not in Autoren
  const authorId = 'a_' + Date.now();
  const newAuthor = { id: authorId, name: authorName, genres: [], lang: 'de', hidden: true, addedAt: Date.now() };
  await col('authors').doc(authorId).set(newAuthor);
  S.authors.push(newAuthor);
  S.books[authorId] = [];
  await addBookToExistingAuthor(googleId, title, authorName, coverId, year);
}

/* ===== PER-AUTHOR BOOK FILTER ===== */
function filterAuthorBooks(authorId, query) {
  S.authorBookFilter[authorId] = query;
  const books = dedupeBooks((S.books[authorId]||[]).filter(b => !query || b.title.toLowerCase().includes(query.toLowerCase())));
  const grid  = document.getElementById(`grid-${authorId}`);
  const count = document.getElementById(`count-${authorId}`);
  if (grid)  grid.innerHTML  = renderBooksGrid(books, authorId);
  if (count) count.textContent = `${books.length} ${books.length===1?'Buch':'Bücher'}`;
}

/* ===== LOGIN ===== */
function doLogin() {
  const code = document.getElementById('login-code').value.trim();
  if (code.length < 3) { document.getElementById('login-error').classList.remove('hidden'); return; }
  S.code = code.toLowerCase().replace(/\s+/g,'-');
  localStorage.setItem('bw_code', S.code);
  startApp();
}
function startApp() {
  S.dismissedAuthors = loadDismissedAuthors();
  S.customSuggestedAuthors = loadCustomSuggestions();
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  loadAndRender();
}

/* ===== INIT ===== */
window.addEventListener('DOMContentLoaded', () => {
  if (!initFirebase()) {
    document.querySelector('.login-sub').textContent = 'Firebase ist noch nicht eingerichtet – bitte EINRICHTUNG.md lesen.';
    return;
  }
  const saved = localStorage.getItem('bw_code');
  if (saved) { S.code = saved; startApp(); }
});

async function loadAndRender() {
  showLoading('Bücher werden geladen …');
  try { await loadAllData(); renderAutoren(); renderAlleBuecher(); renderFavoriten(); renderMerkliste(); renderStatistik(); await loadDiscover(); }
  catch(e) { console.error(e); }
  finally { hideLoading(); }
  // Background: re-fetch books for authors whose stored books have no language field
  migrateBookLanguages().catch(() => {});
}

async function migrateBookLanguages() {
  let changed = false;
  for (const author of S.authors) {
    const books = S.books[author.id] || [];
    if (!books.length) continue;
    // Skip if books already have a truthy language field (migrated)
    if (books[0]?.language) continue;
    const lang = author.lang || 'de';
    try {
      const newBooks = await fetchBooksForAuthor(author.name, lang);
      if (!newBooks.length) continue;
      const withAuth = newBooks.map(b => ({...b, authorId: author.id, id:`${author.id}_${b.googleId}`}));
      await Promise.all(books.map(b => col('books').doc(b.id).delete()));
      await Promise.all(withAuth.map(b => saveBook(b)));
      S.books[author.id] = withAuth;
      changed = true;
    } catch(e) { console.error('Lang migration failed for', author.name, e); }
  }
  if (changed) { renderAutoren(); renderAlleBuecher(); renderFavoriten(); }
}

/* ===== NAVIGATION ===== */
const DISCOVER_REFRESH_MS = 6 * 60 * 60 * 1000; // 6 hours
let _lastDiscoverLoad = 0;

function switchTab(tab) {
  document.querySelectorAll('.bnav-btn').forEach(b => b.classList.toggle('nav-active', b.dataset.tab===tab));
  document.querySelectorAll('.tab-content').forEach(s => s.classList.toggle('active', s.id===`tab-${tab}`));
  if (tab==='statistik') renderStatistik();
  if (tab==='merkliste') renderMerkliste();
  if (tab==='entdecken') {
    if (Date.now() - _lastDiscoverLoad > DISCOVER_REFRESH_MS) loadDiscover();
    else renderDiscover();
  }
}

function goToNewBook(authorId) {
  switchTab('entdecken');
  // Give the tab a moment to become visible, then scroll to the author's new book
  requestAnimationFrame(() => {
    const nrl = document.getElementById('new-releases-list');
    if (!nrl) return;
    const cards = nrl.querySelectorAll('.disc-card');
    for (const card of cards) {
      try {
        const book = JSON.parse(card.dataset.book.replace(/&#39;/g,"'"));
        if (book.authorId === authorId) {
          card.scrollIntoView({behavior:'smooth', block:'nearest', inline:'center'});
          card.style.outline = '2.5px solid var(--rose)';
          card.style.borderRadius = '13px';
          setTimeout(() => { card.style.outline = ''; }, 2000);
          break;
        }
      } catch {}
    }
  });
}

/* ===== LOADING ===== */
function showLoading(text='Wird geladen …') {
  document.getElementById('loading-text').textContent=text;
  document.getElementById('loading-overlay').classList.remove('hidden');
}
function hideLoading() { document.getElementById('loading-overlay').classList.add('hidden'); }

/* ===== MODALS ===== */
function handleModalClick(e, modalId) {
  if (e.target.id === modalId) {
    if (modalId==='modal-edit-book')   closeEditBookModal();
    if (modalId==='modal-disc-detail') closeDiscDetail();
  }
}

async function addAuthor(name, imgUrl) {
  // If author exists as hidden (added via +Buch), make them visible instead of skipping
  const existingHidden = S.authors.find(a => a.hidden && a.name.toLowerCase()===name.toLowerCase());
  if (existingHidden) {
    // Make visible and fetch proper book list
    existingHidden.hidden = false;
    showLoading(`Bücher von ${name} werden geladen …`);
    try {
      const books  = await fetchBooksForAuthor(existingHidden.name);
      const genres = [...new Set(books.flatMap(b=>b.genres))].slice(0,5);
      const withAuth = books.map(b => ({...b, authorId: existingHidden.id, id:`${existingHidden.id}_${b.googleId}`}));
      if (genres.length) existingHidden.genres = genres;
      S.books[existingHidden.id] = withAuth;
      await col('authors').doc(existingHidden.id).update({ hidden: false, genres: existingHidden.genres });
      await Promise.all(withAuth.map(b => saveBook(b)));
    } catch { await col('authors').doc(existingHidden.id).update({ hidden: false }); }
    hideLoading();
    renderAutoren(); renderAlleBuecher();
    return;
  }
  if (S.authors.some(a => a.name.toLowerCase()===name.toLowerCase())) return;
  clearInlineAuthorSearch();
  showLoading(`Bücher von ${name} werden geladen …`);
  let author, withAuth;
  try {
    const books  = await fetchBooksForAuthor(name);
    const genres = [...new Set(books.flatMap(b=>b.genres))].slice(0,5);
    const authorId = `a_${Date.now()}`;
    author   = { id:authorId, name, imageUrl:imgUrl?imgUrl.replace('http://','https://'):null, genres, lang:'de', addedAt:Date.now(), lastChecked:Date.now(), newCount:0 };
    withAuth = books.map(b => ({...b, authorId, id:`${authorId}_${b.googleId}`}));
  } catch(e) { console.error(e); hideLoading(); return; }
  S.authors.push(author);
  S.books[author.id] = withAuth;
  hideLoading();
  renderAutoren(); renderAlleBuecher();
  try {
    await saveAuthor(author);
    await Promise.all(withAuth.map(b => saveBook(b)));
  } catch(e) { console.error('Firestore save error:', e); }
}

/* ===== RENDER: AUTOREN ===== */
function renderAutoren() {
  renderInlineSuggestedChips();
  const list = document.getElementById('authors-list');
  const visibleAuthors = S.authors.filter(a => !a.hidden);
  if (!visibleAuthors.length) {
    list.innerHTML = `<div class="empty"><div class="empty-icon">🍁</div><p>Noch keine Autoren gespeichert.</p><p class="empty-hint">Such oben nach einem Autor!</p></div>`;
    return;
  }
  list.innerHTML = visibleAuthors.map(author => {
    const books    = dedupeBooks(S.books[author.id]||[]);
    const readCount= books.filter(b=>b.rating).length;
    const lang     = author.lang || 'de';
    const av = author.imageUrl
      ? `<img class="author-avatar" src="${author.imageUrl}" alt="${esc(author.name)}">`
      : `<div class="author-avatar-placeholder">✍️</div>`;
    const genres = (author.genres||[]).slice(0,4).map(g=>`<span class="genre-tag">${esc(g)}</span>`).join('');
    const newB   = (author.newCount||0)>0 ? `<span class="author-new-badge" onclick="event.stopPropagation();goToNewBook('${author.id}')">🆕 ${author.newCount} neu</span>` : '';
    const langToggle = `<div class="author-lang-toggle" onclick="event.stopPropagation()">
      <button class="lang-btn${lang==='de'?' active':''}" onclick="switchAuthorLang('${author.id}','de')">DE</button>
      <button class="lang-btn${lang==='en'?' active':''}" onclick="switchAuthorLang('${author.id}','en')">EN</button>
    </div>`;
    return `<div class="author-card" id="author-${author.id}">
      <div class="author-header" onclick="toggleAuthor('${author.id}')">
        ${av}
        <div class="author-info">
          <div class="author-name">${esc(author.name)}</div>
          <div class="author-meta">${books.length} Bücher · ${readCount} bewertet</div>
          <div class="author-genres">${genres}</div>
        </div>
        <div class="author-actions">${newB}${langToggle}<button class="author-delete-btn" onclick="event.stopPropagation();startDeleteAuthor('${author.id}','${esc(author.name)}')">🗑</button><span class="author-toggle">▼</span></div>
      </div>
      <div class="author-books">
        <div class="author-book-filter">
          <input type="text" placeholder="🔍 Bücher durchsuchen …"
                 value="${esc(S.authorBookFilter[author.id]||'')}"
                 oninput="filterAuthorBooks('${author.id}',this.value)">
          <span class="author-books-count" id="count-${author.id}">${books.length} Bücher</span>
        </div>
        <div class="books-grid" id="grid-${author.id}">${renderBooksGrid(books,author.id)}</div>
        <div id="expand-${author.id}"></div>
      </div>
    </div>`;
  }).join('');
}

function toggleAuthor(id) { document.getElementById(`author-${id}`)?.classList.toggle('expanded'); }

function renderBooksGrid(books, authorId) {
  const author = S.authors.find(a => a.id === authorId);
  const lang = author?.lang || 'de';
  books = dedupeBooks(books)
    .filter(b => b.rating || !b.language || b.language === lang)
    .sort((a, b) => parseInt(b.year || 0) - parseInt(a.year || 0));
  if (!books.length) return `<p style="color:var(--tl);font-size:13px;padding:8px 0;grid-column:1/-1;font-family:'Cormorant Garamond',serif;font-style:italic">Kein Buch gefunden.</p>`;
  return books.map(book => {
    const badge   = book.rating ? `<div class="book-rating-badge">${ratingEmoji(book.rating)}</div>` : '';
    const ribbon  = book.isNew  ? `<div class="book-new-ribbon">Neu</div>` : '';
    const isExp   = S.expandedBook?.bookId===book.id;
    const cover   = book.coverId
      ? `<img class="book-cover" src="${book.coverId}" alt="${esc(book.title)}" loading="lazy">`
      : `<div class="book-cover-placeholder"><span class="ph-icon">📖</span><span class="ph-title">${esc(book.title)}</span></div>`;
    return `<div class="book-card ${isExp?'expanded-active':''} ${book.rating?'is-read':''}" id="bc-${book.id}" onclick="toggleBookExpand('${authorId}','${book.id}')">
      <div class="book-cover-wrap">${cover}${badge}${ribbon}</div>
      <div class="book-card-label">${esc(book.title)}</div>
    </div>`;
  }).join('');
}

async function toggleBookExpand(authorId, bookId) {
  const container = document.getElementById(`expand-${authorId}`);
  if (S.expandedBook?.bookId===bookId) { closeBookExpand(authorId); return; }
  S.expandedBook = {authorId,bookId};
  document.querySelectorAll(`#grid-${authorId} .book-card`).forEach(c => c.classList.toggle('expanded-active', c.id===`bc-${bookId}`));
  const book   = getBook(authorId,bookId);
  const author = S.authors.find(a=>a.id===authorId);
  if (!book) return;
  container.innerHTML = renderBookExpand(book, author?.name||'');
  container.scrollIntoView({behavior:'smooth',block:'nearest'});
  if (book.googleId) {
    // Fetch description + ISBN in one call
    try {
      const detailData = await fetchJson(`${API}/${book.googleId}?fields=volumeInfo(description,industryIdentifiers)`);
      // Update description
      const desc = stripHtml(detailData.volumeInfo?.description||'');
      if (desc && desc !== book.description) {
        book.description = desc;
        updateBook(bookId, {description: desc});
        const descEl = container.querySelector('.expand-description-wrap');
        if (descEl) descEl.innerHTML = `<div class="expand-description">${esc(desc)}</div>`;
      }
      // Original year via ISBN → Open Library (cached so API runs once per book)
      if (book.origYear === undefined) {
        const ids  = detailData.volumeInfo?.industryIdentifiers || [];
        const isbn = (ids.find(i=>i.type==='ISBN_13')||ids.find(i=>i.type==='ISBN_10'))?.identifier;
        const lastName = (book.authors?.[0]||author?.name||'').split(' ').slice(-1)[0];
        const currYear = new Date().getFullYear();
        let origYear   = null;
        try {
          // Search OL by ISBN (most precise) then by title+author as fallback
          const queries = isbn
            ? [`isbn=${encodeURIComponent(isbn)}`, `title=${encodeURIComponent(book.title)}&author=${encodeURIComponent(lastName)}`]
            : [`title=${encodeURIComponent(book.title)}&author=${encodeURIComponent(lastName)}`];
          for (const q of queries) {
            const r  = await fetch(`https://openlibrary.org/search.json?${q}&limit=3&fields=first_publish_year`);
            const d  = await r.json();
            const yr = Math.min(...(d.docs||[]).map(x=>x.first_publish_year).filter(y=>y&&y>1800&&y<=currYear));
            if (isFinite(yr)) { origYear = yr; break; }
          }
        } catch {}
        book.origYear = origYear || null;
        updateBook(book.id, {origYear: book.origYear});
        if (origYear && origYear < parseInt(book.year||'9999')) {
          const authorEl = container.querySelector('.expand-author');
          if (authorEl) authorEl.innerHTML =
            `${esc(author?.name||'')}${book.year?' · '+book.year:''} <span class="expand-orig-year">(Erstmals ${origYear})</span>`;
        }
      } else if (book.origYear && book.origYear < parseInt(book.year||'9999')) {
        const authorEl = container.querySelector('.expand-author');
        if (authorEl) authorEl.innerHTML =
          `${esc(author?.name||'')}${book.year?' · '+book.year:''} <span class="expand-orig-year">(Erstmals ${book.origYear})</span>`;
      }
    } catch {}
  }
}

function closeBookExpand(authorId) {
  const c = document.getElementById(`expand-${authorId}`);
  if (c) c.innerHTML='';
  document.querySelectorAll(`#grid-${authorId} .book-card`).forEach(c=>c.classList.remove('expanded-active'));
  if (S.expandedBook?.authorId===authorId) S.expandedBook=null;
}

function renderBookExpand(book, authorName) {
  const emoji = book.rating ? ratingEmoji(book.rating) : null;
  const label = {liked:'Toll!',neutral:'Ok',disliked:'Nicht meins'}[book.rating]||'';
  const descContent = book.description ? `<div class="expand-description">${esc(book.description)}</div>` : `<div class="expand-desc-loading">Beschreibung wird geladen …</div>`;
  return `<div class="book-expand">
    <div class="expand-title">${esc(book.title)}</div>
    <div class="expand-author">${esc(authorName)}${book.year?' · '+book.year:''}</div>
    <div class="expand-description-wrap">${descContent}</div>
    ${emoji ? `<div class="expand-rating"><span class="expand-emoji">${emoji}</span><span class="expand-rating-text">${label}</span></div>`
            : `<div class="expand-rating"><span class="expand-rating-text">Noch nicht bewertet</span></div>`}
    ${book.note ? `<div class="expand-note">${esc(book.note)}</div>`
                : `<div class="expand-note expand-note-empty">Noch keine Notiz.</div>`}
    <div class="expand-actions">
      <button class="btn-edit" onclick="openEditBookModal('${book.authorId}','${book.id}')">✏️ Bewerten &amp; Notiz</button>
      <button class="btn-fav-toggle ${book.isFavorite?'is-fav':''}" onclick="quickToggleFavorite('${book.authorId}','${book.id}')">
        ${book.isFavorite?'⭐ Favorit':'☆ Favorit'}
      </button>
      <button class="btn-wish" onclick="addBookToWishlist('${book.authorId}','${book.id}')">🛒 Merken</button>
      <button class="btn-secondary" onclick="closeBookExpand('${book.authorId}')">Schließen</button>
    </div>
  </div>`;
}

/* ===== RENDER: ALLE BÜCHER ===== */
function renderAlleBuecher() {
  const list = document.getElementById('books-list');
  let all = [];
  S.authors.forEach(a => {
    const lang = a.lang || 'de';
    const authorBooks = dedupeBooks(S.books[a.id]||[]).filter(b => !b.hiddenFromList);
    // Preferred-language books for this author
    const preferred = new Set(authorBooks.filter(b => !b.language || b.language === lang).map(b => normTitle(b.title)));
    authorBooks
      .filter(b => {
        if (!b.language || b.language === lang) return true;       // right language
        if (b.rating && !preferred.has(normTitle(b.title))) return true; // rated & no preferred-lang version exists
        return false;
      })
      .forEach(b => all.push({...b, _authorName: a.name}));
  });
  // Global dedup: remove same-title duplicates across authors/languages, prefer rated then preferred-lang
  const globalSeen = new Map();
  all.forEach(b => {
    const k = normTitle(b.title);
    const ex = globalSeen.get(k);
    if (!ex || (b.rating && !ex.rating)) globalSeen.set(k, b);
  });
  all = [...globalSeen.values()];
  if (S.bookFilter==='gelesen')   all = all.filter(b=>b.rating);
  if (S.bookFilter==='favoriten') all = all.filter(b=>b.isFavorite);
  all.sort((a,b) => { if(b.isFavorite!==a.isFavorite) return b.isFavorite?1:-1; if(!!b.rating!==!!a.rating) return b.rating?1:-1; return a._authorName.localeCompare(b._authorName); });
  if (!all.length) { list.innerHTML = `<div class="empty" id="books-empty"><div class="empty-icon">📖</div><p>Noch keine Bücher vorhanden.</p><p class="empty-hint">Füge zuerst einen Lieblingsautor hinzu!</p></div>`; return; }
  list.innerHTML = all.map(book => {
    const emoji   = book.rating ? ratingEmoji(book.rating) : '';
    const preview = book.note ? book.note.slice(0,80)+(book.note.length>80?'…':'') : '';
    const rc      = {liked:'has-liked',neutral:'has-neutral',disliked:'has-disliked'}[book.rating]||'';
    const cover   = book.coverId ? `<img class="book-list-thumb" src="${book.coverId}" alt="" loading="lazy">` : `<div class="book-list-thumb-ph">📖</div>`;
    return `<div class="book-list-item ${rc}" id="li-${book.id}" data-author-id="${book.authorId}" data-book-id="${book.id}">
      <div class="book-list-row">
        ${cover}
        <div class="book-list-info">
          <div class="book-list-title">${esc(book.title)}</div>
          <div class="book-list-author">${esc(book._authorName)}${book.year?' · '+book.year:''}</div>
          ${preview?`<div class="book-list-note-preview">${esc(preview)}</div>`:''}
        </div>
        <div class="book-list-right">
          ${emoji?`<span class="book-list-emoji">${emoji}</span>`:''}
          ${book.isFavorite?`<span class="book-fav-star">⭐</span>`:''}
          <span class="book-expand-arrow">▼</span>
        </div>
      </div>
      <div class="book-list-expand">
        ${book.description
          ? `<div class="bl-desc">${esc(book.description)}</div>`
          : (book.googleId ? `<div class="bl-desc-loading">Beschreibung wird geladen …</div>` : '')}
        ${book.note?`<div class="expand-note">${esc(book.note)}</div>`:''}
        <div class="expand-actions">
          <button class="btn-edit bl-edit">✏️ Bearbeiten</button>
          <button class="btn-fav-toggle ${book.isFavorite?'is-fav':''} bl-fav">
            ${book.isFavorite?'⭐ Favorit':'☆ Favorit'}
          </button>
          <button class="btn-wish bl-wish">🛒 Merken</button>
          <button class="btn-remove bl-hide">✕ Aus Liste entfernen</button>
        </div>
      </div>
    </div>`;
  }).join('');
  list.onclick = e => {
    const item = e.target.closest('.book-list-item');
    if (!item) return;
    const authorId = item.dataset.authorId;
    const bookId   = item.dataset.bookId;
    if (e.target.closest('.bl-edit'))  { openEditBookModal(authorId, bookId); return; }
    if (e.target.closest('.bl-fav'))   { quickToggleFavorite(authorId, bookId); return; }
    if (e.target.closest('.bl-wish'))  { addBookToWishlist(authorId, bookId); return; }
    if (e.target.closest('.bl-hide'))  { hideBookFromList(authorId, bookId); return; }
    if (e.target.closest('.book-list-row')) {
      if (item.classList.contains('expanded')) { item.classList.remove('expanded'); return; }
      document.querySelectorAll('.book-list-item.expanded').forEach(i=>i.classList.remove('expanded'));
      item.classList.add('expanded');
      lazyLoadListDescription(authorId, bookId, item);
    }
  };
}

function hideBookFromList(authorId, bookId) {
  const book = getBook(authorId, bookId);
  if (!book) return;
  book.hiddenFromList = true;
  updateBook(bookId, { hiddenFromList: true });
  renderAlleBuecher();
}

async function lazyLoadListDescription(authorId, bookId, item) {
  const book = getBook(authorId, bookId);
  if (!book || !book.googleId) return;
  // Always fetch full description — cached version may be truncated
  try {
    const data = await fetchJson(`${API}/${book.googleId}?fields=volumeInfo(description)`);
    const desc = stripHtml(data.volumeInfo?.description||'');
    if (desc) {
      book.description = desc;
      updateBook(bookId, {description: desc});
      const el = item.querySelector('.bl-desc-loading, .bl-desc');
      if (el && item.classList.contains('expanded')) { el.className='bl-desc'; el.textContent=desc; }
    } else {
      const el = item.querySelector('.bl-desc-loading');
      if (el) el.remove();
    }
  } catch { const el=item.querySelector('.bl-desc-loading'); if(el) el.remove(); }
}

function toggleListExpand(authorId, bookId) {
  const item = document.getElementById(`li-${bookId}`);
  if (!item) return;
  if (item.classList.contains('expanded')) { item.classList.remove('expanded'); return; }
  document.querySelectorAll('.book-list-item.expanded').forEach(i=>i.classList.remove('expanded'));
  item.classList.add('expanded');
}

function setBookFilter(filter, btn) {
  S.bookFilter = filter;
  document.querySelectorAll('#tab-buecher .pill').forEach(b=>b.classList.toggle('active', b.dataset.filter===filter));
  renderAlleBuecher();
}

/* ===== RENDER: FAVORITEN ===== */
function filterFavoriten(query) {
  S.favSearch = query;
  const clear = document.getElementById('fav-search-clear');
  if (clear) clear.classList.toggle('hidden', !query.trim());
  renderFavoriten();
}
function clearFavSearch() {
  S.favSearch = '';
  const inp = document.getElementById('fav-search');
  if (inp) inp.value = '';
  document.getElementById('fav-search-clear')?.classList.add('hidden');
  renderFavoriten();
}

function renderFavoriten() {
  const grid = document.getElementById('favorites-grid');
  const favMap = new Map();
  S.authors.forEach(a => {
    const lang = a.lang || 'de';
    const authorBooks = dedupeBooks(S.books[a.id]||[]).filter(b => !b.hiddenFromList);
    const preferred = new Set(authorBooks.filter(b => !b.language || b.language === lang).map(b => normTitle(b.title)));
    authorBooks
      .filter(b => b.isFavorite && (!b.language || b.language === lang || (b.rating && !preferred.has(normTitle(b.title)))))
      .forEach(b => { const k = normTitle(b.title); if (!favMap.has(k)) favMap.set(k, {...b, _authorName: a.name}); });
  });
  let favs = [...favMap.values()];
  if (S.favSearch) {
    const ql = S.favSearch.toLowerCase();
    favs = favs.filter(b => b.title.toLowerCase().includes(ql) || b._authorName.toLowerCase().includes(ql));
  }
  if (!favs.length) {
    const msg = S.favSearch
      ? `<p>Kein Favorit gefunden für „${esc(S.favSearch)}".</p><p class="empty-hint">Anderen Begriff versuchen!</p>`
      : `<p>Noch keine Favoriten gespeichert.</p><p class="empty-hint">Klick auf ein Buch und markiere es als Favorit!</p>`;
    grid.innerHTML = `<div class="empty"><div class="empty-icon">⭐</div>${msg}</div>`;
    return;
  }
  grid.innerHTML = favs.map(book => {
    const cover = book.coverId
      ? `<img class="fav-cover" src="${book.coverId}" alt="${esc(book.title)}" loading="lazy">`
      : `<div class="fav-cover-ph"><span class="ph-icon">📖</span><span class="ph-title">${esc(book.title)}</span></div>`;
    return `<div class="fav-card" data-author-id="${book.authorId}" data-book-id="${book.id}">
      <div class="fav-cover-wrap">${cover}</div>
      <div class="fav-info">
        <div class="fav-title">${esc(book.title)}</div>
        <div class="fav-author">${esc(book._authorName)}</div>
        ${book.note?`<div class="fav-note">${esc(book.note)}</div>`:''}
      </div>
    </div>`;
  }).join('');
  grid.onclick = e => {
    const card = e.target.closest('.fav-card');
    if (!card) return;
    openEditBookModal(card.dataset.authorId, card.dataset.bookId);
  };
}

/* ===== DISCOVER ===== */
async function loadDiscover() {
  const allNew = [];
  for (const author of S.authors) {
    try {
      const nb = await checkNewBooksForAuthor(author);
      nb.forEach(b=>allNew.push(b));
      if (nb.length) {
        await updateAuthorMeta(author.id,{newCount:nb.length,lastChecked:Date.now()});
        const idx = S.authors.findIndex(a=>a.id===author.id);
        if (idx>=0) { S.authors[idx].newCount=nb.length; S.authors[idx].lastChecked=Date.now(); }
      }
    } catch {}
  }
  S.newReleasesAll = allNew;
  try { S.suggestions = await fetchPersonalizedSuggestions(); } catch { S.suggestions = []; }
  _lastDiscoverLoad = Date.now();
  renderDiscover();
  if (allNew.length) { document.getElementById('new-badge').classList.remove('hidden'); }
  renderAutoren();
}

function renderDiscover() {
  const nrl = document.getElementById('new-releases-list');
  nrl.innerHTML = S.newReleasesAll.length
    ? S.newReleasesAll.map(b=>discCardHtml(b,true)).join('')
    : '<p class="disc-empty">Keine neuen Bücher gefunden. Schau später nochmal rein!</p>';
  nrl.onclick = e => {
    const card = e.target.closest('.disc-card');
    if (!card) return;
    openDiscDetail(JSON.parse(card.dataset.book.replace(/&#39;/g,"'")), true);
  };

  renderGenreSelect();

  const sug  = document.getElementById('suggestions-list');
  const hint = document.getElementById('suggestions-hint');
  // Filter out books already in library (non-hidden) at render time so list stays current
  const ownedNow = new Set();
  S.authors.forEach(a => (S.books[a.id]||[]).forEach(b => { if (!b.hiddenFromList) ownedNow.add(b.googleId); }));
  const visibleSuggestions = S.suggestions.filter(b => !ownedNow.has(b.googleId || b.id));
  if (!visibleSuggestions.length) {
    hint.textContent = 'Bewerte Bücher mit 💚 oder wähle ein Genre!';
    sug.innerHTML    = '<p class="disc-empty">Noch keine Empfehlungen vorhanden.</p>';
  } else {
    const becauseAuthor = !S.selectedDiscoverGenre && visibleSuggestions.find(b => b._because)?._because;
    hint.textContent = S.selectedDiscoverGenre
      ? (S.selectedDiscoverGenre.startsWith('AUTHOR:')
          ? `Bücher von ${S.selectedDiscoverGenre.slice(7)}`
          : `Genre: ${S.selectedDiscoverGenre}`)
      : (becauseAuthor ? `Weil du ${becauseAuthor} magst …` : 'Basierend auf deinen Bewertungen');
    sug.innerHTML = visibleSuggestions.map(b=>discCardHtml(b,false)).join('');
  }
  sug.onclick = e => {
    const card = e.target.closest('.disc-card');
    if (!card) return;
    openDiscDetail(JSON.parse(card.dataset.book.replace(/&#39;/g,"'")), false);
  };
}


function loadDismissedAuthors() {
  try { const r = localStorage.getItem(`bw_dismissed_${S.code}`); return new Set(r ? JSON.parse(r) : []); }
  catch { return new Set(); }
}
function saveDismissedAuthors() {
  localStorage.setItem(`bw_dismissed_${S.code}`, JSON.stringify([...S.dismissedAuthors]));
}
function loadCustomSuggestions() {
  try { return JSON.parse(localStorage.getItem(`bw_custom_sug_${S.code}`) || '[]'); }
  catch { return []; }
}
function saveCustomSuggestions() {
  localStorage.setItem(`bw_custom_sug_${S.code}`, JSON.stringify(S.customSuggestedAuthors));
}
function dismissSuggestedAuthor(name) {
  S.dismissedAuthors.add(name);
  saveDismissedAuthors();
  renderInlineSuggestedChips();
}
function resetDismissedAuthors() {
  S.dismissedAuthors.clear();
  saveDismissedAuthors();
  renderInlineSuggestedChips();
}
function addAuthorToSuggestions(name) {
  closeDiscDetail();
  if (!S.customSuggestedAuthors.includes(name)) {
    S.customSuggestedAuthors.unshift(name);
    saveCustomSuggestions();
    renderInlineSuggestedChips();
  }
  switchTab('autoren');
  flashWishBtn(`${name} zu Vorschlägen hinzugefügt ✓`);
}

function getDiscoverGenres() {
  const fromBooks = new Set();
  S.authors.forEach(a => (S.books[a.id]||[]).forEach(b =>
    (b.genres||[]).filter(g=>!SKIP_GENRES.has(g)).forEach(g => fromBooks.add(g))
  ));
  const defaults = ['NYT-Bestseller','Spiegel-Bestseller','Neuerscheinungen','Krimi','Thriller','Liebesroman','Romantasy','Fantasy','Historischer Roman','Biografie','Science Fiction','Horror','Humor'];
  const all = [...fromBooks, ...defaults.filter(d => !fromBooks.has(d))];
  return [...new Set(all)].slice(0, 18);
}

function getSuggestedAuthorsForDropdown() {
  const alreadyAdded = new Set(S.authors.filter(a=>!a.hidden).map(a => a.name.toLowerCase()));
  const seen = new Set();
  const result = [];
  const add = author => {
    if (!seen.has(author.toLowerCase()) && !alreadyAdded.has(author.toLowerCase())) {
      seen.add(author.toLowerCase()); result.push(author);
    }
  };
  // 1. Authors similar to ones the user liked/favorited
  const authorGenreMap = buildAuthorGenreMap();
  const likedAuthors = S.authors.filter(a => (S.books[a.id]||[]).some(b => b.rating==='liked'||b.isFavorite));
  likedAuthors.forEach(a => {
    const genres = authorGenreMap[a.name.toLowerCase()] || [];
    const bookGenres = (S.books[a.id]||[]).filter(b=>b.rating==='liked'||b.isFavorite)
      .flatMap(b=>(b.genres||[]).filter(g=>GENRE_AUTHORS[g]));
    [...new Set([...genres,...bookGenres])].forEach(g=>(GENRE_AUTHORS[g]||[]).forEach(add));
  });
  // 2. Fallback: top genres from genreStats
  if (result.length < 4) {
    Object.entries(S.genreStats||{}).filter(([g])=>!SKIP_GENRES.has(g))
      .sort((a,b)=>b[1]-a[1]).slice(0,4).forEach(([g])=>(GENRE_AUTHORS[g]||[]).forEach(add));
  }
  // 3. Safe defaults
  if (result.length < 3) {
    ['Krimi','Thriller','Liebesroman','Historischer Roman'].forEach(g=>(GENRE_AUTHORS[g]||[]).forEach(add));
  }
  return result.slice(0, 8);
}

function renderGenreSelect() {
  const el = document.getElementById('genre-select');
  if (!el) return;
  const genres = getDiscoverGenres();
  const sugAuthors = getSuggestedAuthorsForDropdown();
  const cur = S.selectedDiscoverGenre || '';
  let html = `<option value="">✨ Für dich (nach Bewertungen)</option>`;
  html += `<optgroup label="📚 Genres">`;
  html += genres.map(g => `<option value="${esc(g)}" ${cur===g?'selected':''}>${esc(g)}</option>`).join('');
  html += `</optgroup>`;
  if (sugAuthors.length) {
    html += `<optgroup label="✍️ Autoren-Tipps für dich">`;
    html += sugAuthors.map(a => `<option value="AUTHOR:${esc(a)}" ${cur==='AUTHOR:'+a?'selected':''}>✍️ ${esc(a)}</option>`).join('');
    html += `</optgroup>`;
  }
  el.innerHTML = html;
}

async function onGenreSelectChange(val) {
  S.selectedDiscoverGenre = val || null;
  const hint = document.getElementById('suggestions-hint');
  if (val && val.startsWith('AUTHOR:')) {
    if (hint) hint.textContent = `Bücher von ${val.slice(7)}`;
  } else {
    if (hint) hint.textContent = val ? `Genre: ${val}` : 'Basierend auf deinen Lieblingsgenres';
  }
  await loadSuggestionsForGenre(S.selectedDiscoverGenre);
}

async function fetchNeuerscheinungen() {
  const thisYear = new Date().getFullYear();
  const lastYear = thisYear - 1;
  // Search multiple terms for new German novels, merge & dedupe
  const [d1, d2, d3] = await Promise.all([
    fetchJson(`${API}?q=Belletristik+${thisYear}&langRestrict=de&orderBy=newest&maxResults=30`).then(d=>d.items||[]).catch(()=>[]),
    fetchJson(`${API}?q=Roman+${thisYear}&langRestrict=de&orderBy=newest&maxResults=30`).then(d=>d.items||[]).catch(()=>[]),
    fetchJson(`${API}?q=Belletristik+${lastYear}&langRestrict=de&orderBy=newest&maxResults=20`).then(d=>d.items||[]).catch(()=>[]),
  ]);
  const seen = new Set();
  const all = [...d1, ...d2, ...d3].filter(i => {
    if (seen.has(i.id)) return false;
    seen.add(i.id);
    const yr = parseInt((i.volumeInfo?.publishedDate||'').slice(0,4));
    return !yr || yr >= lastYear;
  });
  const sorted = all.sort((a,b)=>{
    const ya=parseInt((a.volumeInfo?.publishedDate||'0').slice(0,4))||0;
    const yb=parseInt((b.volumeInfo?.publishedDate||'0').slice(0,4))||0;
    return yb-ya;
  });
  return limitPerAuthor(dedupeBooks(mapBookItems(sorted.slice(0,24))));
}

async function fetchSpiegelBestseller() {
  const cutoff = new Date().getFullYear() - 2; // only last ~2 years
  // Search for books explicitly marked as SPIEGEL-Bestseller in their metadata
  const [data1, data2] = await Promise.all([
    fetchJson(`${API}?q=%22SPIEGEL-Bestseller%22&langRestrict=de&orderBy=newest&maxResults=40`),
    fetchJson(`${API}?q=%22Spiegel-Bestseller%22+Roman&langRestrict=de&orderBy=newest&maxResults=40`),
  ]);
  const seen = new Set();
  const all = [...(data1.items||[]), ...(data2.items||[])].filter(i => {
    if (seen.has(i.id)) return false;
    seen.add(i.id);
    const yr = parseInt((i.volumeInfo?.publishedDate||'').slice(0,4));
    return !yr || yr >= cutoff;
  });
  return limitPerAuthor(dedupeBooks(mapBookItems(
    all.sort((a,b) => {
      const ya = parseInt((a.volumeInfo?.publishedDate||'0').slice(0,4))||0;
      const yb = parseInt((b.volumeInfo?.publishedDate||'0').slice(0,4))||0;
      return yb-ya;
    }).slice(0,24)
  )));
}

async function fetchNYTBestsellers() {
  const key = window.NYT_KEY;
  // Without key: search for NYT bestseller tagged books in German
  if (!key) {
    const cutoff = new Date().getFullYear() - 3;
    const [d1, d2] = await Promise.all([
      fetchJson(`${API}?q=${encodeURIComponent('"New York Times bestseller"')}&langRestrict=de&orderBy=newest&maxResults=30`).then(d=>d.items||[]).catch(()=>[]),
      fetchJson(`${API}?q=${encodeURIComponent('"New York Times Bestseller" Roman')}&langRestrict=de&orderBy=newest&maxResults=30`).then(d=>d.items||[]).catch(()=>[]),
    ]);
    const seen = new Set();
    const all = [...d1,...d2].filter(i => {
      if (seen.has(i.id)) return false; seen.add(i.id);
      const yr = parseInt((i.volumeInfo?.publishedDate||'').slice(0,4));
      return !yr || yr >= cutoff;
    });
    return limitPerAuthor(dedupeBooks(mapBookItems(all.sort((a,b)=>{
      const ya=parseInt((a.volumeInfo?.publishedDate||'0').slice(0,4))||0;
      const yb=parseInt((b.volumeInfo?.publishedDate||'0').slice(0,4))||0;
      return yb-ya;
    }).slice(0,24))));
  }
  // With key: fetch live NYT list, then find German editions on Google Books
  const nyt = await fetchJson(
    `https://api.nytimes.com/svc/books/v3/lists/current/combined-print-and-e-book-fiction.json?api-key=${key}`
  );
  const nytBooks = (nyt.results?.books || []).slice(0, 15);
  const results = await Promise.all(nytBooks.map(async b => {
    try {
      const q = `intitle:${encodeURIComponent(b.title)}+inauthor:${encodeURIComponent(b.author)}`;
      const gd = await fetchJson(`${API}?q=${q}&langRestrict=de&maxResults=3`);
      const item = (gd.items||[])[0];
      if (!item) return null;
      return {
        id: item.id,
        title: item.volumeInfo?.title || b.title,
        authors: item.volumeInfo?.authors || [b.author],
        coverId: item.volumeInfo?.imageLinks?.thumbnail?.replace('http://','https://') || null,
        year: (item.volumeInfo?.publishedDate||'').slice(0,4),
        description: stripHtml(item.volumeInfo?.description || b.description || '').slice(0,200),
        nytRank: b.rank,
      };
    } catch { return null; }
  }));
  return results.filter(Boolean);
}

async function loadSuggestionsForGenre(genre) {
  const sug  = document.getElementById('suggestions-list');
  const hint = document.getElementById('suggestions-hint');
  sug.innerHTML = '<p class="disc-empty">Wird geladen …</p>';
  try {
    let books;
    if (!genre) {
      books = await fetchPersonalizedSuggestions();
    } else if (genre === 'NYT-Bestseller') {
      books = await fetchNYTBestsellers();
    } else if (genre === 'Spiegel-Bestseller') {
      books = await fetchSpiegelBestseller();
      if (hint) hint.textContent = 'Aktuelle Spiegel-Bestseller';
    } else if (genre === 'Neuerscheinungen') {
      books = await fetchNeuerscheinungen();
      if (hint) hint.textContent = 'Neue Bücher ' + new Date().getFullYear();
    } else if (genre.startsWith('AUTHOR:')) {
      const authorName = genre.slice(7);
      const data = await fetchJson(
        `${API}?q=inauthor:${encodeURIComponent('"'+authorName+'"')}&langRestrict=de&orderBy=newest&maxResults=40`
      );
      books = mapBookItems((data.items||[]).sort((a,b)=>{
        const ya=parseInt((a.volumeInfo?.publishedDate||'0').slice(0,4))||0;
        const yb=parseInt((b.volumeInfo?.publishedDate||'0').slice(0,4))||0;
        return yb-ya;
      }).slice(0,16));
      if (hint) hint.textContent = `Bücher von ${authorName}`;
    } else {
      books = await fetchBooksForGenre(genreForApi(genre), genre);
      const knownAuthors = new Set(S.authors.map(a => a.name.toLowerCase()));
      const ownedGoogleIds = new Set();
      S.authors.forEach(a => (S.books[a.id]||[]).forEach(b => ownedGoogleIds.add(b.googleId)));
      books = books.filter(b => !knownAuthors.has((b.authors?.[0]||'').toLowerCase()) && !ownedGoogleIds.has(b.googleId));
    }
    S.suggestions = dedupeBooks(books);
    if (!books.length) {
      hint.textContent = genre ? `Keine Bücher für „${genre.startsWith('AUTHOR:')?genre.slice(7):genre}" gefunden` : 'Keine Empfehlungen gefunden';
      sug.innerHTML = '<p class="disc-empty">Nichts gefunden – versuch ein anderes Genre!</p>';
    } else {
      const becauseAuthor = !genre && books.find(b => b._because)?._because;
      hint.textContent = genre
        ? (genre.startsWith('AUTHOR:') ? `Bücher von ${genre.slice(7)}` : `Genre: ${genre}`)
        : (becauseAuthor ? `Weil du ${becauseAuthor} magst …` : 'Basierend auf deinen Bewertungen');
      sug.innerHTML = books.map(b=>discCardHtml(b,false)).join('');
    }
    sug.onclick = e => {
      const card = e.target.closest('.disc-card');
      if (!card) return;
      openDiscDetail(JSON.parse(card.dataset.book.replace(/&#39;/g,"'")), false);
    };
  } catch { sug.innerHTML = '<p class="disc-empty">Fehler beim Laden – nochmal versuchen!</p>'; }
}

function discCardHtml(book, isNew) {
  const authors = Array.isArray(book.authors) ? book.authors.join(', ') : (book.authorName||'');
  const cover   = book.coverId
    ? `<img class="disc-cover" src="${book.coverId}" alt="${esc(book.title)}" loading="lazy">`
    : `<div class="disc-cover-ph"><span class="ph-icon">📚</span><span class="ph-title">${esc(book.title)}</span></div>`;
  const descSnip = book.description ? book.description.slice(0,85)+'…' : '';
  // Status badge on cover
  let statusBadge = '';
  let alreadyRated = false;
  if (isNew && book.authorId) {
    const existing = S.books[book.authorId]?.find(b => b.googleId === (book.googleId||book.id));
    if (existing?.rating) { alreadyRated = true; statusBadge = `<div class="disc-status">${ratingEmoji(existing.rating)}</div>`; }
    else if (existing)    { statusBadge = `<div class="disc-status">📌</div>`; }
  }
  const onWishlist = S.wishlist.some(w => w.googleId === (book.googleId||book.id));
  if (onWishlist) statusBadge = `<div class="disc-status">🛒</div>`;
  const bookData = JSON.stringify(book).replace(/'/g,'&#39;');
  // New releases: show only cover + badge (no text below)
  if (isNew) {
    return `<div class="disc-card${alreadyRated?' already-rated':''}${onWishlist?' on-wishlist':''}" data-book='${bookData}' data-is-new="true">
      <div class="disc-cover-wrap">${cover}${statusBadge}</div>
    </div>`;
  }
  return `<div class="disc-card${onWishlist?' on-wishlist':''}" data-book='${bookData}' data-is-new="false">
    <div class="disc-cover-wrap">${cover}${statusBadge}</div>
    <div class="disc-info">
      <div class="disc-title">${esc(book.title)}</div>
      <div class="disc-author">${esc(authors)}</div>
      ${descSnip?`<div class="disc-desc">${esc(descSnip)}</div>`:''}
    </div>
  </div>`;
}

/* ===== DISC DETAIL MODAL ===== */
let _discBook = null;
let _discIsNew = false;

function openDiscDetail(book, isNew) {
  _discBook = book; _discIsNew = isNew;
  // Cover
  const wrap = document.getElementById('disc-detail-cover-wrap');
  wrap.innerHTML = book.coverId
    ? `<img class="disc-detail-img" src="${book.coverId}" alt="">`
    : `<div class="disc-detail-ph">📚</div>`;
  // Title & author
  const authors = Array.isArray(book.authors) ? book.authors.join(', ') : (book.authorName||'');
  document.getElementById('disc-detail-title').textContent  = book.title;
  document.getElementById('disc-detail-author').textContent = authors + (book.year ? ' · ' + book.year : '');
  // Description — always fetch full text from API (cached version may be truncated)
  const descEl = document.getElementById('disc-detail-desc');
  const gid = book.googleId || book.id;
  if (book.description) {
    descEl.textContent = stripHtml(book.description);
    descEl.classList.remove('hidden');
  } else {
    descEl.textContent = 'Beschreibung wird geladen …';
    descEl.classList.remove('hidden');
  }
  if (gid) {
    fetchJson(`${API}/${gid}?fields=volumeInfo(description)`).then(data => {
      const desc = stripHtml(data.volumeInfo?.description||'');
      if (desc) { book.description = desc; descEl.textContent = desc; descEl.classList.remove('hidden'); }
      else if (!book.description) descEl.classList.add('hidden');
    }).catch(()=>{ if (!book.description) descEl.classList.add('hidden'); });
  }
  renderDiscDetailActions(book, isNew);
  // Always show wishlist button
  const wishBtn = document.getElementById('disc-detail-wish');
  if (wishBtn) {
    const gid = book.googleId || book.id;
    const onList = S.wishlist.some(w => w.googleId === gid);
    wishBtn.textContent = onList ? '✓ Auf Merkliste' : '🛒 Auf Merkliste';
    wishBtn.onclick = () => { addToWishlist(book); wishBtn.textContent='✓ Auf Merkliste'; };
  }
  document.getElementById('modal-disc-detail').classList.remove('hidden');
}

function renderDiscDetailActions(book, isNew) {
  const el = document.getElementById('disc-detail-actions');
  if (!el) return;
  const bData = JSON.stringify(book).replace(/'/g,"&#39;");

  if (isNew && book.authorId) {
    const existing = S.books[book.authorId]?.find(b => b.googleId === (book.googleId||book.id));
    if (existing) {
      el.innerHTML = existing.rating
        ? `<div class="disc-detail-status">${ratingEmoji(existing.rating)} Bereits bewertet</div>
           <button class="disc-detail-btn-primary" onclick="closeDiscDetail();openEditBookModal('${existing.authorId}','${existing.id}')">✏️ Bewertung ändern</button>`
        : `<button class="disc-detail-btn-primary" onclick="closeDiscDetail();openEditBookModal('${existing.authorId}','${existing.id}')">✏️ Jetzt bewerten</button>`;
    } else {
      el.innerHTML = `
        <button class="disc-detail-btn-sage" data-book='${bData}' onclick="addDiscoverBook(this,false);closeDiscDetail()">✓ Kenn ich schon</button>
        <button class="disc-detail-btn-primary" data-book='${bData}' onclick="addDiscoverBook(this,true);closeDiscDetail()">✏️ Kenn ich & bewerten</button>`;
    }
  } else {
    // Suggestion – check if author/book is already known
    const authorName = (Array.isArray(book.authors) ? book.authors[0] : '') || '';
    const knownAuthor = S.authors.find(a => a.name.toLowerCase() === authorName.toLowerCase());
    const gid = book.googleId || book.id;
    const existingBook = knownAuthor ? S.books[knownAuthor.id]?.find(b => b.googleId === gid && !b.hiddenFromList) : null;
    if (existingBook) {
      el.innerHTML = existingBook.rating
        ? `<div class="disc-detail-status">${ratingEmoji(existingBook.rating)} Bereits bewertet</div>
           <button class="disc-detail-btn-primary" onclick="closeDiscDetail();openEditBookModal('${existingBook.authorId}','${existingBook.id}')">✏️ Bewertung ändern</button>`
        : `<button class="disc-detail-btn-primary" onclick="closeDiscDetail();openEditBookModal('${existingBook.authorId}','${existingBook.id}')">✏️ Jetzt bewerten</button>`;
    } else if (authorName) {
      const gid   = esc(book.googleId || book.id || '');
      const title = esc(book.title || '');
      const cover = esc(book.coverId || '');
      const year  = esc(book.year || '');
      el.innerHTML = `
        <p class="disc-choice-label">Was möchtest du tun?</p>
        <button class="disc-detail-btn-primary" data-author="${esc(authorName)}" onclick="addAuthorFromDisc(this)">📚 Autor hinzufügen</button>
        <button class="disc-detail-btn-rose"
          data-gid="${gid}" data-title="${title}" data-author="${esc(authorName)}" data-cover="${cover}" data-year="${year}"
          onclick="addSingleBookFromDisc(this)">📖 Buch hinzufügen</button>
        <button class="disc-detail-btn-sage" data-author="${esc(authorName)}" onclick="addAuthorToSuggestions(this.dataset.author)">⭐ Zu Vorschlägen</button>`;
    } else { el.innerHTML = ''; }
  }
}

function closeDiscDetail() {
  document.getElementById('modal-disc-detail').classList.add('hidden');
  _discBook = null;
}
async function addAuthorFromDisc(btn) {
  const name = btn.dataset.author;
  closeDiscDetail();
  await addAuthor(name, null, 'de');
  renderDiscover();
}

async function addSingleBookFromDisc(btn) {
  const { gid, title, author: authorName, cover, year } = btn.dataset;
  closeDiscDetail();
  await addBookDirect(gid, title, authorName, cover, year);
  renderDiscover();
}

async function addDiscoverBook(btn, openRating) {
  const book    = JSON.parse(btn.dataset.book);
  const authorId = book.authorId;
  const bookId   = `${authorId}_${book.googleId||book.id}`;
  const newBook  = {...book, id:bookId, authorId, addedAt:Date.now(), rating:null, note:'', isFavorite:false};
  try {
    await saveBook(newBook);
    if (!S.books[authorId]) S.books[authorId] = [];
    S.books[authorId].push(newBook);
    renderAutoren(); renderAlleBuecher(); renderDiscover();
    if (openRating) openEditBookModal(authorId, bookId);
  } catch(e) { console.error(e); }
}

/* ===== EDIT BOOK MODAL ===== */
function openEditBookModal(authorId, bookId) {
  const book = getBook(authorId,bookId);
  if (!book) return;
  S.editingBook={authorId,bookId}; S.selectedRating=book.rating;
  document.getElementById('edit-modal-title').textContent = book.title;
  document.getElementById('edit-note').value      = book.note||'';
  document.getElementById('edit-favorite').checked= !!book.isFavorite;
  document.querySelectorAll('.rating-opt').forEach(b=>b.classList.toggle('selected',b.dataset.r===book.rating));
  buildYearPicker(book.readYear||null);
  // Description — show cached, then always fetch full from API
  const descEl = document.getElementById('edit-modal-desc');
  if (descEl) {
    if (book.description) {
      descEl.textContent = stripHtml(book.description);
      descEl.classList.remove('hidden');
    } else {
      descEl.textContent = '';
      descEl.classList.add('hidden');
    }
  }
  document.getElementById('modal-edit-book').classList.remove('hidden');
  if (book.googleId) {
    fetchJson(`${API}/${book.googleId}?fields=volumeInfo(description)`).then(data => {
      const desc = stripHtml(data.volumeInfo?.description||'');
      if (desc && descEl) {
        book.description = desc;
        updateBook(bookId, {description: desc});
        descEl.textContent = desc;
        descEl.classList.remove('hidden');
      }
    }).catch(()=>{});
  }
}

function buildYearPicker(selectedYear) {
  const picker = document.getElementById('year-picker');
  if (!picker) return;
  S.selectedReadYear = selectedYear || null;
  const curYear = new Date().getFullYear();
  const years = [];
  for (let y = curYear + 1; y >= 2010; y--) years.push(y);
  picker.innerHTML = `<button class="year-chip ${!selectedYear?'active':''}" data-year="">Kein Jahr</button>` +
    years.map(y => `<button class="year-chip ${selectedYear==y?'active':''}" data-year="${y}">${y}</button>`).join('');
  picker.onclick = e => {
    const btn = e.target.closest('.year-chip');
    if (!btn) return;
    picker.querySelectorAll('.year-chip').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    S.selectedReadYear = btn.dataset.year ? parseInt(btn.dataset.year) : null;
  };
}

function closeEditBookModal() {
  document.getElementById('modal-edit-book').classList.add('hidden');
  S.editingBook=null; S.selectedRating=null; S.selectedReadYear=null;
}

function pickRating(r) {
  // Nochmal auf dieselbe Bewertung klicken → Bewertung entfernen
  S.selectedRating = S.selectedRating===r ? null : r;
  document.querySelectorAll('.rating-opt').forEach(b=>b.classList.toggle('selected',b.dataset.r===S.selectedRating));
}

async function saveBookEdit() {
  const {authorId,bookId} = S.editingBook;
  const updates = {
    rating:     S.selectedRating,
    note:       document.getElementById('edit-note').value.trim(),
    isFavorite: document.getElementById('edit-favorite').checked,
    readYear:   S.selectedReadYear || null,
  };
  const idx = S.books[authorId]?.findIndex(b=>b.id===bookId);
  if (idx>=0) Object.assign(S.books[authorId][idx], updates);
  if (updates.rating==='liked') {
    const book = getBook(authorId,bookId);
    const stats = S.genreStats||{};
    (book?.genres||[]).filter(g=>!SKIP_GENRES.has(g)).forEach(g=>{stats[g]=(stats[g]||0)+1;});
    S.genreStats = stats;
  }
  // Remember what was open before re-render
  const wasExpanded = S.expandedBook ? {...S.expandedBook} : null;
  closeEditBookModal();
  renderAutoren(); renderAlleBuecher(); renderFavoriten(); renderStatistik(); renderGenreSelect();
  // Nach einer Bewertung Empfehlungen still aktualisieren
  if (updates.rating === 'liked' && !S.selectedDiscoverGenre) {
    fetchGenreSuggestions(S.genreStats).then(books => { if (books.length) S.suggestions = books; }).catch(()=>{});
  }

  // Restore expanded author + book detail without closing anything
  if (wasExpanded) {
    document.getElementById(`author-${wasExpanded.authorId}`)?.classList.add('expanded');
    const book   = getBook(wasExpanded.authorId, wasExpanded.bookId);
    const author = S.authors.find(a => a.id === wasExpanded.authorId);
    const container = document.getElementById(`expand-${wasExpanded.authorId}`);
    if (book && container) container.innerHTML = renderBookExpand(book, author?.name||'');
  }

  try {
    await updateBook(bookId, updates);
    if (updates.rating==='liked') await saveGenreStats(S.genreStats);
  } catch(e) { console.error('Save error:', e); }
}

/* ===== QUICK FAVORITE ===== */
async function quickToggleFavorite(authorId, bookId) {
  const book = getBook(authorId,bookId); if (!book) return;
  const newFav = !book.isFavorite;
  const idx = S.books[authorId]?.findIndex(b=>b.id===bookId);
  if (idx>=0) {
    S.books[authorId][idx].isFavorite = newFav;
    if (S.expandedBook?.bookId===bookId) {
      const a=S.authors.find(a=>a.id===authorId);
      const c=document.getElementById(`expand-${authorId}`);
      if (c) c.innerHTML=renderBookExpand(S.books[authorId][idx],a?.name||'');
    }
  }
  renderFavoriten(); renderAlleBuecher(); renderStatistik();
  try { await updateBook(bookId,{isFavorite:newFav}); } catch(e) { console.error(e); }
}

/* ===== MERKLISTE ===== */
function addToWishlist(book) {
  const gid = book.googleId || book.id;
  if (!gid) return;
  if (S.wishlist.some(w => w.googleId === gid)) {
    flashWishBtn('Bereits auf der Merkliste ✓'); return;
  }
  const item = {
    id: `wl_${Date.now()}`,
    googleId: gid,
    title: book.title || '',
    authors: Array.isArray(book.authors) ? book.authors : (book.authorName ? [book.authorName] : []),
    coverId: book.coverId || null,
    year: book.year || '',
    addedAt: Date.now(),
  };
  S.wishlist.push(item);
  renderMerkliste();
  updateWishBadge();
  renderDiscover();
  flashWishBtn('Zur Merkliste hinzugefügt ✓');
  saveWishItem(item).catch(e=>console.error(e));
}

function addBookToWishlist(authorId, bookId) {
  const book = getBook(authorId, bookId);
  if (book) addToWishlist(book);
}

function addToWishlistFromBtn(btn) {
  addToWishlist({
    googleId: btn.dataset.gid, id: btn.dataset.gid,
    title:    btn.dataset.title,
    authors:  [btn.dataset.author],
    coverId:  btn.dataset.cover || null,
    year:     btn.dataset.year || '',
  });
}

function removeFromWishlist(itemId) {
  S.wishlist = S.wishlist.filter(w => w.id !== itemId);
  renderMerkliste();
  updateWishBadge();
  deleteWishItem(itemId).catch(e=>console.error(e));
}

function updateWishBadge() {
  const el = document.getElementById('wish-badge');
  if (!el) return;
  if (S.wishlist.length) { el.textContent=S.wishlist.length; el.classList.remove('hidden'); }
  else el.classList.add('hidden');
}

let _wishFlashTimer = null;
function flashWishBtn(msg) {
  const toast = document.getElementById('wish-toast');
  if (!toast) return;
  toast.textContent = msg;
  toast.classList.add('visible');
  clearTimeout(_wishFlashTimer);
  _wishFlashTimer = setTimeout(() => toast.classList.remove('visible'), 2200);
}

function renderMerkliste() {
  const list = document.getElementById('wish-list');
  if (!list) return;
  updateWishBadge();
  if (!S.wishlist.length) {
    list.innerHTML = `<div class="empty"><div class="empty-icon">🛒</div><p>Noch nichts auf der Merkliste.</p><p class="empty-hint">Tippe bei einem Buch auf 🛒 um es hinzuzufügen!</p></div>`;
    return;
  }
  const sorted = [...S.wishlist].sort((a,b) => b.addedAt - a.addedAt);
  list.innerHTML = sorted.map(item => {
    const authors    = Array.isArray(item.authors) ? item.authors.join(', ') : (item.authors||'');
    const cover      = item.coverId
      ? `<img class="wish-cover" src="${item.coverId}" alt="" loading="lazy">`
      : `<div class="wish-cover-ph">📖</div>`;
    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(item.title+' '+authors+' kaufen')}`;
    return `<div class="wish-item" id="wl-${item.id}" data-wish-id="${item.id}" data-gid="${esc(item.googleId||'')}">
      <div class="wish-main">
        ${cover}
        <div class="wish-info">
          <div class="wish-title">${esc(item.title)}</div>
          <div class="wish-author">${esc(authors)}${item.year?' · '+item.year:''}</div>
        </div>
        <div class="wish-btns">
          <a class="wish-buy" href="${searchUrl}" target="_blank" rel="noopener">🔍 Kaufen</a>
          <button class="wish-del" data-id="${item.id}" onclick="event.stopPropagation();removeFromWishlist(this.dataset.id)">✕</button>
        </div>
      </div>
      <div class="wish-desc-wrap"></div>
    </div>`;
  }).join('');

  list.onclick = e => {
    if (e.target.closest('.wish-buy') || e.target.closest('.wish-del')) return;
    const item = e.target.closest('.wish-item');
    if (!item) return;
    const wrap   = item.querySelector('.wish-desc-wrap');
    const wishId = item.dataset.wishId;
    const wItem  = S.wishlist.find(w => w.id === wishId);
    if (item.classList.contains('expanded')) { item.classList.remove('expanded'); wrap.innerHTML = ''; return; }
    document.querySelectorAll('.wish-item.expanded').forEach(i => { i.classList.remove('expanded'); i.querySelector('.wish-desc-wrap').innerHTML = ''; });
    item.classList.add('expanded');
    if (!wItem) return;
    wrap.innerHTML = wItem.description
      ? `<div class="wish-desc">${esc(wItem.description)}</div>`
      : `<div class="wish-desc-loading">Beschreibung wird geladen …</div>`;
    if (!wItem.description && item.dataset.gid) {
      fetchJson(`${API}/${item.dataset.gid}?fields=volumeInfo(description)`).then(data => {
        const desc = stripHtml(data.volumeInfo?.description||'');
        if (desc) { wItem.description = desc; wrap.innerHTML = `<div class="wish-desc">${esc(desc)}</div>`; }
      }).catch(()=>{});
    }
  };
}

/* ===== STATISTIK ===== */
function renderStatistik() {
  const overviewEl = document.getElementById('stats-overview');
  const timelineEl = document.getElementById('stats-timeline');
  const hintEl     = document.getElementById('stats-hint');
  if (!overviewEl || !timelineEl) return;

  // Same dedup logic as renderAlleBuecher: global by normTitle, prefer rated
  const _statMap = new Map();
  S.authors.forEach(a => {
    const lang = a.lang || 'de';
    const authorBooks = dedupeBooks(S.books[a.id]||[]).filter(b => !b.hiddenFromList);
    const preferred = new Set(authorBooks.filter(b => !b.language || b.language === lang).map(b => normTitle(b.title)));
    authorBooks
      .filter(b => !b.language || b.language === lang || (b.rating && !preferred.has(normTitle(b.title))))
      .forEach(b => {
        if (!b.rating) return;
        const k = normTitle(b.title);
        const ex = _statMap.get(k);
        if (!ex || (b.rating && !ex.rating)) _statMap.set(k, {...b, _authorName: a.name});
      });
  });
  const allBooks = [..._statMap.values()];

  const total    = allBooks.length;
  const favs     = allBooks.filter(b=>b.isFavorite).length;
  const liked    = allBooks.filter(b=>b.rating==='liked').length;
  const neutral  = allBooks.filter(b=>b.rating==='neutral').length;
  const disliked = allBooks.filter(b=>b.rating==='disliked').length;
  const authorCounts = {};
  allBooks.forEach(b => { authorCounts[b._authorName]=(authorCounts[b._authorName]||0)+1; });
  const topAuthor = Object.entries(authorCounts).sort((a,b)=>b[1]-a[1])[0];
  const topGenre  = Object.entries(S.genreStats||{}).sort((a,b)=>b[1]-a[1])[0];

  overviewEl.innerHTML = `
    <div class="stats-cards">
      <div class="stat-card">
        <div class="stat-number">${total}</div>
        <div class="stat-label">Gelesen</div>
      </div>
      <div class="stat-card">
        <div class="stat-number">${favs}</div>
        <div class="stat-label">Favoriten</div>
      </div>
      <div class="stat-card stat-ratings">
        <div class="stat-rating-row"><span>💚</span><span class="stat-rating-count">${liked}</span></div>
        <div class="stat-rating-row"><span>😐</span><span class="stat-rating-count">${neutral}</span></div>
        <div class="stat-rating-row"><span>❌</span><span class="stat-rating-count">${disliked}</span></div>
      </div>
    </div>
    ${topAuthor?`<div class="stat-highlight">⭐ Lieblingsautor: <strong>${esc(topAuthor[0])}</strong> (${topAuthor[1]} Bücher)</div>`:''}
    ${topGenre ?`<div class="stat-highlight">📚 Lieblingsgenre: <strong>${esc(topGenre[0])}</strong></div>`:''}
  `;

  if (!total) {
    if (hintEl) hintEl.textContent = 'Bewerte Bücher, um deine Lesestatistik zu sehen!';
    timelineEl.innerHTML = `<div class="empty"><div class="empty-icon">📊</div><p>Noch keine bewerteten Bücher.</p><p class="empty-hint">Geh zu einem Buch und bewerte es!</p></div>`;
    return;
  }
  if (hintEl) hintEl.textContent = 'Tippe auf ein Buch um das Lesejahr zuzuweisen';

  const byYear = {};
  const unassigned = [];
  allBooks.forEach(b => {
    if (b.readYear) { if (!byYear[b.readYear]) byYear[b.readYear]=[]; byYear[b.readYear].push(b); }
    else unassigned.push(b);
  });
  const years = Object.keys(byYear).map(Number).sort((a,b)=>b-a);
  let html = '';
  years.forEach(y => { html += renderYearSection(y, byYear[y]); });
  if (unassigned.length) html += renderYearSection(null, unassigned);
  timelineEl.innerHTML = html;

  timelineEl.onclick = e => {
    const chip = e.target.closest('.stat-book-chip');
    if (!chip) return;
    openYearReassign(chip.dataset.authorId, chip.dataset.bookId);
  };
}

function renderYearSection(year, books) {
  const title = year ? `📅 ${year}` : '📌 Noch kein Jahr';
  return `<div class="stat-year-section">
    <div class="stat-year-header">${title}<span class="stat-year-count">${books.length} ${books.length===1?'Buch':'Bücher'}</span></div>
    <div class="stat-books-strip">
      ${books.map(b => {
        const cover = b.coverId
          ? `<img src="${b.coverId}" alt="" class="stat-book-cover" loading="lazy">`
          : `<div class="stat-book-cover-ph">${esc(b.title.slice(0,2))}</div>`;
        return `<div class="stat-book-chip" data-author-id="${b.authorId}" data-book-id="${b.id}" title="${esc(b.title)}">
          ${cover}
          <div class="stat-rating-badge">${ratingEmoji(b.rating)}</div>
          <div class="stat-book-title">${esc(b.title.length>18?b.title.slice(0,17)+'…':b.title)}</div>
        </div>`;
      }).join('')}
    </div>
  </div>`;
}

function openYearReassign(authorId, bookId) {
  const book = getBook(authorId, bookId);
  if (!book) return;
  document.querySelectorAll('.year-reassign-popup').forEach(p=>p.remove());
  const curYear = new Date().getFullYear();
  const years = [null, ...Array.from({length: curYear-2009}, (_,i)=>curYear-i)];
  const popup = document.createElement('div');
  popup.className = 'year-reassign-popup';
  popup.innerHTML = `
    <div class="yrp-header">
      <div class="yrp-title">${esc(book.title.length>40?book.title.slice(0,39)+'…':book.title)}</div>
      <button class="yrp-close">✕</button>
    </div>
    <div class="yrp-chips">
      ${years.map(y=>`<button class="yrp-chip ${(book.readYear||null)==y?'active':''}" data-year="${y===null?'':y}">${y||'Kein Jahr'}</button>`).join('')}
    </div>`;
  document.body.appendChild(popup);
  popup.querySelector('.yrp-close').onclick = () => popup.remove();
  popup.querySelector('.yrp-chips').onclick = async e => {
    const btn = e.target.closest('.yrp-chip');
    if (!btn) return;
    const newYear = btn.dataset.year ? parseInt(btn.dataset.year) : null;
    const idx = S.books[authorId]?.findIndex(b=>b.id===bookId);
    if (idx>=0) S.books[authorId][idx].readYear = newYear;
    popup.remove();
    renderStatistik();
    try { await updateBook(bookId, {readYear: newYear}); } catch {}
  };
  setTimeout(() => {
    document.addEventListener('click', function closePopup(e) {
      if (!popup.contains(e.target)) { popup.remove(); document.removeEventListener('click', closePopup); }
    });
  }, 50);
}

/* ===== HELPERS ===== */
function getBook(authorId,bookId)  { return S.books[authorId]?.find(b=>b.id===bookId)||null; }
function ratingEmoji(r)            { return {liked:'💚',neutral:'😐',disliked:'❌'}[r]||''; }
function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function jstr(v) { return JSON.stringify(v); }
function stripHtml(s) {
  return String(s||'')
    .replace(/<br\s*\/?>/gi,'\n').replace(/<[^>]+>/g,'')
    .replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&nbsp;/g,' ')
    .trim();
}

/* ===== DELETE ALL DATA ===== */
async function confirmDeleteAllData() {
  const ok = confirm('⚠️ Alle Autoren, Bücher, Favoriten und Merkliste werden unwiderruflich gelöscht!\n\nWirklich alles löschen?');
  if (!ok) return;
  showLoading('Daten werden gelöscht …');
  try {
    const [authSnap, bookSnap, wishSnap, metaSnap] = await Promise.all([
      col('authors').get(),
      col('books').get(),
      col('wishlist').get(),
      col('meta').get(),
    ]);
    await Promise.all([
      ...authSnap.docs.map(d => d.ref.delete()),
      ...bookSnap.docs.map(d => d.ref.delete()),
      ...wishSnap.docs.map(d => d.ref.delete()),
      ...metaSnap.docs.map(d => d.ref.delete()),
    ]);
    S.authors = []; S.books = {}; S.genreStats = {}; S.wishlist = [];
    S.suggestions = []; S.newReleasesAll = []; S.expandedBook = null;
    S.selectedDiscoverGenre = null;
    renderAutoren(); renderAlleBuecher(); renderFavoriten();
    renderStatistik(); renderMerkliste(); renderGenreSelect();
    document.getElementById('new-badge').classList.add('hidden');
    document.getElementById('wish-badge').classList.add('hidden');
  } catch(e) { alert('Fehler beim Löschen: ' + e.message); }
  finally { hideLoading(); }
}

/* ===== IMPORT / EXPORT ===== */
async function exportData() {
  const payload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    authors: S.authors,
    books: S.books,
    wishlist: S.wishlist,
    genreStats: S.genreStats,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {type: 'application/json'});
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `buecherwelt-backup-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  flashWishBtn('Daten exportiert ✓');
}

async function importData(event) {
  const file = event.target.files[0];
  if (!file) return;
  const text = await file.text();
  let payload;
  try { payload = JSON.parse(text); } catch { alert('Ungültige Datei – bitte eine Buecherwelt-Backup-Datei wählen.'); return; }
  if (!payload.version || !payload.authors) { alert('Ungültiges Format.'); return; }

  const ok = confirm(`Backup vom ${payload.exportedAt?.slice(0,10)||'?'} importieren?\n${payload.authors?.length||0} Autoren, ${Object.values(payload.books||{}).flat().length} Bücher.\n\nVorhandene Daten bleiben erhalten – neue werden hinzugefügt.`);
  if (!ok) return;

  showLoading('Daten werden importiert …');
  try {
    // Authors
    for (const a of (payload.authors||[])) {
      const exists = S.authors.find(x=>x.id===a.id);
      if (!exists) {
        await col('authors').doc(a.id).set(a);
        S.authors.push(a);
        S.books[a.id] = S.books[a.id] || [];
      }
    }
    // Books
    for (const [authorId, books] of Object.entries(payload.books||{})) {
      for (const b of (books||[])) {
        const existing = (S.books[authorId]||[]).find(x=>x.id===b.id);
        if (!existing) {
          await col('books').doc(b.id).set(b);
          if (!S.books[authorId]) S.books[authorId]=[];
          S.books[authorId].push(b);
        }
      }
    }
    // Wishlist
    for (const w of (payload.wishlist||[])) {
      if (!S.wishlist.find(x=>x.id===w.id)) {
        await saveWishItem(w);
        S.wishlist.push(w);
      }
    }
    // Genre stats (merge)
    const merged = {...(payload.genreStats||{})};
    Object.entries(S.genreStats||{}).forEach(([g,n])=>{ merged[g]=(merged[g]||0)+n; });
    S.genreStats = merged;
    await col('meta').doc('genres').set(merged);

    renderAutoren(); renderAlleBuecher(); renderFavoriten(); renderMerkliste(); renderStatistik();
    flashWishBtn('Import erfolgreich ✓');
  } catch(e) {
    alert('Fehler beim Import: ' + e.message);
  } finally {
    hideLoading();
    event.target.value = '';
  }
}
