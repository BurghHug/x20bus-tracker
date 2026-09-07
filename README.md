# X20 Tracker

Live bus tracker for the Stagecoach X20 (towards Stratford-upon-Avon).

Focused on the afternoon school run from **Henley High School** (scheduled 15:30).

## Features

- Live vehicle positions from the UK Bus Open Data Service (BODS)
- Countdown-style ETAs for four key stops
- Direction focus: towards Stratford
- Mobile-first, dark UI, installable as a PWA
- API key kept server-side only

## Stops tracked

1. Henley High School
2. Bearley Oak Tree Close
3. Stratford Maybird Centre
4. Stratford Wood Street

## Deploy on Vercel

1. Push this repo to GitHub
2. Import the project in Vercel
3. Add Environment Variable:
   - Name: `BODS_API_KEY`
   - Value: your BODS API key (from https://data.bus-data.dft.gov.uk/)
4. Deploy

## Local development

```bash
npm install
# create .env.local with:
# BODS_API_KEY=your_key_here
npm run dev
```

## Notes

- ETAs are estimated from live vehicle distance (average ~20 km/h).
- The parser looks for LineRef = X20 / X21.
- Refresh rate: every 20 seconds on the client.
