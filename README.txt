MISURE & PROGRESSI — PWA

CONTENUTO
- index.html: interfaccia principale
- styles.css: stile responsive per smartphone e desktop
- app.js: archivio locale, calcoli, grafico, importazione ed esportazione
- manifest.webmanifest: configurazione di installazione
- sw.js: funzionamento offline
- icons/icon.svg: icona dell'app

AVVIO
La PWA deve essere servita tramite HTTPS oppure in ambiente locale (localhost). Non aprire index.html direttamente con un doppio clic, perché i browser limitano service worker e installazione sulle pagine file://.

Esempio in una cartella locale con un server statico già disponibile:
1. Pubblicare tutti i file mantenendo la stessa struttura.
2. Aprire l'indirizzo HTTPS nel browser.
3. Usare “Installa app” quando proposto dal browser.

DATI
I dati sono salvati nel browser tramite IndexedDB. L'app include, al primo avvio, il dato di partenza del file Excel:
- 06/11/2026: peso 76,20 kg; plica addominale 14,5 mm.

BACKUP
Usare Archivio > Esporta JSON per il backup completo. Il CSV è pensato per consultazione e scambio con Excel. L'importazione accetta i backup JSON prodotti dall'app e i CSV con le stesse colonne dell'esportazione.

CAMPI REGISTRATI
- Data
- Peso (kg)
- Plica addominale (mm)
- Glutei (cm)
- Vita ombellico (cm)
- Coscia sotto gluteo (cm)
- Note
