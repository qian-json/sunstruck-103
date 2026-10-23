# Sunstruck 103°

A Houston heat-safety game. The power's out on your street, it's 103° outside, and the library on Main St. is open as a cooling center. Get there without overheating, and help the people you run into on the way.

Made for teens and younger kids. The goal is to teach the warning signs of heat exhaustion and heat stroke, and what to actually do about them.

## Running it

Open `index.html` in a browser. No build step, no dependencies. (Fonts load from Google Fonts; without internet it falls back to system fonts.)

## Controls

| Key | |
|---|---|
| WASD / arrows | walk |
| Shift | run (heats you up faster) |
| E / Space | talk, read flyers, use things |
| Q | drink water |
| P / Esc | pause + map |
| R | restart |
| M | sound on/off |

## How it works

- Your body heat climbs in the sun (asphalt worst, grass least) and drops in shade. Shadows are real: what you see on the ground is what the game checks.
- As heat rises you go through the actual symptom stages: heavy sweating, cramps, dizziness/nausea (heat exhaustion), then confusion (heat stroke). Each one pops up the first time with what it means.
- Six people around the neighborhood are dealing with different heat problems. You pick what to do; wrong answers explain why.
- When something comes up (you start sweating, run out of water, get near a neighbor), the game pauses with a short tip and points at what to do.
- Eight signs around the neighborhood have real, sourced numbers about heat in Houston.

## Files

- `script.js` – game loop, input, HUD, dialog. **All tuning numbers are at the top.**
- `world.js` – the map layout: roads, buildings, trees, people, items.
- `art.js` – every sprite, drawn in code. No image files.
- `content.js` – all the writing: facts, pop-up tips, conversations, first aid.

## Sources

- Harris County Public Health, *Health Impacts of Excessive Heat in Harris County* (2024), reported at https://myneighborhoodnews.com/harris-county-report-highlights-growing-risks-of-excessive-heat-and-heat-related-illnesses
- Harris County Public Health press releases: https://publichealth.harriscountytx.gov/Media/Press-Releases
- CDC, *Heat Illness Among High School Athletes, United States, 2005-2009* (MMWR): https://archive.cdc.gov/www_cdc_gov/media/pressrel/2010/r100819a.htm
- CDC, Heat Related Illnesses (signs and treatment): https://www.cdc.gov/natural-disasters/media/pdfs/2026/09/Heat_Related_Illness-NEWLOGO.pdf
- Houston Health Department, *Houston Activates Heat Emergency Plan*: https://www.houstonhealth.org/news/news-releases/houston-activates-heat-emergency-plan-1
