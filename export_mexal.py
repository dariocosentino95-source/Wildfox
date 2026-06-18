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

logger = logging.getLogger(__name__)


def export_to_mexal_csv(csv_originale: str, output_path: str,
                        progress_cb=None, log_cb=None):
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

        if modificato:
            articoli_agg += 1

        if progress_cb and i % 1000 == 0:
            progress_cb(i, total)

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

    if log_cb:
        log_cb(f"✅ Esportato: {output_path}")
        log_cb(f"   Righe totali: {total}")
        log_cb(f"   Articoli aggiornati: {articoli_agg}")
        log_cb(f"   Prezzi modificati: {prezzi_mod}")

    logger.info(f"Export Mexal: {total} righe, {articoli_agg} articoli agg., "
                f"{prezzi_mod} prezzi mod.")

    return {
        'righe': total,
        'articoli_aggiornati': articoli_agg,
        'prezzi_modificati': prezzi_mod,
        'output': output_path,
    }


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
