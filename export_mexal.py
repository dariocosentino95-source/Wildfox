"""
export_mexal.py - Genera un CSV nello stesso formato di anar_idu.csv
con i prezzi fornitore aggiornati dal database, pronto da reimportare in Mexal.

Strategia sicura: parte dal CSV originale e modifica SOLO le colonne dei
prezzi fornitore (_ARFPR), dei codici fornitore (_ARCOF) e del costo ultimo
(_ARCUL). Tutte le altre 431 colonne restano identiche all'originale, così
Mexal reimporta il file senza errori di struttura.
"""
import pandas as pd
import logging
import db
import listini

logger = logging.getLogger(__name__)

# Default strutturali per una NUOVA riga articolo (campi presenti in ~tutti gli
# articoli reali). Usati quando si esporta un articolo creato nell'app e non
# ancora presente in Mexal, così la riga è valida per la reimportazione.
_NUOVO_DEFAULTS = {
    '_ARTIP': 'A', '_ARANN': 'N', '_ARDEC': '2', '_ARVST': '1', '_ARVUL': '1',
    '_ARVUP': '1', '_ARRIC': '80100002', '_ARCOS': '70201001', '_ARSCO': '1',
    '_ARDBP': 'N', '_ARDBV': 'N', '_ARCAR': 'N', '_ARDBA': 'N', '_ARCTG': 'N',
    '_ARFRM': 'N', 'CALENDPROD': 'N', '_ARPCAS': 'N', '_ARIMA': 'N',
    '_ARIUS': 'N', '_ARPRIT1': 'N', 'ARGSI': 'N', 'ARENAS': 'N',
    'AREMPAM': 'N', 'AREMPALS': 'N', '_ARGRR': 'N',
}
for _i in range(1, 19):
    _NUOVO_DEFAULTS[f'TIPPROV{_i}'] = '%'


def _parse_num(val):
    try:
        s = str(val).strip()
        return float(s.replace('.', '').replace(',', '.')) if s else None
    except (ValueError, TypeError):
        return None


def export_to_mexal_csv(csv_originale: str, output_path: str,
                        progress_cb=None, log_cb=None, ricalcola_listini=False):
    """
    Legge il CSV originale Mexal, aggiorna i prezzi fornitore con i valori
    correnti del database, e salva un nuovo CSV nello stesso identico formato.

    csv_originale : percorso del anar_idu.csv di partenza (per la struttura)
    output_path   : dove salvare il CSV aggiornato
    Ritorna: dict con statistiche (righe, articoli aggiornati, prezzi modificati)
    """
    if log_cb:
        log_cb(f"Lettura struttura da: {csv_originale}")

    # Legge l'originale mantenendo tutto come stringa (preserva formati)
    df = pd.read_csv(csv_originale, sep=';', engine='python',
                     encoding='latin-1', dtype=str, keep_default_na=False)
    total = len(df)
    colonne = df.columns.tolist()

    if log_cb:
        log_cb(f"Righe da elaborare: {total}, colonne: {len(colonne)}")

    # Carica tutti i prezzi correnti dal DB in memoria (veloce)
    conn = db.get_connection()
    try:
        rows = conn.execute("""
            SELECT a.codice, af.slot, af.codice_fornitore,
                   af.prezzo_fornitore, af.prezzo_base,
                   f.codice_mexal AS fornitore_codice
            FROM articolo_fornitore af
            JOIN articoli a ON a.id = af.articolo_id
            JOIN fornitori f ON f.id = af.fornitore_id
        """).fetchall()
    finally:
        conn.close()

    # Mappa: codice_articolo -> { slot -> (prezzo_forn, cod_forn, prezzo_base) }
    prezzi_db = {}
    costo_db = {}
    for r in rows:
        cod = r['codice']
        slot = r['slot']
        prezzi_db.setdefault(cod, {})[slot] = {
            'prezzo_forn': r['prezzo_fornitore'],
            'cod_forn': r['codice_fornitore'],
            'prezzo_base': r['prezzo_base'],
            'fornitore_codice': r['fornitore_codice'],
        }
        # Il costo ultimo (_ARCUL) = prezzo_base più basso o quello impostato
        if r['prezzo_base']:
            if cod not in costo_db or r['prezzo_base'] < costo_db[cod]:
                costo_db[cod] = r['prezzo_base']

    articoli_agg = 0
    prezzi_mod = 0

    # Itera le righe del CSV e aggiorna le colonne prezzo
    for i in range(total):
        codice = str(df.at[i, '_ARCOD']).strip()
        if not codice or codice not in prezzi_db:
            if progress_cb and i % 1000 == 0:
                progress_cb(i, total)
            continue

        slots = prezzi_db[codice]
        modificato = False

        for slot, dati in slots.items():
            col_for = f'_ARFOR({slot})'
            col_fpr = f'_ARFPR({slot})'
            col_cof = f'_ARCOF({slot})'

            # Collegamenti creati dall'app: lo slot è vuoto nell'originale,
            # va scritto anche il codice del fornitore
            if col_for in colonne and dati['fornitore_codice']:
                if not str(df.at[i, col_for]).strip():
                    df.at[i, col_for] = dati['fornitore_codice']
                    modificato = True

            # Aggiorna prezzo fornitore (formato italiano con virgola)
            if col_fpr in colonne and dati['prezzo_forn'] is not None:
                nuovo = _format_mexal_number(dati['prezzo_forn'])
                if df.at[i, col_fpr] != nuovo:
                    df.at[i, col_fpr] = nuovo
                    prezzi_mod += 1
                    modificato = True

            # Aggiorna codice fornitore se presente
            if col_cof in colonne and dati['cod_forn']:
                if df.at[i, col_cof] != dati['cod_forn']:
                    df.at[i, col_cof] = dati['cod_forn']
                    modificato = True

        # Aggiorna costo ultimo (_ARCUL) col prezzo base
        if '_ARCUL' in colonne and codice in costo_db:
            nuovo_costo = _format_mexal_number(costo_db[codice])
            if df.at[i, '_ARCUL'] != nuovo_costo:
                df.at[i, '_ARCUL'] = nuovo_costo
                modificato = True

        # Ricalcola i listini di vendita (_ARPRZ 1..4) = costo × ricarico categoria
        if ricalcola_listini and '_ARLIS' in colonne:
            cat = str(df.at[i, '_ARLIS']).strip()
            base_cost = costo_db.get(codice)
            if base_cost is None and '_ARCUL' in colonne:
                base_cost = _parse_num(df.at[i, '_ARCUL'])
            for n, prezzo in listini.calcola_listini(base_cost, cat).items():
                col = f'_ARPRZ({n})'
                if col in colonne:
                    nv = _format_mexal_number(prezzo)
                    if df.at[i, col] != nv:
                        df.at[i, col] = nv
                        modificato = True

        if modificato:
            articoli_agg += 1

        if progress_cb and i % 1000 == 0:
            progress_cb(i, total)

    # ── Articoli NUOVI creati nell'app (non ancora in Mexal): aggiungi le righe ──
    from datetime import datetime as _dt
    conn = db.get_connection()
    try:
        nuovi = conn.execute("""
            SELECT codice, descrizione, um, iva, listino_rif, costo_ult
            FROM articoli WHERE creato_app = 1
        """).fetchall()
    finally:
        conn.close()
    nuovi_agg = 0
    if nuovi:
        anar_codes = {str(df.at[i, '_ARCOD']).strip().upper() for i in range(total)}
        oggi = _dt.now().strftime('%d%m%Y')
        nuove_righe = []
        for art in nuovi:
            cod = (art['codice'] or '').strip()
            if not cod or cod.upper() in anar_codes:
                continue  # già presente nell'anar: si aggiorna nel loop, non si duplica
            riga = {c: '' for c in colonne}
            for k, v in _NUOVO_DEFAULTS.items():
                if k in riga:
                    riga[k] = v
            riga['_ARCOD'] = cod
            if '_ARDES' in riga:
                riga['_ARDES'] = (art['descrizione'] or '')[:60]
            if '_ARUM1' in riga:
                riga['_ARUM1'] = (art['um'] or 'PZ')
            if '_ARIVA' in riga:
                riga['_ARIVA'] = (art['iva'] or '22')
            if '_ARDTC' in riga:
                riga['_ARDTC'] = oggi
            if '_ARDTA' in riga:
                riga['_ARDTA'] = oggi
            cat = art['listino_rif']
            if cat and '_ARLIS' in riga:
                riga['_ARLIS'] = str(cat)
            costo = costo_db.get(cod) or art['costo_ult']
            if costo:
                cv = _format_mexal_number(costo)
                for cc in ('_ARCUL', '_ARCUP'):
                    if cc in riga:
                        riga[cc] = cv
            # blocco fornitore (se l'articolo nuovo ha già un collegamento)
            for slot, dati in prezzi_db.get(cod, {}).items():
                cols_slot = (f'_ARFOR({slot})', f'_ARFPR({slot})',
                             f'_ARCOF({slot})', f'_ARVAL({slot})')
                if cols_slot[0] in riga and dati['fornitore_codice']:
                    riga[cols_slot[0]] = dati['fornitore_codice']
                if cols_slot[1] in riga and dati['prezzo_forn'] is not None:
                    riga[cols_slot[1]] = _format_mexal_number(dati['prezzo_forn'])
                if cols_slot[2] in riga and dati['cod_forn']:
                    riga[cols_slot[2]] = dati['cod_forn']
                if cols_slot[3] in riga:
                    riga[cols_slot[3]] = '1'
            # listini
            if ricalcola_listini and costo and cat:
                for n, prezzo in listini.calcola_listini(costo, cat).items():
                    col = f'_ARPRZ({n})'
                    if col in riga:
                        riga[col] = _format_mexal_number(prezzo)
            nuove_righe.append(riga)
        if nuove_righe:
            df = pd.concat([df, pd.DataFrame(nuove_righe, columns=colonne)],
                           ignore_index=True)
            nuovi_agg = len(nuove_righe)
            if log_cb:
                log_cb(f"   Articoli NUOVI aggiunti: {nuovi_agg}")

    # Salva nello stesso formato: ; separatore, latin-1, virgola decimale
    # quoting=csv.QUOTE_MINIMAL + quotechar='"' protegge i campi che
    # contengono ';' (es. descrizioni) senza alterare i campi normali.
    import csv, os, tempfile
    # errors='replace': se un codice/descrizione contiene un carattere non
    # rappresentabile in latin-1 (es. da uno scraping), non blocca l'export.
    # Scrive su file temporaneo e poi sostituisce: è sicuro anche quando
    # output_path coincide col file di riferimento (overwrite di anar_idu.csv).
    out_dir = os.path.dirname(os.path.abspath(output_path)) or '.'
    fd, tmp = tempfile.mkstemp(suffix='.csv', dir=out_dir)
    os.close(fd)
    df.to_csv(tmp, sep=';', encoding='latin-1', index=False,
              quoting=csv.QUOTE_MINIMAL, quotechar='"', errors='replace')
    os.replace(tmp, output_path)

    righe_finali = len(df)
    if log_cb:
        log_cb(f"✅ Esportato: {output_path}")
        log_cb(f"   Righe totali: {righe_finali}")
        log_cb(f"   Articoli aggiornati: {articoli_agg}")
        log_cb(f"   Prezzi modificati: {prezzi_mod}")

    logger.info(f"Export Mexal: {righe_finali} righe, {articoli_agg} articoli agg., "
                f"{prezzi_mod} prezzi mod., {nuovi_agg} nuovi.")

    return {
        'righe': righe_finali,
        'articoli_aggiornati': articoli_agg,
        'prezzi_modificati': prezzi_mod,
        'nuovi': nuovi_agg,
        'output': output_path,
    }


def genera_anli(anar_path: str, anli_out: str, log_cb=None):
    """
    Genera anli_idu.csv con i 4 listini calcolati per ogni articolo distinto
    dell'anar. Formato: `_ARCOD;_ARPRZ(1..4);`.
    Listino = costo `_ARCUL` × ricarico della categoria prezzi `_ARLIS`
    (listini.py) e poi **IVA inclusa** (× 1 + `_ARIVA`/100): Mexal salva l'anli
    coi prezzi lordi (verificato: listino netto × 1,22 con IVA 22%).
    Scrittura atomica (temp + os.replace). Ritorna {'articoli': n, 'output': path}.
    """
    import csv, os, tempfile

    def _num(x):
        x = (x or '').strip()
        if not x:
            return None
        try:
            return float(x.replace('.', '').replace(',', '.'))
        except ValueError:
            return None

    def _fmt(v):
        return f"{float(v):.4f}".replace('.', ',')

    rows, seen = [], set()
    with open(anar_path, encoding='latin-1', newline='') as fh:
        rd = csv.DictReader(fh, delimiter=';')
        for r in rd:
            cod = (r.get('_ARCOD') or '').strip()
            if not cod or cod in seen:
                continue
            seen.add(cod)
            lis = listini.calcola_listini(_num(r.get('_ARCUL')),
                                          (r.get('_ARLIS') or '').strip())
            if lis:
                iva = _num(r.get('_ARIVA'))
                m = 1 + iva / 100.0 if iva else 1.0   # da netto a lordo (IVA)
                rows.append([cod, _fmt(lis[1] * m), _fmt(lis[2] * m),
                             _fmt(lis[3] * m), _fmt(lis[4] * m), ''])

    out_dir = os.path.dirname(os.path.abspath(anli_out)) or '.'
    fd, tmp = tempfile.mkstemp(suffix='.csv', dir=out_dir)
    os.close(fd)
    with open(tmp, 'w', encoding='latin-1', newline='') as fh:
        w = csv.writer(fh, delimiter=';')
        w.writerow(['_ARCOD', '_ARPRZ(1)', '_ARPRZ(2)', '_ARPRZ(3)', '_ARPRZ(4)', ''])
        w.writerows(rows)
    os.replace(tmp, anli_out)
    if log_cb:
        log_cb(f"✅ anli generato: {len(rows)} articoli con listini calcolati.")
    logger.info(f"anli generato: {len(rows)} articoli -> {anli_out}")
    return {'articoli': len(rows), 'output': anli_out}


def _format_mexal_number(val) -> str:
    """
    Converte un numero nel formato Mexal: 4 decimali fissi con virgola come
    separatore decimale. Es: 12.9946 -> '12,9946', 1.42 -> '1,4200'.
    Gestisce anche stringhe già in formato italiano (es. '12,9946').
    """
    if val is None or val == '':
        return ''
    try:
        # Normalizza stringhe in formato italiano (virgola decimale)
        normalized = str(val).strip().replace(',', '.')
        return f"{float(normalized):.4f}".replace('.', ',')
    except (ValueError, TypeError):
        return str(val)
