# Poker Punt Tracker

Een kleine mobiele web-app (PWA) om aan de pokertafel elke **punt** en elke **pro play** te loggen. Aan het eind van de week of maand zie je wat je punts hebben gekost en welke goede plays je hebt gemaakt.

De interface is Engels. Statische site zonder build-stap: HTML, CSS en vanilla JS. Geen backend, geen account. Alle data staat in `localStorage` op je eigen toestel en de app werkt volledig offline.

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

## Tiltmeter: wanneer moet je van tafel?

Tilt bouwt zich op zonder dat je het merkt. Daarom telt de app mee in plaats van op je gevoel te vertrouwen.

- Tik **Start session** als je gaat zitten. Vergeet je dat, dan start de eerste hit of punt de sessie vanzelf.
- Log elke **Hit** (bad beat of cooler: goed gespeeld, toch verloren) als *Pot lost* of *Stack lost*. Dat zijn twee tikken.
- Hits, punts en speeltijd tellen op tot een stand van 0 tot 100%. Wat langer geleden is, weegt minder.
- **Oranje**: de app zegt dat je 10 minuten van tafel moet en telt de pauze af.
- **Rood**: stopadvies, met je eigen bericht aan jezelf erbij. Toch doorspelen kan alleen door een knop 2,5 seconde ingedrukt te houden.
- Direct rood, ongeacht de stand: een punt uit tilt, een tweede punt in één sessie, je stop-loss in stacks, of je maximale sessieduur.
- Ga je van tafel na een stopadvies, dan logt de app dat als pro play (Discipline). In het overzicht zie je wat doorspelen ná een stopadvies je heeft gekost.

De grenzen stel je in onder **Rules** (op de meter): stop-loss, maximale sessieduur, gevoeligheid en je bericht aan jezelf.

Let op: een web-app kan geen melding sturen als hij dicht is. De meter waarschuwt dus alleen op het moment dat je iets logt of de app opent.

## Goed om te weten

- **Je data staat alleen op dat ene toestel.** Op iPhone heeft de app op het beginscherm een eigen opslag, los van Safari. Installeer dus eerst en begin dan pas met loggen.
- **Maak af en toe een backup**: tabblad **Log** → onderaan **Export JSON**. Met **Import JSON** zet je een backup terug (ook op een nieuw toestel). Importeren voegt samen en overschrijft niets wat nieuwer is.
- **Sessiedag tot 06:00**: een entry om 02:00 telt bij de vorige dag, en dus ook bij de week en maand van die dag. Weken lopen van maandag tot en met zondag.
- **Bedrag van een punt** is wat de fout kostte op het moment van de beslissing, los van hoe de hand afliep.

## Aanpassen

| Bestand | Wat erin staat |
| --- | --- |
| `index.html`, `style.css` | Pagina, vormgeving en animaties |
| `js/core.js` | Rekenlogica: sessiedag, weken, totalen, import, sessies en tiltmeter |
| `js/app.js` | Schermen, formulieren en opslag |
| `js/fx.js` | Effecten: vonken, oplopende cijfers, trillen |
| `fonts/` | Lettertype Space Grotesk (SIL Open Font License, zie `fonts/OFL.txt`) |
| `sw.js`, `manifest.webmanifest`, `icons/` | Offline werking en installatie |

Lokaal draaien kan met elke statische server, bijvoorbeeld `python3 -m http.server` in deze map, en dan `http://localhost:8000` openen.

Na een wijziging push je naar `main`; GitHub Pages werkt zichzelf bij. De app haalt de nieuwe versie op de achtergrond op en toont die bij de eerstvolgende keer openen. Verhoog `VERSION` in `sw.js` als je bestanden toevoegt of hernoemt.
