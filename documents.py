"""
documents.py - Elaborazione integrata dei documenti fornitore (fattura / DDT /
conferma d'ordine). Riconosce il fornitore, estrae codice+quantità+prezzo netto,
abbina ogni riga all'articolo Mexal (anche se il codice fornitore sta in slot
diversi) e aggiorna in un colpo solo: codice fornitore, prezzo, giacenza.

Riusa i parser e la logica già testati di price_engine e stock_engine.
"""
import logging
import db
import price_engine
import stock_engine

logger = logging.getLogger(__name__)

# Mappa parola-chiave del documento → codice Mexal del fornitore.
# (Aggiungere Spolzino / IdroFerrara / Bonardi quando si vedono i loro documenti.)
FORMATO_FORNITORE = {
    'cardinale': '60100759',
}


def detect_supplier_id(pdf_path: str):
    """Rileva il fornitore dal PDF. Ritorna (fornitore_id|None, formato)."""
    fmt = price_engine._detect_pdf_format(pdf_path)
    codice_mexal = FORMATO_FORNITORE.get(fmt)
    if codice_mexal:
        conn = db.get_connection()
        r = conn.execute("SELECT id FROM fornitori WHERE codice_mexal=?",
                         (codice_mexal,)).fetchone()
        conn.close()
        if r:
            return r['id'], fmt
    return None, fmt


def parse_items(pdf_path: str, formato: str = 'auto'):
    """Estrae le righe del documento: [{codice, qta, prezzo_netto, ...}]."""
    if formato == 'auto':
        formato = price_engine._detect_pdf_format(pdf_path)
    if formato == 'cardinale':
        return price_engine._parse_cardinale_pdf(pdf_path)
    return price_engine._parse_generic_pdf(pdf_path)


def classify(items, fornitore_id):
    """
    Classifica ogni riga (sola lettura, nessuna modifica) per l'anteprima:
      - 'gia_collegato' : il codice è già il codice fornitore (in QUALSIASI slot)
                          o un codice Mexal già collegato a questo fornitore
      - 'auto_collega'  : il codice è un codice Mexal esistente ma non ancora
                          collegato a questo fornitore (verrà collegato in automatico)
      - 'nuovo'         : non riconosciuto → serve collegamento guidato
    Ritorna lista di dict con codice, stato, mexal, descrizione, qta, netto.
    """
    codes = [(it.get('codice') or '').strip() for it in items]
    norm = sorted({c.upper() for c in codes if c})

    cf_map, art_map, linked = {}, {}, set()
    if norm:
        conn = db.get_connection()
        try:
            for start in range(0, len(norm), 500):
                chunk = norm[start:start + 500]
                ph = ','.join('?' * len(chunk))
                # 1) codici fornitore DI QUESTO fornitore (in qualunque slot)
                for r in conn.execute(f"""
                    SELECT UPPER(af.codice_fornitore) cf, a.codice mexal,
                           a.descrizione descr
                    FROM articolo_fornitore af JOIN articoli a ON a.id=af.articolo_id
                    WHERE af.fornitore_id=? AND UPPER(af.codice_fornitore) IN ({ph})
                """, [fornitore_id] + chunk):
                    cf_map[r['cf']] = (r['mexal'], r['descr'])
                # 2) articoli per codice Mexal
                for r in conn.execute(f"""
                    SELECT UPPER(codice) cu, codice, descrizione FROM articoli
                    WHERE UPPER(codice) IN ({ph})
                """, chunk):
                    art_map[r['cu']] = (r['codice'], r['descrizione'])
                # 3) tra quegli articoli, quali sono già collegati a questo fornitore
                for r in conn.execute(f"""
                    SELECT UPPER(a.codice) cu
                    FROM articoli a JOIN articolo_fornitore af ON af.articolo_id=a.id
                    WHERE af.fornitore_id=? AND UPPER(a.codice) IN ({ph})
                """, [fornitore_id] + chunk):
                    linked.add(r['cu'])
        finally:
            conn.close()

    out = []
    for it in items:
        cod = (it.get('codice') or '').strip()
        cu = cod.upper()
        netto = it.get('prezzo_netto')
        qta = it.get('qta')
        if cu in cf_map:
            mexal, descr = cf_map[cu]
            stato, cod_presente = 'gia_collegato', True
        elif cu in art_map:
            mexal, descr = art_map[cu]
            if cu in linked:
                stato, cod_presente = 'gia_collegato', True
            else:
                stato, cod_presente = 'auto_collega', False
        else:
            mexal, descr, stato, cod_presente = None, None, 'nuovo', False
        out.append({'codice': cod, 'stato': stato, 'mexal': mexal,
                    'descrizione': descr, 'qta': qta, 'netto': netto,
                    'cod_gia_presente': cod_presente})
    return out


def apply_document(items, fornitore_id, manual_links=None,
                   carica_giacenze=False, anpr_path=None, anpr_out=None,
                   motivo='documento', log_cb=None):
    """
    Applica gli aggiornamenti:
      - prezzo fornitore (_ARFPR) + prezzo base (regola +5%) e codice fornitore
        (_ARCOF) nel database, per ogni riga risolvibile;
      - per i codici 'nuovi', usa manual_links {codice_doc_UPPER: codice_mexal}
        per creare il collegamento prima di applicare il prezzo;
      - se carica_giacenze: aggiorna le giacenze (file anpr) con la regola
        nuova = max(esistenza, 0) + quantità.
    Ritorna un report con i conteggi e l'eventuale report giacenze.
    """
    manual_links = {k.upper(): v for k, v in (manual_links or {}).items()}
    aggiornati, creati, collegati_man, non_risolti, senza_prezzo = [], [], [], [], []
    giac = {}  # _ARCOD → quantità entrante

    for it in items:
        cod = (it.get('codice') or '').strip()
        netto = it.get('prezzo_netto')
        qta = it.get('qta')
        if not cod:
            continue
        if netto is None:
            senza_prezzo.append(cod)
            continue

        # Collegamento guidato per i codici nuovi
        is_manual = False
        if cod.upper() in manual_links:
            target = manual_links[cod.upper()]
            art = db.map_codes_to_articoli([target]).get(target.upper())
            if art:
                db.create_article_supplier_link(art['id'], fornitore_id, cod)
                is_manual = True

        res = price_engine._apply_for_codice(cod, fornitore_id, netto,
                                             motivo, auto_link=True)
        stato = res.get('stato')
        if stato == 'aggiornato':
            arcod = res.get('mexal')
            if is_manual:
                collegati_man.append(cod)       # collegato col collegamento guidato
            elif res.get('creato'):
                creati.append(cod)              # codice Mexal esistente, auto-collegato
            else:
                aggiornati.append(cod)          # già collegato a questo fornitore
            if arcod and qta:
                giac[arcod] = giac.get(arcod, 0.0) + qta
        else:
            non_risolti.append(cod)

    giac_report = None
    if carica_giacenze and anpr_path and giac:
        giac_report = stock_engine.update_anpr(
            anpr_path, giac, output_path=anpr_out,
            costo_map=db.get_costo_map(list(giac)), log_cb=log_cb)

    return {
        'aggiornati': aggiornati,
        'creati': creati,
        'collegati_manuale': collegati_man,
        'non_risolti': non_risolti,
        'senza_prezzo': senza_prezzo,
        'giacenze': giac_report,
        'n_giacenze': len(giac),
    }
