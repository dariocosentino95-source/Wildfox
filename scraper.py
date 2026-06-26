"""
scraper.py - Scraping portali fornitori con Playwright
Handler dedicati per:
  - Cardinale Group  (shop.cardinalegroup.it)  — SPA con login
  - Spolzino         (www.spolzino.com)         — sito custom con login
  - IdroFerrara      (aziende.idroferrara.com)  — Magento 2 con login
  - Generico         (qualsiasi altro portale)  — euristica HTML
"""

import re
import time
import json
import logging
from typing import Optional
import db

logger = logging.getLogger(__name__)

# ─── Cache sessioni Playwright (evita re-login ad ogni ricerca) ────────────
# Struttura: { url_base: {"storage_state": {...}, "ts": timestamp} }
# La sessione viene riutilizzata per 30 minuti, poi rinfrescata.
_SESSION_CACHE: dict = {}
_SESSION_TTL_SEC = 1800  # 30 minuti

# ─── Chiavi credenziali nel DB (tabella config) ────────────────────────────
#   creds_{fornitore_id}  →  JSON {"username": "...", "password": "..."}
# ──────────────────────────────────────────────────────────────────────────


def _creds(fornitore_id: int) -> dict:
    raw = db.get_config(f"creds_{fornitore_id}")
    if raw:
        try:
            return json.loads(raw)
        except Exception:
            pass
    return {}


def _get_cached_session(cache_key: str) -> Optional[dict]:
    """Ritorna lo storage_state salvato se ancora valido, altrimenti None."""
    entry = _SESSION_CACHE.get(cache_key)
    if entry and (time.time() - entry['ts']) < _SESSION_TTL_SEC:
        return entry['storage_state']
    return None


def _save_session(cache_key: str, storage_state: dict):
    """Salva lo storage_state Playwright in memoria."""
    _SESSION_CACHE[cache_key] = {'storage_state': storage_state, 'ts': time.time()}


def _invalidate_session(cache_key: str):
    """Invalida la sessione cached (es. dopo un errore di login)."""
    _SESSION_CACHE.pop(cache_key, None)


def save_credentials(fornitore_id: int, username: str, password: str):
    db.set_config(f"creds_{fornitore_id}", json.dumps({
        "username": username,
        "password": password
    }))


# ─── Browser condiviso (riuso per tutta la ricerca massiva) ─────────────────
from contextlib import contextmanager


@contextmanager
def _acquire_browser(shared_browser):
    """
    Se `shared_browser` è passato lo riusa (NON lo chiude): è il caso della
    ricerca massiva, dove si apre un solo Chromium per tutta la sessione invece
    di rilanciarlo a ogni articolo (era il collo di bottiglia principale).
    Se è None, apre un browser usa-e-getta e lo chiude all'uscita (ricerca
    singola).
    """
    if shared_browser is not None:
        yield shared_browser
        return
    from playwright.sync_api import sync_playwright
    pw = sync_playwright().start()
    try:
        br = pw.chromium.launch(headless=True)
        try:
            yield br
        finally:
            br.close()
    finally:
        pw.stop()


# ─── Selezione articoli per la ricerca (ambito + fornitore) ─────────────────

def select_target_articoli(scope='tutti', keyword='', fornitore_id=None,
                           solo_senza_codice=True, limite=None):
    """
    Restituisce gli articoli su cui fare la ricerca, secondo i criteri scelti.

    scope:
      'singolo'   → match per CODICE articolo (esatto o parziale) = `keyword`
      'categoria' → match per parola nella DESCRIZIONE o nel codice = `keyword`
                    (es. 'ottone')
      'tutti'     → tutti gli articoli
    fornitore_id:
      None         → qualunque fornitore che abbia un portale configurato
      id specifico → solo gli articoli collegati a quel fornitore
    solo_senza_codice:
      True  → solo articoli col codice fornitore MANCANTE (completa i codici)
      False → tutti (utile per aggiornare i PREZZI anche dove il codice c'è)
    limite: max numero di articoli (None = tutti)

    Ritorna: lista di dict {id, codice, descrizione}.
    """
    where = ["f.url_portale IS NOT NULL", "f.url_portale != ''"]
    params = []
    if fornitore_id:
        where.append("f.id = ?")
        params.append(fornitore_id)
    if solo_senza_codice:
        where.append("(af.codice_fornitore IS NULL OR af.codice_fornitore = '')")
    if scope == 'singolo' and keyword:
        where.append("UPPER(a.codice) LIKE ?")
        params.append(f"%{keyword.upper()}%")
    elif scope == 'categoria' and keyword:
        where.append("(UPPER(a.descrizione) LIKE ? OR UPPER(a.codice) LIKE ?)")
        params.extend([f"%{keyword.upper()}%", f"%{keyword.upper()}%"])

    sql = f"""
        SELECT DISTINCT a.id, a.codice, a.descrizione
        FROM articoli a
        JOIN articolo_fornitore af ON af.articolo_id = a.id
        JOIN fornitori f ON f.id = af.fornitore_id
        WHERE {' AND '.join(where)}
        ORDER BY a.codice
    """
    conn = db.get_connection()
    rows = conn.execute(sql, params).fetchall()
    conn.close()
    articoli = [dict(r) for r in rows]
    if limite:
        articoli = articoli[:limite]
    return articoli


def portali_disponibili():
    """Lista dei fornitori con portale configurato: [{id, nome}]."""
    conn = db.get_connection()
    rows = conn.execute("""
        SELECT id, COALESCE(NULLIF(nome,''), codice_mexal) AS nome
        FROM fornitori
        WHERE url_portale IS NOT NULL AND url_portale != ''
        ORDER BY nome
    """).fetchall()
    conn.close()
    return [dict(r) for r in rows]


_BROWSER_OK = None


def browser_disponibile():
    """
    Verifica (una sola volta, poi memorizza l'esito positivo) che il browser
    Playwright sia installato e avviabile. Ritorna (ok: bool, messaggio: str).
    Serve a NON fallire in silenzio: senza browser nessuna ricerca funziona.
    """
    global _BROWSER_OK
    if _BROWSER_OK:
        return True, ''
    try:
        from playwright.sync_api import sync_playwright
    except Exception:
        return False, ("Playwright non installato. Esegui 'installa.bat' "
                       "oppure: python -m playwright install chromium")
    try:
        pw = sync_playwright().start()
        try:
            b = pw.chromium.launch(headless=True)
            b.close()
        finally:
            pw.stop()
        _BROWSER_OK = True
        return True, ''
    except Exception as e:
        m = str(e)
        if "Executable doesn't exist" in m or "playwright install" in m:
            return False, ("Browser Chromium di Playwright NON installato. "
                           "Esegui 'installa.bat', oppure in un terminale nella "
                           "cartella del programma:  python -m playwright install chromium")
        return False, f"Impossibile avviare il browser: {m}"


# ─── Ricerca massiva: split per portale (in parallelo) + merge ──────────────

def _articoli_per_portale(article_ids, portal_ids, only_missing_code):
    """
    Per ciascun portale, il sottoinsieme di `article_ids` ad esso collegati
    (rispettando il filtro 'solo dove manca il codice'). Mantiene l'ordine
    di `article_ids`. Una sola query (a blocchi) invece di una per articolo.
    """
    per = {pid: [] for pid in portal_ids}
    if not article_ids or not portal_ids:
        return per
    cond = ("AND (codice_fornitore IS NULL OR codice_fornitore='')"
            if only_missing_code else "")
    ph_p = ','.join('?' * len(portal_ids))
    linked = {pid: set() for pid in portal_ids}
    conn = db.get_connection()
    try:
        for start in range(0, len(article_ids), 400):
            chunk = article_ids[start:start + 400]
            ph_a = ','.join('?' * len(chunk))
            for r in conn.execute(
                f"""SELECT DISTINCT articolo_id, fornitore_id
                    FROM articolo_fornitore
                    WHERE fornitore_id IN ({ph_p})
                      AND articolo_id IN ({ph_a}) {cond}""",
                    list(portal_ids) + list(chunk)):
                linked[r['fornitore_id']].add(r['articolo_id'])
    finally:
        conn.close()
    return {pid: [aid for aid in article_ids if aid in linked[pid]]
            for pid in portal_ids}


def search_batch(articoli, fornitore_ids=None, only_missing_code=False,
                 progress_cb=None, log_cb=None, stop_event=None, parallel=True):
    """
    Cerca codici/prezzi per la lista `articoli`. NON salva nel database:
    ritorna i risultati (da rivedere in tabella e salvare con `save_results`).

    Strategia: la ricerca è SPLITTATA per portale; i portali girano IN
    PARALLELO, ciascuno con il proprio browser (un login per portale), e i
    risultati vengono poi FUSI. Così "tutti gli articoli × tutti i fornitori"
    non procede in fila ma in contemporanea. Con `parallel=False` i portali
    vanno in sequenza (un thread alla volta).

    fornitore_ids: limita ai portali indicati; None = tutti i portali.
    only_missing_code: True = salta i link che hanno già il codice fornitore.
    """
    import threading

    # 0) Il browser è installato? Senza, nessuna ricerca funziona → dillo chiaro.
    ok, msg = browser_disponibile()
    if not ok:
        if log_cb:
            log_cb(f"❌ {msg}")
        return []

    # 1) Portali bersaglio (solo quelli con credenziali configurate)
    portali = portali_disponibili()
    if fornitore_ids:
        sset = set(fornitore_ids)
        portali = [p for p in portali if p['id'] in sset]
    usable = []
    for p in portali:
        if _creds(p['id']).get('username'):
            usable.append(p)
            if log_cb:
                log_cb(f"🔐 {p['nome']}: credenziali OK")
        elif log_cb:
            log_cb(f"⚠ {p['nome']}: credenziali MANCANTI → saltato "
                   f"(configurale in 'Credenziali Portali').")
    if not usable:
        if log_cb:
            log_cb("Nessun portale utilizzabile (credenziali mancanti).")
        return []

    # 2) Lista articoli per ciascun portale (una query, a blocchi)
    art_by_id = {a['id']: a for a in articoli}
    per_portal = _articoli_per_portale(
        [a['id'] for a in articoli], [p['id'] for p in usable], only_missing_code)
    totale = sum(len(v) for v in per_portal.values())
    if log_cb:
        log_cb(f"Ricerche totali: {totale} su {len(usable)} portali "
               f"({'in parallelo' if parallel else 'in sequenza'}).")
    if not totale:
        return []

    # 3) Un worker (un browser) per portale
    lock = threading.Lock()
    state = {'done': 0}
    risultati = []

    def _worker(pid, pnome, art_ids):
        from playwright.sync_api import sync_playwright
        local = []
        pw = sync_playwright().start()
        try:
            browser = pw.chromium.launch(headless=True)
            try:
                for aid in art_ids:
                    if stop_event is not None and stop_event.is_set():
                        break
                    try:
                        rs = search_article_on_portals(
                            aid, shared_browser=browser, fornitore_ids=[pid],
                            only_missing_code=only_missing_code)
                    except Exception as e:
                        logger.warning(f"[{pnome}] articolo {aid}: {e}")
                        rs = []
                    a = art_by_id.get(aid, {})
                    for res in rs:
                        res['articolo_id'] = aid
                        res['articolo_codice'] = a.get('codice', '')
                        res['articolo_descr'] = a.get('descrizione', '')
                        local.append(res)
                    with lock:
                        state['done'] += 1
                        if progress_cb:
                            progress_cb(state['done'], totale,
                                        f"{pnome}: {a.get('codice','')}")
            finally:
                browser.close()
        finally:
            pw.stop()
        with lock:
            risultati.extend(local)
            if log_cb:
                n_pr = sum(1 for r in local if r.get('prezzo'))
                log_cb(f"  ✓ {pnome}: {len(local)} risultati ({n_pr} con prezzo).")

    threads = [threading.Thread(
        target=_worker, args=(p['id'], p['nome'], per_portal.get(p['id'], [])),
        daemon=True) for p in usable]
    if parallel:
        for t in threads:
            t.start()
        for t in threads:
            t.join()
    else:
        for t in threads:
            t.start()
            t.join()

    # 4) Merge ordinato per codice articolo
    risultati.sort(key=lambda r: r.get('articolo_codice', ''))
    if log_cb:
        n_pr = sum(1 for r in risultati if r.get('prezzo'))
        nota = (" (interrotto)" if stop_event is not None and stop_event.is_set()
                else "")
        log_cb(f"\n✅ Ricerca completata{nota}: {len(risultati)} risultati "
               f"({n_pr} con prezzo). Rivedi la tabella e salva.")
    return risultati


def save_results(risultati):
    """
    Salva nel DB i risultati scelti (lista di dict con almeno articolo_id,
    fornitore_id, e codice_trovato/prezzo). Ritorna il numero di righe salvate.
    """
    n = 0
    for res in risultati:
        try:
            save_scraping_result(
                res['articolo_id'], res['fornitore_id'],
                res.get('codice_trovato', '') or '', res.get('prezzo'))
            n += 1
        except Exception as e:
            logger.warning(f"Errore salvataggio {res.get('articolo_codice')}: {e}")
    return n


# ─── Entry point principale ────────────────────────────────────────────────

def search_all_articles_on_portals(filtro='senza_codice',
                                   progress_cb=None, log_cb=None,
                                   stop_event=None, salva=True,
                                   limite=None):
    """
    Ricerca MASSIVA su tutti i portali per molti articoli.

    filtro:
      'senza_codice'  → solo articoli che hanno un fornitore con portale
                        ma SENZA codice fornitore registrato (caso più utile:
                        completa i codici mancanti)
      'con_fornitore' → tutti gli articoli che hanno almeno un fornitore con portale
      'tutti'         → tutti gli articoli del database (sconsigliato: lentissimo)

    progress_cb(i, totale, descrizione)  → avanzamento
    log_cb(messaggio)                      → log testuale
    stop_event (threading.Event)           → se settato, interrompe il ciclo
    salva                                  → salva automaticamente codici/prezzi trovati
    limite                                 → max numero di articoli da processare (None = tutti)

    Ritorna: lista di dict con i risultati per articolo.
    """
    conn = db.get_connection()

    if filtro == 'senza_codice':
        rows = conn.execute("""
            SELECT DISTINCT a.id, a.codice, a.descrizione
            FROM articoli a
            JOIN articolo_fornitore af ON af.articolo_id = a.id
            JOIN fornitori f ON f.id = af.fornitore_id
            WHERE f.url_portale IS NOT NULL AND f.url_portale != ''
              AND (af.codice_fornitore IS NULL OR af.codice_fornitore = '')
            ORDER BY a.codice
        """).fetchall()
    elif filtro == 'con_fornitore':
        rows = conn.execute("""
            SELECT DISTINCT a.id, a.codice, a.descrizione
            FROM articoli a
            JOIN articolo_fornitore af ON af.articolo_id = a.id
            JOIN fornitori f ON f.id = af.fornitore_id
            WHERE f.url_portale IS NOT NULL AND f.url_portale != ''
            ORDER BY a.codice
        """).fetchall()
    else:  # tutti
        rows = conn.execute(
            "SELECT id, codice, descrizione FROM articoli ORDER BY codice"
        ).fetchall()
    conn.close()

    articoli = [dict(r) for r in rows]
    if limite:
        articoli = articoli[:limite]

    totale = len(articoli)
    if log_cb:
        # Stato dei portali: avvisa SUBITO se mancano le credenziali,
        # altrimenti quei fornitori vengono saltati in silenzio.
        conn = db.get_connection()
        portali = conn.execute("""
            SELECT id, nome, codice_mexal FROM fornitori
            WHERE url_portale IS NOT NULL AND url_portale != ''
        """).fetchall()
        conn.close()
        for p in portali:
            nome = p['nome'] or p['codice_mexal']
            if _creds(p['id']).get('username'):
                log_cb(f"🔐 {nome}: credenziali OK")
            else:
                log_cb(f"⚠ {nome}: credenziali MANCANTI → portale saltato. "
                       f"Configurale nel tab 'Credenziali Portali'.")

        log_cb(f"Articoli da elaborare: {totale}")
        if totale > 100:
            stima_min = int(totale * 15 / 60)  # ~15s per articolo stimato
            log_cb(f"⏱ Tempo stimato: ~{stima_min} minuti "
                   f"(puoi premere Stop in qualsiasi momento).")

    tutti_risultati = []
    trovati = 0
    con_prezzo = 0
    salvati = 0

    for idx, art in enumerate(articoli):
        # Controllo Stop
        if stop_event is not None and stop_event.is_set():
            if log_cb:
                log_cb(f"\n⏹ Interrotto dall'utente dopo {idx} articoli.")
            break

        if progress_cb:
            progress_cb(idx + 1, totale, art['codice'])

        try:
            res_list = search_article_on_portals(art['id'])
        except Exception as e:
            logger.warning(f"Errore su articolo {art['codice']}: {e}")
            res_list = []

        for res in res_list:
            res['articolo_id'] = art['id']
            res['articolo_codice'] = art['codice']
            tutti_risultati.append(res)
            trovati += 1
            if res.get('prezzo'):
                con_prezzo += 1

            if salva and (res.get('codice_trovato') or res.get('prezzo')):
                try:
                    save_scraping_result(
                        art['id'], res['fornitore_id'],
                        res.get('codice_trovato', ''), res.get('prezzo'))
                    salvati += 1
                except Exception as e:
                    logger.warning(f"Errore salvataggio {art['codice']}: {e}")

        if log_cb and (idx + 1) % 10 == 0:
            log_cb(f"  …{idx+1}/{totale} elaborati, "
                   f"{trovati} risultati ({con_prezzo} con prezzo), "
                   f"{salvati} salvati.")

    if log_cb:
        log_cb(f"\n✅ Ricerca massiva completata.\n"
               f"   Articoli elaborati: {min(idx+1, totale) if articoli else 0}\n"
               f"   Risultati trovati: {trovati} (di cui {con_prezzo} con prezzo)\n"
               f"   Codici/prezzi salvati: {salvati}")
        if trovati and not con_prezzo:
            log_cb("\n⚠ Trovati codici ma NESSUN PREZZO: di solito significa che "
                   "il login non riesce o che l'account non vede i prezzi. "
                   "Verifica con 'Testa login' nel tab Credenziali Portali.")

    return tutti_risultati


def search_article_on_portals(articolo_id: int, progress_cb=None,
                              shared_browser=None, fornitore_ids=None,
                              only_missing_code=False):
    """
    Per un articolo cerca sui portali dei fornitori assegnati.
    Usa i codici già noti come termini di ricerca sui portali.

    shared_browser    → browser Playwright condiviso (ricerca massiva veloce)
    fornitore_ids     → se passato, limita la ricerca a questi fornitori
    only_missing_code → se True, salta i fornitori che hanno già il codice
    """
    conn = db.get_connection()
    art = conn.execute("SELECT * FROM articoli WHERE id=?", (articolo_id,)).fetchone()
    afs = conn.execute("""
        SELECT af.*, f.nome, f.url_portale, f.codice_mexal, f.note
        FROM articolo_fornitore af
        JOIN fornitori f ON f.id = af.fornitore_id
        WHERE af.articolo_id=?
          AND f.url_portale IS NOT NULL AND f.url_portale != ''
    """, (articolo_id,)).fetchall()
    conn.close()

    if not art:
        return []

    art = dict(art)
    afs = [dict(r) for r in afs]

    # Filtri: solo certi fornitori e/o solo dove manca il codice fornitore
    if fornitore_ids:
        fornitore_ids = set(fornitore_ids)
        afs = [af for af in afs if af['fornitore_id'] in fornitore_ids]
    if only_missing_code:
        afs = [af for af in afs if not (af.get('codice_fornitore') or '').strip()]

    descr = (art.get("descrizione") or "").strip()
    cod_mexal = (art.get("codice") or "").strip()

    results = []
    total = len(afs)

    for idx, af in enumerate(afs):
        url = (af.get("url_portale") or "").strip()
        if not url:
            continue
        if progress_cb:
            progress_cb(idx + 1, total, af.get("nome") or af["codice_mexal"])

        # Termini di ricerca specifici di QUESTO fornitore (priorità al suo
        # codice già noto, poi il codice Mexal, infine la descrizione breve).
        terms = []
        cod_forn = (af.get("codice_fornitore") or "").strip()
        if cod_forn:
            terms.append(cod_forn)
        if cod_mexal:
            terms.append(cod_mexal)
        if descr:
            terms.append(descr[:40])
        seen = set()
        terms = [t for t in terms if t and not (t in seen or seen.add(t))]

        handler = _pick_handler(url)
        creds   = _creds(af["fornitore_id"])
        portal_cfg = _parse_portal_note(af.get("note") or "")

        for term in terms:
            try:
                res = handler(
                    url=url,
                    search_term=term,
                    creds=creds,
                    config=portal_cfg,
                    shared_browser=shared_browser,
                )
            except Exception as e:
                logger.warning(f"Errore scraping {url} term={term}: {e}")
                res = None

            if res:
                res["fornitore_id"]   = af["fornitore_id"]
                res["fornitore_nome"] = af.get("nome") or af["codice_mexal"]
                res["search_term"]    = term
                res["cod_attuale"]    = cod_forn
                res["stato"] = ("prezzo" if res.get("prezzo")
                                else ("solo_codice" if res.get("codice_trovato")
                                      else "vuoto"))
                results.append(res)
                break   # trovato: prossimo fornitore

        if shared_browser is None:
            time.sleep(0.5)

    return results


def save_scraping_result(articolo_id: int, fornitore_id: int,
                         codice_trovato: str, prezzo: Optional[float]):
    conn = db.get_connection()
    if codice_trovato:
        conn.execute("""
            UPDATE articolo_fornitore
            SET codice_fornitore = ?
            WHERE articolo_id=? AND fornitore_id=?
              AND (codice_fornitore IS NULL OR codice_fornitore='')
        """, (codice_trovato, articolo_id, fornitore_id))
    conn.commit()
    conn.close()
    if prezzo:
        db.apply_price_update(articolo_id, fornitore_id, prezzo, "scraping")


# ─── Router handler ────────────────────────────────────────────────────────

def _pick_handler(url: str):
    url_l = url.lower()
    if "cardinalegroup" in url_l:
        return _scrape_cardinale
    if "spolzino" in url_l:
        return _scrape_spolzino
    if "idroferrara" in url_l:
        return _scrape_idroferrara
    return _scrape_generic


# ══════════════════════════════════════════════════════════════════════════════
#  HANDLER 1 — CARDINALE GROUP
#  shop.cardinalegroup.it  —  SPA (probabilmente Vue), login richiesto
#  Ricerca: form con campo "Codice" + "Descrizione", risultati via XHR
# ══════════════════════════════════════════════════════════════════════════════

def _scrape_cardinale(url, search_term, creds, config, shared_browser=None):
    """
    Flusso:
      1. Apri http://shop.cardinalegroup.it/login
      2. Inserisci credenziali e fai login
      3. Vai alla home, usa la barra di ricerca per codice
      4. Aspetta i risultati e leggi codice + prezzo
    """
    from playwright.sync_api import TimeoutError as PWTimeout

    base = "https://shop.cardinalegroup.it"
    cache_key = f"cardinale:{base}"
    username = creds.get("username", "")
    password = creds.get("password", "")

    if not username or not password:
        logger.warning("Cardinale: credenziali non configurate")
        return None

    with _acquire_browser(shared_browser) as browser:
        # Usa sessione cached se disponibile (evita re-login)
        saved_state = _get_cached_session(cache_key)
        ctx = browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                       "AppleWebKit/537.36 (KHTML, like Gecko) "
                       "Chrome/124.0.0.0 Safari/537.36",
            locale="it-IT",
            storage_state=saved_state,
        )
        page = ctx.new_page()
        try:
            # LOGIN solo se necessario (nessuna sessione valida in cache)
            if not saved_state:
                page.goto(f"{base}/login", wait_until="networkidle", timeout=20000)
                page.wait_for_timeout(1500)

                _pw_fill(page, [
                    'input[name="username"]', 'input[id*="user" i]',
                    'input[placeholder*="sername" i]', 'input[type="text"]',
                    'input[type="email"]', '#username', '#email', 'input',
                ], username)

                _pw_fill(page, [
                    'input[name="password"]', 'input[type="password"]',
                    'input[id*="pass" i]', 'input[placeholder*="assword" i]',
                    '#password',
                ], password)

                for sel in [
                    'input[type="radio"][value*="scont" i]',
                    'label:has-text("Mostra prezzi scontati") input',
                    'label:has-text("prezzi scontati") input',
                ]:
                    try:
                        page.check(sel, timeout=2000)
                        break
                    except Exception:
                        pass

                _pw_click(page, [
                    'button:has-text("Accedi")', 'button[type="submit"]',
                    'input[type="submit"]', '.btn-login', 'a:has-text("Accedi")',
                ])
                page.wait_for_load_state("networkidle", timeout=15000)
                page.wait_for_timeout(1500)

                if "/login" in page.url:
                    logger.warning("Cardinale: login fallito (ancora su pagina login)")
                    _invalidate_session(cache_key)
                    return None

                # Salva sessione per le prossime chiamate
                _save_session(cache_key, ctx.storage_state())

            # STRATEGIA 1 — URL prodotto diretto (più affidabile)
            # Cardinale usa /product/{CODICE} per le schede prodotto
            cod_clean = re.sub(r'[^A-Za-z0-9]', '', search_term)
            for prod_url in [f"{base}/product/{search_term}",
                             f"{base}/product/{cod_clean}"]:
                try:
                    page.goto(prod_url, wait_until="networkidle", timeout=12000)
                    page.wait_for_timeout(1200)
                    res = _cardinale_parse_results(page, search_term)
                    if res and res.get('prezzo'):
                        return res
                except Exception:
                    pass

            # STRATEGIA 2 — pagina risultati di ricerca diretta
            try:
                page.goto(f"{base}/search/?search={_urlencode(search_term)}",
                          wait_until="networkidle", timeout=15000)
                page.wait_for_timeout(1500)
                res = _cardinale_parse_results(page, search_term)
                if res:
                    return res
            except Exception:
                pass

            # STRATEGIA 3 — barra di ricerca dalla home (fallback)
            page.goto(f"{base}/", wait_until="networkidle", timeout=15000)
            page.wait_for_timeout(1000)

            code_filled = False
            for sel in ['input[placeholder*="Codice"]', 'input[placeholder*="codice"]',
                        'td:nth-child(2) input', '.search-code input',
                        'input[type="search"]', 'input[name="q"]', '.search input']:
                try:
                    page.fill(sel, search_term, timeout=3000)
                    code_filled = True
                    break
                except Exception:
                    pass

            if not code_filled:
                logger.warning("Cardinale: impossibile trovare il campo di ricerca")
                return None

            page.keyboard.press("Enter")
            page.wait_for_load_state("networkidle", timeout=15000)
            page.wait_for_timeout(1500)

            # Leggi risultati — cerca tabella/lista prodotti
            return _cardinale_parse_results(page, search_term)

        except PWTimeout:
            logger.warning(f"Cardinale: timeout durante scraping di '{search_term}'")
            _invalidate_session(cache_key)
            return None
        except Exception as e:
            logger.exception(f"Cardinale scraping error: {e}")
            _invalidate_session(cache_key)
            return None
        finally:
            try:
                ctx.close()
            except Exception:
                pass


def _cardinale_parse_results(page, search_term):
    """
    Estrae codice e prezzo NETTO dai risultati Cardinale.

    Nel testo della pagina risultati ogni articolo è una riga di tabella
    (celle separate da tab) seguita dai prezzi su righe proprie:

        CODICE \\t DESCRIZIONE ... \\t GIACENZA \\t
        86.4800        ← prezzo di listino (lordo)
        60+12 %        ← sconto applicato
        30.4410        ← prezzo netto (quello da usare)

    Attenzione: il termine cercato compare anche nell'intestazione
    "Risultati ricerca : X", che NON è un risultato e va ignorata.
    """
    try:
        page.wait_for_timeout(2000)
        body = page.inner_text("body")
        lines = body.splitlines()
        term_up = search_term.upper()

        def _block_prices(start):
            """Prezzi e sconto nelle righe del blocco articolo."""
            prices, sconto = [], None
            for j in range(start, min(len(lines), start + 10)):
                l = lines[j]
                # Inizio della riga di un ALTRO articolo → stop
                if j > start and '\t' in l and \
                        re.match(r'^[A-Z0-9][A-Z0-9.\-/]*\t', l.strip(), re.I):
                    break
                for pm in re.finditer(r'(\d{1,5}[.,]\d{2,4})(?!\d)', l):
                    val = _parse_price(pm.group(1))
                    if val and 0.01 <= val < 99999:
                        prices.append(val)
                sm = re.search(r'\b(\d{1,2}(?:\+\d{1,2})*)\s*%', l)
                if sm:
                    sconto = sm.group(1)
            return prices, sconto

        # 1) Riga-prodotto nella tabella risultati (prima cella = codice)
        for i, line in enumerate(lines):
            l = line.strip()
            if not l or 'risultati ricerca' in l.lower():
                continue
            cells = l.split('\t')
            first = cells[0].strip().upper()
            if first == term_up or (len(cells) > 2 and term_up in l.upper()):
                prices, sconto = _block_prices(i)
                if prices:
                    netto = min(prices)   # col listino scontato il netto è il più basso
                    lordo = max(prices)
                    return {
                        "codice_trovato": first or search_term,
                        "prezzo": netto,
                        "prezzo_lordo": lordo if lordo != netto else None,
                        "sconto": sconto,
                        "url": page.url,
                    }
                # Codice trovato ma prezzo non visibile (es. login mancante)
                return {"codice_trovato": first or search_term,
                        "prezzo": None, "url": page.url}

        # 2) Fallback per pagina prodotto diretta (non è una pagina di ricerca)
        if 'risultati ricerca' not in body.lower() and term_up in body.upper():
            prices = []
            for m in re.findall(r'\d{1,5}[.,]\d{2,4}', body):
                val = _parse_price(m)
                if val and 0.1 < val < 99999:
                    prices.append(val)
            if prices:
                return {"codice_trovato": search_term,
                        "prezzo": min(prices),
                        "url": page.url}
    except Exception as e:
        logger.warning(f"Cardinale parse error: {e}")
    return None


# ══════════════════════════════════════════════════════════════════════════════
#  HANDLER 2 — SPOLZINO
#  www.spolzino.com  —  sito custom, area riservata per prezzi
#  Ricerca: /catalogo/prodotti?q={term}  oppure barra di ricerca
# ══════════════════════════════════════════════════════════════════════════════

def _scrape_spolzino(url, search_term, creds, config, shared_browser=None):
    from playwright.sync_api import TimeoutError as PWTimeout

    base = "https://www.spolzino.com"
    cache_key = f"spolzino:{base}"
    username = creds.get("username", "")
    password = creds.get("password", "")

    if not username or not password:
        logger.warning("Spolzino: credenziali non configurate")
        return None

    with _acquire_browser(shared_browser) as browser:
        saved_state = _get_cached_session(cache_key)
        ctx = browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                       "AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36",
            locale="it-IT",
            storage_state=saved_state,
        )
        page = ctx.new_page()
        try:
            # LOGIN solo se non c'è sessione cached
            if not saved_state:
                page.goto(f"{base}/il-mio-account", wait_until="networkidle", timeout=20000)
                _pw_fill(page, ['input[name="username"]', 'input[name="email"]',
                                '#username', '#email', 'input[type="email"]'],
                         username)
                _pw_fill(page, ['input[name="password"]', 'input[type="password"]',
                                '#password'],
                         password)
                _pw_click(page, ['button[type="submit"]', 'input[type="submit"]',
                                 'button:has-text("Accedi")', 'button:has-text("Login")'])
                page.wait_for_load_state("networkidle", timeout=15000)

                if "il-mio-account" in page.url and page.query_selector('form[name="loginform"]'):
                    logger.warning("Spolzino: login fallito")
                    _invalidate_session(cache_key)
                    return None

                _save_session(cache_key, ctx.storage_state())

            # RICERCA — prova URL di ricerca catalogo
            search_url = f"{base}/catalogo/prodotti?q={_urlencode(search_term)}"
            page.goto(search_url, wait_until="networkidle", timeout=20000)
            page.wait_for_timeout(2000)

            # Prova anche barra di ricerca se la pagina è vuota
            body_text = page.inner_text("body")
            if search_term.upper() not in body_text.upper():
                for sel in ['input[type="search"]', 'input[name="q"]',
                            'input[placeholder*="erca"]', '.search-input']:
                    try:
                        page.fill(sel, search_term, timeout=3000)
                        page.keyboard.press("Enter")
                        page.wait_for_load_state("networkidle", timeout=12000)
                        break
                    except Exception:
                        pass

            return _spolzino_parse_results(page, search_term)

        except PWTimeout:
            logger.warning(f"Spolzino: timeout per '{search_term}'")
            _invalidate_session(cache_key)
            return None
        except Exception as e:
            logger.exception(f"Spolzino scraping error: {e}")
            _invalidate_session(cache_key)
            return None
        finally:
            try:
                ctx.close()
            except Exception:
                pass


def _spolzino_parse_results(page, search_term):
    try:
        page.wait_for_timeout(1500)
        body = page.inner_text("body")
        lines = body.splitlines()

        code_found = None
        price_found = None

        for i, line in enumerate(lines):
            if search_term.upper() in line.upper():
                code_found = search_term
                context = "\n".join(lines[max(0,i-3):i+6])
                # Spolzino mostra prezzi come "12,34 €" o "€ 12,34"
                ps = re.findall(r'(\d{1,5}[,\.]\d{2,4})', context)
                for p in ps:
                    val = float(p.replace(",", "."))
                    if 0.01 < val < 99999:
                        price_found = val
                        break
                break

        # Cerca link prodotto specifico
        product_url = page.url
        try:
            # primo link prodotto visibile
            link = page.query_selector("a.product-link, .product-item a, .catalog-product a")
            if link:
                href = link.get_attribute("href")
                if href:
                    product_url = href
        except Exception:
            pass

        if code_found or price_found:
            return {
                "codice_trovato": code_found,
                "prezzo": price_found,
                "url": product_url,
            }
    except Exception as e:
        logger.warning(f"Spolzino parse error: {e}")
    return None


# ══════════════════════════════════════════════════════════════════════════════
#  HANDLER 3 — IDROFERRARA (Magento 2)
#  aziende.idroferrara.com  —  Magento 2 B2B, prezzi visibili con login
#  Ricerca: /catalogsearch/result/?q={term}  (standard Magento)
#  Alternativa REST API: /rest/V1/products (richiede token Bearer)
# ══════════════════════════════════════════════════════════════════════════════

def _scrape_idroferrara(url, search_term, creds, config, shared_browser=None):
    from playwright.sync_api import TimeoutError as PWTimeout

    base = "https://aziende.idroferrara.com"
    username = creds.get("username", "")
    password = creds.get("password", "")

    # Prova prima REST API (più veloce, non richiede browser)
    if username and password:
        token = _idroferrara_get_token(base, username, password)
        if token:
            res = _idroferrara_rest_search(base, token, search_term)
            if res:
                return res

    # Fallback: Playwright con login
    if not username or not password:
        logger.warning("IdroFerrara: credenziali non configurate")
        return None

    with _acquire_browser(shared_browser) as browser:
        ctx = browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                       "AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36",
            locale="it-IT",
        )
        page = ctx.new_page()
        try:
            # LOGIN Magento 2
            page.goto(f"{base}/customer/account/login/",
                      wait_until="networkidle", timeout=20000)

            # Magento 2: campi standard
            _pw_fill(page, ['#email', 'input[name="login[username]"]',
                            'input[autocomplete="email"]'],
                     username)
            _pw_fill(page, ['#pass', 'input[name="login[password]"]',
                            'input[type="password"]'],
                     password)
            _pw_click(page, ['#send2', 'button.action.login',
                             'button[type="submit"]'])
            page.wait_for_load_state("networkidle", timeout=15000)

            if "login" in page.url:
                logger.warning("IdroFerrara: login Magento fallito")
                return None

            # RICERCA via URL standard Magento
            page.goto(
                f"{base}/catalogsearch/result/?q={_urlencode(search_term)}",
                wait_until="networkidle", timeout=20000
            )
            page.wait_for_timeout(2000)

            return _idroferrara_parse_results(page, search_term, base)

        except PWTimeout:
            logger.warning(f"IdroFerrara: timeout per '{search_term}'")
            return None
        except Exception as e:
            logger.exception(f"IdroFerrara scraping error: {e}")
            return None
        finally:
            try:
                ctx.close()
            except Exception:
                pass


def _idroferrara_get_token(base: str, username: str, password: str) -> Optional[str]:
    """Ottiene Bearer token Magento REST."""
    import requests as req
    try:
        r = req.post(
            f"{base}/rest/V1/integration/customer/token",
            json={"username": username, "password": password},
            timeout=10,
            headers={"Content-Type": "application/json",
                     "User-Agent": "Mozilla/5.0"},
        )
        if r.status_code == 200:
            token = r.json()
            if isinstance(token, str):
                return token
    except Exception as e:
        logger.warning(f"IdroFerrara token error: {e}")
    return None


def _idroferrara_rest_search(base: str, token: str, search_term: str) -> Optional[dict]:
    """Ricerca prodotto via Magento REST API con token autenticato."""
    import requests as req
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0",
    }
    # Cerca per SKU esatto
    try:
        r = req.get(
            f"{base}/rest/V1/products"
            f"?searchCriteria[filter_groups][0][filters][0][field]=sku"
            f"&searchCriteria[filter_groups][0][filters][0][value]={_urlencode(search_term)}"
            f"&searchCriteria[filter_groups][0][filters][0][condition_type]=like"
            f"&fields=items[sku,name,price]",
            headers=headers, timeout=12,
        )
        if r.status_code == 200:
            data = r.json()
            items = data.get("items", [])
            if items:
                item = items[0]
                return {
                    "codice_trovato": item.get("sku"),
                    "prezzo": item.get("price"),
                    "url": f"{base}/{item.get('sku','').lower()}",
                }
    except Exception as e:
        logger.warning(f"IdroFerrara REST search error: {e}")

    # Cerca per nome/descrizione
    try:
        r = req.get(
            f"{base}/rest/V1/products"
            f"?searchCriteria[filter_groups][0][filters][0][field]=name"
            f"&searchCriteria[filter_groups][0][filters][0][value]=%25{_urlencode(search_term)}%25"
            f"&searchCriteria[filter_groups][0][filters][0][condition_type]=like"
            f"&fields=items[sku,name,price]"
            f"&searchCriteria[pageSize]=3",
            headers=headers, timeout=12,
        )
        if r.status_code == 200:
            items = r.json().get("items", [])
            if items:
                item = items[0]
                return {
                    "codice_trovato": item.get("sku"),
                    "prezzo": item.get("price"),
                    "url": f"{base}/{item.get('sku','').lower()}",
                }
    except Exception as e:
        logger.warning(f"IdroFerrara REST name search error: {e}")
    return None


def _idroferrara_parse_results(page, search_term, base):
    try:
        body = page.inner_text("body")

        # Magento: selettori standard prodotto
        price_found = None
        code_found = None
        product_url = page.url

        # Prova selettori CSS Magento
        try:
            price_el = page.query_selector(".price-wrapper .price, "
                                           ".price-box .price, "
                                           "span.price")
            if price_el:
                price_text = price_el.inner_text()
                val = _parse_price(price_text)
                if val:
                    price_found = val
        except Exception:
            pass

        # Cerca SKU nella pagina
        try:
            sku_el = page.query_selector(".product.attribute.sku .value, "
                                         '[itemprop="sku"], .sku .value')
            if sku_el:
                code_found = sku_el.inner_text().strip()
        except Exception:
            pass

        # Fallback: cerca term nel testo
        if search_term.upper() in body.upper():
            code_found = code_found or search_term
            if not price_found:
                prices = re.findall(r'(\d{1,5}[,\.]\d{2,4})', body)
                for p in prices:
                    val = float(p.replace(",", "."))
                    if 0.1 < val < 99999:
                        price_found = val
                        break

        # URL primo prodotto
        try:
            link = page.query_selector(
                "a.product-item-link, .product-item-info a, "
                ".product-item-name a"
            )
            if link:
                href = link.get_attribute("href") or ""
                if href.startswith("http"):
                    product_url = href
        except Exception:
            pass

        if code_found or price_found:
            return {
                "codice_trovato": code_found,
                "prezzo": price_found,
                "url": product_url,
            }
    except Exception as e:
        logger.warning(f"IdroFerrara parse error: {e}")
    return None


# ══════════════════════════════════════════════════════════════════════════════
#  HANDLER GENERICO — qualsiasi altro portale
#  Usa selettori CSS configurabili dall'utente (campo note del fornitore)
#  o euristica HTML con requests + BeautifulSoup
# ══════════════════════════════════════════════════════════════════════════════

def _scrape_generic(url, search_term, creds, config, shared_browser=None):
    """
    Strategia:
      1. Se configurato search_url_template → GET diretto (no JS)
      2. Altrimenti prova URL comuni di ricerca
      3. Estrae prezzo/codice con selettori CSS configurati o euristica
    Se il sito richiede login o JS → fallback Playwright
    """
    import requests as req
    from bs4 import BeautifulSoup

    username = creds.get("username", "")
    password = creds.get("password", "")
    headers  = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                      "AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36",
        "Accept-Language": "it-IT,it;q=0.9",
    }

    base = url.rstrip("/")
    template = config.get("search_url_template", "")
    search_url = (
        template.replace("{TERM}", _urlencode(search_term))
        if template else
        f"{base}/search?q={_urlencode(search_term)}"
    )

    s = req.Session()
    s.headers.update(headers)

    # Login opzionale con requests
    if username and password:
        login_url = config.get("login_url", f"{base}/login")
        login_data = {
            config.get("login_field_user", "username"): username,
            config.get("login_field_pass", "password"): password,
        }
        try:
            s.post(login_url, data=login_data, timeout=10)
        except Exception:
            pass

    try:
        r = s.get(search_url, timeout=15)
        if r.status_code != 200:
            # Prova con Playwright headless
            return _generic_playwright(base, search_url, search_term,
                                       username, password, config, shared_browser)
        soup = BeautifulSoup(r.text, "lxml")
        return _generic_parse(soup, search_term, search_url, config)
    except Exception as e:
        logger.warning(f"Generic scraping error {url}: {e}")
        return _generic_playwright(base, search_url, search_term,
                                   username, password, config, shared_browser)


def _generic_playwright(base, search_url, search_term, username, password,
                        config, shared_browser=None):
    """Fallback Playwright per siti con JavaScript o login complesso."""
    try:
        with _acquire_browser(shared_browser) as browser:
            ctx = browser.new_context(locale="it-IT")
            page = ctx.new_page()
            try:
                if username and password:
                    login_url = config.get("login_url", f"{base}/login")
                    page.goto(login_url, wait_until="networkidle", timeout=20000)
                    _pw_fill(page, ['input[name="username"]', 'input[type="email"]',
                                    '#email', '#username'],
                             username)
                    _pw_fill(page, ['input[type="password"]', '#password'],
                             password)
                    _pw_click(page, ['button[type="submit"]', 'input[type="submit"]'])
                    page.wait_for_load_state("networkidle", timeout=12000)

                page.goto(search_url, wait_until="networkidle", timeout=20000)
                page.wait_for_timeout(2000)
                body = page.inner_text("body")

                code_found = search_term if search_term.upper() in body.upper() else None
                price_found = None
                prices = re.findall(r'(\d{1,5}[,\.]\d{2,4})', body)
                for p in prices:
                    val = float(p.replace(",", "."))
                    if 0.1 < val < 99999:
                        price_found = val
                        break

                if code_found or price_found:
                    return {"codice_trovato": code_found,
                            "prezzo": price_found,
                            "url": page.url}
            finally:
                try:
                    ctx.close()
                except Exception:
                    pass
    except Exception as e:
        logger.warning(f"Generic Playwright error: {e}")
    return None


def _generic_parse(soup, search_term, source_url, config):
    """Parse HTML con selettori configurati o euristica (soup già pronto)."""
    sel_prezzo = config.get("selector_prezzo")
    sel_codice = config.get("selector_codice")

    code_found  = None
    price_found = None

    if sel_codice:
        el = soup.select_one(sel_codice)
        if el:
            code_found = el.get_text(strip=True)

    if sel_prezzo:
        el = soup.select_one(sel_prezzo)
        if el:
            price_found = _parse_price(el.get_text(strip=True))
    else:
        text = soup.get_text()
        prices = re.findall(r'(\d{1,5}[,\.]\d{2,4})', text)
        for p in prices:
            val = float(p.replace(",", "."))
            if 0.1 < val < 99999:
                price_found = val
                break

    if not code_found:
        if search_term.upper() in soup.get_text().upper():
            code_found = search_term

    if code_found or price_found:
        return {"codice_trovato": code_found,
                "prezzo": price_found,
                "url": source_url}
    return None


# ─── Utility ──────────────────────────────────────────────────────────────

def _pw_fill(page, selectors: list, value: str):
    """Prova una lista di selettori CSS e riempie il primo trovato."""
    for sel in selectors:
        try:
            page.fill(sel, value, timeout=3000)
            return
        except Exception:
            pass
    raise RuntimeError(f"Nessun selettore trovato tra: {selectors}")


def _pw_click(page, selectors: list):
    """Prova una lista di selettori CSS e clicca il primo trovato."""
    for sel in selectors:
        try:
            page.click(sel, timeout=3000)
            return
        except Exception:
            pass
    raise RuntimeError(f"Nessun pulsante trovato tra: {selectors}")


def _parse_price(text: str) -> Optional[float]:
    """
    Gestisce formati italiani ed europei:
      - "1.234,56"  → 1234.56
      - "1234,56"   → 1234.56
      - "1234.56"   → 1234.56  (formato internazionale)
      - "€ 12,90"   → 12.90
    """
    if not text:
        return None
    # Rimuove simboli valuta e spazi
    text = re.sub(r'[€$£\s]', '', text.strip())
    # Formato italiano con migliaia: 1.234,56
    m = re.search(r'(\d{1,3}(?:\.\d{3})+,\d{2,4})', text)
    if m:
        try:
            return float(m.group(1).replace('.', '').replace(',', '.'))
        except ValueError:
            pass
    # Formato con virgola decimale: 1234,56
    m = re.search(r'(\d+),(\d{2,4})(?!\d)', text)
    if m:
        try:
            val = float(f"{m.group(1)}.{m.group(2)}")
            if 0.01 < val < 999999:
                return val
        except ValueError:
            pass
    # Formato internazionale: 1234.56
    m = re.search(r'(\d+)\.(\d{2,4})(?!\d)', text)
    if m:
        try:
            val = float(f"{m.group(1)}.{m.group(2)}")
            if 0.01 < val < 999999:
                return val
        except ValueError:
            pass
    return None


def _urlencode(s: str) -> str:
    from urllib.parse import quote
    return quote(str(s), safe="")


def _parse_portal_note(note: str) -> dict:
    try:
        return json.loads(note)
    except Exception:
        return {}
