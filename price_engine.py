"""
price_engine.py - Elaborazione upload listini (CSV e PDF)
Applica le regole:
  - prezzo_fornitore → aggiornato al valore reale
  - prezzo_base      → invariato se nuovo <= base; altrimenti nuovo * 1.05
"""
import pandas as pd
import re
import logging
import db

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# CSV LISTINO FORNITORE
# ─────────────────────────────────────────────────────────────────────────────

def process_csv_listino(csv_path: str, fornitore_id: int,
                        col_codice: str, col_prezzo: str,
                        sep: str = ';', encoding: str = 'latin-1',
                        progress_cb=None, auto_link: bool = True):
    """
    Legge un CSV listino fornitore e aggiorna i prezzi.
    col_codice: nome colonna con codice articolo (mexal o fornitore)
    col_prezzo: nome colonna con il nuovo prezzo
    auto_link:  se True, crea automaticamente il collegamento fornitore
                quando il codice esiste in Mexal ma non è ancora associato
    Restituisce lista di dict con i risultati riga per riga.
    """
    # keep_default_na=False: celle vuote = '' (non NaN), evita finti codici 'nan'
    df = pd.read_csv(csv_path, sep=sep, engine='python',
                     encoding=encoding, dtype=str, keep_default_na=False)
    records = df.to_dict('records')
    results = []
    total = len(records)

    for i, row in enumerate(records):
        codice = str(row.get(col_codice, '') or '').strip()
        prezzo_raw = str(row.get(col_prezzo, '') or '').replace(',', '.').strip()
        if not codice:
            continue
        try:
            nuovo_prezzo = float(prezzo_raw)
        except ValueError:
            results.append({'codice': codice, 'stato': 'prezzo_non_valido',
                            'prezzo_raw': prezzo_raw})
            continue

        result = _apply_for_codice(codice, fornitore_id, nuovo_prezzo,
                                   'upload_csv', auto_link=auto_link)
        result['codice'] = codice
        result['prezzo_listino'] = nuovo_prezzo
        results.append(result)

        if progress_cb and i % 100 == 0:
            progress_cb(i, total)

    return results


# ─────────────────────────────────────────────────────────────────────────────
# PDF LISTINO FORNITORE
# ─────────────────────────────────────────────────────────────────────────────

def process_pdf_listino(pdf_path: str, fornitore_id: int,
                        progress_cb=None, formato: str = 'auto',
                        auto_link: bool = True):
    """
    Estrae (codice, prezzo netto) da un PDF listino/conferma fornitore
    e applica le regole di aggiornamento prezzi.

    formato:
      'auto'      → rileva automaticamente il layout
      'cardinale' → conferma d'ordine Cardinale Group (prezzo netto dopo sconto)
      'generico'  → un codice + un prezzo per riga
    """
    import pdfplumber

    # Rilevamento automatico formato
    if formato == 'auto':
        formato = _detect_pdf_format(pdf_path)

    if formato == 'cardinale':
        articoli = _parse_cardinale_pdf(pdf_path, progress_cb)
    else:
        articoli = _parse_generic_pdf(pdf_path, progress_cb)

    # Applica gli aggiornamenti
    results = []
    for art in articoli:
        codice = art['codice']
        prezzo = art['prezzo_netto']
        if prezzo is None:
            results.append({'codice': codice, 'stato': 'prezzo_non_trovato'})
            continue
        result = _apply_for_codice(codice, fornitore_id, prezzo,
                                   'upload_pdf', auto_link=auto_link)
        result['codice'] = codice
        result['prezzo_listino'] = prezzo
        result['prezzo_lordo'] = art.get('prezzo_lordo')
        result['sconto'] = art.get('sconto')
        result['qta'] = art.get('qta')
        results.append(result)

    return results


def _detect_pdf_format(pdf_path: str) -> str:
    """Rileva il formato del PDF leggendo la prima pagina."""
    import pdfplumber
    try:
        with pdfplumber.open(pdf_path) as pdf:
            text = (pdf.pages[0].extract_text() or '').lower()
            # Marcatori tipici Cardinale
            if 'cardinale' in text or "conferma d'ordine" in text or \
               re.search(r'\*[a-z0-9]+\*', text):
                return 'cardinale'
    except Exception:
        pass
    return 'generico'


def _parse_cardinale_pdf(pdf_path: str, progress_cb=None):
    """
    Parser per conferme d'ordine / listini Cardinale Group.
    Struttura per articolo (nell'estrazione testo):
        *CODICE*  QUANTITA
        DESCRIZIONE [barcode]
        € PREZZO_LORDO  resto-descrizione
        SCONTO  (es. '60' o '60+4')
        CODICE   (ripetuto)
        € PREZZO_NETTO   ← prezzo finale da usare
    Estrae il PRIMO prezzo (lordo) e l'ULTIMO prezzo del blocco (netto).
    """
    import pdfplumber
    results = []

    with pdfplumber.open(pdf_path) as pdf:
        total = len(pdf.pages)
        for p_idx, page in enumerate(pdf.pages):
            text = page.extract_text() or ''
            lines = [l.rstrip() for l in text.splitlines()]

            i = 0
            while i < len(lines):
                line = lines[i].strip()
                # marker articolo: *CODICE* QUANTITA  (la quantità può mancare)
                m = re.match(r'^\*([A-Z0-9][A-Z0-9\.\-/]*)\*(?:\s+([\d.]+,\d+))?', line)
                if not m:
                    i += 1
                    continue
                codice = m.group(1)
                qta = (float(m.group(2).replace('.', '').replace(',', '.'))
                       if m.group(2) else None)

                prices_in_block = []
                sconto = None
                j = i + 1
                while j < len(lines) and j < i + 12:
                    l = lines[j].strip()
                    if re.match(r'^\*[A-Z0-9]', l):
                        break
                    pm = re.search(r'€\s*([\d.]+,\d{2,4})', l)
                    if pm:
                        val = float(pm.group(1).replace('.', '').replace(',', '.'))
                        prices_in_block.append(val)
                    sm = re.match(r'^(\d{1,2}(\+\d{1,2})?)$', l)
                    if sm:
                        sconto = sm.group(1)
                    j += 1

                prezzo_lordo = prices_in_block[0] if prices_in_block else None
                prezzo_netto = prices_in_block[-1] if prices_in_block else None

                results.append({
                    'codice': codice,
                    'qta': qta,
                    'prezzo_lordo': prezzo_lordo,
                    'prezzo_netto': prezzo_netto,
                    'sconto': sconto,
                })
                i = j

            if progress_cb:
                progress_cb(p_idx + 1, total)

    return results


def _parse_spolzino_pdf(pdf_path: str, progress_cb=None):
    """
    Parser per DDT/fattura Spolzino: UNA riga per articolo, formato
        CODICE  DESCRIZIONE...  UM  QTA  PREZZO_LORDO  SCONTO...  TOTALE_NETTO_RIGA  [cod]
    Es: 'IGI462 VASO ... PZ 10 61,000 55,04,00 263,52 1022'
    Il prezzo fornitore (unitario) = TOTALE_NETTO_RIGA / QTA.
    """
    import pdfplumber
    line_re = re.compile(
        r'^(?P<cod>[A-Z][A-Z0-9./\-]{1,18})\s+'
        r'(?P<body>.+?)\s+'
        r'(?P<netto>\d{1,3}(?:\.\d{3})*,\d{2})(?:\s+\d{1,6})?\s*$')
    body_re = re.compile(r'\b([A-Z]{1,3})\s+(\d+)\s+(\d+,\d{3})\b(.*)$')

    def _num(s):
        return float(s.replace('.', '').replace(',', '.'))

    results = []
    with pdfplumber.open(pdf_path) as pdf:
        total = len(pdf.pages)
        for p_idx, page in enumerate(pdf.pages):
            for line in (page.extract_text() or '').splitlines():
                m = line_re.match(line.strip())
                if not m:
                    continue
                mb = body_re.search(m.group('body'))
                if not mb:
                    continue
                qta = int(mb.group(2))
                lordo = _num(mb.group(3))
                tot_netto = _num(m.group('netto'))
                unit_netto = round(tot_netto / qta, 4) if qta else None
                results.append({
                    'codice': m.group('cod'),
                    'qta': qta,
                    'prezzo_lordo': lordo,
                    'prezzo_netto': unit_netto,   # unitario
                    'sconto': mb.group(4).strip() or None,
                })
            if progress_cb:
                progress_cb(p_idx + 1, total)
    return results


def _parse_generic_pdf(pdf_path: str, progress_cb=None):
    """Parser generico: un codice + un prezzo per riga."""
    import pdfplumber
    results = []
    pattern = re.compile(
        r'\b([A-Z0-9][A-Z0-9\.\-]{2,20})\b.*?(\d{1,6}[,\.]\d{2,4})',
        re.IGNORECASE
    )
    with pdfplumber.open(pdf_path) as pdf:
        total = len(pdf.pages)
        for p_idx, page in enumerate(pdf.pages):
            text = page.extract_text() or ''
            for line in text.splitlines():
                m = pattern.search(line)
                if m:
                    codice = m.group(1).strip().upper()
                    try:
                        prezzo = float(m.group(2).replace(',', '.'))
                    except ValueError:
                        continue
                    results.append({
                        'codice': codice,
                        'prezzo_lordo': None,
                        'prezzo_netto': prezzo,
                        'sconto': None,
                    })
            if progress_cb:
                progress_cb(p_idx + 1, total)
    return results


# ─────────────────────────────────────────────────────────────────────────────
# PDF ORDINE / MERCE → confronto dove conviene comprare
# ─────────────────────────────────────────────────────────────────────────────

def extract_pdf_order(pdf_path: str):
    """
    Legge un PDF con merce (codice Mexal + descrizione) e restituisce
    una lista di articoli trovati nel DB con i prezzi di tutti i fornitori.
    """
    import pdfplumber

    # Raccoglie TUTTI i possibili codici dal PDF, poi fa una sola ricerca
    # batch nel DB (match esatto). Prima si apriva una connessione e una query
    # LIKE per ogni codice: con un PDF lungo erano centinaia di query inutili.
    codes = []
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            text = page.extract_text() or ''
            # Cerca codici Mexal (es: 0-AF1009, 00000006782, ecc.)
            codes.extend(re.findall(r'\b([A-Z0-9][A-Z0-9\.\-]{3,20})\b',
                                    text, re.IGNORECASE))

    found_articles = db.get_articles_by_codes(codes)
    if not found_articles:
        return [], []

    article_ids = [a['id'] for a in found_articles]
    price_rows = db.get_best_price_comparison(article_ids)
    return found_articles, [dict(r) for r in price_rows]


# ─────────────────────────────────────────────────────────────────────────────
# HELPER INTERNO
# ─────────────────────────────────────────────────────────────────────────────

def _apply_for_codice(codice: str, fornitore_id: int,
                      nuovo_prezzo: float, motivo: str,
                      auto_link: bool = True) -> dict:
    """
    Aggancia il codice del listino all'articolo corretto e applica i prezzi.

    PRIORITÀ DI RICERCA (importante per evitare abbinamenti sbagliati):
    Quando si carica il listino del fornitore X, il codice nel file è il
    CODICE FORNITORE di X. Quindi:

      1. Cerca PRIMA tra i codici fornitore DI QUESTO fornitore (X).
         È la corrispondenza più affidabile.
      2. Se non trovato, prova come codice Mexal — ma solo se quell'articolo
         Mexal ha effettivamente una relazione con il fornitore X
         (gestisce i 611 casi in cui il tuo codice Mexal = codice fornitore).
      3. Se il codice esiste come Mexal ma NON è collegato a questo fornitore:
         con auto_link=True crea automaticamente il collegamento
         articolo↔fornitore (codice + prezzo del listino); altrimenti
         segnala 'codice_mexal_non_collegato' da verificare a mano.
      4. Segnala se lo stesso codice è ambiguo (è codice fornitore di un
         articolo E codice Mexal di un altro).
    """
    conn = db.get_connection()
    cod_up = codice.upper()

    # ── 1. Match per codice fornitore DI QUESTO fornitore (priorità massima) ──
    af = conn.execute("""
        SELECT af.articolo_id, a.codice as mexal
        FROM articolo_fornitore af
        JOIN articoli a ON a.id = af.articolo_id
        WHERE af.fornitore_id=? AND UPPER(af.codice_fornitore)=?
    """, (fornitore_id, cod_up)).fetchall()

    # ── 2. Match per codice Mexal collegato a questo fornitore ──
    art_link = conn.execute("""
        SELECT a.id as articolo_id, a.codice as mexal
        FROM articoli a
        JOIN articolo_fornitore af ON af.articolo_id = a.id
        WHERE UPPER(a.codice)=? AND af.fornitore_id=?
    """, (cod_up, fornitore_id)).fetchall()

    # ── Verifica ambiguità: il codice esiste anche come Mexal di altro articolo? ──
    mexal_any = conn.execute(
        "SELECT id, codice FROM articoli WHERE UPPER(codice)=?", (cod_up,)
    ).fetchone()

    art_id = None
    mexal_cod = None
    ambiguo = False
    creato = False
    nota = None

    if af:
        # Match sicuro: codice fornitore di questo fornitore
        art_id = af[0]['articolo_id']
        mexal_cod = af[0]['mexal']
        # Ambiguità informativa: esiste anche un articolo Mexal con questo codice?
        if mexal_any and mexal_any['id'] != art_id:
            ambiguo = True
            nota = (f"codice '{codice}' è codice fornitore di {af[0]['mexal']} "
                    f"ma anche codice Mexal di un altro articolo: "
                    f"aggiornato il fornitore corretto ({af[0]['mexal']})")
    elif art_link:
        # Il codice Mexal coincide col codice fornitore (caso normale, 611 casi)
        art_id = art_link[0]['articolo_id']
        mexal_cod = art_link[0]['mexal']
    elif mexal_any:
        # Esiste come Mexal ma NON collegato a questo fornitore.
        if not auto_link:
            conn.close()
            return {
                'stato': 'codice_mexal_non_collegato',
                'art_id': mexal_any['id'],
                'nota': (f"'{codice}' esiste come codice Mexal ma non è collegato "
                         f"a questo fornitore. Verifica manualmente.")
            }
        # Crea automaticamente il collegamento col codice del listino
        art_id = mexal_any['id']
        mexal_cod = mexal_any['codice']
        creato = True
        nota = (f"'{codice}': creato nuovo collegamento con questo fornitore "
                f"(il codice esisteva in Mexal ma non era associato)")
    else:
        conn.close()
        return {'stato': 'non_trovato'}

    conn.close()

    if creato:
        db.create_article_supplier_link(art_id, fornitore_id, codice)

    result = db.apply_price_update(art_id, fornitore_id, nuovo_prezzo, motivo)
    if result is None:
        return {'stato': 'rel_fornitore_assente', 'art_id': art_id}
    result['stato'] = 'aggiornato'
    result['art_id'] = art_id
    result['mexal'] = mexal_cod
    if creato:
        result['creato'] = True
        result['nota'] = nota
    if ambiguo:
        result['ambiguo'] = True
        result['nota'] = nota
    return result
