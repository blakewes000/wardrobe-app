# Wardrobe Outfit Builder: Project Spec

## What it is
A personal web app that keeps a digital wardrobe and, at the push of a button, builds an outfit based on a style I describe and the current weather.

## Who uses it
Only me. No login, no passwords, no accounts, no payments, no server database.

## Where it runs
A website that works in a phone browser and a computer browser. On the phone it can be added to the home screen so it feels like an app.

## Core features (Version 1)
1. **Wardrobe**: see all my clothes. Add, edit, and remove items.
2. **Add an item**: upload or take a photo, then fill in: name, category (top, bottom, shoes, outerwear, accessory), color, warmth (light / medium / warm), and style tags.
3. **Style input**: a text box where I type a vibe, like "dark streetwear".
4. **Weather**: the app looks up the temperature and season for my location automatically.
5. **Generate Outfit button**: builds an outfit from my wardrobe using the style text and the weather.
6. **Like / Dislike**: Like saves the outfit. Dislike throws it away and I can generate another.
7. **Saved outfits**: a page listing outfits I liked.
8. **Settings**: location (or auto-detect), temperature unit (°F / °C), and a clear-all-data button.

## Version 2 (later, not now)
- AI looks at a photo of clothing and fills in the details automatically.
- Style from an inspiration photo, not just text.
- AI-powered outfit choosing (needs a paid API key).

## Not included
Logins, other users, payments, cloud sync between phone and computer.

## Where data is stored
Inside the browser on the device being used. Important: phone and computer will have separate wardrobes in Version 1.

## Build order
1. Empty page that opens in a browser
2. Wardrobe list (add and remove, saved in the browser)
3. Photos on items
4. Weather lookup (free service, no key needed)
5. Generate Outfit button using simple rules (match weather + style tags)
6. Like / Dislike and Saved outfits page
7. Settings page
8. Make it phone-friendly and put it online
9. Version 2 AI features
