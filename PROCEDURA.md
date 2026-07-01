# 📋 Procedura operativa — IDU Price Manager

Guida passo-passo per importare una bolla/fattura fornitore e aggiornare in Mexal
**codici fornitore, prezzi d'acquisto, listini di vendita e giacenze**.

---

## 🔄 Flusso completo per ogni bolla

### Fase 1 — Nell'app (IDU Price Manager)

1. **Scheda "Documenti Fornitore"** → **Sfoglia** e scegli il PDF (bolla / fattura / conferma d'ordine).
2. Il fornitore viene **riconosciuto in automatico**. Se non lo riconosce, sceglilo a mano dal menu.
3. Premi **🔍 Analizza**: l'app legge ogni riga (codice, quantità, prezzo netto) e classifica:
   - 🟢 **già collegato** — codice fornitore già presente (in qualunque colonna)
   - 🟡 **auto-collega** — il codice esiste in Mexal, lo aggancio io a questo fornitore
   - 🔴 **nuovo** — non riconosciuto → serve il **collegamento guidato** (scegli tu l'articolo Mexal)
     oppure, se non esiste, crealo in **Articoli → Crea nuovo articolo**.
4. Premi **✅ Applica**: aggiorna il database e genera **tutti i file in un colpo solo**
   nella cartella Mexal:
   - `anar_idu.csv` — articoli nuovi, codici fornitore, **costo**
   - `carico_mote.csv` + `carico_mori.csv` — documento di **carico** (giacenze)

   *(Richiede che `anar_idu.csv` sia già nella cartella Mexal: esportalo una volta da
   Mexal, poi l'app lo aggiorna in automatico ad ogni bolla.)*

### Fase 2 — In Mexal

> ⚠️ **Ordine importante:** prima l'anagrafica (anar), poi il carico. Così quando il carico
> movimenta gli articoli nuovi, questi esistono già.

5. **Punto di ripristino** (sicurezza): `Servizi → Punti di ripristino` → crea.
6. **Importa l'anagrafica**: `Servizi → Trasferimento archivi → Caricamento ASCII/CSV →
   Anagrafica articoli`. Prova con **Importazione definitiva = N**, poi rifai con **= S**.
   → crea articoli nuovi, codici fornitore, **costo**.
7. **Importa il carico**: `Servizi → Trasferimento archivi → Caricamento ASCII/CSV →
   Movimenti di magazzino`. Prova con **N**, poi **S**.
   → aggiorna le **giacenze**.
8. **Ricalcola i prezzi di vendita**: `Servizi → Variazioni → Magazzino →
   Anagrafiche articoli/Listini` → pulsante **Ricalcolo listini** (base = **ultimo costo**).
   → aggiorna i **4 listini** (BASE / INSTALL / APPALTI / INGROSS) dal costo × ricarico categoria.
9. **Verifica** un paio di articoli: codice fornitore, costo, giacenza e listini aggiornati. ✅

---

## 🏷️ Fornitori supportati

| Fornitore | Codice Mexal | Formato documento | Riconoscimento |
|-----------|--------------|-------------------|----------------|
| Cardinale | 60100759 | conferma d'ordine `*CODICE*` | automatico |
| Spolzino | 60100001 | gestionale "Grafica" | manuale (menu) |
| Aqualif | 60100830 | gestionale "Grafica" | manuale (menu) |
| EM.CI.DI Finocchiaro | 60100034 | DDT/bolla | automatico |
| **Idro Ferrara** | IDROFERRARA | conferma d'ordine `QTApz € prezzo` | automatico |
| **Bonardi** (Idraulica sas) | 60100006 | fattura accompagnatoria | automatico |

> Per aggiungere un nuovo fornitore servono: un DDT campione + il suo codice Mexal.
> Si aggiunge in **Fornitori → Aggiungi fornitore** e si crea il parser dedicato.

---

## 📐 Regole applicate

- **Giacenze (carico):** in Mexal si aggiornano dai **movimenti**, non importando l'anpr
  (Mexal lo ignora). L'app genera un documento di carico con causale **CL**.
  Regola quantità: `nuova = max(esistenza attuale, 0) + entrante`.
- **Costo:** aggiornato dall'import dell'anagrafica (`_ARCUL`).
- **Listini di vendita:** 4 listini = `_ARPRZ(1..4)` → **1 BASE, 2 INSTALL, 3 APPALTI, 4 INGROSS**.
  Listino = **costo × (1 + ricarico)**, ricarico per **categoria prezzi** (`_ARLIS`, 1..27).
  I prezzi sono **netti** (IVA esclusa); Mexal aggiunge l'IVA 22% in vendita.
  Si aggiornano col **Ricalcolo listini** (passo 9): il parametro automatico
  "aggiornamento listini da carico" è bloccato dal provider, quindi si usa il ricalcolo massivo.
- **Prezzo netto fornitore:** estratto dal documento (sconti già applicati riga per riga).

---

## ⚠️ Sicurezza

- In Mexal prova **sempre** prima con **Importazione definitiva = N**, poi con **S**.
- Crea un **punto di ripristino** prima del ricalcolo listini (modifica permanente).
- L'app non sovrascrive mai i file Mexal "vivi": genera file con nomi propri nella
  cartella `C:\mexal\dati\datiaz\idu`.
- I dati aziendali e le credenziali restano **solo sul PC** (la cartella `data/` non va su GitHub).

---

## 🔧 Avvio dell'app

Doppio clic su **`avvia.bat`** (oppure esegui `main.py` con Python 3.14).
