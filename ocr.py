"""
ocr.py - Lettura di DDT/fatture SCANSIONATI (immagini) tramite OCR.

Usato come fallback quando un PDF non ha testo (è una scansione) o quando si
carica un file immagine. Motore: RapidOCR (onnxruntime, offline, solo-pip).
Ricostruisce le righe della tabella dalla posizione dei box OCR ed estrae
codice, quantità, prezzo unitario, sconto, totale → prezzo netto.

Funziona per layout diversi (Spolzino/'grafica', EM.CI.DI, …): il prezzo netto
si ricava soprattutto da **totale ÷ quantità** (robusto e indipendente dagli
sconti), con fallback prezzo × (1−sconto).

⚠️ L'OCR può sbagliare qualche cifra: i risultati vanno SEMPRE controllati in
anteprima (l'app li mostra in tabella; le righe dubbie sono marcate ⚠ e si
correggono con doppio clic) prima di applicarli.
"""
import re
import io
import logging

logger = logging.getLogger(__name__)

_OCR = None


def available() -> bool:
    """True se il motore OCR è installato."""
    try:
        import rapidocr_onnxruntime  # noqa: F401
        return True
    except Exception:
        return False


def _engine():
    global _OCR
    if _OCR is None:
        from rapidocr_onnxruntime import RapidOCR
        _OCR = RapidOCR()
    return _OCR


def pdf_has_text(path: str) -> bool:
    """True se il PDF ha del testo estraibile (quindi NON serve l'OCR)."""
    import pdfplumber
    try:
        with pdfplumber.open(path) as pdf:
            return any((pg.extract_text() or '').strip() for pg in pdf.pages)
    except Exception:
        return True   # nel dubbio non forziamo l'OCR


def _page_images(path: str):
    """
    Genera l'immagine PRINCIPALE (la più grande) di ogni pagina di un PDF
    scansionato, o l'immagine se `path` è un file immagine. Scegliere la più
    grande evita di prendere strisce/watermark (es. 'Scansionato con CamScanner').
    """
    import numpy as np
    from PIL import Image
    p = path.lower()
    if not p.endswith('.pdf'):
        yield np.array(Image.open(path).convert('RGB'))
        return
    import pdfplumber
    with pdfplumber.open(path) as pdf:
        for page in pdf.pages:
            best, best_area = None, 0
            for im in page.images:
                st = im.get('stream')
                for getter in (lambda s=st: getattr(s, 'rawdata', None),
                               lambda s=st: s.get_data()):
                    try:
                        data = getter()
                        if not data:
                            continue
                        pic = Image.open(io.BytesIO(data)).convert('RGB')
                        area = pic.size[0] * pic.size[1]
                        if area > best_area:
                            best_area, best = area, np.array(pic)
                        break
                    except Exception:
                        continue
            if best is not None:
                yield best


def _num(s: str):
    """Converte un numero letto dall'OCR (separatore decimale . o ,)."""
    s = s.strip()
    if ',' in s and '.' in s:
        s = (s.replace('.', '').replace(',', '.')
             if s.rfind(',') > s.rfind('.') else s.replace(',', ''))
    else:
        s = s.replace(',', '.')
    try:
        return float(s)
    except ValueError:
        return None


def _is_code(t: str) -> bool:
    """True se il token sembra un codice articolo (lettere + cifre): copre
    SIF128 (grafica) e CAV.C023003 / 179-MSRN (emcidi)."""
    t = t.strip()
    return bool(4 <= len(t) <= 20
                and re.fullmatch(r'[A-Z0-9][A-Z0-9./\-]*', t)
                and re.search(r'[A-Z]', t) and re.search(r'\d', t))


def _ndec(t: str) -> int:
    if '.' not in t and ',' not in t:
        return 0
    return len(t.split(',')[-1] if ',' in t else t.split('.')[-1])


def _parse_rows(res):
    """Da un risultato OCR (box+testo) ricostruisce le righe e ne estrae gli
    articoli: [{codice, qta, prezzo_netto, prezzo_lordo, sconto, ocr, ocr_incerto}]."""
    boxes = sorted((sum(p[1] for p in b) / 4, min(p[0] for p in b), t.strip())
                   for b, t, _c in res)
    rows, cur, ly = [], [], None
    for y, x, t in boxes:
        if ly is None or abs(y - ly) < 16:
            cur.append((x, t))
        else:
            rows.append(cur)
            cur = [(x, t)]
        ly = y
    if cur:
        rows.append(cur)

    items = []
    for row in rows:
        xt = sorted(row)
        cod = cx = None
        for x, t in xt:
            if _is_code(t):
                cod, cx = t, x
                break
        if not cod:
            continue
        # numeri a destra del codice, in ordine x
        nums = []
        for x, t in xt:
            if x <= cx:
                continue
            if re.fullmatch(r'\d{1,4}([.,]\d{1,4})?', t):
                v = _num(t)
                if v is not None:
                    nums.append((v, _ndec(t)))
        # prezzo unitario = primo numero con 3-4 decimali
        prezzo, pi = None, None
        for i, (v, nd) in enumerate(nums):
            if nd >= 3 and prezzo is None:
                prezzo, pi = v, i
        # quantità = ultimo intero PRIMA del prezzo
        qta = None
        if pi is not None:
            for v, nd in nums[:pi]:
                if nd == 0 and 0 < v < 100000:
                    qta = int(v)
        after = nums[pi + 1:] if pi is not None else []
        # totale = numero a 2 decimali (non l'aliquota 22); sconto = intero/dec ~ percentuale
        totale = None
        for v, nd in after:
            if nd == 2 and abs(v - 22) > 0.01:
                totale = v
        sconto = next((v for v, nd in after
                       if v != totale and abs(v - 22) > 0.01 and 1 <= v <= 95), None)
        # prezzo netto: preferisci totale/qta (robusto), altrimenti prezzo×(1-sconto)
        net_ts = round(totale / qta, 4) if (totale and qta) else None
        net_ps = round(prezzo * (1 - sconto / 100), 4) if (prezzo and sconto is not None) else None
        netto = net_ts if net_ts is not None else net_ps
        if qta is None and totale and netto:
            qta = round(totale / netto)
        # incerto: manca netto/qta oppure le due stime divergono (>5%)
        incerto = bool(netto is None or qta is None
                       or (net_ts and net_ps and abs(net_ts - net_ps) / net_ts > 0.05))
        # includi la riga se c'è un codice e un prezzo unitario (riga prodotto),
        # anche se il netto non è calcolabile: sarà marcata ⚠ e la correggi a mano.
        if cod and prezzo:
            items.append({
                'codice': cod, 'qta': qta,
                'prezzo_lordo': prezzo, 'prezzo_netto': netto,
                'sconto': (f'{sconto:g}' if sconto else ''),
                'ocr': True, 'ocr_incerto': incerto,
            })
    return items


def parse_document_ocr(path: str, progress_cb=None):
    """Legge un documento scansionato (tutte le pagine) e ritorna gli articoli."""
    eng = _engine()
    items = []
    for pi, img in enumerate(_page_images(path)):
        res, _ = eng(img)
        if res:
            items.extend(_parse_rows(res))
        if progress_cb:
            progress_cb(pi + 1, 0)
    logger.info(f"OCR: {len(items)} righe lette da {path}")
    return items
