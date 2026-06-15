"""
scheduler.py - Aggiornamento settimanale prezzi fornitori
Può girare come script autonomo o essere chiamato dal menu principale.
"""
import logging
import json
from datetime import datetime, timedelta
import db
import scraper

logger = logging.getLogger(__name__)

SCHEDULE_CONFIG_KEY = 'weekly_schedule'


def get_schedule_config():
    raw = db.get_config(SCHEDULE_CONFIG_KEY)
    if raw:
        try:
            return json.loads(raw)
        except Exception:
            pass
    return {
        'enabled': False,
        'day_of_week': 0,       # 0=Lunedì (convenzione datetime.weekday e UI)
        'hour': 8,
        'last_run': None,
        'fornitori_ids': [],    # lista fornitore_id da aggiornare
    }


def save_schedule_config(cfg: dict):
    db.set_config(SCHEDULE_CONFIG_KEY, json.dumps(cfg))


def should_run_today(cfg: dict) -> bool:
    if not cfg.get('enabled'):
        return False
    last = cfg.get('last_run')
    if last:
        try:
            last_dt = datetime.fromisoformat(last)
            if datetime.now() - last_dt < timedelta(days=6):
                return False
        except Exception:
            pass
    now = datetime.now()
    return (now.weekday() == cfg.get('day_of_week', 0)
            and now.hour >= cfg.get('hour', 0))


def run_weekly_update(cfg: dict, progress_cb=None, log_cb=None):
    """
    Per ogni fornitore con URL configurato, scraping di tutti gli articoli
    che hanno quel fornitore assegnato.
    """
    fornitore_ids = cfg.get('fornitori_ids', [])
    if not fornitore_ids:
        # Se non specificato, prende tutti i fornitori con portale
        conn = db.get_connection()
        rows = conn.execute(
            "SELECT id FROM fornitori WHERE url_portale IS NOT NULL AND url_portale != ''"
        ).fetchall()
        conn.close()
        fornitore_ids = [r['id'] for r in rows]

    if not fornitore_ids:
        if log_cb:
            log_cb("Nessun fornitore con portale configurato. Aggiornamento saltato.")
        return

    results_total = 0
    for f_id in fornitore_ids:
        conn = db.get_connection()
        f_info = conn.execute("SELECT * FROM fornitori WHERE id=?", (f_id,)).fetchone()
        art_ids = conn.execute("""
            SELECT DISTINCT articolo_id FROM articolo_fornitore
            WHERE fornitore_id=? AND prezzo_fornitore IS NOT NULL
        """, (f_id,)).fetchall()
        conn.close()

        nome = (f_info['nome'] or f_info['codice_mexal']) if f_info else str(f_id)
        if log_cb:
            log_cb(f"Fornitore {nome}: {len(art_ids)} articoli da verificare...")

        for i, row in enumerate(art_ids):
            art_id = row['articolo_id']
            res_list = scraper.search_article_on_portals(art_id)
            for res in res_list:
                if res.get('prezzo') and res['fornitore_id'] == f_id:
                    db.apply_price_update(art_id, f_id, res['prezzo'], 'scraping_settimanale')
                    results_total += 1
            if progress_cb:
                progress_cb(i + 1, len(art_ids))

    cfg['last_run'] = datetime.now().isoformat()
    save_schedule_config(cfg)
    if log_cb:
        log_cb(f"Aggiornamento settimanale completato. {results_total} prezzi aggiornati.")
    return results_total


def auto_check_and_run(log_cb=None):
    """Da chiamare all'avvio dell'app per verificare se va eseguito."""
    cfg = get_schedule_config()
    if should_run_today(cfg):
        if log_cb:
            log_cb("Avvio aggiornamento settimanale automatico...")
        run_weekly_update(cfg, log_cb=log_cb)
