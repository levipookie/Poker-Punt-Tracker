# Poker Punt Tracker

Bouw een kleine mobiele web-app (PWA): een punt & pro play tracker voor live poker.

## Doel

Ik wil mezelf accountable houden. Aan tafel log ik elke "punt" (een play waarvan ik weet dat hij slecht is) en elke "pro play" (een uitzonderlijk goede +EV play). Aan het eind van de week of maand zie ik wat mijn punts hebben gekost en welke goede plays ik heb gemaakt.

## Techniek

- Statische site zonder build-stap: index.html, CSS en vanilla JS. Geen frameworks, geen backend, geen accounts.
- Data in localStorage. Export en import als JSON-bestand als backup.
- Installeerbaar op iPhone en Android (manifest, icoon, service worker) en werkt volledig offline.
- Relatieve paden, zodat het werkt op GitHub Pages onder /poker-punt-tracker/.
- Nederlandse interface, bedragen in euro's, week begint op maandag.

## Schermen

1. **Home**: twee grote knoppen, "Punt" en "Pro play". Daarboven wat ik deze week en deze maand aan punts heb verloren, plus het aantal punts en pro plays.
2. **Punt loggen**: bedrag (snelknoppen €20, €50, €100, €200 en vrij invullen), reden (tilt, verveeld, moe, ego, fancy play, nieuwsgierig, anders) en een optionele notitie. Maximaal drie tikken voor een punt zonder notitie.
3. **Pro play loggen**: type (hero fold, hero call, thin value, bluff, exploit, discipline, anders) en een notitie over wat ik deed en waarom.
4. **Overzicht**: schakelen tussen week, maand en alles, met bladeren naar eerdere periodes. Toont totaal verloren, aantal punts, gemiddelde per punt, verdeling per reden, een staafgrafiek van de laatste 8 weken en de pro plays van die periode.
5. **Log**: alle entries per sessiedag, nieuwste boven. Tik om te bewerken of te verwijderen, met "ongedaan maken" na verwijderen.

## Regels

- Het bedrag van een punt is wat de fout kostte op het moment van de beslissing, los van hoe de hand afliep. Zet dat als korte hint bij het bedragveld.
- Een sessiedag loopt tot 06:00: een entry om 02:00 hoort bij de vorige dag.
- Het tijdstip wordt automatisch opgeslagen en is achteraf aan te passen.

## Design

- Donker thema, rustig en minimalistisch, goed leesbaar in een donkere pokerroom.
- Grote tikdoelen, met één hand te bedienen, ontworpen voor een telefoonscherm.
- Punts rood, pro plays groen. Geen overbodige animaties.

## Oplevering

- Test de app in een telefoon-viewport: voeg entries toe en reken de totalen na.
- Schrijf een korte README met hoe ik de app via GitHub Pages op mijn telefoon zet.
- Commit en push naar main.

## Latere beslissingen

Deze keuzes zijn na de eerste versie gemaakt en gaan boven wat hierboven staat:

- De interface is Engels, niet Nederlands. Bedragen blijven in euro's en de week begint op maandag.
- De app heeft een moderne look met beweging en effecten, in plaats van "geen overbodige animaties".
- Er is een tiltmeter bij gekomen: je logt ook bad beats en coolers ("Hit"), en de app adviseert een pauze of stoppen. Zie de README.
- Goede mental-game-beslissingen leveren XP op, met een combo per sessie, een sessiestreak en levels. Zie de README.
- Optionele accounts via Supabase (e-mail en wachtwoord, of Google), met synchronisatie tussen toestellen. Zonder account blijft alles lokaal, zoals in de oorspronkelijke spec. Zie de README.
- Een rondleiding van vijf kaarten bij de eerste keer openen en na inloggen op een nieuw toestel.
- Pro plays gaan over mental game, niet over pokertechniek: folded when beat, reset after a beat, stayed patient, skipped fancy play, stuck to my stakes, took a break, quit on time. Hero call, thin value, bluff en exploit zijn vervallen; oude entries houden hun naam.
