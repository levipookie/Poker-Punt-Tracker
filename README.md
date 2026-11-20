# Poker Punt Tracker

Een kleine mobiele web-app (PWA) om aan de pokertafel elke **punt** en elke **pro play** te loggen. Aan het eind van de week of maand zie je wat je punts hebben gekost en welke goede plays je hebt gemaakt.

Statische site zonder build-stap: HTML, CSS en vanilla JS. Geen backend, geen account. Alle data staat in `localStorage` op je eigen toestel en de app werkt volledig offline.

## Op je telefoon zetten via GitHub Pages

1. Ga op GitHub naar deze repository → **Settings** → **Pages**.
2. Kies bij **Build and deployment** → **Source**: *Deploy from a branch*.
3. Kies branch **main**, map **/ (root)** en klik **Save**.
4. Wacht een minuut of twee. De app staat daarna op
   `https://levipookie.github.io/Poker-Punt-Tracker/`
5. Open die link op je telefoon en zet de app op je beginscherm:
   - **iPhone**: open de link in **Safari** → deelknop → **Zet op beginscherm**.
   - **Android**: open de link in **Chrome** → menu (⋮) → **App installeren** (of *Toevoegen aan startscherm*).

Open de app daarna één keer met internet aan. Vanaf dat moment werkt hij ook zonder verbinding.

## Goed om te weten

- **Je data staat alleen op dat ene toestel.** Op iPhone heeft de app op het beginscherm een eigen opslag, los van Safari. Installeer dus eerst en begin dan pas met loggen.
- **Maak af en toe een backup**: tabblad **Log** → onderaan **Exporteer JSON**. Met **Importeer JSON** zet je een backup terug (ook op een nieuw toestel). Importeren voegt samen en overschrijft niets wat nieuwer is.
- **Sessiedag tot 06:00**: een entry om 02:00 telt bij de vorige dag, en dus ook bij de week en maand van die dag. Weken lopen van maandag tot en met zondag.
- **Bedrag van een punt** is wat de fout kostte op het moment van de beslissing, los van hoe de hand afliep.

## Aanpassen

| Bestand | Wat erin staat |
| --- | --- |
| `index.html`, `style.css` | Pagina en vormgeving |
| `js/core.js` | Rekenlogica: sessiedag, weken, totalen, import |
| `js/app.js` | Schermen, formulieren en opslag |
| `sw.js`, `manifest.webmanifest`, `icons/` | Offline werking en installatie |

Lokaal draaien kan met elke statische server, bijvoorbeeld `python3 -m http.server` in deze map, en dan `http://localhost:8000` openen.

Na een wijziging push je naar `main`; GitHub Pages werkt zichzelf bij. De app haalt de nieuwe versie op de achtergrond op en toont die bij de eerstvolgende keer openen. Verhoog `VERSION` in `sw.js` als je bestanden toevoegt of hernoemt.
