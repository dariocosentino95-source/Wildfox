"""
report.py - Stampa PDF di confronto fornitori.

Per un insieme di articoli (per codice, categoria/parola, o tutti) genera un PDF
che, articolo per articolo, elenca i fornitori ordinati dal prezzo più basso,
evidenzia il migliore e mostra di quanto sono più cari gli altri.

Il PDF è prodotto rendendo dell'HTML con il browser Chromium di Playwright
(già usato per lo scraping): nessuna libreria PDF aggiuntiva.
"""
import html as _html
import logging
from datetime import datetime

import db

logger = logging.getLogger(__name__)


def _num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def select_article_ids(scope='tutti', keyword='', limite=None):
    """
    Articoli (id) da includere nel confronto: solo quelli che hanno almeno un
    prezzo fornitore. scope = 'singolo' (per codice), 'categoria' (parola su
    descrizione/codice), 'tutti'. Mantiene l'ordine per codice.
    """
    where = ["af.prezzo_fornitore IS NOT NULL"]
    params = []
    if scope == 'singolo' and keyword:
        where.append("UPPER(a.codice) LIKE ?")
        params.append(f"%{keyword.upper()}%")
    elif scope == 'categoria' and keyword:
        where.append("(UPPER(a.descrizione) LIKE ? OR UPPER(a.codice) LIKE ?)")
        params.extend([f"%{keyword.upper()}%", f"%{keyword.upper()}%"])
    sql = f"""
        SELECT DISTINCT a.id, a.codice
        FROM articoli a
        JOIN articolo_fornitore af ON af.articolo_id = a.id
        WHERE {' AND '.join(where)}
        ORDER BY a.codice
    """
    conn = db.get_connection()
    rows = conn.execute(sql, params).fetchall()
    conn.close()
    ids = [r['id'] for r in rows]
    if limite:
        ids = ids[:limite]
    return ids


def _raggruppa_per_articolo(rows):
    """Da get_best_price_comparison → [{codice, descrizione, fornitori:[...]}]."""
    out = []
    by_code = {}
    for r in rows:
        cod = r['codice']
        if cod not in by_code:
            by_code[cod] = {
                'codice': cod,
                'descrizione': r['descrizione'] or '',
                'fornitori': [],
            }
            out.append(by_code[cod])
        by_code[cod]['fornitori'].append({
            'nome': r['fornitore_nome'] or r['codice_mexal'] or '—',
            'codice_fornitore': r['codice_fornitore'] or '',
            'prezzo': _num(r['prezzo_fornitore']),
        })
    # i fornitori sono già ordinati per prezzo crescente dalla query
    return out


def _fmt(v):
    return f"{v:.4f}".rstrip('0').rstrip('.').replace('.', ',') if v is not None else '—'


def build_html(articoli, titolo='Confronto fornitori', sottotitolo=''):
    """Costruisce l'HTML del report (impaginato per la stampa A4)."""
    e = _html.escape
    data = datetime.now().strftime('%d/%m/%Y %H:%M')
    n_art = len(articoli)
    n_multi = sum(1 for a in articoli if len(a['fornitori']) > 1)

    blocchi = []
    for a in articoli:
        forn = a['fornitori']
        best = forn[0]['prezzo'] if forn else None
        righe = []
        for i, f in enumerate(forn):
            p = f['prezzo']
            delta = ''
            cls = ''
            if i == 0 and p is not None:
                cls = 'best'
                badge = '★ migliore'
            else:
                badge = ''
                if p is not None and best:
                    diff = (p - best) / best * 100
                    delta = f"+{diff:.0f}%"
            righe.append(f"""
              <tr class="{cls}">
                <td class="forn">{e(f['nome'])} <span class="badge">{badge}</span></td>
                <td class="cod">{e(f['codice_fornitore'])}</td>
                <td class="prezzo">€ {_fmt(p)}</td>
                <td class="delta">{delta}</td>
              </tr>""")
        nfornitori = len(forn)
        nota = '' if nfornitori > 1 else '<span class="single">1 solo fornitore</span>'
        blocchi.append(f"""
          <div class="art">
            <div class="art-head">
              <span class="art-cod">{e(a['codice'])}</span>
              <span class="art-descr">{e(a['descrizione'])}</span>
              {nota}
            </div>
            <table class="cmp">
              <thead><tr>
                <th>Fornitore</th><th>Cod. fornitore</th><th>Prezzo</th><th>vs migliore</th>
              </tr></thead>
              <tbody>{''.join(righe)}</tbody>
            </table>
          </div>""")

    return f"""<!doctype html><html><head><meta charset="utf-8">
<style>
  * {{ box-sizing: border-box; }}
  body {{ font-family: 'Segoe UI', Arial, sans-serif; color: #1f2937; margin: 0; font-size: 11px; }}
  .header {{ border-bottom: 3px solid #2563eb; padding-bottom: 8px; margin-bottom: 14px; }}
  .header h1 {{ margin: 0; font-size: 20px; color: #2563eb; }}
  .header .sub {{ color: #6b7280; font-size: 11px; margin-top: 2px; }}
  .header .meta {{ color: #6b7280; font-size: 10px; margin-top: 4px; }}
  .art {{ margin-bottom: 12px; page-break-inside: avoid; border: 1px solid #e5e7eb; border-radius: 6px; overflow: hidden; }}
  .art-head {{ background: #f3f4f6; padding: 6px 10px; }}
  .art-cod {{ font-weight: 700; color: #111827; }}
  .art-descr {{ color: #374151; margin-left: 8px; }}
  .single {{ color: #d97706; font-size: 9px; margin-left: 8px; }}
  table.cmp {{ width: 100%; border-collapse: collapse; }}
  table.cmp th {{ text-align: left; font-size: 9px; text-transform: uppercase; color: #6b7280;
                  padding: 4px 10px; border-bottom: 1px solid #e5e7eb; }}
  table.cmp td {{ padding: 4px 10px; border-bottom: 1px solid #f1f5f9; }}
  td.prezzo {{ text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }}
  td.delta {{ text-align: right; color: #dc2626; white-space: nowrap; }}
  td.cod {{ color: #6b7280; }}
  tr.best td {{ background: #ecfdf5; }}
  tr.best td.prezzo {{ font-weight: 700; color: #16a34a; }}
  .badge {{ color: #16a34a; font-size: 9px; font-weight: 700; }}
  .footer {{ margin-top: 16px; color: #6b7280; font-size: 10px; border-top: 1px solid #e5e7eb; padding-top: 6px; }}
</style></head><body>
  <div class="header">
    <h1>{e(titolo)}</h1>
    {f'<div class="sub">{e(sottotitolo)}</div>' if sottotitolo else ''}
    <div class="meta">IDRICA S.R.L. · generato il {data} · {n_art} articoli ({n_multi} con più fornitori)</div>
  </div>
  {''.join(blocchi) if blocchi else '<p>Nessun articolo con prezzi fornitore da confrontare.</p>'}
  <div class="footer">Prezzi netti d'acquisto (IVA esclusa). Il prezzo più basso è evidenziato in verde.</div>
</body></html>"""


def _render_html_to_pdf(html_str, out_path):
    """Rende l'HTML in PDF con Chromium headless (Playwright)."""
    from playwright.sync_api import sync_playwright
    pw = sync_playwright().start()
    try:
        browser = pw.chromium.launch(headless=True)
        try:
            page = browser.new_page()
            page.set_content(html_str, wait_until='load')
            page.pdf(path=out_path, format='A4', print_background=True,
                     margin={'top': '12mm', 'bottom': '12mm',
                             'left': '10mm', 'right': '10mm'})
        finally:
            browser.close()
    finally:
        pw.stop()


def genera_pdf_confronto(scope, keyword, out_path, limite=None, log_cb=None):
    """
    Genera il PDF di confronto fornitori per l'ambito scelto.
    Ritorna dict {n_articoli, n_multi, path} oppure solleva eccezione.
    """
    import scraper  # per il controllo del browser (riusa lo stesso check)
    ok, msg = scraper.browser_disponibile()
    if not ok:
        raise RuntimeError(msg)

    ids = select_article_ids(scope, keyword, limite)
    if log_cb:
        log_cb(f"Articoli da confrontare: {len(ids)}")
    rows = db.get_best_price_comparison(ids)
    articoli = _raggruppa_per_articolo(rows)

    titolo = 'Confronto fornitori'
    sub = {'singolo': f"Articolo: {keyword}",
           'categoria': f"Categoria / parola: {keyword}",
           'tutti': 'Tutti gli articoli'}.get(scope, '')
    html_str = build_html(articoli, titolo=titolo, sottotitolo=sub)
    _render_html_to_pdf(html_str, out_path)
    n_multi = sum(1 for a in articoli if len(a['fornitori']) > 1)
    if log_cb:
        log_cb(f"✅ PDF generato: {len(articoli)} articoli ({n_multi} con più fornitori).")
    return {'n_articoli': len(articoli), 'n_multi': n_multi, 'path': out_path}
