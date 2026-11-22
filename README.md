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
- Hits en punts tellen op tot een stand van 0 tot 100%. Wat langer geleden is, weegt minder.
- Een punt weegt naar wat hij kostte, vergeleken met je buy-in, en naar de reden: tilt en ego wegen zwaarder dan verveling. Een punt vlak na een klap of punt (doorstomen) telt extra, net als elke volgende punt in korte tijd.
- Een pauze en een mental-game-pro-play halen de meter wat omlaag. Lang spelen is op zich geen probleem: pas na vier uur zonder pauze loopt de meter langzaam op.
- **Oranje**: de app zegt dat je 10 minuten van tafel moet en telt de pauze af.
- **Rood**: stopadvies, met je eigen bericht aan jezelf erbij. Toch doorspelen kan alleen door een knop 2,5 seconde ingedrukt te houden.
- Direct rood, ongeacht de stand: een punt van een volle buy-in of meer uit tilt of ego, je stop-loss in stacks, of je maximale sessieduur (staat standaard uit).
- Ga je van tafel na een stopadvies, dan logt de app dat als pro play (Discipline). In het overzicht zie je wat doorspelen ná een stopadvies je heeft gekost.

De grenzen stel je in onder **Rules** (op de meter): je buy-in (die bepaalt ook de snelknoppen voor het bedrag van een punt), stop-loss, maximale sessieduur, gevoeligheid en je bericht aan jezelf.

Let op: een web-app kan geen melding sturen als hij dicht is. De meter waarschuwt dus alleen op het moment dat je iets logt of de app opent.

## Voortgang: XP, combo, streak en levels

Goede mental-game-beslissingen leveren XP op. Rechtsboven op het startscherm staan je streak, je level en een balkje naar het volgende level; tik erop voor het scherm **Progress**.

- **XP**: +100 voor van tafel gaan op een stop warning, +40 voor de pauze nemen op oranje, +40 voor een sessie van minstens een half uur netjes afsluiten, +30 per pro play, +10 per gelogde hit.
- **Combo**: elke winst op rij binnen één sessie maakt hits en pro plays meer waard, tot ×3. Een punt zet de combo terug op ×1.
- **Streak**: sessies op rij waarin je je aan je regels hield. Alleen doorspelen na een stop warning breekt hem. Een punt loggen breekt hem nooit, zodat eerlijk loggen je niets kost.
- **Levels**: tien rangen, van Tilt Monkey tot Stone Buddha. Daarna tel je door in levelnummers.

Alles wordt uit je log berekend. Een entry bewerken, verwijderen of importeren past je XP dus vanzelf aan.

## Accounts (Supabase)

Een account is verplicht: wie de app voor het eerst opent, ziet eerst een welkomstscherm om in te loggen of een account te maken. Je log staat dan ook online en blijft gelijk op al je toestellen. Wie al eens is ingelogd, wordt nooit buitengesloten: verloopt je sessie (bijvoorbeeld zonder bereik aan tafel), dan werkt de app gewoon door en vraagt hij je later opnieuw in te loggen. Inloggen gaat met e-mail en wachtwoord, of met Google. Op iPhone komt inloggen met Google vaak terug in Safari in plaats van in de app op je beginscherm; Safari levert de login dan af bij de app, die hem oppikt zodra je terugschakelt.

De app is local-first: alles wordt eerst op het toestel opgeslagen en op de achtergrond gesynchroniseerd, dus aan tafel zonder bereik werkt alles gewoon. Bij twee wijzigingen van dezelfde entry wint de laatste. Uitloggen haalt het log van dat toestel; het blijft in je account. Je account verwijderen wist je log overal.

**Eenmalig instellen in Supabase**

1. **SQL Editor** → plak de hele inhoud van `supabase/migrations/20261121000000_accounts.sql` → **Run**, en daarna op dezelfde manier `supabase/migrations/20261122000000_google_handoff.sql`. Dit maakt de tabellen en de regels die zorgen dat iedereen alleen zijn eigen data ziet.
2. **Authentication → Sign In / Providers → Email**: zet **Confirm email** uit. De ingebouwde e-mail van Supabase stuurt alleen naar leden van je eigen Supabase-team, dus vrienden zouden de bevestigingsmail nooit krijgen.
3. **Project Settings → API Keys**: kopieer de **Project URL** en de **publishable key** naar `js/config.js`. Beide zijn openbaar: ze staan in elke browser die de app laadt. Gebruik nooit de secret key of de service role key.

**Inloggen met Google (optioneel)**

1. **Google Cloud Console** → APIs & Services → **OAuth consent screen**: maak er een aan (External, app-naam, je e-mail) en publiceer hem.
2. **Credentials** → Create credentials → **OAuth client ID** → type *Web application*. Zet bij *Authorized redirect URIs*: `https://<jouw-project>.supabase.co/auth/v1/callback`.
3. **Supabase → Authentication → Sign In / Providers → Google**: aanzetten en de Client ID en Client Secret van stap 2 plakken.
4. **Supabase → Authentication → URL Configuration**: zet *Site URL* op `https://levipookie.github.io/Poker-Punt-Tracker/` en voeg bij *Redirect URLs* toe: `https://levipookie.github.io/Poker-Punt-Tracker/**`.
5. Zet in `js/config.js` `GOOGLE_LOGIN` op `true`.

Wachtwoord vergeten werkt pas als je in Supabase een eigen e-mailprovider instelt (Authentication → Emails → SMTP).

## Rondleiding

Bij de allereerste keer openen, en na inloggen op een nieuw toestel, krijg je een korte rondleiding van vijf kaarten. Wie al een log heeft, krijgt hem niet vanzelf. Terugkijken kan via **Rules → Replay the intro**.

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
| `js/cloud.js`, `js/config.js` | Accounts en synchronisatie met Supabase |
| `auth.html`, `js/auth-callback.js` | Landingspagina na inloggen met Google |
| `supabase/migrations/` | Database-opzet voor Supabase |
| `fonts/` | Lettertype Space Grotesk (SIL Open Font License, zie `fonts/OFL.txt`) |
| `sw.js`, `manifest.webmanifest`, `icons/` | Offline werking en installatie |

Lokaal draaien kan met elke statische server, bijvoorbeeld `python3 -m http.server` in deze map, en dan `http://localhost:8000` openen.

Na een wijziging push je naar `main`; GitHub Pages werkt zichzelf bij. De app haalt de nieuwe versie op de achtergrond op en toont die bij de eerstvolgende keer openen. Verhoog `VERSION` in `sw.js` als je bestanden toevoegt of hernoemt.
