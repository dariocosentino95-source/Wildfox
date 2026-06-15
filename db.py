"""
db.py - Gestione database SQLite per IDU Price Manager
Importa da anar_idu.csv e mantiene articoli + fornitori + storico prezzi
"""
import sqlite3
import pandas as pd
import os
import shutil
import logging

logger = logging.getLogger(__name__)

# I dati (database, CSV, log) vivono in una sottocartella "data" separata dal
# codice sorgente. Così la cartella principale resta pulita ed è facile fare
# backup o cancellare i dati senza toccare i .py.
HERE = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(HERE, "data")
DB_PATH = os.path.join(DATA_DIR, "idu_prices.db")
_OLD_DB_PATH = os.path.join(HERE, "idu_prices.db")  # posizione legacy


def _ensure_data_dir():
    """Crea data/ se manca e migra un eventuale DB nella vecchia posizione."""
    os.makedirs(DATA_DIR, exist_ok=True)
    if os.path.exists(_OLD_DB_PATH) and not os.path.exists(DB_PATH):
        try:
            shutil.move(_OLD_DB_PATH, DB_PATH)
            logger.info("Database migrato in data/idu_prices.db")
        except OSError as e:
            logger.warning(f"Migrazione database non riuscita: {e}")


_ensure_data_dir()


def get_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    """Crea le tabelle se non esistono."""
    conn = get_connection()
    c = conn.cursor()
    c.executescript("""
        CREATE TABLE IF NOT EXISTS articoli (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            codice      TEXT NOT NULL UNIQUE,
            descrizione TEXT,
            descr_agg   TEXT,
            um          TEXT,
            costo_ult   REAL,   -- _ARCUL: ultimo costo di acquisto (= prezzo base)
            data_agg    TEXT,
            ean         TEXT,
            listino_rif INTEGER
        );

        CREATE TABLE IF NOT EXISTS fornitori (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            codice_mexal TEXT NOT NULL UNIQUE,  -- es. 60100001
            nome        TEXT,
            url_portale TEXT,
            note        TEXT
        );

        CREATE TABLE IF NOT EXISTS articolo_fornitore (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            articolo_id     INTEGER NOT NULL REFERENCES articoli(id),
            fornitore_id    INTEGER NOT NULL REFERENCES fornitori(id),
            codice_fornitore TEXT,          -- _ARCOF
            prezzo_fornitore REAL,          -- _ARFPR
            prezzo_base      REAL,          -- prezzo base IDU (non scende mai)
            slot             INTEGER,       -- 1..9 (slot fornitore in mexal)
            ultima_verifica  TEXT,
            UNIQUE(articolo_id, fornitore_id)
        );

        CREATE TABLE IF NOT EXISTS storico_prezzi (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            articolo_id     INTEGER NOT NULL REFERENCES articoli(id),
            fornitore_id    INTEGER REFERENCES fornitori(id),
            campo           TEXT,   -- 'prezzo_fornitore' o 'prezzo_base'
            valore_vecchio  REAL,
            valore_nuovo    REAL,
            motivo          TEXT,   -- 'upload_csv', 'upload_pdf', 'scraping', 'manuale'
            data_modifica   TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS config (
            chiave  TEXT PRIMARY KEY,
            valore  TEXT
        );

        -- Indici per ricerche veloci
        CREATE INDEX IF NOT EXISTS idx_articoli_codice
            ON articoli(codice);
        CREATE INDEX IF NOT EXISTS idx_articoli_upper_codice
            ON articoli(UPPER(codice));
        CREATE INDEX IF NOT EXISTS idx_articoli_upper_descrizione
            ON articoli(UPPER(descrizione));
        CREATE INDEX IF NOT EXISTS idx_af_articolo
            ON articolo_fornitore(articolo_id);
        CREATE INDEX IF NOT EXISTS idx_af_fornitore
            ON articolo_fornitore(fornitore_id);
        CREATE INDEX IF NOT EXISTS idx_af_codice_forn
            ON articolo_fornitore(UPPER(codice_fornitore));
        CREATE INDEX IF NOT EXISTS idx_storico_articolo
            ON storico_prezzi(articolo_id);
        CREATE INDEX IF NOT EXISTS idx_fornitori_codice
            ON fornitori(codice_mexal);
    """)
    conn.commit()
    conn.close()
    logger.info("DB inizializzato.")


def import_from_csv(csv_path: str, progress_callback=None):
    """
    Importa o aggiorna articoli e fornitori dal CSV Mexal.
    Legge i campi _ARCOD, _ARDES, _ARAGG, _ARUM1, _ARCUL, _ARDTA, _ARALT
    e i blocchi fornitore _ARFOR(1..9), _ARFPR(1..9), _ARCOF(1..9).
    """
    logger.info(f"Import CSV: {csv_path}")
    # keep_default_na=False: le celle vuote restano stringhe '' invece di NaN,
    # così non compaiono più finti codici 'nan'. to_dict('records') itera molto
    # più velocemente di df.iterrows() su file con centinaia di colonne.
    df = pd.read_csv(csv_path, sep=';', engine='python', encoding='latin-1',
                     dtype=str, keep_default_na=False)
    records = df.to_dict('records')
    total = len(records)
    conn = get_connection()
    c = conn.cursor()

    righe_ok = 0         # righe del CSV con codice valido (un articolo può ripetersi)
    fornitori_ok = 0
    fornitori_agg = 0

    BATCH_SIZE = 500
    for i, row in enumerate(records):
        codice = str(row.get('_ARCOD', '') or '').strip()
        if not codice:
            continue

        descrizione = str(row.get('_ARDES', '') or '').strip()
        descr_agg   = str(row.get('_ARAGG', '') or '').strip()
        um          = str(row.get('_ARUM1', 'PZ') or 'PZ').strip()
        ean         = str(row.get('_ARALT', '') or '').strip()
        data_agg    = str(row.get('_ARDTA', '') or '').strip()
        listino     = _safe_int(row.get('_ARLIS'))

        # Costo ultimo acquisto (prezzo base)
        costo_raw = str(row.get('_ARCUL', '') or '').replace(',', '.').strip()
        costo_ult = _safe_float(costo_raw)

        c.execute("""
            INSERT INTO articoli (codice, descrizione, descr_agg, um, costo_ult, data_agg, ean, listino_rif)
            VALUES (?,?,?,?,?,?,?,?)
            ON CONFLICT(codice) DO UPDATE SET
                descrizione = excluded.descrizione,
                descr_agg   = excluded.descr_agg,
                um          = excluded.um,
                costo_ult   = COALESCE(excluded.costo_ult, articoli.costo_ult),
                data_agg    = excluded.data_agg,
                ean         = excluded.ean,
                listino_rif = excluded.listino_rif
        """, (codice, descrizione, descr_agg, um, costo_ult, data_agg, ean, listino))
        art_id = c.execute("SELECT id FROM articoli WHERE codice=?", (codice,)).fetchone()[0]
        righe_ok += 1

        # Blocchi fornitore 1..9
        for slot in range(1, 10):
            col_for = f'_ARFOR({slot})'
            col_fpr = f'_ARFPR({slot})'
            col_cof = f'_ARCOF({slot})'
            cod_for_raw = str(row.get(col_for, '') or '').strip().replace('.0','')
            if not cod_for_raw or cod_for_raw in ('nan', ''):
                continue

            prezzo_forn = _safe_float(str(row.get(col_fpr, '') or '').replace(',', '.'))
            cod_forn_art = str(row.get(col_cof, '') or '').strip()
            if cod_forn_art.lower() in ('nan', 'none', ''):
                cod_forn_art = ''

            # Upsert fornitore
            c.execute("""
                INSERT INTO fornitori (codice_mexal) VALUES (?)
                ON CONFLICT(codice_mexal) DO NOTHING
            """, (cod_for_raw,))
            for_id = c.execute("SELECT id FROM fornitori WHERE codice_mexal=?", (cod_for_raw,)).fetchone()[0]

            # Upsert articolo_fornitore
            existing = c.execute("""
                SELECT id, prezzo_base, prezzo_fornitore FROM articolo_fornitore
                WHERE articolo_id=? AND fornitore_id=?
            """, (art_id, for_id)).fetchone()

            if existing is None:
                c.execute("""
                    INSERT INTO articolo_fornitore
                    (articolo_id, fornitore_id, codice_fornitore, prezzo_fornitore, prezzo_base, slot)
                    VALUES (?,?,?,?,?,?)
                """, (art_id, for_id, cod_forn_art, prezzo_forn, costo_ult, slot))
                fornitori_ok += 1
            else:
                # Non sovrascrivere il prezzo_base già gestito dall'app
                c.execute("""
                    UPDATE articolo_fornitore SET
                        codice_fornitore = ?,
                        slot = ?
                    WHERE id = ?
                """, (cod_forn_art, slot, existing['id']))
                fornitori_agg += 1

        if progress_callback and i % BATCH_SIZE == 0:
            progress_callback(i, total)
            conn.commit()  # commit incrementale: protegge da crash durante import lunghi

    conn.commit()
    # Conteggi reali dopo l'import (articoli DISTINTI, non righe del CSV)
    tot_art = c.execute("SELECT COUNT(*) FROM articoli").fetchone()[0]
    tot_rel = c.execute("SELECT COUNT(*) FROM articolo_fornitore").fetchone()[0]
    conn.close()
    logger.info(f"Import completato: {tot_art} articoli ({righe_ok} righe), "
                f"{fornitori_ok} rel. nuove, {fornitori_agg} aggiornate, "
                f"{tot_rel} totali")
    return {
        'articoli': tot_art,      # articoli distinti nel database
        'righe': righe_ok,        # righe del CSV elaborate
        'rel_nuove': fornitori_ok,
        'rel_aggiornate': fornitori_agg,
        'rel_totali': tot_rel,
    }


# ── helpers ──────────────────────────────────────────────────────────────────

def _safe_float(val):
    try:
        v = float(str(val).replace(',', '.').strip())
        return v if v > 0 else None
    except Exception:
        return None

def _safe_int(val):
    try:
        return int(float(str(val).strip()))
    except Exception:
        return None


# ── query principali ─────────────────────────────────────────────────────────

def search_articles(query: str, limit=200):
    conn = get_connection()
    # Escape dei jolly LIKE: '%' e '_' nel testo cercato sono letterali
    esc = (query.upper()
           .replace('\\', '\\\\').replace('%', '\\%').replace('_', '\\_'))
    q = f"%{esc}%"
    rows = conn.execute("""
        SELECT a.id, a.codice, a.descrizione, a.descr_agg, a.um, a.costo_ult,
               COUNT(af.id) as n_fornitori
        FROM articoli a
        LEFT JOIN articolo_fornitore af ON af.articolo_id = a.id
        WHERE UPPER(a.codice) LIKE ? ESCAPE '\\'
           OR UPPER(a.descrizione) LIKE ? ESCAPE '\\'
           OR UPPER(a.descr_agg) LIKE ? ESCAPE '\\'
        GROUP BY a.id
        ORDER BY a.codice
        LIMIT ?
    """, (q, q, q, limit)).fetchall()
    conn.close()
    return rows


def get_articles_by_codes(codes):
    """
    Cerca articoli per corrispondenza ESATTA del codice (case-insensitive),
    su una lista di codici, con UNA sola query (a blocchi). Ritorna i risultati
    in ordine di prima comparsa dei codici. Usato dall'analisi PDF ordine, dove
    prima si facevano centinaia di query LIKE separate (lentissimo).
    """
    # Normalizza, deduplica mantenendo l'ordine
    seen = set()
    norm = []
    for c in codes:
        cu = (c or '').strip().upper()
        if cu and cu not in seen:
            seen.add(cu)
            norm.append(cu)
    if not norm:
        return []

    found = {}
    conn = get_connection()
    try:
        for start in range(0, len(norm), 500):
            chunk = norm[start:start + 500]
            placeholders = ','.join('?' * len(chunk))
            rows = conn.execute(f"""
                SELECT a.id, a.codice, a.descrizione, a.descr_agg, a.um, a.costo_ult,
                       COUNT(af.id) as n_fornitori
                FROM articoli a
                LEFT JOIN articolo_fornitore af ON af.articolo_id = a.id
                WHERE UPPER(a.codice) IN ({placeholders})
                GROUP BY a.id
            """, chunk).fetchall()
            for r in rows:
                found[r['codice'].upper()] = dict(r)
    finally:
        conn.close()

    # Restituisce nell'ordine dei codici in input
    return [found[cu] for cu in norm if cu in found]


def map_codes_to_articoli(codes):
    """
    Mappa una lista di codici (che possono essere codice Mexal _ARCOD OPPURE
    codice fornitore _ARCOF) all'articolo corrispondente. Usato dal carico
    magazzino: una bolla fornitore riporta il codice del fornitore, non quello
    di magazzino.

    Ritorna: { codice_input_UPPER: {'id': ..., 'codice': <_ARCOD>} }
    Priorità: prima match esatto su _ARCOD, poi su codice_fornitore.
    """
    seen, norm = set(), []
    for c in codes:
        cu = (c or '').strip().upper()
        if cu and cu not in seen:
            seen.add(cu)
            norm.append(cu)
    if not norm:
        return {}

    result = {}
    conn = get_connection()
    try:
        # 1) match diretto su codice Mexal
        for start in range(0, len(norm), 500):
            chunk = norm[start:start + 500]
            ph = ','.join('?' * len(chunk))
            for r in conn.execute(
                f"SELECT id, codice FROM articoli WHERE UPPER(codice) IN ({ph})",
                chunk):
                result[r['codice'].upper()] = {'id': r['id'], 'codice': r['codice']}

        # 2) per i restanti, match su codice fornitore
        restanti = [c for c in norm if c not in result]
        for start in range(0, len(restanti), 500):
            chunk = restanti[start:start + 500]
            ph = ','.join('?' * len(chunk))
            for r in conn.execute(f"""
                SELECT DISTINCT UPPER(af.codice_fornitore) AS cf,
                       a.id AS id, a.codice AS codice
                FROM articolo_fornitore af
                JOIN articoli a ON a.id = af.articolo_id
                WHERE UPPER(af.codice_fornitore) IN ({ph})
            """, chunk):
                # non sovrascrivere un eventuale match _ARCOD già trovato
                result.setdefault(r['cf'], {'id': r['id'], 'codice': r['codice']})
    finally:
        conn.close()
    return result


def get_costo_map(codes):
    """Ritorna { _ARCOD_UPPER: costo_ult } per i codici dati (per valorizzare)."""
    arts = get_articles_by_codes(codes)
    return {a['codice'].upper(): a['costo_ult'] for a in arts}


def get_article_suppliers(article_id: int):
    conn = get_connection()
    rows = conn.execute("""
        SELECT af.id, f.codice_mexal, f.nome, f.url_portale,
               af.codice_fornitore, af.prezzo_fornitore, af.prezzo_base,
               af.slot, af.ultima_verifica
        FROM articolo_fornitore af
        JOIN fornitori f ON f.id = af.fornitore_id
        WHERE af.articolo_id = ?
        ORDER BY af.prezzo_fornitore ASC
    """, (article_id,)).fetchall()
    conn.close()
    return rows


def get_all_suppliers():
    conn = get_connection()
    rows = conn.execute("SELECT * FROM fornitori ORDER BY nome, codice_mexal").fetchall()
    conn.close()
    return rows


def update_supplier_info(fornitore_id, nome, url, note):
    conn = get_connection()
    conn.execute("UPDATE fornitori SET nome=?, url_portale=?, note=? WHERE id=?",
                 (nome, url, note, fornitore_id))
    conn.commit()
    conn.close()


def create_article_supplier_link(articolo_id: int, fornitore_id: int,
                                 codice_fornitore: str = ''):
    """
    Crea la relazione articolo-fornitore se non esiste già.
    - prezzo_base iniziale = costo_ult dell'articolo (prezzo base attuale)
    - slot = primo slot Mexal libero (1..9) per quell'articolo, così l'export
      CSV scrive il nuovo fornitore nelle colonne _ARFOR/_ARFPR/_ARCOF giuste
    Ritorna l'id della relazione (esistente o appena creata).
    """
    conn = get_connection()
    try:
        row = conn.execute("""
            SELECT id FROM articolo_fornitore
            WHERE articolo_id=? AND fornitore_id=?
        """, (articolo_id, fornitore_id)).fetchone()
        if row:
            return row['id']

        art = conn.execute("SELECT costo_ult FROM articoli WHERE id=?",
                           (articolo_id,)).fetchone()
        costo_ult = art['costo_ult'] if art else None

        used = {r['slot'] for r in conn.execute(
            "SELECT slot FROM articolo_fornitore WHERE articolo_id=?",
            (articolo_id,)) if r['slot']}
        slot = next((s for s in range(1, 10) if s not in used), None)

        cur = conn.execute("""
            INSERT INTO articolo_fornitore
                (articolo_id, fornitore_id, codice_fornitore,
                 prezzo_fornitore, prezzo_base, slot)
            VALUES (?,?,?,NULL,?,?)
        """, (articolo_id, fornitore_id, codice_fornitore or '', costo_ult, slot))
        conn.commit()
        logger.info(f"Creato collegamento articolo {articolo_id} ↔ "
                    f"fornitore {fornitore_id} (slot {slot})")
        return cur.lastrowid
    finally:
        conn.close()


def apply_price_update(articolo_id, fornitore_id, nuovo_prezzo_forn: float, motivo: str):
    """
    Regola prezzi:
    - prezzo_fornitore → sempre aggiornato al valore reale
    - prezzo_base → aggiornato solo se nuovo_prezzo_forn > prezzo_base attuale
                    in quel caso: prezzo_base = nuovo_prezzo_forn * 1.05
    """
    conn = get_connection()
    try:
        row = conn.execute("""
            SELECT id, prezzo_fornitore, prezzo_base FROM articolo_fornitore
            WHERE articolo_id=? AND fornitore_id=?
        """, (articolo_id, fornitore_id)).fetchone()

        if row is None:
            return None

        af_id  = row['id']
        old_pf = row['prezzo_fornitore'] or 0.0
        old_pb = row['prezzo_base'] or 0.0
        new_pf = nuovo_prezzo_forn
        new_pb = old_pb  # default: invariato

        if new_pf > old_pb:
            new_pb = round(new_pf * 1.05, 4)

        # storico
        if abs(new_pf - old_pf) > 0.0001:
            conn.execute("""
                INSERT INTO storico_prezzi
                    (articolo_id, fornitore_id, campo, valore_vecchio, valore_nuovo, motivo)
                VALUES (?,?,?,?,?,?)
            """, (articolo_id, fornitore_id, 'prezzo_fornitore', old_pf, new_pf, motivo))

        if abs(new_pb - old_pb) > 0.0001:
            conn.execute("""
                INSERT INTO storico_prezzi
                    (articolo_id, fornitore_id, campo, valore_vecchio, valore_nuovo, motivo)
                VALUES (?,?,?,?,?,?)
            """, (articolo_id, fornitore_id, 'prezzo_base', old_pb, new_pb, motivo))

        conn.execute("""
            UPDATE articolo_fornitore SET
                prezzo_fornitore = ?,
                prezzo_base      = ?,
                ultima_verifica  = datetime('now')
            WHERE id = ?
        """, (new_pf, new_pb, af_id))
        conn.commit()
        return {'old_pf': old_pf, 'new_pf': new_pf, 'old_pb': old_pb, 'new_pb': new_pb}
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def get_price_history(articolo_id):
    conn = get_connection()
    try:
        rows = conn.execute("""
            SELECT sp.*, f.nome as fornitore_nome, f.codice_mexal
            FROM storico_prezzi sp
            LEFT JOIN fornitori f ON f.id = sp.fornitore_id
            WHERE sp.articolo_id = ?
            ORDER BY sp.data_modifica DESC
            LIMIT 100
        """, (articolo_id,)).fetchall()
        return rows
    finally:
        conn.close()


def get_best_price_comparison(article_ids: list):
    """Confronto prezzi per lista articoli (da PDF ordine)."""
    if not article_ids:
        return []
    placeholders = ','.join('?' * len(article_ids))
    conn = get_connection()
    rows = conn.execute(f"""
        SELECT a.codice, a.descrizione,
               f.codice_mexal, f.nome as fornitore_nome,
               af.codice_fornitore, af.prezzo_fornitore, af.prezzo_base
        FROM articolo_fornitore af
        JOIN articoli a ON a.id = af.articolo_id
        JOIN fornitori f ON f.id = af.fornitore_id
        WHERE af.articolo_id IN ({placeholders})
          AND af.prezzo_fornitore IS NOT NULL
        ORDER BY a.id, af.prezzo_fornitore ASC
    """, article_ids).fetchall()
    conn.close()
    return rows


def set_config(key, value):
    conn = get_connection()
    conn.execute("INSERT OR REPLACE INTO config (chiave, valore) VALUES (?,?)", (key, value))
    conn.commit()
    conn.close()


def get_config(key, default=None):
    conn = get_connection()
    row = conn.execute("SELECT valore FROM config WHERE chiave=?", (key,)).fetchone()
    conn.close()
    return row['valore'] if row else default
